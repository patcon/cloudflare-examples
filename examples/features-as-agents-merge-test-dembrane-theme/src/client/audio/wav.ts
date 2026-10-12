/** What Gemini transcribes best from, and what the voice pipeline sends. */
export const SAMPLE_RATE = 16_000;

/** Cuts samples into windows of `seconds`, the last one shorter. */
export function cutWindows(samples: Float32Array, seconds: number): Float32Array[] {
  const size = Math.round(seconds * SAMPLE_RATE);
  const windows: Float32Array[] = [];
  for (let start = 0; start < samples.length; start += size) {
    windows.push(samples.subarray(start, start + size));
  }
  return windows;
}

/** 16-bit mono PCM WAV, at `SAMPLE_RATE`. */
export function toWav(samples: Float32Array): Uint8Array<ArrayBuffer> {
  const wav = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(wav.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per sample
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return wav;
}
