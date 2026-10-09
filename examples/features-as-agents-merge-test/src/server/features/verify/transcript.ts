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

/**
 * The feedback for a revision: segments after `since`, each with its time,
 * as the original's `service.ts` lists the chunks after its timestamp.
 */
export function feedbackSince(segments: readonly Timed[], since: number): string {
  return segments
    .filter((s) => s.at > since && s.text.trim())
    .sort((a, b) => a.at - b.at)
    .map((s) => `[${new Date(s.at).toISOString()}] ${s.text.trim()}`)
    .join("\n");
}
