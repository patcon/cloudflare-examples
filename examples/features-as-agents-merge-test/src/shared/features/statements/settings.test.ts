import { describe, expect, it } from "vitest";
import { checkSettingsChange } from "./settings";

describe("checkSettingsChange", () => {
  it("keeps the fields it knows, and drops the rest", () => {
    expect(checkSettingsChange({ topic: "Housing", enabled: false, admin: true })).toEqual({
      enabled: false,
    });
  });

  it("refuses wrong types", () => {
    expect(() => checkSettingsChange({ enabled: "yes" })).toThrow(/true or false/);
    expect(() => checkSettingsChange(null)).toThrow(/object/);
  });
});
