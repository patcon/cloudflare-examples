import { SAMPLE_RATE } from "./wav";

/**
 * Decodes an audio file the browser can play, then resamples it to 16kHz
 * mono, which is what the server's transcriber expects.
 */
export async function decodeTo16kMono(file: Blob): Promise<Float32Array> {
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await file.arrayBuffer());
  } finally {
    await context.close();
  }
  // Rendering into one channel mixes the others down.
  const offline = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * SAMPLE_RATE),
    SAMPLE_RATE,
  );
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

/** Formats Gemini takes, by extension, for files the browser can't name. */
const TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  webm: "audio/webm",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
};

export function audioType(file: File): string | null {
  if (file.type.startsWith("audio/")) return file.type;
  return TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}
