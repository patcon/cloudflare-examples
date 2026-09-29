# @cloudflare/voice-gemini

Gemini speech-to-text for the [Cloudflare Agents](https://github.com/cloudflare/agents) voice pipeline, over Vertex AI:

- `GeminiLiveSTT` streams, over the `BidiGenerateContent` WebSocket. It's a `Transcriber`.
- `GeminiBatchSTT` transcribes a finished recording with `generateContent`, and can tell speakers apart.

It's shaped like the providers in [cloudflare/agents `voice-providers/`](https://github.com/cloudflare/agents/tree/main/voice-providers), so it can move there later. For now it's `private` and only used by this example, through a pnpm workspace. It isn't built: `exports` points at the TypeScript source, which Vite bundles.

It needs no Workers AI binding. It only opens an outbound WebSocket with `fetch`, so it works in any Worker or Durable Object that can reach `aiplatform.googleapis.com`.

## Layout

| File | What's in it |
|---|---|
| `src/index.ts` | The public exports |
| `src/live.ts` | `GeminiLiveSTT`, a streaming `Transcriber` |
| `src/batch.ts` | `GeminiBatchSTT`, for a finished recording |
| `src/vertex.ts` | What both share: options, host, access token |

Tests are split the same way, in `tests/live.test.ts` and `tests/batch.test.ts`.

## Usage

```typescript
import { Agent } from "agents";
import { withVoiceInput } from "agents/voice";
import { GeminiLiveSTT } from "@cloudflare/voice-gemini";

const InputAgent = withVoiceInput(Agent);

export class MyAgent extends InputAgent<Env> {
  transcriber = new GeminiLiveSTT({
    accessToken: this.env.GOOGLE_ACCESS_TOKEN,
    project: this.env.GOOGLE_CLOUD_PROJECT
  });
}
```

It works with `withVoice` too, for a full voice agent, alongside any TTS provider.

### Batch

`GeminiBatchSTT` isn't a `Transcriber`. The pipeline drops anything a session sends after the call ends, so call it yourself once the recording is finished, such as from a `@callable()` method:

```typescript
import { GeminiBatchSTT } from "@cloudflare/voice-gemini";

const stt = new GeminiBatchSTT({
  accessToken: this.env.GOOGLE_ACCESS_TOKEN,
  project: this.env.GOOGLE_CLOUD_PROJECT
});
// [{ speaker: 0, text: "Hello." }, { speaker: 1, text: "Hi there." }]
const segments = await stt.transcribe(wav, { diarize: true });
```

Speakers are numbered from 0, in the order they're first heard. Without `diarize`, `speaker` is `null`. It takes the same `accessToken`, `project` and `location` options as `GeminiLiveSTT`. `model` defaults to `"gemini-3.5-transcribe-preview"`, which Vertex only serves from `global`.

## Options

For `GeminiLiveSTT`:

| Option              | Default                                | Description                                                                                  |
| ------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `accessToken`       | (required)                             | OAuth token for Vertex AI, or a function that returns one. The function runs for each session. |
| `project`           | (required)                             | Google Cloud project with Vertex AI enabled                                                  |
| `location`          | `"global"`                             | Vertex location. Each model is only served from some.                                        |
| `model`             | `"gemini-3.5-transcribe-live-preview"` | Model ID. It must answer with text, since only its input transcription is used.             |
| `activityDetection` | Gemini's defaults                      | `realtimeInputConfig.automaticActivityDetection`: sensitivities, silence and prefix padding |

## How it works

1. When the session starts, it opens a WebSocket to Vertex and sends a `setup` message asking for input transcription and a text-only response.
2. Audio from `feed()` is buffered until Vertex sends `setupComplete`, then sent as base64 16kHz PCM in `realtimeInput` messages.
3. `voiceActivity` `ACTIVITY_START` becomes `onSpeechStart`, `interimInputTranscription` becomes `onInterim`, and `inputTranscription`, sent once Gemini's voice detection ends the turn, becomes `onUtterance`.

## Tests

```bash
pnpm test
```

## Still to do

To match the other providers, and to be upstreamed:

- **Tokens that outlast an hour.** A function can now fetch a fresh token for each session, but nothing ships one. A helper that signs a service account JWT with WebCrypto and exchanges it for a token, cached until it expires, would make it work in production.
- **Gemini Developer API.** Accept an `apiKey` and connect to `generativelanguage.googleapis.com` instead of Vertex, if the transcribe model is served there. An API key doesn't expire.
- **Long sessions.** Live API sessions and connections have time limits. Handle `goAway` and reconnect with a `sessionResumption` handle, rather than failing.
- **Stopping mid-sentence.** `close()` sends `realtimeInput.audioStreamEnd`, but any transcript Gemini sends back is dropped, so words spoken just before stopping are lost. No provider waits for one, because `TranscriberSession.close()` can't: it returns `void`, and the pipeline forgets the session straight away. This needs an SDK change upstream, such as `close()` returning a promise.
- **Language.** Map the session's `language` option onto Gemini's config, once we know which field the transcribe model honours.
- **Vocabulary.** The others take `keyterms` or a `prompt`. Find out whether a `systemInstruction` biases the transcribe model.
- **Agent context.** Implement `updateAgentContext()` if Gemini can take the agent's last reply as context without answering it.
- **Packaging.** A `tsdown` build to `dist/`, a CHANGELOG, a changeset, and the `repository` fields, as the upstream packages have.
