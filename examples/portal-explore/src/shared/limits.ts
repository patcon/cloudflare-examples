/**
 * The largest recording diarized at the end. The Gemini Developer API capped
 * an inline request at 20MB, and base64 adds a third; Vertex doesn't state
 * its own cap. At the recording page's 24kbps, the duration limit below
 * comes first.
 */
export const MAX_RECORDING_BYTES = 14 * 1024 * 1024;

/**
 * The longest recording the transcription model diarizes: 30 minutes, when
 * speaker diarization is on.
 * https://ai.google.dev/gemini-api/docs/transcribe
 */
export const MAX_DIARIZED_SECONDS = 30 * 60;

/** Earlier segments each extraction run sees as context. A replay can pick its own. */
export const CONTEXT_SEGMENTS = 3;
/** The most a replay can pick. */
export const MAX_CONTEXT_SEGMENTS = 20;
