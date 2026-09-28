import { describe, expect, it } from "vitest";
import {
  comparativeStats,
  propTest,
  selectConsensusStatements,
  selectRepStatements,
  tallyVotes,
  twoPropTest,
  type StatementTally,
  type Tally,
} from "../src/shared/repness";
import fixture from "./fixtures/polis-below-100-ptpts/fixture.json";

const tally = (agree: number, disagree: number, seen: number): Tally => ({ agree, disagree, seen });
const statement = (statementId: number, groups: Tally[], all = sum(groups)): StatementTally => ({ statementId, all, groups });
const sum = (tallies: Tally[]) =>
  tallies.reduce((a, t) => tally(a.agree + t.agree, a.disagree + t.disagree, a.seen + t.seen), tally(0, 0, 0));

describe("statistics", () => {
  it("propTest smooths both counts by 1", () => {
    expect(propTest(0, 0)).toBe(1);
    expect(propTest(6, 6)).toBeCloseTo(Math.sqrt(7));
  });

  it("twoPropTest compares smoothed shares, and is 0 when every vote is a success", () => {
    expect(twoPropTest(6, 0, 6, 10)).toBeCloseTo((7 / 7 - 1 / 11) / Math.sqrt((8 / 18) * (10 / 18) * (1 / 7 + 1 / 11)));
    expect(twoPropTest(3, 3, 3, 3)).toBe(0);
  });

  it("compares each group with the sum of the other groups", () => {
    const [a, b] = comparativeStats([tally(6, 0, 6), tally(1, 2, 4)]);

    expect(a.pa).toBeCloseTo(7 / 8);
    expect(a.ra).toBeCloseTo(7 / 8 / (2 / 6));
    expect(a.rat).toBeCloseTo(twoPropTest(6, 1, 6, 4));
    expect(b.rd).toBeCloseTo(3 / 6 / (1 / 8));
  });

  it("compares a lone group with nobody, so its rest is the (0 + 1) / (0 + 2) prior", () => {
    const [only] = comparativeStats([tally(3, 1, 5)]);

    expect(only.ra).toBeCloseTo(only.pa / 0.5);
    expect(only.rat).toBeCloseTo(twoPropTest(3, 0, 5, 0));
  });
});

describe("tallyVotes", () => {
  it("counts passes as seen, and unclustered voters only in all", () => {
    const groupOf = (id: string) => ({ a: 0, b: 1 })[id] ?? null;
    const tallies = tallyVotes(
      [
        { participantId: "a", statementId: 2, vote: 1 },
        { participantId: "b", statementId: 2, vote: 0 },
        { participantId: "x", statementId: 2, vote: -1 },
        { participantId: "a", statementId: 1, vote: -1 },
      ],
      groupOf,
      2,
    );

    expect(tallies).toEqual([
      { statementId: 1, all: tally(0, 1, 1), groups: [tally(0, 1, 1), tally(0, 0, 0)] },
      { statementId: 2, all: tally(1, 1, 3), groups: [tally(1, 0, 1), tally(0, 0, 1)] },
    ]);
  });
});

describe("selectRepStatements", () => {
  it("falls back to the best-agree, or else the most distinctive statement, when nothing is significant", () => {
    // One vote each: group 0 agrees, group 1 passes.
    const [g0, g1] = selectRepStatements([statement(1, [tally(1, 0, 1), tally(0, 0, 1)])]);

    expect(g0).toMatchObject([{ statementId: 1, repfulFor: "agree", bestAgree: true }]);
    // Group 1's best has a repnessTest of exactly 0, which must still count.
    expect(g1).toMatchObject([{ statementId: 1, repfulFor: "disagree", nSuccess: 0, repnessTest: 0 }]);
    expect(g1[0].bestAgree).toBeUndefined();
  });

  // Group 0 disagrees with 1–5 while group 1 agrees; both agree with 6.
  const blocs = [
    ...[1, 2, 3, 4, 5].map((id) => statement(id, [tally(0, 10, 10), tally(10, 0, 10)])),
    statement(6, [tally(10, 0, 10), tally(10, 0, 10)]),
  ];

  it("puts the best-agree first, even if it pushes out a significant statement", () => {
    const [g0] = selectRepStatements(blocs);

    expect(g0).toHaveLength(5);
    expect(g0[0]).toMatchObject({ statementId: 6, repfulFor: "agree", bestAgree: true });
    expect(g0.slice(1).map((r) => [r.statementId, r.repfulFor])).toEqual([
      [1, "disagree"],
      [2, "disagree"],
      [3, "disagree"],
      [4, "disagree"],
    ]);
  });

  it("lists agrees before disagrees, even ones that score lower", () => {
    const [g0] = selectRepStatements([
      statement(1, [tally(0, 10, 10), tally(10, 0, 10)]), // group 0's strongest: a disagree
      statement(2, [tally(6, 0, 6), tally(0, 0, 6)]), // its best-agree
      statement(3, [tally(5, 0, 6), tally(0, 0, 6)]), // a weaker agree
    ]);

    expect(g0.map((r) => [r.statementId, r.repfulFor])).toEqual([
      [2, "agree"],
      [3, "agree"],
      [1, "disagree"],
    ]);
  });

  it("never picks a moderated-out statement", () => {
    const [g0] = selectRepStatements(blocs, { modOut: [6] });

    expect(g0.map((r) => r.statementId)).toEqual([1, 2, 3, 4, 5]);
    expect(g0.some((r) => r.bestAgree)).toBe(false);
  });

  it("returns nothing when there are no groups", () => {
    expect(selectRepStatements([statement(1, [], tally(5, 0, 5))])).toEqual([]);
  });
});

describe("selectConsensusStatements", () => {
  it("picks what more than half of everyone agrees or disagrees with, strongest first", () => {
    const tallies = [
      statement(1, [], tally(6, 0, 8)),
      statement(2, [], tally(9, 1, 10)),
      statement(3, [], tally(4, 4, 8)), // split: neither side
      statement(4, [], tally(3, 2, 5)), // a slim majority, not significant
      statement(5, [], tally(0, 7, 7)),
    ];

    const { agree, disagree } = selectConsensusStatements(tallies);

    expect(agree.map((c) => c.statementId)).toEqual([2, 1]);
    expect(agree[0]).toMatchObject({ nSuccess: 9, nTrials: 10, pSuccess: 10 / 12 });
    expect(disagree.map((c) => c.statementId)).toEqual([5]);
  });

  it("uses every voter, not the groups", () => {
    const { agree } = selectConsensusStatements([statement(1, [tally(0, 0, 0)], tally(8, 0, 8))]);

    expect(agree.map((c) => c.statementId)).toEqual([1]);
  });

  it("respects modOut and pickMax", () => {
    const tallies = [1, 2, 3].map((id) => statement(id, [], tally(10, 0, 10)));

    expect(selectConsensusStatements(tallies, { modOut: [1], pickMax: 1 }).agree.map((c) => c.statementId)).toEqual([2]);
  });
});

// A real Polis conversation, using Polis's own groups (see the fixture's README).
describe("the below-100-ptpts fixture", () => {
  const groupOf = new Map(fixture.groups.flatMap((members, g) => members.map((pid) => [String(pid), g])));
  const tallies = tallyVotes(
    fixture.votes.map(([pid, tid, vote]) => ({ participantId: String(pid), statementId: tid, vote })),
    (id) => groupOf.get(id),
    fixture.groups.length,
  );
  const groupVotes = fixture.groupVotes as Record<string, number[]>[];

  it("tallies the same group counts as Polis", () => {
    for (const t of tallies) {
      t.groups.forEach((g, i) => expect([g.agree, g.disagree, g.seen]).toEqual(groupVotes[i][t.statementId] ?? [0, 0, 0]));
    }
  });

  it("selects the same statements as last time", () => {
    const options = { modOut: fixture.modOut };

    expect({
      repness: selectRepStatements(tallies, options),
      consensus: selectConsensusStatements(tallies, options),
    }).toMatchSnapshot();
  });
});
