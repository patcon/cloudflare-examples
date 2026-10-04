import { describe, expect, it } from "vitest";
import { buildTranscript } from "../src/server/verify/transcript";

describe("buildTranscript", () => {
  it("orders segments by time, one per line", () => {
    const segments = [
      { at: 3, text: "third" },
      { at: 1, text: "first" },
    ];
    expect(buildTranscript(segments)).toBe("first\nthird\n");
  });

  it("is empty with no segments", () => {
    expect(buildTranscript([])).toBe("");
  });
});
