# Tasks: Statement explorer (repness and consensus)

See [`plan.md`](plan.md) for the decisions behind these. Clojure references are to `compdemocracy/polis@edge`, `math/src/polismath/math/`.

## Task 1: Statistics primitives and per-group stats

**Description:** Start `src/shared/repness.ts` with Polis's statistics, working from tallies:
- `propTest`, `twoPropTest` and `zSig90` (`stats.clj`).
- Per-group stats: `na`, `nd`, `ns`, `pa`, `pd`, `pat`, `pdt` (`repness.clj` `comment-stats`).
- Stats compared with the other groups: `ra`, `rd`, `rat`, `rdt` (`add-comparitive-stats`), where "rest" is the sum over the *other groups*.

The file has no imports.

**Acceptance criteria:**
- [x] `propTest(succ, n) = 2·√(n+1)·((succ+1)/(n+1) − 0.5)`.
- [x] `twoPropTest` adds 1 to all four inputs, and returns 0 when the pooled proportion is 1.
- [x] `pa = (na+1)/(ns+2)`.
- [x] `ra = pa / ((1+Σna_rest)/(2+Σns_rest))`, and it's still defined when there's only one group (the rest is all zeros).
- [x] Passes count toward `ns`.

**Verification:**
- [x] Tests pass: `pnpm test repness`. Each test has hand-computed values, including `ns = 0` and a single group.
- [x] Build succeeds: `pnpm build`.

**Dependencies:** None

**Files likely touched:** `src/shared/repness.ts`, `test/repness.test.ts`

**Estimated scope:** S

## Task 2: Test fixture from a real Polis conversation

**Description:**
- Vendor a trimmed copy of red-dwarf's `tests/fixtures/below-100-ptpts` into `test/fixtures/polis-below-100-ptpts/`:
  - the votes, compacted to `[pid, tid, vote]`;
  - from `math-pca2.json`: `mod-out`, `group-clusters`, `base-clusters` and `group-votes`.
- Add a small helper that turns the fixture into `StatementTally[]`:
  - `groups` come from `group-votes`, Clojure's own counts.
  - `all` comes from every vote.
  - Statements go in ascending ID order.

**Acceptance criteria:**
- [x] The vote sign is established: per-group agree counts built from `votes.json` plus the clusters match `group-votes` `A`. Our tallies use 1 = agree.
- [x] `test/fixtures/polis-below-100-ptpts/README.md` gives the source repo, commit, license (MPL-2.0) and the sign convention.
- [x] The fixture files together are under about 50 KB.

**Verification:**
- [x] Tests pass: `pnpm test repness` (the helper's sign check runs).
- [x] Manual check: the three groups have 11, 3 and 9 participants, as `math-pca2.json`'s `n-members` says.

**Dependencies:** Task 1 (for the `StatementTally` type)

**Files likely touched:** `test/fixtures/polis-below-100-ptpts/*`, `test/repness.test.ts`

**Estimated scope:** S

## Task 3: Representative and consensus selection

**Description:** Add `selectRepStatements` (`select-rep-comments`, `finalize-cmt-stats`, `repness-sort`, `agrees-before-disagrees`) and `selectConsensusStatements` (`consensus-stats`, `select-consensus-comments`) to `src/shared/repness.ts`, with the `modOut` and `pickMax` options (default 5). Add a snapshot test of both outputs on the Task 2 fixture.

**Acceptance criteria:**
- [x] Rep statements:
  - [x] `sufficient` if `(rat>z90 && pat>z90) || (rdt>z90 && pdt>z90)`.
  - [x] The side is agree if `rat > rdt`.
  - [x] The fallback is best-agree, then best.
  - [x] Otherwise: drop best-agree from `sufficient`, sort by `repness·repnessTest·pSuccess·pTest`, put best-agree first, take `pickMax`, then agrees before disagrees.
  - [x] Best-agree carries `bestAgree: true`.
- [x] Consensus: agree is the top `pickMax` by `pa·pat` where `pa>0.5 && pat>z90`; disagree works the same way with `pd` and `pdt`. It uses `all`, never the group tallies.
- [x] The fixture snapshot (`toMatchSnapshot`) is committed after a read-through: every group has statements, and each side looks plausible against the fixture's `group-votes`. We don't try to match Clojure's `repness` exactly.

**Verification:**
- [x] Tests pass: `pnpm test repness`. Beyond the snapshot, include small hand-built cases for:
  - [x] the best-agree fallback when nothing is sufficient;
  - [x] the cap of 5 pushing out the 5th sufficient statement when best-agree is present;
  - [x] ordering agrees before disagrees;
  - [x] a `modOut` statement never being selected;
  - [x] consensus with no groups at all (`groups: []`).
- [x] Build succeeds: `pnpm build`.

**Dependencies:** Tasks 1 and 2

**Files likely touched:** `src/shared/repness.ts`, `test/repness.test.ts`

**Estimated scope:** M

## Checkpoint: The library works
- [x] `pnpm test` passes, including the `below-100-ptpts` snapshot
- [x] Review with the human before wiring into the app

## Task 4: Vote tallies in `MathResult`

**Description:** `computeMath` adds `tallies: StatementTally[]` to `MathResult`:
- One entry for each statement with at least one vote, in ascending ID order.
- `all` is every voter.
- `groups[g]` is group `g`'s clustered members, and it's `[]` when `k === null`.

The DO's `fetch()` schedules the alarm right away if the stored math has no `tallies` (math saved before this change).

**Acceptance criteria:**
- [x] For the two-bloc test data, `groups[a].agree` and `groups[b].agree` match the votes, and an unclustered voter counts in `all` but in no group.
- [x] A statement nobody voted on has no entry; with no votes at all, `tallies` is `[]`.
- [x] A stored math value without `tallies` gets recomputed when the next socket connects. (Checked by saving math without tallies, then reconnecting: a `math` message with tallies follows the snapshot, and the next connect doesn't recompute again.)

**Verification:**
- [x] Tests pass: `pnpm test math`.
- [x] Build succeeds: `pnpm build`.
- [x] Manual check: `pnpm dev`, vote, and see `tallies` in the `math` message in DevTools → Network → WS.

**Dependencies:** Task 1 (types)

**Files likely touched:** `src/worker/math.ts`, `src/shared/types.ts`, `src/worker/conversation.ts`, `test/math.test.ts`

**Estimated scope:** S

## Task 5: `GET /statements` and a hook to load the texts

**Description:**
- Add the route: `GET /api/:convoId/statements` → `Statement[]` (id and text, by ascending ID), backed by a `listStatements()` RPC method on the DO.
- Add a `useStatements(base, count)` hook that fetches the list when the page loads and again whenever `counts.statements` goes up.

**Acceptance criteria:**
- [x] The route returns every statement, imported or local, and `[]` for a new conversation.
- [x] Adding a statement in another tab updates the list without a reload. (Checked in Task 6.)
- [x] It runs after `/me`, like the other requests, so it doesn't create a second identity.

**Verification:**
- [x] Build succeeds: `pnpm build`.
- [x] Manual check: `curl localhost:5173/api/test/statements` returns the list, then add a statement in the UI and see the count-triggered refetch in DevTools.

**Dependencies:** None (can run in parallel with Tasks 1–4)

**Files likely touched:** `src/worker/index.ts`, `src/worker/conversation.ts`, `src/react-app/useStatements.ts`

**Estimated scope:** S

## Checkpoint: Data flows
- [x] `pnpm test` and `pnpm build` pass
- [x] `math` messages carry `tallies`; statement texts load and refresh

## Task 6: Statement explorer below the scatter plot

**Description:** Add a `StatementExplorer` component below `<Scatter>` in `Participant.tsx`. It runs `selectConsensusStatements` and `selectRepStatements` on `math.tallies` in a `useMemo`, and lists:
- **Consensus**, split into agree and disagree. This appears as soon as any statement qualifies, with or without groups.
- **Each group's representative statements**, only when `k !== null`. Each group gets a heading with its letter and color, matching the scatter plot (`groupLetter`, `var(--group-n)`).

Each row shows the statement text, and "n of m agreed" or "disagreed" (`nSuccess` / `nTrials`).

**Acceptance criteria:**
- [x] With votes but no groups, only consensus shows, or an "not enough agreement yet" note if nothing qualifies.
- [x] With groups, each group lists at most 5 statements, marked agree or disagree. Best-agree needs no special mark yet.
- [x] Text for statement IDs the hook hasn't loaded yet falls back to "Statement {id}", with no crash.
- [x] It works at phone width, and the group heading isn't shown by color alone (it has the letter).

**Verification:**
- [x] Build succeeds: `pnpm build`.
- [x] Manual check: import a Polis export on `/:convoId/admin` and see consensus and per-group lists. In a fresh conversation, vote from two browsers and see consensus appear before any groups.

**Dependencies:** Tasks 3, 4, 5

**Files likely touched:** `src/react-app/StatementExplorer.tsx`, `src/react-app/Participant.tsx`, `src/react-app/Scatter.tsx` (export `groupLetter`), `src/react-app/style.css`

**Estimated scope:** M

## Task 7: Update PLAN.md and README

**Description:**
- Update PLAN.md: add `tallies` to the `MathResult` sketch, add the `/statements` route and `src/shared/repness.ts` to the Files list, write a short "Representative and consensus statements" section, and remove the repness/consensus item from "Later". Record the inconsistencies found in the other implementations (reddwarf-ts, osccai, red-dwarf) as notes for extracting `red-dwarf-ts`.
- Add a line and screenshot to the README if the UI changed visibly.

**Acceptance criteria:**
- [x] PLAN.md describes what's built, not what was planned, and cites the Clojure functions.
- [x] Screenshots follow the README's table convention.

**Verification:**
- [x] Manual check: read it through; the links and paths resolve.

**Dependencies:** Task 6

**Files likely touched:** `PLAN.md`, `README.md`, `docs/*.png`

**Estimated scope:** S

## Checkpoint: Complete
- [x] All acceptance criteria met; `pnpm test` and `pnpm build` pass
- [x] Ready for review
