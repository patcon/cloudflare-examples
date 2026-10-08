import { describe, expect, it } from "vitest";
import { checkSettingsChange, MAX_CONTEXT_CHARS } from "../src/shared/features/explore/settings";

describe("checkSettingsChange", () => {
  it("keeps the fields it knows, and drops the rest", () => {
    expect(checkSettingsChange({ mode: "brainstorm", enabled: false, admin: true })).toEqual({
      mode: "brainstorm",
      enabled: false,
    });
  });

  it("refuses a mode it doesn't know", () => {
    expect(() => checkSettingsChange({ mode: "chaos" })).toThrow(/mode must be one of/);
  });

  it("refuses wrong types and text over the limit", () => {
    expect(() => checkSettingsChange({ enabled: "yes" })).toThrow(/true or false/);
    expect(() => checkSettingsChange({ context: 5 })).toThrow(/must be text/);
    expect(() => checkSettingsChange({ context: "x".repeat(MAX_CONTEXT_CHARS + 1) })).toThrow(
      /over/,
    );
    expect(() => checkSettingsChange(null)).toThrow(/object/);
  });
});
