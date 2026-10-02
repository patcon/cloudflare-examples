import { Agent, callable, getAgentByName, type Connection } from "agents";
import { withVoiceInput, type Transcriber } from "agents/voice";
import { GeminiBatchSTT, GeminiLiveSTT } from "@cloudflare/voice-gemini";
import { isProjectId } from "../shared/ids";
import { SLOW_AFTER_MS } from "../shared/limits";
import { recordedSecondsAt, whyNotExplore, type ReplyStatus } from "../shared/rules";
import { streamReply } from "./explore/gemini";
import { buildPrompt, DEFAULT_SETTINGS } from "./explore/prompt";
import { buildTranscript, formatConversation } from "./explore/transcript";
import { BATCH_MODEL, LIVE_MODEL, LOCATION, REPLY_MODEL } from "./models";

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
  replyStatus: ReplyStatus;
  /** The reply so far, while it streams. */
  replyDraft: string;
  /** Why the last reply failed, when `replyStatus` is `failed`. */
  replyError: string | null;
  /** When the last reply finished, for the cooldown. */
  lastReplyAt: number | null;
}

export interface Segment {
  id: number;
  at: number;
  text: string;
}

/** A finished reply, written into the transcript at the time it was saved. */
export interface Reply {
  id: number;
  at: number;
  text: string;
}

/** What the session broadcasts, beside the voice pipeline's own messages. */
export type SessionMessage =
  | { type: "segment"; segment: Segment }
  | { type: "reply"; reply: Reply };

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
    replyStatus: "idle",
    replyDraft: "",
    replyError: null,
    lastReplyAt: null,
  };

  /** The connection that's recording. A call keeps the object awake. */
  #caller: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS live_segments (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, text TEXT NOT NULL)",
    );
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS replies (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, text TEXT NOT NULL)",
    );
  }

  onStart() {
    // A fresh instance has no call, so a recording left open was cut off,
    // such as by a deploy. When it stopped isn't known, so it isn't counted.
    if (this.state.recordingSince !== null) {
      this.setState({ ...this.state, recordingSince: null });
    }
    // Likewise a reply that was streaming.
    if (["thinking", "streaming", "slow"].includes(this.state.replyStatus)) {
      this.#replyFailed("The reply was cut off. Try again.");
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

  @callable()
  listReplies(): Reply[] {
    return this.sql<Reply>`SELECT id, at, text FROM replies ORDER BY id`;
  }

  /**
   * Asks Gemini for a short reply to the conversation so far. It returns
   * once the reply has started: the text streams into `replyDraft`, so every
   * open page sees it, and a page that reloads catches up.
   */
  @callable()
  explore() {
    const [{ segments }] = this.sql<{ segments: number }>`
      SELECT COUNT(*) AS segments FROM live_segments`;
    const reason = whyNotExplore({
      recordedSeconds: recordedSecondsAt(this.state, Date.now()),
      segments,
      lastReplyAt: this.state.lastReplyAt,
      replyStatus: this.state.replyStatus,
      now: Date.now(),
    });
    if (reason) throw new Error(reason);
    this.setState({ ...this.state, replyStatus: "thinking", replyDraft: "", replyError: null });
    // Not awaited, so the call returns now. This keeps the object awake
    // until the reply is done, even with no page connected.
    void this.keepAliveWhile(() => this.#generateReply());
  }

  /** Streams the reply into state, then saves it. Never throws. */
  async #generateReply() {
    const slow = setTimeout(() => {
      if (this.state.replyStatus === "thinking") {
        this.setState({ ...this.state, replyStatus: "slow" });
      }
    }, SLOW_AFTER_MS);
    try {
      const prompt = buildPrompt(DEFAULT_SETTINGS, this.#formatted(), "");
      let text = "";
      for await (const piece of streamReply(this.#vertex(REPLY_MODEL), prompt)) {
        clearTimeout(slow);
        text += piece;
        this.setState({ ...this.state, replyStatus: "streaming", replyDraft: text });
      }
      if (!text.trim()) throw new Error("Gemini sent an empty reply");
      this.#saveReply(text.trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${this.name}] Reply failed: ${message}`);
      this.#replyFailed(message);
    } finally {
      clearTimeout(slow);
    }
  }

  /**
   * The one place a finished reply lands. Speaking it, with `speakAll`
   * after a switch to `withVoice`, would go here.
   */
  #saveReply(text: string) {
    const [reply] = this.sql<Reply>`
      INSERT INTO replies (at, text) VALUES (${Date.now()}, ${text})
      RETURNING id, at, text`;
    console.log(`[${this.name}] Replied: "${text}"`);
    this.#notify({ type: "reply", reply });
    this.setState({
      ...this.state,
      replyStatus: "idle",
      replyDraft: "",
      lastReplyAt: reply.at,
    });
  }

  #replyFailed(message: string) {
    this.setState({ ...this.state, replyStatus: "failed", replyDraft: "", replyError: message });
  }

  /** This session's transcript, with its replies written in, for a prompt. */
  #formatted(): string {
    return formatConversation(
      sessionLabel(this.name),
      buildTranscript(this.listSegments(), this.listReplies()),
    );
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
    return this.state.projectId !== null && this.state.recordingSince === null;
  }

  onCallStart(connection: Connection) {
    this.#caller = connection.id;
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

/** How a session is named in a prompt. */
export function sessionLabel(sessionId: string) {
  return `Session ${sessionId.slice(0, 8)}`;
}
