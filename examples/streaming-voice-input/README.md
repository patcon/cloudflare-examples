# streaming-voice-input: streaming speech-to-text

Voice-to-text dictation example using the `useVoiceInput` hook from `agents/voice`.

Captures microphone audio, streams it to an Agent Durable Object for real-time speech-to-text using Workers AI, and displays the transcript in a text area.

It's a port of [cloudflare/agents `examples/voice-input`](https://github.com/cloudflare/agents/tree/11f87b5332f6cf4dfff71d8249621b28f539280f/examples/voice-input), made standalone: it installs `agents` from npm instead of the monorepo's workspace.

## Run it

```bash
pnpm install
pnpm dev
```

Then open <http://localhost:8793>. `pnpm dev:share` also prints a public link, to try it from a phone.

No API keys needed — uses Workers AI (bound via `wrangler.jsonc`). The binding is remote, so you need to be logged in with `pnpm wrangler login`.

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
