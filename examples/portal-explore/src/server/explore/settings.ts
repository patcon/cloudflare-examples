import { MAX_CONTEXT_CHARS, MAX_CUSTOM_PROMPT_CHARS } from "../../shared/constants";
import { DEFAULT_SETTINGS, type ExploreMode, type ReplySettings } from "./prompt";

/** A project's Explore settings: whether it's on, and how replies are written. */
export interface ProjectSettings extends ReplySettings {
  exploreEnabled: boolean;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  ...DEFAULT_SETTINGS,
  exploreEnabled: true,
};

const MODES: ExploreMode[] = ["summarize", "brainstorm", "custom"];

/**
 * Checks a change from the settings page, which comes over the network, so
 * anything could be in it. Throws on a bad field, and drops unknown ones.
 */
export function checkSettingsChange(change: unknown): Partial<ProjectSettings> {
  if (typeof change !== "object" || change === null) throw new Error("Expected an object");
  const c = change as Record<string, unknown>;
  const out: Partial<ProjectSettings> = {};
  if ("exploreEnabled" in c) {
    if (typeof c.exploreEnabled !== "boolean")
      throw new Error("exploreEnabled must be true or false");
    out.exploreEnabled = c.exploreEnabled;
  }
  if ("mode" in c) {
    if (!MODES.includes(c.mode as ExploreMode)) {
      throw new Error(`mode must be one of ${MODES.join(", ")}`);
    }
    out.mode = c.mode as ExploreMode;
  }
  if ("customPrompt" in c)
    out.customPrompt = text(c.customPrompt, "customPrompt", MAX_CUSTOM_PROMPT_CHARS);
  if ("context" in c) out.context = text(c.context, "context", MAX_CONTEXT_CHARS);
  return out;
}

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${name} must be text`);
  if (value.length > max) throw new Error(`${name} is over ${max} characters`);
  return value;
}
