import { describe, expect, it } from "vitest";
import { COOLDOWN_MS } from "../src/shared/limits";
import { recordedSecondsAt, whyNotExplore, type ExploreFacts } from "../src/shared/rules";

const ready: ExploreFacts = {
  recordedSeconds: 60,
  segments: 3,
  lastReplyAt: null,
  replyStatus: "idle",
  now: 1_000_000,
};

describe("whyNotExplore", () => {
  it("allows a reply once the rules are met", () => {
    expect(whyNotExplore(ready)).toBeNull();
  });

  it("refuses under 60 seconds recorded", () => {
    expect(whyNotExplore({ ...ready, recordedSeconds: 59.5 })).toMatch(/after 60 seconds/);
  });

  it("refuses with nothing transcribed", () => {
    expect(whyNotExplore({ ...ready, segments: 0 })).toMatch(/Nothing/);
  });

  it("refuses within 2 minutes of the last reply, and allows after", () => {
    const lastReplyAt = ready.now - COOLDOWN_MS + 30_000;
    expect(whyNotExplore({ ...ready, lastReplyAt })).toBe("Wait 30 seconds for the next reply");
    expect(whyNotExplore({ ...ready, lastReplyAt: ready.now - COOLDOWN_MS })).toBeNull();
  });

  it("refuses while a reply is generating, but not after one failed", () => {
    for (const replyStatus of ["thinking", "streaming", "slow"] as const) {
      expect(whyNotExplore({ ...ready, replyStatus })).toMatch(/on its way/);
    }
    expect(whyNotExplore({ ...ready, replyStatus: "failed" })).toBeNull();
  });
});

describe("recordedSecondsAt", () => {
  it("adds a recording still going to the total", () => {
    expect(recordedSecondsAt({ recordedSeconds: 30, recordingSince: null }, 5000)).toBe(30);
    expect(recordedSecondsAt({ recordedSeconds: 30, recordingSince: 1000 }, 5000)).toBe(34);
  });
});
