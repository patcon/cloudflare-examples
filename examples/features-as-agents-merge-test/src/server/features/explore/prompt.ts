import type { ExploreMode, ExploreSettings } from "../../../shared/features/explore/settings";
import { projectDescription, type ProjectDetails } from "../../../shared/general";
import { template } from "../../lib/liquid";
import brainstormTemplate from "./prompts/get_reply_brainstorm.en.jinja?raw";
import summarizeTemplate from "./prompts/get_reply_summarize.en.jinja?raw";
import systemTemplate from "./prompts/get_reply_system.en.jinja?raw";

/**
 * The reply prompt, ported from the dembrane portal's `reply.ts`. Its
 * `get_reply_*.en.jinja` templates are copied as they are, in English only.
 */

/** What the prompt needs of the project's settings. */
export type ReplySettings = Pick<ExploreSettings, "mode" | "customPrompt">;

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
export function buildPrompt(
  settings: ReplySettings,
  project: ProjectDetails,
  current: string,
  others: string,
): string {
  return renderSystem({
    PROJECT_DESCRIPTION: projectDescription(project),
    GLOBAL_PROMPT: globalPrompt(settings),
    OTHER_TRANSCRIPTS: others,
    MAIN_USER_TRANSCRIPT: current,
    // Removing personal details is out of scope here.
    pii_redaction: false,
  });
}
