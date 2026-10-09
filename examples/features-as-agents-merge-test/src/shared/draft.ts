/**
 * Text Gemini is writing, streamed into a feature agent's synced state, so
 * every open page sees it and a page that reloads catches up. Explore's
 * replies and Verify's outcomes both work this way.
 */

/**
 * - `waiting`: asked, nothing back yet
 * - `slow`: still nothing back after `SLOW_AFTER_MS`
 * - `streaming`: text is arriving in `draft`
 * - `failed`: stopped, with the reason in `error`
 */
export type DraftStatus = "idle" | "waiting" | "slow" | "streaming" | "failed";

export interface DraftState {
  status: DraftStatus;
  /** The text so far, while it streams. */
  draft: string;
  /** Why the last draft failed, when `status` is `failed`. */
  error: string | null;
}

export const IDLE_DRAFT: DraftState = { status: "idle", draft: "", error: null };

/** A draft is on its way, so no other can start. */
export function isWriting(status: DraftStatus): boolean {
  return status === "waiting" || status === "slow" || status === "streaming";
}
