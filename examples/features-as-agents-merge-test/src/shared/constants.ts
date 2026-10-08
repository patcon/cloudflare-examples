/**
 * The limits and timings every feature shares, grouped by where each one
 * comes from. Each feature keeps its own beside its rules and settings.
 */

// From the original dembrane portal (~/repos/dembrane-echo/dembrane), with
// the file each comes from.

/**
 * Explore and Verify turn on after this much recording.
 * `frontend/src/components/participant/ParticipantConversationAudioContent.tsx`:
 * `VERIFICATION_BANNER_THRESHOLD_SECONDS`.
 */
export const MIN_RECORDED_SECONDS = 60;

/**
 * With nothing back from Gemini by now, the page says it's still working.
 * `platform/packages/conversations/src/v1/reply.ts`: `HIGH_LOAD_AFTER_MS`.
 */
export const SLOW_AFTER_MS = 20 * 1000;

// From polis-statement-extraction.

/** How much of a replayed file, for `?debug=true`, each batch transcription covers. */
export const REPLAY_WINDOW_SECONDS = 300;

/** A 5-minute 16kHz WAV window is about 9.6MB. This allows some more. */
export const MAX_REPLAY_WINDOW_BYTES = 12 * 1024 * 1024;
