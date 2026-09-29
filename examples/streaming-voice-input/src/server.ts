import { Agent, routeAgentRequest, type Connection } from "agents";
import {
  withVoiceInput,
  WorkersAINova3STT,
  type Transcriber
} from "agents/voice";
import { GeminiLiveSTT } from "./gemini-live";
import { isModelId, MODELS, type ModelId } from "./models";

const InputAgent = withVoiceInput(Agent);

/**
 * Voice-to-text input agent.
 *
 * Transcribes speech in real time with the model named by this instance's
 * name (the page's model picker), or `STT_MODEL` for the default instance.
 * No TTS or LLM pipeline — each utterance is transcribed and sent back to the
 * client immediately.
 */
export class VoiceInputAgent extends InputAgent<Env> {
  transcriber = new WorkersAINova3STT(this.env.AI);

  get model(): ModelId {
    if (isModelId(this.name)) return this.name;
    return isModelId(this.env.STT_MODEL) ? this.env.STT_MODEL : "nova-3";
  }

  // Called when recording starts, so only the chosen model is connected, and
  // only while recording.
  createTranscriber(_connection: Connection): Transcriber | null {
    const model = this.model;
    if (model === "nova-3") return null;
    return new GeminiLiveSTT({
      accessToken: this.env.GOOGLE_ACCESS_TOKEN,
      project: this.env.GOOGLE_CLOUD_PROJECT,
      location: MODELS[model].location,
      model
    });
  }

  onTranscript(text: string, _connection: Connection) {
    console.log(`[${this.model}] Transcribed: "${text}"`);
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
