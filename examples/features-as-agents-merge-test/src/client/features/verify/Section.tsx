import { useEffect, useState } from "react";
import { Button, Checkbox, Input, InputArea, Surface, Text } from "@cloudflare/kumo";
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
      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3">
        <Text size="sm" bold>
          Approved outcomes
        </Text>
        {withOutcomes.length === 0 && (
          <Text size="sm" variant="secondary">
            None yet.
          </Text>
        )}
        {withOutcomes.map(({ id, outcomes }) => (
          <div key={id} className="flex flex-col gap-1 border-t border-kumo-line pt-3">
            <a
              className="text-sm underline"
              href={`/${encodeURIComponent(projectId)}/sessions/${id}`}
            >
              {new Date(started.get(id) ?? 0).toLocaleString()}
            </a>
            <SessionApproved outcomes={outcomes} />
          </div>
        ))}
      </Surface>
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
      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3">
        <Checkbox.Group legend="Topics participants see" value={shown} onValueChange={select}>
          {all.map((t) => (
            <Checkbox.Item key={t.key} value={t.key} label={`${t.icon} ${t.label}`.trim()} />
          ))}
        </Checkbox.Group>
        {notice && (
          <Text size="sm" variant="secondary">
            {notice}
          </Text>
        )}
        {state.customTopics.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-kumo-line pt-3">
            <Text size="xs" variant="secondary">
              This project's own topics
            </Text>
            {state.customTopics.map((t) => (
              <details key={t.key} className="text-sm">
                <summary className="flex items-center gap-2 cursor-pointer">
                  <span className="flex-1">{`${t.icon} ${t.label}`.trim()}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<TrashIcon size={14} />}
                    onClick={() => remove(t.key).catch(() => {})}
                  >
                    Remove
                  </Button>
                </summary>
                <p className="mt-1 text-xs whitespace-pre-wrap text-kumo-subtle">{t.prompt}</p>
              </details>
            ))}
          </div>
        )}
      </Surface>

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
    <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3">
      <Text size="sm" bold>
        Add a topic
      </Text>
      <div className="flex gap-2">
        <Input
          label="Emoji"
          className="w-20"
          value={topic.icon}
          maxLength={MAX_TOPIC_ICON_CHARS}
          onChange={(e) => setTopic((t) => ({ ...t, icon: e.target.value }))}
        />
        <Input
          label="Label"
          className="flex-1"
          value={topic.label}
          maxLength={MAX_TOPIC_LABEL_CHARS}
          onChange={(e) => setTopic((t) => ({ ...t, label: e.target.value }))}
        />
      </div>
      <InputArea
        label="Prompt"
        description="What to write from the conversation."
        value={topic.prompt}
        maxLength={MAX_TOPIC_PROMPT_CHARS}
        rows={4}
        onChange={(e) => setTopic((t) => ({ ...t, prompt: e.target.value }))}
      />
      <Button
        variant="primary"
        icon={<PlusIcon size={16} />}
        disabled={saving || !topic.label.trim() || !topic.prompt.trim()}
        onClick={submit}
      >
        Add
      </Button>
    </Surface>
  );
}

/** A session's approved outcomes, collapsed under it. */
function SessionApproved({ outcomes }: { outcomes: Outcome[] | null | undefined }) {
  if (outcomes === undefined || outcomes?.length === 0) return null;
  if (outcomes === null) {
    return (
      <Text size="xs" variant="secondary">
        Its outcomes couldn't be loaded.
      </Text>
    );
  }
  return (
    <details>
      <summary className="text-xs text-kumo-subtle cursor-pointer">
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
