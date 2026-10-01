/**
 * The largest recording diarized at the end. Vertex caps an inline request
 * at 20MB, and base64 adds a third. At the recording page's 24kbps, this is
 * about 80 minutes.
 */
export const MAX_RECORDING_BYTES = 14 * 1024 * 1024;

/** Earlier segments each extraction run sees as context. A replay can pick its own. */
export const CONTEXT_SEGMENTS = 3;
/** The most a replay can pick. */
export const MAX_CONTEXT_SEGMENTS = 20;
