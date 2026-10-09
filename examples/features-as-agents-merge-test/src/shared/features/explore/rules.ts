import { MIN_RECORDED_SECONDS } from "../../constants";
import { isWriting, type DraftStatus } from "../../draft";
import { NO_WAIT, whyWaitLast, whyWaitStart, type Moment, type Waits } from "../../rules";

/**
 * How long a reply waits. From the start, `MIN_RECORDED_SECONDS` of
 * recording. Between replies,
 * `frontend/src/components/participant/refine/hooks/useRefineSelectionCooldown.ts`:
 * `COOLDOWN_DURATION`. The original counts that from the button press,
 * kept in the browser; here it's counted on the server, from when the
 * reply finished.
 */
export const EXPLORE_WAITS: Waits = {
  sinceStart: { ...NO_WAIT, recordedSeconds: MIN_RECORDED_SECONDS },
  sinceLast: { ...NO_WAIT, elapsedSeconds: 2 * 60 },
};

export const EXPLORE_OFF = "Explore is off for this project";

/** What the rules need to know to start a reply. */
export interface ExploreFacts {
  /** The project's switch. */
  enabled: boolean;
  status: DraftStatus;
  /** When the session first started recording, if it has. */
  firstRecordedAt: number | null;
  /** Segments in the transcript. */
  segments: number;
  /** When the last reply finished, if any. */
  lastReply: Moment | null;
  now: Moment;
}

/**
 * Why Explore can't run now, or null when it can. The server enforces these,
 * and the page shows the same reason on its disabled button.
 */
export function whyNotExplore(facts: ExploreFacts): string | null {
  if (!facts.enabled) return EXPLORE_OFF;
  if (isWriting(facts.status)) return "A reply is on its way";
  const { sinceStart, sinceLast } = EXPLORE_WAITS;
  return (
    whyWaitStart("Explore", sinceStart, facts.firstRecordedAt, facts.now) ??
    (facts.segments === 0 ? "Nothing has been transcribed yet" : null) ??
    whyWaitLast("for the next reply", sinceLast, facts.lastReply, facts.now)
  );
}
