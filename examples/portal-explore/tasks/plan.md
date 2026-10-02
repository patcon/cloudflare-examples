# Implementation Plan: portal-explore

## Overview

A port of the dembrane portal's **Explore** feature to Cloudflare. A phone records a conversation and Gemini Live transcribes it. When someone presses **Explore**, the session's agent sends the conversation so far, plus the project's other sessions, to Gemini. A 1–3 sentence reply streams back and stays on the page. Replies come only when someone asks for one.

Based on [`polis-statement-extraction`](../../polis-statement-extraction), and standalone like every example here: its own `package.json`, and its own copy of `packages/voice-gemini`.

## How the original works

The original's backend source is `~/repos/dembrane-echo/dembrane/platform/packages/conversations/src/v1/reply.ts`, a TypeScript port of `reply_utils.py`. Its portal is in `frontend/src/components/participant/` (`refine/RefineSelection.tsx`, `ParticipantConversationAudioContent.tsx`).

1. The **ECHO** button turns on after 60 seconds of recording. It opens a choice between Verify and Explore, each with a 2-minute cooldown kept in `localStorage`.
2. Explore posts `{language}` to `/conversations/:id/get-reply`. The participant never types anything.
3. The prompt (`get_reply_system` template) holds:
   - the project's context and its default title, description and transcript prompt
   - a global prompt that depends on the mode: the `summarize` or `brainstorm` template, or the project's custom prompt
   - the project's other conversations
   - this conversation's transcript, with earlier replies written in as `[Assistant Reply at this point in time: …]`
4. Other conversations are cut to about 4k tokens each, up to 80k tokens in total. They're summaries in the named modes, and transcripts otherwise. Audio recorded since the last reply that has no transcript yet is attached as raw audio.
5. The reply streams from `multi_modal_pro` with a 2048-token thinking budget, and is saved as a `conversation_reply`. If nothing has arrived after 20 seconds, the stream sends a "High demand" status.

## Architecture Decisions

- **`withVoiceInput`, not `withVoice`.** `withVoice` runs `onTurn` after every utterance, and when `onTurn` returns nothing it sends the client a "No response generated" error. That suits a call with the agent, not a group that asks for a reply now and then.
- **Two agents, as in polis-statement-extraction.**
  - `SessionAgent` (one per session) holds the live transcript, the replies and the Explore call.
  - `ProjectAgent` (one per project) holds the session list and the reply settings: context, mode, custom prompt, and whether Explore is on.

  They're top-level agents linked by `getAgentByName` RPC.
- **Generation runs in the agent, not in the request.** `explore()` is a `@callable` that starts the reply and returns. Text pieces go out with `broadcast`, and the text so far is kept in `replyDraft` state. A page that reloads mid-reply catches up from state, and two open tabs see the same reply. A streaming callable would tie the reply to one connection.
- **Rules checked on the server.** At least 60 seconds of recording, a 2-minute cooldown, and only one reply generating at a time. The original checks these in the browser only.
- **Other sessions over RPC.** `ProjectAgent.otherTranscripts(excludeId)` gets each listed session's transcript, cuts each to the per-session budget, and stops at the total. Tokens are estimated at 4 characters each, since there's no tokenizer in a Worker. There are no summaries yet, so every mode uses transcripts. That's the original's path when there's no mode.
- **Gemini on Vertex, streamed.** The reply uses `streamGenerateContent?alt=sse`, with the token setup from polis-statement-extraction (`pnpm google-token`). The model is `gemini-3.5-flash` to start. Whether to try a pro model with a thinking budget, as the original does, is an open question.
- **Routes follow polis-statement-extraction:**
  - `/:projectId/start`
  - `/:projectId/sessions/:sessionId`, with `?debug=true` to replay a file
  - `/:projectId/settings`
- **Spoken replies come later.** The finished reply is saved in one place in `explore()`, where a later `speakAll(reply)` (after switching to `withVoice`) would go.

### Kept from polis-statement-extraction

- live transcription (`GeminiLiveSTT`) and the `live_segments` table
- the start page
- project and session IDs
- replaying a file with `?debug=true`, to test without talking. Its 5-minute windows are transcribed by the batch model.

### Dropped from polis-statement-extraction

- statement extraction and its timer
- the review page
- the compressed recording, its R2 bucket, and the final pass that tells speakers apart

### Out of scope

- Verify
- spoken replies
- the agent joining in by itself
- sending untranscribed audio
- languages other than English
- removing personal details
- summaries of other sessions
- login

## Dependency graph

```
Scaffold (copy + strip)
   ├── Prompt and transcript functions (pure) ──┐
   ├── Gemini streaming client ─────────────────┼── SessionAgent.explore() ── Session page: Explore
   │                                            │          │
   └── ProjectAgent settings ───────────────────┘          ├── Settings page
                                                           └── Other sessions over RPC
                                                                   └── Docs
```

## Task List

The tasks and their checks are in [`todo.md`](todo.md).

**Phase 1: Foundation**
- [ ] Task 1: Scaffold portal-explore from polis-statement-extraction
- [ ] Task 2: Prompt and transcript functions, with tests
- [ ] Task 3: Gemini streaming client, with a parser test
- [ ] Checkpoint: checks pass, and recording still works

**Phase 2: Core feature**
- [ ] Task 4: `SessionAgent.explore()`, using only this session's transcript
- [ ] Task 5: Explore on the session page
- [ ] Checkpoint: one session end to end, then review with the user

**Phase 3: Project context**
- [ ] Task 6: Project settings and the settings page
- [ ] Task 7: Other sessions as context
- [ ] Checkpoint: whole feature

**Phase 4: Docs**
- [ ] Task 8: README, PLAN.md and the root README

Tasks 2 and 3 are independent of each other, so they can run in parallel.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Vertex's streaming response format differs from what we parse | Med | Task 3 tests the parser on a captured response before the agent uses it |
| A Durable Object stops while a reply streams | Low | Each reply is 1–3 sentences, and the open WebSocket keeps the object alive. If a reply fails partway, it's marked `failed` and can be tried again |
| Broadcasting every text piece floods the page | Low | Pieces arrive a few times a second. Batch them if it shows up in testing |
| Waking every session for context is slow in a large project | Low | Calls run in parallel, and a demo has a handful of sessions. Summaries later would remove the need |
| Testing costs Vertex requests | Med | Per the repo's memory, ask before large or repeated test requests. A replay of a short file is enough to check |
| Copying and stripping leaves dead code from polis-statement-extraction | Low | Task 1 checks that `grep` finds no `extract`, `statement`, `RECORDINGS` or `final` left |

## Open Questions

- **Model:** `gemini-3.5-flash` to start, or a pro model with a thinking budget to match the original?
- **Can a stopped session record again?** polis-statement-extraction ends a session on Stop only because its recording has to be one file, and that recording is dropped here. The plan lets a session start and stop as often as needed. The 60 seconds are then total recorded time, kept in state so a reload doesn't reset it.
