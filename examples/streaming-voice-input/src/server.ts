import { Agent, callable, routeAgentRequest, type Connection } from "agents";
import { withVoiceInput, type Transcriber } from "agents/voice";
import {
  afterStop,
  isModelId,
  isStreaming,
  type ModelId,
  type Settings
} from "./models";
import { BATCH, STREAMING } from "./providers";
import { AudioRecorder } from "./recording";
import { speakerMarker } from "./speakers";

// For batch models: hears the audio, so it's recorded, but says nothing.
// The page asks for the transcript with `transcribeLastAudio()` once you stop.
const silentTranscriber: Transcriber = {
  createSession: () => ({ feed() {}, close() {} })
};

const InputAgent = withVoiceInput(Agent);

/**
 * Voice-to-text input agent.
 *
 * Transcribes speech with the model named by this instance's name (the
 * page's model picker), or Nova 3 for any other name.
 * No TTS or LLM pipeline — each utterance is transcribed and sent back to the
 * client immediately.
 *
 * The page edits this instance's settings through the agent's state, and can
 * download the last session's audio from `…/last-audio.wav`. For batch
 * models, and when another model diarizes, the page calls
 * `transcribeLastAudio()` once you stop.
 */
export class VoiceInputAgent extends InputAgent<Env, Settings> {
  initialState: Settings = { activityDetection: {} };
  recorder = new AudioRecorder(this.ctx.storage.sql);

  get model(): ModelId {
    return isModelId(this.name) ? this.name : "nova-3";
  }

  // Called when recording starts, so only the chosen model is connected, and
  // only while recording.
  createTranscriber(_connection: Connection): Transcriber {
    const { model } = this;
    return this.recorder.wrap(
      isStreaming(model)
        ? STREAMING[model](this.env, this.state)
        : silentTranscriber
    );
  }

  onTranscript(text: string, _connection: Connection) {
    console.log(`[${this.model}] Transcribed: "${text}"`);
  }

  /**
   * Transcribes the last recording with the models `afterStop()` picks,
   * marking each speaker change when diarizing. See `./speakers.ts`.
   */
  @callable()
  async transcribeLastAudio(): Promise<string> {
    const plan = afterStop(this.model, this.state);
    if (!plan) throw new Error(`${this.model} doesn't transcribe after you stop`);
    const wav = this.recorder.wav();
    if (!wav) return "";
    const batchModel = (plan.diarized ?? plan.original)!;
    const segments = await BATCH[batchModel](this.env).transcribe(wav, {
      diarize: !!plan.diarized
    });
    const text = segments
      .map(({ speaker, text }) =>
        speaker === null ? text : `${speakerMarker(speaker)} ${text}`
      )
      .join(" ");
    const via = batchModel === this.model ? "" : ` → ${batchModel}`;
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
