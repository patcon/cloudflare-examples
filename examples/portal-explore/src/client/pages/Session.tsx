import { useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { useVoiceInput } from "agents/voice/react";
import { Button, Surface, Text } from "@cloudflare/kumo";
import { MicrophoneIcon, StopIcon } from "@phosphor-icons/react";
import { useWakeLock } from "../audio/wake-lock";
import type {
  Segment,
  SessionAgent,
  SessionMessage,
  SessionState,
} from "../../server/session-agent";
import { Shell } from "../ui";
import { Replay } from "./Replay";

/** For the recording phone: records, and shows the live transcript. */
export function Session({ projectId, sessionId }: { projectId: string; sessionId: string }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  /** This page is recording. */
  const [recording, setRecording] = useState(false);

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
    },
  });

  // Joins the session to this page's project, then loads what's there.
  useEffect(() => {
    agent.ready
      .then(() => agent.call("attach", [projectId]))
      .then(() => agent.call("listSegments").then(setSegments))
      .catch((e: Error) => setError(e.message));
  }, [agent, projectId]);

  const voice = useVoiceInput({ agent: "SessionAgent", name: sessionId });
  const wakeLock = useWakeLock();
  const seconds = useRecordedSeconds(state);

  const record = async () => {
    setError(null);
    await voice.start();
    void wakeLock.acquire();
    setRecording(true);
  };

  const stop = () => {
    voice.stop();
    wakeLock.release();
    setRecording(false);
  };

  // Another page, or one that's gone, is recording this session.
  const elsewhere = !recording && state?.recordingSince != null;
  // `?debug=true` offers an audio file in place of the microphone, until
  // the session has anything in it.
  const empty =
    !!state?.projectId &&
    !recording &&
    state.recordingSince === null &&
    state.recordedSeconds === 0 &&
    segments.length === 0;
  const canReplay = new URLSearchParams(location.search).get("debug") === "true" && empty;
  // Stays up once shown, as the replay fills the session.
  const [replay, setReplay] = useState(false);
  useEffect(() => {
    if (canReplay) setReplay(true);
  }, [canReplay]);

  return (
    <Shell title={projectId}>
      {replay && <Replay projectId={projectId} sessionId={sessionId} />}
      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3 items-center">
        {replay ? null : recording ? (
          <Button variant="destructive" size="lg" icon={<StopIcon size={20} />} onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            icon={<MicrophoneIcon size={20} />}
            onClick={record}
            disabled={!state?.projectId || elsewhere}
          >
            {seconds > 0 ? "Record more" : "Record"}
          </Button>
        )}
        {elsewhere && (
          <Text size="sm" variant="secondary">
            Another page is recording this session.
          </Text>
        )}
        <Text size="xs" variant="secondary">
          Recorded {formatDuration(seconds)}
        </Text>
        {(error || voice.error) && (
          <Text size="sm" variant="error">
            {error || voice.error}
          </Text>
        )}
      </Surface>

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

/** The session's total recorded time, ticking while it records. */
function useRecordedSeconds(state: SessionState | null) {
  const [now, setNow] = useState(Date.now());
  const since = state?.recordingSince ?? null;
  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  if (!state) return 0;
  return state.recordedSeconds + (since === null ? 0 : Math.max(0, now - since) / 1000);
}

function formatDuration(seconds: number) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function parse(data: unknown): SessionMessage | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
