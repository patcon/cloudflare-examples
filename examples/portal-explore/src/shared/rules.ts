import { COOLDOWN_MS, MIN_RECORDED_SECONDS } from "./limits";

export type ReplyStatus = "idle" | "thinking" | "streaming" | "slow" | "failed";

/** What the rules need to know about a session. */
export interface ExploreFacts {
  /** Seconds recorded so far, counting a recording still going. */
  recordedSeconds: number;
  /** Segments in the transcript. */
  segments: number;
  /** When the last reply finished, if any. */
  lastReplyAt: number | null;
  replyStatus: ReplyStatus;
  now: number;
}

/**
 * Why Explore can't run now, or null when it can. The server enforces these,
 * and the page shows the same reason on its disabled button.
 */
export function whyNotExplore(facts: ExploreFacts): string | null {
  if (["thinking", "streaming", "slow"].includes(facts.replyStatus)) {
    return "A reply is on its way";
  }
  if (facts.recordedSeconds < MIN_RECORDED_SECONDS) {
    return `Explore turns on after ${MIN_RECORDED_SECONDS} seconds of recording`;
  }
  if (facts.segments === 0) return "Nothing has been transcribed yet";
  const wait = cooldownLeft(facts.lastReplyAt, facts.now);
  if (wait > 0) return `Wait ${Math.ceil(wait / 1000)} seconds for the next reply`;
  return null;
}

/** Milliseconds until the next reply is allowed. */
export function cooldownLeft(lastReplyAt: number | null, now: number): number {
  return lastReplyAt === null ? 0 : Math.max(0, lastReplyAt + COOLDOWN_MS - now);
}

/** Seconds recorded so far, counting a recording still going. */
export function recordedSecondsAt(
  state: { recordedSeconds: number; recordingSince: number | null },
  now: number,
): number {
  const { recordedSeconds, recordingSince } = state;
  return recordedSeconds + (recordingSince === null ? 0 : Math.max(0, now - recordingSince) / 1000);
}
