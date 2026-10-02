/**
 * Turns sessions into the text the reply prompt quotes, ported from the
 * dembrane portal's `reply.ts`. Sessions have no participant name or tags,
 * so each is named by a label and has no `<tags>`.
 */

/** The most the other sessions add to a prompt, in all. */
export const OTHERS_TOKEN_LIMIT = 80_000;
/** Each other session is cut to about this many tokens. */
export const TOKENS_PER_SESSION = 4_000;

export interface Timed {
  /** Milliseconds since the epoch. */
  at: number;
  text: string;
}

/**
 * There's no tokenizer in a Worker, so tokens are estimated at 4 characters
 * each, which is about right for English.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** How a session is named in a prompt. */
export function sessionLabel(sessionId: string) {
  return `Session ${sessionId.slice(0, 8)}`;
}

export function formatConversation(name: string, transcript: string): string {
  return `<conversation>\n\t<name>${name}</name>\n\t<transcript>${transcript}</transcript>\n</conversation>\n`;
}

/**
 * Segments and earlier replies, in time order. At the same time, segments
 * come first, as the sort is stable.
 */
export function buildTranscript(segments: readonly Timed[], replies: readonly Timed[]): string {
  return [
    ...segments.map((s) => ({ at: s.at, text: `${s.text}\n` })),
    ...replies.map((r) => ({
      at: r.at,
      text: `[Assistant Reply at this point in time: ${r.text}]\n`,
    })),
  ]
    .sort((a, b) => a.at - b.at)
    .map((item) => item.text)
    .join("");
}

/**
 * One other session, formatted, and cut to about the per-session budget.
 * As in the original, the cut is a rough one, by the ratio of the budget to
 * the whole.
 */
export function formatOther(name: string, transcript: string, budget = TOKENS_PER_SESSION) {
  const whole = formatConversation(name, transcript);
  const tokens = estimateTokens(whole);
  if (tokens <= budget) return whole;
  const chars = [...transcript];
  const cut = chars.slice(0, Math.trunc((chars.length * budget) / tokens)).join("");
  return formatConversation(name, `${cut}\n[Truncated for brevity...]`);
}

/**
 * Joins formatted sessions in order, and stops at the first that would go
 * over the total.
 */
export function withinLimit(formatted: readonly string[], limit = OTHERS_TOKEN_LIMIT): string {
  let total = 0;
  let out = "";
  for (const f of formatted) {
    const tokens = estimateTokens(f);
    if (total + tokens > limit) break;
    out += f;
    total += tokens;
  }
  return out;
}
