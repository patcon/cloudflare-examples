import { describe, expect, it } from "vitest";
import {
  NO_NEW_FEEDBACK,
  REVISE_WAITS,
  type ReviseFacts,
  VERIFY_OFF,
  VERIFY_WAITS,
  type VerifyFacts,
  whyNotRevise,
  whyNotVerify,
} from "./rules";

const VERIFY_COOLDOWN_MS = VERIFY_WAITS.sinceLast.elapsedSeconds * 1000;
const REVISE_SECONDS = REVISE_WAITS.sinceLast.recordedSeconds;
const now = { at: 1_000_000, recordedSeconds: 60 };

const ready: VerifyFacts = {
  enabled: true,
  status: "idle",
  firstRecordedAt: 0,
  segments: 3,
  lastVerify: null,
  now,
};

describe("whyNotVerify", () => {
  it("allows a new outcome once the rules are met", () => {
    expect(whyNotVerify(ready)).toBeNull();
  });

  it("refuses when Verify is off for the project", () => {
    expect(whyNotVerify({ ...ready, enabled: false })).toBe(VERIFY_OFF);
  });

  it("refuses while an outcome is written or revised, but not after one failed", () => {
    for (const status of ["waiting", "streaming", "slow"] as const) {
      expect(whyNotVerify({ ...ready, status })).toBe("An outcome is being written");
    }
    expect(whyNotVerify({ ...ready, status: "failed" })).toBeNull();
  });

  it("refuses under 60 seconds recorded", () => {
    expect(whyNotVerify({ ...ready, now: { ...now, recordedSeconds: 59.5 } })).toBe(
      "Verify turns on after 1 more second of recording",
    );
  });

  it("refuses with nothing transcribed", () => {
    expect(whyNotVerify({ ...ready, segments: 0 })).toMatch(/Nothing/);
  });

  it("refuses within 2 minutes of the last outcome, and allows after", () => {
    const lastVerify = { at: now.at - VERIFY_COOLDOWN_MS + 30_000, recordedSeconds: 60 };
    expect(whyNotVerify({ ...ready, lastVerify })).toBe("Wait 30 seconds for the next outcome");
    expect(
      whyNotVerify({ ...ready, lastVerify: { ...lastVerify, at: now.at - VERIFY_COOLDOWN_MS } }),
    ).toBeNull();
  });

  it("gives the first reason that applies, in order", () => {
    const early = { ...now, recordedSeconds: 0 };
    expect(
      whyNotVerify({ ...ready, status: "waiting", segments: 0, now: early, lastVerify: now }),
    ).toMatch(/being written/);
    expect(whyNotVerify({ ...ready, segments: 0, now: early })).toMatch(/after 60 more/);
    expect(whyNotVerify({ ...ready, segments: 0, lastVerify: now })).toMatch(/Nothing/);
  });
});

describe("whyNotRevise", () => {
  const ready: ReviseFacts = {
    status: "idle",
    firstRecordedAt: 0,
    lastRevise: null,
    newSegments: 2,
    now,
  };

  it("allows a revision with new speech", () => {
    expect(whyNotRevise(ready)).toBeNull();
  });

  it("refuses while an outcome is written or revised", () => {
    expect(whyNotRevise({ ...ready, status: "streaming" })).toMatch(/being written/);
  });

  it("refuses within 30 seconds of recording since the last revision, and allows after", () => {
    const lastRevise = { at: 0, recordedSeconds: now.recordedSeconds - REVISE_SECONDS + 12 };
    expect(whyNotRevise({ ...ready, lastRevise })).toBe("Record 12 more seconds to revise again");
    const recorded = now.recordedSeconds - REVISE_SECONDS;
    expect(whyNotRevise({ ...ready, lastRevise: { at: 0, recordedSeconds: recorded } })).toBeNull();
  });

  it("keeps waiting while not recording, however long it's been", () => {
    const lastRevise = { at: 0, recordedSeconds: now.recordedSeconds };
    expect(whyNotRevise({ ...ready, lastRevise })).toMatch(/Record 30 more seconds/);
  });

  it("refuses with no new speech, with the original's message", () => {
    expect(whyNotRevise({ ...ready, newSegments: 0 })).toBe(NO_NEW_FEEDBACK);
  });
});
