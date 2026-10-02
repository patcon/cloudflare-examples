import { Agent, callable, getAgentByName, type Connection } from "agents";
import { isSessionId } from "../shared/ids";
import {
  checkSettingsChange,
  DEFAULT_PROJECT_SETTINGS,
  type ProjectSettings,
} from "./explore/settings";
import {
  contextText,
  planContext,
  type ContextEntry,
  type ContextStatus,
} from "./explore/transcript";

/** The project's Explore settings, synced to every page connected to it. */
export type ProjectState = ProjectSettings;

export interface SessionRow {
  id: string;
  started_at: number;
}

/** One session on the settings page, and how it goes into a reply. */
export interface ContextPreview extends Omit<ContextEntry, "status"> {
  /** `unavailable` when the session didn't answer. */
  status: ContextStatus | "unavailable";
  startedAt: number;
}

/** What the project broadcasts when its session list changes, so pages refetch. */
export type ProjectMessage = { type: "sessions" };

/**
 * One project, named by its ID. It lists its sessions, and keeps the Explore
 * settings they all reply with.
 */
export class ProjectAgent extends Agent<Env, ProjectState> {
  initialState: ProjectState = DEFAULT_PROJECT_SETTINGS;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL)",
    );
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

  /** For a session's `explore()`, over RPC. */
  settings(): ProjectSettings {
    return this.state;
  }

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
   * Asks each session, but the one excluded, for its transcript, in
   * parallel, then plans them newest first. A session that doesn't answer
   * is skipped and logged.
   */
  async #planContext(excludeId: string | null): Promise<ContextEntry[]> {
    const others = this.listSessions().filter((s) => s.id !== excludeId);
    const results = await Promise.allSettled(
      others.map(async ({ id }) =>
        (await getAgentByName(this.env.SessionAgent, id)).transcriptForContext(),
      ),
    );
    const answered: { id: string; transcript: string }[] = [];
    results.forEach((result, i) => {
      const { id } = others[i];
      if (result.status === "fulfilled") answered.push({ id, transcript: result.value });
      else console.error(`[${this.name}] Skipped session ${id} as context: ${result.reason}`);
    });
    return planContext(answered);
  }

  /** Changes some settings, from the settings page. */
  @callable()
  updateSettings(change: Partial<ProjectSettings>) {
    this.setState({ ...this.state, ...checkSettingsChange(change) });
  }

  validateStateChange(_next: ProjectState, source: Connection | "server") {
    // Pages change settings through `updateSettings`, which checks them,
    // not by setting state themselves.
    if (source !== "server") throw new Error("Change settings with updateSettings");
  }

  #notify(message: ProjectMessage) {
    this.broadcast(JSON.stringify(message));
  }
}
