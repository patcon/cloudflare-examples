import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useVoiceInput } from "agents/voice/react";
import {
  Button,
  Checkbox,
  Input,
  LinkButton,
  Select,
  Surface,
  Text,
  PoweredByCloudflare
} from "@cloudflare/kumo";
import {
  MicrophoneIcon,
  MicrophoneSlashIcon,
  StopIcon,
  TrashIcon,
  CopyIcon,
  DownloadSimpleIcon,
  CheckIcon,
  InfoIcon,
  MoonIcon,
  SunIcon
} from "@phosphor-icons/react";
import type { ActivityDetection } from "@cloudflare/voice-gemini";
import {
  afterStop,
  DIARIZER,
  isModelId,
  isStreaming,
  MODELS,
  type AfterStop,
  type AfterStopText,
  type ModelId,
  type Settings
} from "./models";
import {
  hasSpeakers,
  labelSpeakers,
  speakerColor,
  splitBySpeaker
} from "./speakers";
import "./styles.css";

const MODEL_ITEMS = Object.fromEntries(
  Object.entries(MODELS).map(([id, { label }]) => [id, label])
) as Record<ModelId, string>;

// The model is kept in the URL (?model=…), so a link opens the same one.
function useModelChoice() {
  const [model, setModel] = useState<ModelId>(() => {
    const param = new URLSearchParams(location.search).get("model") ?? "";
    return isModelId(param) ? param : "nova-3";
  });

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set("model", model);
    history.replaceState(null, "", url);
  }, [model]);

  return [model, setModel] as const;
}

function AudioLevelBar({ level }: { level: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-kumo-tint overflow-hidden">
      <div
        className="h-full rounded-full bg-kumo-accent transition-all duration-75"
        style={{ width: `${Math.min(level * 500, 100)}%` }}
      />
    </div>
  );
}

function ModeToggle() {
  const [mode, setMode] = useState(
    () => localStorage.getItem("theme") || "light"
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    localStorage.setItem("theme", mode);
  }, [mode]);

  return (
    <Button
      variant="ghost"
      shape="square"
      aria-label="Toggle theme"
      onClick={() => setMode((m) => (m === "light" ? "dark" : "light"))}
      icon={mode === "light" ? <MoonIcon size={16} /> : <SunIcon size={16} />}
    />
  );
}

// A model's settings, kept in its agent instance's state. Changes apply the
// next time you start dictating.
function useSettings(instance: string) {
  const [settings, setSettings] = useState<Settings>({
    activityDetection: {}
  });
  const agent = useAgent<Settings>({
    agent: "VoiceInputAgent",
    name: instance,
    onStateUpdate: (state) => setSettings(state)
  });
  const update = (change: Partial<Settings>) =>
    agent.setState({ ...settings, ...change });
  return [settings, update, agent] as const;
}

/** The models transcribing once you stop, such as "a and b". */
function afterStopModels(plan: AfterStop | null) {
  return [...new Set([plan?.original, plan?.diarized])]
    .filter(Boolean)
    .join(" and ");
}

type UpdateSettings = (change: Partial<Settings>) => void;

function DiarizeSettings({
  model,
  settings,
  update,
  disabled
}: {
  model: ModelId;
  settings: Settings;
  update: UpdateSettings;
  disabled: boolean;
}) {
  // A model that can't diarize has the recording diarized by DIARIZER too.
  const redone = !MODELS[model].diarizes;
  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line">
      <Checkbox
        label="Tell speakers apart (diarization)"
        checked={settings.diarize ?? false}
        onCheckedChange={(checked) => update({ diarize: checked })}
        disabled={disabled}
      />
      <span className="mt-1 block">
        <Text size="xs" variant="secondary">
          {redone
            ? `Once you stop, also sends the recording to ${DIARIZER}, and shows its transcript. The ${isStreaming(model) ? "live" : "model's own"} one is kept, to switch back to. `
            : ""}
          Highlights each speaker's words in their own color, for up to 8
          speakers. Applies the next time you start dictating.
        </Text>
      </span>
    </Surface>
  );
}

/** One recording's text, kept once you stop. */
interface Session {
  id: string;
  /** The final text heard while recording. */
  live: string;
  /** Interim text that was never made final, because you stopped mid-speech. */
  tail: string | null;
  /** The batch transcripts, or null while they're being transcribed. */
  result: AfterStopText | null;
}

/** Which of a session's transcripts to show, when it has both. */
type TranscriptView = "diarized" | "original";

// Each model's sessions are kept in the browser, so they survive a reload.
const storageKey = (model: ModelId) => `transcript:${model}`;

function loadSessions(model: ModelId): Session[] {
  try {
    const sessions: Session[] = JSON.parse(
      localStorage.getItem(storageKey(model)) ?? "[]"
    );
    // One still transcribing when the page closed never will be.
    return sessions.map((s) => ({ ...s, result: s.result ?? {} }));
  } catch {
    return [];
  }
}

function saveSessions(model: ModelId, sessions: Session[]) {
  try {
    if (sessions.length) {
      localStorage.setItem(storageKey(model), JSON.stringify(sessions));
    } else localStorage.removeItem(storageKey(model));
  } catch {
    // Storage can be full or blocked. The text is still on the page.
  }
}

/**
 * The text `useVoiceInput` added to its transcript. It keeps only its last
 * 200 messages, dropping the oldest, and starts afresh with each connection,
 * such as after switching models.
 */
function appended(previous: string, next: string) {
  if (next.startsWith(previous)) return next.slice(previous.length);
  for (let i = previous.indexOf(" "); i !== -1; i = previous.indexOf(" ", i + 1)) {
    const kept = previous.slice(i + 1);
    if (next.startsWith(kept)) return next.slice(kept.length);
  }
  return next;
}

const joinText = (...parts: (string | null | undefined)[]) =>
  parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

/**
 * Each model's transcript, kept as one session per recording. The page
 * keeps these itself, beside `useVoiceInput`'s transcript, because that one
 * drops anything sent after you stop, and isn't kept across reloads.
 *
 * - Interim text left when you stop mid-speech, which `useVoiceInput` clears
 *   and never makes final, is kept at the end of the session's live text.
 * - For sessions transcribed after you stop, it asks the agent for the batch
 *   transcripts, and shows the one `view` picks in place of the live text.
 *   The original is the batch model's own transcript, or the live text for
 *   a streaming model.
 */
function useSessionTranscript(
  model: ModelId,
  transcript: string,
  interimTranscript: string | null,
  isListening: boolean,
  afterStop: boolean,
  transcribe: () => Promise<AfterStopText>
) {
  const [byModel, setByModel] = useState<Partial<Record<ModelId, Session[]>>>(
    {}
  );
  // The page re-renders with every audio level, so storage is read once.
  const sessions = useMemo(
    () => byModel[model] ?? loadSessions(model),
    [byModel, model]
  );
  // Saved as they change. A transcript still coming back for a model you've
  // since switched from is kept under that model.
  const change = (target: ModelId, update: (all: Session[]) => Session[]) =>
    setByModel((all) => {
      const next = update(all[target] ?? loadSessions(target));
      saveSessions(target, next);
      return { ...all, [target]: next };
    });

  const [view, setView] = useState<TranscriptView>("diarized");
  const [error, setError] = useState<string | null>(null);
  // The final text heard so far in this recording.
  const [live, setLive] = useState("");
  const previousTranscript = useRef(transcript);
  const lastInterim = useRef<string | null>(null);
  const recording = useRef(false);

  useEffect(() => {
    const added = appended(previousTranscript.current, transcript);
    previousTranscript.current = transcript;
    if (isListening && added.trim()) setLive((text) => joinText(text, added));
  }, [transcript]);

  // Stopping clears the interim text in the same render that stops
  // listening, so this only follows it while listening, keeping what was
  // there just before you stopped. A final clears it too, so text that did
  // become final isn't kept twice.
  useEffect(() => {
    if (isListening) lastInterim.current = interimTranscript;
  }, [interimTranscript, isListening]);

  useEffect(() => {
    if (isListening) {
      recording.current = true;
      setLive("");
      lastInterim.current = null;
      setError(null);
      return;
    }
    // Not listening when the page loads.
    if (!recording.current) return;
    recording.current = false;
    const tail = lastInterim.current?.trim() || null;
    lastInterim.current = null;
    setLive("");
    if (!live && !tail && !afterStop) return;
    const session: Session = {
      id: crypto.randomUUID(),
      live,
      tail,
      result: afterStop ? null : {}
    };
    change(model, (all) => [...all, session]);
    if (!afterStop) return;
    const settle = (result: AfterStopText) =>
      change(model, (all) =>
        all.map((s) => (s.id === session.id ? { ...s, result } : s))
      );
    transcribe().then(settle, (e: Error) => {
      // Keeps the live text, if there was any.
      settle({});
      setError(`Transcribing after you stopped failed: ${e.message}`);
    });
  }, [isListening]);

  const shown = (s: Session) => {
    // Undefined keeps the live text: still transcribing, or the original of
    // a streaming model.
    const chosen =
      view === "diarized"
        ? (s.result?.diarized ?? s.result?.original)
        : s.result?.original;
    return chosen ?? joinText(s.live, s.tail);
  };

  return {
    text: joinText(...sessions.map(shown), live),
    transcribing: sessions.some((s) => s.result === null),
    // A diarized transcript from another model, beside the original.
    hasBoth: sessions.some(
      (s) =>
        s.result?.diarized !== undefined &&
        s.result.diarized !== s.result.original
    ),
    view,
    setView,
    error,
    clear: () => {
      change(model, () => []);
      setLive("");
      setError(null);
    }
  };
}

// Gemini's voice activity detection.
function GeminiSettings({
  settings,
  update: updateSettings,
  disabled
}: {
  settings: Settings;
  update: UpdateSettings;
  disabled: boolean;
}) {
  const detection = settings.activityDetection;

  const update = (change: Partial<ActivityDetection>) => {
    const next: Record<string, unknown> = { ...detection, ...change };
    // An unset field keeps Gemini's default.
    for (const key of Object.keys(next)) {
      if (next[key] === undefined) delete next[key];
    }
    updateSettings({ activityDetection: next as ActivityDetection });
  };

  const sensitivity = (prefix: "START" | "END") => ({
    default: "Default",
    [`${prefix}_SENSITIVITY_HIGH`]: "High",
    [`${prefix}_SENSITIVITY_LOW`]: "Low"
  });

  const milliseconds = (value: string) =>
    value === "" || Number.isNaN(Number(value)) ? undefined : Number(value);

  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line">
      <Text size="sm" bold>
        Gemini voice segment detection
      </Text>
      <span className="mt-1 mb-3 block">
        <Text size="xs" variant="secondary">
          Decides where each segment ends, and so when interim text becomes
          final. Blank or Default keeps Gemini's own setting. Applies the next
          time you start dictating.
        </Text>
      </span>
      <div className="mb-3">
        <Checkbox
          label="Turn off Gemini's voice segment detection"
          checked={detection.disabled ?? false}
          onCheckedChange={(checked) =>
            update({ disabled: checked || undefined })
          }
          disabled={disabled}
        />
        <span className="mt-1 block">
          <Text size="xs" variant="secondary">
            Treats the whole recording as one segment, so text stays interim
            until you stop.
          </Text>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select
          size="sm"
          label="End of speech sensitivity"
          items={sensitivity("END")}
          value={detection.endOfSpeechSensitivity ?? "default"}
          onValueChange={(value) =>
            update({
              endOfSpeechSensitivity:
                value === "default"
                  ? undefined
                  : (value as ActivityDetection["endOfSpeechSensitivity"])
            })
          }
          disabled={disabled || !!detection.disabled}
        />
        <Select
          size="sm"
          label="Start of speech sensitivity"
          items={sensitivity("START")}
          value={detection.startOfSpeechSensitivity ?? "default"}
          onValueChange={(value) =>
            update({
              startOfSpeechSensitivity:
                value === "default"
                  ? undefined
                  : (value as ActivityDetection["startOfSpeechSensitivity"])
            })
          }
          disabled={disabled || !!detection.disabled}
        />
        <Input
          size="sm"
          type="number"
          min={0}
          step={100}
          label="Minimum pause to end segments (ms)"
          placeholder="Default"
          value={detection.silenceDurationMs ?? ""}
          onChange={(e) =>
            update({ silenceDurationMs: milliseconds(e.target.value) })
          }
          disabled={disabled || !!detection.disabled}
        />
        <Input
          size="sm"
          type="number"
          min={0}
          step={20}
          label="Minimum speech to start segments (ms)"
          placeholder="Default"
          value={detection.prefixPaddingMs ?? ""}
          onChange={(e) =>
            update({ prefixPaddingMs: milliseconds(e.target.value) })
          }
          disabled={disabled || !!detection.disabled}
        />
      </div>
    </Surface>
  );
}

// Diarized text, with each speaker's words on their own color. Text without
// speakers comes out as it went in, so both views lay out the same.
function SpeakerText({ text }: { text: string }) {
  return splitBySpeaker(text).map((run, i) => (
    <span key={i}>
      {i > 0 && " "}
      {run.speaker === null ? (
        run.text
      ) : (
        <mark
          title={`Speaker ${run.speaker}`}
          className="rounded text-inherit box-decoration-clone"
          style={{
            backgroundColor: speakerTint(run.speaker),
            // Pads the highlight without padding the text, which would
            // rewrap it differently from the original.
            boxShadow: `0 0 0 2px ${speakerTint(run.speaker)}`
          }}
        >
          {run.text}
        </mark>
      )}
    </span>
  ));
}

const speakerTint = (speaker: number) =>
  `color-mix(in srgb, ${speakerColor(speaker)} 45%, transparent)`;

function SpeakerLegend({ text }: { text: string }) {
  const speakers = [
    ...new Set(splitBySpeaker(text).map((run) => run.speaker))
  ]
    .filter((speaker) => speaker !== null)
    .sort((a, b) => a - b);
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {speakers.map((speaker) => (
        <span
          key={speaker}
          className="flex items-center gap-1.5 text-xs text-kumo-subtle"
        >
          <span
            className="size-3 rounded-sm"
            style={{ backgroundColor: speakerColor(speaker) }}
          />
          Speaker {speaker}
        </span>
      ))}
    </div>
  );
}

function App() {
  const [model, setModel] = useModelChoice();
  const {
    transcript,
    interimTranscript,
    isListening,
    audioLevel,
    isMuted,
    error,
    start,
    stop,
    toggleMute
  } = useVoiceInput({
    agent: "VoiceInputAgent",
    // Each model is its own agent instance. Nothing connects to the model
    // itself until you start dictating.
    name: model
  });

  const [settings, updateSettings, agent] = useSettings(model);
  const plan = afterStop(model, settings);
  const redone = useSessionTranscript(
    model,
    transcript,
    interimTranscript,
    isListening,
    !!plan,
    // A long recording can take a while.
    () =>
      agent.call<AfterStopText>("transcribeLastAudio", [], {
        timeout: 120_000
      })
  );
  const finalText = redone.text;
  const batchOnly = !isStreaming(model);

  const [copied, setCopied] = useState(false);

  const displayText =
    finalText +
    (interimTranscript ? (finalText ? " " : "") + interimTranscript : "");

  // Nova 3 marks speakers in the text when diarizing.
  const diarized = hasSpeakers(displayText);

  const handleCopy = async () => {
    if (!displayText) return;
    await navigator.clipboard.writeText(
      diarized ? labelSpeakers(displayText) : displayText
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-full bg-kumo-base flex flex-col">
      {/* Header */}
      <header className="border-b border-kumo-line px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MicrophoneIcon
            size={20}
            weight="bold"
            className="text-kumo-accent"
          />
          <span>
            <Text size="sm" bold>
              Voice Input
            </Text>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Select
            size="sm"
            aria-label="Speech-to-text model"
            items={MODEL_ITEMS}
            value={model}
            onValueChange={(value) => {
              if (value) setModel(value as ModelId);
            }}
            disabled={isListening}
          />
          <ModeToggle />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-4 max-w-2xl mx-auto w-full flex flex-col gap-4">
        {/* Info card */}
        <Surface className="p-4 rounded-xl ring ring-kumo-line">
          <div className="flex gap-3">
            <InfoIcon
              size={20}
              weight="bold"
              className="text-kumo-accent shrink-0 mt-0.5"
            />
            <div>
              <Text size="sm" bold>
                Voice-to-Text Dictation
              </Text>
              <span className="mt-1 block">
                <Text size="xs" variant="secondary">
                  Click the microphone to start dictating. Your speech is
                  transcribed {batchOnly ? "once you stop" : "in real time"}{" "}
                  by {MODEL_ITEMS[model]} and displayed in the text area
                  below. Pick another model at the
                  top to compare. Uses the useVoiceInput hook from
                  agents/voice.
                </Text>
              </span>
            </div>
          </div>
        </Surface>

        <DiarizeSettings
          model={model}
          settings={settings}
          update={updateSettings}
          disabled={isListening}
        />

        {MODELS[model].provider === "gemini" && !batchOnly && (
          <GeminiSettings
            settings={settings}
            update={updateSettings}
            disabled={isListening}
          />
        )}

        {/* Text area */}
        <Surface className="rounded-xl ring ring-kumo-line flex-1 flex flex-col min-h-[300px]">
          <div className="flex-1 p-4">
            {redone.hasBoth && (
              <div className="mb-3 w-48">
                <Select
                  size="sm"
                  label="Transcript"
                  items={{ diarized: "Diarized", original: "Original" }}
                  value={redone.view}
                  onValueChange={(value) =>
                    redone.setView(value as TranscriptView)
                  }
                />
              </div>
            )}
            {/* Diarized or not, the text is laid out the same, with the
                speakers listed below it. */}
            {displayText ? (
              <>
                <span className="whitespace-pre-wrap text-kumo-default text-sm leading-relaxed">
                  <SpeakerText text={finalText} />
                  {interimTranscript && (
                    <span className="text-kumo-subtle italic">
                      {finalText ? " " : ""}
                      <SpeakerText text={interimTranscript} />
                    </span>
                  )}
                </span>
                {diarized && <SpeakerLegend text={displayText} />}
              </>
            ) : redone.transcribing ? null : (
              <span className="text-kumo-subtle text-sm italic">
                {isListening
                  ? batchOnly
                    ? "Recording... the transcript comes once you stop"
                    : "Listening... start speaking"
                  : "Click the microphone button to start dictating"}
              </span>
            )}
            {redone.transcribing && (
              <span className="mt-2 block text-kumo-subtle text-sm italic">
                Transcribing with {afterStopModels(plan)}...
              </span>
            )}
          </div>

          {/* Audio level indicator */}
          {isListening && (
            <div className="px-4 pb-2">
              <AudioLevelBar level={audioLevel} />
            </div>
          )}

          {/* Toolbar */}
          <div className="border-t border-kumo-line px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {!isListening ? (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={start}
                  aria-label="Start dictation"
                >
                  <MicrophoneIcon size={16} weight="bold" />
                  Dictate
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={stop}
                    aria-label="Stop dictation"
                  >
                    <StopIcon size={16} weight="bold" />
                    Stop
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={toggleMute}
                    aria-label={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? (
                      <MicrophoneSlashIcon size={16} weight="bold" />
                    ) : (
                      <MicrophoneIcon size={16} weight="bold" />
                    )}
                    {isMuted ? "Unmute" : "Mute"}
                  </Button>
                </>
              )}
            </div>

            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCopy}
                disabled={!displayText}
                aria-label="Copy text"
              >
                {copied ? (
                  <CheckIcon size={16} weight="bold" />
                ) : (
                  <CopyIcon size={16} weight="bold" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
              {/* The server records what it sends to the model. */}
              {!isListening && (
                <LinkButton
                  size="sm"
                  variant="secondary"
                  href={`/agents/voice-input-agent/${model}/last-audio.wav`}
                  download
                  icon={<DownloadSimpleIcon size={16} weight="bold" />}
                >
                  Last audio
                </LinkButton>
              )}
              <Button
                size="sm"
                variant="secondary"
                // useVoiceInput's own clear() only empties the page's
                // copy, and its next final brings the old text back.
                onClick={redone.clear}
                disabled={!finalText}
                aria-label="Clear text"
              >
                <TrashIcon size={16} weight="bold" />
                Clear
              </Button>
            </div>
          </div>
        </Surface>

        {/* Error display */}
        {(error || redone.error) && (
          <Surface className="p-3 rounded-xl ring ring-red-500/30 bg-red-500/10">
            <Text size="xs">{error || redone.error}</Text>
          </Surface>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-kumo-line px-4 py-3 flex items-center justify-center">
        <PoweredByCloudflare href="https://developers.cloudflare.com/agents/" />
      </footer>
    </div>
  );
}

const root = document.getElementById("root")!;
createRoot(root).render(<App />);
