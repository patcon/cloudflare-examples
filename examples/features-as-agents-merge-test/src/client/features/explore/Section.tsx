import { useEffect, useState } from "react";
import { Badge, Button, InputArea, Radio, Surface, Text } from "@cloudflare/kumo";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import type { ContextPreview } from "../../../server/project/agent";
import {
  MAX_CUSTOM_PROMPT_CHARS,
  OTHERS_TOKEN_LIMIT,
  TOKENS_PER_SESSION,
  type ExploreMode,
  type ExploreSettings,
} from "../../../shared/features/explore/settings";
import type { SectionProps } from "../types";

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
 * Explore on the settings page: how replies are written, and what each
 * session adds to another's reply. Text waits for Save. A change made in
 * another tab shows up here, unless this one has unsaved text.
 */
export function ExploreSection({
  projectId,
  project,
  settings,
  version,
  run,
}: SectionProps<"explore">) {
  /** Unsaved changes to the text fields and mode, over the saved settings. */
  const [draft, setDraft] = useState<Partial<ExploreSettings>>({});
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<ContextPreview[] | null>(null);

  // Transcripts grow without telling the project, so this loads on
  // opening, when a session joins, and on Refresh.
  const loadSessions = () => run(project.call("contextPreview")).then(setSessions, () => {});
  // biome-ignore lint/correctness/useExhaustiveDependencies: loads again when `version` goes up
  useEffect(() => {
    project.ready.then(loadSessions);
  }, [project, version]);

  const shown = { ...settings, ...draft };
  const dirty = Object.keys(draft).length > 0;
  const save = () => {
    setSaving(true);
    run(project.call("updateSettings", ["explore", draft]))
      .then(
        () => setDraft({}),
        () => {},
      )
      .finally(() => setSaving(false));
  };

  return (
    <>
      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-4">
        <Text size="xs" variant="secondary">
          Every reply sees the project's context, and its portal's title and content, from the
          General tab.
        </Text>
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
      </Surface>

      <ContextSessions projectId={projectId} sessions={sessions} refresh={loadSessions} />
    </>
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
function ContextSessions({
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
          Other sessions as context
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
