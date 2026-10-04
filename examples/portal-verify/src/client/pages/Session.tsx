import { useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { Button, Loader, Meter, Surface, Text } from "@cloudflare/kumo";
import {
  ArrowClockwiseIcon,
  CaretRightIcon,
  CheckCircleIcon,
  MicrophoneIcon,
  StopIcon,
} from "@phosphor-icons/react";
import { useNow } from "../hooks/use-now";
import { useVoiceRecorder } from "../hooks/use-voice-recorder";
import type {
  Segment,
  SessionAgent,
  SessionMessage,
  SessionState,
} from "../../server/session-agent";
import { MIN_RECORDED_SECONDS } from "../../shared/constants";
import { isWriting, recordedSecondsAt, whyNotVerify } from "../../shared/rules";
import { DEFAULT_TOPICS } from "../../shared/topics";
import { Shell } from "../ui";
import { Replay } from "./Replay";

/** For the recording phone: records, and shows the live transcript. */
export function Session({ projectId, sessionId }: { projectId: string; sessionId: string }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<SessionState | null>(null);

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
      .then(() => agent.call("listSegments"))
      .then(setSegments)
      .catch((e: Error) => setError(e.message));
  }, [agent, projectId]);

  const voice = useVoiceRecorder({ agent: "SessionAgent", name: sessionId });
  const recording = voice.status !== "idle";
  const now = useNow();
  const seconds = state ? recordedSecondsAt(state, now) : 0;
  const notYet = state
    ? whyNotVerify({
        verifyStatus: state.verifyStatus,
        recordedSeconds: seconds,
        segments: segments.length,
        lastVerifyAt: state.lastVerifyAt,
        now,
      })
    : "Connecting…";
  // The topic list, shown after a press on Verify.
  const [picking, setPicking] = useState(false);

  const verify = (topicKey: string) => {
    setError(null);
    setPicking(false);
    agent.call("verify", [topicKey]).catch((e: Error) => setError(e.message));
  };

  const record = async () => {
    setError(null);
    try {
      await voice.start();
      // The recorded time starts once the microphone is on.
      await agent.call("micReady");
    } catch (e) {
      voice.stop();
      setError((e as Error).message);
    }
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
        {replay ? null : voice.status === "starting" ? (
          <Button variant="primary" size="lg" icon={<MicrophoneIcon size={20} />} disabled>
            Waiting for the microphone…
          </Button>
        ) : recording ? (
          <Button
            variant="destructive"
            size="lg"
            icon={<StopIcon size={20} />}
            onClick={voice.stop}
          >
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
            icon={<CheckCircleIcon size={16} />}
            onClick={() => setPicking((p) => !p)}
            disabled={notYet !== null}
          >
            Verify
          </Button>
          {seconds < MIN_RECORDED_SECONDS && (
            <Meter
              className="w-full"
              label="Verify"
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

      {picking && notYet === null && <Topics verify={verify} />}
      {state && <Outcome state={state} retry={verify} />}

      <Surface className="p-4 rounded-xl ring ring-kumo-line">
        {/* Open on every load; whether it was closed isn't kept. */}
        <details open className="group">
          <summary className="flex items-center gap-1 cursor-pointer list-none text-xs text-kumo-subtle [&::-webkit-details-marker]:hidden">
            <CaretRightIcon size={12} className="transition-transform group-open:rotate-90" />
            Live transcript
          </summary>
          <div className="flex flex-col gap-2 mt-2 min-h-40">
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
          </div>
        </details>
      </Surface>

      {empty && !replay && (
        <a className="self-end text-xs text-kumo-subtle underline" href="?debug=true">
          debug
        </a>
      )}
    </Shell>
  );
}

/** What participants can verify. */
function Topics({ verify }: { verify: (topicKey: string) => void }) {
  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-2 items-start">
      <Text size="sm" bold>
        What do you want to verify?
      </Text>
      {DEFAULT_TOPICS.map((t) => (
        <Button key={t.key} variant="ghost" onClick={() => verify(t.key)}>
          {t.icon} {t.label}
        </Button>
      ))}
    </Surface>
  );
}

/** The outcome being written, the pending one, or why the last one failed. */
function Outcome({ state, retry }: { state: SessionState; retry: (topicKey: string) => void }) {
  const { verifyStatus, verifyDraft, verifyError, verifyTopicKey, pendingOutcome } = state;
  if (!isWriting(verifyStatus) && verifyStatus !== "failed" && !pendingOutcome) return null;
  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3">
      {isWriting(verifyStatus) && !verifyDraft && (
        <div className="flex gap-2 items-center">
          <Loader size="sm" />
          <Text size="sm" variant="secondary">
            {verifyStatus === "slow" ? "Still working on it…" : "Writing the outcome…"}
          </Text>
        </div>
      )}
      {isWriting(verifyStatus) && verifyDraft && (
        <p className="text-sm text-kumo-default whitespace-pre-wrap">{verifyDraft}</p>
      )}
      {verifyStatus === "failed" && (
        <div className="flex flex-col gap-2 items-start">
          <Text size="sm" variant="error">
            {verifyError}
          </Text>
          {verifyTopicKey && (
            <Button
              size="sm"
              variant="secondary"
              icon={<ArrowClockwiseIcon size={14} />}
              onClick={() => retry(verifyTopicKey)}
            >
              Try again
            </Button>
          )}
        </div>
      )}
      {!isWriting(verifyStatus) && pendingOutcome && (
        <>
          <Text size="xs" variant="secondary">
            {pendingOutcome.topicIcon} {pendingOutcome.topicLabel}
          </Text>
          <p className="text-sm text-kumo-default whitespace-pre-wrap">{pendingOutcome.content}</p>
        </>
      )}
    </Surface>
  );
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
