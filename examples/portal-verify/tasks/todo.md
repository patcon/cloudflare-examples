# Tasks: portal-verify

[`../PLAN.md`](../PLAN.md) has the design, the sequence and the risks. Original sources: `~/repos/dembrane-echo` at `feat/bun-migration`, in `dembrane/platform/packages/verify/` and `dembrane/frontend/src/components/participant/verify/`.

For each task:

- Make sure that `pnpm test`, `pnpm typecheck` and `pnpm lint` pass. The tasks below show only the tests that are specific to them.
- For a check that calls Vertex, use a replay of a few seconds of speech, made with `say`.

## Task 1: Copy `portal-explore` as `portal-verify`

Scope: S. Depends on: none.

1. Copy `examples/portal-explore` to `examples/portal-verify`. Do not copy `node_modules/`, `.wrangler/`, `.dev.vars`, `docs/`, `PLAN.md` or `README.md`. Keep the `PLAN.md` and `tasks/` of this folder.
2. Change the name in `package.json` and `wrangler.jsonc`.
3. Set the dev port to 8796. Ports 8790 and 8793–8795 are in use.
4. Write a stub `README.md` that says the work is in progress.

- [x] No file names `portal-explore`, except to credit it as the source
- [x] `pnpm install` makes a lockfile for this folder. The folder has its own `.gitignore`
- [x] `pnpm dev` serves on <http://localhost:8796>
- [ ] Manual: a session at `/demo/start` records from the mic and shows the live transcript

Files: `package.json`, `pnpm-lock.yaml`, `wrangler.jsonc`, `vite.config.ts`, `README.md`

## Task 2: Remove Explore from the session

Scope: M. Depends on: Task 1.

1. In `SessionAgent`, remove `explore()`, `#generateReply`, `#saveReply`, `#otherSessions`, `#formatted`, the `replies` table and its migration, and the `reply*` and `lastReplyAt` state.
2. On the session page, remove the Explore button, the meter and `Replies`.
3. In `rules.ts`, remove `whyNotExplore` and `cooldownLeft`. Keep `recordedSecondsAt`.
4. Keep `streamReply` and the SSE parser for Task 7.

- [x] `SessionState` has only `projectId`, `recordingSince` and `recordedSeconds`
- [x] The session page shows the recording, the recorded time, the transcript and replay. It shows nothing about Explore
- [x] `test/rules.test.ts` keeps its `recordedSecondsAt` cases
- [ ] Manual: record, stop and record again. The transcript continues to grow

Files: `src/server/session-agent.ts`, `src/client/pages/Session.tsx`, `src/shared/rules.ts`, `test/rules.test.ts`

## Task 3: Remove Explore from the project

Scope: M. Depends on: Task 2.

1. In `ProjectAgent` and the settings page, remove `otherTranscripts`, `SessionAgent.transcriptForContext` (its caller), `contextPreview`, `#planContext`, and the Explore settings and their checks.
2. Remove `explore/prompt.ts`, the `get_reply_*` templates, and the planning functions in `explore/transcript.ts`.
3. Keep the session list on the settings page.
4. Rename `src/server/explore/` to `src/server/verify/`. Keep `gemini.ts`, `sse.ts` and a transcript helper that joins segments.
5. Remove the constants that nothing uses now.

- [x] `ProjectState` is an empty settings object, for Task 12
- [x] The settings page shows the sessions of the project, and nothing about Explore
- [x] No file imports `explore/`. `grep -ri explore src test` finds only comments that credit the source
- [x] `prompt.test.ts` and `settings.test.ts` are removed, or have only the remaining cases
- [x] Manual: a new session shows on `/demo/settings`

Files: `src/server/project-agent.ts`, `src/client/pages/Settings.tsx`, `src/server/verify/*` (from `explore/`), `src/shared/constants.ts`, `test/prompt.test.ts`, `test/settings.test.ts`

## Checkpoint: Foundation

- [x] Tests, typecheck and lint pass
- [ ] A session records, transcribes, stops and records again. It shows on the settings page
- [ ] Review with the user

## Task 4: The Verify prompts

Scope: S. Depends on: Task 3.

1. Copy `generate_artifact.en.jinja` and `revise_artifact.en.jinja` into `src/server/prompts/`, with no changes.
2. In `src/server/verify/prompt.ts`, render them with LiquidJS, as `portal-explore` does. Use `language: "English"` and `pii_redaction: false`.
3. Write `generatePrompt(topicPrompt, projectName, earlier, transcript)`. It returns `{system, user}`. The user message has the shape in `service.ts`:
   - `Project:`
   - Earlier outcomes as `- [time] (key) content`, or `Previous artifacts: None`
   - `Conversation transcript:`, or `No transcript available.`
   - `Audio attachments: None.`
4. Write `revisePrompt(transcript, outcome, feedback)`. It returns `{system, user}`. The user message is the fixed instruction of the original.

- [x] The system prompts have the topic prompt, or the transcript, outcome and feedback. They have no `{{` or `{%`
- [x] There is no HTML escape: a transcript with `<` and `&` stays the same
- [x] The PII block does not render
- [x] `pnpm test prompt` has one snapshot of each prompt

Files: `src/server/prompts/generate_artifact.en.jinja`, `src/server/prompts/revise_artifact.en.jinja`, `src/server/verify/prompt.ts`, `test/prompt.test.ts`

## Task 5: A system prompt in `streamReply`

Scope: XS. Depends on: Task 3.

1. Add an optional system prompt to `streamReply`. Send it as `systemInstruction: {parts: [{text}]}`, next to `contents`.
2. Rename the function `streamText`, because it now writes outcomes.

- [x] With a system prompt, the request body has `systemInstruction`. Without one, it does not
- [x] Errors and blocked replies do not change
- [x] New `pnpm test gemini`: it stubs `fetch`, examines the request body, and replays `test/fixtures/stream.txt`

Files: `src/server/verify/gemini.ts`, `test/gemini.test.ts`

## Task 6: Default topics and `whyNotVerify`

Scope: S. Depends on: Task 3.

1. In `src/shared/topics.ts`, put the six default topics from `verify/src/defaults.ts`, in their order. Each has a key, an English label, an emoji (from `TOPIC_ICON_MAP` in the portal) and a prompt.
2. In `src/shared/rules.ts`, write `whyNotVerify(facts)`. It returns null, or the reason that Verify cannot start:
   - An outcome is in generation.
   - Less than 60 seconds are recorded.
   - No text is transcribed.
   - Less than 2 minutes passed since the last outcome was complete.
3. Add `VERIFY_COOLDOWN_MS` to `constants.ts`, with its source. Keep `MIN_RECORDED_SECONDS`.

- [x] The six prompts are word for word the same as in `defaults.ts`
- [x] Each rule has its own reason, in the order above, as `whyNotExplore` did
- [x] Each constant names its source file
- [x] `pnpm test rules` has one case for each reason, and one case that passes

Files: `src/shared/topics.ts`, `src/shared/rules.ts`, `src/shared/constants.ts`, `test/rules.test.ts`

## Task 7: Generate an outcome

Scope: M. Depends on: Tasks 4, 5, 6.

This task has the highest risk. Do it end to end, with a bare page.

1. **Agent:** add an `outcomes` table: `id, topic_key, topic_label, topic_icon, content, created_at, revised_at, approved_at`. Add to the state: `verifyStatus` (`idle | generating | revising | slow | failed`), `verifyDraft`, `verifyError`, `pendingOutcomeId` and `lastVerifyAt`.
2. **`verify(topicKey)`:**
   1. Check `whyNotVerify`.
   2. Get the topic with `ProjectAgent.topic(key)` over RPC. For now, it answers from the default topics.
   3. Stream the outcome into `verifyDraft` inside `keepAliveWhile()`. Show the "still working" message after 20 seconds.
   4. Save the outcome as pending. Set `created_at` when it is saved, as in the original.
3. **`onStart`:** if a restart stopped an outcome, set it to `failed`.
4. **Page:** a Verify button with the reason from the rules, a plain list of the six topics, the streamed text, and the error with **Try again**.

- [x] A push on a topic streams an outcome onto the page. Two tabs show the same text
- [x] The complete outcome is in `outcomes`, unapproved. `pendingOutcome` holds it (the whole row, not only its ID)
- [x] The server refuses Verify for each rule, also when called from the console
- [x] A failed call (for example, an expired token) shows the reason and **Try again**
- [x] Manual: ask the user before the first Vertex call. Replay a few seconds of speech with `?debug=true`. Wait for 60 seconds, or replay a longer `say` file. Generate one outcome and read it

Files: `src/server/session-agent.ts`, `src/server/project-agent.ts`, `src/client/pages/Session.tsx`

## Checkpoint: An outcome streams

- [x] Tests, typecheck and lint pass
- [x] An outcome from a short replay is clear, has a title, and uses "we"
- [ ] Review with the user

## Task 8: Instructions, topic picker and the pending outcome

Scope: M. Depends on: Task 7.

Change the bare page of Task 7 into the flow of the original. Keep it on the session page, with no navigation.

1. **Topic chips** with emoji, below "What do you want to verify?". If there is only one topic, start it immediately.
2. **The five instructions** during generation. **Next** becomes active when the outcome is complete.
3. **The outcome** as Markdown, with **Back**. Back goes to the transcript and keeps the outcome pending, as `PLAN.md` says. **Return to outcome** opens it again. On a failed outcome, Back calls a new `dismissError()`.
4. After a reload, go directly to the outcome in generation, or to the pending outcome.
5. Select a Markdown renderer, for example `react-markdown`, and add it.

- [x] The views are in this sequence: chips, instructions, outcome. The recording continues in all of them
- [x] A reload during generation, and a reload on the pending outcome, both show the correct view
- [x] **Back** keeps the outcome pending. **Return to outcome** and a reload open it again
- [x] `vite build` passes with the new dependency
- [x] Manual: the flow in a phone-width window, and the reloads above

Files: `src/client/pages/Session.tsx`, `src/client/pages/Verify.tsx` (new, for the views), `src/server/session-agent.ts`, `package.json`

## Task 9: Revise

Scope: M. Depends on: Task 8.

1. Write `revise()`. The feedback is the segments since the `revised_at` of the pending outcome, or since `created_at` if there is no revision.
2. Stream the new text as `verify()` does, with `verifyStatus: "revising"`. Save it with a new `revised_at`.
3. Write `whyNotRevise(facts)` in `rules.ts`. It refuses during generation or revision, less than 30 seconds after the last revision, and if there is no new speech.
4. On the page, **Revise** shows the 30-second countdown. If there is no new speech, it shows "No new feedback detected yet…".

- [x] A second revision gets only the speech after the first revision
- [x] With no new speech, the server refuses with the message of the original, and the page shows it
- [x] The new text replaces the old text on the page and in `outcomes`
- [x] `pnpm test rules`, and a test that selects the feedback segments by time
- [x] Manual: with the mic, say a correction after the outcome shows. Push **Revise** and find the correction in the text. Push **Revise** again immediately and see the wait (checked with replayed `say` speech, not the mic)

Files: `src/server/session-agent.ts`, `src/shared/rules.ts`, `src/shared/constants.ts`, `src/client/pages/Verify.tsx`, `test/rules.test.ts`

## Task 10: Edit

Scope: S. Depends on: Task 8.

1. Write `editOutcome(content)`. It replaces the text of the pending outcome. It refuses empty text, text longer than a set limit, and an edit during generation or revision.
2. On the page, a pencil opens a text area with **Save** and **Cancel**.

- [x] A saved edit shows in all open tabs, and a reload keeps it
- [ ] **Revise** after an edit starts from the edited text
- [x] The length limit is in `constants.ts`, marked as specific to this example
- [ ] Manual: edit, reload, revise (edit and reload checked; revise after an edit needs new speech, left for the mic pass)

Files: `src/server/session-agent.ts`, `src/client/pages/Verify.tsx`, `src/shared/constants.ts`

## Task 11: Approve, and the approved list

Scope: S. Depends on: Task 8.

1. Write `approve()`. It sets `approved_at` on the pending outcome, clears `pendingOutcome` and broadcasts the outcome.
2. Write `listOutcomes()`. It returns the approved outcomes, newest first.
3. Below the transcript, show each approved outcome with its emoji, label and time. A push expands it in place.

- [ ] Approve goes back to the transcript. The outcome is at the top of the list in all tabs
- [ ] The list never shows an outcome that a new outcome replaced
- [ ] A reload keeps the list
- [ ] Manual: approve two outcomes on different topics, then reload

Files: `src/server/session-agent.ts`, `src/client/pages/Session.tsx`, `src/client/pages/Verify.tsx`

## Checkpoint: Verify works for a participant

- [ ] Tests, typecheck and lint pass
- [ ] One pass in a browser with the mic: verify, revise from speech, edit, approve, reload
- [ ] Review with the user

## Task 12: The host's topic settings

Scope: M. Depends on: Task 7.

1. Add `verifyEnabled`, `selectedTopics` and `customTopics` to `ProjectState`.
2. Write these callables:
   - `updateSettings`, with the checks of `checkSettingsChange`.
   - `addTopic({label, icon, prompt})`. The key is the key of the original: a slug of the label plus 8 random characters.
   - `removeTopic(key)`. It also removes the topic from the selection.
3. `topic(key)` refuses a topic that is not offered. Add "Verify is off" to `whyNotVerify`.
4. Offer topics in a fixed order: the defaults, then custom topics oldest first. If `selectedTopics` is empty, offer all topics.
5. The session chips come from the project state.
6. On the settings page, add a Verify switch, a checkbox for each topic, a form to add a topic, and **Remove** on each custom topic.

- [ ] If you clear a topic checkbox, its chip goes off an open session page, with no reload
- [ ] An added topic is offered, and makes outcomes with its own prompt
- [ ] With Verify off, the session button shows why, and the server refuses
- [ ] `pnpm test settings` covers the checks, the slug, and which topics are offered
- [ ] Manual: change settings in two tabs at the same time

Files: `src/server/project-agent.ts`, `src/server/verify/settings.ts`, `src/client/pages/Settings.tsx`, `src/client/pages/Verify.tsx`, `test/settings.test.ts`

## Task 13: Approved outcomes on the settings page

Scope: S. Depends on: Tasks 11, 12.

1. Write `ProjectAgent.approvedOutcomes()`. It asks each session for its approved outcomes over RPC, in parallel. It skips a session that does not answer, as `contextPreview` did.
2. The settings page shows them below each session, collapsed.
3. When a session sends an approval to the project, the settings page gets the outcomes again.

- [ ] An approval in a session shows on an open settings page
- [ ] A session that does not answer is skipped and logged. The other sessions show
- [ ] Manual: approve in one tab, and monitor the settings page in a different tab

Files: `src/server/project-agent.ts`, `src/server/session-agent.ts`, `src/client/pages/Settings.tsx`

## Task 14: README and PLAN

Scope: S. Depends on: Tasks 1–13.

1. Write a README with the layout of the `portal-explore` README: what it is, Run it, Pages, how an outcome works (with a sequence diagram), the prompts, limits, replay, how it works, and files.
2. Add screenshots in a table, as PNG files with dash names in `docs/`.
3. Update "Differences from the original" and "Not in the prototype" in `PLAN.md` to agree with the result. Add a "Checked against Vertex" note.
4. When all boxes are ticked, delete `tasks/todo.md`.

- [ ] All commands in the README run as written
- [ ] The README tells the two timing risks in `PLAN.md`
- [ ] Screenshots: topic picker, instructions, an outcome, a revised outcome, the approved list, the settings page
- [ ] Manual: do the README steps from a new clone of the folder

Files: `README.md`, `PLAN.md`, `docs/*.png`, `tasks/`

## Checkpoint: Complete

- [ ] All acceptance criteria above are ticked
- [ ] Ready for review
