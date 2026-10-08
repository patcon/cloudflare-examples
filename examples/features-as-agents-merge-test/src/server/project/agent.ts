import { Agent, callable, getAgentByName, type Connection } from "agents";
import {
  backfill,
  checkChange,
  defaultSettings,
  isFeatureKey,
  type FeatureKey,
  type ProjectSettings,
} from "../../shared/features";
import { VERIFY_OFF } from "../../shared/features/verify/rules";
import { checkNewTopic, topicKey } from "../../shared/features/verify/settings";
import { offeredTopics, type Topic } from "../../shared/features/verify/topics";
import { isSessionId } from "../../shared/ids";
import {
  contextText,
  planContext,
  type ContextEntry,
  type ContextStatus,
} from "../features/explore/transcript";
import type { Outcome } from "../features/verify/agent";
import { gather } from "../lib/gather";

/** Every feature's settings, synced to every page connected to the project. */
export type ProjectState = ProjectSettings;

export interface SessionRow {
  id: string;
  started_at: number;
}

/** A session's approved outcomes, or null when it didn't answer. */
export interface SessionOutcomes {
  id: string;
  outcomes: Outcome[] | null;
}

/** One session on the settings page, and how it goes into another session's reply. */
export interface ContextPreview extends Omit<ContextEntry, "status"> {
  /** `unavailable` when the session didn't answer. */
  status: ContextStatus | "unavailable";
  startedAt: number;
}

/**
 * What the project broadcasts when its sessions change, or a feature's data
 * in one of them, so pages refetch.
 */
export type ProjectMessage = { type: "sessions" } | { type: "changed"; feature: FeatureKey };

/**
 * One project, named by its ID. It lists its sessions, and keeps every
 * feature's settings. It keeps no feature data: its project-wide views ask
 * each session's feature agent.
 */
export class ProjectAgent extends Agent<Env, ProjectState> {
  initialState: ProjectState = defaultSettings();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL)",
    );
  }

  onStart() {
    const filled = backfill(this.state);
    if (filled) this.setState(filled);
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

  /** Called by a feature agent when its data changes, so the project's pages refetch. */
  changed(feature: FeatureKey) {
    this.#notify({ type: "changed", feature });
  }

  /** One feature's settings, for its agent, over RPC. */
  settings<K extends FeatureKey>(feature: K): ProjectSettings[K] {
    return this.state[feature];
  }

  /** Changes some of one feature's settings, from the settings page. */
  @callable()
  updateSettings(feature: FeatureKey, change: unknown) {
    if (!isFeatureKey(feature)) throw new Error(`Not a feature: ${feature}`);
    this.setState({ ...this.state, [feature]: checkChange(feature, change, this.state) });
  }

  // Explore

  /**
   * For a session's `explore()`, over RPC: the project's other sessions,
   * as the prompt's other transcripts.
   */
  async otherTranscripts(excludeId: string): Promise<string> {
    return contextText(await this.#planContext(excludeId));
  }

  /**
   * For the settings page: every session, and how it goes into another
   * session's reply. A session's own Explore leaves itself out, so this is
   * what a new session would see.
   */
  @callable()
  async contextPreview(): Promise<ContextPreview[]> {
    const sessions = this.listSessions();
    const plan = new Map((await this.#planContext(null)).map((e) => [e.id, e]));
    return sessions.map((s) => ({
      ...(plan.get(s.id) ?? { id: s.id, status: "unavailable", tokens: 0, text: "" }),
      startedAt: s.started_at,
    }));
  }

  /**
   * Asks each session's Explore, but the one excluded, for its transcript
   * with its replies, then plans them newest first. A session that doesn't
   * answer is left out.
   */
  async #planContext(excludeId: string | null): Promise<ContextEntry[]> {
    const ids = this.listSessions()
      .map((s) => s.id)
      .filter((id) => id !== excludeId);
    const answers = await gather(ids, async (id) =>
      (await getAgentByName(this.env.ExploreAgent, id)).transcriptForContext(),
    );
    return planContext(
      answers.flatMap(({ id, value }) => (value === null ? [] : [{ id, transcript: value }])),
    );
  }

  // Verify

  /**
   * For the settings page: each session's approved outcomes. A session that
   * doesn't answer shows as null, and the rest still show.
   */
  @callable()
  async approvedOutcomes(): Promise<SessionOutcomes[]> {
    const ids = this.listSessions().map((s) => s.id);
    const answers = await gather(ids, async (id) =>
      (await getAgentByName(this.env.VerifyAgent, id)).listOutcomes(),
    );
    return answers.map(({ id, value }) => ({ id, outcomes: value }));
  }

  /**
   * For a session's `verify()`, over RPC: the topic to write an outcome on.
   * Refuses when Verify is off, or the topic isn't offered.
   */
  topic(key: string): Topic {
    if (!this.state.verify.enabled) throw new Error(VERIFY_OFF);
    const topic = offeredTopics(this.state.verify).find((t) => t.key === key);
    if (!topic) throw new Error("That topic isn't offered in this project");
    return topic;
  }

  /**
   * Adds a topic of the project's own. As in the original, it joins the
   * selection, unless nothing is selected, which already means every topic.
   */
  @callable()
  addTopic(input: { label: string; icon: string; prompt: string }): Topic {
    const topic = { key: "", ...checkNewTopic(input) };
    topic.key = topicKey(topic.label);
    const { selectedTopics, customTopics } = this.state.verify;
    this.#setVerify({
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
    const { selectedTopics, customTopics } = this.state.verify;
    if (!customTopics.some((t) => t.key === key)) throw new Error(`Not a custom topic: ${key}`);
    this.#setVerify({
      customTopics: customTopics.filter((t) => t.key !== key),
      selectedTopics: selectedTopics.filter((k) => k !== key),
    });
  }

  #setVerify(change: Partial<ProjectSettings["verify"]>) {
    this.setState({ ...this.state, verify: { ...this.state.verify, ...change } });
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
