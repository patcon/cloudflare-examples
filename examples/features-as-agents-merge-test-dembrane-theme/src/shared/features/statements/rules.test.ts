import { describe, expect, it } from "vitest";
import { STATEMENTS_OFF, whyNotExtract } from "./rules";

describe("whyNotExtract", () => {
  const ready = { enabled: true, running: false, newSegments: 2 };

  it("allows a run with something new", () => {
    expect(whyNotExtract(ready)).toBeNull();
  });

  it("refuses when off, while running, or with nothing new", () => {
    expect(whyNotExtract({ ...ready, enabled: false })).toBe(STATEMENTS_OFF);
    expect(whyNotExtract({ ...ready, running: true })).toMatch(/running/);
    expect(whyNotExtract({ ...ready, newSegments: 0 })).toMatch(/Nothing new/);
  });
});
