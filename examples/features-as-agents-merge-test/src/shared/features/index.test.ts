import { describe, expect, it } from "vitest";
import { backfill, checkChange, defaultSettings } from ".";

describe("project settings", () => {
  it("fills in a feature, or a setting, missing from a saved project", () => {
    const defaults = defaultSettings();
    expect(backfill(defaults)).toBeNull();
    expect(backfill({})).toEqual(defaults);
    const { enabled: _, ...rest } = defaults.verify;
    expect(backfill({ verify: { ...rest, selectedTopics: ["gems"] } })).toEqual({
      ...defaults,
      verify: { ...defaults.verify, selectedTopics: ["gems"] },
    });
  });

  it("checks a change with the feature's own check, and keeps the rest", () => {
    const settings = defaultSettings();
    expect(checkChange("verify", { enabled: false, admin: true }, settings)).toEqual({
      ...settings.verify,
      enabled: false,
    });
    expect(() => checkChange("verify", { enabled: "no" }, settings)).toThrow(/true or false/);
  });
});
