/**
 * The pieces every feature's rules share. Each rule is a pure function from
 * facts to null, when the action is allowed, or the reason it isn't. The
 * agent throws the reason, and the page shows it on the disabled button.
 */

/** What a session tells its features, from `SessionAgent.facts()`. */
export interface SessionFacts {
  projectId: string | null;
  /** When recording first started, or null before it has. A replay counts. */
  firstRecordedAt: number | null;
  /** Seconds recorded so far, counting a recording still going. */
  recordedSeconds: number;
  /** Segments in the transcript. */
  segments: number;
  recording: boolean;
}

/** A point in a session, on both its clocks. */
export interface Moment {
  /** Wall-clock time, in milliseconds since the epoch. */
  at: number;
  /** Seconds recorded by then. */
  recordedSeconds: number;
}

/**
 * A wait, on both clocks: elapsed time, which always runs, and recorded
 * time, which only runs while recording. Both must pass. Zero doesn't wait.
 */
export interface Wait {
  elapsedSeconds: number;
  recordedSeconds: number;
}

/**
 * An action's waits: from when the session first started recording, and
 * since the action last finished. Hardcoded in each feature's rules, as
 * they set how often the model is called, and so what a project costs.
 */
export interface Waits {
  sinceStart: Wait;
  sinceLast: Wait;
}

export const NO_WAIT: Wait = { elapsedSeconds: 0, recordedSeconds: 0 };

/** What's left of a wait, on the first clock that's still running. */
export interface WaitLeft {
  clock: "elapsed" | "recorded";
  seconds: number;
}

/** What's left of `wait` since `since`, or null when it's over. Recorded time goes first. */
export function waitLeft(wait: Wait, since: Moment, now: Moment): WaitLeft | null {
  const recorded = since.recordedSeconds + wait.recordedSeconds - now.recordedSeconds;
  if (recorded > 0) return { clock: "recorded", seconds: recorded };
  const elapsed = (since.at + wait.elapsedSeconds * 1000 - now.at) / 1000;
  if (elapsed > 0) return { clock: "elapsed", seconds: elapsed };
  return null;
}

/**
 * Why an action waits for the session's start, or null when it doesn't.
 * Before recording has started, the whole wait is left, and its elapsed
 * time hasn't begun.
 */
export function whyWaitStart(
  name: string,
  wait: Wait,
  firstRecordedAt: number | null,
  now: Moment,
): string | null {
  const start = firstRecordedAt === null ? now : { at: firstRecordedAt, recordedSeconds: 0 };
  const left = waitLeft(wait, start, now);
  if (!left) return null;
  if (left.clock === "recorded") {
    return `${name} turns on after ${seconds(left.seconds, "more ")} of recording`;
  }
  if (firstRecordedAt === null) {
    return `${name} turns on ${seconds(left.seconds)} after recording starts`;
  }
  return `${name} turns on in ${seconds(left.seconds)}`;
}

/**
 * Why an action waits since it last finished, or null when it doesn't, or
 * it hasn't run. `next` ends the reason, such as "for the next reply".
 */
export function whyWaitLast(next: string, wait: Wait, last: Moment | null, now: Moment) {
  // A state saved before moments were kept has no `last` at all.
  const left = last ? waitLeft(wait, last, now) : null;
  if (!left) return null;
  return left.clock === "recorded"
    ? `Record ${seconds(left.seconds, "more ")} ${next}`
    : `Wait ${seconds(left.seconds)} ${next}`;
}

/** Whole seconds, rounded up, such as "1 second" or "20 more seconds". */
function seconds(s: number, more = ""): string {
  const n = Math.ceil(s);
  return `${n} ${more}${n === 1 ? "second" : "seconds"}`;
}

/** Seconds recorded so far, counting a recording still going. */
export function recordedSecondsAt(
  state: { recordedSeconds: number; recordingSince: number | null },
  now: number,
): number {
  const { recordedSeconds, recordingSince } = state;
  return recordedSeconds + (recordingSince === null ? 0 : Math.max(0, now - recordingSince) / 1000);
}
