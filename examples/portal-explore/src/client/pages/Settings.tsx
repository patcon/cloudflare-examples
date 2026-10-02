import { useCallback, useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { Badge, Button, InputArea, Radio, Surface, Switch, Text } from "@cloudflare/kumo";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import type {
  ContextPreview,
  ProjectAgent,
  ProjectMessage,
  ProjectState,
} from "../../server/project-agent";
import type { ExploreMode } from "../../server/explore/prompt";
import {
  MAX_CONTEXT_CHARS,
  MAX_CUSTOM_PROMPT_CHARS,
  OTHERS_TOKEN_LIMIT,
  TOKENS_PER_SESSION,
} from "../../shared/constants";
import { Shell } from "../ui";

const MODES: { value: ExploreMode; label: string; description: string }[] = [
  {
    value: "summarize",
    label: "Summarize",
    description: "A warm, brief summary of what the group has said.",
  },
  {
    value: "brainstorm",
    label: "Brainstorm",
    description: "New ideas and angles that build on the conversation.",
  },
  {
    value: "custom",
    label: "Custom",
    description: "Your own instructions. Left empty, it summarizes.",
  },
];

/**
 * For the host: how this project's sessions reply when someone presses
 * Explore. The switch saves at once; text waits for Save. A change made in
 * another tab shows up here, unless this one has unsaved text.
 */
export function Settings({ projectId }: { projectId: string }) {
  const [state, setState] = useState<ProjectState | null>(null);
  /** Unsaved changes to the text fields and mode, over the saved settings. */
  const [draft, setDraft] = useState<Partial<ProjectState>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<ContextPreview[] | null>(null);

  const agent = useAgent<ProjectAgent, ProjectState>({
    agent: "ProjectAgent",
    name: projectId,
    onStateUpdate: setState,
    onMessage: (event) => {
      if (parse(event.data)?.type === "sessions") void loadSessions();
    },
  });

  // Transcripts grow without telling the project, so this loads on
  // opening, when a session joins, and on Refresh.
  const loadSessions = useCallback(
    () =>
      agent
        .call("contextPreview")
        .then(setSessions)
        .catch((e: Error) => setError(e.message)),
    [agent],
  );
  useEffect(() => {
    agent.ready.then(loadSessions);
  }, [agent, loadSessions]);

  const update = async (change: Partial<ProjectState>) => {
    setError(null);
    setSaving(true);
    try {
      await agent.call("updateSettings", [change]);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setSaving(false);
    }
  };

  if (!state) {
    return (
      <Shell title={`${projectId} settings`}>
        <Text size="sm" variant="secondary">
          Connecting…
        </Text>
      </Shell>
    );
  }

  const shown = { ...state, ...draft };
  const dirty = Object.keys(draft).length > 0;
  const save = () =>
    update(draft).then(
      () => setDraft({}),
      () => {},
    );

  return (
    <Shell title={`${projectId} settings`}>
      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-4">
        <Switch
          label="Explore"
          checked={state.exploreEnabled}
          onCheckedChange={(exploreEnabled) => update({ exploreEnabled }).catch(() => {})}
        />
        <Text size="xs" variant="secondary">
          When it's off, sessions hide the Explore button.
        </Text>
      </Surface>

      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-4">
        <InputArea
          label="What this project is about"
          description="Every reply sees this, such as the question the groups are discussing."
          value={shown.context}
          maxLength={MAX_CONTEXT_CHARS}
          rows={3}
          onChange={(e) => setDraft((d) => ({ ...d, context: e.target.value }))}
        />
        <Radio.Group
          legend="How replies are written"
          value={shown.mode}
          onValueChange={(mode) => setDraft((d) => ({ ...d, mode: mode as ExploreMode }))}
        >
          {MODES.map((m) => (
            <Radio.Item key={m.value} value={m.value} label={`${m.label}: ${m.description}`} />
          ))}
        </Radio.Group>
        {shown.mode === "custom" && (
          <InputArea
            label="Custom prompt"
            value={shown.customPrompt}
            maxLength={MAX_CUSTOM_PROMPT_CHARS}
            rows={6}
            onChange={(e) => setDraft((d) => ({ ...d, customPrompt: e.target.value }))}
          />
        )}
        <div className="flex gap-2 items-center">
          <Button variant="primary" onClick={save} disabled={!dirty || saving}>
            Save
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={() => setDraft({})} disabled={saving}>
              Discard
            </Button>
          )}
        </div>
        {error && (
          <Text size="sm" variant="error">
            {error}
          </Text>
        )}
      </Surface>

      <Sessions projectId={projectId} sessions={sessions} refresh={loadSessions} />

      <a className="text-sm underline" href={`/${encodeURIComponent(projectId)}/start`}>
        Back to the start page
      </a>
    </Shell>
  );
}

const STATUS: Record<ContextPreview["status"], string> = {
  whole: "Goes in whole",
  cut: `Cut to about ${TOKENS_PER_SESSION.toLocaleString()} tokens`,
  "over-limit": `Left out: over ${OTHERS_TOKEN_LIMIT.toLocaleString()} tokens in all`,
  empty: "Nothing said yet",
  unavailable: "Didn't answer",
};

/**
 * The project's sessions, newest first, and what each adds to another
 * session's reply. Each opens to the exact text a prompt gets.
 */
function Sessions({
  projectId,
  sessions,
  refresh,
}: {
  projectId: string;
  sessions: ContextPreview[] | null;
  refresh: () => Promise<unknown>;
}) {
  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Text size="sm" bold>
          Sessions
        </Text>
        <Button size="sm" variant="ghost" icon={<ArrowClockwiseIcon size={14} />} onClick={refresh}>
          Refresh
        </Button>
      </div>
      <Text size="xs" variant="secondary">
        Each reply sees the project's other sessions, newest first. This is what a new session's
        reply would get; a session's own reply leaves itself out.
      </Text>
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
        <div key={s.id} className="flex flex-col gap-1 border-t border-kumo-line pt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              className="text-sm underline"
              href={`/${encodeURIComponent(projectId)}/sessions/${s.id}`}
            >
              {new Date(s.startedAt).toLocaleString()}
            </a>
            <Badge variant="secondary">{STATUS[s.status]}</Badge>
            {s.tokens > 0 && (
              <Text size="xs" variant="secondary">
                about {s.tokens.toLocaleString()} tokens
              </Text>
            )}
          </div>
          {s.text && (
            <details>
              <summary className="text-xs text-kumo-subtle cursor-pointer">
                What is contributed to Explore prompt
              </summary>
              <pre className="mt-1 text-xs whitespace-pre-wrap text-kumo-default">{s.text}</pre>
            </details>
          )}
        </div>
      ))}
    </Surface>
  );
}

function parse(data: unknown): ProjectMessage | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
