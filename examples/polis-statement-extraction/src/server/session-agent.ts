import { Agent, callable, getAgentByName, type Connection } from "agents";
import { withVoiceInput, type Transcriber } from "agents/voice";
import { GeminiBatchSTT, GeminiLiveSTT, type TranscriptSegment } from "@cloudflare/voice-gemini";
import { extractStatements, isRetryable } from "./extract/gemini";
import { isProjectId } from "../shared/ids";
import { MAX_RECORDING_BYTES } from "../shared/limits";
import { BATCH_MODEL, EXTRACT_MODEL, LIVE_MODEL, LOCATION } from "./models";

export interface SessionState {
  /** Set by the first page to connect, from its URL. */
  projectId: string | null;
  recording: boolean;
  /** The compressed recording the page uploads, in R2. */
  audio: { mimeType: string; parts: number; bytes: number } | null;
  /** Diarizing the whole recording once it stops, then one last extraction. */
  final: { status: "running" | "done" | "failed"; error: string | null } | null;
}

/** One speaker's stretch of the diarized transcript. */
export interface FinalSegment {
  seq: number;
  /** Numbered from 0, in the order speakers are first heard. */
  speaker: number | null;
  text: string;
}

/** The window ID statements from the final pass are saved with. */
const FINAL_WINDOW = 0;

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
/** How often extraction runs by itself while recording. */
const EXTRACT_EVERY_SECONDS = 300;
/** Fewer new words than this, and the timer skips its run. */
const MIN_NEW_WORDS = 150;

export interface Segment {
  id: number;
  at: number;
  text: string;
}

/** What the session broadcasts, beside the voice pipeline's own messages. */
export type SessionMessage =
  | { type: "segment"; segment: Segment }
  | { type: "windows" }
  | { type: "final" };

const InputAgent = withVoiceInput(Agent);

/**
 * One recorded conversation, named by a random UUID. The recording phone
 * streams audio to it, and it keeps the live transcript, one segment per
 * utterance Gemini Live finalizes.
 */
export class SessionAgent extends InputAgent<Env, SessionState> {
  initialState: SessionState = {
    projectId: null,
    recording: false,
    audio: null,
    final: null,
  };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS live_segments (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, text TEXT NOT NULL)",
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
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS final_transcript (seq INTEGER PRIMARY KEY, speaker INTEGER, text TEXT NOT NULL)",
    );
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
    // The queue runs one at a time, so runs never overlap. Pressing twice
    // queues twice, but the second finds nothing new and returns.
    await this.queue("processWindow", {}, { retry: { maxAttempts: 3 } });
  }

  /** From the timer: runs extraction once enough has been said. */
  async tick() {
    if (!this.state.recording) return this.#stopTimer();
    const words = this.#pendingSegments()
      .map((s) => s.text.split(/\s+/).filter(Boolean).length)
      .reduce((a, b) => a + b, 0);
    if (words >= MIN_NEW_WORDS) await this.extractNow();
  }

  async #stopTimer() {
    for (const s of await this.listSchedules({ type: "interval" })) {
      if (s.callback === "tick") await this.cancelSchedule(s.id);
    }
  }

  /** What's been said since the last run that worked. */
  #pendingSegments(): Segment[] {
    return this.sql<Segment>`
      SELECT id, at, text FROM live_segments
      WHERE id > (SELECT COALESCE(MAX(to_seg), 0) FROM windows WHERE status = 'done')
      ORDER BY id`;
  }

  /**
   * One extraction run, from the queue, which runs them one at a time. A
   * run that fails without a retry leaves its segments for the next one.
   */
  async processWindow() {
    const { projectId } = this.state;
    if (!projectId) return;
    const segments = this.#pendingSegments();
    const first = segments[0];
    const last = segments[segments.length - 1];
    if (!first || !last) return;
    const context = this.sql<Segment>`
      SELECT id, at, text FROM live_segments WHERE id < ${first.id}
      ORDER BY id DESC LIMIT ${CONTEXT_SEGMENTS}`.reverse();

    const [win] = this.sql<{ id: number }>`
      INSERT INTO windows (from_seg, to_seg, status, created_at)
      VALUES (${first.id}, ${last.id}, 'running', ${Date.now()})
      RETURNING id`;
    this.#notify({ type: "windows" });

    const project = await getAgentByName(this.env.ProjectAgent, projectId);
    try {
      const { topic, existing } = await project.promptContext();
      const proposed = await extractStatements(this.#vertex(EXTRACT_MODEL), {
        topic,
        existing,
        context: context.map((s) => s.text).join("\n"),
        transcript: segments.map((s) => s.text).join("\n"),
        pass: "live",
      });
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
      if (isRetryable(error)) throw error;
    } finally {
      this.#notify({ type: "windows" });
    }
  }

  /**
   * Stores one piece of the page's compressed recording, from the Worker's
   * upload route. Pieces come every 10 seconds, numbered from 0; the first
   * holds the file's header, so joined in order they make one file.
   */
  async storePart(projectId: string, n: number, mimeType: string, body: ArrayBuffer) {
    if (projectId !== this.state.projectId) throw new Error("Wrong project");
    if (this.state.final) throw new Error("This session has already finished");
    const audio = this.state.audio ?? { mimeType, parts: 0, bytes: 0 };
    // A retried upload may repeat the last piece. Anything else is a gap.
    if (!Number.isInteger(n) || n < 0 || n > audio.parts) {
      throw new Error(`Expected piece ${audio.parts}, got ${n}`);
    }
    if (mimeType !== audio.mimeType) throw new Error("The format changed mid-recording");
    await this.env.RECORDINGS.put(partKey(this.name, n), body);
    if (n === audio.parts) {
      this.setState({
        ...this.state,
        audio: { mimeType, parts: n + 1, bytes: audio.bytes + body.byteLength },
      });
    }
  }

  /**
   * For `?debug=true`: one 5-minute WAV window of an uploaded file, from the
   * Worker's replay route. The batch model transcribes it in place of the
   * live text, then the usual extraction runs. Windows come in order, one at
   * a time, so the page waits for each.
   */
  async replayWindow(projectId: string, wav: ArrayBuffer) {
    if (projectId !== this.state.projectId) throw new Error("Wrong project");
    if (this.state.recording || this.state.final) {
      throw new Error("This session is recording or has finished");
    }
    const segments = await new GeminiBatchSTT(this.#vertex(BATCH_MODEL)).transcribe(
      new Uint8Array(wav),
    );
    for (const { text } of segments) this.#saveSegment(text);
    await this.extractNow();
    return { segments: segments.length };
  }

  /** For the Worker's download route: the recording's pieces, in order. */
  recordingParts(projectId: string): { mimeType: string; keys: string[] } | null {
    const { audio } = this.state;
    if (projectId !== this.state.projectId || !audio) return null;
    return {
      mimeType: audio.mimeType,
      keys: Array.from({ length: audio.parts }, (_, n) => partKey(this.name, n)),
    };
  }

  /**
   * Called by the page once it has stopped and uploaded the last piece.
   * Diarizes the whole recording, then runs one last extraction over it.
   */
  @callable()
  async finish() {
    if (!this.state.audio || this.state.final?.status === "running") return;
    if (this.state.final?.status === "done") return;
    this.setState({ ...this.state, final: { status: "running", error: null } });
    await this.queue("finalize", {}, { retry: { maxAttempts: 3 } });
  }

  @callable()
  listFinalTranscript(): FinalSegment[] {
    return this.sql<FinalSegment>`SELECT seq, speaker, text FROM final_transcript ORDER BY seq`;
  }

  /** From the queue. A retry skips the transcription if it's already done. */
  async finalize() {
    const { projectId, audio } = this.state;
    if (!projectId || !audio) return;
    const project = await getAgentByName(this.env.ProjectAgent, projectId);
    try {
      let segments = this.listFinalTranscript();
      if (segments.length === 0) {
        segments = (await this.#diarize(audio)).map((s, seq) => ({ seq, ...s }));
        for (const s of segments) {
          this.sql`INSERT INTO final_transcript (seq, speaker, text)
            VALUES (${s.seq}, ${s.speaker}, ${s.text})`;
        }
        this.#notify({ type: "final" });
      }
      const { topic, existing } = await project.promptContext();
      const proposed = await extractStatements(this.#vertex(EXTRACT_MODEL), {
        topic,
        existing,
        context: "",
        transcript: segments
          .map((s) => (s.speaker === null ? s.text : `Speaker ${s.speaker + 1}: ${s.text}`))
          .join("\n"),
        pass: "final",
      });
      const { kept, filtered } = await project.addCandidates(
        this.name,
        FINAL_WINDOW,
        "final",
        proposed,
      );
      console.log(`[${this.name}] Final pass: ${kept} kept, ${filtered} filtered`);
      this.setState({ ...this.state, final: { status: "done", error: null } });
      await project.runFinished(this.name, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${this.name}] Final pass failed: ${message}`);
      if (isRetryable(error)) throw error;
      this.setState({ ...this.state, final: { status: "failed", error: message } });
      await project.runFinished(this.name, message);
    }
  }

  /** Lets the page try the final pass again, such as after a new token. */
  @callable()
  async retryFinish() {
    if (this.state.final?.status !== "failed") return;
    this.setState({ ...this.state, final: null });
    await this.finish();
  }

  async #diarize(audio: NonNullable<SessionState["audio"]>): Promise<TranscriptSegment[]> {
    if (audio.bytes > MAX_RECORDING_BYTES) {
      throw new Error(
        `The recording is ${(audio.bytes / 1024 / 1024).toFixed(1)}MB, more than the ${MAX_RECORDING_BYTES / 1024 / 1024}MB Gemini takes in one request`,
      );
    }
    const bytes = new Uint8Array(audio.bytes);
    let offset = 0;
    for (let n = 0; n < audio.parts; n++) {
      const part = await this.env.RECORDINGS.get(partKey(this.name, n));
      if (!part) throw new Error(`Piece ${n} of the recording is missing`);
      const chunk = new Uint8Array(await part.arrayBuffer());
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const started = Date.now();
    const segments = await new GeminiBatchSTT(this.#vertex(BATCH_MODEL)).transcribe(
      offset === bytes.length ? bytes : bytes.slice(0, offset),
      { diarize: true, mimeType: audio.mimeType.split(";")[0] },
    );
    console.log(
      `[${this.name}] Diarized ${(offset / 1024 / 1024).toFixed(1)}MB in ${Math.round((Date.now() - started) / 1000)}s: ${segments.length} segments`,
    );
    return segments;
  }

  #vertex(model: string) {
    return {
      accessToken: this.env.GOOGLE_ACCESS_TOKEN,
      project: this.env.GOOGLE_CLOUD_PROJECT,
      location: LOCATION,
      model,
    };
  }

  createTranscriber(_connection: Connection): Transcriber {
    return new GeminiLiveSTT(this.#vertex(LIVE_MODEL));
  }

  beforeCallStart(_connection: Connection) {
    // Recording only makes sense once the session knows its project.
    return this.state.projectId !== null;
  }

  async onCallStart(_connection: Connection) {
    this.setState({ ...this.state, recording: true });
    // Idempotent: a second start doesn't add a second timer.
    await this.scheduleEvery(EXTRACT_EVERY_SECONDS, "tick");
  }

  async onCallEnd(_connection: Connection) {
    this.setState({ ...this.state, recording: false });
    await this.#stopTimer();
    // Whatever was said since the last run.
    await this.extractNow();
  }

  onTranscript(text: string, _connection: Connection) {
    this.#saveSegment(text);
  }

  /** Saves one finalized utterance, live or replayed, and tells the pages. */
  #saveSegment(text: string) {
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

function partKey(sessionId: string, n: number) {
  return `sessions/${sessionId}/parts/${String(n).padStart(6, "0")}`;
}
