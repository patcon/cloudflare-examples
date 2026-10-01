import { useRef, useState } from "react";

/** Speech stays clear at this rate, and an hour is about 11MB. */
const BITS_PER_SECOND = 24_000;
const PIECE_MS = 10_000;
const UPLOAD_TRIES = 4;

/** Opus first, for its size; Safari before 18.4 only records AAC in MP4. */
const FORMATS = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];

/**
 * Records a compressed copy of the microphone, beside `useVoiceInput`'s
 * stream, and uploads it in pieces as it goes. The server joins the pieces
 * and diarizes the whole recording once it stops.
 */
export function useRecordingUpload(projectId: string, sessionId: string) {
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const uploads = useRef<Promise<void>>(Promise.resolve());

  const url = (n: number) =>
    `/api/${encodeURIComponent(projectId)}/sessions/${sessionId}/recording/${n}`;

  async function upload(n: number, piece: Blob) {
    for (let attempt = 1; ; attempt++) {
      try {
        const resp = await fetch(url(n), {
          method: "PUT",
          headers: { "Content-Type": piece.type },
          body: piece,
        });
        if (resp.ok) return;
        // The server refused it, such as a gap. Trying again won't help.
        if (resp.status < 500) throw new Error(await resp.text());
      } catch (e) {
        if (attempt >= UPLOAD_TRIES) throw e;
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }

  async function start() {
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    const mimeType = FORMATS.find((f) => MediaRecorder.isTypeSupported(f));
    const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: BITS_PER_SECOND });
    let n = 0;
    rec.ondataavailable = (event) => {
      if (event.data.size === 0) return;
      const part = n++;
      // One at a time, in order, since the server expects them that way.
      uploads.current = uploads.current
        .then(() => upload(part, event.data))
        .catch((e: Error) => setError(`Uploading the recording failed: ${e.message}`));
    };
    rec.start(PIECE_MS);
    recorder.current = rec;
  }

  /** Stops, and resolves once the last piece is uploaded. */
  async function stop() {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    await new Promise<void>((resolve) => {
      rec.addEventListener("stop", () => resolve(), { once: true });
      rec.stop();
    });
    for (const track of rec.stream.getTracks()) track.stop();
    await uploads.current;
  }

  return { start, stop, error };
}

/** Keeps the phone's screen on while recording, where the browser allows. */
export function useWakeLock() {
  const lock = useRef<WakeLockSentinel | null>(null);
  return {
    async acquire() {
      try {
        lock.current = await navigator.wakeLock?.request("screen");
      } catch {
        // Not allowed here, such as in a background tab. Recording still works.
      }
    },
    release() {
      void lock.current?.release();
      lock.current = null;
    },
  };
}
