import { SLOW_AFTER_MS } from "../../shared/constants";
import { isWriting, type DraftState } from "../../shared/draft";

/**
 * The agent a draft streams into: anything with synced state holding the
 * draft fields. Swapping this hand-rolled pattern for the SDK's `Streams`
 * capability would only change this file.
 */
interface Host<S extends DraftState> {
  readonly state: S;
  setState(state: S): void;
}

/** Marks a draft as asked for. Call before anything awaits, so a second press is refused. */
export function startDraft<S extends DraftState>(host: Host<S>) {
  host.setState({ ...host.state, status: "waiting", draft: "", error: null });
}

/**
 * Streams the pieces into `draft`, and returns the whole text, trimmed.
 * With nothing back by `SLOW_AFTER_MS`, the status turns `slow`, so the page
 * says it's still working. Throws on an empty answer.
 */
export async function streamDraft<S extends DraftState>(
  host: Host<S>,
  pieces: AsyncIterable<string>,
): Promise<string> {
  const slow = setTimeout(() => {
    if (host.state.status === "waiting") host.setState({ ...host.state, status: "slow" });
  }, SLOW_AFTER_MS);
  try {
    let text = "";
    for await (const piece of pieces) {
      clearTimeout(slow);
      text += piece;
      host.setState({ ...host.state, status: "streaming", draft: text });
    }
    if (!text.trim()) throw new Error("Gemini sent nothing back");
    return text.trim();
  } finally {
    clearTimeout(slow);
  }
}

/** Back to idle, once the caller has saved the text. Pass any of its own fields to set at once. */
export function finishDraft<S extends DraftState>(host: Host<S>, extra: Partial<S> = {}) {
  host.setState({ ...host.state, status: "idle", draft: "", error: null, ...extra });
}

export function failDraft<S extends DraftState>(host: Host<S>, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  host.setState({ ...host.state, status: "failed", draft: "", error: message });
}

/**
 * For `onStart`: a fresh instance has nothing streaming, so a draft that was
 * on its way was cut off, such as by a deploy.
 */
export function recoverDraft<S extends DraftState>(host: Host<S>) {
  if (isWriting(host.state.status)) failDraft(host, "It was cut off. Try again.");
}
