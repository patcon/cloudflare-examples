import { describe, expect, it } from "vitest";
import { filterProposed, MAX_LENGTH } from "../src/extract/filter";
import type { Proposed } from "../src/extract/types";

const p = (text: string): Proposed => ({
  text,
  quote: "",
  rationale: "",
  scores: { clarity: 3, divisiveness: 3, novelty: 3 }
});
const reasons = (texts: string[], existing: string[] = []) =>
  filterProposed(texts.map(p), existing).map((f) => f.reason);

describe("filterProposed", () => {
  it("keeps plain statements", () => {
    expect(reasons(["Bike lanes make the street safer for everyone."])).toEqual([null]);
  });

  it("drops empty, too long and questions", () => {
    expect(reasons(["", "x".repeat(MAX_LENGTH + 1), "Should we ban cars?"])).toEqual([
      "empty",
      "too_long",
      "question"
    ]);
  });

  it("drops what's already in the project, ignoring case and punctuation", () => {
    expect(reasons(["bike lanes make the street safer for everyone"], ["Bike lanes make the street safer for everyone."])).toEqual(["duplicate"]);
  });

  it("drops near duplicates within one batch, keeping the first", () => {
    expect(
      reasons([
        "The city should fund more bike lanes downtown.",
        "The city should fund more bike lanes downtown now.",
        "Parking should cost more downtown."
      ])
    ).toEqual([null, "duplicate", null]);
  });

  it("doesn't count a dropped one as seen", () => {
    expect(reasons(["Is rent too high?", "Is rent too high"])).toEqual(["question", null]);
  });
});
