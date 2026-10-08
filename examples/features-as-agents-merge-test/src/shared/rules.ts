/**
 * The pieces every feature's rules share. Each rule is a pure function from
 * facts to null, when the action is allowed, or the reason it isn't. The
 * agent throws the reason, and the page shows it on the disabled button.
 */

/** What a session tells its features, from `SessionAgent.facts()`. */
export interface SessionFacts {
  projectId: string | null;
  /** Seconds recorded so far, counting a recording still going. */
  recordedSeconds: number;
  /** Segments in the transcript. */
  segments: number;
  recording: boolean;
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
