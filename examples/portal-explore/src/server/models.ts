/**
 * The Gemini models this example uses, all on Vertex AI. Vertex only serves
 * the transcription models from the global endpoint.
 */
export const LOCATION = "global";

/** Streams the live transcript while a session records. */
export const LIVE_MODEL = "gemini-3.5-transcribe-live-preview";

/** Transcribes each window of a replayed file, for `?debug=true`. */
export const BATCH_MODEL = "gemini-3.5-transcribe-preview";
