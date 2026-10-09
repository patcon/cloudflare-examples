import { describe, expect, it } from "vitest";
import { cutWindows, SAMPLE_RATE, toWav } from "./wav";

describe("cutWindows", () => {
  it("cuts into whole windows, then the rest", () => {
    const samples = new Float32Array(SAMPLE_RATE * 25);
    expect(cutWindows(samples, 10).map((w) => w.length)).toEqual([
      SAMPLE_RATE * 10,
      SAMPLE_RATE * 10,
      SAMPLE_RATE * 5,
    ]);
  });

  it("gives nothing for no audio", () => {
    expect(cutWindows(new Float32Array(0), 10)).toEqual([]);
  });
});

describe("toWav", () => {
  it("writes a 16kHz mono 16-bit header and clamped samples", () => {
    const wav = toWav(new Float32Array([0, 1, -1, 2]));
    const view = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.subarray(8, 12))).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([
      0, 0x7fff, -0x8000, 0x7fff,
    ]);
  });
});
