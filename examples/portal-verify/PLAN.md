# Plan: portal-verify

A port of the dembrane portal's **Verify** feature to Cloudflare. A phone records a group conversation and Gemini Live transcribes it. When someone presses **Verify**, the group picks a topic, such as "What we actually agreed on", and Gemini writes an **outcome**: a short document drawn from the conversation. The group reads it aloud and says what's wrong, while the phone keeps recording. **Revise** rewrites it from what they said. When the group is happy, **Approve** keeps it, and the host sees it.

This is a plan. No code exists yet; [`tasks/`](tasks/) breaks it into tasks. It starts from [`portal-explore`](../portal-explore), copied in whole, per the rule that each example stands alone.

**Contents**

- [Sources](#sources)
- [The original](#the-original)
  - [What the participant sees](#what-the-participant-sees)
  - [What the host sees](#what-the-host-sees)
  - [The server](#the-server)
  - [What uses approved outcomes](#what-uses-approved-outcomes)
- [The prototype](#the-prototype)
  - [What the participant sees](#what-the-participant-sees-1)
  - [The flow](#the-flow)
  - [What the host sees](#what-the-host-sees-1)
  - [Agents and data](#agents-and-data)
  - [Rules](#rules)
  - [Prompts](#prompts)
  - [What's borrowed](#whats-borrowed)
- [How it differs from the original](#how-it-differs-from-the-original)
- [What doesn't make the cut](#what-doesnt-make-the-cut)
- [Steps](#steps)
- [Decisions](#decisions)

## Sources

From `~/repos/dembrane-echo`, branch `feat/bun-migration` at `852bbac7`. The local checkout is on `feat/bun-migration-patcon`, 22 commits ahead and none behind, so everything below was read from `feat/bun-migration` with `git show`.

- **Server:** `dembrane/platform/packages/verify/` (`routes.ts`, `service.ts`, `storage.ts`, `defaults.ts`), with error codes in `packages/core/src/catalog/verify.ts` and prompts in `packages/prompts/templates/{generate,revise}_artifact.en.jinja`. `dembrane/server/` isn't in that branch's tree: the copy in the working directory is untracked Python, which is deprecated. The Bun port's comments say which Python behaviour it keeps and which it fixes.
- **Portal:** `dembrane/frontend/src/components/participant/verify/`, plus how you get there: `ParticipantConversationAudio.tsx`, `ParticipantConversationAudioContent.tsx`, `refine/RefineSelection.tsx`, `refine/hooks/useRefineSelectionCooldown.ts` and `StopRecordingConfirmationModal.tsx`. Routes are in `Router.tsx`.
- **Host:** `components/project/ProjectPortalEditor.tsx` and `CustomTopicModal.tsx` (settings), and `components/conversation/VerifiedArtefactsSection.tsx` (a conversation's approved outcomes).

The code says both "artifact" and "artefact". Below, **outcome** means the document, which is the word the portal shows participants, and **topic** means what kind of outcome it is.

## The original

### What the participant sees

1. **Getting there.** After 60 seconds of recording, the **ECHO** button turns on. It opens a choice between **Verify** and **Explore**, each with a 2-minute cooldown kept in `localStorage`. Verify goes to `/:projectId/conversation/:id/verify`. That route is nested inside the recording page, which stays mounted with its controls hidden, so **the recording keeps going all through Verify**. Revise depends on that.
2. **Picking a topic.** "What do you want to verify?" lists the topics the host chose, as chips with an emoji and a label in the participant's language. **Next** starts the outcome. With only one topic, the picker is skipped and that topic starts at once.
3. **Instructions while it's written.** While the outcome is generated, which isn't streamed and takes a while, five numbered steps say what comes next: you'll get the outcome; read it aloud and say what you'd change; press Revise; press Approve if you feel heard; your approval helps. **Next** turns on once the outcome is ready, and goes to `/verify/approve?artifact_id=…`. The 2-minute Verify cooldown starts when generation succeeds.
4. **The outcome.** It's rendered as Markdown, with three actions:
   - **Revise** sends what the group has said since the outcome was made. The model rewrites the outcome, and the button waits 30 seconds before it can be pressed again. If nobody has said anything new, it shows "No new feedback detected yet" and starts the same wait.
   - **Edit** (pencil) opens a WYSIWYG Markdown editor. The edit stays in the browser until Approve, and a Revise throws it away.
   - **Approve** saves the content and `approved_at`, goes back to the recording page and shows a toast.
   - A **read aloud** button appears when the outcome has a `read_aloud_stream_url`. The Bun server always sets it to `""`, so the button never shows.
5. **Back on the recording page**, approved outcomes are listed as right-aligned cards with the topic's emoji, label and time. Tapping one opens it in a modal.
6. **Prompts to verify.** When the host turns on "verify on finish":
   - after 60 seconds with nothing approved, a dashed "Verification required" banner links to Verify;
   - pressing Stop with nothing approved asks "You haven't verified any outcomes yet", with **Skip** or **Verify**. Verify resumes recording and opens the picker.

### What the host sees

- **Portal settings:** turn Verify on, turn "verify on finish" on, and choose which topics participants see. The choice is stored as `selected_verification_key_list`, a comma-separated string. Left empty, every topic is offered.
- **Custom topics:** add, edit or delete one, with a label, a prompt (up to 10,000 characters), an emoji and a label in each language. Its key is a slug of the label plus 8 random characters. A new topic is added to the selection, and a deleted one is removed from it.
- **The default topics**, seeded into every database: `agreements` ("What we actually agreed on"), `gems` ("Hidden gems"), `truths` ("Painful truths"), `moments` ("Breakthrough moments"), `actions` ("What we think should happen") and `disagreements` ("Moments we agreed to disagree"). Each has a prompt of about 80 words and a label in 8 languages, in `verify/src/defaults.ts`.
- **A conversation's page** shows its approved outcomes in an accordion, with copy as rich text.
- The host's AI assistant can suggest a custom topic (`CustomVerificationTopicSuggestionCard`).

### The server

Eight routes under `/api/verify`, in a Hono app:

| Route | What it does |
|---|---|
| `GET /topics/:project_id` | The global topics, then the project's own; the selected keys |
| `POST/PATCH/DELETE /topics/:project_id/custom[/:key]` | Custom topics. Needs a host with `project:update` |
| `GET /artifacts/:conversation_id` | The conversation's approved outcomes, newest approval first |
| `GET /artifact/:id` | One outcome |
| `POST /generate` | `{topic_list, conversation_id}`: makes one outcome, from `topic_list[0]` |
| `PUT /artifact/:id` | Either `{useConversation: {conversationId, timestamp}}` to revise, or `{content, approvedAt}` to edit or approve |

**Generating** checks the conversation exists, its project has Verify on, and it has at least one chunk. The user message holds the project name, conversation ID, participant name and email (redacted when anonymized), **every earlier outcome of this conversation** whether approved or not, the whole transcript, and the audio of any untranscribed chunks since the last outcome, as files. The system prompt is `generate_artifact` with the topic's prompt, the project's language and the PII flag. One `generateText` call to `multi_modal_pro` with a 2048-token thinking budget returns the outcome, which is saved unapproved.

**Revising** takes the transcript chunks after the given timestamp as the feedback, plus untranscribed audio. With neither, it fails with `verify.no_new_feedback`. The system prompt is `revise_artifact`, holding the whole transcript, the current outcome and the feedback. The portal always sends the outcome's `date_created` as the timestamp, and a revision doesn't change `date_created`, so **each revision gets all the feedback since the outcome was first made**, including feedback earlier revisions already used.

**Access:** the outcome routes need no login. A participant token header, when sent, must name the conversation. The Bun port added checks the Python API lacked: the conversation and project aren't deleted, Verify is on, and a revision can't pull in another conversation's transcript.

**Data:** `verification_topic` (key, prompt, icon, sort, project_id; null for a global topic), `verification_topic_translations` (key, language, label), `conversation_artifact` (id, conversation_id, key, topic_label, content, approved_at, date_created, read_aloud_stream_url), and on `project`: `is_verify_enabled`, `is_verify_on_finish_enabled` and `selected_verification_key_list`.

### What uses approved outcomes

Outside Verify itself, approved outcomes feed:

- **Conversation summaries:** the newest 3 go into the summary prompt (`reports/src/summarize.ts`). Explore's named modes use those summaries, so outcomes reach Explore's replies that way.
- **The host's chat:** the deep-dive prompt includes them, and conversations can be filtered to "verified only" (`chats/src/conversations.ts`).
- **Cloning a conversation** can copy them (`attach_verified_artifacts`).
- **The host's conversation list** returns them with each conversation.

## The prototype

Copied from `portal-explore`, with Explore taken out (see [Decisions](#decisions)) and Verify put in. The recording, live transcription, replay, the two agents and the settings page stay as they are.

### What the participant sees

Everything is on the session page, `/:projectId/sessions/:sessionId`, so the recorder stays mounted and recording carries on through Verify, as in the original. The page swaps its lower half between views. It doesn't navigate.

1. **Verify** sits where Explore was, with the same kind of meter and reason text when it can't be pressed (see [Rules](#rules)).
2. **Topic chips** list the project's selected topics. With only one, it starts at once.
3. **Instructions** show while the outcome is written: the original's five steps. The outcome streams into the agent's state, so a reload, or a second tab, picks up where it was. **Next** turns on once it's done.
4. **The outcome**, rendered as Markdown, with **Revise**, **Edit** and **Approve**, and **Back** to leave it pending. Revise shows the original's "No new feedback" message and 30-second wait. Edit is a plain text area, saved to the agent on **Save**.
5. **Approved outcomes** are listed under the transcript with the topic's emoji, label and time. Tapping one expands it in place.
6. A pending outcome, made but not yet approved, comes back when the page reloads. Starting a new one replaces it, and the old one stays in the table, unapproved, as in the original.

### The flow

The phone records the whole time, and everything said goes into `segments`, whatever view the page is on.

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
 │ group reads it aloud,    │ ── voice ──▶ s5 s6 …  (just more segments)
 │ says what's wrong        │
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
 under the transcript                (the host sees them)
```

### What the host sees

`/:projectId/settings`, as in `portal-explore`, with its Explore section replaced by:

- **Verify on or off.**
- **Topics:** the six defaults and the project's own, each with a checkbox for whether participants see it. None ticked means all, as in the original.
- **Add a topic:** label, emoji and prompt. **Remove** on each custom topic.
- **Sessions:** the list `portal-explore` already shows, each with its approved outcomes beneath, fetched from the sessions over RPC as the context preview is now.

### Agents and data

Two agents, as in `portal-explore`:

```text
SessionAgent "a1"                          ProjectAgent "demo"
  SQLite: live_segments, outcomes            SQLite: sessions
  state: recording, verifyStatus,            state: verifyEnabled, selectedTopics,
         verifyDraft, pendingOutcomeId,             customTopics
         lastVerifyAt, lastReviseAt
                    ── RPC: topic(key) ──▶
                    ◀── RPC: approvedOutcomes() ──
```

**`SessionAgent`** gains an `outcomes` table: `id INTEGER PRIMARY KEY, topic_key, topic_label, topic_icon, content, created_at, revised_at, approved_at`. The topic's label and emoji are copied in, so an outcome still shows right after its topic is removed. Callables:

| Callable | What it does |
|---|---|
| `verify(topicKey)` | Checks the rules, asks the project for the topic, then streams the outcome into `verifyDraft` inside `keepAliveWhile()`, and saves it as the pending outcome |
| `revise()` | Checks the rules, takes the segments since the pending outcome was made or last revised as feedback, and streams the rewrite the same way |
| `editOutcome(content)` | Replaces the pending outcome's text |
| `approve()` | Sets `approved_at`, clears the pending outcome, and broadcasts it |
| `leaveOutcome()` | Clears `pendingOutcomeId`. The row stays |
| `listOutcomes()` | Approved outcomes, newest first, and the pending one |
| `approvedOutcomes()` | Over RPC, for the settings page |

`verifyStatus` is `idle | generating | revising | slow | failed`, like Explore's `replyStatus`. `onStart` marks one cut off by a restart as failed. The "still working" message after 20 seconds carries over.

**`ProjectAgent`** keeps the topic settings in its state, synced to the settings page. The six defaults are a constant in `src/shared/topics.ts`, in English, with their icons as emoji, as the portal's `TOPIC_ICON_MAP` shows them. Callables: `updateSettings`, `addTopic` and `removeTopic`, each checked as `checkSettingsChange` checks Explore's now. A custom topic's key is a slug of its label plus 8 random characters, as in the original. `topic(key)` answers over RPC, and refuses a topic that isn't selected.

### Rules

In `src/shared/rules.ts`, checked by the agent and shown by the page, as Explore's are:

| Rule | From |
|---|---|
| Verify is on for the project | The server's `verify.not_enabled` |
| At least 60 seconds recorded, and something transcribed | The ECHO button, and the server's `verify.no_chunks` |
| One outcome generating or revising at a time | New. The original has nothing stopping two at once |
| 2 minutes between new outcomes, from when the last one finished | The portal's `localStorage` cooldown |
| 30 seconds between revisions | The portal's `useCooldown(30_000)` |
| Something said since the outcome was made or last revised, before a revision | The server's `verify.no_new_feedback` |

### Prompts

`generate_artifact.en.jinja` and `revise_artifact.en.jinja` copied unchanged into `src/server/prompts/` and rendered with LiquidJS, with `language: "English"` and `pii_redaction: false`. The generate user message keeps the original's shape: project name, earlier outcomes, transcript. `streamReply` in `explore/gemini.ts` takes the prompt as one user message today. It gains an optional system prompt, sent as `systemInstruction`. It stays on `gemini-3.5-flash` with no thinking budget, as in `portal-explore`.

### What's borrowed

| From | What |
|---|---|
| `portal-explore` | Nearly everything: the Hono Worker, both agents, `withVoiceInput` and `useVoiceRecorder`, replay with `?debug=true`, the settings page's shape, the rules shared between page and agent, state-synced streaming with `keepAliveWhile()`, the SSE parser, LiquidJS for the templates, `constants.ts` with sources, the README layout |
| `portal-explore`'s `packages/voice-gemini` | Copied as it is, as `portal-explore` copied it from `polis-statement-extraction` |
| `polis-statement-extraction` | Through `portal-explore`: the session and project split. The host's approve-or-edit idiom on its review page is the nearest existing UI to the outcome view |
| Not borrowed | The login examples (`dembrane-auth*`), as `portal-explore` has no login |

New dependency: a Markdown renderer for the page, such as `react-markdown`. I haven't checked whether kumo has one.

## How it differs from the original

| | The original | Here |
|---|---|---|
| Where Verify lives | Its own routes, nested in the recording page | A view inside the session page |
| Getting there | ECHO opens a choice of Verify or Explore | A Verify button |
| Rules | Cooldowns in `localStorage`; the server checks chunks and Verify on | All checked by the agent, shown by the page |
| Generating | One blocking call; the page waits | Streamed into the agent's state; survives a reload |
| Pending outcome | Lost on reload unless the URL has its ID | Kept in the agent's state |
| Revise feedback | Everything since the outcome was first made, every time | Since it was made or last revised |
| Edits | In the browser until Approve; lost on Revise | Saved to the agent, so Revise starts from them |
| Edit box | WYSIWYG Markdown editor | Plain text area |
| Untranscribed audio | Sent to the model as audio files | Not sent: every utterance is transcribed live |
| Model | `multi_modal_pro`, 2048-token thinking budget | `gemini-3.5-flash` |
| Languages | Topic labels in 8 languages; outcome in the project's language | English |
| Removing personal details | When the project anonymizes | Never |
| Participant name and email in the prompt | Yes | No; sessions have neither |
| Topic storage | Two tables, plus a comma-separated selection on the project | The project agent's state |
| Topic editing | Add, edit, delete, with translations | Add and remove |
| Access | Participant token on outcome routes; `project:update` for topics | None, as in `portal-explore` |

## What doesn't make the cut

Each of these is left out of the prototype. The ones marked **later** are worth adding after it works.

| Left out | Why |
|---|---|
| **Explore** | Keeps the example about Verify. See [Decisions](#decisions) |
| **"Verify on finish"**: the banner and the prompt on Stop | A nudge, not the feature. Stopping here doesn't end the session either. **Later**, and small |
| **Read aloud** | Dead in the Bun server: `read_aloud_stream_url` is always `""` |
| **Other languages** for labels and outcomes | `portal-explore` is English only too. **Later**, from the 8-language labels in `defaults.ts` |
| **Removing personal details** | As in `portal-explore`. **Later**, with the template's block |
| **Untranscribed audio** sent as files | Nothing goes untranscribed here, and audio isn't stored |
| **Editing a custom topic** and its translations | Remove and add again does the same for a prototype |
| **Topic sort order** | Defaults in their fixed order, then custom ones oldest first, as the original lists them anyway |
| **The host's AI suggesting topics** | Part of the host's assistant, which doesn't exist here |
| **Summaries, chat, "verified only" filter, cloning** | None of these exist in the examples yet. Feeding approved outcomes into Explore's context is the nearest fit, if Explore comes back |
| **Copy as rich text** on the host's view | Small. **Later** |
| **Participant token and host permissions** | No login in this series yet. **Later**, from `dembrane-auth-cookie-ownership` |
| **A pro model with a thinking budget** | Same as `portal-explore`. **Later** |
| **Error catalog codes** (`verify.*`) | Errors are plain messages, as in `portal-explore` |

## Steps

The work is broken into 14 tasks in four phases, with a checkpoint after each phase: [`tasks/plan.md`](tasks/plan.md) has the order, the dependencies and the risks, and [`tasks/todo.md`](tasks/todo.md) has each task's acceptance criteria and checks.

## Decisions

Settled on 3 October 2026.

1. **Verify alone, without Explore.** It keeps the example small and about one thing. Keeping Explore would have made this the whole ECHO button, with its choice screen.
2. **Revise sends what's been said since the outcome was made or last revised.** The original sends everything since it was made, every time, so feedback an earlier revision already used goes in again. Both send the whole transcript and the current outcome too.

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

3. **Edits are saved to the agent at once.** Revise then starts from the edit, every tab sees it, and a reload keeps it. The original keeps an edit in the browser until Approve.

   ```text
   Original:
     v2 ──[Edit]──▶ v2' (only in this phone's browser)
                      ├─[Approve]──▶ v2' is saved and approved   ✓
                      ├─[Revise] ──▶ the server revises v2;
                      │              v2' is thrown away          ✗
                      └─ reload ───▶ v2' is lost                 ✗

   Here:
     v2 ──[Edit]──▶ v2' saved in the agent (every open tab sees it)
                      ├─[Approve]──▶ v2' is approved
                      ├─[Revise] ──▶ v2' is revised, with the new feedback
                      └─ reload ───▶ v2' is still there
   ```

4. **`gemini-3.5-flash`, without a thinking budget,** for both generating and revising, to match `portal-explore`. The original uses its pro model with a 2048-token thinking budget. Swapping is one constant in `models.ts`, left for later.
