import { useCallback, useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { Button, Checkbox, Input, InputArea, Surface, Switch, Text } from "@cloudflare/kumo";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import type {
  ProjectAgent,
  ProjectMessage,
  ProjectState,
  SessionOutcomes,
  SessionRow,
} from "../../server/project-agent";
import {
  MAX_TOPIC_ICON_CHARS,
  MAX_TOPIC_LABEL_CHARS,
  MAX_TOPIC_PROMPT_CHARS,
} from "../../shared/constants";
import { allTopics } from "../../shared/topics";
import { Shell } from "../ui";
import { ApprovedItem } from "./Verify";

/**
 * For the host: whether Verify is on, the topics participants see, the
 * project's own topics, and its sessions. Each change saves at once, and
 * shows in every open tab and session.
 */
export function Settings({ projectId }: { projectId: string }) {
  const [state, setState] = useState<ProjectState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [outcomes, setOutcomes] = useState<SessionOutcomes[]>([]);

  const agent = useAgent<ProjectAgent, ProjectState>({
    agent: "ProjectAgent",
    name: projectId,
    onStateUpdate: setState,
    onMessage: (event) => {
      const type = parse(event.data)?.type;
      if (type === "sessions") void loadSessions();
      if (type === "sessions" || type === "outcomes") void loadOutcomes();
    },
  });

  // Loads on opening, and when a session joins.
  const loadSessions = useCallback(
    () =>
      agent
        .call("listSessions")
        .then(setSessions)
        .catch((e: Error) => setError(e.message)),
    [agent],
  );
  // Asks every session, so it loads on opening, when a session joins, and
  // when one approves an outcome.
  const loadOutcomes = useCallback(
    () =>
      agent
        .call("approvedOutcomes")
        .then(setOutcomes)
        .catch((e: Error) => setError(e.message)),
    [agent],
  );
  useEffect(() => {
    agent.ready.then(() => Promise.all([loadSessions(), loadOutcomes()]));
  }, [agent, loadSessions, loadOutcomes]);

  /** Runs a settings call, and shows why it failed. */
  const run = (call: Promise<unknown>) => {
    setError(null);
    return call.catch((e: Error) => {
      setError(e.message);
      throw e;
    });
  };

  return (
    <Shell title={`${projectId} settings`}>
      {state && (
        <Topics
          state={state}
          update={(change) => run(agent.call("updateSettings", [change]))}
          add={(topic) => run(agent.call("addTopic", [topic]))}
          remove={(key) => run(agent.call("removeTopic", [key]))}
        />
      )}

      <Sessions projectId={projectId} sessions={sessions} outcomes={outcomes} />

      {error && (
        <Text size="sm" variant="error">
          {error}
        </Text>
      )}

      <a className="text-sm underline" href={`/${encodeURIComponent(projectId)}/start`}>
        Back to the start page
      </a>
    </Shell>
  );
}

/** Verify's switch, the topic checkboxes, and the project's own topics. */
function Topics({
  state,
  update,
  add,
  remove,
}: {
  state: ProjectState;
  update: (change: Partial<ProjectState>) => Promise<unknown>;
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
      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-2">
        <Switch
          label="Verify"
          checked={state.verifyEnabled}
          onCheckedChange={(verifyEnabled) => update({ verifyEnabled }).catch(() => {})}
        />
        <Text size="xs" variant="secondary">
          When it's off, sessions show why Verify can't start, and refuse it.
        </Text>
      </Surface>

      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3">
        <Checkbox.Group
          legend="Topics participants see"
          value={shown}
          onValueChange={select}
          disabled={!state.verifyEnabled}
        >
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
        description="What Gemini should write from the conversation."
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

/** The project's sessions, newest first, each with its approved outcomes. */
function Sessions({
  projectId,
  sessions,
  outcomes,
}: {
  projectId: string;
  sessions: SessionRow[] | null;
  outcomes: SessionOutcomes[];
}) {
  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3">
      <Text size="sm" bold>
        Sessions
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
        <div key={s.id} className="flex flex-col gap-2 border-t border-kumo-line pt-3">
          <a
            className="text-sm underline"
            href={`/${encodeURIComponent(projectId)}/sessions/${s.id}`}
          >
            {new Date(s.started_at).toLocaleString()}
          </a>
          <SessionApproved outcomes={outcomes.find((o) => o.id === s.id)?.outcomes} />
        </div>
      ))}
    </Surface>
  );
}

/** A session's approved outcomes, collapsed under it. */
function SessionApproved({ outcomes }: { outcomes: SessionOutcomes["outcomes"] | undefined }) {
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

function parse(data: unknown): ProjectMessage | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
