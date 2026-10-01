import { useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { useVoiceInput } from "agents/voice/react";
import { Badge, Button, Surface, Text } from "@cloudflare/kumo";
import { LightningIcon, MicrophoneIcon, StopIcon } from "@phosphor-icons/react";
import type {
  Segment,
  WindowRow,
  SessionAgent,
  SessionMessage,
  SessionState
} from "../session-agent";
import { Shell } from "../ui";

/** For the recording phone: records, and shows the live transcript. */
export function Session({
  projectId,
  sessionId
}: {
  projectId: string;
  sessionId: string;
}) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const [windows, setWindows] = useState<WindowRow[]>([]);

  const agent = useAgent<SessionAgent, SessionState>({
    agent: "SessionAgent",
    name: sessionId,
    onStateUpdate: setState,
    onMessage: (event) => {
      const message = parse(event.data);
      if (message?.type === "segment") {
        setSegments((s) =>
          s.some((x) => x.id === message.segment.id)
            ? s
            : [...s, message.segment]
        );
      }
      if (message?.type === "windows") {
        agent.call("listWindows").then(setWindows);
      }
    }
  });

  // Joins the session to this page's project, then loads what's been said.
  useEffect(() => {
    agent.ready
      .then(() => agent.call("attach", [projectId]))
      .then(() => agent.call("listSegments"))
      .then(setSegments)
      .then(() => agent.call("listWindows"))
      .then(setWindows)
      .catch((e: Error) => setAttachError(e.message));
  }, [agent, projectId]);

  const voice = useVoiceInput({ agent: "SessionAgent", name: sessionId });

  return (
    <Shell title={projectId}>
      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3 items-center">
        {voice.isListening ? (
          <Button variant="destructive" size="lg" icon={<StopIcon size={20} />} onClick={voice.stop}>
            Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            icon={<MicrophoneIcon size={20} />}
            onClick={voice.start}
            disabled={!state?.projectId}
          >
            Record
          </Button>
        )}
        {(attachError || voice.error) && (
          <Text size="sm" variant="error">
            {attachError || voice.error}
          </Text>
        )}
        <div className="flex gap-3 items-center">
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
          >
            Open the review page
          </a>
        </div>
        {windows[0] && <LastRun run={windows[0]} />}
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
    </Shell>
  );
}

/** The last extraction run, as one line. */
function LastRun({ run }: { run: WindowRow }) {
  const when = new Date(run.created_at).toLocaleTimeString();
  if (run.status === "running") {
    return <Text size="xs" variant="secondary">Extracting statements…</Text>;
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
