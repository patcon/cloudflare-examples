import { useEffect, useState } from "react";
import { Button, Surface, Text } from "@cloudflare/kumo";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { CONTEXT_SEGMENTS, MAX_DIARIZED_SECONDS, MAX_RECORDING_BYTES } from "../../shared/limits";
import { audioType, decodeTo16kMono } from "../audio/replay";
import { cutWindows, toWav } from "../audio/wav";

/**
 * How much of the file each window covers. 5 minutes matches the timer
 * while recording; shorter windows show statements sooner, but cost more
 * requests and give each run less context.
 */
const WINDOW_CHOICES = [30, 60, 120, 300];
/**
 * How many earlier segments each run sees, so a short window can still
 * follow an idea that started before it. Costs a little more per request.
 */
const CONTEXT_CHOICES = [CONTEXT_SEGMENTS, 5, 8, 12, 20];
/** The server's limit on one uploaded piece of the recording. */
const PIECE_BYTES = 1024 * 1024;

/** Why a file can't become the session's recording, so has no diarized pass. */
function noDiarizedPass(file: File, seconds: number | null): string | null {
  if (!audioType(file)) return "Gemini can't take this file's format";
  if (seconds !== null && seconds > MAX_DIARIZED_SECONDS) {
    return `it's ${Math.round(seconds / 60)} minutes long, and Gemini diarizes at most ${MAX_DIARIZED_SECONDS / 60}`;
  }
  if (file.size > MAX_RECORDING_BYTES) {
    return `${(file.size / 1024 / 1024).toFixed(1)}MB is over the ${MAX_RECORDING_BYTES / 1024 / 1024}MB that fits in one request`;
  }
  return null;
}

/** An audio file's length, from its metadata, without decoding it all. */
function useDuration(file: File | null): number | null {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    setSeconds(null);
    if (!file) return;
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) setSeconds(audio.duration);
    };
    audio.src = url;
    return () => {
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [file]);
  return seconds;
}

/**
 * For `?debug=true`: runs an audio file through the session in place of the
 * microphone. Each window is transcribed by the batch model and extracted
 * from, as the live text would be. The file itself then becomes
 * the session's recording, for the diarized pass.
 */
export function Replay({
  projectId,
  sessionId,
  finish,
}: {
  projectId: string;
  sessionId: string;
  finish: () => Promise<unknown>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const seconds = useDuration(file);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [windowSeconds, setWindowSeconds] = useState(300);
  const [context, setContext] = useState(CONTEXT_SEGMENTS);
  // A transcription and an extraction per window, then the diarized pass
  // and its extraction.
  const requestsPerHour = 2 * Math.ceil(3600 / windowSeconds) + 2;

  const base = `/api/${encodeURIComponent(projectId)}/sessions/${sessionId}`;

  async function run(file: File) {
    setRunning(true);
    setError(null);
    try {
      setProgress("Decoding…");
      const windows = cutWindows(await decodeTo16kMono(file), windowSeconds);
      for (const [i, samples] of windows.entries()) {
        setProgress(`Transcribing window ${i + 1} of ${windows.length}…`);
        const resp = await fetch(`${base}/replay?context=${context}`, {
          method: "POST",
          headers: { "Content-Type": "audio/wav" },
          body: toWav(samples),
        });
        if (!resp.ok) throw new Error(await resp.text());
      }

      const type = audioType(file);
      const problem = noDiarizedPass(file, seconds);
      if (!type || problem) {
        setProgress(`Done, with no diarized pass: ${problem}.`);
        return;
      }
      for (let n = 0; n * PIECE_BYTES < file.size; n++) {
        setProgress("Uploading the recording…");
        const resp = await fetch(`${base}/recording/${n}`, {
          method: "PUT",
          headers: { "Content-Type": type },
          body: file.slice(n * PIECE_BYTES, (n + 1) * PIECE_BYTES),
        });
        if (!resp.ok) throw new Error(await resp.text());
      }
      await finish();
      setProgress(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3">
      <Text size="sm" bold>
        Debug: replay an audio file
      </Text>
      <Text size="xs" variant="secondary">
        Instead of recording, each window of the file is transcribed and extracted from, as if it
        had been said live. A 1-hour file is about {requestsPerHour} Gemini requests.
      </Text>
      <label className="text-sm flex gap-2 items-center">
        Window
        <select
          value={windowSeconds}
          disabled={running}
          onChange={(e) => setWindowSeconds(Number(e.target.value))}
          className="rounded border border-kumo-line bg-kumo-base px-1"
        >
          {WINDOW_CHOICES.map((s) => (
            <option key={s} value={s}>
              {s < 60 ? `${s} seconds` : `${s / 60} minute${s === 60 ? "" : "s"}`}
              {s === 300 ? " (as when recording)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm flex gap-2 items-center">
        Context
        <select
          value={context}
          disabled={running}
          onChange={(e) => setContext(Number(e.target.value))}
          className="rounded border border-kumo-line bg-kumo-base px-1"
        >
          {CONTEXT_CHOICES.map((n) => (
            <option key={n} value={n}>
              {n} earlier segments{n === CONTEXT_SEGMENTS ? " (as when recording)" : ""}
            </option>
          ))}
        </select>
      </label>
      <input
        type="file"
        accept="audio/*"
        disabled={running}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-sm"
      />
      {file && noDiarizedPass(file, seconds) && (
        <Text size="sm" variant="error">
          Speakers won't be told apart: {noDiarizedPass(file, seconds)}. The live-style extraction
          still runs.
        </Text>
      )}
      <Button
        variant="primary"
        icon={<UploadSimpleIcon size={16} />}
        disabled={!file || running}
        onClick={() => file && run(file)}
      >
        Replay
      </Button>
      {progress && (
        <Text size="sm" variant="secondary">
          {progress}
        </Text>
      )}
      {error && (
        <Text size="sm" variant="error">
          {error}
        </Text>
      )}
    </Surface>
  );
}
