import { afterEach, describe, expect, it, vi } from "vitest";
import {
  failDraft,
  finishDraft,
  recoverDraft,
  startDraft,
  streamDraft,
} from "../src/server/lib/draft";
import { SLOW_AFTER_MS } from "../src/shared/constants";
import { IDLE_DRAFT, type DraftState } from "../src/shared/draft";

/** A stand-in for an agent: just its synced state, with every state it went through. */
function host(extra: Record<string, unknown> = {}) {
  const seen: (DraftState & Record<string, unknown>)[] = [];
  const h = {
    state: { ...IDLE_DRAFT, ...extra } as DraftState & Record<string, unknown>,
    setState(next: DraftState & Record<string, unknown>) {
      h.state = next;
      seen.push(next);
    },
  };
  return { h, seen };
}

async function* pieces(...texts: string[]) {
  for (const t of texts) yield t;
}

afterEach(() => vi.useRealTimers());

describe("draft", () => {
  it("streams pieces into the draft, and returns the whole text", async () => {
    const { h, seen } = host({ mine: 1 });
    startDraft(h);
    expect(h.state.status).toBe("waiting");
    expect(await streamDraft(h, pieces(" Hel", "lo "))).toBe("Hello");
    expect(seen.map((s) => [s.status, s.draft])).toEqual([
      ["waiting", ""],
      ["streaming", " Hel"],
      ["streaming", " Hello "],
    ]);
    finishDraft(h, { mine: 2 });
    expect(h.state).toEqual({ ...IDLE_DRAFT, mine: 2 });
  });

  it("throws on an empty answer", async () => {
    const { h } = host();
    await expect(streamDraft(h, pieces(" ", ""))).rejects.toThrow(/nothing back/);
  });

  it("turns slow with nothing back in time", async () => {
    vi.useFakeTimers();
    const { h } = host();
    startDraft(h);
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const done = streamDraft(
      h,
      (async function* () {
        await gate;
        yield "late";
      })(),
    );
    await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS);
    expect(h.state.status).toBe("slow");
    release();
    expect(await done).toBe("late");
  });

  it("fails with the reason, and recovers one cut off", () => {
    const { h } = host();
    failDraft(h, new Error("nope"));
    expect(h.state).toMatchObject({ status: "failed", error: "nope" });
    startDraft(h);
    recoverDraft(h);
    expect(h.state).toMatchObject({ status: "failed", error: "It was cut off. Try again." });
    finishDraft(h);
    recoverDraft(h);
    expect(h.state.status).toBe("idle");
  });
});
