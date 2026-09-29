import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
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
import { isModelId, MODELS, type ModelId, type Settings } from "./models";
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
  return [settings, update] as const;
}

function Nova3Settings({
  instance,
  disabled
}: {
  instance: string;
  disabled: boolean;
}) {
  const [settings, update] = useSettings(instance);
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
          Highlights each speaker's words in their own color, for up to 8
          speakers. Applies the next time you start dictating.
        </Text>
      </span>
    </Surface>
  );
}

// Gemini's voice activity detection.
function GeminiSettings({
  instance,
  disabled
}: {
  instance: string;
  disabled: boolean;
}) {
  const [settings, updateSettings] = useSettings(instance);
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
        Gemini voice detection
      </Text>
      <span className="mt-1 mb-3 block">
        <Text size="xs" variant="secondary">
          Decides where each turn ends, and so when interim text becomes
          final. Blank or Default keeps Gemini's own setting. Applies the next
          time you start dictating.
        </Text>
      </span>
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
          disabled={disabled}
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
          disabled={disabled}
        />
        <Input
          size="sm"
          type="number"
          min={0}
          step={100}
          label="Silence to end a turn (ms)"
          placeholder="Default"
          value={detection.silenceDurationMs ?? ""}
          onChange={(e) =>
            update({ silenceDurationMs: milliseconds(e.target.value) })
          }
          disabled={disabled}
        />
        <Input
          size="sm"
          type="number"
          min={0}
          step={20}
          label="Speech to start a turn (ms)"
          placeholder="Default"
          value={detection.prefixPaddingMs ?? ""}
          onChange={(e) =>
            update({ prefixPaddingMs: milliseconds(e.target.value) })
          }
          disabled={disabled}
        />
      </div>
    </Surface>
  );
}

// Diarized text, with each speaker's words on their own color.
function SpeakerText({ text }: { text: string }) {
  return splitBySpeaker(text).map((run, i) => (
    <span key={i}>
      {i > 0 && " "}
      {run.speaker === null ? (
        run.text
      ) : (
        <mark
          title={`Speaker ${run.speaker}`}
          className="rounded px-0.5 text-inherit box-decoration-clone"
          style={{
            backgroundColor: `color-mix(in srgb, ${speakerColor(run.speaker)} 45%, transparent)`
          }}
        >
          {run.text}
        </mark>
      )}
    </span>
  ));
}

function SpeakerLegend({ text }: { text: string }) {
  const speakers = [
    ...new Set(splitBySpeaker(text).map((run) => run.speaker))
  ]
    .filter((speaker) => speaker !== null)
    .sort((a, b) => a - b);
  return (
    <div className="mb-3 flex flex-wrap gap-2">
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
    toggleMute,
    clear
  } = useVoiceInput({
    agent: "VoiceInputAgent",
    // Each model is its own agent instance. Nothing connects to the model
    // itself until you start dictating.
    name: model
  });

  const [copied, setCopied] = useState(false);

  const displayText =
    transcript +
    (interimTranscript ? (transcript ? " " : "") + interimTranscript : "");

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
                  transcribed in real time by {MODEL_ITEMS[model]} and
                  displayed in the text area below. Pick another model at the
                  top to compare. Uses the useVoiceInput hook from
                  agents/voice.
                </Text>
              </span>
            </div>
          </div>
        </Surface>

        {model === "nova-3" && (
          <Nova3Settings instance={model} disabled={isListening} />
        )}

        {MODELS[model].provider === "gemini" && (
          <GeminiSettings instance={model} disabled={isListening} />
        )}

        {/* Text area */}
        <Surface className="rounded-xl ring ring-kumo-line flex-1 flex flex-col min-h-[300px]">
          <div className="flex-1 p-4">
            {diarized ? (
              <>
                <SpeakerLegend text={displayText} />
                <span className="whitespace-pre-wrap text-kumo-default text-sm leading-relaxed">
                  <SpeakerText text={transcript} />
                  {interimTranscript && (
                    <span className="text-kumo-subtle italic">
                      {transcript ? " " : ""}
                      <SpeakerText text={interimTranscript} />
                    </span>
                  )}
                </span>
              </>
            ) : displayText ? (
              <span className="whitespace-pre-wrap text-kumo-default text-sm leading-relaxed">
                {transcript}
                {interimTranscript && (
                  <span className="text-kumo-subtle italic">
                    {transcript ? " " : ""}
                    {interimTranscript}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-kumo-subtle text-sm italic">
                {isListening
                  ? "Listening... start speaking"
                  : "Click the microphone button to start dictating"}
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
                onClick={clear}
                disabled={!transcript}
                aria-label="Clear text"
              >
                <TrashIcon size={16} weight="bold" />
                Clear
              </Button>
            </div>
          </div>
        </Surface>

        {/* Error display */}
        {error && (
          <Surface className="p-3 rounded-xl ring ring-red-500/30 bg-red-500/10">
            <Text size="xs">{error}</Text>
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
