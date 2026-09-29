import type { ActivityDetection } from "@cloudflare/voice-gemini";

/**
 * The speech-to-text models to compare. Each one is also the name of its
 * own agent instance, so the page picks a model by connecting to it.
 *
 * - `streams`: transcribes as you speak. Otherwise it transcribes the whole
 *   recording once you stop.
 * - `diarizes`: can tell speakers apart itself. Otherwise `DIARIZER` does it
 *   once you stop.
 *
 * Each model's provider is set up in `./providers.ts`.
 */
export const MODELS = {
  "nova-3": {
    label: "Workers AI Nova 3 (streaming)",
    provider: "workers-ai",
    streams: true,
    diarizes: true
  },
  flux: {
    label: "Workers AI Flux (streaming)",
    provider: "workers-ai",
    streams: true,
    diarizes: false
  },
  "gemini-3.5-transcribe-live-preview": {
    label: "Gemini 3.5 Transcribe Live (streaming)",
    provider: "gemini",
    // Vertex only serves this model from the global endpoint.
    location: "global",
    streams: true,
    diarizes: false
  },
  "gemini-3.5-transcribe-preview": {
    label: "Gemini 3.5 Transcribe (batch)",
    provider: "gemini",
    location: "global",
    streams: false,
    diarizes: true
  }
} as const;

export type ModelId = keyof typeof MODELS;

/** The models that transcribe as you speak. */
export type StreamingModelId = {
  [M in ModelId]: (typeof MODELS)[M]["streams"] extends true ? M : never;
}[ModelId];

/** The models that transcribe a finished recording. */
export type BatchModelId = Exclude<ModelId, StreamingModelId>;

/** Tells speakers apart, once you stop, for models that can't. */
export const DIARIZER = "gemini-3.5-transcribe-preview" satisfies BatchModelId;
MODELS[DIARIZER].diarizes satisfies true;

export function isModelId(id: string | undefined): id is ModelId {
  return !!id && id in MODELS;
}

export function isStreaming(model: ModelId): model is StreamingModelId {
  return MODELS[model].streams;
}

/** Which batch models transcribe the recording once you stop. */
export interface AfterStop {
  /** The model's own transcript, for a batch model. */
  original?: BatchModelId;
  /** The diarized transcript, when diarizing and the model doesn't stream it. */
  diarized?: BatchModelId;
}

/**
 * What's transcribed once you stop, or null when the text you saw while
 * recording is final.
 */
export function afterStop(model: ModelId, settings: Settings): AfterStop | null {
  const plan: AfterStop = {};
  if (isStreaming(model)) {
    if (settings.diarize && !MODELS[model].diarizes) plan.diarized = DIARIZER;
  } else {
    plan.original = model;
    if (settings.diarize) {
      plan.diarized = MODELS[model].diarizes ? model : DIARIZER;
    }
  }
  return plan.original || plan.diarized ? plan : null;
}

/** Each agent instance's settings, kept in its state and edited by the page. */
export interface Settings {
  /** Gemini's voice segment detection. Empty keeps Gemini's defaults. */
  activityDetection: ActivityDetection;
  /**
   * Whether to tell speakers apart. Nova 3 does it as it streams, and a batch
   * model that can does it itself. Any other model sends the recording to
   * `DIARIZER` once you stop.
   */
  diarize?: boolean;
}
