# portal-verify: an outcome of a group conversation, revised and approved by the group

A group sits around one phone, which records their conversation, and Gemini transcribes it live. When someone presses **Verify** and picks a topic, such as "What we actually agreed on", Gemini writes an **outcome**: a short document from the conversation. The group reads it aloud and says what's wrong, while the phone keeps recording. **Revise** writes it again from what they said, and **Approve** keeps it, for the host to see.

It's a port of the **Verify** half of the dembrane portal's ECHO button, from `dembrane-echo`. It's based on [`portal-explore`](../portal-explore), with its recording, live transcription, replay and two agents, and with Explore taken out. There's no login.

**Contents**

- [Run it](#run-it)
- [Pages](#pages)
- [How an outcome works](#how-an-outcome-works)
  - [Revise, Edit and Approve](#revise-edit-and-approve)
  - [Topics](#topics)
  - [The prompts](#the-prompts)
  - [Limits](#limits)
- [Replaying an audio file](#replaying-an-audio-file)
- [How it works](#how-it-works)
  - [Files](#files)

How the parts connect. Each name, such as session `a1` or project `demo`, gets its own Durable Object. Pages and Gemini stay connected to the session's object and stream as they go, and objects call each other directly. [How it works](#how-it-works) has more.

```text
BROWSER    ┌───────────────────────┐                ┌───────────────────────┐
           │ Recording phone       │                │ Settings page         │
           │ /demo/sessions/a1     │                │ /demo/settings        │
           └───────────╥───────────┘                └───────────╥───────────┘
                       ║ WebSocket: audio up;                   ║ WebSocket: topics,
                       ║ transcript, outcome down               ║ synced
WORKER     ┌───────────╨────────────────────────────────────────╨───────────┐
           │ Hono: /agents/:agent/:name goes to the object with that name   │
           └───────────╥────────────────────────────────────────╥───────────┘
                       ║ same WebSocket                         ║
DURABLE    ┌───────────╨───────────┐   RPC: topic()  ┌──────────╨───────────┐
OBJECTS    │ SessionAgent "a1"     │ ──────────────▶ │ ProjectAgent "demo"  │
           │ SQLite: segments,     │   outcome-      │ SQLite: sessions     │
           │   outcomes            │   Approved()    │ state: Verify on,    │
           │ state: the outcome    │                 │   topics             │
           │   being written, the  │ ◀────────────── └──────────────────────┘
           │   pending outcome     │   RPC: listOutcomes(), each session
           └─────╥───────────╥─────┘   in parallel, for the settings page
                 ║           ║
   WebSocket:    ║           ║ HTTPS: prompt up
   audio up,     ║           ║ SSE: the outcome
   transcript    ║           ║ streams down
   down          ║           ║
VERTEX AI  ┌─────╨─────┐ ┌───╨───────┐
           │Gemini Live│ │Gemini     │
           │transcribes│ │Flash      │
           └───────────┘ │writes the │
                         │outcome    │
                         └───────────┘

 ║  stays open, streams both ways     ─▶  RPC: one call, one answer
```

## Run it

```bash
pnpm install
cp .dev.vars.example .dev.vars   # set GOOGLE_CLOUD_PROJECT
pnpm google-token                # puts `gcloud auth print-access-token` in .dev.vars
pnpm dev
```

Then open <http://localhost:8796>, pick a project name such as `demo`, and start a session. To record from a phone, use `pnpm dev:share` instead: it also prints a public link.

Everything runs on Gemini on Vertex AI, so you need a Google Cloud project with Vertex AI enabled and `gcloud` logged in to it. The token lasts about an hour, so run `pnpm google-token` again when it expires, and restart `pnpm dev`. A failed outcome says why on the session page, such as an expired token, with **Try again**.

| Command | What it does |
|---|---|
| `pnpm test` | The prompts, transcript and feedback, stream parser, Gemini call, rules, views, settings and WAV helpers, then the Gemini provider's tests |
| `pnpm typecheck` | The Worker (`tsconfig.json`) and the page (`tsconfig.client.json`) |
| `pnpm lint`, `pnpm format` | Biome |

## Pages

| URL | Who | What |
|---|---|---|
| `/:projectId/start` | The recording phone | **Start a session** makes a new session with a random ID |
| `/:projectId/sessions/:sessionId` | The recording phone | Record and stop as often as you like, the live transcript, **Verify**, and the approved outcomes |
| `/:projectId/sessions/:sessionId?debug=true` | Whoever's testing | Replay an audio file instead of recording. See [Replaying an audio file](#replaying-an-audio-file) |
| `/:projectId/settings` | The host | Turn Verify on or off, pick the topics participants see, add the project's own, and see each session's approved outcomes |

A project is any name, made the first time it's used. `/:projectId/` on its own opens the start page.

## How an outcome works

All of Verify is on the session page, so the recorder stays mounted and the recording goes on throughout, as in the original. Verify's views take the place of the transcript.

1. **Recording.** The page streams the microphone to the session's agent with `useVoiceInput`. The agent sends it on to `gemini-3.5-transcribe-live-preview`, and saves each finished utterance. Stopping and recording again adds to the same transcript.
2. **Verify turns on** once 60 seconds are recorded, with something transcribed, and the project has Verify on. A meter under the button fills meanwhile. After an outcome, it waits 2 minutes. While it can't be pressed, the page says why. The agent checks the same rules, and allows one outcome at a time.
3. **Topic chips.** "What do you want to verify?" shows the project's topics, each with its emoji. Pick one, then **Next**. With only one topic, it starts at once.
4. **The instructions**, the original's five steps, show while the outcome is written. **Next** turns on when it's complete. A second tab, or a page reloaded meanwhile, shows the same, and waits for **Next** too.
5. **The prompt.** The agent asks the project for the topic, which refuses one that isn't offered, or Verify being off. It builds the prompt from the original's `generate_artifact` template, with the topic's prompt, and a message with the project's name, the session's earlier outcomes, and the transcript.
6. **The outcome** streams from `gemini-3.5-flash` into the agent's state. With nothing back after 20 seconds, the page says it's still working. The finished outcome is saved, dated when its text is complete, and becomes the session's **pending outcome**. It shows as Markdown. If it fails, the error shows with **Try again**.

The same steps, in order. Once the outcome starts, `verify()` returns, and the rest runs inside `keepAliveWhile()`. The outcome reaches the page through state sync, a piece at a time, not as `verify()`'s return value.

```mermaid
sequenceDiagram
  participant Page as Recording page
  participant S as SessionAgent "a1"
  participant L as Gemini Live
  participant P as ProjectAgent "demo"
  participant G as Gemini Flash
  rect rgba(13, 148, 136, 0.12)
    Note over Page,L: Recording: two WebSockets stay open, the whole time
    loop while recording
      Page->>S: audio (WebSocket)
      S->>L: audio (WebSocket)
      L-->>S: each finished utterance
      S-->>Page: broadcast: new segment
    end
  end
  Page->>S: verify("agreements")
  Note right of S: checks the rules,<br/>status: generating
  S->>P: topic("agreements")
  P-->>S: label, emoji, prompt
  S-->>Page: returns
  rect rgba(234, 88, 12, 0.12)
    Note over S,G: inside keepAliveWhile(), even with no page connected
    S->>G: system: generate_artifact; user: transcript, earlier outcomes (HTTPS)
    loop SSE: a piece every few hundred ms
      G-->>S: next piece
      S-->>Page: state sync to every open page: verifyDraft
    end
    S->>S: saves it to outcomes
    S-->>Page: state sync: pendingOutcome
  end
  Page->>S: revise(), editOutcome() or approve()
  S->>P: outcomeApproved(), after approve()
  P-->>P: tells the settings page to load outcomes again
```

### Revise, Edit and Approve

The pending outcome has four buttons:

- **Revise** sends the speech since the outcome was made or last revised, as feedback, with the whole transcript and the outcome's current text. The new text streams in over the old. Then Revise waits 30 seconds. With no new speech, it says "No new feedback detected yet…", and waits the same 30 seconds, as the original does.
- **Edit**, the pencil, opens the text as plain Markdown. **Save** stores it in the agent at once, so every tab shows it, a reload keeps it, and Revise starts from it.
- **Approve** keeps the outcome as it reads now. Every page goes back to the transcript, where it heads the **Approved** list, and the settings page shows it under the session. Each approved outcome opens in place.
- **Back** goes to the transcript, and the outcome stays pending: **Return to outcome** opens it again, and so does a reload. A new outcome replaces it, and the old one stays in the table, unapproved, as in the original.

Revise sends only what's new since the last version. The original sends everything since the first, each time, so its second revision gets the first's feedback again:

```text
segments:  s1 s2 s3 s4 │ s5 s6 │ s7 s8 │
                       ▲       ▲       ▲
                   v1 made  Revise#1  Revise#2

Original:  Revise#1 gets s5 s6;  Revise#2 gets s5 s6 s7 s8
Here:      Revise#1 gets s5 s6;  Revise#2 gets s7 s8
```

Two timing effects, both as in the original:

- **Speech while an outcome is written counts as feedback.** The outcome is dated when its text is saved, so anything said while Gemini writes it is new for Revise.
- **An utterance said across that moment can count as feedback.** Gemini Live times each segment when it's finished, so one that started before the outcome and ended after it counts as new.

### Topics

The six default topics are the original's, with their prompts word for word and the portal's emoji: [`src/shared/topics.ts`](src/shared/topics.ts). A project can add its own on the settings page, with a label, an emoji and a prompt, and remove them again. Its key is the original's: a slug of the label, then 8 random characters.

The settings page has a checkbox for each topic. Nothing selected means every topic, as in the original, so that shows as all ticked. The last one can't be unticked: turn Verify off instead. A change shows at once on every open session page. An outcome keeps its own copy of its topic's label and emoji, so it still shows after the topic is removed.

### The prompts

The templates are the original's `generate_artifact.en.jinja` and `revise_artifact.en.jinja`, copied as they are into [`src/server/prompts/`](src/server/prompts/). The system prompt goes to Gemini as `systemInstruction`, and the user message has the original's shape. They're rendered with [LiquidJS](https://liquidjs.com), whose `{{ }}` and `{% if %}` match the Jinja they use. The original renders them with nunjucks, which [can't run in a Worker](https://developers.cloudflare.com/workers/runtime-apis/web-standards/): it compiles templates with `new Function`. The language is English, and removing personal details is off, so that block of the templates is left out.

### Limits

Every limit is in [`src/shared/constants.ts`](src/shared/constants.ts), marked with where it comes from: the original portal, polis-statement-extraction, or made up for this example.

- **The waits** of 2 minutes between outcomes and 30 seconds between revisions are counted on the server, from when the last one finished. The original keeps them in the browser.
- **Sessions up to about an hour**, because of the token. Gemini Live itself resumes past Vertex's session limits; see [`packages/voice-gemini`](packages/voice-gemini/README.md).

## Replaying an audio file

Add `?debug=true` to a new session's link, or follow the faint **debug** link at the bottom of its page, to replay a recording instead of using the microphone. The page decodes the file, resamples it to 16kHz mono, and sends it to the session in 5-minute WAV windows. `gemini-3.5-transcribe-preview` transcribes each, and its text joins the transcript as if it had been said live. The file's length counts as recorded time, so a replay of over a minute turns Verify on.

To make test files without talking, macOS's `say` can write one:

```bash
say -v Samantha --file-format=WAVE --data-format=LEI16@16000 -o test.wav "Let's put the vegetable beds on the south side."
```

## How it works

Two kinds of [Agent](https://developers.cloudflare.com/agents/), each a Durable Object with its own SQLite:

- **`ProjectAgent`**, one per project. It lists its sessions, and keeps the Verify settings in its state, which syncs to every connected page: whether it's on, the selected topics, and its own topics. Pages change them through `updateSettings()`, `addTopic()` and `removeTopic()`, which check each change.
- **`SessionAgent`**, one per session. It extends `withVoiceInput(Agent)`, and keeps the transcript and the outcomes in SQLite, and the outcome being written and the pending outcome in its state. The recording page connects to it.

A session reaches its project over RPC with `getAgentByName`, for a topic, and to say it approved an outcome. The project reaches each session the same way, in parallel, for its approved outcomes. A session that doesn't answer is skipped and logged.

`verify()` and `revise()` are `@callable`s that check the rules, start the text and return. `keepAliveWhile()` keeps the object awake until it's done, even if no page is connected. An outcome cut off by a restart is marked failed when the object starts again. Which view the page shows, from the state and what this page has seen, is one pure function, [`verifyView()`](src/shared/verify-view.ts).

[`useVoiceRecorder`](src/client/hooks/use-voice-recorder.ts) wraps `useVoiceInput`, whose `start()` opens the call before it asks for the microphone, and resolves even when that's refused. The wrapper asks first, so a refusal throws before any call opens, and the page tells the agent once the microphone is on, which is when recorded time starts.

The Worker is a [Hono](https://hono.dev) app: [`hono-agents`](https://www.npmjs.com/package/hono-agents) routes the pages' WebSockets to the agents, and `/api/…` takes replay windows.

### Files

| Path | What's in it |
|---|---|
| `src/server/server.ts` | The Hono app: agents and replay windows |
| `src/server/project-agent.ts` | `ProjectAgent`: sessions, topic settings, and approved outcomes from every session |
| `src/server/session-agent.ts` | `SessionAgent`: the transcript, recorded time, and `verify()`, `revise()`, `editOutcome()` and `approve()` |
| `src/server/verify/` | The prompts, transcript and feedback, settings checks, and the streaming Gemini call |
| `src/server/prompts/` | The original's outcome templates |
| `src/server/models.ts` | The three Gemini models |
| `src/client/pages/` | The home, start, session, Verify views, replay and settings pages |
| `src/client/hooks/` | `useVoiceRecorder`, `useWakeLock` and `useNow` |
| `src/client/audio/` | Decoding and windowing for replay |
| `src/shared/` | Project and session IDs, the constants, the topics, the Verify rules and views the page and the agent share |
| `packages/voice-gemini/` | The Gemini Live and batch speech-to-text providers, copied from `portal-explore` |

[`PLAN.md`](PLAN.md) has the design, how it differs from the original, and what's left for later.
