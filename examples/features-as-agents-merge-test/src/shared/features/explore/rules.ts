import { MIN_RECORDED_SECONDS } from "../../constants";
import { isWriting, type DraftStatus } from "../../draft";
import { cooldownLeft } from "../../rules";

/**
 * The wait between replies.
 * `frontend/src/components/participant/refine/hooks/useRefineSelectionCooldown.ts`:
 * `COOLDOWN_DURATION`. The original counts it from the button press, kept
 * in the browser; here it's counted on the server, from when the reply
 * finished.
 */
export const EXPLORE_COOLDOWN_MS = 2 * 60 * 1000;

export const EXPLORE_OFF = "Explore is off for this project";

/** What the rules need to know to start a reply. */
export interface ExploreFacts {
  /** The project's switch. */
  enabled: boolean;
  status: DraftStatus;
  /** Seconds recorded so far, counting a recording still going. */
  recordedSeconds: number;
  /** Segments in the transcript. */
  segments: number;
  /** When the last reply finished, if any. */
  lastReplyAt: number | null;
  now: number;
}

/**
 * Why Explore can't run now, or null when it can. The server enforces these,
 * and the page shows the same reason on its disabled button.
 */
export function whyNotExplore(facts: ExploreFacts): string | null {
  if (!facts.enabled) return EXPLORE_OFF;
  if (isWriting(facts.status)) return "A reply is on its way";
  if (facts.recordedSeconds < MIN_RECORDED_SECONDS) {
    return `Explore turns on after ${MIN_RECORDED_SECONDS} seconds of recording`;
  }
  if (facts.segments === 0) return "Nothing has been transcribed yet";
  const wait = cooldownLeft(facts.lastReplyAt, EXPLORE_COOLDOWN_MS, facts.now);
  if (wait > 0) return `Wait ${Math.ceil(wait / 1000)} seconds for the next reply`;
  return null;
}
