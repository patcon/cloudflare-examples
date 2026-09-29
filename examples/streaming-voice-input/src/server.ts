import { Agent, callable, routeAgentRequest, type Connection } from "agents";
import {
  withVoiceInput,
  WorkersAIFluxSTT,
  WorkersAINova3STT,
  type Transcriber
} from "agents/voice";
import { GeminiBatchSTT, GeminiLiveSTT } from "@cloudflare/voice-gemini";
import {
  BATCH_MODEL,
  isModelId,
  MODELS,
  transcribesAfterStop,
  type ModelId,
  type Settings
} from "./models";
import { WorkersAINova3DiarizedSTT } from "./nova3-diarized";
import { AudioRecorder } from "./recording";
import { speakerMarker } from "./speakers";

// For the batch model: hears the audio, so it's recorded, but says nothing.
// The page asks for the transcript with `transcribeLastAudio()` once you stop.
const silentTranscriber: Transcriber = {
  createSession: () => ({ feed() {}, close() {} })
};

const InputAgent = withVoiceInput(Agent);

/**
 * Voice-to-text input agent.
 *
 * Transcribes speech in real time with the model named by this instance's
 * name (the page's model picker), or Nova 3 for any other name.
 * No TTS or LLM pipeline — each utterance is transcribed and sent back to the
 * client immediately.
 *
 * The page edits this instance's settings through the agent's state, and can
 * download the last session's audio from `…/last-audio.wav`. For the batch
 * model, and Gemini Live when diarizing, the page calls
 * `transcribeLastAudio()` once you stop.
 */
export class VoiceInputAgent extends InputAgent<Env, Settings> {
  initialState: Settings = { activityDetection: {} };
  transcriber = new WorkersAINova3STT(this.env.AI);
  flux = new WorkersAIFluxSTT(this.env.AI);
  recorder = new AudioRecorder(this.ctx.storage.sql);

  get model(): ModelId {
    return isModelId(this.name) ? this.name : "nova-3";
  }

  // Called when recording starts, so only the chosen model is connected, and
  // only while recording.
  createTranscriber(_connection: Connection): Transcriber | null {
    const model = this.model;
    if (model === "nova-3") {
      return this.recorder.wrap(
        this.state.diarize
          ? new WorkersAINova3DiarizedSTT(this.env.AI)
          : this.transcriber
      );
    }
    if (model === "flux") return this.recorder.wrap(this.flux);
    if (model === BATCH_MODEL) return this.recorder.wrap(silentTranscriber);
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

  /**
   * Transcribes the last recording with the batch model, marking each
   * speaker change when diarizing. See `./speakers.ts`.
   */
  @callable()
  async transcribeLastAudio(): Promise<string> {
    if (!transcribesAfterStop(this.model, this.state)) {
      throw new Error(`${this.model} doesn't transcribe after you stop`);
    }
    const wav = this.recorder.wav();
    if (!wav) return "";
    const stt = new GeminiBatchSTT({
      accessToken: this.env.GOOGLE_ACCESS_TOKEN,
      project: this.env.GOOGLE_CLOUD_PROJECT,
      location: MODELS[BATCH_MODEL].location
    });
    const segments = await stt.transcribe(wav, { diarize: this.state.diarize });
    const text = segments
      .map(({ speaker, text }) =>
        speaker === null ? text : `${speakerMarker(speaker)} ${text}`
      )
      .join(" ");
    const via = this.model === BATCH_MODEL ? "" : ` → ${BATCH_MODEL}`;
    console.log(`[${this.model}${via}] Transcribed: "${text}"`);
    return text;
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
