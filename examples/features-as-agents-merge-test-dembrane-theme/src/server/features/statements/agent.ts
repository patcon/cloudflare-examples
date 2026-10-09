import { callable } from "agents";
import { whyNotExtract } from "../../../shared/features/statements/rules";
import type { StatementsSettings } from "../../../shared/features/statements/settings";
import { projectDescription } from "../../../shared/general";
import { FeatureAgent } from "../../lib/feature-agent";
import { isRetryable } from "../../lib/gemini";
import { EXTRACT_MODEL, vertex } from "../../models";
import type { SessionEvent } from "../../session/agent";
import { extractStatements } from "./extract";
import { filterProposed } from "./filter";
import { PROMPT_VERSION } from "./prompt";
import type { FilterReason, Proposed } from "./types";

export interface StatementsState {
  /** An extraction run is going. */
  running: boolean;
  /** The last segment a run that worked covered, or 0. Later ones are new. */
  cursor: number;
  lastRunAt: number | null;
  lastRunError: string | null;
}

/** One extraction run over a stretch of the transcript, kept as a log. */
export interface WindowRow {
  id: number;
  /** The segments it covered, inclusive. */
  from_seg: number;
  to_seg: number;
  status: "running" | "done" | "failed";
  error: string | null;
  kept: number;
  filtered: number;
  created_at: number;
}

export type CandidateStatus = "pending" | "approved" | "rejected" | "filtered";

/** A statement proposed for Polis, for the host to review. */
export interface Candidate {
  id: number;
  window_id: number;
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

/** What Statements broadcasts to its pages. */
export type StatementsMessage = { type: "windows" };

/** How often extraction runs by itself while recording. */
const EXTRACT_EVERY_SECONDS = 300;
/** Fewer new words than this, and the timer skips its run. */
const MIN_NEW_WORDS = 150;
/** Earlier segments each run sees as context. */
const CONTEXT_SEGMENTS = 3;

/**
 * Statement extraction for one session, named by the session's ID. While
 * the session records, it pulls candidate statements for Polis out of each
 * new stretch of the transcript, every few minutes, and once more when the
 * recording stops. The host reviews every session's candidates together,
 * through the project.
 */
export class StatementsAgent extends FeatureAgent<StatementsState> {
  initialState: StatementsState = {
    running: false,
    cursor: 0,
    lastRunAt: null,
    lastRunError: null,
  };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = this.ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS windows (
      id INTEGER PRIMARY KEY,
      from_seg INTEGER NOT NULL,
      to_seg INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      kept INTEGER NOT NULL DEFAULT 0,
      filtered INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY,
      window_id INTEGER NOT NULL,
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

  onStart() {
    // A run cut off, such as by a deploy, left its window `running`. The
    // queue runs it again if it was queued; its segments are still new.
    if (this.state.running) {
      this.sql`UPDATE windows SET status = 'failed', error = 'Cut off' WHERE status = 'running'`;
      this.setState({ ...this.state, running: false });
    }
  }

  /** The session's recording started or stopped. */
  async onSessionEvent(event: SessionEvent) {
    if (event.type !== "recording") return;
    if (event.on) {
      // Idempotent: a second start doesn't add a second timer.
      await this.scheduleEvery(EXTRACT_EVERY_SECONDS, "tick");
    } else {
      await this.#stopTimer();
      // Whatever was said since the last run.
      await this.#enqueue();
    }
  }

  /** From the timer: runs extraction once enough has been said. */
  async tick() {
    const session = await this.session();
    if (!(await session.facts()).recording) return this.#stopTimer();
    const { segments } = await session.segmentsSince(this.state.cursor);
    const words = segments
      .map((s) => s.text.split(/\s+/).filter(Boolean).length)
      .reduce((a, b) => a + b, 0);
    if (words >= MIN_NEW_WORDS) await this.#enqueue();
  }

  async #stopTimer() {
    for (const s of await this.listSchedules({ type: "interval" })) {
      if (s.callback === "tick") await this.cancelSchedule(s.id);
    }
  }

  /** Pulls statements out of what's been said since the last run, for the page's button. */
  @callable()
  async extractNow() {
    const [{ settings }, facts] = await Promise.all([
      this.#settings(),
      (await this.session()).facts(),
    ]);
    const reason = whyNotExtract({
      enabled: settings.enabled,
      running: this.state.running,
      newSegments: facts.segments - this.state.cursor,
    });
    if (reason) throw new Error(reason);
    await this.#enqueue();
  }

  /**
   * The queue runs one at a time, so runs never overlap. Queueing twice
   * runs twice, but the second finds nothing new and returns.
   */
  async #enqueue() {
    await this.queue("processWindow", {}, { retry: { maxAttempts: 3 } });
  }

  /**
   * One extraction run, from the queue. A run that fails without a retry
   * leaves its segments for the next one.
   */
  async processWindow() {
    const { settings, project } = await this.#settings();
    if (!settings.enabled) return;
    const { context, segments } = await (await this.session()).segmentsSince(
      this.state.cursor,
      CONTEXT_SEGMENTS,
    );
    const first = segments[0];
    const last = segments[segments.length - 1];
    if (!first || !last) return;

    const [win] = this.sql<{ id: number }>`
      INSERT INTO windows (from_seg, to_seg, status, created_at)
      VALUES (${first.id}, ${last.id}, 'running', ${Date.now()})
      RETURNING id`;
    this.setState({ ...this.state, running: true });
    this.#notify({ type: "windows" });

    try {
      // Every session's statements, so none is proposed twice in the project.
      const all = (await project.candidates()).flatMap((s) => s.candidates ?? []);
      const proposed = await extractStatements(vertex(this.env, EXTRACT_MODEL), {
        project: projectDescription(await project.general()),
        existing: texts(all, ["pending", "approved"]),
        context: context.map((s) => s.text).join("\n"),
        transcript: segments.map((s) => s.text).join("\n"),
        pass: "live",
      });
      // Rejected ones count as duplicates too, so the host isn't asked twice.
      const { kept, filtered } = this.#addCandidates(
        win.id,
        proposed,
        texts(all, ["pending", "approved", "rejected"]),
      );
      this.sql`UPDATE windows SET status = 'done', kept = ${kept}, filtered = ${filtered}
        WHERE id = ${win.id}`;
      console.log(`[${this.name}] Window ${win.id}: ${kept} kept, ${filtered} filtered`);
      this.setState({
        ...this.state,
        running: false,
        cursor: last.id,
        lastRunAt: Date.now(),
        lastRunError: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sql`UPDATE windows SET status = 'failed', error = ${message} WHERE id = ${win.id}`;
      console.error(`[${this.name}] Window ${win.id} failed: ${message}`);
      this.setState({
        ...this.state,
        running: false,
        lastRunAt: Date.now(),
        lastRunError: message,
      });
      // Rethrowing lets the queue retry it, as a new window row.
      if (isRetryable(error)) throw error;
    } finally {
      this.#notify({ type: "windows" });
      void this.#tellProject();
    }
  }

  /** Adds proposed statements, after the filter. Filtered ones are kept, for tuning the prompt. */
  #addCandidates(windowId: number, proposed: Proposed[], existing: string[]) {
    const now = Date.now();
    let kept = 0;
    for (const { proposed: p, reason } of filterProposed(proposed, existing)) {
      if (!reason) kept++;
      this.sql`INSERT INTO candidates
        (window_id, text, quote, rationale, clarity, divisiveness, novelty, status, filter_reason, prompt_version, created_at)
        VALUES (${windowId}, ${p.text}, ${p.quote}, ${p.rationale},
          ${p.scores.clarity}, ${p.scores.divisiveness}, ${p.scores.novelty},
          ${reason ? "filtered" : "pending"}, ${reason}, ${PROMPT_VERSION}, ${now})`;
    }
    return { kept, filtered: proposed.length - kept };
  }

  @callable()
  listWindows(): WindowRow[] {
    return this.sql<WindowRow>`SELECT * FROM windows ORDER BY id DESC`;
  }

  /**
   * Over RPC, for the project's review: this session's candidates, newest
   * first, and how its last run went.
   */
  review() {
    const { lastRunAt, lastRunError } = this.state;
    return {
      candidates: this.sql<Candidate>`SELECT * FROM candidates ORDER BY id DESC`,
      run: { lastRunAt, lastRunError },
    };
  }

  /** Over RPC, from the project's review: approve, edit then approve, reject, or put one back. */
  decide(id: number, status: "approved" | "rejected" | "pending", editedText?: string) {
    if (!["approved", "rejected", "pending"].includes(status)) {
      throw new Error(`Can't set a statement to ${status}`);
    }
    const edited = editedText?.trim() || null;
    this.sql`UPDATE candidates
      SET status = ${status}, edited_text = COALESCE(${edited}, edited_text),
        decided_at = ${status === "pending" ? null : Date.now()}
      WHERE id = ${id}`;
    void this.#tellProject();
  }

  async #settings() {
    const { project } = await this.project();
    // RPC loses `settings`' generic, so the type is put back by hand.
    const settings = (await project.settings("statements")) as StatementsSettings;
    return { settings, project };
  }

  /** Tells the project its candidates changed, so the review page refetches. */
  async #tellProject() {
    try {
      await (await this.project()).project.changed("statements");
    } catch (error) {
      console.error(`[${this.name}] Couldn't tell the project: ${error}`);
    }
  }

  #notify(message: StatementsMessage) {
    this.broadcast(JSON.stringify(message));
  }
}

/** The wording of candidates with any of these statuses: the host's edit, if any. */
function texts(candidates: Candidate[], statuses: CandidateStatus[]): string[] {
  return candidates.filter((c) => statuses.includes(c.status)).map((c) => c.edited_text ?? c.text);
}
