import { describe, expect, it } from "vitest";
import {
  BRAINSTORM_PROMPT,
  buildPrompt,
  DEFAULT_SETTINGS,
  globalPrompt,
  modeUsed,
  SUMMARIZE_PROMPT,
} from "../src/server/explore/prompt";
import {
  buildTranscript,
  estimateTokens,
  formatConversation,
  formatOther,
  contextText,
  planContext,
} from "../src/server/explore/transcript";

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

describe("globalPrompt", () => {
  it("picks the mode's template", () => {
    expect(globalPrompt(DEFAULT_SETTINGS)).toBe(SUMMARIZE_PROMPT);
    expect(globalPrompt({ ...DEFAULT_SETTINGS, mode: "brainstorm" })).toBe(BRAINSTORM_PROMPT);
    expect(globalPrompt({ ...DEFAULT_SETTINGS, mode: "custom", customPrompt: "Be terse." })).toBe(
      "Be terse.",
    );
  });

  it("says which mode a reply is written in", () => {
    expect(modeUsed({ ...DEFAULT_SETTINGS, mode: "brainstorm" })).toBe("brainstorm");
    expect(modeUsed({ ...DEFAULT_SETTINGS, mode: "custom", customPrompt: "Be terse." })).toBe(
      "custom",
    );
    expect(modeUsed({ ...DEFAULT_SETTINGS, mode: "custom", customPrompt: " " })).toBe("summarize");
  });

  it("falls back to summarize for an empty custom prompt", () => {
    expect(globalPrompt({ ...DEFAULT_SETTINGS, mode: "custom", customPrompt: "  " })).toBe(
      SUMMARIZE_PROMPT,
    );
  });
});

describe("buildPrompt", () => {
  it("fills each part of the system prompt", () => {
    const prompt = buildPrompt(
      { ...DEFAULT_SETTINGS, context: "Housing in Utrecht" },
      formatConversation("This session", "we need more homes\n"),
      formatConversation("Session 2", "rents are too high\n"),
    );
    expect(prompt).toContain("<project_description>\nHousing in Utrecht\n</project_description>");
    expect(prompt).toContain(`<global_prompt>\n${SUMMARIZE_PROMPT}\n</global_prompt>`);
    expect(prompt).toMatch(/<other_transcripts>\n<conversation>[\s\S]*rents are too high/);
    expect(prompt).toMatch(/<main_user_transcript>\n<conversation>[\s\S]*we need more homes/);
  });
});

describe("rendering", () => {
  it("doesn't escape or re-read what goes in", () => {
    const transcript = "we said <b>this</b> & {{ that }} {% if x %}";
    const prompt = buildPrompt(DEFAULT_SETTINGS, formatConversation("A", transcript), "");
    expect(prompt).toContain(transcript);
  });

  it("drops the personal-details block", () => {
    const prompt = buildPrompt(DEFAULT_SETTINGS, "", "");
    expect(prompt).not.toContain("PII");
    expect(prompt).toMatch(
      /always write "dembrane" in lowercase, even at the start of a sentence$/,
    );
  });
});
