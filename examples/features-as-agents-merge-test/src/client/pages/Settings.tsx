import { useCallback, useEffect, useState } from "react";
import { Surface, Switch, Tabs, Text } from "@cloudflare/kumo";
import type { ProjectMessage, ProjectState, SessionRow } from "../../server/project/agent";
import { FEATURE_KEYS, FEATURES, type FeatureKey } from "../../shared/features";
import { FEATURE_UI } from "../features";
import { parse } from "../features/parse";
import type { SectionProps } from "../features/types";
import { useProject } from "../hooks/use-project";
import { Shell } from "../ui";
import { GeneralSection } from "./GeneralSection";

/** The project's own details, a feature's tab, or the project's sessions. */
type Tab = "general" | FeatureKey | "sessions";

/** The tab in the URL's hash, such as `#verify`, so a reload or a link opens it. */
function tabFromHash(): Tab {
  const key = location.hash.slice(1);
  return key === "sessions" || (FEATURE_KEYS as string[]).includes(key) ? (key as Tab) : "general";
}

/**
 * For the host: a tab for the project's own details, one for each
 * feature, with its switch and its own section, and one for the project's
 * sessions. Each change saves at once,
 * and shows in every open tab and session.
 */
export function Settings({ projectId }: { projectId: string }) {
  const [state, setState] = useState<ProjectState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  useEffect(() => {
    const follow = () => setTab(tabFromHash());
    addEventListener("hashchange", follow);
    return () => removeEventListener("hashchange", follow);
  }, []);
  const pick = (next: Tab) => {
    setError(null);
    setTab(next);
    history.replaceState(null, "", `#${next}`);
  };
  // Goes up for a feature when its data changes in a session, or a session joins.
  const [versions, setVersions] = useState<Record<string, number>>({});
  const bump = (keys: readonly FeatureKey[]) =>
    setVersions((v) => Object.fromEntries(keys.map((k) => [k, (v[k] ?? 0) + 1])));

  const project = useProject(projectId, {
    onStateUpdate: setState,
    onMessage: (event) => {
      const message = parse<ProjectMessage>(event.data);
      if (message?.type === "sessions") {
        void loadSessions();
        bump(FEATURE_KEYS);
      }
      if (message?.type === "changed") bump([message.feature]);
    },
  });

  /** Runs a call, and shows why it failed. */
  const run = useCallback(<T,>(call: Promise<T>) => {
    setError(null);
    return call.catch((e: Error) => {
      setError(e.message);
      throw e;
    });
  }, []);

  const loadSessions = useCallback(
    () => run(project.call("listSessions")).then(setSessions, () => {}),
    [project, run],
  );
  useEffect(() => {
    project.ready.then(loadSessions);
  }, [project, loadSessions]);

  return (
    <Shell title={`${state?.general.name || projectId} settings`}>
      <Tabs
        tabs={[
          { value: "general", label: "General" },
          ...FEATURE_KEYS.map((key) => ({
            value: key,
            // A dot of the same width either way, so a tab keeps its size
            // when its feature is switched; grey until the state loads.
            label: `${!state ? "⚪" : state[key].enabled ? "🟢" : "⚫"} ${FEATURES[key].label}`,
          })),
          { value: "sessions", label: `Sessions${sessions ? ` (${sessions.length})` : ""}` },
        ]}
        value={tab}
        onValueChange={(v) => pick(v as Tab)}
      />

      {error && (
        <Text size="sm" variant="error">
          {error}
        </Text>
      )}

      {state && tab === "general" && (
        <GeneralSection project={project} settings={state.general} run={run} />
      )}

      {/* Only the open tab renders, so a section that asks every session
          only does so while it's shown. */}
      {state &&
        FEATURE_KEYS.filter((key) => key === tab).map((key) => (
          <FeatureSettings
            key={key}
            feature={key}
            projectId={projectId}
            project={project}
            settings={state[key]}
            sessions={sessions}
            version={versions[key] ?? 0}
            run={run}
          />
        ))}

      {tab === "sessions" && (
        <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-2">
          {sessions === null && (
            <Text size="sm" variant="secondary">
              Loading…
            </Text>
          )}
          {sessions?.length === 0 && (
            <Text size="sm" variant="secondary">
              No sessions yet.
            </Text>
          )}
          {sessions?.map((s) => (
            <a
              key={s.id}
              className="text-sm underline"
              href={`/${encodeURIComponent(projectId)}/sessions/${s.id}`}
            >
              {s.name ? `${s.name} · ` : ""}
              {new Date(s.started_at).toLocaleString()}
            </a>
          ))}
        </Surface>
      )}

      <a className="text-sm underline" href={`/${encodeURIComponent(projectId)}/start`}>
        Back to the start page
      </a>
    </Shell>
  );
}

/** One feature: its switch, which every feature has, then its own section. */
function FeatureSettings<K extends FeatureKey>({
  feature,
  ...props
}: SectionProps<K> & { feature: K }) {
  const { Section, about } = FEATURE_UI[feature] as unknown as {
    Section: (props: SectionProps<K>) => React.ReactNode;
    about: string;
  };
  const { label } = FEATURES[feature];
  return (
    <section className="flex flex-col gap-3">
      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-2">
        <Switch
          label={label}
          checked={props.settings.enabled}
          onCheckedChange={(enabled) =>
            props.run(props.project.call("updateSettings", [feature, { enabled }])).catch(() => {})
          }
        />
        <Text size="xs" variant="secondary">
          {about} When it's off, sessions don't show it, and refuse it.
        </Text>
      </Surface>
      <Section {...(props as SectionProps<K>)} />
    </section>
  );
}
