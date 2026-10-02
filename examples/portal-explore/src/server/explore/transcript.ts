import { CHARS_PER_TOKEN, OTHERS_TOKEN_LIMIT, TOKENS_PER_SESSION } from "../../shared/constants";

/**
 * Turns sessions into the text the reply prompt quotes, ported from the
 * dembrane portal's `reply.ts`. Sessions have no participant name or tags,
 * so each is named by a label and has no `<tags>`.
 */

export interface Timed {
  /** Milliseconds since the epoch. */
  at: number;
  text: string;
}

/** There's no tokenizer in a Worker, so tokens are estimated from length. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
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
export function formatOther(
  name: string,
  transcript: string,
  budget = TOKENS_PER_SESSION,
): { text: string; cut: boolean } {
  const whole = formatConversation(name, transcript);
  const tokens = estimateTokens(whole);
  if (tokens <= budget) return { text: whole, cut: false };
  const chars = [...transcript];
  const kept = chars.slice(0, Math.trunc((chars.length * budget) / tokens)).join("");
  return { text: formatConversation(name, `${kept}\n[Truncated for brevity...]`), cut: true };
}

/** How one other session goes into a prompt. */
export type ContextStatus = "whole" | "cut" | "over-limit" | "empty";

export interface ContextEntry {
  id: string;
  status: ContextStatus;
  /** About how many tokens it adds, or would add, to a prompt. */
  tokens: number;
  /** Exactly what the prompt gets, or would get. Empty for an empty session. */
  text: string;
}

/**
 * Works out how each other session goes into a prompt, in the order given:
 * each cut to about its budget, stopping at the first that would go over
 * the total. Nothing after that one goes in, as in the original.
 */
export function planContext(
  sessions: readonly { id: string; transcript: string }[],
  { perSession = TOKENS_PER_SESSION, total = OTHERS_TOKEN_LIMIT } = {},
): ContextEntry[] {
  let used = 0;
  let full = false;
  return sessions.map(({ id, transcript }) => {
    if (!transcript.trim()) return { id, status: "empty", tokens: 0, text: "" };
    const { text, cut } = formatOther(sessionLabel(id), transcript, perSession);
    const tokens = estimateTokens(text);
    if (full || used + tokens > total) {
      full = true;
      return { id, status: "over-limit", tokens, text };
    }
    used += tokens;
    return { id, status: cut ? "cut" : "whole", tokens, text };
  });
}

/** The text of every entry that goes in, for the prompt's other transcripts. */
export function contextText(entries: readonly ContextEntry[]): string {
  return entries
    .filter((e) => e.status === "whole" || e.status === "cut")
    .map((e) => e.text)
    .join("");
}
