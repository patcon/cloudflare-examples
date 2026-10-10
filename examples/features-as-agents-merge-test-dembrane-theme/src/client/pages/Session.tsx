import { useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { useLocation, useNavigate } from "react-router";
import { Box, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useDisclosure, useLocalStorage } from "@mantine/hooks";
import { CheckIcon, MicrophoneIcon, PauseIcon, PlayIcon, StopIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/common/Toaster";
import { chunksKey } from "@/components/participant/hooks";
import { ParticipantBody } from "@/components/participant/ParticipantBody";
import { ParticipantRecordingWaveform } from "@/components/participant/ParticipantRecordingWaveform";
import { ParticipantSettingsModal } from "@/components/participant/ParticipantSettingsModal";
import { RefineSelection } from "@/components/participant/refine/RefineSelection";
import { StopRecordingConfirmationModal } from "@/components/participant/StopRecordingConfirmationModal";
import { VerifiedArtefactsList } from "@/components/participant/verify/VerifiedArtefactsList";
import { VerifyArtefact } from "@/components/participant/verify/VerifyArtefact";
import { VerifySelection } from "@/components/participant/verify/VerifySelection";
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
import { ExploreReplies } from "../features/explore/Bridge";
import { parse } from "../features/parse";
import type { PanelProps } from "../features/types";
import { useNow } from "../hooks/use-now";
import { useVoiceRecorder } from "../hooks/use-voice-recorder";
import { ParticipantPage } from "../participant";
import { InsecureNotice } from "../ui";
import { Replay } from "./Replay";

/** As echo's, the time recorded before the ECHO button opens its screens. */
const REFINE_BUTTON_THRESHOLD_SECONDS = 60;

/**
 * For the recording phone, as echo's audio screen: its welcome and
 * instructions, what each feature shows, and the record bar at the bottom.
 * The ECHO button opens echo's screens for Verify and Explore (refine,
 * verify, verify/approve) above the same bar, so the recording carries on.
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
  const navigate = useNavigate();
  const conversationUrl = `/${encodeURIComponent(projectId)}/conversation/${sessionId}`;
  // echo's screen under the conversation, if one's open.
  const screen = useLocation()
    .pathname.slice(conversationUrl.length)
    .replace(/^\/|\/$/g, "");
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

  // The project's Pause button: Pause pauses in place, with no modal, and
  // Stop pauses and asks to resume or finish.
  const pauseMode = !!project?.general.pauseButton;
  const [paused, setPaused] = useState(false);
  const [pausedOpened, { open: openPaused, close: closePaused }] = useDisclosure(false);

  const record = async () => {
    try {
      await voice.start();
      // The recorded time starts once the microphone is on.
      await agent.call("micReady");
      setPaused(false);
    } catch (e) {
      voice.stop();
      toast.error((e as Error).message);
    }
  };
  // As echo's Stop: the microphone stops, and the modal asks Resume or Finish.
  // With the Pause button, it pauses, then asks the same, in this app's
  // modal.
  const stop = () => {
    voice.stop();
    if (pauseMode) {
      setPaused(true);
      openPaused();
    } else {
      openStop();
    }
  };
  const pause = () => {
    voice.stop();
    setPaused(true);
  };
  const finish = () => navigate(`${conversationUrl}/finish`);

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
  const verifyOn = !!project?.verify.enabled;
  const isPaused = pauseMode && (paused || pausedOpened) && !isRecording;
  const showTimer = isRecording || stopOpened || isPaused;

  // echo's ECHO button: until a minute's recorded, it fills, and a press
  // says how long is left. Explore turns it off while its reply comes.
  const [refineInfoOpened, { open: openRefineInfo, close: closeRefineInfo }] = useDisclosure(false);
  const [isRefineDisabled] = useLocalStorage({
    defaultValue: false,
    key: `refine_disabled_${sessionId}`,
  });
  useEffect(() => {
    if (refineInfoOpened && seconds >= REFINE_BUTTON_THRESHOLD_SECONDS) closeRefineInfo();
  }, [refineInfoOpened, seconds, closeRefineInfo]);
  const refineProgress = Math.min((seconds / REFINE_BUTTON_THRESHOLD_SECONDS) * 100, 100);
  const remainingTime = Math.max(0, REFINE_BUTTON_THRESHOLD_SECONDS - Math.floor(seconds));
  const handleRefineClick = () => {
    if (seconds < REFINE_BUTTON_THRESHOLD_SECONDS) {
      openRefineInfo();
      return;
    }
    navigate(`${conversationUrl}/refine`);
  };
  const refineTitle =
    verifyOn && exploreOn
      ? '"ECHO" available soon'
      : verifyOn
        ? '"Verify" available soon'
        : exploreOn
          ? '"Explore" available soon'
          : "Feature available soon";
  const refineText =
    verifyOn && exploreOn
      ? "Take some time to create an outcome that makes your contribution concrete or get an immediate reply from dembrane to help you deepen the conversation."
      : verifyOn
        ? "Take some time to create an outcome that makes your contribution concrete."
        : exploreOn
          ? "Get an immediate reply from dembrane to help you deepen the conversation."
          : "";

  // echo's ECHO button, while recording, and with the Pause button, while
  // paused too.
  const echoButton = screen === "" && (verifyOn || exploreOn) && (
    <Button
      size="lg"
      onClick={handleRefineClick}
      disabled={isRefineDisabled}
      className="relative overflow-hidden"
      variant={seconds < REFINE_BUTTON_THRESHOLD_SECONDS ? undefined : "filled"}
    >
      {seconds < REFINE_BUTTON_THRESHOLD_SECONDS && (
        <div
          className="absolute bottom-0 left-0 top-0 bg-primary-600/20 transition-all duration-1000 ease-linear"
          style={{ width: `${refineProgress}%` }}
        />
      )}
      <span className="relative z-10">ECHO</span>
    </Button>
  );

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
      <PausedModal opened={pausedOpened} onClose={closePaused} onFinish={finish} />
      {/* echo's refine info modal. */}
      <Modal
        opened={refineInfoOpened}
        onClose={closeRefineInfo}
        centered
        size="sm"
        padding="xl"
        title={refineTitle}
      >
        <Stack gap="lg">
          <Text>{refineText}</Text>
          <Text c="dimmed" size="sm">
            We need a bit more context to help you use ECHO effectively. Please continue recording
            so we can provide better suggestions.
          </Text>
          <Text c="dimmed" size="sm">
            This feature will be available in {remainingTime} seconds.
          </Text>
          <Button onClick={closeRefineInfo} fullWidth variant="filled" size="md">
            I understand
          </Button>
        </Stack>
      </Modal>

      <Box className="relative flex-grow p-4 transition-all">
        <InsecureNotice />
        {screen === "refine" && <RefineSelection />}
        {screen === "verify" && <VerifySelection />}
        {screen === "verify/approve" && <VerifyArtefact />}
        {screen === "" && (
          <>
            {replay && <Replay projectId={projectId} sessionId={sessionId} />}
            {/* echo's ParticipantConversationAudioContent. */}
            <ParticipantBody
              interleaveMessages={false}
              projectId={projectId}
              conversationId={sessionId}
              isRecording={isRecording}
            />
            {verifyOn && <VerifiedArtefactsList conversationId={sessionId} projectId={projectId} />}
            {elsewhere && (
              <Text size="sm" c="dimmed">
                Another page is recording this session.
              </Text>
            )}
            {exploreOn && <ExploreReplies projectId={projectId} sessionId={sessionId} />}
          </>
        )}
        {/* Mounted on echo's screens too, for the connections in them. */}
        <Stack gap="md" className={screen === "" ? "" : "hidden"}>
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
        </Stack>
        {screen === "" && empty && !replay && (
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
        {/* The Pause button's pause keeps it, still. */}
        {(isRecording || isPaused) && (
          <ParticipantRecordingWaveform
            onSilence={openSettings}
            peekAudioLevel={voice.peekAudioLevel}
            paused={!isRecording}
          />
        )}

        <Group justify="space-between">
          {showTimer && (
            <Group justify="center" align="center" gap="xs" mih={50}>
              {/* One slot for either icon, and even digits, so the time holds still. */}
              <span className="flex h-5 w-5 items-center justify-center">
                {stopOpened || isPaused ? (
                  <PauseIcon size={20} />
                ) : (
                  <div
                    className="h-4 w-4 animate-pulse rounded-full"
                    style={{ background: "var(--app-danger)" }}
                  />
                )}
              </span>
              <Text size="lg" className="tabular-nums">
                {formatTime(seconds)}
              </Text>
            </Group>
          )}

          {/* The Pause button's bar while paused: Resume where Pause was. */}
          {isPaused && (
            <Group gap="lg">
              {echoButton}
              <Button
                size="lg"
                variant="filled"
                onClick={record}
                loading={voice.status === "starting"}
                leftSection={<PlayIcon size={20} className="hidden md:block" />}
              >
                Resume
              </Button>
              <Button
                size="lg"
                color="red"
                onClick={stop}
                disabled={voice.status === "starting"}
                leftSection={<StopIcon size={20} className="hidden md:block" />}
              >
                Stop
              </Button>
            </Group>
          )}

          {!isRecording && !stopOpened && !isPaused && !replay && (
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

          {isRecording && (
            <Group gap="lg">
              {echoButton}
              {pauseMode && (
                <Button
                  size="lg"
                  onClick={pause}
                  leftSection={<PauseIcon size={20} className="hidden md:block" />}
                >
                  Pause
                </Button>
              )}
              <Button
                size="lg"
                color="red"
                onClick={stop}
                className={exploreOn || pauseMode ? "" : "px-7 md:px-10"}
                leftSection={<StopIcon size={20} className="hidden md:block" />}
              >
                Stop
              </Button>
            </Group>
          )}
        </Group>
      </Stack>
    </Box>
  );
}

/**
 * The Pause button's Stop: echo's **Recording paused**, with **Back** as
 * the quieter choice and **Finish** in red. Back, like closing it, only
 * closes it: the recording stays paused, for the bar's Resume.
 */
function PausedModal({
  opened,
  onClose,
  onFinish,
}: {
  opened: boolean;
  onClose: () => void;
  onFinish: () => void;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      title="Recording paused"
      size="sm"
      padding="xl"
    >
      <Group gap="sm" py="sm">
        <Button onClick={onClose} miw={100} size="md">
          Back
        </Button>
        <Button color="red" variant="filled" onClick={onFinish} miw={100} size="md">
          Finish
        </Button>
      </Group>
    </Modal>
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
