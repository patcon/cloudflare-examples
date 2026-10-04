import { isWriting, type VerifyStatus } from "./rules";

/**
 * Verify's views, in place of the transcript, as the original's routes
 * inside the recording page. The recording goes on under all of them.
 */
export type VerifyView = "none" | "topics" | "instructions" | "outcome";

/** What this page shows, beside what the session's state says. */
export interface VerifyLocal {
  /** The topic chips are open. */
  picking: boolean;
  /**
   * This page saw the outcome being written, so it shows the instructions
   * until **Next**. A page that opens on a finished outcome goes to it.
   */
  awaitingNext: boolean;
}

export function verifyView(
  state: { verifyStatus: VerifyStatus; pendingOutcome: object | null },
  local: VerifyLocal,
): VerifyView {
  const { verifyStatus, pendingOutcome } = state;
  if (verifyStatus === "revising") return "outcome";
  if (isWriting(verifyStatus) || verifyStatus === "failed") return "instructions";
  if (local.picking) return "topics";
  if (pendingOutcome) return local.awaitingNext ? "instructions" : "outcome";
  return "none";
}
