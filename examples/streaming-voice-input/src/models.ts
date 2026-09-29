/**
 * The speech-to-text models to compare. Each one is also the name of its
 * own agent instance, so the page picks a model by connecting to it.
 */
export const MODELS = {
  "nova-3": { label: "Workers AI Nova 3" },
  "gemini-3.5-transcribe-live-preview": {
    label: "Gemini 3.5 Transcribe Live (preview)",
    // Vertex only serves this model from the global endpoint.
    location: "global"
  }
} as const;

export type ModelId = keyof typeof MODELS;

export function isModelId(id: string | undefined): id is ModelId {
  return !!id && id in MODELS;
}
