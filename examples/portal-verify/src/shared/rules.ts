/** Seconds recorded so far, counting a recording still going. */
export function recordedSecondsAt(
  state: { recordedSeconds: number; recordingSince: number | null },
  now: number,
): number {
  const { recordedSeconds, recordingSince } = state;
  return recordedSeconds + (recordingSince === null ? 0 : Math.max(0, now - recordingSince) / 1000);
}
