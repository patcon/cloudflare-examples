import { tallyVotes } from "../shared/repness";
import type { MathResult, Vote } from "../shared/types";

// A simplified port of Polis's Clojure math (math/src/polismath/math/): PCA
// for the 2D map, then k-means for the opinion groups, then vote tallies for
// each group. No base clusters and no k smoothing. Pure, with no dependencies, so it's easy to test and could
// move into a Workflow or Container later.

export type VoteRow = { participantId: string; statementId: number; vote: Vote };

type Point = [number, number];

const PCA_ITERATIONS = 100;
const KMEANS_ITERATIONS = 100;
const MIN_VOTES = 7;
const MIN_CLUSTERED = 15;
const K_RANGE = [2, 3, 4, 5];

export function computeMath(votes: VoteRow[], statementIds: number[], computedAt = Date.now()): MathResult {
  // 1. Rating matrix: participants × statements, null where they didn't vote.
  // Participants are sorted by ID, so the result doesn't depend on the order
  // the votes come in.
  const column = new Map(statementIds.map((id, j) => [id, j]));
  const ratings = new Map<string, (number | null)[]>();
  for (const { participantId, statementId, vote } of votes) {
    const j = column.get(statementId);
    if (j === undefined) continue;
    let row = ratings.get(participantId);
    if (!row) ratings.set(participantId, (row = new Array(statementIds.length).fill(null)));
    row[j] = vote;
  }
  const ids = [...ratings.keys()].sort();
  const rows = ids.map((id) => ratings.get(id)!);
  const nVotes = rows.map((row) => row.filter((v) => v !== null).length);

  if (ids.length === 0) return { computedAt, k: null, silhouettes: {}, participants: [], groups: [], tallies: [] };

  // 2. Each statement's average vote. Filling missing votes with it and then
  // centering (conversation.clj:352-377) leaves 0 wherever someone didn't vote.
  const center = statementIds.map((_, j) => mean(rows.map((row) => row[j]).filter((v) => v !== null)));
  const centered = rows.map((row) => row.map((v, j) => (v === null ? 0 : v - center[j])));

  // 3. The top 2 principal components (pca.clj).
  const components = topComponents(centered, 2);

  // 4. Project each participant using only the statements they voted on
  // (which the zeros above already do), scaled by √(statements / votes) so
  // sparse voters are pushed out from the center (pca.clj:134-158).
  const points: Point[] = centered.map((row, i) => {
    const scale = Math.sqrt(statementIds.length / Math.max(nVotes[i], 1));
    return [dot(row, components[0]) * scale, dot(row, components[1]) * scale];
  });

  // 5. Who gets clustered (conversation.clj:244-269): everyone with enough
  // votes, topped up with the most active voters to MIN_CLUSTERED.
  const clustered = chooseClustered(nVotes, Math.min(MIN_VOTES, statementIds.length));
  const clusteredPoints = clustered.map((i) => points[i]);

  // 6–7. k-means for each k, keeping the one with the best silhouette.
  const distinct = countDistinct(clusteredPoints);
  const silhouettes: Record<number, number> = {};
  let best: { k: number; assignment: number[]; centers: Point[]; score: number } | null = null;
  if (distinct >= 3) {
    for (const k of K_RANGE) {
      if (k >= distinct) break;
      const { assignment, centers } = kmeans(clusteredPoints, k);
      const score = silhouette(clusteredPoints, assignment, k);
      silhouettes[k] = score;
      if (!best || score > best.score) best = { k, assignment, centers, score };
    }
  }

  const group = new Array<number | null>(ids.length).fill(null);
  let groups: MathResult["groups"] = [];
  if (best) {
    // Drop any cluster that ended up empty, and number the rest from 0.
    const sizes = best.centers.map((_, c) => best.assignment.filter((a) => a === c).length);
    const renumber = new Map<number, number>();
    sizes.forEach((size, c) => size > 0 && renumber.set(c, renumber.size));
    clustered.forEach((i, n) => (group[i] = renumber.get(best.assignment[n])!));
    groups = [...renumber].map(([c, id]) => ({ id, center: best.centers[c], members: sizes[c] }));
  }

  // 8. Vote counts for each statement: everyone's, and each group's members'.
  const groupOf = new Map(ids.map((id, i) => [id, group[i]]));
  const tallies = tallyVotes(
    votes.filter((v) => column.has(v.statementId)),
    (id) => groupOf.get(id),
    groups.length,
  );

  return {
    computedAt,
    k: best ? groups.length : null,
    silhouettes,
    participants: ids.map((id, i) => ({ id, x: points[i][0], y: points[i][1], group: group[i], nVotes: nVotes[i] })),
    groups,
    tallies,
  };
}

// Power iteration with deflation: each component is kept orthogonal to the
// ones before it. Starts from a fixed vector, so results are deterministic.
// A component is all zeros if there's no variance left to explain.
function topComponents(matrix: number[][], count: number): number[][] {
  const width = matrix[0].length;
  const components: number[][] = [];
  for (let c = 0; c < count; c++) {
    let v = new Array(width).fill(1 / Math.sqrt(width || 1));
    for (let iter = 0; iter < PCA_ITERATIONS; iter++) {
      // v ← Xᵀ X v, minus its projection onto earlier components.
      const xv = matrix.map((row) => dot(row, v));
      let next = new Array(width).fill(0);
      matrix.forEach((row, i) => row.forEach((x, j) => (next[j] += x * xv[i])));
      for (const prev of components) next = subtract(next, scaled(prev, dot(next, prev)));
      const norm = Math.hypot(...next);
      if (norm < 1e-12) {
        v = new Array(width).fill(0);
        break;
      }
      v = scaled(next, 1 / norm);
    }
    // Fix the sign, which power iteration leaves arbitrary: the largest entry
    // is positive. Keeps the map from flipping between recomputes.
    const largest = v.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
    components.push(largest < 0 ? scaled(v, -1) : v);
  }
  return components;
}

function chooseClustered(nVotes: number[], minVotes: number): number[] {
  const eligible = nVotes.flatMap((n, i) => (n >= minVotes ? [i] : []));
  if (eligible.length >= MIN_CLUSTERED) return eligible;
  const rest = nVotes
    .flatMap((n, i) => (n < minVotes ? [i] : []))
    .sort((a, b) => nVotes[b] - nVotes[a] || a - b)
    .slice(0, MIN_CLUSTERED - eligible.length);
  return [...eligible, ...rest].sort((a, b) => a - b);
}

// Starts from the first k distinct points, as in clusters.clj:55-65.
function kmeans(points: Point[], k: number): { assignment: number[]; centers: Point[] } {
  const centers: Point[] = [];
  for (const p of points) {
    if (centers.length === k) break;
    if (!centers.some((c) => c[0] === p[0] && c[1] === p[1])) centers.push([p[0], p[1]]);
  }
  let assignment: number[] = [];
  for (let iter = 0; iter < KMEANS_ITERATIONS; iter++) {
    const next = points.map((p) => nearest(p, centers));
    const changed = next.some((c, i) => c !== assignment[i]);
    assignment = next;
    if (!changed) break;
    centers.forEach((_, c) => {
      const members = points.filter((_, i) => assignment[i] === c);
      if (members.length > 0) centers[c] = [mean(members.map((p) => p[0])), mean(members.map((p) => p[1]))];
    });
  }
  return { assignment, centers };
}

// Mean silhouette score, with Euclidean distance. A point alone in its
// cluster scores 0.
function silhouette(points: Point[], assignment: number[], k: number): number {
  const scores = points.map((p, i) => {
    const meanDistance = (c: number) => {
      const others = points.filter((_, j) => j !== i && assignment[j] === c);
      return others.length === 0 ? null : mean(others.map((q) => distance(p, q)));
    };
    const a = meanDistance(assignment[i]);
    if (a === null) return 0;
    const b = Math.min(
      ...Array.from({ length: k }, (_, c) => c)
        .filter((c) => c !== assignment[i])
        .map((c) => meanDistance(c) ?? Infinity),
    );
    const denominator = Math.max(a, b);
    return denominator === 0 || !Number.isFinite(b) ? 0 : (b - a) / denominator;
  });
  return mean(scores);
}

function nearest(p: Point, centers: Point[]): number {
  let best = 0;
  centers.forEach((c, i) => distance(p, c) < distance(p, centers[best]) && (best = i));
  return best;
}

const countDistinct = (points: Point[]) => new Set(points.map((p) => `${p[0]},${p[1]}`)).size;
const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const scaled = (v: number[], s: number) => v.map((x) => x * s);
const subtract = (a: number[], b: number[]) => a.map((x, i) => x - b[i]);
const distance = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);
