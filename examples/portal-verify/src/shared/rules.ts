import { MIN_RECORDED_SECONDS, REVISE_COOLDOWN_MS, VERIFY_COOLDOWN_MS } from "./constants";

export type VerifyStatus = "idle" | "generating" | "revising" | "slow" | "failed";

/** An outcome is being written or revised, so no other can start. */
export function isWriting(status: VerifyStatus): boolean {
  return status === "generating" || status === "revising" || status === "slow";
}

/** What the rules need to know about a session. */
export interface VerifyFacts {
  verifyStatus: VerifyStatus;
  /** Seconds recorded so far, counting a recording still going. */
  recordedSeconds: number;
  /** Segments in the transcript. */
  segments: number;
  /** When the last new outcome was complete, if any. */
  lastVerifyAt: number | null;
  now: number;
}

/**
 * Why Verify can't start a new outcome now, or null when it can. The
 * server enforces these, and the page shows the same reason on its
 * disabled button.
 */
export function whyNotVerify(facts: VerifyFacts): string | null {
  if (isWriting(facts.verifyStatus)) return "An outcome is being written";
  if (facts.recordedSeconds < MIN_RECORDED_SECONDS) {
    return `Verify turns on after ${MIN_RECORDED_SECONDS} seconds of recording`;
  }
  if (facts.segments === 0) return "Nothing has been transcribed yet";
  const wait = cooldownLeft(facts.lastVerifyAt, VERIFY_COOLDOWN_MS, facts.now);
  if (wait > 0) return `Wait ${Math.ceil(wait / 1000)} seconds for the next outcome`;
  return null;
}

/**
 * The original's message for a Revise with no new speech.
 * `frontend/src/components/participant/verify/VerifyArtefact.tsx`.
 */
export const NO_NEW_FEEDBACK =
  "No new feedback detected yet. Please continue your discussion and try again soon.";

/** What the rules need to know to revise the pending outcome. */
export interface ReviseFacts {
  verifyStatus: VerifyStatus;
  /** When the last revision finished, or a Revise found no feedback. */
  lastReviseAt: number | null;
  /** Segments since the outcome was made or last revised. */
  newSegments: number;
  now: number;
}

/** Why Revise can't run now, or null when it can. */
export function whyNotRevise(facts: ReviseFacts): string | null {
  if (isWriting(facts.verifyStatus)) return "An outcome is being written";
  const wait = cooldownLeft(facts.lastReviseAt, REVISE_COOLDOWN_MS, facts.now);
  if (wait > 0) return `Wait ${Math.ceil(wait / 1000)} seconds to revise again`;
  if (facts.newSegments === 0) return NO_NEW_FEEDBACK;
  return null;
}

/** Milliseconds until a wait of `cooldown` since `last` is over. */
export function cooldownLeft(last: number | null, cooldown: number, now: number): number {
  return last === null ? 0 : Math.max(0, last + cooldown - now);
}

/** Seconds recorded so far, counting a recording still going. */
export function recordedSecondsAt(
  state: { recordedSeconds: number; recordingSince: number | null },
  now: number,
): number {
  const { recordedSeconds, recordingSince } = state;
  return recordedSeconds + (recordingSince === null ? 0 : Math.max(0, now - recordingSince) / 1000);
}
