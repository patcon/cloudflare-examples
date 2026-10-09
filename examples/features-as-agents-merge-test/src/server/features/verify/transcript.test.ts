import { describe, expect, it } from "vitest";
import { buildTranscript, feedbackSince } from "./transcript";

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

describe("feedbackSince", () => {
  const segments = [
    { at: Date.UTC(2026, 9, 4, 12, 0, 0), text: "first" },
    { at: Date.UTC(2026, 9, 4, 12, 0, 10), text: "made v1 here" },
    { at: Date.UTC(2026, 9, 4, 12, 0, 20), text: "add the date" },
    { at: Date.UTC(2026, 9, 4, 12, 0, 30), text: "and the place" },
  ];

  it("takes only segments after the time, each with its time", () => {
    expect(feedbackSince(segments, Date.UTC(2026, 9, 4, 12, 0, 10))).toBe(
      "[2026-10-04T12:00:20.000Z] add the date\n[2026-10-04T12:00:30.000Z] and the place",
    );
  });

  it("gives a second revision only the speech after the first", () => {
    const v1 = Date.UTC(2026, 9, 4, 12, 0, 10);
    const revised = Date.UTC(2026, 9, 4, 12, 0, 25);
    expect(feedbackSince(segments, v1)).toContain("add the date");
    expect(feedbackSince(segments, revised)).toBe("[2026-10-04T12:00:30.000Z] and the place");
  });

  it("is empty with nothing new", () => {
    expect(feedbackSince(segments, Date.UTC(2026, 9, 4, 12, 1))).toBe("");
  });
});
