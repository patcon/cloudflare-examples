import { MIN_RECORDED_SECONDS } from "../../constants";
import { isWriting, type DraftStatus } from "../../draft";
import { NO_WAIT, whyWaitLast, whyWaitStart, type Moment, type Waits } from "../../rules";

/**
 * How long a new outcome waits. From the start, `MIN_RECORDED_SECONDS` of
 * recording. Between outcomes,
 * `frontend/src/components/participant/refine/hooks/useRefineSelectionCooldown.ts`:
 * `COOLDOWN_DURATION`. The original counts that from the button press,
 * kept in the browser, once generation succeeds; here it's counted on the
 * server, from when the last outcome was complete.
 */
export const VERIFY_WAITS: Waits = {
  sinceStart: { ...NO_WAIT, recordedSeconds: MIN_RECORDED_SECONDS },
  sinceLast: { ...NO_WAIT, elapsedSeconds: 2 * 60 },
};

/**
 * How long a revision waits, after the last one, or after a Revise with no
 * new feedback. `frontend/src/components/participant/verify/VerifyArtefact.tsx`:
 * `useCooldown(30 * 1000)`, 30 seconds of wall time, kept in the browser.
 * Here it's 30 seconds of recording, so there's new feedback to revise
 * from, counted on the server.
 */
export const REVISE_WAITS: Waits = {
  sinceStart: NO_WAIT,
  sinceLast: { ...NO_WAIT, recordedSeconds: 30 },
};

/** The longest outcome an edit may save. Made up: the original has no limit. */
export const MAX_OUTCOME_CHARS = 20_000;

export const VERIFY_OFF = "Verify is off for this project";

/** What the rules need to know to start a new outcome. */
export interface VerifyFacts {
  /** The project's switch. */
  enabled: boolean;
  status: DraftStatus;
  /** When the session first started recording, if it has. */
  firstRecordedAt: number | null;
  /** Segments in the transcript. */
  segments: number;
  /** When the last new outcome was complete, if any. */
  lastVerify: Moment | null;
  now: Moment;
}

/**
 * Why Verify can't start a new outcome now, or null when it can. The
 * server enforces these, and the page shows the same reason on its
 * disabled button.
 */
export function whyNotVerify(facts: VerifyFacts): string | null {
  if (!facts.enabled) return VERIFY_OFF;
  if (isWriting(facts.status)) return "An outcome is being written";
  const { sinceStart, sinceLast } = VERIFY_WAITS;
  return (
    whyWaitStart("Verify", sinceStart, facts.firstRecordedAt, facts.now) ??
    (facts.segments === 0 ? "Nothing has been transcribed yet" : null) ??
    whyWaitLast("for the next outcome", sinceLast, facts.lastVerify, facts.now)
  );
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
  /** When the session first started recording, if it has. */
  firstRecordedAt: number | null;
  /** When the last revision finished, or a Revise found no feedback. */
  lastRevise: Moment | null;
  /** Segments since the outcome was made or last revised. */
  newSegments: number;
  now: Moment;
}

/** Why Revise can't run now, or null when it can. */
export function whyNotRevise(facts: ReviseFacts): string | null {
  if (isWriting(facts.status)) return "An outcome is being written";
  const { sinceStart, sinceLast } = REVISE_WAITS;
  return (
    whyWaitStart("Revise", sinceStart, facts.firstRecordedAt, facts.now) ??
    whyWaitLast("to revise again", sinceLast, facts.lastRevise, facts.now) ??
    (facts.newSegments === 0 ? NO_NEW_FEEDBACK : null)
  );
}
