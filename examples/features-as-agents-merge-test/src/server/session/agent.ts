import { Agent, callable, getAgentByName, type Connection } from "agents";
import { withVoiceInput, type Transcriber } from "agents/voice";
import { GeminiBatchSTT, GeminiLiveSTT } from "@cloudflare/voice-gemini";
import { FEATURE_KEYS, FEATURES } from "../../shared/features";
import { isProjectId } from "../../shared/ids";
import { recordedSecondsAt, type SessionFacts } from "../../shared/rules";
import { BATCH_MODEL, LIVE_MODEL, vertex } from "../models";

export interface SessionState {
  /** Set by the first page to connect, from its URL. */
  projectId: string | null;
  /** When the current recording started, or null when not recording. */
  recordingSince: number | null;
  /**
   * Seconds recorded before the current recording, across every Start and
   * Stop. A replay adds its file's length.
   */
  recordedSeconds: number;
}

export interface Segment {
  id: number;
  at: number;
  text: string;
}

/** What the session broadcasts, beside the voice pipeline's own messages. */
export type SessionMessage = { type: "segment"; segment: Segment };

/**
 * What the session tells each feature agent, through its `onSessionEvent`.
 * The one thing the session pushes: features pull everything else.
 */
export type SessionEvent = { type: "recording"; on: boolean };

/** 16kHz mono 16-bit WAV, as the replay page sends, after its 44-byte header. */
const WAV_BYTES_PER_SECOND = 16_000 * 2;
const WAV_HEADER_BYTES = 44;

const InputAgent = withVoiceInput(Agent);

/**
 * One recorded conversation, named by a random UUID. The recording phone
 * streams audio to it, and it keeps the live transcript, one segment per
 * utterance Gemini Live finalizes. It can be stopped and started again as
 * often as needed, and keeps adding to the same transcript.
 *
 * It knows nothing of the features. Each has its own agent, named by the
 * same session ID, which reads the transcript through `facts()` and
 * `segmentsSince()`.
 */
export class SessionAgent extends InputAgent<Env, SessionState> {
  initialState: SessionState = {
    projectId: null,
    recordingSince: null,
    recordedSeconds: 0,
  };

  /** The connection that's recording. A call keeps the object awake. */
  #caller: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS live_segments (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, text TEXT NOT NULL)",
    );
  }

  onStart() {
    // A fresh instance has no call, so a recording left open was cut off,
    // such as by a deploy. When it stopped isn't known, so it isn't counted.
    if (this.state.recordingSince !== null) {
      this.setState({ ...this.state, recordingSince: null });
      void this.#emit({ type: "recording", on: false });
    }
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

  /** For features, over RPC: what their rules need to know. */
  facts(): SessionFacts {
    const [{ segments }] = this.sql<{ segments: number }>`
      SELECT COUNT(*) AS segments FROM live_segments`;
    return {
      projectId: this.state.projectId,
      recordedSeconds: recordedSecondsAt(this.state, Date.now()),
      segments,
      recording: this.state.recordingSince !== null,
    };
  }

  /**
   * For features, over RPC: the segments after `afterId`, and as context,
   * up to `context` segments before them. `segmentsSince(0)` is the whole
   * transcript.
   */
  segmentsSince(afterId: number, context = 0): { context: Segment[]; segments: Segment[] } {
    const segments = this.sql<Segment>`
      SELECT id, at, text FROM live_segments WHERE id > ${afterId} ORDER BY id`;
    const before = context
      ? this.sql<Segment>`
          SELECT id, at, text FROM live_segments WHERE id <= ${afterId}
          ORDER BY id DESC LIMIT ${context}`.reverse()
      : [];
    return { context: before, segments };
  }

  /**
   * For `?debug=true`: one WAV window of an uploaded file, from the
   * Worker's replay route. The batch model transcribes it in place of the
   * live text. Windows come in order, one at a time, so the page waits for
   * each.
   */
  async replayWindow(projectId: string, wav: ArrayBuffer) {
    if (projectId !== this.state.projectId) throw new Error("Wrong project");
    if (this.state.recordingSince !== null) throw new Error("This session is recording");
    const segments = await new GeminiBatchSTT(vertex(this.env, BATCH_MODEL)).transcribe(
      new Uint8Array(wav),
    );
    for (const { text } of segments) this.#saveSegment(text);
    const seconds = Math.max(0, wav.byteLength - WAV_HEADER_BYTES) / WAV_BYTES_PER_SECOND;
    this.setState({ ...this.state, recordedSeconds: this.state.recordedSeconds + seconds });
    return { segments: segments.length };
  }

  createTranscriber(_connection: Connection): Transcriber {
    return new GeminiLiveSTT(vertex(this.env, LIVE_MODEL));
  }

  beforeCallStart(_connection: Connection) {
    // Recording only makes sense once the session knows its project, and
    // one phone records at a time.
    return this.state.projectId !== null && this.#caller === null;
  }

  onCallStart(connection: Connection) {
    // The clock starts at `micReady`: the page sends `start_call` before it
    // asks for the microphone, and the prompt can stay up a while.
    this.#caller = connection.id;
  }

  /**
   * Called by the recording page once the microphone is on, which
   * `useVoiceInput`'s `start()` waits for. Starts counting recorded time.
   */
  @callable()
  micReady() {
    if (this.#caller === null) throw new Error("This session isn't recording");
    if (this.state.recordingSince !== null) return;
    this.setState({ ...this.state, recordingSince: Date.now() });
    void this.#emit({ type: "recording", on: true });
  }

  onCallEnd(_connection: Connection) {
    this.#stopRecording();
  }

  onClose(connection: Connection) {
    // `onCallEnd` only runs on Stop, not when the page goes away mid-call.
    if (connection.id === this.#caller) this.#stopRecording();
  }

  /** Adds the recording that just ended to the total. */
  #stopRecording() {
    const { recordingSince, recordedSeconds } = this.state;
    this.#caller = null;
    if (recordingSince === null) return;
    this.setState({
      ...this.state,
      recordingSince: null,
      recordedSeconds: recordedSeconds + (Date.now() - recordingSince) / 1000,
    });
    void this.#emit({ type: "recording", on: false });
  }

  /**
   * Tells every feature agent of this session. A feature that fails to
   * hear it is logged, and never holds up the recording.
   */
  async #emit(event: SessionEvent) {
    const results = await Promise.allSettled(
      FEATURE_KEYS.map(async (key) => {
        const agent = await getAgentByName(this.env[FEATURES[key].binding], this.name);
        await agent.onSessionEvent(event);
      }),
    );
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        console.error(`[${this.name}] ${FEATURE_KEYS[i]} missed ${event.type}: ${result.reason}`);
      }
    });
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
