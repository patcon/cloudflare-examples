import { describe, expect, it } from "vitest";
import { EXPLORE_OFF, EXPLORE_WAITS, type ExploreFacts, whyNotExplore } from "./rules";

const COOLDOWN_MS = EXPLORE_WAITS.sinceLast.elapsedSeconds * 1000;
const now = { at: 1_000_000, recordedSeconds: 60 };

const ready: ExploreFacts = {
  enabled: true,
  status: "idle",
  firstRecordedAt: 0,
  segments: 3,
  lastReply: null,
  now,
};

describe("whyNotExplore", () => {
  it("allows a reply once the rules are met", () => {
    expect(whyNotExplore(ready)).toBeNull();
  });

  it("refuses under 60 seconds recorded", () => {
    expect(whyNotExplore({ ...ready, now: { ...now, recordedSeconds: 50 } })).toBe(
      "Explore turns on after 10 more seconds of recording",
    );
    expect(
      whyNotExplore({ ...ready, firstRecordedAt: null, now: { ...now, recordedSeconds: 0 } }),
    ).toMatch(/after 60 more seconds/);
  });

  it("refuses with nothing transcribed", () => {
    expect(whyNotExplore({ ...ready, segments: 0 })).toMatch(/Nothing/);
  });

  it("refuses within 2 minutes of the last reply, and allows after", () => {
    const lastReply = { at: now.at - COOLDOWN_MS + 30_000, recordedSeconds: 60 };
    expect(whyNotExplore({ ...ready, lastReply })).toBe("Wait 30 seconds for the next reply");
    expect(
      whyNotExplore({ ...ready, lastReply: { ...lastReply, at: now.at - COOLDOWN_MS } }),
    ).toBeNull();
  });

  it("refuses while a reply is generating, but not after one failed", () => {
    for (const status of ["waiting", "streaming", "slow"] as const) {
      expect(whyNotExplore({ ...ready, status })).toMatch(/on its way/);
    }
    expect(whyNotExplore({ ...ready, status: "failed" })).toBeNull();
  });

  it("refuses when the project has Explore off", () => {
    expect(whyNotExplore({ ...ready, enabled: false })).toBe(EXPLORE_OFF);
  });
});
