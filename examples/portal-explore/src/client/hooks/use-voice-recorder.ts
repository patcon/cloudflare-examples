import { useEffect, useState } from "react";
import { useVoiceInput, type UseVoiceInputOptions } from "agents/voice/react";
import { useWakeLock } from "./use-wake-lock";

export type RecorderStatus = "idle" | "starting" | "recording";

/**
 * `useVoiceInput`, with a `start()` that rejects when the microphone is
 * refused, and that resolves only once it's on. It also keeps the phone's
 * screen on while recording.
 *
 * `useVoiceInput` alone opens the call before it asks for the microphone,
 * then catches a refusal and only sets `error`, so its `start()` resolves
 * either way.
 */
export function useVoiceRecorder(options: UseVoiceInputOptions) {
  const voice = useVoiceInput(options);
  const wakeLock = useWakeLock();
  const [status, setStatus] = useState<RecorderStatus>("idle");

  async function start() {
    if (status !== "idle") return;
    setStatus("starting");
    try {
      // Asks first, so a refusal throws here, before any call opens.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
    } catch (e) {
      setStatus("idle");
      throw new Error(`Couldn't use the microphone: ${(e as Error).message}`);
    }
    try {
      await voice.start();
    } catch (e) {
      voice.stop();
      setStatus("idle");
      throw e;
    }
    void wakeLock.acquire();
    setStatus("recording");
  }

  function stop() {
    voice.stop();
    wakeLock.release();
    setStatus("idle");
  }

  // The microphone failed after all, such as one in use by another app.
  // `voice.error` keeps saying why.
  useEffect(() => {
    if (status === "recording" && voice.error) stop();
  });

  return {
    status,
    start,
    stop,
    error: voice.error,
    interimTranscript: voice.interimTranscript,
  };
}
