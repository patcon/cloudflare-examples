import type { Proposed } from "./types";

/**
 * Checks the shape of the model's JSON answer, dropping malformed entries
 * rather than failing the whole run.
 */
export function parseProposed(json: unknown): Proposed[] {
  const list = (json as { statements?: unknown })?.statements;
  if (!Array.isArray(list)) throw new Error("Answer has no statements list");
  return list.flatMap((item): Proposed[] => {
    if (typeof item?.text !== "string") return [];
    return [
      {
        text: item.text.trim(),
        quote: typeof item.quote === "string" ? item.quote.trim() : "",
        rationale: typeof item.rationale === "string" ? item.rationale.trim() : "",
        scores: {
          clarity: score(item.clarity),
          divisiveness: score(item.divisiveness),
          novelty: score(item.novelty)
        }
      }
    ];
  });
}

function score(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 0;
}
