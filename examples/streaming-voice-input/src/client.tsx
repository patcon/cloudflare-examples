import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { useVoiceInput } from "agents/voice/react";
import {
  Button,
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
  CheckIcon,
  InfoIcon,
  MoonIcon,
  SunIcon
} from "@phosphor-icons/react";
import { isModelId, MODELS, type ModelId } from "./models";
import "./styles.css";

// "default" connects to the default agent instance, which uses STT_MODEL.
type ModelChoice = ModelId | "default";

const MODEL_ITEMS: Record<ModelChoice, string> = {
  default: "STT_MODEL (from .dev.vars)",
  ...Object.fromEntries(
    Object.entries(MODELS).map(([id, { label }]) => [id, label])
  )
} as Record<ModelChoice, string>;

// The model is kept in the URL (?model=…), so a link opens the same one.
function useModelChoice() {
  const [model, setModel] = useState<ModelChoice>(() => {
    const param = new URLSearchParams(location.search).get("model") ?? "";
    return isModelId(param) ? param : "default";
  });

  useEffect(() => {
    const url = new URL(location.href);
    if (model === "default") url.searchParams.delete("model");
    else url.searchParams.set("model", model);
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
    name: model === "default" ? undefined : model
  });

  const [copied, setCopied] = useState(false);

  const displayText =
    transcript +
    (interimTranscript ? (transcript ? " " : "") + interimTranscript : "");

  const handleCopy = async () => {
    if (!displayText) return;
    await navigator.clipboard.writeText(displayText);
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
              if (value) setModel(value as ModelChoice);
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

        {/* Text area */}
        <Surface className="rounded-xl ring ring-kumo-line flex-1 flex flex-col min-h-[300px]">
          <div className="flex-1 p-4">
            {displayText ? (
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
