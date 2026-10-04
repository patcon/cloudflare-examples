export interface Timed {
  /** Milliseconds since the epoch. */
  at: number;
  text: string;
}

/**
 * Segments in time order, trimmed, one per line, as the text a prompt
 * quotes. As `transcriptText` in the original's `service.ts`.
 */
export function buildTranscript(segments: readonly Timed[]): string {
  return [...segments]
    .sort((a, b) => a.at - b.at)
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join("\n");
}
