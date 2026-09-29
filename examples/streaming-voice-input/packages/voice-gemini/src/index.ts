/**
 * @cloudflare/voice-gemini — Gemini speech-to-text for the Cloudflare Agents
 * voice pipeline, over Vertex AI: `GeminiLiveSTT` streams over
 * `BidiGenerateContent`, and `GeminiBatchSTT` transcribes a whole recording
 * with `generateContent`. See README.md for options.
 */

import type {
  Transcriber,
  TranscriberSession,
  TranscriberSessionOptions
} from "agents/voice";
import {
  logVoiceError,
  toVoiceError,
  VoiceProviderError
} from "agents/voice/errors";

/**
 * Cap on audio buffered while the socket is still connecting (~30s at 16 kHz
 * mono s16le). If the connection never establishes (e.g. a bad token), this
 * keeps a dead session from buffering microphone audio unboundedly.
 */
const MAX_PENDING_BYTES = 960_000;

export interface GeminiLiveSTTOptions {
  /**
   * OAuth access token for Vertex AI, such as from
   * `gcloud auth print-access-token`. Tokens last about an hour, so pass a
   * function to fetch a fresh one for each session.
   */
  accessToken: string | (() => string | Promise<string>);
  /** Google Cloud project with Vertex AI enabled. */
  project: string;
  /**
   * Vertex location. Each model is only served from some locations.
   * @default "global"
   */
  location?: string;
  /** Model ID. @default "gemini-3.5-transcribe-live-preview" */
  model?: string;
  /** Tunes Gemini's voice activity detection. Unset fields keep its defaults. */
  activityDetection?: ActivityDetection;
}

/**
 * Gemini's `realtimeInputConfig.automaticActivityDetection`, which decides
 * where a turn starts and ends.
 */
export interface ActivityDetection {
  /** HIGH ends a turn more readily, which helps when noise hides pauses. */
  endOfSpeechSensitivity?: "END_SENSITIVITY_HIGH" | "END_SENSITIVITY_LOW";
  /** LOW makes background noise less likely to count as speech. */
  startOfSpeechSensitivity?: "START_SENSITIVITY_HIGH" | "START_SENSITIVITY_LOW";
  /** How long a pause has to last to end the turn. */
  silenceDurationMs?: number;
  /** How much speech must be heard before a turn starts. */
  prefixPaddingMs?: number;
}

/**
 * Gemini Live speech-to-text provider for the Agents voice pipeline.
 *
 * Each session opens its own WebSocket to Vertex, streams 16kHz PCM up, and
 * turns `inputTranscription` messages into interim and final transcripts.
 * Gemini's server-side voice activity detection decides where a turn ends,
 * so the mic has to keep streaming through the silence after speech.
 *
 * @example
 * ```typescript
 * import { Agent } from "agents";
 * import { withVoiceInput } from "agents/voice";
 * import { GeminiLiveSTT } from "@cloudflare/voice-gemini";
 *
 * const InputAgent = withVoiceInput(Agent);
 *
 * export class MyAgent extends InputAgent<Env> {
 *   transcriber = new GeminiLiveSTT({
 *     accessToken: this.env.GOOGLE_ACCESS_TOKEN,
 *     project: this.env.GOOGLE_CLOUD_PROJECT
 *   });
 * }
 * ```
 */
export class GeminiLiveSTT implements Transcriber {
  #options: GeminiLiveSTTOptions;

  constructor(options: GeminiLiveSTTOptions) {
    this.#options = options;
  }

  createSession(options?: TranscriberSessionOptions): TranscriberSession {
    // TODO: map `options.language` onto Gemini's config, once we know which
    // field the transcribe model honours.
    return new GeminiLiveSession(this.#options, options);
  }
}

/**
 * Underscore-prefixed: internal helper, exported only for unit tests.
 */
export function _buildSetupMessage(opts: GeminiLiveSTTOptions) {
  const location = opts.location ?? "global";
  const model = opts.model ?? "gemini-3.5-transcribe-live-preview";
  const { activityDetection } = opts;
  return {
    setup: {
      model: `projects/${opts.project}/locations/${location}/publishers/google/models/${model}`,
      generationConfig: { responseModalities: ["TEXT"] },
      inputAudioTranscription: {},
      ...(activityDetection && Object.keys(activityDetection).length
        ? {
            realtimeInputConfig: {
              automaticActivityDetection: activityDetection
            }
          }
        : {})
    }
  };
}

/** Underscore-prefixed: internal helper, exported only for unit tests. */
export function _buildConnectionUrl(location = "global"): string {
  const host =
    location === "global"
      ? "aiplatform.googleapis.com"
      : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
}

interface LiveServerMessage {
  setupComplete?: object;
  voiceActivity?: { type?: "ACTIVITY_START" | "ACTIVITY_END" };
  serverContent?: {
    // Everything heard so far this turn. Each one replaces the last.
    interimInputTranscription?: { text?: string };
    // The whole turn, once, after Gemini decides the speaker has stopped.
    inputTranscription?: { text?: string };
  };
}

class GeminiLiveSession implements TranscriberSession {
  #onInterim: TranscriberSessionOptions["onInterim"];
  #onSpeechStart: TranscriberSessionOptions["onSpeechStart"];
  #onUtterance: TranscriberSessionOptions["onUtterance"];
  #onFatalError: TranscriberSessionOptions["onFatalError"];

  #ws: WebSocket | null = null;
  #connected = false;
  #closed = false;
  #fatalReported = false;

  #pendingChunks: ArrayBuffer[] = [];
  #pendingBytes = 0;
  #pendingOverflowLogged = false;

  #ready: Promise<void>;
  #resolveReady: (() => void) | null = null;
  #rejectReady: ((reason: unknown) => void) | null = null;

  constructor(
    config: GeminiLiveSTTOptions,
    options?: TranscriberSessionOptions
  ) {
    this.#onInterim = options?.onInterim;
    this.#onSpeechStart = options?.onSpeechStart;
    this.#onUtterance = options?.onUtterance;
    this.#onFatalError = options?.onFatalError;
    this.#ready = new Promise<void>((resolve, reject) => {
      this.#resolveReady = resolve;
      this.#rejectReady = reject;
    });
    this.#ready.catch(() => {});
    this.#connect(config);
  }

  waitUntilReady(): Promise<void> {
    return this.#ready;
  }

  feed(chunk: ArrayBuffer): void {
    if (this.#closed) return;
    if (this.#connected && this.#ws) {
      this.#sendAudio(chunk);
      return;
    }
    if (this.#pendingBytes + chunk.byteLength > MAX_PENDING_BYTES) {
      if (!this.#pendingOverflowLogged) {
        this.#pendingOverflowLogged = true;
        logVoiceError({
          component: "GeminiLiveSTT",
          stage: "audio_buffer",
          message: "Gemini Live pending audio buffer full",
          error: new Error("Dropping audio until the socket connects")
        });
      }
      return;
    }
    this.#pendingBytes += chunk.byteLength;
    this.#pendingChunks.push(chunk);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#pendingChunks = [];
    this.#pendingBytes = 0;
    // Tell Gemini the audio has ended, as Deepgram's `CloseStream` does. The
    // SDK's `close()` can't wait, so a transcript sent in reply is dropped.
    if (this.#ws && this.#connected) {
      try {
        this.#ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      } catch {
        // ignore
      }
    }
    try {
      this.#ws?.close();
    } catch {
      // ignore close errors
    }
    this.#ws = null;
    this.#connected = false;
    this.#resolveReadiness();
  }

  async #connect(config: GeminiLiveSTTOptions): Promise<void> {
    try {
      const accessToken =
        typeof config.accessToken === "function"
          ? await config.accessToken()
          : config.accessToken;
      if (!accessToken) {
        throw new VoiceProviderError("Gemini Live access token is empty");
      }
      const resp = await fetch(_buildConnectionUrl(config.location), {
        headers: {
          Upgrade: "websocket",
          Authorization: `Bearer ${accessToken}`
        }
      });
      const ws = resp.webSocket;
      if (!ws) {
        throw new VoiceProviderError("Gemini Live did not return a WebSocket", {
          status: resp.status
        });
      }
      ws.accept();
      if (this.#closed) {
        ws.close();
        return;
      }
      this.#ws = ws;

      ws.addEventListener("message", (event) => this.#handleMessage(event));
      ws.addEventListener("close", (event) => {
        this.#connected = false;
        if (this.#closed) return;
        // Vertex puts the reason, such as "model not found" or an expired
        // token, in the close.
        // TODO: on `goAway` or the session time limit, resume with a
        // `sessionResumption` handle instead of failing.
        const reason = event.reason || "no reason given";
        const hint = /authentication credentials/i.test(reason)
          ? " The access token has expired or been revoked."
          : "";
        this.#fail(
          "websocket_close",
          new VoiceProviderError(
            `Gemini Live closed the connection (${event.code}): ${reason}${hint}`,
            {
            closeCode: event.code,
            closeReason: event.reason,
              wasClean: event.wasClean
            }
          )
        );
      });
      ws.addEventListener("error", (event) => {
        this.#connected = false;
        this.#fail(
          "websocket",
          new Error("Gemini Live WebSocket error", { cause: event })
        );
      });

      ws.send(JSON.stringify(_buildSetupMessage(config)));
    } catch (error) {
      this.#fail(
        "connection",
        toVoiceError(error, "Gemini Live connection failed")
      );
    }
  }

  #sendAudio(chunk: ArrayBuffer) {
    this.#ws?.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            mimeType: "audio/pcm;rate=16000",
            data: arrayBufferToBase64(chunk)
          }
        }
      })
    );
  }

  async #handleMessage(event: MessageEvent) {
    // Vertex sends its JSON as binary frames, which arrive as a Blob or an
    // ArrayBuffer depending on the compatibility date.
    const data: unknown = event.data;
    let message: LiveServerMessage;
    try {
      const text =
        typeof data === "string"
          ? data
          : data instanceof Blob
            ? await data.text()
            : new TextDecoder().decode(data as ArrayBuffer);
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (this.#closed) return;

    if (message.setupComplete) {
      this.#connected = true;
      for (const chunk of this.#pendingChunks) this.#sendAudio(chunk);
      this.#pendingChunks = [];
      this.#pendingBytes = 0;
      this.#resolveReadiness();
      return;
    }

    if (message.voiceActivity?.type === "ACTIVITY_START") {
      this.#onSpeechStart?.();
    }

    const interim = message.serverContent?.interimInputTranscription?.text;
    if (interim) this.#onInterim?.(interim.trim());

    const final = message.serverContent?.inputTranscription?.text?.trim();
    if (final) this.#onUtterance?.(final);
  }

  #resolveReadiness(): void {
    const resolve = this.#resolveReady;
    if (!resolve) return;
    this.#resolveReady = null;
    this.#rejectReady = null;
    resolve();
  }

  #fail(stage: string, error: Error) {
    const reject = this.#rejectReady;
    this.#resolveReady = null;
    this.#rejectReady = null;
    reject?.(error);
    if (this.#closed || this.#fatalReported) return;
    this.#fatalReported = true;
    logVoiceError({
      component: "GeminiLiveSTT",
      stage,
      message: error.message,
      error
    });
    this.#onFatalError?.(error);
  }
}

export interface GeminiBatchSTTOptions {
  /** OAuth access token for Vertex AI, or a function that returns one. */
  accessToken: string | (() => string | Promise<string>);
  /** Google Cloud project with Vertex AI enabled. */
  project: string;
  /**
   * Vertex location. The transcribe model is only served from `global`.
   * @default "global"
   */
  location?: string;
  /** Model ID. @default "gemini-3.5-transcribe-preview" */
  model?: string;
}

export interface TranscribeOptions {
  /** Tell speakers apart. */
  diarize?: boolean;
}

/** One stretch of a batch transcript, by one speaker. */
export interface TranscriptSegment {
  /**
   * Numbered from 0, in the order speakers are first heard, or null when
   * not diarizing.
   */
  speaker: number | null;
  text: string;
}

/**
 * Gemini speech-to-text for a whole recording at once, over Vertex's
 * `generateContent`.
 *
 * It isn't a `Transcriber`: those stream, and the voice pipeline drops
 * anything a session sends after the call ends. Call `transcribe()` with
 * the recording once it's finished instead, such as from a `@callable()`.
 *
 * @example
 * ```typescript
 * const stt = new GeminiBatchSTT({
 *   accessToken: env.GOOGLE_ACCESS_TOKEN,
 *   project: env.GOOGLE_CLOUD_PROJECT
 * });
 * const segments = await stt.transcribe(wav, { diarize: true });
 * ```
 */
export class GeminiBatchSTT {
  #options: GeminiBatchSTTOptions;

  constructor(options: GeminiBatchSTTOptions) {
    this.#options = options;
  }

  /** Transcribes a WAV file. */
  async transcribe(
    wav: Uint8Array<ArrayBuffer>,
    options: TranscribeOptions = {}
  ): Promise<TranscriptSegment[]> {
    const config = this.#options;
    const accessToken =
      typeof config.accessToken === "function"
        ? await config.accessToken()
        : config.accessToken;
    if (!accessToken) {
      throw new VoiceProviderError("Gemini access token is empty");
    }
    const resp = await fetch(_buildGenerateContentUrl(config), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(
        _buildTranscribeRequest(arrayBufferToBase64(wav.buffer), options)
      )
    });
    if (!resp.ok) {
      // Vertex puts the reason, such as an expired token, in the body.
      const body = await resp.text();
      const error = new VoiceProviderError(
        `Gemini transcription failed (${resp.status}): ${body}`,
        { status: resp.status }
      );
      logVoiceError({
        component: "GeminiBatchSTT",
        stage: "request",
        message: error.message,
        error
      });
      throw error;
    }
    return _parseTranscribeResponse(await resp.json());
  }
}

/** Underscore-prefixed: internal helper, exported only for unit tests. */
export function _buildGenerateContentUrl(opts: GeminiBatchSTTOptions): string {
  const location = opts.location ?? "global";
  const model = opts.model ?? "gemini-3.5-transcribe-preview";
  const host =
    location === "global"
      ? "aiplatform.googleapis.com"
      : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1beta1/projects/${opts.project}/locations/${location}/publishers/google/models/${model}:generateContent`;
}

/**
 * Underscore-prefixed: internal helper, exported only for unit tests.
 * `audioTranscriptionConfig` is Vertex's `AudioTranscriptionConfig`.
 */
export function _buildTranscribeRequest(
  base64Wav: string,
  options: TranscribeOptions
) {
  return {
    contents: [
      {
        role: "user",
        parts: [{ inlineData: { mimeType: "audio/wav", data: base64Wav } }]
      }
    ],
    // Diarization needs VERBATIM, which is also the default.
    ...(options.diarize
      ? {
          generationConfig: {
            audioTranscriptionConfig: { mode: "VERBATIM", diarization: true }
          }
        }
      : {})
  };
}

interface GenerateContentResponse {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
        audioTranscription?: { text?: string; speakerLabel?: string };
      }[];
    };
  }[];
}

/**
 * Underscore-prefixed: internal helper, exported only for unit tests.
 * Each speaker's stretch comes back as its own part, labeled like `spk:0`.
 */
export function _parseTranscribeResponse(
  response: GenerateContentResponse
): TranscriptSegment[] {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  // Numbered by first appearance, whatever the labels look like.
  const speakers = new Map<string, number>();
  const segments: TranscriptSegment[] = [];
  for (const part of parts) {
    const text = (part.audioTranscription?.text ?? part.text ?? "").trim();
    if (!text) continue;
    const label = part.audioTranscription?.speakerLabel;
    let speaker: number | null = null;
    if (label !== undefined) {
      if (!speakers.has(label)) speakers.set(label, speakers.size);
      speaker = speakers.get(label)!;
    }
    segments.push({ speaker, text });
  }
  return segments;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
