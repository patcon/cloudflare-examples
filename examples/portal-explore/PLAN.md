# Plan: polis-statement-extraction

A group sits around one phone that records their conversation. The live transcript is checked every 5 minutes, or on demand, for Polis-style statements of belief. A host on another device reviews the statements from every session in a project. Once a session stops, the whole recording is diarized in one pass, so speaker numbers hold across it, and one last extraction runs over that transcript. There's no voting yet.

See the [README](README.md) for running it and how a session works. This file records the decisions behind it.

## Decisions

- **Gemini only, on Vertex.** There are free credits for it. `gemini-3.5-transcribe-live-preview` gives the live text, `gemini-3.5-transcribe-preview` the replayed windows and the diarized pass, and `gemini-3.5-flash` the extraction. Vertex serves the transcription models from `global` only.
- **A project above sessions.** `ProjectAgent` holds what the host reviews, across every session. `SessionAgent` holds one recording. They're two top-level agents linked by RPC (`getAgentByName`), not SDK sub-agents. Those are experimental, and a sub-agent's WebSockets pass through its parent, so every audio frame would take an extra hop.
- **No voting.** A session is a group, not one person, so per-person reactions wait until we know who's reacting.
- **The host approves.** Every statement waits for the host: approve, edit then approve, or reject. Nothing reaches participants on its own.
- **Diarize once, at the end.** Diarizing each 5-minute window made speaker numbers start over in each window. One pass over the whole recording keeps them. The live runs use the live text, without speakers.
- **A compressed copy for the final pass.** An hour of 16kHz WAV is about 115MB: far over Vertex's 20MB inline limit, and close to a Worker's 128MB memory. Opus at 24kbps is about 11MB an hour, so the page records one with `MediaRecorder` and uploads it in 10-second pieces. The pieces live in R2, which `vite dev` emulates on disk. Vertex can't reach that R2, but it doesn't need to: the audio goes inline.
- **One recording per session.** WebM pieces only join into one file from one `MediaRecorder` run, so stopping ends the session. A page that goes away mid-recording leaves the session with a **Finish** button, which diarizes what's there.
- **The built-in queue for runs.** `queue()` runs one task at a time and survives restarts, so runs can't overlap. Pressing **Extract now** twice queues twice, and the second finds nothing new. A stable queue ID would have deduplicated runs, but it isn't clear that replacing an item works while that item is running. The Stop run could have been lost.
- **Filtered and rejected statements are kept.** They're the data for tuning the prompt. `PROMPT_VERSION` is saved with each statement.
- **Debug replay goes through the batch model.** An uploaded file is cut into 5-minute windows, each transcribed by the batch model and then extracted from. This is far faster than playing it through Gemini Live in real time, and it exercises the same extraction path.
- **Gemini Live resumes.** Without context window compression, an audio session ends after 15 minutes. And Vertex closes each connection after a while. So the setup asks for `contextWindowCompression.slidingWindow` and `sessionResumption`, and the session reconnects with the latest handle on `goAway` or a dropped connection.

## Stack

- **Worker:** Hono, with `hono-agents` for the agents' WebSockets.
- **Agents:** `agents` 0.24, with `withVoiceInput` for the live stream. Each agent's SQLite holds its tables, created idempotently in the constructor.
- **Storage:** R2 (`RECORDINGS`) for the recording's pieces.
- **Page:** React and kumo, built with Vite. The `agents/vite` plugin compiles `@callable()`. `index.html` stays at the root because Vite builds from it.
- **Tooling:** pnpm, vitest for pure functions, Biome for formatting and lint, and split tsconfigs so the Worker can't use browser APIs.

## Checked against Vertex (1 October 2026)

- WebM/Opus pieces joined in order transcribe as one file, with diarization.
- `gemini-3.5-transcribe-live-preview` accepts `contextWindowCompression` and `sessionResumption` in its setup.
- `gemini-3.5-flash` answers with a `responseSchema`.

Not yet checked: a live session past Vertex's limits, so a real resume, and an hour-long recording through the final pass.

## Later

- **Votes**, and who in the group is voting.
- **Votes feeding extraction**, such as favoring topics that split the room.
- **A judge pass:** a second call that scores and prunes candidates, and replayed recordings to compare prompt versions.
- **Polis export:** approved statements as a Polis `comments.csv`, which `polis-durable-object`'s import page takes.
- **Tokens that outlast an hour:** a service account key, minted into tokens with WebCrypto, for long sessions and for deploying.
- **Auth** on the review page.
- **Longer recordings** for the final pass, through a Cloud Storage upload instead of an inline request.
- **Sessions as sub-agents** of their project, once sub-agent WebSockets are proven for voice.
