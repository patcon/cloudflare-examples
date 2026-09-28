# Fixture: a small real Polis conversation

A trimmed copy of red-dwarf's [`tests/fixtures/below-100-ptpts`](https://github.com/polis-community/red-dwarf/tree/944f99fc96d1648f0b3bb93a9e7dc5444b11cd07/tests/fixtures/below-100-ptpts), from [polis-community/red-dwarf](https://github.com/polis-community/red-dwarf) (MPL-2.0).

It's Polis conversation `4cvkai2ctw`, "Improving the Polis Software": 35 voters, 44 statements, 504 votes. Polis's math clustered 23 of the voters into 3 groups.

`fixture.json` has:

- `votes`: `[pid, tid, vote]`, from `votes.json`. **1 = agree**, −1 = disagree, 0 = pass, the same as this app. There's one vote per participant and statement.
- `groups`: the participant IDs in each of Polis's groups, from `math-pca2.json`, with its `group-clusters` unfolded through `base-clusters`.
- `groupVotes`: Polis's own per-group counts, `{ tid: [agree, disagree, seen] }` for each group, from `group-votes`.
- `modOut`: the statements moderated out, from `mod-out`.

The tests use the groups as given, so they check the statement selection without depending on our clustering.
