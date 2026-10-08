import { MIN_RECORDED_SECONDS } from "../../constants";
import { isWriting, type DraftStatus } from "../../draft";
import { cooldownLeft } from "../../rules";

/**
 * The wait between new outcomes.
 * `frontend/src/components/participant/refine/hooks/useRefineSelectionCooldown.ts`:
 * `COOLDOWN_DURATION`. The original counts it from the button press, kept
 * in the browser, once generation succeeds; here it's counted on the
 * server, from when the last outcome was complete.
 */
export const VERIFY_COOLDOWN_MS = 2 * 60 * 1000;

/**
 * The wait after a revision, or after a Revise with no new feedback.
 * `frontend/src/components/participant/verify/VerifyArtefact.tsx`:
 * `useCooldown(30 * 1000)`. Kept in the browser there; here on the server.
 */
export const REVISE_COOLDOWN_MS = 30 * 1000;

/** The longest outcome an edit may save. Made up: the original has no limit. */
export const MAX_OUTCOME_CHARS = 20_000;

export const VERIFY_OFF = "Verify is off for this project";

/** What the rules need to know to start a new outcome. */
export interface VerifyFacts {
  /** The project's switch. */
  enabled: boolean;
  status: DraftStatus;
  /** Seconds recorded so far, counting a recording still going. */
  recordedSeconds: number;
  /** Segments in the transcript. */
  segments: number;
  /** When the last new outcome was complete, if any. */
  lastVerifyAt: number | null;
  now: number;
}

/**
 * Why Verify can't start a new outcome now, or null when it can. The
 * server enforces these, and the page shows the same reason on its
 * disabled button.
 */
export function whyNotVerify(facts: VerifyFacts): string | null {
  if (!facts.enabled) return VERIFY_OFF;
  if (isWriting(facts.status)) return "An outcome is being written";
  if (facts.recordedSeconds < MIN_RECORDED_SECONDS) {
    return `Verify turns on after ${MIN_RECORDED_SECONDS} seconds of recording`;
  }
  if (facts.segments === 0) return "Nothing has been transcribed yet";
  const wait = cooldownLeft(facts.lastVerifyAt, VERIFY_COOLDOWN_MS, facts.now);
  if (wait > 0) return `Wait ${Math.ceil(wait / 1000)} seconds for the next outcome`;
  return null;
}

/**
 * The original's message for a Revise with no new speech.
 * `frontend/src/components/participant/verify/VerifyArtefact.tsx`.
 */
export const NO_NEW_FEEDBACK =
  "No new feedback detected yet. Please continue your discussion and try again soon.";

/** What the rules need to know to revise the pending outcome. */
export interface ReviseFacts {
  status: DraftStatus;
  /** When the last revision finished, or a Revise found no feedback. */
  lastReviseAt: number | null;
  /** Segments since the outcome was made or last revised. */
  newSegments: number;
  now: number;
}

/** Why Revise can't run now, or null when it can. */
export function whyNotRevise(facts: ReviseFacts): string | null {
  if (isWriting(facts.status)) return "An outcome is being written";
  const wait = cooldownLeft(facts.lastReviseAt, REVISE_COOLDOWN_MS, facts.now);
  if (wait > 0) return `Wait ${Math.ceil(wait / 1000)} seconds to revise again`;
  if (facts.newSegments === 0) return NO_NEW_FEEDBACK;
  return null;
}
