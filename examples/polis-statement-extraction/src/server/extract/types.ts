/** A statement the model proposed, before the filter. */
export interface Proposed {
  text: string;
  /** The words in the transcript it rests on. */
  quote: string;
  /** Why it makes a good statement to react to. */
  rationale: string;
  /** The model's own 1–5 scores. */
  scores: { clarity: number; divisiveness: number; novelty: number };
}

/** Which transcript a statement came from. */
export type Pass = "live" | "final";

export type FilterReason = "empty" | "too_long" | "question" | "duplicate";
