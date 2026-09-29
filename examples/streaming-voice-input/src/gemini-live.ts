import type {
  Transcriber,
  TranscriberSession,
  TranscriberSessionOptions
} from "agents/voice";

export interface GeminiLiveSTTOptions {
  /** OAuth access token, such as from `gcloud auth print-access-token`. */
  accessToken: string;
  /** Google Cloud project with Vertex AI enabled. */
  project: string;
  /** Vertex location, such as "global" or "europe-west1". */
  location: string;
  /** Model ID, such as "gemini-3.5-transcribe-live-preview". */
  model: string;
}

/**
 * Speech-to-text over Vertex AI's Gemini Live API (`BidiGenerateContent`).
 *
 * Each session opens its own WebSocket to Vertex, streams 16kHz PCM up, and
 * turns `inputTranscription` messages into interim and final transcripts.
 * Gemini's server-side voice activity detection decides where a turn ends,
 * so the mic has to keep streaming through the silence after speech.
 */
export class GeminiLiveSTT implements Transcriber {
  #options: GeminiLiveSTTOptions;

  constructor(options: GeminiLiveSTTOptions) {
    this.#options = options;
  }

  createSession(options?: TranscriberSessionOptions): TranscriberSession {
    return new GeminiLiveSession(this.#options, options);
  }
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
    if (this.#connected && this.#ws) this.#sendAudio(chunk);
    else this.#pendingChunks.push(chunk);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#pendingChunks = [];
    try {
      this.#ws?.close();
    } catch {}
    this.#ws = null;
    this.#connected = false;
    this.#resolveReady?.();
  }

  async #connect(config: GeminiLiveSTTOptions): Promise<void> {
    const { accessToken, project, location, model } = config;
    try {
      if (!accessToken) {
        throw new Error(
          "GOOGLE_ACCESS_TOKEN isn't set. Run `pnpm google-token` to put one in .dev.vars."
        );
      }
      const host =
        location === "global"
          ? "aiplatform.googleapis.com"
          : `${location}-aiplatform.googleapis.com`;
      const resp = await fetch(
        `https://${host}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`,
        {
          headers: {
            Upgrade: "websocket",
            Authorization: `Bearer ${accessToken}`
          }
        }
      );
      const ws = resp.webSocket;
      if (!ws) {
        throw new Error(
          `Gemini Live refused the WebSocket: ${resp.status} ${await resp.text()}`
        );
      }
      ws.accept();
      if (this.#closed) {
        ws.close();
        return;
      }
      this.#ws = ws;

      ws.addEventListener("message", (event) => this.#handleMessage(event));
      ws.addEventListener("close", (event) => {
        if (this.#closed) return;
        // Vertex puts the reason, such as "model not found", in the close.
        this.#fail(
          new Error(
            `Gemini Live closed the connection (${event.code}): ${event.reason || "no reason given"}`
          )
        );
      });
      ws.addEventListener("error", () => {
        this.#fail(new Error("Gemini Live connection error"));
      });

      ws.send(
        JSON.stringify({
          setup: {
            model: `projects/${project}/locations/${location}/publishers/google/models/${model}`,
            generationConfig: { responseModalities: ["TEXT"] },
            inputAudioTranscription: {}
          }
        })
      );
    } catch (error) {
      this.#fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  #sendAudio(chunk: ArrayBuffer) {
    this.#ws?.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            mimeType: "audio/pcm;rate=16000",
            data: Buffer.from(chunk).toString("base64")
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
      this.#resolveReady?.();
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

  #fail(error: Error) {
    this.#rejectReady?.(error);
    this.#rejectReady = null;
    if (this.#closed || this.#fatalReported) return;
    this.#fatalReported = true;
    this.#onFatalError?.(error);
  }
}
