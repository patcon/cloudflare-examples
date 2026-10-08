import { describe, expect, it } from "vitest";
import { recordedSecondsAt } from "./rules";

describe("recordedSecondsAt", () => {
  it("adds a recording still going to the total", () => {
    expect(recordedSecondsAt({ recordedSeconds: 30, recordingSince: null }, 5000)).toBe(30);
    expect(recordedSecondsAt({ recordedSeconds: 30, recordingSince: 1000 }, 5000)).toBe(34);
  });
});
