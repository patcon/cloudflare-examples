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
