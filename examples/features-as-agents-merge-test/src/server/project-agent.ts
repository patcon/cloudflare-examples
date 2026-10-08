import { Agent, callable, getAgentByName, type Connection } from "agents";
import { isSessionId } from "../shared/ids";
import type { Outcome } from "./session-agent";
import { VERIFY_OFF } from "../shared/rules";
import {
  DEFAULT_TOPIC_SETTINGS,
  offeredTopics,
  type Topic,
  type TopicSettings,
} from "../shared/topics";
import { checkNewTopic, checkSettingsChange, topicKey } from "./verify/settings";

/** The project's Verify settings, synced to every page connected to it. */
export type ProjectState = TopicSettings;

export interface SessionRow {
  id: string;
  started_at: number;
}

/** A session's approved outcomes, or null when it didn't answer. */
export interface SessionOutcomes {
  id: string;
  outcomes: Outcome[] | null;
}

/**
 * What the project broadcasts when its sessions, or their approved
 * outcomes, change, so pages refetch.
 */
export type ProjectMessage = { type: "sessions" } | { type: "outcomes" };

/**
 * One project, named by its ID. It lists its sessions, and keeps the Verify
 * settings: whether it's on, and which topics participants see.
 */
export class ProjectAgent extends Agent<Env, ProjectState> {
  initialState: ProjectState = DEFAULT_TOPIC_SETTINGS;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL)",
    );
  }

  onStart() {
    // A project saved before a setting existed lacks it: initialState only
    // applies to a project with no state at all.
    const missing = Object.keys(DEFAULT_TOPIC_SETTINGS).some((k) => !(k in this.state));
    if (missing) this.setState({ ...DEFAULT_TOPIC_SETTINGS, ...this.state });
  }

  /** Called by a session the first time its page connects. */
  registerSession(id: string) {
    if (!isSessionId(id)) throw new Error(`Not a session ID: ${id}`);
    this.sql`INSERT OR IGNORE INTO sessions (id, started_at) VALUES (${id}, ${Date.now()})`;
    this.#notify({ type: "sessions" });
  }

  @callable()
  listSessions(): SessionRow[] {
    return this.sql<SessionRow>`SELECT * FROM sessions ORDER BY started_at DESC`;
  }

  /**
   * For the settings page: each session's approved outcomes, asked of
   * every session in parallel. A session that doesn't answer is skipped
   * and logged, and the rest still show.
   */
  @callable()
  async approvedOutcomes(): Promise<SessionOutcomes[]> {
    const sessions = this.listSessions();
    const results = await Promise.allSettled(
      sessions.map(async ({ id }) =>
        (await getAgentByName(this.env.SessionAgent, id)).listOutcomes(),
      ),
    );
    return results.map((result, i) => {
      const { id } = sessions[i];
      if (result.status === "fulfilled") return { id, outcomes: result.value };
      console.error(`[${this.name}] Session ${id} didn't answer: ${result.reason}`);
      return { id, outcomes: null };
    });
  }

  /** Called by a session when it approves an outcome, so pages refetch. */
  outcomeApproved() {
    this.#notify({ type: "outcomes" });
  }

  /**
   * For a session's `verify()`, over RPC: the topic to write an outcome on.
   * Refuses when Verify is off, or the topic isn't offered.
   */
  topic(key: string): Topic {
    if (!this.state.verifyEnabled) throw new Error(VERIFY_OFF);
    const topic = offeredTopics(this.state).find((t) => t.key === key);
    if (!topic) throw new Error("That topic isn't offered in this project");
    return topic;
  }

  /** Turns Verify on or off, or changes which topics are offered. */
  @callable()
  updateSettings(change: Partial<TopicSettings>) {
    this.setState({ ...this.state, ...checkSettingsChange(change, this.state) });
  }

  /**
   * Adds a topic of the project's own. As in the original, it joins the
   * selection, unless nothing is selected, which already means every topic.
   */
  @callable()
  addTopic(input: { label: string; icon: string; prompt: string }): Topic {
    const topic = { key: "", ...checkNewTopic(input) };
    topic.key = topicKey(topic.label);
    const { selectedTopics, customTopics } = this.state;
    this.setState({
      ...this.state,
      customTopics: [...customTopics, topic],
      selectedTopics: selectedTopics.length ? [...selectedTopics, topic.key] : selectedTopics,
    });
    return topic;
  }

  /**
   * Removes a topic of the project's own, and takes it out of the
   * selection. Its outcomes keep their own copy of its label and emoji.
   */
  @callable()
  removeTopic(key: string) {
    const { selectedTopics, customTopics } = this.state;
    if (!customTopics.some((t) => t.key === key)) throw new Error(`Not a custom topic: ${key}`);
    this.setState({
      ...this.state,
      customTopics: customTopics.filter((t) => t.key !== key),
      selectedTopics: selectedTopics.filter((k) => k !== key),
    });
  }

  validateStateChange(_next: ProjectState, source: Connection | "server") {
    // Pages change settings through the callables above, which check them,
    // not by setting state themselves.
    if (source !== "server") throw new Error("Change settings with updateSettings");
  }

  #notify(message: ProjectMessage) {
    this.broadcast(JSON.stringify(message));
  }
}
