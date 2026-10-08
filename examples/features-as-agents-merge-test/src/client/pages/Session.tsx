import { useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { Button, Surface, Text } from "@cloudflare/kumo";
import { CaretRightIcon, MicrophoneIcon, StopIcon } from "@phosphor-icons/react";
import type { ProjectState } from "../../server/project/agent";
import type {
  Segment,
  SessionAgent,
  SessionMessage,
  SessionState,
} from "../../server/session/agent";
import { FEATURE_KEYS, type FeatureKey } from "../../shared/features";
import { recordedSecondsAt, type SessionFacts } from "../../shared/rules";
import { FEATURE_UI } from "../features";
import { parse } from "../features/parse";
import type { PanelProps } from "../features/types";
import { useNow } from "../hooks/use-now";
import { useProject } from "../hooks/use-project";
import { useVoiceRecorder } from "../hooks/use-voice-recorder";
import { Shell } from "../ui";
import { Replay } from "./Replay";

/**
 * For the recording phone: records, and shows the live transcript, with a
 * panel for each feature the project has on. The page connects to the
 * session for the microphone and the transcript, and each panel connects to
 * its own feature's agent.
 */
export function Session({ projectId, sessionId }: { projectId: string; sessionId: string }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<SessionState | null>(null);

  const agent = useAgent<SessionAgent, SessionState>({
    agent: "SessionAgent",
    name: sessionId,
    onStateUpdate: setState,
    onMessage: (event) => {
      const message = parse<SessionMessage>(event.data);
      if (message?.type === "segment") {
        setSegments((s) =>
          s.some((x) => x.id === message.segment.id) ? s : [...s, message.segment],
        );
      }
    },
  });

  // The project's settings: which features are on, and how.
  const [project, setProject] = useState<ProjectState | null>(null);
  useProject(projectId, { onStateUpdate: setProject });

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
  // The same facts the feature agents ask the session for, live.
  const facts: SessionFacts = {
    projectId: state?.projectId ?? null,
    firstRecordedAt: state?.firstRecordedAt ?? null,
    recordedSeconds: seconds,
    segments: segments.length,
    recording: state?.recordingSince != null,
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
        {(error || voice.error) && (
          <Text size="sm" variant="error">
            {error || voice.error}
          </Text>
        )}
      </Surface>

      {project &&
        FEATURE_KEYS.filter((key) => project[key].enabled).map((key) => (
          <FeaturePanel
            key={key}
            feature={key}
            projectId={projectId}
            sessionId={sessionId}
            facts={facts}
            settings={project[key]}
            now={now}
          />
        ))}

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

/** One feature's panel, from `FEATURE_UI`. */
function FeaturePanel<K extends FeatureKey>({ feature, ...props }: PanelProps<K> & { feature: K }) {
  const Panel = FEATURE_UI[feature].Panel as (props: PanelProps<K>) => React.ReactNode;
  return <Panel {...(props as PanelProps<K>)} />;
}

function formatDuration(seconds: number) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
