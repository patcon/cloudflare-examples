import type { FilterReason, Proposed } from "./types";

/** Polis caps comments at 140 characters. This leaves a little room. */
export const MAX_LENGTH = 180;
/** Word overlap above which two statements count as the same. */
const NEAR_DUPLICATE = 0.8;

export interface Filtered {
  proposed: Proposed;
  /** Null when it's kept. */
  reason: FilterReason | null;
}

/**
 * Drops what's plainly not a usable statement: empty, too long, a question,
 * or the same as one already in the project or earlier in this batch.
 * Dropped ones are kept with their reason, for tuning the prompt.
 */
export function filterProposed(
  proposed: Proposed[],
  existing: string[]
): Filtered[] {
  const seen = existing.map(words);
  return proposed.map((p) => {
    const reason = reasonToDrop(p.text, seen);
    if (!reason) seen.push(words(p.text));
    return { proposed: p, reason };
  });
}

function reasonToDrop(text: string, seen: Set<string>[]): FilterReason | null {
  if (!text) return "empty";
  if (text.length > MAX_LENGTH) return "too_long";
  if (text.endsWith("?")) return "question";
  const w = words(text);
  if (seen.some((s) => overlap(w, s) >= NEAR_DUPLICATE)) return "duplicate";
  return null;
}

export function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .split(/\s+/)
      .filter(Boolean)
  );
}

/** Jaccard overlap of two word sets. */
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both);
}
