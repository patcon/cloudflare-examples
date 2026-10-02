import { useState } from "react";
import { useAgent } from "agents/react";
import { Button, InputArea, Radio, Surface, Switch, Text } from "@cloudflare/kumo";
import type { ProjectAgent, ProjectState } from "../../server/project-agent";
import type { ExploreMode } from "../../server/explore/prompt";
import { MAX_CONTEXT_CHARS, MAX_CUSTOM_PROMPT_CHARS } from "../../shared/limits";
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

  const agent = useAgent<ProjectAgent, ProjectState>({
    agent: "ProjectAgent",
    name: projectId,
    onStateUpdate: setState,
  });

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

      <a className="text-sm underline" href={`/${encodeURIComponent(projectId)}/start`}>
        Back to the start page
      </a>
    </Shell>
  );
}
