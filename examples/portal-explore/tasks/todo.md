# Tasks: portal-explore

See [`plan.md`](plan.md) for the design. Commands run from `examples/portal-explore`.

## Phase 1: Foundation

## Task 1: Scaffold portal-explore from polis-statement-extraction

**Description:** Copy polis-statement-extraction to `examples/portal-explore` (without `node_modules`, `dist`, `.wrangler` or `.dev.vars`), and strip it down to recording and live transcription. Then:
- Remove extraction, the timer, the review page, the compressed recording, R2 and the final pass.
- Keep `?debug=true` replay, but stop it from becoming the session's recording.
- Let a stopped session record again, and keep the total recorded seconds in state.
- Rename the package and Worker, and use a dev port no other example uses.

**Acceptance criteria:**
- [ ] `/:projectId/start` makes a session, and `/:projectId/sessions/:id` records and shows the live transcript. Stop, then Start again, keeps adding to the same transcript.
- [ ] `grep -rniE "extract|statement|RECORDINGS|final|diariz" src` finds nothing that's left over.
- [ ] `wrangler.jsonc` has no R2 bucket, the dev port is unique in the repo, and the migration is a fresh `v1`.

**Verification:**
- [ ] `pnpm install && pnpm typecheck && pnpm lint && pnpm test`
- [ ] Manual check: `pnpm dev`, record 20 seconds, stop, start again, and see the transcript keep its lines after a reload

**Dependencies:** None

**Files likely touched:** a copy of the whole example, then `src/server/session-agent.ts`, `src/server/project-agent.ts`, `src/server/server.ts`, `src/client/index.tsx`, `src/client/pages/Session.tsx`, `wrangler.jsonc`, `package.json`, `vite.config.ts`. Mostly deleting.

**Estimated scope:** Large, but mechanical. Commit the plain copy first, then the deletions, so the diff is readable.

## Task 2: Prompt and transcript functions, with tests

**Description:** Port the reply's pure logic into `src/server/explore/`:
- `get_reply_system`, `get_reply_summarize` and `get_reply_brainstorm` as TypeScript strings, English only, without the personal-details block
- `formatConversation` and `buildTranscript`, which writes in earlier replies
- truncating each other session to the per-session budget and stopping at the total, with tokens estimated at 4 characters each
- `buildPrompt(settings, current, others)`, which picks the global prompt by mode, as `reply.ts` does

**Acceptance criteria:**
- [ ] `buildTranscript` orders segments and replies by time, and writes each reply as `[Assistant Reply at this point in time: …]`.
- [ ] A transcript over the budget is cut, ending `[Truncated for brevity...]`, and sessions past the total are left out.
- [ ] `custom` mode with an empty prompt falls back to the summarize template.

**Verification:**
- [ ] `pnpm test` (new `test/prompt.test.ts`)

**Dependencies:** Task 1

**Files likely touched:** `src/server/explore/prompt.ts`, `src/server/explore/transcript.ts`, `test/prompt.test.ts`

**Estimated scope:** Small

## Task 3: Gemini streaming client, with a parser test

**Description:** Write `streamReply(vertex, prompt, signal)`, an async generator over `streamGenerateContent?alt=sse` that yields text pieces. It throws `VertexError` with the status, as polis-statement-extraction's `gemini.ts` does, and a distinct error when Gemini blocks the reply on safety grounds. Keep the event-stream parser a pure function and test it against a captured response.

**Acceptance criteria:**
- [ ] The parser joins text across events, ignores the `thought` parts that thinking models send, and handles an event split across network chunks.
- [ ] A safety block with no text becomes its own error type.

**Verification:**
- [ ] `pnpm test` (new `test/sse.test.ts`)
- [ ] Manual check, **after asking the user**: one short request through a tiny script or the agent, with its response saved as the test fixture

**Dependencies:** Task 1

**Files likely touched:** `src/server/explore/gemini.ts`, `src/server/explore/sse.ts`, `test/sse.test.ts`, `test/fixtures/stream.txt`, `src/server/models.ts`

**Estimated scope:** Small

### Checkpoint: Foundation
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Recording and live transcription still work

## Phase 2: Core feature

## Task 4: `SessionAgent.explore()`, using only this session's transcript

**Description:** Add the following to `SessionAgent`:
- a `replies` table (`id`, `at`, `text`) and a `listReplies()` callable
- state: `replyStatus` (`idle`, `thinking`, `streaming`, `slow` or `failed`), `replyDraft`, `replyError`, `lastReplyAt` and `recordedSeconds`
- an `explore()` callable that checks the rules, sets `thinking`, and starts generation without waiting for it

Generation builds the prompt from this session's transcript and default settings (summarize mode, no context). It broadcasts each text piece and keeps the text so far in `replyDraft`, switching to `slow` if nothing has arrived after 20 seconds. Once the reply is done, it saves it in one place, which is where a later `speakAll` would go, broadcasts it, and resets the status.

**Acceptance criteria:**
- [ ] `explore()` refuses, with a clear reason, under 60 seconds recorded, within 2 minutes of the last reply, or while a reply is generating.
- [ ] A page that reloads mid-reply sees the text so far, then the finished reply. After a failure, the status is `failed` with the error, and Explore can be tried again.
- [ ] Earlier replies are written into the next reply's prompt.

**Verification:**
- [ ] `pnpm typecheck && pnpm test`, with the rules as a pure function in `test/rules.test.ts`
- [ ] Manual check with Task 5's page

**Dependencies:** Tasks 2, 3

**Files likely touched:** `src/server/session-agent.ts`, `src/server/explore/rules.ts`, `src/shared/limits.ts`, `test/rules.test.ts`

**Estimated scope:** Medium

## Task 5: Explore on the session page

**Description:** On `Session.tsx`, add an **Explore** button that fills over the first 60 seconds recorded, then shows the cooldown left. Below the transcript, show the replies: the reply in progress as it streams, "Thinking…", a "Still working…" note when slow, and the error with **Try again** when it fails. Replies stay in place after a reload.

**Acceptance criteria:**
- [ ] The button is disabled with a reason before 60 seconds, during the cooldown and while a reply generates. The fill and countdown follow the server's state.
- [ ] A reply streams in, then joins the list, and the list stays after a reload.

**Verification:**
- [ ] `pnpm typecheck && pnpm lint`
- [ ] Manual check: record or replay a short file, press Explore, and reload mid-reply

**Dependencies:** Task 4

**Files likely touched:** `src/client/pages/Session.tsx`, `src/client/ui.tsx`

**Estimated scope:** Small

### Checkpoint: One session end to end
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Record, press Explore, a reply streams in and stays after a reload. A second Explore within 2 minutes is refused
- [ ] Review with the user before going on

## Phase 3: Project context

## Task 6: Project settings and the settings page

**Description:** `ProjectAgent` keeps its settings: `exploreEnabled`, `mode` (`summarize`, `brainstorm` or `custom`), `customPrompt` and `context`. It checks them when they change, and has callables to read and change them. Add a `/:projectId/settings` page to edit them, linked from the start page. `explore()` reads the settings over RPC instead of using defaults, and refuses when Explore is off. The session page hides the button when it's off.

**Acceptance criteria:**
- [ ] A change on the settings page shows up in the next reply, and in another open settings tab.
- [ ] With Explore off, the button is hidden and `explore()` refuses.

**Verification:**
- [ ] `pnpm typecheck && pnpm lint && pnpm test`
- [ ] Manual check: switch to brainstorm mode and see the reply's style change

**Dependencies:** Task 4

**Files likely touched:** `src/server/project-agent.ts`, `src/server/session-agent.ts`, `src/client/pages/Settings.tsx`, `src/client/index.tsx`, `src/client/pages/Start.tsx`

**Estimated scope:** Medium

## Task 7: Other sessions as context

**Description:** Add `SessionAgent.transcriptForContext()`, which returns this session's transcript, with replies written in, as a string. Add `ProjectAgent.otherTranscripts(excludeId)`, which calls every other listed session in parallel and returns the formatted text, within the budget, using Task 2's functions. `explore()` puts the result in the prompt. A session that fails to answer is skipped and logged, rather than failing the reply.

**Acceptance criteria:**
- [ ] A reply in session B can refer to something said only in session A of the same project.
- [ ] Sessions in other projects never appear, and an empty session adds nothing.

**Verification:**
- [ ] `pnpm typecheck && pnpm test`
- [ ] Manual check: replay two short files in two sessions of one project, then press Explore in the second

**Dependencies:** Tasks 2, 6

**Files likely touched:** `src/server/project-agent.ts`, `src/server/session-agent.ts`

**Estimated scope:** Small

### Checkpoint: Whole feature
- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` pass
- [ ] Every acceptance criterion above is met

## Phase 4: Docs

## Task 8: README, PLAN.md and the root README

**Description:** Write the example's `README.md`, following polis-statement-extraction's: what it does, how to run it, pages, how a reply is built, and files. Include screenshots in a table with captions in the header row. Turn `tasks/plan.md` into `PLAN.md`, with the decisions, how it differs from the original, and what's left for later (spoken replies, summaries, Verify). Add a row to the root README.

**Acceptance criteria:**
- [ ] Someone new can run it from the README alone.
- [ ] The root README lists `examples/portal-explore`.

**Verification:**
- [ ] Manual check: follow the README from a clean clone

**Dependencies:** Task 7

**Files likely touched:** `README.md`, `PLAN.md`, `docs/*.png`, `../../README.md`

**Estimated scope:** Small

### Checkpoint: Complete
- [ ] All checks pass and the README is accurate
- [ ] Ready for the user's review
