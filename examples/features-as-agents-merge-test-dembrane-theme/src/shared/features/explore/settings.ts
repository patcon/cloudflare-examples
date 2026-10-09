/** How Explore's replies are written, as the original's modes. */
export type ExploreMode = "summarize" | "brainstorm" | "custom";

/**
 * A project's Explore settings: whether it's on, and how replies are
 * written. What the project is about is in its general settings.
 */
export interface ExploreSettings {
  enabled: boolean;
  mode: ExploreMode;
  /** Used in `custom` mode. Empty falls back to the summarize template. */
  customPrompt: string;
}

export const DEFAULT_EXPLORE_SETTINGS: ExploreSettings = {
  enabled: true,
  mode: "summarize",
  customPrompt: "",
};

/** The longest custom prompt the settings page takes. Made up: the original has no limit. */
export const MAX_CUSTOM_PROMPT_CHARS = 4000;

// How other sessions go into a reply, shown on the settings page too.

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

/**
 * Tokens are estimated at this many characters each, since a Worker has no
 * tokenizer. The original counts tokens properly. About right for English.
 */
export const CHARS_PER_TOKEN = 4;

const MODES: ExploreMode[] = ["summarize", "brainstorm", "custom"];

/**
 * Checks a change from the settings page, which comes over the network, so
 * anything could be in it. Throws on a bad field, and drops unknown ones.
 */
export function checkSettingsChange(
  change: unknown,
  _settings?: ExploreSettings,
): Partial<ExploreSettings> {
  if (typeof change !== "object" || change === null) throw new Error("Expected an object");
  const c = change as Record<string, unknown>;
  const out: Partial<ExploreSettings> = {};
  if ("enabled" in c) {
    if (typeof c.enabled !== "boolean") throw new Error("enabled must be true or false");
    out.enabled = c.enabled;
  }
  if ("mode" in c) {
    if (!MODES.includes(c.mode as ExploreMode)) {
      throw new Error(`mode must be one of ${MODES.join(", ")}`);
    }
    out.mode = c.mode as ExploreMode;
  }
  if ("customPrompt" in c) {
    out.customPrompt = text(c.customPrompt, "customPrompt", MAX_CUSTOM_PROMPT_CHARS);
  }
  return out;
}

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${name} must be text`);
  if (value.length > max) throw new Error(`${name} is over ${max} characters`);
  return value;
}
