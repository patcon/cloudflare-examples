/**
 * `GeminiBatchSTT`: speech-to-text for a finished recording, over Vertex AI's
 * `generateContent`.
 */

import { logVoiceError, VoiceProviderError } from "agents/voice/errors";
import { arrayBufferToBase64, resolveAccessToken, vertexHost, type VertexOptions } from "./vertex";

export interface GeminiBatchSTTOptions extends VertexOptions {
  /**
   * Model ID. `gemini-3.5-transcribe-preview` is only served from `global`.
   * @default "gemini-3.5-transcribe-preview"
   */
  model?: string;
}

export interface TranscribeOptions {
  /** Tell speakers apart. */
  diarize?: boolean;
  /**
   * The recording's format, such as `audio/webm` from a `MediaRecorder`.
   * @default "audio/wav"
   */
  mimeType?: string;
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

  /** Transcribes a recording, WAV unless `options.mimeType` says otherwise. */
  async transcribe(
    audio: Uint8Array<ArrayBuffer>,
    options: TranscribeOptions = {},
  ): Promise<TranscriptSegment[]> {
    const config = this.#options;
    const accessToken = await resolveAccessToken(config.accessToken, "Gemini");
    const resp = await fetch(_buildGenerateContentUrl(config), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(_buildTranscribeRequest(arrayBufferToBase64(audio.buffer), options)),
    });
    if (!resp.ok) {
      // Vertex puts the reason, such as an expired token, in the body.
      const body = await resp.text();
      const error = new VoiceProviderError(
        `Gemini transcription failed (${resp.status}): ${body}`,
        { status: resp.status },
      );
      logVoiceError({
        component: "GeminiBatchSTT",
        stage: "request",
        message: error.message,
        error,
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
  return `https://${vertexHost(location)}/v1beta1/projects/${opts.project}/locations/${location}/publishers/google/models/${model}:generateContent`;
}

/**
 * Underscore-prefixed: internal helper, exported only for unit tests.
 * `audioTranscriptionConfig` is Vertex's `AudioTranscriptionConfig`.
 */
export function _buildTranscribeRequest(base64Audio: string, options: TranscribeOptions) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: options.mimeType ?? "audio/wav",
              data: base64Audio,
            },
          },
        ],
      },
    ],
    // Diarization needs VERBATIM, which is also the default.
    ...(options.diarize
      ? {
          generationConfig: {
            audioTranscriptionConfig: { mode: "VERBATIM", diarization: true },
          },
        }
      : {}),
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
export function _parseTranscribeResponse(response: GenerateContentResponse): TranscriptSegment[] {
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
      speaker = speakers.get(label) ?? speakers.size;
      speakers.set(label, speaker);
    }
    segments.push({ speaker, text });
  }
  return segments;
}
