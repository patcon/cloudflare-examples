/**
 * The Gemini models this example uses, all on Vertex AI. Vertex only serves
 * the transcription models from the global endpoint.
 */
export const LOCATION = "global";

/** Streams the live transcript while a session records. */
export const LIVE_MODEL = "gemini-3.5-transcribe-live-preview";

/**
 * Pulls statements out of the transcript, answering in JSON.
 * TODO: confirm against Vertex's model list.
 */
export const EXTRACT_MODEL = "gemini-3.5-flash";
