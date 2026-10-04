/**
 * Every limit and timing in this example, in one place, grouped by where
 * each one comes from.
 */

// From the original dembrane portal (~/repos/dembrane-echo/dembrane), with
// the file each comes from.

/**
 * Explore turns on after this much recording.
 * `frontend/src/components/participant/ParticipantConversationAudioContent.tsx`:
 * `VERIFICATION_BANNER_THRESHOLD_SECONDS`.
 */
export const MIN_RECORDED_SECONDS = 60;

/**
 * The wait between replies.
 * `frontend/src/components/participant/refine/hooks/useRefineSelectionCooldown.ts`:
 * `COOLDOWN_DURATION`. The original counts it from the button press, kept
 * in the browser; here it's counted on the server, from when the reply
 * finished.
 */
export const COOLDOWN_MS = 2 * 60 * 1000;

/**
 * With nothing back from Gemini by now, the page says it's still working.
 * `platform/packages/conversations/src/v1/reply.ts`: `HIGH_LOAD_AFTER_MS`.
 */
export const SLOW_AFTER_MS = 20 * 1000;

/**
 * The most the other sessions add to a prompt, in all.
 * `platform/packages/conversations/src/v1/reply.ts`: `TOKEN_LIMIT`.
 */
export const OTHERS_TOKEN_LIMIT = 80_000;

/**
 * Each other session is cut to about this many tokens.
 * `platform/packages/conversations/src/v1/reply.ts`: `TARGET_TOKENS_PER_CONV`.
 */
export const TOKENS_PER_SESSION = 4_000;

// From polis-statement-extraction, which this example is based on.

/** How much of a replayed file, for `?debug=true`, each batch transcription covers. */
export const REPLAY_WINDOW_SECONDS = 300;

/** A 5-minute 16kHz WAV window is about 9.6MB. This allows some more. */
export const MAX_REPLAY_WINDOW_BYTES = 12 * 1024 * 1024;

// Made up for this example. The original has no equivalent.

/**
 * Tokens are estimated at this many characters each, since a Worker has no
 * tokenizer. The original counts tokens properly. About right for English.
 */
export const CHARS_PER_TOKEN = 4;

/** The longest project context the settings page takes. The original has no limit. */
export const MAX_CONTEXT_CHARS = 2000;

/** The longest custom prompt the settings page takes. The original has no limit. */
export const MAX_CUSTOM_PROMPT_CHARS = 4000;
