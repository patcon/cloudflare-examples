import { DurableObject } from "cloudflare:workers";

export type RoomUser = { id: string; name: string; count: number; isAdmin: boolean };
export type RoomState = { title: string; users: RoomUser[] };

export const DEFAULT_TITLE = "first-come-first-admin";

type Row = { id: string; name: string; count: number; is_admin: number };
const toUser = (row: Row): RoomUser => ({ id: row.id, name: row.name, count: row.count, isAdmin: row.is_admin === 1 });

// One instance per URL id (the Worker picks it with getByName(id)), holding
// everything about that room: its title, and each visitor's counter and
// whether they're an admin.
// A Durable Object runs one call at a time, so join() can't let two visitors
// both be first: whoever's call runs first finds the room empty.
// It does no auth itself: it's only reachable through the Worker's binding,
// and the Worker has already checked who the caller is and what they may do.
export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      is_admin INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL
    )`);
  }

  getUser(id: string): RoomUser | null {
    const [row] = this.ctx.storage.sql.exec<Row>("SELECT * FROM users WHERE id = ?", id).toArray();
    return row ? toUser(row) : null;
  }

  // Adds you if you're new. The first visitor to an empty room is its admin.
  join(id: string): RoomUser {
    const existing = this.getUser(id);
    if (existing) return existing;
    const { n } = this.ctx.storage.sql.exec<{ n: number }>("SELECT count(*) AS n FROM users").one();
    this.ctx.storage.sql.exec(
      "INSERT INTO users (id, name, is_admin, joined_at) VALUES (?, ?, ?, ?)",
      id,
      `User ${n + 1}`,
      n === 0 ? 1 : 0,
      Date.now(),
    );
    return this.getUser(id)!;
  }

  getState(): RoomState {
    const users = this.ctx.storage.sql.exec<Row>("SELECT * FROM users ORDER BY joined_at").toArray().map(toUser);
    return { title: this.ctx.storage.kv.get<string>("title") ?? DEFAULT_TITLE, users };
  }

  increment(id: string): number {
    return this.ctx.storage.sql
      .exec<{ count: number }>("UPDATE users SET count = count + 1 WHERE id = ? RETURNING count", id)
      .one().count;
  }

  // Admin actions: the Worker only calls these for admins.

  setTitle(title: string): RoomState {
    this.ctx.storage.kv.put("title", title);
    return this.getState();
  }

  resetCounts(): RoomState {
    this.ctx.storage.sql.exec("UPDATE users SET count = 0");
    return this.getState();
  }

  // false if there's no such user in this room.
  makeAdmin(id: string): boolean {
    return this.ctx.storage.sql.exec("UPDATE users SET is_admin = 1 WHERE id = ?", id).rowsWritten > 0;
  }
}
