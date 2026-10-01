import { Agent, callable, getAgentByName, type Connection } from "agents";
import { withVoiceInput, type Transcriber } from "agents/voice";
import { GeminiLiveSTT } from "@cloudflare/voice-gemini";
import { extractStatements, VertexError } from "./extract/gemini";
import { isProjectId } from "./ids";
import { EXTRACT_MODEL, LIVE_MODEL, LOCATION } from "./models";

export interface SessionState {
  /** Set by the first page to connect, from its URL. */
  projectId: string | null;
  recording: boolean;
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

/** Earlier segments given to the prompt as context. */
const CONTEXT_SEGMENTS = 3;

export interface Segment {
  id: number;
  at: number;
  text: string;
}

/** What the session broadcasts, beside the voice pipeline's own messages. */
export type SessionMessage =
  | { type: "segment"; segment: Segment }
  | { type: "windows" };

const InputAgent = withVoiceInput(Agent);

/**
 * One recorded conversation, named by a random UUID. The recording phone
 * streams audio to it, and it keeps the live transcript, one segment per
 * utterance Gemini Live finalizes.
 */
export class SessionAgent extends InputAgent<Env, SessionState> {
  initialState: SessionState = { projectId: null, recording: false };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS live_segments (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, text TEXT NOT NULL)"
    );
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS windows (
      id INTEGER PRIMARY KEY,
      from_seg INTEGER NOT NULL,
      to_seg INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      kept INTEGER NOT NULL DEFAULT 0,
      filtered INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`);
  }

  /**
   * Joins this session to a project, and registers it there. A session
   * belongs to one project for good.
   */
  @callable()
  async attach(projectId: string) {
    if (!isProjectId(projectId)) throw new Error(`Not a project ID: ${projectId}`);
    if (this.state.projectId === projectId) return;
    if (this.state.projectId) {
      throw new Error(`This session belongs to ${this.state.projectId}`);
    }
    const project = await getAgentByName(this.env.ProjectAgent, projectId);
    await project.registerSession(this.name);
    this.setState({ ...this.state, projectId });
  }

  @callable()
  listSegments(): Segment[] {
    return this.sql<Segment>`SELECT id, at, text FROM live_segments ORDER BY id`;
  }

  @callable()
  listWindows(): WindowRow[] {
    return this.sql<WindowRow>`SELECT * FROM windows ORDER BY id DESC`;
  }

  /** Pulls statements out of what's been said since the last run. */
  @callable()
  async extractNow() {
    // Runs after anything already queued. The stable id replaces a run
    // that's still waiting, so pressing twice doesn't run twice.
    await this.queue("processWindow", {}, {
      id: "window",
      retry: { maxAttempts: 3 }
    });
  }

  /**
   * One extraction run, from the queue, which runs them one at a time. A
   * run that fails without a retry leaves its segments for the next one.
   */
  async processWindow() {
    const { projectId } = this.state;
    if (!projectId) return;
    const [{ last }] = this.sql<{ last: number }>`
      SELECT COALESCE(MAX(to_seg), 0) AS last FROM windows WHERE status = 'done'`;
    const segments = this.sql<Segment>`
      SELECT id, at, text FROM live_segments WHERE id > ${last} ORDER BY id`;
    if (segments.length === 0) return;
    const context = this.sql<Segment>`
      SELECT id, at, text FROM live_segments WHERE id <= ${last}
      ORDER BY id DESC LIMIT ${CONTEXT_SEGMENTS}`.reverse();

    const [win] = this.sql<{ id: number }>`
      INSERT INTO windows (from_seg, to_seg, status, created_at)
      VALUES (${segments[0].id}, ${segments.at(-1)!.id}, 'running', ${Date.now()})
      RETURNING id`;
    this.#notify({ type: "windows" });

    const project = await getAgentByName(this.env.ProjectAgent, projectId);
    try {
      const { topic, existing } = await project.promptContext();
      const proposed = await extractStatements(
        {
          accessToken: this.env.GOOGLE_ACCESS_TOKEN,
          project: this.env.GOOGLE_CLOUD_PROJECT,
          location: LOCATION,
          model: EXTRACT_MODEL
        },
        {
          topic,
          existing,
          context: context.map((s) => s.text).join("\n"),
          transcript: segments.map((s) => s.text).join("\n"),
          pass: "live"
        }
      );
      const { kept, filtered } = await project.addCandidates(this.name, win.id, "live", proposed);
      this.sql`UPDATE windows SET status = 'done', kept = ${kept}, filtered = ${filtered}
        WHERE id = ${win.id}`;
      console.log(`[${this.name}] Window ${win.id}: ${kept} kept, ${filtered} filtered`);
      await project.runFinished(this.name, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sql`UPDATE windows SET status = 'failed', error = ${message} WHERE id = ${win.id}`;
      console.error(`[${this.name}] Window ${win.id} failed: ${message}`);
      await project.runFinished(this.name, message);
      // Rethrowing lets the queue retry it, as a new window row.
      if (error instanceof VertexError && error.retryable) throw error;
    } finally {
      this.#notify({ type: "windows" });
    }
  }

  createTranscriber(_connection: Connection): Transcriber {
    return new GeminiLiveSTT({
      accessToken: this.env.GOOGLE_ACCESS_TOKEN,
      project: this.env.GOOGLE_CLOUD_PROJECT,
      location: LOCATION,
      model: LIVE_MODEL
    });
  }

  beforeCallStart(_connection: Connection) {
    // Recording only makes sense once the session knows its project.
    return this.state.projectId !== null;
  }

  onCallStart(_connection: Connection) {
    this.setState({ ...this.state, recording: true });
  }

  onCallEnd(_connection: Connection) {
    this.setState({ ...this.state, recording: false });
  }

  onTranscript(text: string, _connection: Connection) {
    const [segment] = this.sql<Segment>`
      INSERT INTO live_segments (at, text) VALUES (${Date.now()}, ${text})
      RETURNING id, at, text`;
    console.log(`[${this.name}] Transcribed: "${text}"`);
    this.#notify({ type: "segment", segment });
  }

  #notify(message: SessionMessage) {
    this.broadcast(JSON.stringify(message));
  }
}
