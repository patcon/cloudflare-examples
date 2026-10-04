import { Agent, callable, getAgentByName, type Connection } from "agents";
import { withVoiceInput, type Transcriber } from "agents/voice";
import { GeminiBatchSTT, GeminiLiveSTT } from "@cloudflare/voice-gemini";
import { SLOW_AFTER_MS } from "../shared/constants";
import { isProjectId } from "../shared/ids";
import { isWriting, recordedSecondsAt, whyNotVerify, type VerifyStatus } from "../shared/rules";
import type { Topic } from "../shared/topics";
import { BATCH_MODEL, LIVE_MODEL, LOCATION, OUTCOME_MODEL } from "./models";
import { streamText } from "./verify/gemini";
import { generatePrompt, type Prompt } from "./verify/prompt";
import { buildTranscript } from "./verify/transcript";

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
  verifyStatus: VerifyStatus;
  /** The topic of the outcome being written, or last written. */
  verifyTopicKey: string | null;
  /** The outcome so far, while it streams. */
  verifyDraft: string;
  /** Why the last outcome failed, when `verifyStatus` is `failed`. */
  verifyError: string | null;
  /** The outcome made and not yet approved, if any. */
  pendingOutcome: Outcome | null;
  /** When the last new outcome was complete, for the cooldown. */
  lastVerifyAt: number | null;
}

export interface Segment {
  id: number;
  at: number;
  text: string;
}

/**
 * A document Verify wrote from the conversation. It keeps its own copy of
 * the topic's label and emoji, so it still shows after the topic is gone.
 *
 * A type, not an interface, so it fits `sql.exec`'s row type.
 */
export type Outcome = {
  id: number;
  topicKey: string;
  topicLabel: string;
  topicIcon: string;
  content: string;
  /** When the text was first saved, as the original's `date_created`. */
  createdAt: number;
  revisedAt: number | null;
  approvedAt: number | null;
};

/**
 * An `outcomes` row's columns, named as in `Outcome`. Written into the SQL,
 * so it goes through `ctx.storage.sql.exec`, as `this.sql` would bind it
 * as a value.
 */
const OUTCOME_COLUMNS = `id, topic_key AS topicKey, topic_label AS topicLabel,
  topic_icon AS topicIcon, content, created_at AS createdAt,
  revised_at AS revisedAt, approved_at AS approvedAt`;

/** What the session broadcasts, beside the voice pipeline's own messages. */
export type SessionMessage = { type: "segment"; segment: Segment };

/** 16kHz mono 16-bit WAV, as the replay page sends, after its 44-byte header. */
const WAV_BYTES_PER_SECOND = 16_000 * 2;
const WAV_HEADER_BYTES = 44;

const InputAgent = withVoiceInput(Agent);

/**
 * One recorded conversation, named by a random UUID. The recording phone
 * streams audio to it, and it keeps the live transcript, one segment per
 * utterance Gemini Live finalizes. It can be stopped and started again as
 * often as needed, and keeps adding to the same transcript.
 */
export class SessionAgent extends InputAgent<Env, SessionState> {
  initialState: SessionState = {
    projectId: null,
    recordingSince: null,
    recordedSeconds: 0,
    verifyStatus: "idle",
    verifyTopicKey: null,
    verifyDraft: "",
    verifyError: null,
    pendingOutcome: null,
    lastVerifyAt: null,
  };

  /** The connection that's recording. A call keeps the object awake. */
  #caller: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS live_segments (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, text TEXT NOT NULL)",
    );
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS outcomes (
        id INTEGER PRIMARY KEY, topic_key TEXT NOT NULL, topic_label TEXT NOT NULL,
        topic_icon TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL,
        revised_at INTEGER, approved_at INTEGER)`,
    );
  }

  onStart() {
    // A fresh instance has no call, so a recording left open was cut off,
    // such as by a deploy. When it stopped isn't known, so it isn't counted.
    if (this.state.recordingSince !== null) {
      this.setState({ ...this.state, recordingSince: null });
    }
    // Likewise an outcome that was being written.
    if (isWriting(this.state.verifyStatus)) {
      this.#verifyFailed("The outcome was cut off. Try again.");
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

  /**
   * Asks Gemini for an outcome on the topic. It returns once the outcome has
   * started: the text streams into `verifyDraft`, so every open page sees
   * it, and a page that reloads catches up. The finished outcome replaces
   * the pending one, whose row stays, unapproved, as in the original.
   */
  @callable()
  async verify(topicKey: string) {
    const { projectId } = this.state;
    if (!projectId) throw new Error("This session isn't in a project yet");
    const [{ segments }] = this.sql<{ segments: number }>`
      SELECT COUNT(*) AS segments FROM live_segments`;
    const reason = whyNotVerify({
      verifyStatus: this.state.verifyStatus,
      recordedSeconds: recordedSecondsAt(this.state, Date.now()),
      segments,
      lastVerifyAt: this.state.lastVerifyAt,
      now: Date.now(),
    });
    if (reason) throw new Error(reason);
    // Taken before the topic call below, so a second press while it's
    // waiting is refused.
    const before = this.state;
    this.setState({
      ...this.state,
      verifyStatus: "generating",
      verifyTopicKey: topicKey,
      verifyDraft: "",
      verifyError: null,
    });

    let topic: Topic;
    try {
      topic = await (await getAgentByName(this.env.ProjectAgent, projectId)).topic(topicKey);
    } catch (error) {
      this.setState({ ...this.state, ...pick(before) });
      throw error;
    }
    const prompt = generatePrompt(
      topic.prompt,
      projectId,
      this.#outcomes("ORDER BY id"),
      buildTranscript(this.listSegments()),
    );
    // Not awaited, so the call returns now. This keeps the object awake
    // until the outcome is done, even with no page connected.
    void this.keepAliveWhile(() => this.#generate(topic, prompt));
  }

  /** Streams the outcome into state, then saves it. Never throws. */
  async #generate(topic: Topic, prompt: Prompt) {
    const slow = setTimeout(() => {
      if (this.state.verifyStatus === "generating" && !this.state.verifyDraft) {
        this.setState({ ...this.state, verifyStatus: "slow" });
      }
    }, SLOW_AFTER_MS);
    try {
      let text = "";
      for await (const piece of streamText(this.#vertex(OUTCOME_MODEL), prompt)) {
        clearTimeout(slow);
        text += piece;
        this.setState({ ...this.state, verifyStatus: "generating", verifyDraft: text });
      }
      if (!text.trim()) throw new Error("Gemini sent an empty outcome");
      // Saved, and so dated, once the text is complete, as in the original.
      const now = Date.now();
      const [outcome] = this.ctx.storage.sql
        .exec<Outcome>(
          `INSERT INTO outcomes (topic_key, topic_label, topic_icon, content, created_at)
          VALUES (?, ?, ?, ?, ?) RETURNING ${OUTCOME_COLUMNS}`,
          topic.key,
          topic.label,
          topic.icon,
          text.trim(),
          now,
        )
        .toArray();
      console.log(`[${this.name}] Outcome ${outcome.id} on ${topic.key}`);
      this.setState({
        ...this.state,
        verifyStatus: "idle",
        verifyDraft: "",
        pendingOutcome: outcome,
        lastVerifyAt: now,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${this.name}] Outcome failed: ${message}`);
      this.#verifyFailed(message);
    } finally {
      clearTimeout(slow);
    }
  }

  /**
   * Leaves the pending outcome, from **Back**: its row stays, unapproved,
   * as when a new outcome replaces it. Also clears a failed outcome's error.
   */
  @callable()
  leaveOutcome() {
    if (isWriting(this.state.verifyStatus)) throw new Error("An outcome is being written");
    this.setState({
      ...this.state,
      pendingOutcome: null,
      verifyStatus: "idle",
      verifyError: null,
    });
  }

  /** Outcomes, with the rest of a query after `FROM outcomes`. */
  #outcomes(rest: string, ...bindings: SqlStorageValue[]): Outcome[] {
    return this.ctx.storage.sql
      .exec<Outcome>(`SELECT ${OUTCOME_COLUMNS} FROM outcomes ${rest}`, ...bindings)
      .toArray();
  }

  #verifyFailed(message: string) {
    this.setState({ ...this.state, verifyStatus: "failed", verifyDraft: "", verifyError: message });
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
    const segments = await new GeminiBatchSTT(this.#vertex(BATCH_MODEL)).transcribe(
      new Uint8Array(wav),
    );
    for (const { text } of segments) this.#saveSegment(text);
    const seconds = Math.max(0, wav.byteLength - WAV_HEADER_BYTES) / WAV_BYTES_PER_SECOND;
    this.setState({ ...this.state, recordedSeconds: this.state.recordedSeconds + seconds });
    return { segments: segments.length };
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

/** The Verify fields of the state, to put back when a call is refused. */
function pick({ verifyStatus, verifyTopicKey, verifyDraft, verifyError }: SessionState) {
  return { verifyStatus, verifyTopicKey, verifyDraft, verifyError };
}
