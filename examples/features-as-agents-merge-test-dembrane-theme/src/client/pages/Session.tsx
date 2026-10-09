import { useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { Box, Button, Group, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { CheckIcon, MicrophoneIcon, PauseIcon, StopIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/common/Toaster";
import { chunksKey } from "@/components/participant/hooks";
import { ParticipantBody } from "@/components/participant/ParticipantBody";
import { ParticipantRecordingWaveform } from "@/components/participant/ParticipantRecordingWaveform";
import { ParticipantSettingsModal } from "@/components/participant/ParticipantSettingsModal";
import { StopRecordingConfirmationModal } from "@/components/participant/StopRecordingConfirmationModal";
import { sessionName } from "@/lib/api";
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
import { ExploreEcho, ExploreReplies } from "../features/explore/Echo";
import { parse } from "../features/parse";
import type { PanelProps } from "../features/types";
import { useNow } from "../hooks/use-now";
import { useVoiceRecorder } from "../hooks/use-voice-recorder";
import { ParticipantPage } from "../participant";
import { InsecureNotice } from "../ui";
import { Replay } from "./Replay";

/**
 * For the recording phone, as echo's audio screen: its welcome and
 * instructions, what each feature shows, and the record bar at the bottom.
 * The page connects to the session for the microphone and the transcript;
 * each feature connects to its own agent.
 */
export function Session({ projectId, sessionId }: { projectId: string; sessionId: string }) {
  return (
    <ParticipantPage projectId={projectId}>
      {(_project, state) => (
        <SessionView projectId={projectId} sessionId={sessionId} project={state} />
      )}
    </ParticipantPage>
  );
}

function SessionView({
  projectId,
  sessionId,
  project,
}: {
  projectId: string;
  sessionId: string;
  project: ProjectState | null;
}) {
  const queryClient = useQueryClient();
  const [segments, setSegments] = useState<Segment[]>([]);
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

  // Joins the session to this page's project, with the name the start page
  // gave it, then loads what's there.
  useEffect(() => {
    agent.ready
      .then(() => agent.call("attach", [projectId, sessionName(sessionId)]))
      .then(() => agent.call("listSegments"))
      .then(setSegments)
      .catch((e: Error) => toast.error(e.message));
  }, [agent, projectId, sessionId]);

  const voice = useVoiceRecorder({ agent: "SessionAgent", name: sessionId });
  const isRecording = voice.status === "recording";
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

  // What was said, as echo's responses: each segment one, and what's being
  // said now, as it's heard.
  useEffect(() => {
    const chunk = (id: string, at: number, transcript: string): TConversationChunk => ({
      id,
      transcript,
      timestamp: new Date(at),
      created_at: new Date(at),
      updated_at: new Date(at),
      conversation_id: sessionId,
    });
    const chunks = segments.map((s) => chunk(`segment-${s.id}`, s.at, s.text));
    if (voice.interimTranscript) chunks.push(chunk("interim", Date.now(), voice.interimTranscript));
    queryClient.setQueryData(chunksKey(sessionId), chunks);
  }, [queryClient, sessionId, segments, voice.interimTranscript]);

  const voiceError = voice.error;
  useEffect(() => {
    if (voiceError) toast.error(voiceError);
  }, [voiceError]);

  const [stopOpened, { open: openStop, close: closeStop }] = useDisclosure(false);
  const [settingsOpened, { open: openSettings, close: closeSettings }] = useDisclosure(false);

  const record = async () => {
    try {
      await voice.start();
      // The recorded time starts once the microphone is on.
      await agent.call("micReady");
    } catch (e) {
      voice.stop();
      toast.error((e as Error).message);
    }
  };
  // As echo's Stop: the microphone stops, and the modal asks Resume or Finish.
  const stop = () => {
    voice.stop();
    openStop();
  };
  const finish = () => {
    location.assign(`/${encodeURIComponent(projectId)}/conversation/${sessionId}/finish`);
  };

  // Another page, or one that's gone, is recording this session.
  const elsewhere = voice.status === "idle" && state?.recordingSince != null;
  // `?debug=true` offers an audio file in place of the microphone, until
  // the session has anything in it.
  const empty =
    !!state?.projectId &&
    voice.status === "idle" &&
    state.recordingSince === null &&
    state.recordedSeconds === 0 &&
    segments.length === 0;
  const canReplay = new URLSearchParams(location.search).get("debug") === "true" && empty;
  // Stays up once shown, as the replay fills the session.
  const [replay, setReplay] = useState(false);
  useEffect(() => {
    if (canReplay) setReplay(true);
  }, [canReplay]);

  const exploreOn = !!project?.explore.enabled;
  const showTimer = isRecording || stopOpened;

  return (
    <Box className="container mx-auto flex h-full max-w-2xl flex-col justify-end">
      <ParticipantSettingsModal opened={settingsOpened} onClose={closeSettings} />
      <StopRecordingConfirmationModal
        opened={stopOpened}
        close={closeStop}
        isStopping={false}
        handleConfirmFinish={finish}
        handleResume={() => void record()}
        // This app has no text input.
        handleSwitchToText={() => toast.info("This example only records.")}
      />

      <Box className="relative flex-grow p-4 transition-all">
        <InsecureNotice />
        {replay && <Replay projectId={projectId} sessionId={sessionId} />}
        <ParticipantBody
          interleaveMessages={false}
          projectId={projectId}
          conversationId={sessionId}
          isRecording={isRecording}
        />
        {elsewhere && (
          <Text size="sm" c="dimmed">
            Another page is recording this session.
          </Text>
        )}
        <Stack gap="md">
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
          {exploreOn && <ExploreReplies projectId={projectId} sessionId={sessionId} />}
        </Stack>
        {empty && !replay && (
          <a className="mt-4 block text-right text-xs text-[var(--app-muted)]" href="?debug=true">
            debug
          </a>
        )}
      </Box>

      {/* echo's record bar, from ParticipantConversationAudio. */}
      <Stack
        bg="var(--app-background)"
        gap="lg"
        className="sticky bottom-0 z-10 w-full min-h-[84px] border-t p-4"
        style={{ borderColor: "var(--app-rule-color)" }}
      >
        {isRecording && (
          <ParticipantRecordingWaveform
            onSilence={openSettings}
            peekAudioLevel={voice.peekAudioLevel}
          />
        )}

        <Group justify="space-between">
          {showTimer && (
            <Group justify="center" align="center" gap="xs" mih={50}>
              {stopOpened ? (
                <PauseIcon size={20} />
              ) : (
                <div
                  className="h-4 w-4 animate-pulse rounded-full"
                  style={{ background: "var(--app-danger)" }}
                />
              )}
              <Text size="lg">{formatTime(seconds)}</Text>
            </Group>
          )}

          {!isRecording && !stopOpened && !replay && (
            <Group className="w-full" wrap="nowrap">
              <Button
                size="lg"
                variant="filled"
                leftSection={<MicrophoneIcon size={20} />}
                onClick={record}
                loading={voice.status === "starting"}
                disabled={!state?.projectId || elsewhere}
                className="flex-grow"
              >
                Record
              </Button>
              {seconds > 0 && (
                <Button
                  size="lg"
                  onClick={openStop}
                  leftSection={<CheckIcon size={20} className="hidden sm:block" />}
                  className="w-auto"
                >
                  Finish
                </Button>
              )}
            </Group>
          )}

          {/* Mounted while idle too, so replies keep arriving. */}
          <Group gap="lg" className={isRecording ? "" : "hidden"}>
            {project && exploreOn && (
              <ExploreEcho
                projectId={projectId}
                sessionId={sessionId}
                facts={facts}
                settings={project.explore}
                now={now}
                recording={isRecording}
              />
            )}
            {isRecording && (
              <Button
                size="lg"
                color="red"
                onClick={stop}
                className={exploreOn ? "" : "px-7 md:px-10"}
                leftSection={<StopIcon size={20} className="hidden md:block" />}
              >
                Stop
              </Button>
            )}
          </Group>
        </Group>
      </Stack>
    </Box>
  );
}

/** One feature's panel, from `FEATURE_UI`. */
function FeaturePanel<K extends FeatureKey>({ feature, ...props }: PanelProps<K> & { feature: K }) {
  const Panel = FEATURE_UI[feature].Panel as (props: PanelProps<K>) => React.ReactNode;
  return <Panel {...(props as PanelProps<K>)} />;
}

/** mm:ss, or hh:mm:ss past an hour, as echo's timer. */
function formatTime(seconds: number) {
  const s = Math.floor(seconds);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const hours = Math.floor(s / 3600);
  return `${hours > 0 ? `${pad(hours)}:` : ""}${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
