import { describe, expect, it } from "vitest";
import { buildTranscript } from "../src/server/verify/transcript";

describe("buildTranscript", () => {
  it("orders segments by time, trimmed, one per line", () => {
    const segments = [
      { at: 3, text: "third " },
      { at: 2, text: "  " },
      { at: 1, text: "first" },
    ];
    expect(buildTranscript(segments)).toBe("first\nthird");
  });

  it("is empty with no segments", () => {
    expect(buildTranscript([])).toBe("");
  });
});
