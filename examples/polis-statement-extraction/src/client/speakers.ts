/**
 * Gemini tells speakers apart, numbered from 0. They're colored with
 * ColorBrewer's 8-color Set2 palette, as in `streaming-voice-input`.
 * Speakers past the 8th reuse its colors.
 */
export const SPEAKER_COLORS = [
  "#66c2a5",
  "#fc8d62",
  "#8da0cb",
  "#e78ac3",
  "#a6d854",
  "#ffd92f",
  "#e5c494",
  "#b3b3b3",
];

export function speakerColor(speaker: number) {
  return SPEAKER_COLORS[speaker % SPEAKER_COLORS.length];
}
