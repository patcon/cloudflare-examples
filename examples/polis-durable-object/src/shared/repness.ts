// Polis's representative statements (for each opinion group) and consensus
// statements (across everyone), from vote tallies. Follows the Clojure math
// (math/src/polismath/math/repness.clj and stats.clj) without chasing its
// edge cases, such as float32 rounding and tie order by vote arrival. Ties
// here go in the order the tallies are given.
//
// No imports, so it runs in the browser or the Worker, and could become its
// own library.

// 1 = agree, -1 = disagree, 0 = pass. `seen` counts passes too.
export type Tally = { agree: number; disagree: number; seen: number };

// groups[g] counts only group g's members; `all` counts every participant who
// voted, clustered or not.
export type StatementTally = { statementId: number; all: Tally; groups: Tally[] };

export type RepStatement = {
  statementId: number;
  repfulFor: "agree" | "disagree";
  nSuccess: number; // agrees or disagrees in the group, per repfulFor
  nTrials: number; // votes seen in the group, passes included
  pSuccess: number;
  pTest: number;
  repness: number; // how many times likelier than the other groups
  repnessTest: number;
  bestAgree?: true; // the statement picked so every group shows something it agrees on
};

export type ConsensusStatement = {
  statementId: number;
  nSuccess: number;
  nTrials: number;
  pSuccess: number;
  pTest: number;
};

export type SelectOptions = { modOut?: number[]; pickMax?: number };

// Counts per statement for everyone and for each group. `groupOf` maps a
// participant to their group, 0 to groupCount − 1, or to nothing if they
// weren't clustered. Statements with no votes are left out, like the columns
// of Polis's rating matrix, and the rest are in ascending ID order.
export function tallyVotes(
  votes: { participantId: string; statementId: number; vote: number }[],
  groupOf: (participantId: string) => number | null | undefined,
  groupCount: number,
): StatementTally[] {
  const byStatement = new Map<number, StatementTally>();
  for (const { participantId, statementId, vote } of votes) {
    let tally = byStatement.get(statementId);
    if (!tally) {
      tally = { statementId, all: emptyTally(), groups: Array.from({ length: groupCount }, emptyTally) };
      byStatement.set(statementId, tally);
    }
    count(tally.all, vote);
    const group = groupOf(participantId);
    if (group !== null && group !== undefined) count(tally.groups[group], vote);
  }
  return [...byStatement.values()].sort((a, b) => a.statementId - b.statementId);
}

// Up to pickMax statements for each group (select-rep-comments). A statement
// is sufficient if the group agrees (or disagrees) with it both more than
// half the time and more than the other groups, each at 90% confidence. The
// group's best agreed-on statement goes first; then the sufficient ones by
// repnessMetric; then agrees move before disagrees. If none is sufficient,
// the group gets just its best-agree, or failing that its most distinctive
// statement.
export function selectRepStatements(tallies: StatementTally[], { modOut = [], pickMax = 5 }: SelectOptions = {}) {
  const groupCount = tallies[0]?.groups.length ?? 0;
  const candidates = tallies
    .filter((t) => !modOut.includes(t.statementId))
    .map((t) => ({ statementId: t.statementId, stats: comparativeStats(t.groups) }));

  return Array.from({ length: groupCount }, (_, g): RepStatement[] => {
    const sufficient: RepStatement[] = [];
    let best: RepStatement | null = null;
    let bestAgree: { statementId: number; stats: GroupStats } | null = null;

    for (const { statementId, stats } of candidates) {
      const s = stats[g];
      if (passesByTest(s)) sufficient.push(finalize(statementId, s));
      if (sufficient.length === 0 && (best === null || Math.max(s.rat, s.rdt) > best.repnessTest)) {
        best = finalize(statementId, s);
      }
      if (beatsBestAgree(s, bestAgree?.stats ?? null)) bestAgree = { statementId, stats: s };
    }

    const head: RepStatement[] = bestAgree
      ? [{ ...finalize(bestAgree.statementId, bestAgree.stats, true), bestAgree: true }]
      : [];
    if (sufficient.length === 0) return head.length > 0 ? head : best ? [best] : [];
    const rest = sufficient
      .filter((r) => r.statementId !== bestAgree?.statementId)
      .sort((a, b) => repnessMetric(b) - repnessMetric(a));
    const picked = [...head, ...rest].slice(0, pickMax);
    return [...picked.filter((r) => r.repfulFor === "agree"), ...picked.filter((r) => r.repfulFor === "disagree")];
  });
}

// Up to pickMax statements that more than half of everyone agrees with (or
// disagrees with) at 90% confidence, strongest first (select-consensus-comments).
// Uses every voter, not just the clustered ones, so it works before there
// are any groups.
export function selectConsensusStatements(tallies: StatementTally[], { modOut = [], pickMax = 5 }: SelectOptions = {}) {
  const stats = tallies
    .filter((t) => !modOut.includes(t.statementId))
    .map((t) => ({ statementId: t.statementId, s: statementStats(t.all) }));
  const top = (side: "agree" | "disagree"): ConsensusStatement[] =>
    stats
      .map(({ statementId, s }) =>
        side === "agree"
          ? { statementId, nSuccess: s.na, nTrials: s.ns, pSuccess: s.pa, pTest: s.pat }
          : { statementId, nSuccess: s.nd, nTrials: s.ns, pSuccess: s.pd, pTest: s.pdt },
      )
      .filter((c) => c.pSuccess > 0.5 && zSig90(c.pTest))
      .sort((a, b) => b.pSuccess * b.pTest - a.pSuccess * a.pTest)
      .slice(0, pickMax);
  return { agree: top("agree"), disagree: top("disagree") };
}

// The statistics (stats.clj, and comment-stats and add-comparitive-stats in
// repness.clj). Exported for testing and for anyone building on them.

// Significant at 90% confidence, one-tailed.
export const zSig90 = (z: number) => z > 1.2816;

// z-score for "more than half", with +1 smoothing on both counts.
export const propTest = (successes: number, n: number) => 2 * Math.sqrt(n + 1) * ((successes + 1) / (n + 1) - 0.5);

// z-score for "a bigger share in than out", with +1 smoothing on all four
// counts. 0 when every vote on both sides is a success.
export function twoPropTest(successesIn: number, successesOut: number, nIn: number, nOut: number): number {
  const [s1, s2, n1, n2] = [successesIn + 1, successesOut + 1, nIn + 1, nOut + 1];
  const pooled = (s1 + s2) / (n1 + n2);
  if (pooled === 1) return 0;
  return (s1 / n1 - s2 / n2) / Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
}

// n = count, p = probability, t = test, a = agree, d = disagree, s = seen.
export type Stats = { na: number; nd: number; ns: number; pa: number; pd: number; pat: number; pdt: number };
// r = representativeness: this group compared with the other groups.
export type GroupStats = Stats & { ra: number; rd: number; rat: number; rdt: number };

export function statementStats({ agree, disagree, seen }: Tally): Stats {
  return {
    na: agree,
    nd: disagree,
    ns: seen,
    pa: (agree + 1) / (seen + 2),
    pd: (disagree + 1) / (seen + 2),
    pat: propTest(agree, seen),
    pdt: propTest(disagree, seen),
  };
}

// Each group's stats for one statement, compared with the sum of the other
// groups (not with unclustered voters).
export function comparativeStats(groups: Tally[]): GroupStats[] {
  const total = groups.reduce(
    (sum, t) => ({ agree: sum.agree + t.agree, disagree: sum.disagree + t.disagree, seen: sum.seen + t.seen }),
    emptyTally(),
  );
  return groups.map((tally) => {
    const s = statementStats(tally);
    const rest = { agree: total.agree - tally.agree, disagree: total.disagree - tally.disagree, seen: total.seen - tally.seen };
    return {
      ...s,
      ra: s.pa / ((rest.agree + 1) / (rest.seen + 2)),
      rd: s.pd / ((rest.disagree + 1) / (rest.seen + 2)),
      rat: twoPropTest(tally.agree, rest.agree, tally.seen, rest.seen),
      rdt: twoPropTest(tally.disagree, rest.disagree, tally.seen, rest.seen),
    };
  });
}

const passesByTest = (s: GroupStats) => (zSig90(s.rat) && zSig90(s.pat)) || (zSig90(s.rdt) && zSig90(s.pdt));

// beats-best-agr?: prefers statements the group agrees with more than the
// others do, but settles for ones it just agrees with.
function beatsBestAgree(s: GroupStats, best: GroupStats | null): boolean {
  if (s.na === 0 && s.nd === 0) return false;
  if (best && best.ra > 1) return s.ra * s.rat * s.pa * s.pat > best.ra * best.rat * best.pa * best.pat;
  if (best) return s.pa * s.pat > best.pa * best.pat;
  return zSig90(s.pat) || (s.ra > 1 && s.pa > 0.5);
}

// finalize-cmt-stats: reports whichever side the group is more distinctive
// on. Unlike Clojure, the best-agree is always reported as an agree: when
// every group agrees, rat and rdt are both 0 and Clojure calls it a disagree
// ("0 of 10 disagreed").
function finalize(statementId: number, s: GroupStats, asAgree = false): RepStatement {
  const agree = asAgree || s.rat > s.rdt;
  return {
    statementId,
    repfulFor: agree ? "agree" : "disagree",
    nSuccess: agree ? s.na : s.nd,
    nTrials: s.ns,
    pSuccess: agree ? s.pa : s.pd,
    pTest: agree ? s.pat : s.pdt,
    repness: agree ? s.ra : s.rd,
    repnessTest: agree ? s.rat : s.rdt,
  };
}

const repnessMetric = (r: RepStatement) => r.repness * r.repnessTest * r.pSuccess * r.pTest;

const emptyTally = (): Tally => ({ agree: 0, disagree: 0, seen: 0 });

function count(tally: Tally, vote: number) {
  tally.seen++;
  if (vote === 1) tally.agree++;
  if (vote === -1) tally.disagree++;
}
