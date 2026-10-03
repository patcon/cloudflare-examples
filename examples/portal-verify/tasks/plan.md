# Implementation Plan: portal-verify

## Overview

Build `examples/portal-verify`: `portal-explore` with Explore taken out and the portal's Verify put in. A group records, picks a topic, gets an outcome written from the conversation, says what's wrong while the phone keeps recording, revises, edits and approves it. The host picks the topics and sees approved outcomes. The design, the original it ports and every difference are in [`../PLAN.md`](../PLAN.md). This file and [`todo.md`](todo.md) cover only the order of the work.

## Architecture Decisions

All settled in [`../PLAN.md`](../PLAN.md#decisions). The ones that shape the order:

- **Copied from `portal-explore`, then cut down.** The first two tasks leave a recording-only example that works, before any Verify code goes in.
- **Everything runs in `SessionAgent`, streamed into its state**, as Explore's reply did. Generating is the riskiest part, a new prompt shape on Vertex, so it comes first after the foundation, with the default topics hard-wired. The host's topic settings come later.
- **Rules live in `src/shared/rules.ts`**, checked by the agent and shown by the page. Each rule arrives with the task that needs it.
- **Revise feedback is what's been said since the outcome was made or last revised. Edits are saved to the agent. The model is `gemini-3.5-flash`.**

## Dependency graph

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

4, 5 and 6 don't depend on each other. Nor do 9, 10 and 11, but they all change the same two files, `session-agent.ts` and `Session.tsx`, so they go one after another.

## Task List

Details for each task are in [`todo.md`](todo.md).

### Phase 1: A recording-only example
- [ ] Task 1: Copy `portal-explore` as `portal-verify`
- [ ] Task 2: Remove Explore from the session
- [ ] Task 3: Remove Explore from the project

### Checkpoint: Foundation
- [ ] `pnpm test`, `pnpm typecheck` and `pnpm lint` pass
- [ ] A session records, transcribes, stops and records again
- [ ] Review with the user

### Phase 2: One outcome, end to end
- [ ] Task 4: The Verify prompts
- [ ] Task 5: A system prompt in `streamReply`
- [ ] Task 6: Default topics and `whyNotVerify`
- [ ] Task 7: Generate an outcome

### Checkpoint: An outcome streams
- [ ] Tests, typecheck and lint pass
- [ ] From a replay of a few seconds, an outcome streams onto the page and is saved
- [ ] Review with the user

### Phase 3: The participant's loop
- [ ] Task 8: Instructions, topic picker and the pending outcome
- [ ] Task 9: Revise
- [ ] Task 10: Edit
- [ ] Task 11: Approve, and the approved list

### Checkpoint: Verify works for a participant
- [ ] Tests, typecheck and lint pass
- [ ] Verify, revise from spoken feedback, edit, approve, all in a browser
- [ ] Review with the user

### Phase 4: The host, and docs
- [ ] Task 12: The host's topic settings
- [ ] Task 13: Approved outcomes on the settings page
- [ ] Task 14: README and PLAN

### Checkpoint: Complete
- [ ] Every acceptance criterion in `todo.md` is ticked
- [ ] Every command in the README works as written
- [ ] Ready for review

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Vertex treats `systemInstruction` differently from the original's AI SDK `system` | Med | Task 5 adds it, and Task 7 checks a real outcome before anything builds on it |
| Each Vertex call costs money, and outcomes are longer than Explore's replies | Low | Replay clips of a few seconds. Ask before any longer or repeated run |
| Speech while the outcome is being written counts as feedback, as in the original, which saves `date_created` after generating | Low | Keep the original's timing: `created_at` and `revised_at` are set when the text is saved. Note it in the README |
| An utterance that started before the outcome was made but was finalized after it counts as feedback | Low | Accept it. Segments are stamped when Gemini Live finalizes them. Note it in the README |
| A Markdown renderer is a new dependency for the page | Low | Task 8 picks one, such as `react-markdown`, and checks the bundle builds |
| Removing Explore touches many files at once | Med | Split over Tasks 2 and 3, each leaving tests and typecheck passing |
| Streaming a long outcome as many state updates | Low | Explore already does this. Watch it in Task 7, and throttle only if it lags |

## Open Questions

None that block Phase 1. The design questions are settled in [`../PLAN.md`](../PLAN.md#decisions).
