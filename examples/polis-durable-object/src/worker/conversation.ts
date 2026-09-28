import { DurableObject } from "cloudflare:workers";
import type { Counts, ImportResult, MathResult, ServerMessage, Statement, Vote } from "../shared/types";
import { computeMath, type VoteRow } from "./math";
import type { PolisImport } from "./polis-csv";

// One instance per conversation (the Worker picks it with getByName(convoId)).
// It trusts the participantId the Worker passes in, including in the
// X-Participant-Id header on the WebSocket upgrade.
export const PARTICIPANT_HEADER = "x-participant-id";

// How long after a write the math runs. Debounces bursts of votes.
const MATH_DELAY_MS = 3_000;

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
    const math = this.ctx.storage.kv.get<MathResult>("math") ?? null;
    this.send(server, { type: "snapshot", counts: this.counts(), math });
    // Math saved before MathResult had tallies: recompute it now, rather
    // than waiting for the next vote, which might never come.
    if (math && !math.tallies && (await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now());
    }
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

  async addStatement(participantId: string, text: string): Promise<Statement> {
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
    await this.afterWrite();
    return statement;
  }

  // Upserts, so the last vote wins. Returns false if there's no such statement.
  async vote(participantId: string, statementId: number, vote: Vote): Promise<boolean> {
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
    await this.afterWrite();
    return true;
  }

  // Seeds the conversation from a parsed Polis export, in one transaction.
  // Re-importing the same export upserts, so nothing is duplicated.
  async importPolis(data: PolisImport): Promise<ImportResult> {
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      for (const p of data.participants) {
        sql.exec("INSERT OR IGNORE INTO participants (id, source, created_at) VALUES (?, 'polis', ?)", p.id, p.createdAt);
      }
      for (const s of data.statements) {
        sql.exec(
          `INSERT INTO statements (author_id, text, source, external_id, created_at) VALUES (?, ?, 'polis', ?, ?)
           ON CONFLICT (external_id) DO UPDATE SET text = excluded.text`,
          s.authorId,
          s.text,
          s.externalId,
          s.createdAt,
        );
      }
      const statementIds = new Map(
        sql
          .exec<{ id: number; external_id: string }>("SELECT id, external_id FROM statements WHERE external_id IS NOT NULL")
          .toArray()
          .map((row) => [row.external_id, row.id]),
      );
      for (const v of data.votes) {
        sql.exec(
          `INSERT INTO votes (participant_id, statement_id, vote, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT (participant_id, statement_id) DO UPDATE SET vote = excluded.vote, updated_at = excluded.updated_at`,
          v.participantId,
          statementIds.get(v.externalId)!,
          v.vote,
          v.updatedAt,
        );
      }
    });
    this.broadcast({ type: "counts", counts: this.counts() });
    await this.ctx.storage.setAlarm(Date.now()); // the math, right away
    return { statements: data.statements.length, participants: data.participants.length, votes: data.votes.length };
  }

  // Recompute the opinion groups. It only reads the current votes and
  // overwrites one value, so running it twice is harmless; if it throws, the
  // runtime retries the alarm.
  async alarm() {
    const votes = this.ctx.storage.sql
      .exec<VoteRow>("SELECT participant_id AS participantId, statement_id AS statementId, vote FROM votes")
      .toArray();
    const statementIds = this.ctx.storage.sql
      .exec<{ id: number }>("SELECT id FROM statements ORDER BY id")
      .toArray()
      .map((row) => row.id);
    const math = computeMath(votes, statementIds);
    this.ctx.storage.kv.put("math", math);
    this.broadcast({ type: "math", math });
  }

  private async afterWrite() {
    this.broadcast({ type: "counts", counts: this.counts() });
    // Only if none is pending, so a burst of writes runs the math once, and
    // an idle conversation never wakes.
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + MATH_DELAY_MS);
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
