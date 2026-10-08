import {
  MAX_TOPIC_ICON_CHARS,
  MAX_TOPIC_LABEL_CHARS,
  MAX_TOPIC_PROMPT_CHARS,
} from "../../shared/constants";
import { allTopics, type Topic, type TopicSettings } from "../../shared/topics";

/**
 * Checks a change from the settings page, which comes over the network, so
 * anything could be in it. Throws on a bad field, and drops unknown ones.
 * Selected keys must be topics of the project; they're kept in topic order.
 */
export function checkSettingsChange(
  change: unknown,
  settings: TopicSettings,
): Partial<TopicSettings> {
  const c = object(change);
  const out: Partial<TopicSettings> = {};
  if ("verifyEnabled" in c) {
    if (typeof c.verifyEnabled !== "boolean") {
      throw new Error("verifyEnabled must be true or false");
    }
    out.verifyEnabled = c.verifyEnabled;
  }
  if ("selectedTopics" in c) {
    const keys = c.selectedTopics;
    if (!Array.isArray(keys) || !keys.every((k) => typeof k === "string")) {
      throw new Error("selectedTopics must be a list of keys");
    }
    const all = allTopics(settings).map((t) => t.key);
    const unknown = keys.find((k) => !all.includes(k));
    if (unknown !== undefined) throw new Error(`Not a topic: ${unknown}`);
    out.selectedTopics = all.filter((k) => keys.includes(k));
  }
  return out;
}

/** Checks a new topic from the settings page, with the original's limits. */
export function checkNewTopic(input: unknown): Omit<Topic, "key"> {
  const c = object(input);
  return {
    label: text(c.label, "label", MAX_TOPIC_LABEL_CHARS, true),
    icon: text(c.icon ?? "", "icon", MAX_TOPIC_ICON_CHARS, false),
    prompt: text(c.prompt, "prompt", MAX_TOPIC_PROMPT_CHARS, true),
  };
}

/**
 * A custom topic's key, as the original makes it: a slug of the label, then
 * a dash and 8 random characters.
 */
export function topicKey(label: string, random = crypto.randomUUID()): string {
  return `${slugify(label)}-${random.replace(/-/g, "").slice(-8)}`;
}

/**
 * The original's `slugify`: lowercase letters, digits, `_` and dashes; runs
 * of spaces or underscores become one dash; at most 60 characters.
 */
export function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}_\s-]/gu, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s ? [...s].slice(0, 60).join("") : "custom";
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string, max: number, required: boolean): string {
  if (typeof value !== "string") throw new Error(`${name} must be text`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new Error(`${name} is empty`);
  if ([...trimmed].length > max) throw new Error(`${name} is over ${max} characters`);
  return trimmed;
}
