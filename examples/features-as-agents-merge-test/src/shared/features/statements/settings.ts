/**
 * A project's statement extraction settings. What the extraction prompt
 * is told about the project is in its general settings.
 */
export interface StatementsSettings {
  enabled: boolean;
}

export const DEFAULT_STATEMENTS_SETTINGS: StatementsSettings = { enabled: true };

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
  return out;
}
