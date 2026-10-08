import { checkSettingsChange as checkVerify } from "./verify/settings";
import { DEFAULT_VERIFY_SETTINGS, type VerifySettings } from "./verify/topics";

/**
 * Every feature, by key. Adding one means a folder under `features/` on the
 * server, the page and here, a binding in `wrangler.jsonc`, and an entry
 * below. The key names the feature's slice of the project's settings.
 *
 * Pure data and checks, so the session, the project and the pages can all
 * import it without pulling in feature code.
 */
export const FEATURES = {
  verify: {
    label: "Verify",
    /** The Durable Object binding of the feature's agent, one per session. */
    binding: "VerifyAgent",
    defaults: DEFAULT_VERIFY_SETTINGS,
    checkSettingsChange: checkVerify,
  },
} as const;

export type FeatureKey = keyof typeof FEATURES;

/** A project's settings, one slice per feature. */
export interface ProjectSettings {
  verify: VerifySettings;
}

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export function isFeatureKey(key: unknown): key is FeatureKey {
  return typeof key === "string" && key in FEATURES;
}

/** The defaults, for a new project. */
export function defaultSettings(): ProjectSettings {
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, FEATURES[key].defaults]),
  ) as unknown as ProjectSettings;
}

/**
 * Fills in what a saved project lacks: a feature, or a setting, added since
 * it was saved. `initialState` only applies to a project with no state at
 * all. Returns null when nothing was missing.
 */
export function backfill(saved: object): ProjectSettings | null {
  let changed = false;
  const out = { ...saved } as Record<string, object | undefined>;
  for (const key of FEATURE_KEYS) {
    const defaults = FEATURES[key].defaults;
    const current = out[key] ?? {};
    if (Object.keys(defaults).some((k) => !(k in current))) {
      out[key] = { ...defaults, ...current };
      changed = true;
    }
  }
  return changed ? (out as unknown as ProjectSettings) : null;
}

/** Checks a change to one feature's settings, from the settings page. */
export function checkChange<K extends FeatureKey>(
  key: K,
  change: unknown,
  settings: ProjectSettings,
): ProjectSettings[K] {
  const check = FEATURES[key].checkSettingsChange as (
    change: unknown,
    current: ProjectSettings[K],
  ) => Partial<ProjectSettings[K]>;
  return { ...settings[key], ...check(change, settings[key]) };
}
