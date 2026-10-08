import { describe, expect, it } from "vitest";
import {
  EXPLORE_COOLDOWN_MS as COOLDOWN_MS,
  EXPLORE_OFF,
  type ExploreFacts,
  whyNotExplore,
} from "../src/shared/features/explore/rules";

const ready: ExploreFacts = {
  enabled: true,
  status: "idle",
  recordedSeconds: 60,
  segments: 3,
  lastReplyAt: null,
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
    for (const status of ["waiting", "streaming", "slow"] as const) {
      expect(whyNotExplore({ ...ready, status })).toMatch(/on its way/);
    }
    expect(whyNotExplore({ ...ready, status: "failed" })).toBeNull();
  });

  it("refuses when the project has Explore off", () => {
    expect(whyNotExplore({ ...ready, enabled: false })).toBe(EXPLORE_OFF);
  });
});
