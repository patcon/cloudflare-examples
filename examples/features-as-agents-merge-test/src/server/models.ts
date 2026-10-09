/**
 * The Gemini models this example uses, all on Vertex AI. Vertex only serves
 * the transcription models from the global endpoint.
 */
export const LOCATION = "global";

/** Streams the live transcript while a session records. */
export const LIVE_MODEL = "gemini-3.5-transcribe-live-preview";

/** Transcribes each window of a replayed file, for `?debug=true`. */
export const BATCH_MODEL = "gemini-3.5-transcribe-preview";

/** Writes Explore's replies. */
export const REPLY_MODEL = "gemini-3.5-flash";

/** Writes and revises Verify's outcomes. */
export const OUTCOME_MODEL = "gemini-3.5-flash";

/** Pulls candidate statements out of the transcript, answering in JSON. */
export const EXTRACT_MODEL = "gemini-3.5-flash";

/** Vertex options for a model, from the Worker's secrets. */
export function vertex(env: Env, model: string) {
  return {
    accessToken: env.GOOGLE_ACCESS_TOKEN,
    project: env.GOOGLE_CLOUD_PROJECT,
    location: LOCATION,
    model,
  };
}
