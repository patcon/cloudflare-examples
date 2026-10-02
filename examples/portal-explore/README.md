# portal-explore: a short reply to a group conversation, when asked

A group sits around one phone, which records their conversation, and Gemini transcribes it live. When someone presses **Explore**, the session's agent sends Gemini the conversation so far and the project's other sessions. A reply of 1–3 sentences streams back and stays on the page. Replies come only when someone asks.

It's a port of the **Explore** half of the dembrane portal's ECHO button, from `dembrane-echo`. It's based on [`polis-statement-extraction`](../polis-statement-extraction), with its recording and live transcription, but without statement extraction, review or diarization. There's no login.

## Run it

```bash
pnpm install
cp .dev.vars.example .dev.vars   # set GOOGLE_CLOUD_PROJECT
pnpm google-token                # puts `gcloud auth print-access-token` in .dev.vars
pnpm dev
```

Then open <http://localhost:8795>, pick a project name such as `demo`, and start a session. To record from a phone, use `pnpm dev:share` instead: it also prints a public link.

Everything runs on Gemini on Vertex AI, so you need a Google Cloud project with Vertex AI enabled and `gcloud` logged in to it. The token lasts about an hour, so run `pnpm google-token` again when it expires. A failed reply says why on the session page, such as an expired token, with **Try again**.

| Command | What it does |
|---|---|
| `pnpm test` | The prompt, transcript, stream parser, rules, settings and WAV helpers, then the Gemini provider's tests |
| `pnpm typecheck` | The Worker (`tsconfig.json`) and the page (`tsconfig.client.json`) |
| `pnpm lint`, `pnpm format` | Biome |

## Pages

| URL | Who | What |
|---|---|---|
| `/:projectId/start` | The recording phone | **Start a session** makes a new session with a random ID |
| `/:projectId/sessions/:sessionId` | The recording phone | Record and stop as often as you like, the live transcript, **Explore**, and its replies |
| `/:projectId/sessions/:sessionId?debug=true` | Whoever's testing | Replay an audio file instead of recording. See [Replaying an audio file](#replaying-an-audio-file) |
| `/:projectId/settings` | The host | Turn Explore on or off, pick how replies are written, describe the project, and see each session and what it adds to a reply |

A project is any name, made the first time it's used. `/:projectId/` on its own opens the start page.

## How a reply works

1. **Recording.** The page streams the microphone to the session's agent with `useVoiceInput`. The agent sends it on to `gemini-3.5-transcribe-live-preview`, and saves each finished utterance. Stopping and recording again adds to the same transcript, and the agent keeps the total recorded time.
2. **Explore turns on** once 60 seconds are recorded, with something transcribed. A meter under the button fills meanwhile. After a reply, it waits 2 minutes. While it can't be pressed, the page says why. The agent checks the same rules, and allows one reply at a time.
3. **The prompt.** The agent builds it from the original's `get_reply_system` template. It holds the project's context; the mode's prompt (`summarize`, `brainstorm`, or the project's own); the project's other sessions; and this session's transcript, with its earlier replies written in where they came.
4. **Other sessions.** The project asks each of its other sessions for its transcript, in parallel. Newest first, each is cut to about 4,000 tokens, and they stop at 80,000 in all. A session that doesn't answer is skipped. The settings page shows what each session adds.
5. **The reply** streams from `gemini-3.5-flash`. Each piece goes into the agent's state, so every open page sees it, and a page that reloads mid-reply catches up. With nothing back after 20 seconds, the page says it's still working. The finished reply is saved and listed under the transcript. If it fails, the error shows with **Try again**.

### The prompts

The templates are the original's `get_reply_*.en.jinja` files, copied as they are into [`src/server/prompts/`](src/server/prompts/). They're rendered with [LiquidJS](https://liquidjs.com), whose `{{ }}` and `{% if %}` match the Jinja they use. The original renders them with nunjucks, which [can't run in a Worker](https://developers.cloudflare.com/workers/runtime-apis/web-standards/): it compiles templates with `new Function`. Removing personal details is off, so that block of the template is left out.

### Limits

Every limit is in [`src/shared/constants.ts`](src/shared/constants.ts), marked with where it comes from: the original portal, polis-statement-extraction, or made up for this example.

- **Tokens are estimated** at 4 characters each, since a Worker has no tokenizer. The original counts them properly.
- **Sessions up to about an hour**, because of the token. Gemini Live itself resumes past Vertex's session limits; see [`packages/voice-gemini`](packages/voice-gemini/README.md).

## Replaying an audio file

Add `?debug=true` to a new session's link, or follow the faint **debug** link at the bottom of its page, to replay a recording instead of using the microphone. The page decodes the file, resamples it to 16kHz mono, and sends it to the session in 5-minute WAV windows. `gemini-3.5-transcribe-preview` transcribes each, and its text joins the transcript as if it had been said live. The file's length counts as recorded time, so a replay of over a minute turns Explore on.

To make test files without talking, macOS's `say` can write one:

```bash
say -v Samantha --file-format=WAVE --data-format=LEI16@16000 -o test.wav "What should the old library become?"
```

## How it works

Two kinds of [Agent](https://developers.cloudflare.com/agents/), each a Durable Object with its own SQLite:

- **`ProjectAgent`**, one per project. It lists its sessions, and keeps the Explore settings in its state, which syncs to every connected page. Pages change them through `updateSettings()`, which checks each change.
- **`SessionAgent`**, one per session. It extends `withVoiceInput(Agent)`, and keeps the transcript, the replies and the reply in progress. The recording page connects to it.

A session reaches its project over RPC with `getAgentByName`, for the settings and the other sessions. The project reaches each session the same way, for its transcript.

`explore()` is a `@callable` that checks the rules, starts the reply and returns. `keepAliveWhile()` keeps the object awake until the reply is done, even if no page is connected. A reply cut off by a restart is marked failed when the object starts again.

[`useVoiceRecorder`](src/client/hooks/use-voice-recorder.ts) wraps `useVoiceInput`, whose `start()` opens the call before it asks for the microphone, and resolves even when that's refused. The wrapper asks first, so a refusal throws before any call opens, and the page tells the agent once the microphone is on, which is when recorded time starts.

The Worker is a [Hono](https://hono.dev) app: [`hono-agents`](https://www.npmjs.com/package/hono-agents) routes the pages' WebSockets to the agents, and `/api/…` takes replay windows.

### Files

| Path | What's in it |
|---|---|
| `src/server/server.ts` | The Hono app: agents and replay windows |
| `src/server/project-agent.ts` | `ProjectAgent`: sessions, settings, other sessions as context |
| `src/server/session-agent.ts` | `SessionAgent`: the transcript, recorded time, `explore()` and its replies |
| `src/server/explore/` | The prompt, transcripts and their budgets, settings checks, and the streaming Gemini call |
| `src/server/prompts/` | The original's reply templates |
| `src/server/models.ts` | The three Gemini models |
| `src/client/pages/` | The home, start, session, replay and settings pages |
| `src/client/hooks/` | `useVoiceRecorder`, `useWakeLock` and `useNow` |
| `src/client/audio/` | Decoding and windowing for replay |
| `src/shared/` | Project and session IDs, the constants, and the Explore rules the page and the agent share |
| `packages/voice-gemini/` | The Gemini Live and batch speech-to-text providers, copied from `polis-statement-extraction` |

[`PLAN.md`](PLAN.md) has the design, how it differs from the original, and what's left for later.
