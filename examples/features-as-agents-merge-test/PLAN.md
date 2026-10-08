# Plan: features as agents

## Goal

Merge `portal-explore`, `portal-verify` and `polis-statement-extraction` into one portal, each feature a clear unit, to see how simple the merged app gets when every feature is its own agent beside a transcript-only session.

## Decisions

- **The session keeps only the transcript.** `SessionAgent` has the live segments, the recorded time, replay, and `attach`. Its contract with features is `facts()`, `segmentsSince(afterId, context)`, and one push, `onSessionEvent({ type: "recording", on })`, sent to every feature agent through the registry's binding names.
- **One agent per feature, all named by session ID.** One naming rule: the session, the project and the pages find a feature agent by the session's ID. Each feature's storage, state broadcasts and failures stay its own: a streaming draft doesn't broadcast over the audio connection. The cost is an RPC hop per action, and more Durable Objects, which hibernate.
- **Project-wide views are gathered.** `ProjectAgent` keeps no feature data. `approvedOutcomes`, `otherTranscripts`/`contextPreview` and `candidates` ask each session's feature agent in parallel, through `lib/gather.ts`. Statement extraction gathers too, to leave out what the project already has.
- **Settings are namespaced**, `{ explore, verify, statements }`, each with `enabled` and checked by its feature's `checkSettingsChange`. `onStart` back-fills a feature or setting added since a project was saved. `changed(feature)` lets a feature agent tell the project's pages to refetch.
- **A feature registry**: `FEATURES` (shared: label, binding, defaults, check) and `FEATURE_UI` (page: panel, settings section). The session page, settings page, back-fill and the session's push loop over it.
- **One draft helper** (`lib/draft.ts`) for Explore's replies and Verify's outcomes: `{ status, draft, error }` in synced state, the slow timer, and recovery in `onStart`. Verify adds `mode: "generate" | "revise"`. Swapping in the SDK's `Streams` capability would only change this file.
- **One Gemini module** (`lib/gemini.ts`): `streamText` (Vertex `v1`, as Explore and Verify used) and `generateJson` (`v1beta1`, as extraction used).
- **One noun per feature**: Explore writes **replies**, Verify writes **outcomes** (the original's `*_artifact` templates are copied as `*_outcome`, their text unchanged), extraction proposes **candidates**; an approved one sent to Polis would be a **statement**.
- **Statements is live windows only.** The R2 recording upload, diarization and the final pass are left out (see Later).
- **Binding names are the class names** (`SessionAgent`, `VerifyAgent`, …), as in the examples this merges and the Agents SDK's examples, so `useAgent({ agent: "VerifyAgent" })` reaches it.
- **`agents` pinned to exactly `0.27.0`**, since `agents/lifecycle`, `streams` and `tasks` are experimental. Nothing used here changed between 0.24 and 0.27.
- **`voice-gemini` stays a copy** in `packages/`, so the example stands alone.
- **Tests sit beside the files they test** (`*.test.ts`), for the pure functions. The `voice-gemini` package keeps its own `tests/`, identical to its copies in the other examples.

## What changed from the three originals

- The session page shows a panel per feature that's on, stacked above the transcript. Verify's views (topics, instructions, outcome) replace its panel, not the whole page as in `portal-verify`.
- A feature that's off doesn't show on the session page. Its agent still refuses with the reason, for a page that hasn't caught up.
- Explore and Verify check a press before anything awaits, then start the draft, then check the session's facts over RPC, and undo the draft if it's refused. A second press while the first is checking is refused at once.
- Statements' candidates live per session. Every window's duplicate check gathers the project's candidates, which costs a call per session per window.
- The Statements topic is the project's context, on the settings page's General tab.
- **Extract now** is refused with nothing new since the last run. The cursor (the last segment a run covered) is in the agent's synced state, so the page can tell.

## Seams

- **Statements per project.** If one agent per project suits extraction better, such as for one timer and local duplicate checks: name `StatementsAgent` by project ID, add `session_id` to `windows` and `candidates`, keep a cursor per session, and make `ProjectAgent.candidates()`, `decide()` and `extractNow()` local or forwarded to the one agent. Only those three project methods and the session's push (which names the feature agent by session ID) know candidates live per session.
- **Streams.** `lib/draft.ts` is the one place drafts are written.

## Not tested

Checked with `pnpm test`, `pnpm typecheck`, `pnpm build`, and a script that drives every agent over WebSockets in `pnpm dev`, calling only what doesn't reach Gemini: attach, settings changes and their checks, the back-fill of a project saved before a feature existed, each feature's refusal and rollback, and the gathered views.

Not yet run, because each sends audio or text to Vertex:

- A real recording, so the session's `onSessionEvent` push, and the Statements timer, start and stop.
- A replay, then Explore, Verify (and Revise, Approve) and Extract now with real text.
- A restart mid-draft, to see `recoverDraft` fail only that feature's draft.

## Later

- The SDK's `Streams` capability (`agents/streams`) behind `lib/draft.ts`, and how a page follows a stream.
- The recording upload to R2, diarization and the final extraction pass, in the session, with the diarization effort. Extraction would read the diarized transcript, not make it.
- Pushing approved candidates to `polis-durable-object`'s `Conversation`, over RPC, with `importPolis` (it upserts on `external_id`).
- The replay route, and the recording upload, as `onRequest` capabilities.
- Feature agents as SDK sub-agents of the session, once sub-agent WebSockets are proven.
