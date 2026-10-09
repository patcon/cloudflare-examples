import { useEffect, useState } from "react";
import {
  Anchor,
  Button,
  Checkbox,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import type { Outcome } from "../../../server/features/verify/agent";
import type { SessionOutcomes } from "../../../server/project/agent";
import {
  MAX_TOPIC_ICON_CHARS,
  MAX_TOPIC_LABEL_CHARS,
  MAX_TOPIC_PROMPT_CHARS,
} from "../../../shared/features/verify/settings";
import { allTopics, type VerifySettings } from "../../../shared/features/verify/topics";
import type { SectionProps } from "../types";
import { ApprovedItem } from "./Outcome";

/**
 * Verify on the settings page: the topics participants see, the project's
 * own topics, and each session's approved outcomes. Each change saves at
 * once, and shows in every open tab and session.
 */
export function VerifySection({
  projectId,
  project,
  settings,
  sessions,
  version,
  run,
}: SectionProps<"verify">) {
  const [outcomes, setOutcomes] = useState<SessionOutcomes[]>([]);
  // Asks every session, so it loads on opening, when a session joins, and
  // when one approves an outcome.
  useEffect(() => {
    void version;
    project.ready
      .then(() => run(project.call("approvedOutcomes")))
      .then(setOutcomes)
      .catch(() => {});
  }, [project, run, version]);
  // Newest session first, and only those with something to show.
  const started = new Map(sessions?.map((s) => [s.id, s.started_at]));
  const withOutcomes = outcomes
    .filter((o) => o.outcomes === null || o.outcomes.length > 0)
    .sort((a, b) => (started.get(b.id) ?? 0) - (started.get(a.id) ?? 0));

  return (
    <>
      <Topics
        state={settings}
        update={(change) => run(project.call("updateSettings", ["verify", change]))}
        add={(topic) => run(project.call("addTopic", [topic]))}
        remove={(key) => run(project.call("removeTopic", [key]))}
      />
      <Paper p="md" className="flex flex-col gap-3">
        <Title order={5}>Approved outcomes</Title>
        {withOutcomes.length === 0 && (
          <Text size="sm" c="dimmed">
            None yet.
          </Text>
        )}
        {withOutcomes.map(({ id, outcomes }) => (
          <div key={id} className="flex flex-col gap-1 border-t pt-3">
            <Anchor size="sm" href={`/${encodeURIComponent(projectId)}/conversation/${id}`}>
              {new Date(started.get(id) ?? 0).toLocaleString()}
            </Anchor>
            <SessionApproved outcomes={outcomes} />
          </div>
        ))}
      </Paper>
    </>
  );
}

/** The topic checkboxes, and the project's own topics. */
function Topics({
  state,
  update,
  add,
  remove,
}: {
  state: VerifySettings;
  update: (change: Partial<VerifySettings>) => Promise<unknown>;
  add: (topic: { label: string; icon: string; prompt: string }) => Promise<unknown>;
  remove: (key: string) => Promise<unknown>;
}) {
  const all = allTopics(state);
  const allKeys = all.map((t) => t.key);
  // Nothing selected means every topic, as in the original, so it shows as
  // all ticked, and ticking all saves as nothing selected.
  const shown = state.selectedTopics.length ? state.selectedTopics : allKeys;
  const [notice, setNotice] = useState<string | null>(null);
  const select = (keys: string[]) => {
    setNotice(null);
    if (keys.length === 0) {
      setNotice("Keep at least one topic. Turn Verify off to offer none.");
      return;
    }
    update({ selectedTopics: keys.length === allKeys.length ? [] : keys }).catch(() => {});
  };

  return (
    <>
      <Paper p="md" className="flex flex-col gap-3">
        <Checkbox.Group label="Topics participants see" value={shown} onChange={select}>
          <Stack gap="xs" mt="xs">
            {all.map((t) => (
              <Checkbox key={t.key} value={t.key} label={`${t.icon} ${t.label}`.trim()} />
            ))}
          </Stack>
        </Checkbox.Group>
        {notice && (
          <Text size="sm" c="dimmed">
            {notice}
          </Text>
        )}
        {state.customTopics.length > 0 && (
          <div className="flex flex-col gap-2 border-t pt-3">
            <Text size="xs" c="dimmed">
              This project's own topics
            </Text>
            {state.customTopics.map((t) => (
              <details key={t.key} className="text-sm">
                <summary className="flex items-center gap-2 cursor-pointer">
                  <span className="flex-1">{`${t.icon} ${t.label}`.trim()}</span>
                  <Button
                    size="sm"
                    variant="subtle"
                    leftSection={<TrashIcon size={14} />}
                    onClick={() => remove(t.key).catch(() => {})}
                  >
                    Remove
                  </Button>
                </summary>
                <p className="mt-1 text-xs whitespace-pre-wrap text-[var(--app-muted)]">
                  {t.prompt}
                </p>
              </details>
            ))}
          </div>
        )}
      </Paper>

      <NewTopic add={add} />
    </>
  );
}

/** A form for a topic of the project's own. */
function NewTopic({
  add,
}: {
  add: (topic: { label: string; icon: string; prompt: string }) => Promise<unknown>;
}) {
  const empty = { label: "", icon: "", prompt: "" };
  const [topic, setTopic] = useState(empty);
  const [saving, setSaving] = useState(false);
  const submit = () => {
    setSaving(true);
    add(topic)
      .then(() => setTopic(empty))
      .catch(() => {})
      .finally(() => setSaving(false));
  };
  return (
    <Paper p="md" className="flex flex-col gap-3">
      <Title order={5}>Add a topic</Title>
      <div className="flex gap-2">
        <TextInput
          label="Emoji"
          className="w-20"
          value={topic.icon}
          maxLength={MAX_TOPIC_ICON_CHARS}
          onChange={(e) => setTopic((t) => ({ ...t, icon: e.target.value }))}
        />
        <TextInput
          label="Label"
          className="flex-1"
          value={topic.label}
          maxLength={MAX_TOPIC_LABEL_CHARS}
          onChange={(e) => setTopic((t) => ({ ...t, label: e.target.value }))}
        />
      </div>
      <Textarea
        label="Prompt"
        description="What to write from the conversation."
        value={topic.prompt}
        maxLength={MAX_TOPIC_PROMPT_CHARS}
        autosize
        minRows={4}
        onChange={(e) => setTopic((t) => ({ ...t, prompt: e.target.value }))}
      />
      <Button
        variant="filled"
        leftSection={<PlusIcon size={16} />}
        disabled={saving || !topic.label.trim() || !topic.prompt.trim()}
        onClick={submit}
      >
        Add
      </Button>
    </Paper>
  );
}

/** A session's approved outcomes, collapsed under it. */
function SessionApproved({ outcomes }: { outcomes: Outcome[] | null | undefined }) {
  if (outcomes === undefined || outcomes?.length === 0) return null;
  if (outcomes === null) {
    return (
      <Text size="xs" c="dimmed">
        Its outcomes couldn't be loaded.
      </Text>
    );
  }
  return (
    <details>
      <summary className="text-xs text-[var(--app-muted)] cursor-pointer">
        {outcomes.length} approved {outcomes.length === 1 ? "outcome" : "outcomes"}
      </summary>
      <div className="flex flex-col gap-2 mt-2">
        {outcomes.map((o) => (
          <ApprovedItem key={o.id} outcome={o} />
        ))}
      </div>
    </details>
  );
}
