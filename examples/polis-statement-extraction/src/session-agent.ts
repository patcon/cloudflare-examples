import { Agent, callable, getAgentByName, type Connection } from "agents";
import { withVoiceInput, type Transcriber } from "agents/voice";
import { GeminiLiveSTT } from "@cloudflare/voice-gemini";
import { isProjectId } from "./ids";
import { LIVE_MODEL, LOCATION } from "./models";

export interface SessionState {
  /** Set by the first page to connect, from its URL. */
  projectId: string | null;
  recording: boolean;
}

export interface Segment {
  id: number;
  at: number;
  text: string;
}

/** What the session broadcasts, beside the voice pipeline's own messages. */
export type SessionMessage = { type: "segment"; segment: Segment };

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
    this.broadcast(
      JSON.stringify({ type: "segment", segment } satisfies SessionMessage)
    );
  }
}
