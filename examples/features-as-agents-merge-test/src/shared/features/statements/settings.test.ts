import { describe, expect, it } from "vitest";
import { checkSettingsChange, MAX_TOPIC_CHARS } from "./settings";

describe("checkSettingsChange", () => {
  it("keeps the fields it knows, and drops the rest", () => {
    expect(checkSettingsChange({ topic: "Housing", enabled: false, admin: true })).toEqual({
      topic: "Housing",
      enabled: false,
    });
  });

  it("refuses wrong types and a topic over the limit", () => {
    expect(() => checkSettingsChange({ enabled: "yes" })).toThrow(/true or false/);
    expect(() => checkSettingsChange({ topic: 5 })).toThrow(/text/);
    expect(() => checkSettingsChange({ topic: "x".repeat(MAX_TOPIC_CHARS + 1) })).toThrow(/over/);
  });
});
