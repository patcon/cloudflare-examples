import { Agent, callable, type Connection } from "agents";
import { isSessionId } from "../shared/ids";
import {
  checkSettingsChange,
  DEFAULT_PROJECT_SETTINGS,
  type ProjectSettings,
} from "./explore/settings";

/** The project's Explore settings, synced to every page connected to it. */
export type ProjectState = ProjectSettings;

export interface SessionRow {
  id: string;
  started_at: number;
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
