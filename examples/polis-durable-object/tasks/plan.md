# Implementation Plan: Statement explorer (repness and consensus)

## Overview

List Polis's representative statements for each opinion group, and its consensus statements, below the scatter plot. This is the start of a statement explorer. The selection math runs in the browser, as pure functions with no dependencies, so it can later move into the Worker or be extracted into a `red-dwarf-ts` library unchanged. The Durable Object's alarm adds vote tallies to `MathResult`, and a new route serves the statement texts.

## Architecture Decisions

- **Follow Polis's Clojure algorithm** (`math/src/polismath/math/repness.clj`), which delphi's Python port matches, without trying to match it exactly. No reddwarf-ts or osccai changes: we choose agree or disagree by `rat > rdt` only, with no min-votes rule, and fall back to best-agree before best. Up to 5 per group, best-agree included, with agrees listed before disagrees. We won't chase Clojure's edge cases (float32 rounding, tie order by vote arrival), so exact parity isn't a goal.
- **Best-agree is always reported as an agree.** This is the one deliberate change from Clojure. When every group agrees, `rat` and `rdt` are both 0, and Clojure's `finalize-cmt-stats` labels the best-agree a disagree ("0 of 10 disagreed"). Polis's report shows it that way too.
- **Tests aim for consistency, not parity.** A snapshot of our output on a real Polis conversation catches unintended changes later. Hand-built cases pin down each rule.
- **Tallies go over the wire, not votes.** The alarm computes `{ agree, disagree, seen }` for each statement: once for everyone, and once for each group's members. The browser never receives individual votes, and today it doesn't either. `seen` counts passes, as Polis's `ns` does.
- **"Everyone" and "group members" are different populations:**
  - Consensus uses every participant who voted, including the unclustered ones. That's Clojure's `rating-mat`.
  - Repness uses only group members, so the "rest" side of each comparison is the other groups. That's Clojure's `group-votes` via base clusters.
- **Tallies only cover statements with at least one vote.** Clojure's named matrix only has columns for statements someone has voted on.
- **Ties go in the order the tallies are given**, which is ascending statement ID everywhere (delphi's "improved" mode).
- **Consensus shows as soon as there are votes**, even with no groups (`k === null`), as Polis does. Repness shows only when groups exist.
- **The library lives at `src/shared/repness.ts`, with no imports.** It owns its input and output types (`StatementTally`, `RepStatement`, `ConsensusStatement`), and `src/shared/types.ts` imports them from there. The Worker and the React app can both use it, and extracting it into `red-dwarf-ts` means copying one file and its tests.
- **camelCase output fields** follow Clojure's `finalize-cmt-stats` names: `statementId`, `repfulFor`, `nSuccess`, `nTrials`, `pSuccess`, `pTest`, `repness`, `repnessTest`, and `bestAgree`.
- **`modOut` is an option even though the app passes `[]`.** The fixture has moderated-out statements, and a library needs the option anyway.
- **Statement texts come from `GET /api/:convoId/statements`.** The client fetches them when the page loads and again whenever `counts.statements` goes up. They aren't bundled into every `math` message.

### Sketch of the interface

```ts
// src/shared/repness.ts
export type Tally = { agree: number; disagree: number; seen: number };
// groups[g] is group g's members only; all is every participant who voted.
export type StatementTally = { statementId: number; all: Tally; groups: Tally[] };

export function selectRepStatements(tallies: StatementTally[], opts?: { modOut?: number[]; pickMax?: number }): RepStatement[][];
export function selectConsensusStatements(tallies: StatementTally[], opts?: { modOut?: number[]; pickMax?: number }): { agree: ConsensusStatement[]; disagree: ConsensusStatement[] };
```

## Task List

Tasks with acceptance criteria are in [`todo.md`](todo.md).

### Phase 1: The library, with regression tests
- [x] Task 1: Statistics primitives and per-group stats
- [x] Task 2: Test fixture from a real Polis conversation
- [x] Task 3: Representative and consensus selection

### Checkpoint: The library works
- [x] `pnpm test` passes, including the fixture snapshot, and the snapshot looks sensible when read
- [x] Review with the human before wiring it into the app

### Phase 2: Data to the browser
- [x] Task 4: Vote tallies in `MathResult`
- [x] Task 5: `GET /statements` and a hook to load the texts

### Checkpoint: Data flows
- [x] `pnpm test` and `pnpm build` pass
- [x] A `math` message over the WebSocket carries `tallies`

### Phase 3: UI and docs
- [x] Task 6: Statement explorer below the scatter plot
- [x] Task 7: Update PLAN.md and README

### Checkpoint: Complete
- [x] Imported Polis export shows consensus and per-group lists; a fresh conversation shows consensus before groups exist
- [ ] Ready for review

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The fixture's `votes.json` may use Polis's database sign (−1 = agree), not the export sign | High: consensus would be inverted | In Task 2, check the counts against the fixture's own `group-votes` A/D counts, and flip the sign if needed. Record which convention it uses in the fixture's README. |
| A `math` value stored before this change has no `tallies`, so an imported conversation with no new votes would never get them | Medium: the explorer would stay empty | When `fetch()` finds stored math without `tallies`, it schedules the alarm right away. |
| The fixture comes from red-dwarf, which is MPL-2.0 | Low | Vendor only the trimmed data (not code), with a README giving the source, commit and license. |
| Repness and consensus might get slow in the browser on big imports | Low for now: it's O(groups × statements) over counts | The functions are pure and in `src/shared/`, so they can move into the alarm if they need to. |

## Resolved Questions

- **Vendoring the fixture:** OK, with attribution.
- **Row format:** "n of m agreed" (or "disagreed").
- **Parity:** not a goal. Consistent outputs, via snapshots, are.
