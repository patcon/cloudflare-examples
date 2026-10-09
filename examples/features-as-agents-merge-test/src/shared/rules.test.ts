import { describe, expect, it } from "vitest";
import { recordedSecondsAt, waitLeft, whyWaitLast, whyWaitStart } from "./rules";

const now = { at: 1_000_000, recordedSeconds: 100 };
const both = { elapsedSeconds: 120, recordedSeconds: 30 };

describe("recordedSecondsAt", () => {
  it("adds a recording still going to the total", () => {
    expect(recordedSecondsAt({ recordedSeconds: 30, recordingSince: null }, 5000)).toBe(30);
    expect(recordedSecondsAt({ recordedSeconds: 30, recordingSince: 1000 }, 5000)).toBe(34);
  });
});

describe("waitLeft", () => {
  it("waits on recorded time first, then elapsed time", () => {
    expect(waitLeft(both, { at: now.at, recordedSeconds: 90 }, now)).toEqual({
      clock: "recorded",
      seconds: 20,
    });
    expect(waitLeft(both, { at: now.at - 100_000, recordedSeconds: 50 }, now)).toEqual({
      clock: "elapsed",
      seconds: 20,
    });
  });

  it("is over once both clocks have passed", () => {
    expect(waitLeft(both, { at: now.at - 120_000, recordedSeconds: 70 }, now)).toBeNull();
  });
});

describe("whyWaitStart", () => {
  it("counts from the first recording start", () => {
    const early = { at: now.at, recordedSeconds: 10 };
    expect(whyWaitStart("Explore", both, now.at - 5000, early)).toBe(
      "Explore turns on after 20 more seconds of recording",
    );
    expect(whyWaitStart("Explore", both, now.at - 100_000, now)).toBe(
      "Explore turns on in 20 seconds",
    );
    expect(whyWaitStart("Explore", both, now.at - 120_000, now)).toBeNull();
  });

  it("has the whole wait left before recording starts", () => {
    const elapsedOnly = { elapsedSeconds: 120, recordedSeconds: 0 };
    expect(whyWaitStart("Explore", elapsedOnly, null, { at: now.at, recordedSeconds: 0 })).toBe(
      "Explore turns on 120 seconds after recording starts",
    );
  });
});

describe("whyWaitLast", () => {
  it("doesn't wait before the action has run", () => {
    expect(whyWaitLast("for the next reply", both, null, now)).toBeNull();
  });

  it("says which clock it waits on", () => {
    expect(whyWaitLast("for the next reply", both, { at: now.at, recordedSeconds: 90 }, now)).toBe(
      "Record 20 more seconds for the next reply",
    );
    expect(
      whyWaitLast("for the next reply", both, { at: now.at - 100_000, recordedSeconds: 0 }, now),
    ).toBe("Wait 20 seconds for the next reply");
  });
});
