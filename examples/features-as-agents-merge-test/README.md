# features-as-agents-merge-test: Explore, Verify and statement extraction in one portal

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

Then open <http://localhost:8797>, pick a project name such as `demo`, and start a session. To record from a phone, use `pnpm dev:share` instead: it also prints a public link.

Everything runs on Gemini on Vertex AI, so you need a Google Cloud project with Vertex AI enabled and `gcloud` logged in to it. The token lasts about an hour, so run `pnpm google-token` again when it expires, and restart `pnpm dev`.

| Command | What it does |
|---|---|
| `pnpm test` | Every pure function, from the tests beside each file, then the Gemini provider's tests |
| `pnpm typecheck` | The Worker (`tsconfig.json`) and the page (`tsconfig.client.json`) |
| `pnpm lint`, `pnpm format` | Biome |

## Pages

| URL | Who | What |
|---|---|---|
| `/:projectId/start` | The recording phone | The portal's title and content, and **Start a session**, which makes a new session with a random ID |
| `/:projectId/sessions/:sessionId` | The recording phone | Record and stop as often as you like, the live transcript, and a panel for each feature that's on |
| `/:projectId/settings` | The host | A General tab for the project's name and context, and the portal's title and content. Then a tab for each feature, with its switch and settings: Explore's context from other sessions, Verify's topics and approved outcomes, the Statements topic. A last tab lists the sessions. The tab is in the link, such as `#verify` |
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
| `src/client/pages/` | The home, start, session, settings, review and replay pages |
| `packages/voice-gemini/` | The Gemini Live and batch speech-to-text providers, copied from `portal-explore` |

[`PLAN.md`](PLAN.md) has the decisions, what wasn't tested, and what's left for later.
