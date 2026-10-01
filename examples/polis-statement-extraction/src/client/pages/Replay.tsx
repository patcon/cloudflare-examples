import { useState } from "react";
import { Button, Surface, Text } from "@cloudflare/kumo";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { MAX_RECORDING_BYTES } from "../../shared/limits";
import { audioType, decodeTo16kMono } from "../audio/replay";
import { cutWindows, toWav } from "../audio/wav";

/** As often as the timer runs while recording. */
const WINDOW_SECONDS = 300;
/** The server's limit on one uploaded piece of the recording. */
const PIECE_BYTES = 1024 * 1024;

/**
 * For `?debug=true`: runs an audio file through the session in place of the
 * microphone. Each 5-minute window is transcribed by the batch model and
 * extracted from, as the live text would be. The file itself then becomes
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

      const type = audioType(file);
      if (!type || file.size > MAX_RECORDING_BYTES) {
        setProgress(
          `Done. The file is too large to tell speakers apart in one request (over ${MAX_RECORDING_BYTES / 1024 / 1024}MB), so there's no diarized pass. Opus at 24kbps fits about 80 minutes.`,
        );
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
        Instead of recording, each 5 minutes of the file is transcribed and extracted from, as if it
        had been said live. A 1-hour file is about 26 Gemini requests.
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
