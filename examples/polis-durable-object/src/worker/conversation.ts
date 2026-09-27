import { DurableObject } from "cloudflare:workers";
import type { Counts, MathResult, ServerMessage, Statement, Vote } from "../shared/types";

// One instance per conversation (the Worker picks it with getByName(convoId)).
// It trusts the participantId the Worker passes in, including in the
// X-Participant-Id header on the WebSocket upgrade.
export const PARTICIPANT_HEADER = "x-participant-id";

export class Conversation extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS participants (
          id TEXT PRIMARY KEY,               -- hashed cookie, or 'polis:<voter-id>' for imported participants
          source TEXT NOT NULL,              -- 'local' | 'polis'
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS statements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          author_id TEXT NOT NULL,           -- always a participants row, even for an imported author who never voted
          text TEXT NOT NULL,
          source TEXT NOT NULL,              -- 'local' | 'polis'
          external_id TEXT UNIQUE,           -- Polis comment-id, so re-importing upserts
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS votes (
          participant_id TEXT NOT NULL,
          statement_id INTEGER NOT NULL,
          vote INTEGER NOT NULL CHECK (vote IN (-1, 0, 1)),
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (participant_id, statement_id)
        );
      `);
    });
  }

  // The WebSocket upgrade, forwarded by the Worker. Uses the hibernation API,
  // so the DO can sleep while sockets stay open.
  async fetch(request: Request): Promise<Response> {
    const participantId = request.headers.get(PARTICIPANT_HEADER);
    if (request.headers.get("upgrade") !== "websocket" || !participantId) {
      return new Response("expected a WebSocket upgrade", { status: 426 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ participantId });
    this.send(server, {
      type: "snapshot",
      counts: this.counts(),
      math: this.ctx.storage.kv.get<MathResult>("math") ?? null,
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  // A random statement this participant hasn't voted on, or null.
  nextStatement(participantId: string): Statement | null {
    const rows = this.ctx.storage.sql
      .exec<Statement>(
        `SELECT id, text FROM statements
         WHERE id NOT IN (SELECT statement_id FROM votes WHERE participant_id = ?)
         ORDER BY random() LIMIT 1`,
        participantId,
      )
      .toArray();
    return rows[0] ?? null;
  }

  addStatement(participantId: string, text: string): Statement {
    const now = Date.now();
    this.ensureParticipant(participantId, now);
    const statement = this.ctx.storage.sql
      .exec<Statement>(
        `INSERT INTO statements (author_id, text, source, created_at) VALUES (?, ?, 'local', ?)
         RETURNING id, text`,
        participantId,
        text,
        now,
      )
      .one();
    this.afterWrite();
    return statement;
  }

  // Upserts, so the last vote wins. Returns false if there's no such statement.
  vote(participantId: string, statementId: number, vote: Vote): boolean {
    const exists = this.ctx.storage.sql.exec("SELECT 1 FROM statements WHERE id = ?", statementId).toArray().length > 0;
    if (!exists) return false;
    const now = Date.now();
    this.ensureParticipant(participantId, now);
    this.ctx.storage.sql.exec(
      `INSERT INTO votes (participant_id, statement_id, vote, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (participant_id, statement_id) DO UPDATE SET vote = excluded.vote, updated_at = excluded.updated_at`,
      participantId,
      statementId,
      vote,
      now,
    );
    this.afterWrite();
    return true;
  }

  private afterWrite() {
    this.broadcast({ type: "counts", counts: this.counts() });
  }

  private counts(): Counts {
    return this.ctx.storage.sql
      .exec<Counts>(
        `SELECT (SELECT count(*) FROM statements) AS statements,
                (SELECT count(*) FROM participants) AS participants,
                (SELECT count(*) FROM votes) AS votes`,
      )
      .one();
  }

  private broadcast(message: ServerMessage) {
    for (const ws of this.ctx.getWebSockets()) this.send(ws, message);
  }

  private send(ws: WebSocket, message: ServerMessage) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Already closing; its client will reconnect and get a fresh snapshot.
    }
  }

  private ensureParticipant(id: string, now: number) {
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO participants (id, source, created_at) VALUES (?, 'local', ?)",
      id,
      now,
    );
  }
}
