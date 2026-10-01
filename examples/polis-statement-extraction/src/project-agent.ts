import { Agent, callable, getAgentByName } from "agents";
import { filterProposed } from "./extract/filter";
import { PROMPT_VERSION } from "./extract/prompt";
import type { FilterReason, Pass, Proposed } from "./extract/types";
import { isSessionId } from "./ids";

export interface ProjectState {
  /** What the conversations are about, given to the extraction prompt. */
  topic: string;
}

export interface SessionRow {
  id: string;
  started_at: number;
  /** The session's last extraction run. */
  last_run_at: number | null;
  last_run_error: string | null;
}

export type CandidateStatus = "pending" | "approved" | "rejected" | "filtered";

export interface Candidate {
  id: number;
  session_id: string;
  window_id: number;
  pass: Pass;
  text: string;
  /** The host's wording, when they edited it before approving. */
  edited_text: string | null;
  quote: string;
  rationale: string;
  clarity: number;
  divisiveness: number;
  novelty: number;
  status: CandidateStatus;
  filter_reason: FilterReason | null;
  prompt_version: number;
  created_at: number;
  decided_at: number | null;
}

/** What the project broadcasts when its lists change, so pages refetch. */
export type ProjectMessage = { type: "sessions" } | { type: "candidates" };

/**
 * One project, named by its ID. It lists its sessions and keeps every
 * statement they propose. The host's review page connects to it.
 */
export class ProjectAgent extends Agent<Env, ProjectState> {
  initialState: ProjectState = { topic: "" };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = this.ctx.storage.sql;
    sql.exec(
      "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, last_run_at INTEGER, last_run_error TEXT)"
    );
    sql.exec(`CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      window_id INTEGER NOT NULL,
      pass TEXT NOT NULL,
      text TEXT NOT NULL,
      edited_text TEXT,
      quote TEXT NOT NULL,
      rationale TEXT NOT NULL,
      clarity INTEGER NOT NULL,
      divisiveness INTEGER NOT NULL,
      novelty INTEGER NOT NULL,
      status TEXT NOT NULL,
      filter_reason TEXT,
      prompt_version INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      decided_at INTEGER
    )`);
  }

  /** Called by a session the first time its page connects. */
  registerSession(id: string) {
    if (!isSessionId(id)) throw new Error(`Not a session ID: ${id}`);
    this.sql`INSERT OR IGNORE INTO sessions (id, started_at) VALUES (${id}, ${Date.now()})`;
    this.#notify({ type: "sessions" });
  }

  /**
   * What a session's extraction prompt needs: the topic, and the statements
   * the project already has, so it doesn't propose them again.
   */
  promptContext(): { topic: string; existing: string[] } {
    return { topic: this.state.topic, existing: this.#statements(["pending", "approved"]) };
  }

  /**
   * Adds a session's proposed statements, after the filter. Rejected ones
   * count as duplicates too, so the host isn't asked twice.
   */
  addCandidates(
    sessionId: string,
    windowId: number,
    pass: Pass,
    proposed: Proposed[]
  ): { kept: number; filtered: number } {
    const existing = this.#statements(["pending", "approved", "rejected"]);
    const now = Date.now();
    let kept = 0;
    for (const { proposed: p, reason } of filterProposed(proposed, existing)) {
      if (!reason) kept++;
      this.sql`INSERT INTO candidates
        (session_id, window_id, pass, text, quote, rationale, clarity, divisiveness, novelty, status, filter_reason, prompt_version, created_at)
        VALUES (${sessionId}, ${windowId}, ${pass}, ${p.text}, ${p.quote}, ${p.rationale},
          ${p.scores.clarity}, ${p.scores.divisiveness}, ${p.scores.novelty},
          ${reason ? "filtered" : "pending"}, ${reason}, ${PROMPT_VERSION}, ${now})`;
    }
    this.#notify({ type: "candidates" });
    return { kept, filtered: proposed.length - kept };
  }

  /** Called by a session after each extraction run, to show on review. */
  runFinished(sessionId: string, error: string | null) {
    this.sql`UPDATE sessions SET last_run_at = ${Date.now()}, last_run_error = ${error}
      WHERE id = ${sessionId}`;
    this.#notify({ type: "sessions" });
  }

  @callable()
  listSessions(): SessionRow[] {
    return this.sql<SessionRow>`SELECT * FROM sessions ORDER BY started_at DESC`;
  }

  /** Runs a session's extraction now, for the review page's button. */
  @callable()
  async extractNow(sessionId: string) {
    if (!isSessionId(sessionId)) throw new Error(`Not a session ID: ${sessionId}`);
    const [known] = this.sql`SELECT 1 FROM sessions WHERE id = ${sessionId}`;
    if (!known) throw new Error(`No session ${sessionId} in this project`);
    const session = await getAgentByName(this.env.SessionAgent, sessionId);
    await session.extractNow();
  }

  @callable()
  listCandidates(): Candidate[] {
    return this.sql<Candidate>`SELECT * FROM candidates ORDER BY id DESC`;
  }

  /** The host approves, edits then approves, rejects, or puts one back. */
  @callable()
  decide(id: number, status: "approved" | "rejected" | "pending", editedText?: string) {
    if (!["approved", "rejected", "pending"].includes(status)) {
      throw new Error(`Can't set a statement to ${status}`);
    }
    const edited = editedText?.trim() || null;
    this.sql`UPDATE candidates
      SET status = ${status}, edited_text = COALESCE(${edited}, edited_text),
        decided_at = ${status === "pending" ? null : Date.now()}
      WHERE id = ${id}`;
    this.#notify({ type: "candidates" });
  }

  @callable()
  setTopic(topic: string) {
    this.setState({ ...this.state, topic: String(topic).slice(0, 500) });
  }

  #statements(statuses: CandidateStatus[]): string[] {
    return this.sql<{ text: string; status: CandidateStatus }>`
      SELECT COALESCE(edited_text, text) AS text, status FROM candidates`
      .filter((row) => statuses.includes(row.status))
      .map((row) => row.text);
  }

  #notify(message: ProjectMessage) {
    this.broadcast(JSON.stringify(message));
  }
}
