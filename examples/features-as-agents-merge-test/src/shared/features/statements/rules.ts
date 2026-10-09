export const STATEMENTS_OFF = "Statement extraction is off for this project";

/** What the rules need to know to extract now. */
export interface ExtractFacts {
  /** The project's switch. */
  enabled: boolean;
  /** An extraction run is going. */
  running: boolean;
  /** Segments since the last run that worked. */
  newSegments: number;
}

/**
 * Why **Extract now** can't run, or null when it can. The timer doesn't
 * ask: it has its own threshold, of words.
 */
export function whyNotExtract(facts: ExtractFacts): string | null {
  if (!facts.enabled) return STATEMENTS_OFF;
  if (facts.running) return "Extraction is running";
  if (facts.newSegments <= 0) return "Nothing new since the last run";
  return null;
}
