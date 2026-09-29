import type { ActivityDetection } from "@cloudflare/voice-gemini";

/**
 * The speech-to-text models to compare. Each one is also the name of its
 * own agent instance, so the page picks a model by connecting to it.
 */
export const MODELS = {
  "nova-3": { label: "Workers AI Nova 3", provider: "workers-ai" },
  flux: { label: "Workers AI Flux", provider: "workers-ai" },
  "gemini-3.5-transcribe-live-preview": {
    label: "Gemini 3.5 Transcribe Live (preview)",
    provider: "gemini",
    // Vertex only serves this model from the global endpoint.
    location: "global"
  },
  "gemini-3.5-transcribe-preview": {
    label: "Gemini 3.5 Transcribe (preview, after you stop)",
    provider: "gemini",
    location: "global",
    // Transcribes the whole recording once you stop, rather than streaming.
    batch: true
  }
} as const;

export type ModelId = keyof typeof MODELS;

/** Transcribes a finished recording, for the batch model and diarized Gemini Live. */
export const BATCH_MODEL = "gemini-3.5-transcribe-preview" satisfies ModelId;

export function isModelId(id: string | undefined): id is ModelId {
  return !!id && id in MODELS;
}

/**
 * Whether the model's text comes from `BATCH_MODEL` after you stop: always for
 * the batch model, and for Gemini Live when diarizing.
 */
export function transcribesAfterStop(model: ModelId, settings: Settings) {
  const info = MODELS[model];
  if ("batch" in info) return true;
  return info.provider === "gemini" && !!settings.diarize;
}

/** Each agent instance's settings, kept in its state and edited by the page. */
export interface Settings {
  /** Gemini's voice activity detection. Empty keeps Gemini's defaults. */
  activityDetection: ActivityDetection;
  /**
   * Whether to tell speakers apart. Nova 3 does it as it streams. The Gemini
   * models do it by sending the recording to `BATCH_MODEL` once you stop.
   */
  diarize?: boolean;
}
