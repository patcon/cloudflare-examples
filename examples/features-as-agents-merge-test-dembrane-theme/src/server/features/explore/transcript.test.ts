import { describe, expect, it } from "vitest";
import {
  buildTranscript,
  contextText,
  estimateTokens,
  formatConversation,
  formatOther,
  planContext,
} from "./transcript";

describe("buildTranscript", () => {
  it("orders segments and replies by time, and writes in each reply", () => {
    const segments = [
      { at: 1, text: "first" },
      { at: 3, text: "third" },
    ];
    const replies = [{ at: 2, text: "a reply" }];
    expect(buildTranscript(segments, replies)).toBe(
      "first\n[Assistant Reply at this point in time: a reply]\nthird\n",
    );
  });

  it("puts a segment before a reply at the same time", () => {
    expect(buildTranscript([{ at: 1, text: "said" }], [{ at: 1, text: "reply" }])).toBe(
      "said\n[Assistant Reply at this point in time: reply]\n",
    );
  });
});

describe("formatOther", () => {
  it("keeps a session within the budget whole", () => {
    expect(formatOther("A", "short", 100)).toEqual({
      text: formatConversation("A", "short"),
      cut: false,
    });
  });

  it("cuts a session to about the budget, and says so", () => {
    const { text: formatted, cut } = formatOther("A", "x".repeat(64_000), 4000);
    expect(cut).toBe(true);
    expect(formatted).toContain("\n[Truncated for brevity...]</transcript>");
    // The cut is rough: the tags and the note go a little over.
    expect(estimateTokens(formatted)).toBeGreaterThan(3900);
    expect(estimateTokens(formatted)).toBeLessThanOrEqual(4100);
  });
});

describe("planContext", () => {
  // Each session's tags add about 23 tokens to its transcript.
  const sessions = [
    { id: "aaaaaaaa-1", transcript: "a".repeat(40) },
    { id: "bbbbbbbb-2", transcript: "" },
    { id: "cccccccc-3", transcript: "c".repeat(400) },
    { id: "dddddddd-4", transcript: "d".repeat(4) },
  ];

  it("marks each session whole, cut, over the limit or empty", () => {
    const plan = planContext(sessions, { perSession: 50, total: 120 });
    expect(plan.map((e) => [e.id, e.status])).toEqual([
      ["aaaaaaaa-1", "whole"],
      ["bbbbbbbb-2", "empty"],
      ["cccccccc-3", "cut"],
      ["dddddddd-4", "over-limit"],
    ]);
  });

  it("stops at the first that would go over the total, as the original does", () => {
    const plan = planContext(sessions, { perSession: 500, total: 100 });
    expect(plan.map((e) => e.status)).toEqual(["whole", "empty", "over-limit", "over-limit"]);
  });

  it("puts only what goes in into the prompt, in order", () => {
    const plan = planContext(sessions, { perSession: 50, total: 120 });
    expect(contextText(plan)).toBe(plan[0].text + plan[2].text);
    expect(contextText(plan)).toContain("<name>Session aaaaaaaa</name>");
  });
});
