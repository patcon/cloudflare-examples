/**
 * Diarized transcripts travel as plain text, since that's all
 * `useVoiceInput` passes on. Each speaker change is marked in the text with
 * "[Speaker N]", numbered from 1, and the page splits the text on these
 * markers to color each speaker's words.
 */

/**
 * Nova 3 tells apart up to 8 speakers here, colored with ColorBrewer's Set2
 * palette. Speakers past the 8th reuse its colors.
 */
export const SPEAKER_COLORS = [
  "#66c2a5",
  "#fc8d62",
  "#8da0cb",
  "#e78ac3",
  "#a6d854",
  "#ffd92f",
  "#e5c494",
  "#b3b3b3"
];

export function speakerColor(speaker: number) {
  return SPEAKER_COLORS[(speaker - 1) % SPEAKER_COLORS.length];
}

/** Marks where a speaker starts. Nova 3 numbers speakers from 0. */
export function speakerMarker(nova3Speaker: number) {
  return `[Speaker ${nova3Speaker + 1}]`;
}

export interface SpeakerRun {
  /** Numbered from 1, or null for text without a marker. */
  speaker: number | null;
  text: string;
}

/**
 * Splits marked text into runs of one speaker each. Text before the first
 * marker, such as from before diarization was turned on, has no speaker.
 */
export function splitBySpeaker(text: string): SpeakerRun[] {
  const runs: SpeakerRun[] = [];
  // Split with a capture group alternates text and speaker numbers.
  const parts = text.split(/\s*\[Speaker (\d+)\]\s*/);
  let speaker: number | null = null;
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      speaker = Number(part);
      return;
    }
    if (!part) return;
    const last = runs.at(-1);
    if (last && last.speaker === speaker) last.text += ` ${part}`;
    else runs.push({ speaker, text: part });
  });
  return runs;
}

export function hasSpeakers(text: string) {
  return splitBySpeaker(text).some((run) => run.speaker !== null);
}

/** Plain text with one paragraph per speaker turn, for copying. */
export function labelSpeakers(text: string) {
  return splitBySpeaker(text)
    .map((run) =>
      run.speaker === null ? run.text : `Speaker ${run.speaker}: ${run.text}`
    )
    .join("\n\n");
}
