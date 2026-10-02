import { Agent, callable } from "agents";
import { isSessionId } from "../shared/ids";

export interface SessionRow {
  id: string;
  started_at: number;
}

/** What the project broadcasts when its session list changes, so pages refetch. */
export type ProjectMessage = { type: "sessions" };

/** One project, named by its ID. It lists its sessions. */
export class ProjectAgent extends Agent<Env> {
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

  #notify(message: ProjectMessage) {
    this.broadcast(JSON.stringify(message));
  }
}
