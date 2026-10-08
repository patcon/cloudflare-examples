import { describe, expect, it } from "vitest";
import { verifyView } from "../src/shared/features/verify/view";

const idle = { status: "idle", mode: "generate", pendingOutcome: null } as const;
const pending = { status: "idle", mode: "generate", pendingOutcome: { id: 1 } } as const;
const local = { picking: false, awaitingNext: false, backed: false };

describe("verifyView", () => {
  it("shows the transcript when nothing is going on", () => {
    expect(verifyView(idle, local)).toBe("none");
  });

  it("goes chips, instructions, outcome", () => {
    expect(verifyView(idle, { ...local, picking: true })).toBe("topics");
    expect(verifyView({ ...idle, status: "waiting" }, local)).toBe("instructions");
    expect(verifyView(pending, { ...local, awaitingNext: true })).toBe("instructions");
    expect(verifyView(pending, local)).toBe("outcome");
  });

  it("goes to the outcome after a reload on a pending one", () => {
    expect(verifyView(pending, local)).toBe("outcome");
  });

  it("shows the instructions while writing or after a failure, even if picking", () => {
    for (const status of ["waiting", "slow", "failed"] as const) {
      expect(verifyView({ ...idle, status }, { ...local, picking: true })).toBe("instructions");
    }
  });

  it("goes back to the transcript from the outcome, which stays pending", () => {
    expect(verifyView(pending, { ...local, backed: true })).toBe("none");
  });

  it("stays on the outcome while it's revised", () => {
    expect(verifyView({ ...pending, status: "streaming", mode: "revise" }, local)).toBe("outcome");
  });
});
