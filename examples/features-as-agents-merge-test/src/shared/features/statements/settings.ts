/** A project's statement extraction settings. */
export interface StatementsSettings {
  enabled: boolean;
  /** What the conversations are about, given to the extraction prompt. */
  topic: string;
}

export const DEFAULT_STATEMENTS_SETTINGS: StatementsSettings = { enabled: true, topic: "" };

/** The longest topic. From polis-statement-extraction. */
export const MAX_TOPIC_CHARS = 500;

/**
 * Checks a change from the settings page, which comes over the network, so
 * anything could be in it. Throws on a bad field, and drops unknown ones.
 */
export function checkSettingsChange(
  change: unknown,
  _settings?: StatementsSettings,
): Partial<StatementsSettings> {
  if (typeof change !== "object" || change === null) throw new Error("Expected an object");
  const c = change as Record<string, unknown>;
  const out: Partial<StatementsSettings> = {};
  if ("enabled" in c) {
    if (typeof c.enabled !== "boolean") throw new Error("enabled must be true or false");
    out.enabled = c.enabled;
  }
  if ("topic" in c) {
    if (typeof c.topic !== "string") throw new Error("topic must be text");
    if (c.topic.length > MAX_TOPIC_CHARS) {
      throw new Error(`topic is over ${MAX_TOPIC_CHARS} characters`);
    }
    out.topic = c.topic;
  }
  return out;
}
