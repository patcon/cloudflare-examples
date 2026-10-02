import { useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { useVoiceInput } from "agents/voice/react";
import { Button, Loader, Meter, Surface, Text } from "@cloudflare/kumo";
import { ArrowClockwiseIcon, MicrophoneIcon, SparkleIcon, StopIcon } from "@phosphor-icons/react";
import { useWakeLock } from "../audio/wake-lock";
import type {
  Reply,
  Segment,
  SessionAgent,
  SessionMessage,
  SessionState,
} from "../../server/session-agent";
import { MIN_RECORDED_SECONDS } from "../../shared/limits";
import { recordedSecondsAt, whyNotExplore } from "../../shared/rules";
import { Shell } from "../ui";
import { Replay } from "./Replay";

/** For the recording phone: records, and shows the live transcript. */
export function Session({ projectId, sessionId }: { projectId: string; sessionId: string }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  /** This page is recording, or waiting for the microphone to start. */
  const [recording, setRecording] = useState<"starting" | "recording" | null>(null);

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
      if (message?.type === "reply") {
        setReplies((r) => (r.some((x) => x.id === message.reply.id) ? r : [...r, message.reply]));
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
          agent.call("listReplies").then(setReplies),
        ]),
      )
      .catch((e: Error) => setError(e.message));
  }, [agent, projectId]);

  const voice = useVoiceInput({ agent: "SessionAgent", name: sessionId });
  const wakeLock = useWakeLock();
  const now = useNow();
  const seconds = state ? recordedSecondsAt(state, now) : 0;
  const notYet = state
    ? whyNotExplore({
        recordedSeconds: seconds,
        segments: segments.length,
        lastReplyAt: state.lastReplyAt,
        replyStatus: state.replyStatus,
        now,
      })
    : "Connecting…";

  const explore = () => {
    setError(null);
    agent.call("explore").catch((e: Error) => setError(e.message));
  };

  const record = async () => {
    setError(null);
    setRecording("starting");
    try {
      // Asks for the microphone before the call: `voice.start()` opens the
      // call first, and reports a refusal only through `voice.error`.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
    } catch (e) {
      setRecording(null);
      setError(`Couldn't use the microphone: ${(e as Error).message}`);
      return;
    }
    try {
      await voice.start();
      await agent.call("micReady");
    } catch (e) {
      voice.stop();
      setRecording(null);
      setError(`Couldn't start recording: ${(e as Error).message}`);
      return;
    }
    void wakeLock.acquire();
    setRecording("recording");
  };

  const stop = () => {
    voice.stop();
    wakeLock.release();
    setRecording(null);
  };

  // The microphone failed after all, such as one in use by another app.
  // The error stays on the page.
  useEffect(() => {
    if (recording === "recording" && voice.error) stop();
  });

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
        {replay ? null : recording === "starting" ? (
          <Button variant="primary" size="lg" icon={<MicrophoneIcon size={20} />} disabled>
            Waiting for the microphone…
          </Button>
        ) : recording ? (
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
        <div className="flex flex-col gap-1 items-center w-full max-w-xs">
          <Button
            variant="secondary"
            icon={<SparkleIcon size={16} />}
            onClick={explore}
            disabled={notYet !== null}
          >
            Explore
          </Button>
          {seconds < MIN_RECORDED_SECONDS && (
            <Meter
              className="w-full"
              label="Explore"
              showValue={false}
              value={(100 * seconds) / MIN_RECORDED_SECONDS}
            />
          )}
          {notYet && (
            <Text size="xs" variant="secondary">
              {notYet}
            </Text>
          )}
        </div>
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

      {state && (replies.length > 0 || state.replyStatus !== "idle") && (
        <Replies replies={replies} state={state} retry={explore} />
      )}

      {empty && !replay && (
        <a className="self-end text-xs text-kumo-subtle underline" href="?debug=true">
          debug
        </a>
      )}
    </Shell>
  );
}

/** Explore's replies, then the one on its way, or why it failed. */
function Replies({
  replies,
  state,
  retry,
}: {
  replies: Reply[];
  state: SessionState;
  retry: () => void;
}) {
  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3">
      <Text size="xs" variant="secondary">
        Replies
      </Text>
      {replies.map((r) => (
        <div key={r.id} className="flex flex-col gap-0.5">
          <Text size="xs" variant="secondary">
            {new Date(r.at).toLocaleTimeString()}
          </Text>
          <p className="text-sm text-kumo-default">{r.text}</p>
        </div>
      ))}
      {(state.replyStatus === "thinking" || state.replyStatus === "slow") && (
        <div className="flex gap-2 items-center">
          <Loader size="sm" />
          <Text size="sm" variant="secondary">
            {state.replyStatus === "slow" ? "Still working on it…" : "Thinking…"}
          </Text>
        </div>
      )}
      {state.replyStatus === "streaming" && (
        <p className="text-sm text-kumo-default">{state.replyDraft}</p>
      )}
      {state.replyStatus === "failed" && (
        <div className="flex flex-col gap-2 items-start">
          <Text size="sm" variant="error">
            {state.replyError}
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
    </Surface>
  );
}

/** The time, ticking each second, for the recorded time and the cooldown. */
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
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
