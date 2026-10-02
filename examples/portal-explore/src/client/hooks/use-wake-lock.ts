import { useRef } from "react";

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
