import { Liquid } from "liquidjs";
import brainstormTemplate from "../prompts/get_reply_brainstorm.en.jinja?raw";
import summarizeTemplate from "../prompts/get_reply_summarize.en.jinja?raw";
import systemTemplate from "../prompts/get_reply_system.en.jinja?raw";

/**
 * The reply prompt, ported from the dembrane portal's `reply.ts`. Its
 * `get_reply_*.en.jinja` templates are copied as they are, in English only.
 *
 * They're rendered with LiquidJS, whose `{{ }}` and `{% if %}` match the
 * Jinja these templates use. Nunjucks, which the original uses, compiles
 * templates with `new Function`, which Workers don't allow.
 */

export type ExploreMode = "summarize" | "brainstorm" | "custom";

/** A project's reply settings. */
export interface ReplySettings {
  mode: ExploreMode;
  /** Used in `custom` mode. Empty falls back to the summarize template. */
  customPrompt: string;
  /** What the project is about. */
  context: string;
}

export const DEFAULT_SETTINGS: ReplySettings = { mode: "summarize", customPrompt: "", context: "" };

// No HTML escaping, as Jinja doesn't escape .jinja files: transcripts
// go in as written.
const liquid = new Liquid();

/** Parses a template once, and renders it as Jinja would. */
function template(source: string) {
  const parsed = liquid.parse(source);
  // Jinja drops one trailing newline from each template.
  return (vars: Record<string, unknown> = {}) => liquid.renderSync(parsed, vars).replace(/\n$/, "");
}

const renderSystem = template(systemTemplate);
export const SUMMARIZE_PROMPT = template(summarizeTemplate)();
export const BRAINSTORM_PROMPT = template(brainstormTemplate)();

/** The mode a reply is written in: custom with no prompt summarizes, as in `reply.ts`. */
export function modeUsed(settings: ReplySettings): ExploreMode {
  return settings.mode === "custom" && !settings.customPrompt.trim() ? "summarize" : settings.mode;
}

/** The mode's own prompt, as `reply.ts` picks it. */
export function globalPrompt(settings: ReplySettings): string {
  const mode = modeUsed(settings);
  if (mode === "brainstorm") return BRAINSTORM_PROMPT;
  if (mode === "custom") return settings.customPrompt;
  return SUMMARIZE_PROMPT;
}

/**
 * The whole prompt. `current` and `others` are formatted with
 * `formatConversation`, and `others` kept within its limit.
 */
export function buildPrompt(settings: ReplySettings, current: string, others: string): string {
  return renderSystem({
    PROJECT_DESCRIPTION: settings.context,
    GLOBAL_PROMPT: globalPrompt(settings),
    OTHER_TRANSCRIPTS: others,
    MAIN_USER_TRANSCRIPT: current,
    // Removing personal details is out of scope here.
    pii_redaction: false,
  });
}
