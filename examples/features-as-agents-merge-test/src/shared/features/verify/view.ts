import { isWriting, type DraftStatus } from "../../draft";

/**
 * Verify's views, in its panel, as the original's routes inside the
 * recording page. The recording goes on under all of them.
 */
export type VerifyView = "none" | "topics" | "instructions" | "outcome";

/** What this page shows, beside what the agent's state says. */
export interface VerifyLocal {
  /** The topic chips are open. */
  picking: boolean;
  /**
   * This page saw the outcome being written, so it shows the instructions
   * until **Next**. A page that opens on a finished outcome goes to it.
   */
  awaitingNext: boolean;
  /**
   * **Back** was pressed on the pending outcome. It stays pending, one tap
   * away, and opens again on a reload, as the original's outcome URL does.
   */
  backed: boolean;
}

export function verifyView(
  state: { status: DraftStatus; mode: "generate" | "revise"; pendingOutcome: object | null },
  local: VerifyLocal,
): VerifyView {
  const { status, mode, pendingOutcome } = state;
  if (isWriting(status) && mode === "revise") return "outcome";
  if (isWriting(status) || status === "failed") return "instructions";
  if (local.picking) return "topics";
  if (pendingOutcome && local.awaitingNext) return "instructions";
  if (pendingOutcome && !local.backed) return "outcome";
  return "none";
}
