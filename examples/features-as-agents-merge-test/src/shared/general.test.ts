import { describe, expect, it } from "vitest";
import { checkGeneralChange, MAX_CONTEXT_CHARS } from "./general";

describe("checkGeneralChange", () => {
  it("keeps the fields it knows, and drops the rest", () => {
    expect(checkGeneralChange({ name: " Utrecht ", portalTitle: "Hi", admin: true })).toEqual({
      name: "Utrecht",
      portalTitle: "Hi",
    });
  });

  it("refuses an empty name, but not empty optional fields", () => {
    expect(() => checkGeneralChange({ name: "  " })).toThrow(/needs a name/);
    expect(checkGeneralChange({ context: "", portalTitle: "", portalContent: "" })).toEqual({
      context: "",
      portalTitle: "",
      portalContent: "",
    });
  });

  it("refuses wrong types and text over the limit", () => {
    expect(() => checkGeneralChange({ context: 5 })).toThrow(/must be text/);
    expect(() => checkGeneralChange({ context: "x".repeat(MAX_CONTEXT_CHARS + 1) })).toThrow(
      /over/,
    );
    expect(() => checkGeneralChange(null)).toThrow(/object/);
  });
});
