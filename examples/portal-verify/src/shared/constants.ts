/**
 * Every limit and timing in this example, in one place, grouped by where
 * each one comes from.
 */

// From the original dembrane portal (~/repos/dembrane-echo/dembrane), with
// the file each comes from.

/**
 * Verify turns on after this much recording.
 * `frontend/src/components/participant/ParticipantConversationAudioContent.tsx`:
 * `VERIFICATION_BANNER_THRESHOLD_SECONDS`.
 */
export const MIN_RECORDED_SECONDS = 60;

/**
 * The wait between new outcomes.
 * `frontend/src/components/participant/refine/hooks/useRefineSelectionCooldown.ts`:
 * `COOLDOWN_DURATION`. The original counts it from the button press, kept
 * in the browser, once generation succeeds; here it's counted on the
 * server, from when the last outcome was complete.
 */
export const VERIFY_COOLDOWN_MS = 2 * 60 * 1000;

/**
 * The wait after a revision, or after a Revise with no new feedback.
 * `frontend/src/components/participant/verify/VerifyArtefact.tsx`:
 * `useCooldown(30 * 1000)`. Kept in the browser there; here on the server.
 */
export const REVISE_COOLDOWN_MS = 30 * 1000;

/**
 * With nothing back from Gemini by now, the page says it's still working.
 * `platform/packages/conversations/src/v1/reply.ts`: `HIGH_LOAD_AFTER_MS`.
 */
export const SLOW_AFTER_MS = 20 * 1000;

// From polis-statement-extraction, which this example is based on.

/** How much of a replayed file, for `?debug=true`, each batch transcription covers. */
export const REPLAY_WINDOW_SECONDS = 300;

/** A 5-minute 16kHz WAV window is about 9.6MB. This allows some more. */
export const MAX_REPLAY_WINDOW_BYTES = 12 * 1024 * 1024;
