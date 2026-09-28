import { describe, expect, it } from "vitest";
import type { Vote } from "../src/shared/types";
import { computeMath, type VoteRow } from "../src/worker/math";

const NOW = 1_700_000_000_000;
const statementIds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const groupOf = (result: ReturnType<typeof computeMath>, id: string) =>
  result.participants.find((p) => p.id === id)?.group;

describe("computeMath", () => {
  it("returns no groups when nobody has voted", () => {
    const result = computeMath([], statementIds(3), NOW);

    expect(result).toEqual({ computedAt: NOW, k: null, silhouettes: {}, participants: [], groups: [], tallies: [] });
  });

  it("finds two groups for two opposed voting blocs", () => {
    // Bloc a agrees with 1–3 and disagrees with 4–6; bloc b the opposite.
    // Each member passes on a different statement, so the points aren't all
    // identical.
    const votes: VoteRow[] = [];
    for (let i = 0; i < 5; i++) {
      for (const s of statementIds(6)) {
        const aVote = s === i + 1 ? 0 : s <= 3 ? 1 : -1;
        const bVote = s === ((i + 1) % 6) + 1 ? 0 : s <= 3 ? -1 : 1;
        votes.push({ participantId: `a${i}`, statementId: s, vote: aVote });
        votes.push({ participantId: `b${i}`, statementId: s, vote: bVote });
      }
    }

    const result = computeMath(votes, statementIds(6), NOW);

    expect(result.k).toBe(2);
    const aGroup = groupOf(result, "a0");
    const bGroup = groupOf(result, "b0");
    expect(aGroup).not.toBeNull();
    expect(bGroup).not.toBeNull();
    expect(aGroup).not.toBe(bGroup);
    for (let i = 0; i < 5; i++) {
      expect(groupOf(result, `a${i}`)).toBe(aGroup);
      expect(groupOf(result, `b${i}`)).toBe(bGroup);
    }
    expect(result.groups.map((g) => g.members).sort()).toEqual([5, 5]);
  });

  it("plots everyone who voted, with a vote count for each", () => {
    const votes: VoteRow[] = [
      { participantId: "p", statementId: 1, vote: 1 },
      { participantId: "p", statementId: 2, vote: -1 },
      { participantId: "q", statementId: 1, vote: 0 },
    ];

    const result = computeMath(votes, statementIds(2), NOW);

    expect(result.participants.map((p) => [p.id, p.nVotes])).toEqual([
      ["p", 2],
      ["q", 1],
    ]);
  });

  it("clusters everyone with at least 7 votes, topped up with the most active voters to 15", () => {
    // 10 statements. 5 heavy voters (10 votes each) and 15 light voters with
    // 1–6 votes each. Votes vary by participant so the points are distinct.
    const votes: VoteRow[] = [];
    const lightVotes = new Map<string, number>();
    for (let i = 0; i < 5; i++) {
      for (const s of statementIds(10)) {
        votes.push({ participantId: `heavy${i}`, statementId: s, vote: (s + i) % 3 === 0 ? -1 : 1 });
      }
    }
    for (let i = 0; i < 15; i++) {
      const n = 1 + (i % 6);
      lightVotes.set(`light${i}`, n);
      for (const s of statementIds(n)) {
        votes.push({ participantId: `light${i}`, statementId: s, vote: (s * i) % 2 === 0 ? 1 : -1 });
      }
    }

    const result = computeMath(votes, statementIds(10), NOW);

    expect(result.k).not.toBeNull();
    const clustered = result.participants.filter((p) => p.group !== null).map((p) => p.id);
    expect(clustered).toHaveLength(15);
    for (let i = 0; i < 5; i++) expect(clustered).toContain(`heavy${i}`);
    // The top-up takes the most active light voters first.
    for (const [id, n] of lightVotes) {
      if (n >= 3) expect(clustered).toContain(id);
      if (n === 1) expect(clustered).not.toContain(id);
    }
  });

  it("doesn't top up when 15 or more people have enough votes", () => {
    const votes: VoteRow[] = [];
    for (let i = 0; i < 16; i++) {
      for (const s of statementIds(8)) {
        votes.push({ participantId: `heavy${i}`, statementId: s, vote: (s + i) % 3 === 0 ? -1 : 1 });
      }
    }
    for (let i = 0; i < 3; i++) {
      votes.push({ participantId: `light${i}`, statementId: 1, vote: 1 });
    }

    const result = computeMath(votes, statementIds(8), NOW);

    expect(result.k).not.toBeNull();
    for (let i = 0; i < 16; i++) expect(groupOf(result, `heavy${i}`)).not.toBeNull();
    for (let i = 0; i < 3; i++) expect(groupOf(result, `light${i}`)).toBeNull();
  });

  it("tallies each statement for everyone, and for each group's members only", () => {
    // 16 clustered voters on statements 1–8, 3 unclustered ones who agree
    // with statement 1, and a statement 9 nobody voted on.
    const votes: VoteRow[] = [];
    for (let i = 0; i < 16; i++) {
      for (const s of statementIds(8)) {
        votes.push({ participantId: `heavy${i}`, statementId: s, vote: (s + i) % 3 === 0 ? -1 : 1 });
      }
    }
    for (let i = 0; i < 3; i++) votes.push({ participantId: `light${i}`, statementId: 1, vote: 1 });

    const result = computeMath(votes, statementIds(9), NOW);

    expect(result.tallies.map((t) => t.statementId)).toEqual(statementIds(8));
    const first = result.tallies[0];
    const heavyAgrees = votes.filter((v) => v.statementId === 1 && v.vote === 1 && v.participantId.startsWith("heavy")).length;
    expect(first.all).toEqual({ agree: heavyAgrees + 3, disagree: 16 - heavyAgrees, seen: 19 });
    expect(first.groups).toHaveLength(result.groups.length);
    expect(first.groups.reduce((a, g) => a + g.seen, 0)).toBe(16);
    // Each group's count matches its members' votes.
    result.groups.forEach(({ id }, g) => {
      const members = result.participants.filter((p) => p.group === id).map((p) => p.id);
      const agrees = votes.filter((v) => v.statementId === 1 && v.vote === 1 && members.includes(v.participantId)).length;
      expect(first.groups[g].agree).toBe(agrees);
    });
  });

  it("tallies everyone, with no groups, when there are too few to cluster", () => {
    const votes: VoteRow[] = [
      { participantId: "p", statementId: 1, vote: 1 },
      { participantId: "q", statementId: 1, vote: 0 },
    ];

    const result = computeMath(votes, statementIds(2), NOW);

    expect(result.k).toBeNull();
    expect(result.tallies).toEqual([{ statementId: 1, all: { agree: 1, disagree: 0, seen: 2 }, groups: [] }]);
  });

  it("pushes sparse voters out from the center", () => {
    // Two sparse voters agree with statement 1. `two` also passes on
    // statement 2, whose average vote is 0, so their unscaled projections
    // match, and only the scaling √(statements / votes) differs.
    const votes: VoteRow[] = [];
    for (let i = 0; i < 6; i++) {
      for (const s of statementIds(10)) {
        const vote = s === 2 ? (i % 2 === 0 ? 1 : -1) : i < 3 === s <= 5 ? 1 : -1;
        votes.push({ participantId: `full${i}`, statementId: s, vote });
      }
    }
    votes.push({ participantId: "one", statementId: 1, vote: 1 });
    votes.push({ participantId: "two", statementId: 1, vote: 1 });
    votes.push({ participantId: "two", statementId: 2, vote: 0 });

    const result = computeMath(votes, statementIds(10), NOW);

    const distance = (id: string) => {
      const p = result.participants.find((p) => p.id === id)!;
      return Math.hypot(p.x, p.y);
    };
    expect(distance("two")).toBeGreaterThan(0);
    expect(distance("one") / distance("two")).toBeCloseTo(Math.SQRT2, 6);
  });

  it("gives the same result whatever order the votes come in", () => {
    const votes: VoteRow[] = [];
    for (let i = 0; i < 12; i++) {
      for (const s of statementIds(5)) {
        if ((i + s) % 4 !== 0) votes.push({ participantId: `p${i}`, statementId: s, vote: (((i * s) % 3) - 1) as Vote });
      }
    }
    const reversed = [...votes].reverse();
    const shuffled = [...votes].sort((a, b) => ((a.statementId * 7 + a.participantId.length) % 5) - ((b.statementId * 7 + b.participantId.length) % 5));

    const result = computeMath(votes, statementIds(5), NOW);

    expect(computeMath(reversed, statementIds(5), NOW)).toEqual(result);
    expect(computeMath(shuffled, statementIds(5), NOW)).toEqual(result);
  });
});
