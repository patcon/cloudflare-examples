# Plan: portal-explore

A port of the dembrane portal's **Explore** feature to Cloudflare. A phone records a group conversation and Gemini Live transcribes it. When someone presses **Explore**, the session's agent sends the conversation so far, plus the project's other sessions, to Gemini, and a 1–3 sentence reply streams back. Replies come only when someone asks.

See the [README](README.md) for running it and how a reply works. This file records the decisions behind it, and how it differs from the original.

## The original

The backend is `platform/packages/conversations/src/v1/reply.ts` in `dembrane-echo`, a TypeScript port of `reply_utils.py`, with the `get_reply_*` templates in `platform/packages/prompts/templates/`. The portal side is in `frontend/src/components/participant/`.

1. The **ECHO** button turns on after 60 seconds of recording, and opens a choice between Verify and Explore. Each has a 2-minute cooldown, kept in `localStorage`.
2. Explore posts `{language}` to `/conversations/:id/get-reply`. The participant never types anything.
3. The prompt holds the project's context and defaults; a global prompt for the mode; the project's other conversations; and this conversation's transcript, with earlier replies written in.
4. Other conversations are cut to about 4k tokens each, up to 80k in all. They're summaries in the named modes, transcripts otherwise. Audio recorded since the last reply that has no transcript yet is attached as raw audio.
5. The reply streams from `multi_modal_pro` with a 2048-token thinking budget, and is saved as a `conversation_reply`. After 20 seconds with nothing, the stream says the system is under load.

## Decisions

- **`withVoiceInput`, not `withVoice`.** `withVoice` runs `onTurn` after every utterance, and sends "No response generated" when it returns nothing. That suits a call with the agent, not a group that asks for a reply now and then.
- **Two agents, as in polis-statement-extraction.** `SessionAgent` holds the transcript, the replies and the reply in progress. `ProjectAgent` holds the session list and the settings. They're top-level agents linked by `getAgentByName` RPC.
- **The reply runs in the agent, not the request.** `explore()` starts the reply and returns. The text so far is kept in state, so a reloaded page catches up and two tabs see the same reply. A streaming callable would tie the reply to one connection. Each piece is a state update, which every page already gets, so there's no separate broadcast. `keepAliveWhile()` keeps the object awake meanwhile.
- **The rules are checked on the server.** At least 60 seconds recorded, something transcribed, 2 minutes since the last reply, and one reply at a time. The original checks these in the browser only. The page shows the same reasons, from the same function in `src/shared/rules.ts`.
- **A session can stop and record again.** polis-statement-extraction ended a session on Stop only because its recording had to be one file, and that recording is gone here. Recorded time is the total across every recording, kept in state.
- **Recorded time starts when the microphone does.** `useVoiceInput` opens the call before it asks for the microphone, and its `start()` resolves even when that's refused. `useVoiceRecorder` asks first, and the page calls `micReady()` once it's on. When the recording page's connection drops mid-recording, the time so far is still counted, since `onCallEnd` only runs on Stop.
- **Other sessions over RPC.** The project asks each session for its transcript, in parallel, and plans them with the same function the settings page shows. There are no summaries yet, so every mode uses transcripts, which is the original's path when there's no mode.
- **The original's templates, rendered with LiquidJS.** The `.jinja` files are copied unchanged and imported with Vite's `?raw`. Nunjucks compiles templates with `new Function`, which Workers don't allow. LiquidJS interprets them instead, and its syntax covers what these templates use. As Jinja does here, nothing is HTML-escaped, and one trailing newline is dropped.
- **Gemini on Vertex, streamed.** `streamGenerateContent?alt=sse`, with the token setup from polis-statement-extraction. The reply model is `gemini-3.5-flash`, without a thinking budget.
- **Settings change through a callable.** Pages can't set the project's state themselves; `updateSettings()` checks each change, since it comes over the network.
- **Spoken replies come later.** The finished reply is saved in one place, `#saveReply()`, where a `speakAll(reply)` would go after switching to `withVoice`.

## How it differs from the original

| | The original | Here |
|---|---|---|
| Rules | In the browser | On the server, shown in the browser |
| Cooldown | From the button press, in `localStorage` | From when the reply finished, in the agent |
| Other sessions | Summaries in named modes | Transcripts in every mode |
| Untranscribed audio | Sent as raw audio | Not sent |
| Tokens | Counted with a tokenizer | Estimated at 4 characters each |
| Model | `multi_modal_pro`, 2048-token thinking budget | `gemini-3.5-flash` |
| Templates | Nunjucks, 8 languages | LiquidJS, English |
| Removing personal details | When the project anonymizes | Never |
| Session names | Participant name and tags | `Session` and the first 8 characters of its ID |

## Stack

- **Worker:** Hono, with `hono-agents` for the agents' WebSockets.
- **Agents:** `agents` 0.24, with `withVoiceInput` for the live stream. Each agent's SQLite holds its tables, created idempotently in the constructor.
- **Page:** React and kumo, built with Vite. The `agents/vite` plugin compiles `@callable()`.
- **Tooling:** pnpm, vitest for pure functions, Biome for formatting and lint, and split tsconfigs so the Worker can't use browser APIs.

## Checked against Vertex (2 October 2026)

- `streamGenerateContent?alt=sse` from `gemini-3.5-flash` sends `data:` events split by CRLF blank lines, each a `GenerateContentResponse`. The last carries `finishReason: "STOP"`, and an empty text part with a `thoughtSignature`. It sent no `thought` parts. That response is the parser's test fixture.
- A reply streams end to end, from a replayed file.

Not yet checked: a reply blocked on safety grounds, and the "still working" message after 20 seconds.

## Later

- **Spoken replies**, with `withVoice` and `speakAll`.
- **Summaries** of other sessions, so the named modes use them as the original does, and large projects stay within budget.
- **Verify**, the other half of the ECHO button.
- **Untranscribed audio** sent with the prompt.
- **Other languages**, from the original's templates.
- **Removing personal details**, with the template's block.
- **The agent joining in by itself.**
- **A pro model with a thinking budget**, to match the original.
- **Login.**
