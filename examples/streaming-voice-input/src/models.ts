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
  }
} as const;

export type ModelId = keyof typeof MODELS;

export function isModelId(id: string | undefined): id is ModelId {
  return !!id && id in MODELS;
}

/** Each agent instance's settings, kept in its state and edited by the page. */
export interface Settings {
  /** Gemini's voice activity detection. Empty keeps Gemini's defaults. */
  activityDetection: ActivityDetection;
}
