import { describe, expect, it } from "vitest";
import { parseProposed } from "../src/server/extract/parse";

describe("parseProposed", () => {
  it("reads statements, trimming and clamping scores", () => {
    expect(
      parseProposed({
        statements: [
          { text: " Rent is too high. ", quote: "rent's crazy", rationale: "r", clarity: 9, divisiveness: "2", novelty: 0 }
        ]
      })
    ).toEqual([
      {
        text: "Rent is too high.",
        quote: "rent's crazy",
        rationale: "r",
        scores: { clarity: 5, divisiveness: 2, novelty: 1 }
      }
    ]);
  });

  it("skips entries without text, and gives missing scores 0", () => {
    expect(parseProposed({ statements: [{ quote: "q" }, { text: "A." }] })).toEqual([
      { text: "A.", quote: "", rationale: "", scores: { clarity: 0, divisiveness: 0, novelty: 0 } }
    ]);
  });

  it("accepts an empty list", () => {
    expect(parseProposed({ statements: [] })).toEqual([]);
  });

  it("throws without a list", () => {
    expect(() => parseProposed({})).toThrow();
  });
});
