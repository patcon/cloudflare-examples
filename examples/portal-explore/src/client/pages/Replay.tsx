import { useState } from "react";
import { Button, Surface, Text } from "@cloudflare/kumo";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { decodeTo16kMono } from "../audio/replay";
import { cutWindows, toWav } from "../audio/wav";

/** How much of the file each batch transcription covers. */
const WINDOW_SECONDS = 300;

/**
 * For `?debug=true`: runs an audio file through the session in place of the
 * microphone. Each window is transcribed by the batch model, and its
 * segments join the live transcript as if they'd been said.
 */
export function Replay({ projectId, sessionId }: { projectId: string; sessionId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const base = `/api/${encodeURIComponent(projectId)}/sessions/${sessionId}`;

  async function run(file: File) {
    setRunning(true);
    setError(null);
    try {
      setProgress("Decoding…");
      const windows = cutWindows(await decodeTo16kMono(file), WINDOW_SECONDS);
      for (const [i, samples] of windows.entries()) {
        setProgress(`Transcribing window ${i + 1} of ${windows.length}…`);
        const resp = await fetch(`${base}/replay`, {
          method: "POST",
          headers: { "Content-Type": "audio/wav" },
          body: toWav(samples),
        });
        if (!resp.ok) throw new Error(await resp.text());
      }
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
        Instead of recording, each {WINDOW_SECONDS / 60} minutes of the file is transcribed and
        added to the transcript, as if it had been said live. Its length counts as recorded time.
      </Text>
      <input
        type="file"
        accept="audio/*"
        disabled={running}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-sm"
      />
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
