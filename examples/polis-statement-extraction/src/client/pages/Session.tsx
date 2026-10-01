import { useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { useVoiceInput } from "agents/voice/react";
import { Badge, Button, Loader, Surface, Text } from "@cloudflare/kumo";
import {
  ArrowClockwiseIcon,
  CheckIcon,
  LightningIcon,
  MicrophoneIcon,
  StopIcon,
} from "@phosphor-icons/react";
import { useRecordingUpload, useWakeLock } from "../audio/recorder";
import type {
  FinalSegment,
  Segment,
  SessionAgent,
  SessionMessage,
  SessionState,
  WindowRow,
} from "../../server/session-agent";
import { speakerColor } from "../speakers";
import { Shell } from "../ui";
import { Replay } from "./Replay";

/** For the recording phone: records, and shows the live transcript. */
export function Session({ projectId, sessionId }: { projectId: string; sessionId: string }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [finalSegments, setFinalSegments] = useState<FinalSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const [windows, setWindows] = useState<WindowRow[]>([]);
  /** This page is recording, or still uploading after Stop. */
  const [busy, setBusy] = useState<"recording" | "stopping" | null>(null);

  const agent = useAgent<SessionAgent, SessionState>({
    agent: "SessionAgent",
    name: sessionId,
    onStateUpdate: setState,
    onMessage: (event) => {
      const message = parse(event.data);
      if (message?.type === "segment") {
        setSegments((s) =>
          s.some((x) => x.id === message.segment.id) ? s : [...s, message.segment],
        );
      }
      if (message?.type === "windows") {
        agent.call("listWindows").then(setWindows);
      }
      if (message?.type === "final") {
        agent.call("listFinalTranscript").then(setFinalSegments);
      }
    },
  });

  // Joins the session to this page's project, then loads what's there.
  useEffect(() => {
    agent.ready
      .then(() => agent.call("attach", [projectId]))
      .then(() =>
        Promise.all([
          agent.call("listSegments").then(setSegments),
          agent.call("listWindows").then(setWindows),
          agent.call("listFinalTranscript").then(setFinalSegments),
        ]),
      )
      .catch((e: Error) => setError(e.message));
  }, [agent, projectId]);

  const voice = useVoiceInput({ agent: "SessionAgent", name: sessionId });
  const upload = useRecordingUpload(projectId, sessionId);
  const wakeLock = useWakeLock();

  const record = async () => {
    setError(null);
    await voice.start();
    try {
      await upload.start();
    } catch (e) {
      setError(`Only the live transcript will be kept: recording failed (${(e as Error).message})`);
    }
    void wakeLock.acquire();
    setBusy("recording");
  };

  const stop = async () => {
    if (!confirm("End this session? It can't be recorded again.")) return;
    voice.stop();
    wakeLock.release();
    setBusy("stopping");
    try {
      await upload.stop();
      await agent.call("finish");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const ended = !!state?.final;
  // Recorded before, on a page that's gone, and never finished.
  const interrupted = !busy && !ended && !!state?.audio;
  // `?debug=true` offers an audio file in place of the microphone, until
  // the session has anything in it.
  const empty = !!state?.projectId && !busy && !ended && !state.audio && segments.length === 0;
  const canReplay = new URLSearchParams(location.search).get("debug") === "true" && empty;
  // Stays up once shown, as the replay fills the session.
  const [replay, setReplay] = useState(false);
  useEffect(() => {
    if (canReplay) setReplay(true);
  }, [canReplay]);

  return (
    <Shell title={projectId}>
      {replay && (
        <Replay projectId={projectId} sessionId={sessionId} finish={() => agent.call("finish")} />
      )}
      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3 items-center">
        {replay ? null : busy === "recording" ? (
          <Button variant="destructive" size="lg" icon={<StopIcon size={20} />} onClick={stop}>
            Stop and end the session
          </Button>
        ) : busy === "stopping" ? (
          <Text size="sm" variant="secondary">
            Uploading the last of the recording…
          </Text>
        ) : interrupted ? (
          <>
            <Text size="sm">
              This session's recording was interrupted. Finish it to tell speakers apart in what was
              recorded, or start a new session.
            </Text>
            <div className="flex gap-2">
              <Button
                variant="primary"
                icon={<CheckIcon size={16} />}
                onClick={() => agent.call("finish")}
              >
                Finish
              </Button>
              <Button
                variant="secondary"
                onClick={() => (location.href = `/${encodeURIComponent(projectId)}/start`)}
              >
                New session
              </Button>
            </div>
          </>
        ) : ended ? (
          <Button
            variant="secondary"
            onClick={() => (location.href = `/${encodeURIComponent(projectId)}/start`)}
          >
            Start a new session
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            icon={<MicrophoneIcon size={20} />}
            onClick={record}
            disabled={!state?.projectId}
          >
            Record
          </Button>
        )}
        {(error || voice.error || upload.error) && (
          <Text size="sm" variant="error">
            {error || voice.error || upload.error}
          </Text>
        )}
        <div className="flex gap-3 items-center flex-wrap justify-center">
          <Button
            size="sm"
            variant="secondary"
            icon={<LightningIcon size={14} />}
            onClick={() => agent.call("extractNow")}
            disabled={segments.length === 0}
          >
            Extract now
          </Button>
          <a
            className="text-sm underline"
            href={`/${encodeURIComponent(projectId)}/review`}
            target="_blank"
            rel="noreferrer"
          >
            Open the review page
          </a>
        </div>
        {windows[0] && <LastRun run={windows[0]} />}
        {state?.audio && (
          <Text size="xs" variant="secondary">
            Recording kept: {(state.audio.bytes / 1024 / 1024).toFixed(1)}MB
            {" · "}
            <a
              className="underline"
              href={`/api/${encodeURIComponent(projectId)}/sessions/${sessionId}/recording`}
            >
              listen
            </a>
          </Text>
        )}
      </Surface>

      {state?.final && (
        <FinalTranscript
          final={state.final}
          segments={finalSegments}
          retry={() => agent.call("retryFinish")}
        />
      )}

      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-2 min-h-48">
        <Text size="xs" variant="secondary">
          Live transcript
        </Text>
        {segments.length === 0 && !voice.interimTranscript && (
          <Text size="sm" variant="secondary">
            Nothing yet.
          </Text>
        )}
        {segments.map((s) => (
          <p key={s.id} className="text-sm text-kumo-default">
            {s.text}
          </p>
        ))}
        {voice.interimTranscript && (
          <p className="text-sm text-kumo-subtle">{voice.interimTranscript}</p>
        )}
      </Surface>

      {empty && !replay && (
        <a className="self-end text-xs text-kumo-subtle underline" href="?debug=true">
          debug
        </a>
      )}
    </Shell>
  );
}

/** The whole recording, transcribed again once it stopped, by speaker. */
function FinalTranscript({
  final,
  segments,
  retry,
}: {
  final: NonNullable<SessionState["final"]>;
  segments: FinalSegment[];
  retry: () => void;
}) {
  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-2">
      <Text size="xs" variant="secondary">
        Whole session, by speaker
      </Text>
      {final.status === "running" && segments.length === 0 && (
        <div className="flex gap-2 items-center">
          <Loader size="sm" />
          <Text size="sm" variant="secondary">
            Telling speakers apart. A long session can take a few minutes.
          </Text>
        </div>
      )}
      {final.status === "failed" && (
        <div className="flex flex-col gap-2 items-start">
          <Text size="sm" variant="error">
            {final.error}
          </Text>
          <Button
            size="sm"
            variant="secondary"
            icon={<ArrowClockwiseIcon size={14} />}
            onClick={retry}
          >
            Try again
          </Button>
        </div>
      )}
      {segments.map((s) => (
        <p key={s.seq} className="text-sm text-kumo-default flex gap-2">
          {s.speaker !== null && (
            <span
              className="shrink-0 rounded px-1.5 text-xs leading-5 text-black"
              style={{ backgroundColor: speakerColor(s.speaker) }}
            >
              Speaker {s.speaker + 1}
            </span>
          )}
          <span>{s.text}</span>
        </p>
      ))}
      {final.status === "running" && segments.length > 0 && (
        <Text size="xs" variant="secondary">
          Looking for statements across the whole session…
        </Text>
      )}
      {final.status === "done" && final.kept !== undefined && (
        <div className="flex gap-2 items-center">
          <Text size="xs" variant="secondary">
            Statements from the whole session
          </Text>
          <Badge variant="secondary">{final.kept} sent to review</Badge>
        </div>
      )}
    </Surface>
  );
}

/** The last extraction run, as one line. */
function LastRun({ run }: { run: WindowRow }) {
  const when = new Date(run.created_at).toLocaleTimeString();
  if (run.status === "running") {
    return (
      <Text size="xs" variant="secondary">
        Extracting statements…
      </Text>
    );
  }
  if (run.status === "failed") {
    return (
      <Text size="xs" variant="error">
        Extraction at {when} failed: {run.error}
      </Text>
    );
  }
  return (
    <div className="flex gap-2 items-center">
      <Text size="xs" variant="secondary">
        Last extraction {when}
      </Text>
      <Badge variant="secondary">{run.kept} sent to review</Badge>
    </div>
  );
}

function parse(data: unknown): SessionMessage | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
