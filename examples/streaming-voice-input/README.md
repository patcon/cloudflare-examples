# streaming-voice-input: streaming speech-to-text

Voice-to-text dictation example using the `useVoiceInput` hook from `agents/voice`.

Captures microphone audio, streams it to an Agent Durable Object for real-time speech-to-text, and displays the transcript in a text area. It adds a second speech-to-text model to compare with Workers AI:

| Model (`STT_MODEL`) | Provider | Region |
|---|---|---|
| `nova-3` | Workers AI (Deepgram Nova 3) | Cloudflare |
| `gemini-3.5-transcribe-live-preview` | Vertex AI, Gemini Live API | `global` only |

The other Gemini Live models only answer with audio, so they're left out for now. That includes `gemini-live-2.5-flash-native-audio`, the only one served from the EU (europe-west1).

It's a port of [cloudflare/agents `examples/voice-input`](https://github.com/cloudflare/agents/tree/11f87b5332f6cf4dfff71d8249621b28f539280f/examples/voice-input), made standalone: it installs `agents` from npm instead of the monorepo's workspace.

## Run it

```bash
pnpm install
pnpm dev
```

Then open <http://localhost:8793>. `pnpm dev:share` also prints a public link, to try it from a phone.

Nova 3 needs no API keys. It uses Workers AI, bound in `wrangler.jsonc`. The binding is remote, so you need to be logged in with `pnpm wrangler login`.

For Gemini, you need a Google Cloud project with Vertex AI enabled and `gcloud` logged in to it:

```bash
cp .dev.vars.example .dev.vars   # STT_MODEL and GOOGLE_CLOUD_PROJECT
pnpm google-token                # puts `gcloud auth print-access-token` in .dev.vars
```

The token lasts about an hour, so run `pnpm google-token` again when it expires. When Gemini fails to start, the page only says "Speech recognition failed to start". The reason Vertex gave, such as an expired token, is in the terminal.

Pick the model from the menu at the top of the page. It's kept in the URL, such as `?model=nova-3`, so a link opens the same one. With no model in the URL, `STT_MODEL` in `.dev.vars` picks it. The terminal logs each final transcript with the model's name, such as `[nova-3] Transcribed: "…"`.

### Tuning Gemini's voice detection

Gemini decides where each turn ends, and so when interim text becomes final, with its own voice activity detection. Steady background noise, such as an air conditioner, can hide the pauses, so a turn never ends. With a Gemini model picked, the page shows these settings, which go into the setup message's [`realtimeInputConfig.automaticActivityDetection`](https://cloud.google.com/vertex-ai/generative-ai/docs/live-api):

| Setting | Field | Try |
|---|---|---|
| End of speech sensitivity | `endOfSpeechSensitivity` | High, to end turns more readily |
| Start of speech sensitivity | `startOfSpeechSensitivity` | Low, so noise is less likely to count as speech |
| Silence to end a turn | `silenceDurationMs` | 500–800 |
| Speech to start a turn | `prefixPaddingMs` | |

Blank or Default keeps Gemini's own setting. They're saved in the model's agent instance, so they survive a reload, and apply the next time you start dictating. The terminal logs the ones each session starts with.

### Downloading the last audio

**Last audio** downloads the last session's audio as a 16kHz mono WAV: exactly what the model heard, after the browser's noise suppression, echo cancellation and auto gain control. Each model keeps its own last recording, of up to 10 minutes, in its Durable Object's SQLite. Use it to replay a noisy recording against different settings.

## How it works

### Server (`src/server.ts`)

Uses `withVoiceInput` — a lightweight mixin that only does STT. No TTS provider, no `onTurn` handler needed:

```typescript
import { Agent } from "agents";
import { withVoiceInput, WorkersAINova3STT } from "agents/voice";

const InputAgent = withVoiceInput(Agent);

export class VoiceInputAgent extends InputAgent<Env> {
  transcriber = new WorkersAINova3STT(this.env.AI);

  onTranscript(text, connection) {
    console.log("User said:", text);
  }
}
```

Each model is its own agent instance, named after the model: the page's menu passes the model as `useVoiceInput({ name })`. For the Gemini model, `createTranscriber()` reads `this.name` and returns a `GeminiLiveSTT` instead. The SDK calls it when you start dictating, so only one model is connected at a time, and only while you're recording.

`GeminiLiveSTT` implements the SDK's `Transcriber` interface. It's a package of its own, in [`packages/voice-gemini`](packages/voice-gemini), laid out like the providers in [cloudflare/agents `voice-providers/`](https://github.com/cloudflare/agents/tree/main/voice-providers) so it can move there later. Its tests run with `pnpm test`. Each session opens a WebSocket to Vertex's `BidiGenerateContent` with a text-only response, and streams the 16kHz PCM up as base64. Vertex sends back three things:
- `interimInputTranscription`: everything heard so far this turn, shown as interim text.
- `inputTranscription`: the whole turn, once, when Gemini's voice activity detection decides you've stopped. This becomes the final transcript.
- `voiceActivity`: `ACTIVITY_START` when you start speaking.

### Client (`src/client.tsx`)

Uses `useVoiceInput` — a lightweight React hook that accumulates transcripts into a single string:

```tsx
import { useVoiceInput } from "agents/voice/react";

const { transcript, interimTranscript, isListening, start, stop, clear } =
  useVoiceInput({ agent: "VoiceInputAgent" });
```

Returns:

- **`transcript`** — accumulated final text from all utterances
- **`interimTranscript`** — real-time partial transcript (updates as you speak)
- **`isListening`** — whether the mic is active
- **`audioLevel`** — current audio level for visual feedback
- **`start()` / `stop()`** — control listening
- **`toggleMute()`** — mute without stopping
- **`clear()`** — reset the transcript
