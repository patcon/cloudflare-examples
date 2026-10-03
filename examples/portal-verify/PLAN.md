# Plan: portal-verify

This example ports the **Verify** feature of the dembrane portal to Cloudflare. A phone records a group conversation, and Gemini Live writes the transcript. The Verify procedure:

1. A participant pushes **Verify** and selects a topic, for example "What we actually agreed on".
2. Gemini writes an **outcome**: a short document from the conversation.
3. The group reads the outcome aloud and says what is wrong. The phone continues to record.
4. **Revise** writes the outcome again from what the group said.
5. **Approve** keeps the outcome. The host can see it.

This is a plan. There is no code yet. The example starts as a full copy of [`portal-explore`](../portal-explore), because each example must be standalone. [Steps](#steps) divides the work into tasks.

## Sources

Repository: `~/repos/dembrane-echo`, branch `feat/bun-migration` at `852bbac7`. The local checkout is on `feat/bun-migration-patcon` (22 commits ahead, 0 behind). Thus all files were read from `feat/bun-migration` with `git show`.

- **Server:** `dembrane/platform/packages/verify/` (`routes.ts`, `service.ts`, `storage.ts`, `defaults.ts`). Error codes: `packages/core/src/catalog/verify.ts`. Prompts: `packages/prompts/templates/{generate,revise}_artifact.en.jinja`.
  - Do not use `dembrane/server/`. That branch does not include it. The local copy is untracked Python, and it is deprecated.
  - Comments in the Bun port tell which Python behaviour it keeps and which it fixes.
- **Portal:** `dembrane/frontend/src/components/participant/verify/`. Entry points: `ParticipantConversationAudio.tsx`, `ParticipantConversationAudioContent.tsx`, `refine/RefineSelection.tsx`, `refine/hooks/useRefineSelectionCooldown.ts` and `StopRecordingConfirmationModal.tsx`. Routes: `Router.tsx`.
- **Host:** settings in `components/project/ProjectPortalEditor.tsx` and `CustomTopicModal.tsx`. The approved outcomes of a conversation in `components/conversation/VerifiedArtefactsSection.tsx`.

**Terms.** The code uses "artifact" and "artefact". This plan uses **outcome** for the document, because the portal shows that word to participants. A **topic** is the type of outcome.

## The original

### Participant view

1. **Entry.** The **ECHO** button becomes active after 60 seconds of recording. It shows two choices, **Verify** and **Explore**. Each has a 2-minute cooldown in `localStorage`.
   - Verify opens `/:projectId/conversation/:id/verify`. This route is inside the recording page.
   - The recording page stays mounted, with its controls hidden. Thus **the recording continues during Verify**. Revise needs this.
2. **Topic.** "What do you want to verify?" shows the topics that the host selected. Each topic is a chip with an emoji and a label in the participant's language. **Next** starts the outcome. If there is only one topic, the picker does not show, and that topic starts immediately.
3. **Instructions.** Generation is slow and not streamed. During generation, five steps show: you get the outcome; read it aloud and say what to change; push Revise; push Approve if you feel heard; your approval helps.
   - **Next** becomes active when the outcome is ready. It opens `/verify/approve?artifact_id=…`.
   - The 2-minute Verify cooldown starts when generation is successful.
4. **Outcome.** It shows as Markdown, with these actions:
   - **Revise** sends what the group said after the outcome was made. The model writes the outcome again. Then the button is disabled for 30 seconds. If there is no new speech, it shows "No new feedback detected yet" and starts the same 30-second wait.
   - **Edit** (pencil) opens a WYSIWYG Markdown editor. The edit stays in the browser until Approve. Revise discards the edit.
   - **Approve** saves the content and `approved_at`. Then it goes back to the recording page and shows a toast.
   - **Read aloud** shows only if the outcome has a `read_aloud_stream_url`. The Bun server always sets it to `""`. Thus the button never shows.
5. **Approved list.** The recording page shows approved outcomes as right-aligned cards, with the topic emoji, label and time. A tap opens the outcome in a modal.
6. **"Verify on finish".** If the host sets this option:
   - After 60 seconds with no approved outcome, a dashed "Verification required" banner shows. It links to Verify.
   - If a participant pushes Stop with no approved outcome, a dialog shows "You haven't verified any outcomes yet", with **Skip** and **Verify**. Verify starts the recording again and opens the picker.

### Host view

- **Portal settings:** Verify on or off, "verify on finish" on or off, and the topics that participants see. The selection is `selected_verification_key_list`, a comma-separated string. If it is empty, all topics show.
- **Custom topics:** add, edit and delete. Each topic has a label, a prompt (10,000 characters maximum), an emoji and a label for each language.
  - The key is a slug of the label plus 8 random characters.
  - A new topic goes into the selection. A deleted topic goes out of it.
- **Default topics** are in each database: `agreements` ("What we actually agreed on"), `gems` ("Hidden gems"), `truths` ("Painful truths"), `moments` ("Breakthrough moments"), `actions` ("What we think should happen") and `disagreements` ("Moments we agreed to disagree"). Each has a prompt of approximately 80 words and labels in 8 languages, in `verify/src/defaults.ts`.
- **Conversation page:** approved outcomes in an accordion, with "copy as rich text".
- **Host AI assistant:** it can suggest a custom topic (`CustomVerificationTopicSuggestionCard`).

### Server

A Hono app has eight routes under `/api/verify`:

| Route | Function |
|---|---|
| `GET /topics/:project_id` | Global topics, then project topics; the selected keys |
| `POST/PATCH/DELETE /topics/:project_id/custom[/:key]` | Custom topics. The host must have `project:update` |
| `GET /artifacts/:conversation_id` | Approved outcomes of the conversation, newest approval first |
| `GET /artifact/:id` | One outcome |
| `POST /generate` | `{topic_list, conversation_id}`. Makes one outcome from `topic_list[0]` |
| `PUT /artifact/:id` | `{useConversation: {conversationId, timestamp}}` revises. `{content, approvedAt}` edits or approves |

**Generate.** The server makes sure that the conversation exists, that its project has Verify on, and that it has one or more chunks.

- **User message:** project name, conversation ID, participant name and email (redacted if the project anonymizes), **all earlier outcomes of the conversation** (approved or not), the full transcript, and the audio of untranscribed chunks since the last outcome, as files.
- **System prompt:** `generate_artifact`, with the topic prompt, the project language and the PII flag.
- **Model:** one `generateText` call to `multi_modal_pro`, with a 2048-token thinking budget. The server saves the result as unapproved.

**Revise.** The feedback is the transcript chunks after a given timestamp, plus untranscribed audio. If there is no feedback, the error is `verify.no_new_feedback`. The system prompt is `revise_artifact`, with the full transcript, the current outcome and the feedback.

The portal always sends the `date_created` of the outcome as the timestamp. A revision does not change `date_created`. Thus **each revision gets all feedback since the first version**, also feedback that earlier revisions used.

**Access.** The outcome routes need no login. If a request sends a participant token header, the token must name the conversation. The Bun port adds checks that the Python API did not have:

- The conversation and project are not deleted.
- Verify is on.
- A revision cannot use the transcript of a different conversation.

**Data:**

- `verification_topic`: key, prompt, icon, sort, project_id (null for a global topic).
- `verification_topic_translations`: key, language, label.
- `conversation_artifact`: id, conversation_id, key, topic_label, content, approved_at, date_created, read_aloud_stream_url.
- `project`: `is_verify_enabled`, `is_verify_on_finish_enabled`, `selected_verification_key_list`.

### Other uses of approved outcomes

- **Conversation summaries:** the summary prompt gets the 3 newest (`reports/src/summarize.ts`). The named modes of Explore use these summaries. Thus outcomes also get into Explore replies.
- **Host chat:** the deep-dive prompt includes them. A filter shows "verified only" conversations (`chats/src/conversations.ts`).
- **Conversation clone:** it can copy them (`attach_verified_artifacts`).
- **Host conversation list:** it returns them with each conversation.

## The prototype

The prototype is a copy of `portal-explore`. Explore is removed (see [Decisions](#decisions)), and Verify is added. These parts do not change: the recording, live transcription, replay, the two agents and the settings page.

### Participant view

All of Verify is on the session page, `/:projectId/sessions/:sessionId`. Thus the recorder stays mounted, and the recording continues, as in the original. The page does not navigate. It changes the view in its lower half.

1. **Verify** replaces Explore. It has the same type of meter. When it is disabled, it shows the reason (see [Rules](#rules)).
2. **Topic chips** show the selected topics of the project. If there is only one topic, it starts immediately.
3. **Instructions** (the five steps of the original) show during generation. The outcome streams into the agent state. Thus a reload or a second tab continues from the same point. **Next** becomes active when the outcome is complete.
4. **Outcome** shows as Markdown, with **Revise**, **Edit**, **Approve** and **Back**.
   - **Back** keeps the outcome pending.
   - **Revise** shows the "No new feedback" message and the 30-second wait of the original.
   - **Edit** is a plain text area. **Save** sends the text to the agent.
5. **Approved outcomes** show below the transcript, with the topic emoji, label and time. A tap expands an outcome in place.
6. **Pending outcome** (made, but not approved): it shows again after a reload. A new outcome replaces it. The old row stays in the table, unapproved, as in the original.

### Flow

The phone records all the time. All speech goes into `segments`, in each view.

```text
 PHONE (session page)              SessionAgent "a1"               ProjectAgent      Gemini
 ═══════════════ mic → Gemini Live → segments s1 s2 s3 … (never stops) ═══════════════

 [Verify] ──── verify("agreements") ──▶ rules ok? ── topic(key) ──────▶ prompt
                                                ◀──────────────────────
 ┌ instructions ┐                       generate_artifact:
 │ 1 you'll get │                       transcript + earlier ─────────────────────▶ ┐
 │ 2 read aloud │  ◀── state sync ───── outcomes                                   │
 │ 3 revise     │      (text streams    verifyDraft ◀─────────────────────────────── ┘
 │ 4 approve    │       in)             saved as outcome v1, pending
 └ [Next] ──────┘
        │
        ▼
 ┌ outcome v1 ──────────────┐
 │ group reads it aloud,    │ ── voice ──▶ s5 s6 …  (only more segments)
 │ says what is wrong       │
 │                          │
 │ [Revise] ─── revise() ───┼────────────▶ feedback = segments since v1 was
 │                          │              made or last revised
 │                          │              revise_artifact:
 │                          │              transcript + v1 + feedback ───────────────▶ ┐
 │                          │ ◀ state sync  v2 ◀──────────────────────────────────────── ┘
 │ [Edit] ─ text ───────────┼────────────▶ editOutcome(): saved in the agent
 │                          │
 │ [Approve] ── approve() ──┼────────────▶ approved_at = now
 └──────────────────────────┘                    │
        │                                        │
        ▼                                        ▼
 approved outcomes listed            Settings page ── approvedOutcomes() over RPC
 below the transcript                (the host sees them)
```

### Host view

`/:projectId/settings`, as in `portal-explore`. These items replace the Explore section:

- **Verify:** on or off.
- **Topics:** the six defaults and the custom topics of the project. A checkbox for each topic sets if participants see it. If no checkbox is set, participants see all topics, as in the original.
- **Add a topic:** label, emoji and prompt. Each custom topic has **Remove**.
- **Sessions:** the list that `portal-explore` shows now. Below each session are its approved outcomes. The page gets them from the sessions over RPC, as it gets the context preview now.

### Agents and data

There are two agents, as in `portal-explore`:

```text
SessionAgent "a1"                          ProjectAgent "demo"
  SQLite: live_segments, outcomes            SQLite: sessions
  state: recording, verifyStatus,            state: verifyEnabled, selectedTopics,
         verifyDraft, pendingOutcomeId,             customTopics
         lastVerifyAt, lastReviseAt
                    ── RPC: topic(key) ──▶
                    ◀── RPC: approvedOutcomes() ──
```

**`SessionAgent`** gets an `outcomes` table: `id INTEGER PRIMARY KEY, topic_key, topic_label, topic_icon, content, created_at, revised_at, approved_at`. Each row keeps a copy of the topic label and emoji. Thus an outcome shows correctly after its topic is removed.

| Callable | Function |
|---|---|
| `verify(topicKey)` | Checks the rules and gets the topic from the project. Streams the outcome into `verifyDraft` inside `keepAliveWhile()`. Saves it as the pending outcome |
| `revise()` | Checks the rules. Uses the segments since the pending outcome was made or last revised as feedback. Streams the new text in the same way |
| `editOutcome(content)` | Replaces the text of the pending outcome |
| `approve()` | Sets `approved_at`, clears the pending outcome and broadcasts it |
| `leaveOutcome()` | Clears `pendingOutcomeId`. The row stays |
| `listOutcomes()` | Approved outcomes, newest first, and the pending outcome |
| `approvedOutcomes()` | Over RPC, for the settings page |

`verifyStatus` is `idle | generating | revising | slow | failed`, as `replyStatus` is in Explore. If a restart stops an outcome, `onStart` sets it to `failed`. The "still working" message after 20 seconds stays.

**`ProjectAgent`** keeps the topic settings in its state and syncs them to the settings page.

- The six defaults are a constant in `src/shared/topics.ts`. They are in English, with emoji icons from `TOPIC_ICON_MAP` in the portal.
- Callables: `updateSettings`, `addTopic` and `removeTopic`. Each has checks, as `checkSettingsChange` does for Explore now.
- The key of a custom topic is a slug of its label plus 8 random characters, as in the original.
- `topic(key)` answers over RPC. It refuses a topic that is not selected.

### Rules

The rules are in `src/shared/rules.ts`. The agent checks them, and the page shows them, as for Explore.

| Rule | Source |
|---|---|
| Verify is on for the project | Server: `verify.not_enabled` |
| 60 seconds or more recorded, and some text transcribed | ECHO button; server: `verify.no_chunks` |
| Only one outcome in generation or revision at a time | New. The original does not prevent two at once |
| 2 minutes between new outcomes, from the end of the last one | Portal: `localStorage` cooldown |
| 30 seconds between revisions | Portal: `useCooldown(30_000)` |
| New speech since the outcome was made or last revised, before a revision | Server: `verify.no_new_feedback` |

### Prompts

- `generate_artifact.en.jinja` and `revise_artifact.en.jinja` go into `src/server/prompts/` with no changes.
- LiquidJS renders them, with `language: "English"` and `pii_redaction: false`.
- The generate user message has the shape of the original: project name, earlier outcomes, transcript.
- Now, `streamReply` in `explore/gemini.ts` sends the prompt as one user message. It gets an optional system prompt, sent as `systemInstruction`.
- The model stays `gemini-3.5-flash` with no thinking budget, as in `portal-explore`.

### Borrowed parts

| From | Parts |
|---|---|
| `portal-explore` | Almost all: the Hono Worker, both agents, `withVoiceInput` and `useVoiceRecorder`, replay with `?debug=true`, the settings page layout, rules shared by page and agent, state-synced streaming with `keepAliveWhile()`, the SSE parser, LiquidJS templates, `constants.ts` with sources, the README layout |
| `portal-explore`'s `packages/voice-gemini` | Copied with no changes, as `portal-explore` copied it from `polis-statement-extraction` |
| `polis-statement-extraction` | Through `portal-explore`: the split of session and project. Its review page (approve or edit) is the nearest existing UI to the outcome view |
| Not borrowed | The login examples (`dembrane-auth*`), because `portal-explore` has no login |

New dependency: a Markdown renderer for the page, for example `react-markdown`. Not yet examined: if kumo has one.

## Differences from the original

| | Original | Prototype |
|---|---|---|
| Location of Verify | Its own routes, inside the recording page | A view inside the session page |
| Entry | ECHO shows Verify or Explore | A Verify button |
| Rules | Cooldowns in `localStorage`; the server checks chunks and Verify on | The agent checks all; the page shows them |
| Generation | One blocking call; the page waits | Streams into the agent state; a reload does not stop it |
| Pending outcome | A reload loses it, if the URL does not have its ID | Kept in the agent state |
| Revise feedback | All since the first version, each time | Since the last version |
| Edits | In the browser until Approve; Revise discards them | Saved in the agent; Revise starts from them |
| Edit box | WYSIWYG Markdown editor | Plain text area |
| Untranscribed audio | Sent to the model as audio files | Not sent: live transcription gets all speech |
| Model | `multi_modal_pro`, 2048-token thinking budget | `gemini-3.5-flash` |
| Languages | Topic labels in 8 languages; outcome in the project language | English |
| Removal of personal data | If the project anonymizes | Never |
| Participant name and email in the prompt | Yes | No; sessions do not have them |
| Topic storage | Two tables, and a comma-separated selection on the project | Project agent state |
| Topic changes | Add, edit, delete, with translations | Add and remove |
| Access | Participant token on outcome routes; `project:update` for topics | None, as in `portal-explore` |

## Not in the prototype

Items marked **later** are good to add after the prototype works.

| Not included | Reason |
|---|---|
| **Explore** | The example is only about Verify. See [Decisions](#decisions) |
| **"Verify on finish"** (the banner and the Stop dialog) | It is a reminder, not the feature. Also, Stop does not end the session here. **Later**, small |
| **Read aloud** | Not active in the Bun server: `read_aloud_stream_url` is always `""` |
| **Other languages** for labels and outcomes | `portal-explore` is only in English. **Later**, from the 8-language labels in `defaults.ts` |
| **Removal of personal data** | As in `portal-explore`. **Later**, with the template block |
| **Untranscribed audio** as files | Live transcription gets all speech, and audio is not stored |
| **Edit of a custom topic** and its translations | Remove and add again gives the same result for a prototype |
| **Topic sort order** | Defaults in fixed order, then custom topics oldest first. The original shows them in this order anyway |
| **Topic suggestions from the host AI** | They are part of the host assistant, which is not in this example |
| **Summaries, chat, "verified only" filter, clone** | The examples do not have these yet. The nearest fit: approved outcomes into the Explore context, if Explore comes back |
| **Copy as rich text** for the host | Small. **Later** |
| **Participant token and host permissions** | This series has no login yet. **Later**, from `dembrane-auth-cookie-ownership` |
| **Pro model with a thinking budget** | As in `portal-explore`. **Later** |
| **Error catalog codes** (`verify.*`) | Errors are plain messages, as in `portal-explore` |

## Steps

There are 14 tasks in 4 phases. [`tasks/todo.md`](tasks/todo.md) has the acceptance criteria and checks for each task. Tick its boxes during the work.

1. **Recording only** (Tasks 1–3): copy `portal-explore`. Then remove Explore in two steps. After each step, tests and typecheck pass.
2. **One outcome, end to end** (Tasks 4–7): the prompts, a system prompt for Gemini, the default topics and rules, and then generation with a bare page. Generation has the highest risk (a new prompt shape on Vertex). Thus it comes before the polish. The default topics are hard-coded until Phase 4.
3. **Participant loop** (Tasks 8–11): instructions and topic picker, Revise, Edit, Approve and the approved list.
4. **Host and docs** (Tasks 12–14): topic settings, approved outcomes on the settings page, the README.

Each phase ends with a checkpoint: tests, typecheck and lint pass, the phase works in a browser, and the user does a review.

### Dependencies

```text
 1 Copy portal-explore
 └─ 2 Remove Explore from the session
    └─ 3 Remove Explore from the project
       ├─ 4 Verify prompts (templates, render, tests) ─┐
       ├─ 5 System prompt in streamReply ──────────────┤
       └─ 6 Default topics and whyNotVerify ───────────┤
                                                       └─ 7 Generate an outcome (agent + bare UI)
                                                          ├─ 8 Instructions, topic picker, pending outcome
                                                          │  ├─ 9  Revise
                                                          │  ├─ 10 Edit
                                                          │  └─ 11 Approve, and the approved list
                                                          │      └─ 13 Approved outcomes for the host
                                                          └─ 12 The host's topic settings
                                                                      └─ 14 README and PLAN
```

Tasks 4, 5 and 6 are independent. Tasks 9, 10 and 11 are also independent, but all three change `session-agent.ts` and `Session.tsx`. Thus do them in sequence.

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Vertex can use `systemInstruction` differently from `system` in the AI SDK of the original | Med | Task 5 adds it. Task 7 examines a real outcome before other tasks use it |
| Each Vertex call costs money. Outcomes are longer than Explore replies | Low | Replay clips of a few seconds. Ask before a longer or repeated run |
| Speech during generation counts as feedback. The original has the same behaviour: it saves `date_created` after generation | Low | Keep the timing of the original: set `created_at` and `revised_at` when the text is saved. Tell this in the README |
| An utterance can start before the outcome and end after it. It then counts as feedback | Low | Accept it. Gemini Live stamps a segment when it is final. Tell this in the README |
| A Markdown renderer is a new page dependency | Low | Task 8 selects one, for example `react-markdown`, and makes sure the bundle builds |
| The removal of Explore changes many files | Med | Tasks 2 and 3 divide it. Tests and typecheck pass after each |
| A long outcome streams as many state updates | Low | Explore does this already. Monitor it in Task 7. Add a throttle only if it is slow |

## Decisions

Agreed on 3 October 2026.

1. **Verify only, no Explore.** This keeps the example small, with one subject. With Explore, the example would need all of the ECHO button and its choice screen.
2. **Revise sends only the speech since the last version** (made or revised). The original sends all speech since the first version, each time. Thus it sends feedback again that an earlier revision used. Both also send the full transcript and the current outcome.

   ```text
   time ───────────────────────────────────────────────────────────────▶
   segments:  s1 s2 s3 s4 │ s5 s6 │ s7 s8 │
                          ▲       ▲       ▲
                      v1 made  Revise#1  Revise#2

   Original ("since it was made"):
     Revise#1 feedback = s5 s6
     Revise#2 feedback = s5 s6 s7 s8   ← s5 s6 a second time, already in v2

   Here ("since it was made or last revised"):
     Revise#1 feedback = s5 s6
     Revise#2 feedback = s7 s8
   ```

3. **The agent saves edits immediately.** Thus Revise starts from the edit, all tabs show it, and a reload keeps it. The original keeps an edit in the browser until Approve.

   ```text
   Original:
     v2 ──[Edit]──▶ v2' (only in this phone's browser)
                      ├─[Approve]──▶ v2' is saved and approved   ✓
                      ├─[Revise] ──▶ the server revises v2;
                      │              v2' is discarded            ✗
                      └─ reload ───▶ v2' is lost                 ✗

   Here:
     v2 ──[Edit]──▶ v2' saved in the agent (all open tabs show it)
                      ├─[Approve]──▶ v2' is approved
                      ├─[Revise] ──▶ v2' is revised, with the new feedback
                      └─ reload ───▶ v2' stays
   ```

4. **`gemini-3.5-flash`, with no thinking budget,** for generation and revision, as in `portal-explore`. The original uses its pro model with a 2048-token thinking budget. A change is one constant in `models.ts`. It is for later.
