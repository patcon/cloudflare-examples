# Tasks: portal-verify

See [`plan.md`](plan.md) for the order and the risks, and [`../PLAN.md`](../PLAN.md) for the design. Original sources are in `~/repos/dembrane-echo` at `feat/bun-migration`: `dembrane/platform/packages/verify/` and `dembrane/frontend/src/components/participant/verify/`.

Every task also clears `pnpm test`, `pnpm typecheck` and `pnpm lint`. Any check that calls Vertex uses a replay of a few seconds of speech, made with `say`.

## Task 1: Copy `portal-explore` as `portal-verify`

**Description:** Copy `examples/portal-explore` to `examples/portal-verify`, leaving out `node_modules/`, `.wrangler/`, `.dev.vars`, `docs/`, `PLAN.md` and `README.md`, and keeping this folder's `PLAN.md` and `tasks/`. Rename it in `package.json` and `wrangler.jsonc`. Set the dev port to 8796, since 8790 and 8793–8795 are taken. Start a stub `README.md` that says it's in progress.

**Acceptance criteria:**
- [ ] No file in the folder names `portal-explore`, except where it credits it as the source
- [ ] `pnpm install` makes its own lockfile; the folder has its own `.gitignore`
- [ ] `pnpm dev` serves on <http://localhost:8796>

**Verification:**
- [ ] Tests pass: `pnpm test`
- [ ] Build succeeds: `pnpm typecheck`
- [ ] Manual check: a session at `/demo/start` records from the mic and shows the live transcript

**Dependencies:** None

**Files likely touched:** `package.json`, `pnpm-lock.yaml`, `wrangler.jsonc`, `vite.config.ts`, `README.md`

**Estimated scope:** S (a copy and four edits)

## Task 2: Remove Explore from the session

**Description:** Take Explore out of `SessionAgent` and the session page: `explore()`, `#generateReply`, `#saveReply`, `#otherSessions`, `#formatted`, `transcriptForContext`, the `replies` table and its migration, and the `reply*` and `lastReplyAt` state. On the page, the Explore button, meter and `Replies`. In `rules.ts`, `whyNotExplore` and `cooldownLeft`; keep `recordedSecondsAt`. Keep `streamReply` and the SSE parser for Task 7.

**Acceptance criteria:**
- [ ] `SessionState` holds only `projectId`, `recordingSince` and `recordedSeconds`
- [ ] The session page shows recording, the recorded time, the transcript and replay, and nothing about Explore
- [ ] `test/rules.test.ts` keeps its `recordedSecondsAt` cases

**Verification:**
- [ ] Tests pass: `pnpm test`
- [ ] Build succeeds: `pnpm typecheck`
- [ ] Manual check: record, stop and record again; the transcript keeps growing

**Dependencies:** Task 1

**Files likely touched:** `src/server/session-agent.ts`, `src/client/pages/Session.tsx`, `src/shared/rules.ts`, `test/rules.test.ts`

**Estimated scope:** M

## Task 3: Remove Explore from the project

**Description:** Take Explore out of `ProjectAgent` and the settings page: `otherTranscripts`, `contextPreview` and `#planContext`; the Explore settings and their checks; `explore/prompt.ts`, the `get_reply_*` templates, and the planning functions in `explore/transcript.ts`. Keep the session list on the settings page. Rename `src/server/explore/` to `src/server/verify/`, keeping `gemini.ts`, `sse.ts` and a transcript helper that joins segments. Remove the constants nothing uses any more.

**Acceptance criteria:**
- [ ] `ProjectState` is an empty settings object, ready for Task 12
- [ ] The settings page lists the project's sessions, and nothing about Explore
- [ ] No file imports `explore/`; `grep -ri explore src test` finds only comments that credit the source

**Verification:**
- [ ] Tests pass: `pnpm test`, with `prompt.test.ts` and `settings.test.ts` removed or reduced to what's left
- [ ] Build succeeds: `pnpm typecheck`
- [ ] Manual check: a new session shows up on `/demo/settings`

**Dependencies:** Task 2

**Files likely touched:** `src/server/project-agent.ts`, `src/client/pages/Settings.tsx`, `src/server/verify/*` (from `explore/`), `src/shared/constants.ts`, `test/prompt.test.ts`, `test/settings.test.ts`

**Estimated scope:** M

## Checkpoint: Foundation

- [ ] Tests, typecheck and lint pass
- [ ] A session records, transcribes, stops and records again; it shows on the settings page
- [ ] Review with the user

## Task 4: The Verify prompts

**Description:** Copy `generate_artifact.en.jinja` and `revise_artifact.en.jinja` unchanged into `src/server/prompts/`. In `src/server/verify/prompt.ts`, render them with LiquidJS as `portal-explore` did, with `language: "English"` and `pii_redaction: false`, and build both prompts:
- `generatePrompt(topicPrompt, projectName, earlier, transcript)` returns `{system, user}`. The user message keeps `service.ts`'s shape: `Project:`, earlier outcomes as `- [time] (key) content` or `Previous artifacts: None`, `Conversation transcript:`, or `No transcript available.`, and `Audio attachments: None.`
- `revisePrompt(transcript, outcome, feedback)` returns `{system, user}`, the user message being the original's fixed instruction.

**Acceptance criteria:**
- [ ] The rendered system prompts hold the topic's prompt, or the transcript, outcome and feedback, and no `{{` or `{%`
- [ ] Nothing is HTML-escaped: a transcript with `<` and `&` goes in as written
- [ ] The PII block isn't rendered

**Verification:**
- [ ] Tests pass: `pnpm test prompt`, with one snapshot of each prompt
- [ ] Build succeeds: `pnpm typecheck`

**Dependencies:** Task 3

**Files likely touched:** `src/server/prompts/generate_artifact.en.jinja`, `src/server/prompts/revise_artifact.en.jinja`, `src/server/verify/prompt.ts`, `test/prompt.test.ts`

**Estimated scope:** S

## Task 5: A system prompt in `streamReply`

**Description:** Give `streamReply` an optional system prompt, sent as `systemInstruction: {parts: [{text}]}` beside `contents`. Rename it `streamText`, since it writes outcomes now.

**Acceptance criteria:**
- [ ] With a system prompt, the request body has `systemInstruction`; without one, it doesn't
- [ ] Errors and blocked replies behave as before

**Verification:**
- [ ] Tests pass: `pnpm test gemini`, a new test that stubs `fetch` and checks the request body, and replays `test/fixtures/stream.txt`
- [ ] Build succeeds: `pnpm typecheck`

**Dependencies:** Task 3

**Files likely touched:** `src/server/verify/gemini.ts`, `test/gemini.test.ts`

**Estimated scope:** XS

## Task 6: Default topics and `whyNotVerify`

**Description:** `src/shared/topics.ts` holds the six default topics from `verify/src/defaults.ts`, in order: key, English label, emoji (from the portal's `TOPIC_ICON_MAP`) and prompt. In `src/shared/rules.ts`, `whyNotVerify(facts)` gives the reason Verify can't run, or null: an outcome being written, under 60 seconds recorded, nothing transcribed, or under 2 minutes since the last outcome finished. Add `VERIFY_COOLDOWN_MS` to `constants.ts` with its source, and keep `MIN_RECORDED_SECONDS`.

**Acceptance criteria:**
- [ ] The six prompts match `defaults.ts` word for word
- [ ] Each rule has its own reason, in the order listed, as `whyNotExplore` had
- [ ] Constants name the file each comes from

**Verification:**
- [ ] Tests pass: `pnpm test rules`, one case per reason and one that passes
- [ ] Build succeeds: `pnpm typecheck`

**Dependencies:** Task 3

**Files likely touched:** `src/shared/topics.ts`, `src/shared/rules.ts`, `src/shared/constants.ts`, `test/rules.test.ts`

**Estimated scope:** S

## Task 7: Generate an outcome

**Description:** The riskiest slice, end to end with a bare page:
- **Agent.** An `outcomes` table: `id, topic_key, topic_label, topic_icon, content, created_at, revised_at, approved_at`. State gains `verifyStatus` (`idle | generating | revising | slow | failed`), `verifyDraft`, `verifyError`, `pendingOutcomeId` and `lastVerifyAt`.
- **`verify(topicKey)`.** Checks `whyNotVerify`. Asks `ProjectAgent.topic(key)` over RPC, which for now answers from the default topics. Then it streams the outcome into `verifyDraft` inside `keepAliveWhile()`, with the "still working" message after 20 seconds, and saves it as the pending outcome. `created_at` is set when it's saved, as in the original.
- **`onStart`** marks an outcome cut off by a restart as failed.
- **Page.** A Verify button with the rule's reason, a plain list of the six topics to press, the streaming text, and the error with **Try again**.

**Acceptance criteria:**
- [ ] Pressing a topic streams an outcome onto the page; two tabs see the same text
- [ ] The finished outcome is in `outcomes`, unapproved, and `pendingOutcomeId` names it
- [ ] Verify refuses on the server for each rule, even when called from the console
- [ ] A failed call, such as an expired token, shows the reason and **Try again**

**Verification:**
- [ ] Tests pass: `pnpm test`
- [ ] Build succeeds: `pnpm typecheck`
- [ ] Manual check: replay a few seconds of speech with `?debug=true`. Wait out the 60 seconds, or replay a longer `say` file. Generate one outcome and read it. Ask the user before the first Vertex call.

**Dependencies:** Tasks 4, 5, 6

**Files likely touched:** `src/server/session-agent.ts`, `src/server/project-agent.ts`, `src/client/pages/Session.tsx`

**Estimated scope:** M

## Checkpoint: An outcome streams

- [ ] Tests, typecheck and lint pass
- [ ] An outcome from a short replay reads sensibly, has a title, and uses "we"
- [ ] Review with the user

## Task 8: Instructions, topic picker and the pending outcome

**Description:** Turn Task 7's bare page into the original's flow, on the session page, without navigating:
- **Topic chips**, with emoji, under "What do you want to verify?". With only one topic, it starts at once.
- **The five instructions** while the outcome is written, with **Next** once it's done.
- **The outcome**, rendered as Markdown, with **Back**, which calls a new `leaveOutcome()`.

A reload goes straight back to the outcome being written, or the pending one. Pick a Markdown renderer, such as `react-markdown`, and add it.

**Acceptance criteria:**
- [ ] The views go: chips, then instructions, then the outcome; recording carries on through all of them
- [ ] A reload while it's being written, and a reload on the pending outcome, both come back to the right view
- [ ] **Back** clears `pendingOutcomeId` and keeps the row

**Verification:**
- [ ] Tests pass: `pnpm test`
- [ ] Build succeeds: `pnpm typecheck`, and `vite build` with the new dependency
- [ ] Manual check: the flow on a phone-width window, and the reloads above

**Dependencies:** Task 7

**Files likely touched:** `src/client/pages/Session.tsx`, `src/client/pages/Verify.tsx` (new, for the views), `src/server/session-agent.ts`, `package.json`

**Estimated scope:** M

## Task 9: Revise

**Description:** `revise()` takes the segments since the pending outcome's `revised_at`, or its `created_at` when it hasn't been revised, as the feedback. It streams the rewrite as `verify()` does, with `verifyStatus: "revising"`, and saves it with a new `revised_at`. `whyNotRevise(facts)` in `rules.ts` refuses while something is being written, within 30 seconds of the last revision, or with nothing new said. On the page, **Revise** shows the 30-second countdown, and "No new feedback detected yet…" when there's nothing new.

**Acceptance criteria:**
- [ ] A second revision gets only what was said after the first
- [ ] With nothing said since, the server refuses with the original's message, and the page shows it
- [ ] The revised text replaces the old on the page and in `outcomes`

**Verification:**
- [ ] Tests pass: `pnpm test rules`, plus a test of choosing the feedback segments by time
- [ ] Build succeeds: `pnpm typecheck`
- [ ] Manual check: with the mic, say a correction after the outcome appears, press **Revise**, and see it in the text. Press **Revise** again at once and see the wait.

**Dependencies:** Task 8

**Files likely touched:** `src/server/session-agent.ts`, `src/shared/rules.ts`, `src/shared/constants.ts`, `src/client/pages/Verify.tsx`, `test/rules.test.ts`

**Estimated scope:** M

## Task 10: Edit

**Description:** `editOutcome(content)` replaces the pending outcome's text, refusing empty text, text over a set length, or an edit while something is being written. On the page, a pencil opens a text area with **Save** and **Cancel**.

**Acceptance criteria:**
- [ ] A saved edit shows in every open tab, and survives a reload
- [ ] **Revise** after an edit starts from the edited text
- [ ] The length limit is in `constants.ts`, marked as made up for this example

**Verification:**
- [ ] Tests pass: `pnpm test`
- [ ] Build succeeds: `pnpm typecheck`
- [ ] Manual check: edit, reload, revise

**Dependencies:** Task 8

**Files likely touched:** `src/server/session-agent.ts`, `src/client/pages/Verify.tsx`, `src/shared/constants.ts`

**Estimated scope:** S

## Task 11: Approve, and the approved list

**Description:** `approve()` sets `approved_at` on the pending outcome, clears `pendingOutcomeId` and broadcasts the outcome. `listOutcomes()` returns the approved ones, newest first. Under the transcript, each shows its emoji, label and time, and expands in place when pressed.

**Acceptance criteria:**
- [ ] Approving goes back to the transcript, and the outcome is at the top of the list in every tab
- [ ] An outcome left with **Back**, or replaced by a new one, is never listed
- [ ] The list survives a reload

**Verification:**
- [ ] Tests pass: `pnpm test`
- [ ] Build succeeds: `pnpm typecheck`
- [ ] Manual check: approve two outcomes on different topics, then reload

**Dependencies:** Task 8

**Files likely touched:** `src/server/session-agent.ts`, `src/client/pages/Session.tsx`, `src/client/pages/Verify.tsx`

**Estimated scope:** S

## Checkpoint: Verify works for a participant

- [ ] Tests, typecheck and lint pass
- [ ] One pass in a browser with the mic: verify, revise from something said, edit, approve, reload
- [ ] Review with the user

## Task 12: The host's topic settings

**Description:** `ProjectState` gains `verifyEnabled`, `selectedTopics` and `customTopics`. Callables:
- `updateSettings`, checked as `checkSettingsChange` was.
- `addTopic({label, icon, prompt})`, with the original's key: a slug of the label plus 8 random characters.
- `removeTopic(key)`, which also drops it from the selection.

`topic(key)` refuses a topic that isn't offered, and `whyNotVerify` gains "Verify is off". Topics are offered in a fixed order: the defaults, then custom ones oldest first. When `selectedTopics` is empty, all of them are offered. The session's chips come from the project's state. The settings page gets a Verify switch, a checkbox per topic, a form to add one, and **Remove** on each custom topic.

**Acceptance criteria:**
- [ ] Unticking a topic removes its chip from an open session page, without a reload
- [ ] An added topic is offered, and makes outcomes with its own prompt
- [ ] With Verify off, the session's button says why, and the server refuses

**Verification:**
- [ ] Tests pass: `pnpm test settings`, covering the checks, the slug, and which topics are offered
- [ ] Build succeeds: `pnpm typecheck`
- [ ] Manual check: change settings in two tabs at once

**Dependencies:** Task 7

**Files likely touched:** `src/server/project-agent.ts`, `src/server/verify/settings.ts`, `src/client/pages/Settings.tsx`, `src/client/pages/Verify.tsx`, `test/settings.test.ts`

**Estimated scope:** M

## Task 13: Approved outcomes on the settings page

**Description:** `ProjectAgent.approvedOutcomes()` asks each session for its approved outcomes over RPC, in parallel, skipping any that don't answer, as `contextPreview` did. The settings page lists them under each session, collapsed, and refetches when a session broadcasts an approval to the project.

**Acceptance criteria:**
- [ ] Approving in a session shows the outcome on an open settings page
- [ ] A session that doesn't answer is skipped and logged, and the rest still show

**Verification:**
- [ ] Tests pass: `pnpm test`
- [ ] Build succeeds: `pnpm typecheck`
- [ ] Manual check: approve in one tab, and watch the settings page in another

**Dependencies:** Tasks 11, 12

**Files likely touched:** `src/server/project-agent.ts`, `src/server/session-agent.ts`, `src/client/pages/Settings.tsx`

**Estimated scope:** S

## Task 14: README and PLAN

**Description:** A README in the shape of `portal-explore`'s: what it is, Run it, Pages, how an outcome works with a sequence diagram, the prompts, limits, replay, how it works, and files. Add screenshots in a table, as dash-named PNGs in `docs/`. Move `PLAN.md`'s "How it differs" and "What doesn't make the cut" in line with what was built, and add a "Checked against Vertex" note. Archive `tasks/` to `tasks/archive/<date>-portal-verify/`.

**Acceptance criteria:**
- [ ] Every command in the README runs as written
- [ ] The README mentions the two timing quirks in `plan.md`'s risks
- [ ] Screenshots: topic picker, instructions, an outcome, a revised outcome, the approved list, the settings page

**Verification:**
- [ ] Tests pass: `pnpm test`
- [ ] Build succeeds: `pnpm typecheck`
- [ ] Manual check: follow the README from a fresh clone of the folder

**Dependencies:** Tasks 1–13

**Files likely touched:** `README.md`, `PLAN.md`, `docs/*.png`, `tasks/`

**Estimated scope:** S

## Checkpoint: Complete

- [ ] Every acceptance criterion above is ticked
- [ ] Ready for review
