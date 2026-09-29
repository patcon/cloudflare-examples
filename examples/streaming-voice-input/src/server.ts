import { Agent, routeAgentRequest, type Connection } from "agents";
import {
  withVoiceInput,
  WorkersAINova3STT,
  type Transcriber
} from "agents/voice";
import { GeminiLiveSTT } from "./gemini-live";
import { isModelId, MODELS, type ModelId, type Settings } from "./models";
import { AudioRecorder } from "./recording";

const InputAgent = withVoiceInput(Agent);

/**
 * Voice-to-text input agent.
 *
 * Transcribes speech in real time with the model named by this instance's
 * name (the page's model picker), or `STT_MODEL` for the default instance.
 * No TTS or LLM pipeline — each utterance is transcribed and sent back to the
 * client immediately.
 *
 * The page edits this instance's settings through the agent's state, and can
 * download the last session's audio from `…/last-audio.wav`.
 */
export class VoiceInputAgent extends InputAgent<Env, Settings> {
  initialState: Settings = { activityDetection: {} };
  transcriber = new WorkersAINova3STT(this.env.AI);
  recorder = new AudioRecorder(this.ctx.storage.sql);

  get model(): ModelId {
    if (isModelId(this.name)) return this.name;
    return isModelId(this.env.STT_MODEL) ? this.env.STT_MODEL : "nova-3";
  }

  // Called when recording starts, so only the chosen model is connected, and
  // only while recording.
  createTranscriber(_connection: Connection): Transcriber | null {
    const model = this.model;
    if (model === "nova-3") return this.recorder.wrap(this.transcriber);
    console.log(
      `[${model}] Starting with voice detection`,
      JSON.stringify(this.state.activityDetection)
    );
    return this.recorder.wrap(
      new GeminiLiveSTT({
        accessToken: this.env.GOOGLE_ACCESS_TOKEN,
        project: this.env.GOOGLE_CLOUD_PROJECT,
        location: MODELS[model].location,
        model,
        activityDetection: this.state.activityDetection
      })
    );
  }

  onTranscript(text: string, _connection: Connection) {
    console.log(`[${this.model}] Transcribed: "${text}"`);
  }

  onRequest(request: Request) {
    if (new URL(request.url).pathname.endsWith("/last-audio.wav")) {
      const wav = this.recorder.wav();
      if (!wav) return new Response("Nothing recorded yet", { status: 404 });
      return new Response(wav, {
        headers: {
          "Content-Type": "audio/wav",
          "Content-Disposition": `attachment; filename="${this.model}-last-audio.wav"`
        }
      });
    }
    return new Response("Not found", { status: 404 });
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
};
