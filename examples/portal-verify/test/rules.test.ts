import { describe, expect, it } from "vitest";
import { REVISE_COOLDOWN_MS, VERIFY_COOLDOWN_MS } from "../src/shared/constants";
import {
  NO_NEW_FEEDBACK,
  recordedSecondsAt,
  type ReviseFacts,
  type VerifyFacts,
  whyNotRevise,
  whyNotVerify,
} from "../src/shared/rules";

const ready: VerifyFacts = {
  verifyStatus: "idle",
  recordedSeconds: 60,
  segments: 3,
  lastVerifyAt: null,
  now: 1_000_000,
};

describe("whyNotVerify", () => {
  it("allows a new outcome once the rules are met", () => {
    expect(whyNotVerify(ready)).toBeNull();
  });

  it("refuses while an outcome is written or revised, but not after one failed", () => {
    for (const verifyStatus of ["generating", "revising", "slow"] as const) {
      expect(whyNotVerify({ ...ready, verifyStatus })).toBe("An outcome is being written");
    }
    expect(whyNotVerify({ ...ready, verifyStatus: "failed" })).toBeNull();
  });

  it("refuses under 60 seconds recorded", () => {
    expect(whyNotVerify({ ...ready, recordedSeconds: 59.5 })).toMatch(/after 60 seconds/);
  });

  it("refuses with nothing transcribed", () => {
    expect(whyNotVerify({ ...ready, segments: 0 })).toMatch(/Nothing/);
  });

  it("refuses within 2 minutes of the last outcome, and allows after", () => {
    const lastVerifyAt = ready.now - VERIFY_COOLDOWN_MS + 30_000;
    expect(whyNotVerify({ ...ready, lastVerifyAt })).toBe("Wait 30 seconds for the next outcome");
    expect(whyNotVerify({ ...ready, lastVerifyAt: ready.now - VERIFY_COOLDOWN_MS })).toBeNull();
  });

  it("gives the first reason that applies, in order", () => {
    const blocked = { verifyStatus: "generating", recordedSeconds: 0, segments: 0 } as const;
    expect(whyNotVerify({ ...ready, ...blocked, lastVerifyAt: ready.now })).toMatch(
      /being written/,
    );
    expect(whyNotVerify({ ...ready, recordedSeconds: 0, segments: 0 })).toMatch(/after 60/);
    expect(whyNotVerify({ ...ready, segments: 0, lastVerifyAt: ready.now })).toMatch(/Nothing/);
  });
});

describe("recordedSecondsAt", () => {
  it("adds a recording still going to the total", () => {
    expect(recordedSecondsAt({ recordedSeconds: 30, recordingSince: null }, 5000)).toBe(30);
    expect(recordedSecondsAt({ recordedSeconds: 30, recordingSince: 1000 }, 5000)).toBe(34);
  });
});

describe("whyNotRevise", () => {
  const ready: ReviseFacts = {
    verifyStatus: "idle",
    lastReviseAt: null,
    newSegments: 2,
    now: 1_000_000,
  };

  it("allows a revision with new speech", () => {
    expect(whyNotRevise(ready)).toBeNull();
  });

  it("refuses while an outcome is written or revised", () => {
    expect(whyNotRevise({ ...ready, verifyStatus: "revising" })).toMatch(/being written/);
  });

  it("refuses within 30 seconds of the last revision, and allows after", () => {
    const lastReviseAt = ready.now - REVISE_COOLDOWN_MS + 12_000;
    expect(whyNotRevise({ ...ready, lastReviseAt })).toBe("Wait 12 seconds to revise again");
    expect(whyNotRevise({ ...ready, lastReviseAt: ready.now - REVISE_COOLDOWN_MS })).toBeNull();
  });

  it("refuses with no new speech, with the original's message", () => {
    expect(whyNotRevise({ ...ready, newSegments: 0 })).toBe(NO_NEW_FEEDBACK);
  });
});
