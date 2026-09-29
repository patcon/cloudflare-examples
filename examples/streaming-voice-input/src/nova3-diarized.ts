import type {
  Transcriber,
  TranscriberSession,
  TranscriberSessionOptions
} from "agents/voice";
import { logVoiceError, toVoiceError } from "agents/voice/errors";
import { speakerMarker } from "./speakers";

interface Nova3Word {
  word: string;
  punctuated_word?: string;
  speaker?: number;
}

interface Nova3Message {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: { alternatives?: { transcript?: string; words?: Nova3Word[] }[] };
}

/**
 * Workers AI Nova 3 with diarization. It works like `WorkersAINova3STT`
 * from `agents/voice`, with the same settings, except that it asks Nova 3 to
 * tell speakers apart and marks each speaker change in the text. See
 * `./speakers.ts`.
 */
export class WorkersAINova3DiarizedSTT implements Transcriber {
  #ai: Ai;

  constructor(ai: Ai) {
    this.#ai = ai;
  }

  createSession(options?: TranscriberSessionOptions): TranscriberSession {
    return new Nova3DiarizedSession(this.#ai, options);
  }
}

class Nova3DiarizedSession implements TranscriberSession {
  #options: TranscriberSessionOptions;
  #ws: WebSocket | null = null;
  #closed = false;
  #fatalReported = false;
  #pending: ArrayBuffer[] = [];
  #ready: Promise<void>;
  // Words of the utterance so far, from results Nova 3 has made final.
  #finalWords: Nova3Word[] = [];

  constructor(ai: Ai, options: TranscriberSessionOptions = {}) {
    this.#options = options;
    this.#ready = this.#connect(ai, options.language ?? "en");
    this.#ready.catch(() => {});
  }

  waitUntilReady() {
    return this.#ready;
  }

  feed(chunk: ArrayBuffer) {
    if (this.#closed) return;
    if (this.#ws) this.#ws.send(chunk);
    else this.#pending.push(chunk);
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#pending = [];
    try {
      this.#ws?.close();
    } catch {}
    this.#ws = null;
  }

  async #connect(ai: Ai, language: string) {
    try {
      // The same settings as WorkersAINova3STT, plus diarize.
      const input = {
        encoding: "linear16",
        sample_rate: "16000",
        language,
        interim_results: "true",
        vad_events: "true",
        endpointing: "300",
        utterance_end_ms: "1000",
        smart_format: "true",
        punctuate: "true",
        diarize: "true"
      };
      // The binding's types only cover the HTTP API, not the WebSocket one.
      const resp = (await ai.run("@cf/deepgram/nova-3", input as never, {
        websocket: true
      } as never)) as unknown as { webSocket?: WebSocket };
      const ws = resp.webSocket;
      if (!ws) throw new Error("Workers AI Nova-3 STT did not return a WebSocket");
      ws.accept();
      if (this.#closed) {
        ws.close();
        return;
      }
      this.#ws = ws;
      ws.addEventListener("message", (event) => this.#handleMessage(event));
      ws.addEventListener("close", () => {
        this.#ws = null;
        this.#reportFatal(
          new Error("Workers AI Nova-3 STT WebSocket closed unexpectedly")
        );
      });
      ws.addEventListener("error", (event) => {
        this.#reportFatal(
          new Error("Workers AI Nova-3 STT WebSocket error", { cause: event })
        );
      });
      for (const chunk of this.#pending) ws.send(chunk);
      this.#pending = [];
    } catch (error) {
      const voiceError = toVoiceError(error, "Nova-3 STT connection failed");
      this.#reportFatal(voiceError);
      throw voiceError;
    }
  }

  #reportFatal(error: Error) {
    if (this.#closed || this.#fatalReported) return;
    this.#fatalReported = true;
    logVoiceError({
      component: "Nova3DiarizedSTT",
      stage: "websocket",
      message: error.message,
      error
    });
    this.#options.onFatalError?.(error);
  }

  #handleMessage(event: MessageEvent) {
    if (this.#closed || typeof event.data !== "string") return;
    let data: Nova3Message;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (data.type !== "Results") return;
    const words = data.channel?.alternatives?.[0]?.words ?? [];

    if (data.is_final) this.#finalWords.push(...words);
    if (data.speech_final) {
      const text = markSpeakers(this.#finalWords);
      this.#finalWords = [];
      if (text) this.#options.onUtterance?.(text);
    } else if (!data.is_final && words.length > 0) {
      this.#options.onInterim?.(markSpeakers([...this.#finalWords, ...words]));
    }
  }
}

/** Joins words into text, with a marker wherever the speaker changes. */
function markSpeakers(words: Nova3Word[]) {
  let text = "";
  let speaker: number | undefined;
  for (const word of words) {
    if (word.speaker !== undefined && word.speaker !== speaker) {
      speaker = word.speaker;
      text += `${text ? " " : ""}${speakerMarker(speaker)}`;
    }
    text += `${text ? " " : ""}${word.punctuated_word ?? word.word}`;
  }
  return text;
}
