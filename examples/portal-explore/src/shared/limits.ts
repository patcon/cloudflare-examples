/** Explore turns on after this much recording, as in the original portal. */
export const MIN_RECORDED_SECONDS = 60;

/** The wait between replies, as in the original portal. */
export const COOLDOWN_MS = 2 * 60 * 1000;

/** With nothing back from Gemini by now, the page says it's still working. */
export const SLOW_AFTER_MS = 20 * 1000;

/** The longest project context the settings page takes. */
export const MAX_CONTEXT_CHARS = 2000;

/** The longest custom prompt the settings page takes. */
export const MAX_CUSTOM_PROMPT_CHARS = 4000;
