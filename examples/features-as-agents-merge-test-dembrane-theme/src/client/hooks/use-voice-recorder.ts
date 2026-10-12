import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceInput, type UseVoiceInputOptions } from "agents/voice/react";
import { useWakeLock } from "./use-wake-lock";

export type RecorderStatus = "idle" | "starting" | "recording";

/**
 * `useVoiceInput`, with a `start()` that rejects when the microphone is
 * refused or the session won't take the call, and that resolves only once
 * the session is listening. It also keeps the phone's screen on while
 * recording.
 *
 * `useVoiceInput` alone opens the call before it asks for the microphone,
 * then catches a refusal and only sets `error`, so its `start()` resolves
 * either way.
 */
export function useVoiceRecorder(options: UseVoiceInputOptions) {
  const voice = useVoiceInput(options);
  const wakeLock = useWakeLock();
  const [status, setStatus] = useState<RecorderStatus>("idle");
  // The microphone's level, for echo's waveform, which polls it.
  const level = useRef(0);
  level.current = voice.audioLevel;
  const peekAudioLevel = useCallback(() => level.current, []);

  // `voice.start()` resolves once the microphone is on here, before the
  // session has its transcriber and has taken the call (`onCallStart`). It
  // says it has with "listening", which sets `isListening`; until then, the
  // session would answer `micReady` with "This session isn't recording".
  const listening = useRef(false);
  listening.current = voice.isListening;
  const waiter = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);
  useEffect(() => {
    if (!waiter.current) return;
    if (voice.isListening) waiter.current.resolve();
    else if (voice.error) waiter.current.reject(new Error(voice.error));
    else return;
    waiter.current = null;
  }, [voice.isListening, voice.error]);
  const untilListening = () =>
    new Promise<void>((resolve, reject) => {
      if (listening.current) return resolve();
      const timer = setTimeout(() => {
        waiter.current = null;
        reject(new Error("The session didn't start listening. Try again."));
      }, 20_000);
      waiter.current = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
    });

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
      await untilListening();
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
    peekAudioLevel,
  };
}
