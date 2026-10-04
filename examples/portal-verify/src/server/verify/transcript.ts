export interface Timed {
  /** Milliseconds since the epoch. */
  at: number;
  text: string;
}

/** Segments in time order, one per line, as the text a prompt quotes. */
export function buildTranscript(segments: readonly Timed[]): string {
  return [...segments]
    .sort((a, b) => a.at - b.at)
    .map((s) => `${s.text}\n`)
    .join("");
}
