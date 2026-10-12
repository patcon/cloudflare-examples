# features-as-agents-merge-test-dembrane-theme: the merge test, in the dembrane portal's look

A copy of [`features-as-agents-merge-test`](../features-as-agents-merge-test) whose pages are built from the dembrane portal's own theme and components: Mantine, DM Sans, and echo's participant screens, copied from [dembrane-echo](https://github.com/Dembrane/echo) rather than imitated. The agents are unchanged. The aim is to try the merge test with the portal's UX, and to keep the copies close enough to echo's that they could later be shared between echo's dashboard, its portal and these examples.

## What's from echo

The copies are in `src/client/dembrane/`, at the same paths as under echo's `dembrane/frontend/src/`, so echo's `@/` imports work as they are. [`scripts/echo-files.sh`](scripts/echo-files.sh) lists each one:

- `scripts/echo-files.sh copy` copies any file on the list that isn't here yet, from the echo commit in `scripts/echo-ref`. `FORCE=1` overwrites ours.
- `scripts/echo-files.sh diff` shows how ours differ. Today only `tailwind.config.js`, `ParticipantRecordingWaveform.tsx`, `MicrophoneTest.tsx` and `ParticipantBody.tsx` do, in lines marked `// example:`.

What they need from echo but this app doesn't have is stood in for, in files of our own at the paths echo's are imported from. Each starts with `// example: ours`. [`src/client/dembrane/PROVENANCE.md`](src/client/dembrane/PROVENANCE.md) lists them, and what's left out.

The toolchain is echo's, so the copied CSS works as is: Mantine 7, Tailwind 3 through PostCSS, and echo's `theme.tsx` and `rules.css`.

## What's different from the merge test

- **Start** is echo's onboarding deck: the welcome cards, privacy, then **Ready to begin?**, which asks for a session name. It opens the session at echo's path, `/:projectId/conversation/:id`.
- **The session page** is echo's audio screen:
  - echo's welcome, the portal's title and content, and its instructions.
  - The record bar at the bottom: **Record** and **Finish**, then while recording the waveform, the timer, **ECHO** and **Stop**.
  - echo's screens above the bar, at `/refine`, `/verify` and `/verify/approve` under the conversation, change the URL in place, so the recording carries on.
  - **Stop** opens echo's **Recording paused** modal, with **Resume** and **Finish**.
  - Or, with **Pause button** on in Settings → General, **Pause** beside **Stop**. Pause pauses in place, with no modal, and turns into **Resume**; the waveform stays, still, and so does **ECHO**. Stop pauses and opens **Recording paused**, with **Back**, which only closes it, and a red **Finish**. It's off by default, as echo has no Pause.
  - **Finish** goes to echo's thank-you page.
- **Verify and Explore are behind the ECHO button**, as in echo. It fills over the first minute recorded; until then, a press says how long is left. Then it opens echo's refine screen, with a card for each feature that's on:
  - **Verify** opens echo's verify screens: pick a topic, read the outcome, revise or edit it, approve it. Approved outcomes show under the conversation, as echo's do. Its panel is gone.
  - **Explore** goes back to the conversation and asks for a reply, which shows under it with dembrane's mark. The ECHO button is off until the reply is done.
- **The transcript** streams in under the conversation, as echo's responses in its text mode, rather than in a panel of its own.
- **Statements** keeps its panel, restyled.
- **Light only, and recording only.** There's no dark mode and no text input: the text-input buttons from echo are left out, and the pause modal's **Switch to text input** link only says so.

---

## From the merge test: features-as-agents-merge-test: Explore, Verify and statement extraction in one portal

A group sits around one phone, which records their conversation, and Gemini transcribes it live. Three features work from that transcript:

- **Explore**, from [`portal-explore`](../portal-explore): a short reply to the conversation so far, when someone asks.
- **Verify**, from [`portal-verify`](../portal-verify): an outcome on a topic the group picks, which they revise out loud and approve.
- **Statements**, from [`polis-statement-extraction`](../polis-statement-extraction): candidate statements for Polis, pulled from each new stretch of the transcript while it records, for the host to review.

It's a test of one architecture for merging them: **the session keeps only the transcript, and each feature is its own agent**, one per session, beside it. The features don't know about each other, and the session doesn't know what they do. A project's host turns each feature on or off on the settings page.

## The agents

```
 SESSION PAGE: one connection for the mic and transcript, one per feature panel
      │                  │                  │                    │
      ▼                  ▼                  ▼                    ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐
│ SessionAgent │  │ ExploreAgent │  │ VerifyAgent  │  │ StatementsAgent │
│ transcript,  │  │ replies      │  │ outcomes     │  │ windows,        │
│ recorded     │  │              │  │              │  │ candidates,     │
│ time, replay │  │              │  │              │  │ timer           │
└──────────────┘  └──────────────┘  └──────────────┘  └─────────────────┘
   features pull from the session: facts(), segmentsSince()
   the session pushes one thing to each: onSessionEvent({ recording })
       │
       ▼ attach; each feature asks for its settings
┌──────────────────────────────────────────────────────────────────────┐
│ ProjectAgent: its sessions, and each feature's settings, one slice   │
│ each. Project-wide views ask every session's feature agent at once.  │
└──────────────────────────────────────────────────────────────────────┘
```

Every feature agent is named by its session's ID, so the session, the project and the pages all find it by name alone, with `getAgentByName` or `useAgent`.

- **`SessionAgent`** extends `withVoiceInput(Agent)`. It keeps the live transcript, the recorded time and the replay. Its contract with the features is three methods: `facts()` (project, recorded seconds, segment count, whether it's recording), `segmentsSince(afterId, context)`, and one push, `onSessionEvent({ type: "recording", on })`, which it sends to every feature agent when recording starts or stops. It imports nothing of the features but their binding names.
- **Each feature agent** owns its SQLite tables, its synced state, its `@callable`s and its recovery in `onStart`. It reads the session when it needs to, and checks its rules (`whyNotExplore`, `whyNotVerify`, `whyNotRevise`, `whyNotExtract`) against the session's facts and its own state. The page checks the same rules to disable the button and show why.
- **`ProjectAgent`** keeps the sessions and the settings, `{ explore: {...}, verify: {...}, statements: {...} }`, each slice checked by its feature's own `checkSettingsChange`. It keeps no feature data: a view across the project, such as the review page's candidates, asks every session's feature agent and combines the answers. A session that doesn't answer shows as such, and the rest still show.

Explore and Verify stream Gemini's text into their agent's state through one helper, [`src/server/lib/draft.ts`](src/server/lib/draft.ts), so a reload catches up, and a draft cut off by a restart is marked failed.

## Adding a feature

1. `src/shared/features/<key>/`: its settings type, defaults and `checkSettingsChange`, and its rules.
2. `src/server/features/<key>/agent.ts`: a `FeatureAgent`, which gives it `session()`, `project()` and an `onSessionEvent` to override. Export it from `server.ts`.
3. `src/client/features/<key>/`: its `Panel` for the session page and `Section` for the settings page.
4. One entry each in `FEATURES` ([`src/shared/features/index.ts`](src/shared/features/index.ts)) and `FEATURE_UI` ([`src/client/features/index.ts`](src/client/features/index.ts)), and its binding and class in `wrangler.jsonc`.

The session page, settings page, settings back-fill and the session's push loop over the registry, so they don't change.

## Run it

```bash
pnpm install
cp .dev.vars.example .dev.vars   # set GOOGLE_CLOUD_PROJECT
pnpm google-token                # puts `gcloud auth print-access-token` in .dev.vars
pnpm dev
```

Then open <http://localhost:8798>, pick a project name such as `demo`, and start a session. To record from a phone, use `pnpm dev:share` instead: it also prints a public link.

Everything runs on Gemini on Vertex AI, so you need a Google Cloud project with Vertex AI enabled and `gcloud` logged in to it. The token lasts about an hour, so run `pnpm google-token` again when it expires, and restart `pnpm dev`.

| Command | What it does |
|---|---|
| `pnpm test` | Every pure function, from the tests beside each file, then the Gemini provider's tests |
| `pnpm typecheck` | The Worker (`tsconfig.json`) and the page (`tsconfig.client.json`) |
| `pnpm lint`, `pnpm format` | Biome |

## Pages

| URL | Who | What |
|---|---|---|
| `/:projectId/start` | The recording phone | echo's onboarding deck, ending in a session name, which makes a new session with a random ID |
| `/:projectId/conversation/:sessionId` | The recording phone | echo's audio screen: record and stop as often as you like, Verify's and Statements' panels, and Explore's ECHO button. `/:projectId/sessions/:sessionId` opens it too |
| `/:projectId/conversation/:sessionId/finish` | The recording phone | echo's thank-you page |
| `/:projectId/settings` | The host | A General tab for the project's name and context, and the portal's title and content. Then a tab for each feature, with its switch and settings: Explore's context from other sessions, Verify's topics and approved outcomes. A last tab lists the sessions. The tab is in the link, such as `#verify` |
| `/:projectId/review` | The host | Every session's candidate statements, to approve, edit, reject, or copy |

## Replaying an audio file

Add `?debug=true` to a new session's link, or follow the faint **debug** link at the bottom of its page, to replay a recording instead of using the microphone. The page sends it to the session in 5-minute WAV windows, and `gemini-3.5-transcribe-preview` transcribes each, as if it had been said live. The file's length counts as recorded time. A replay isn't a recording, so it doesn't start the Statements timer: use **Extract now**.

```bash
say -v Samantha --file-format=WAVE --data-format=LEI16@16000 -o test.wav "Let's put the vegetable beds on the south side."
```

## Files

| Path | What's in it |
|---|---|
| `src/server/server.ts` | The Hono app: agents and replay windows |
| `src/server/session/` | `SessionAgent` |
| `src/server/project/` | `ProjectAgent` |
| `src/server/features/{explore,verify,statements}/` | Each feature's agent, prompts and templates |
| `src/server/lib/` | `FeatureAgent`, the draft helper, `gather`, the Gemini calls and stream parser, Liquid templates |
| `src/server/models.ts` | The Gemini models |
| `src/shared/features/` | The registry, and each feature's settings, rules and views, shared by agents and pages |
| `src/client/features/` | Each feature's panel and settings section, and their registry |
| `src/client/pages/` | The home, start, session, finish, settings, review and replay pages |
| `src/client/participant.tsx` | A participant page: echo's layout, with the project where echo's components look for it |
| `src/client/dembrane/` | The files copied from echo, and the stand-ins they need; see its `PROVENANCE.md` |
| `scripts/echo-files.sh`, `scripts/echo-ref` | Which files are copied from echo, from which commit |
| `packages/voice-gemini/` | The Gemini Live and batch speech-to-text providers, copied from `portal-explore` |

[`PLAN.md`](PLAN.md) has the decisions, what wasn't tested, and what's left for later.
