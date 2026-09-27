// Types shared by the Worker and the React app.

// 1 = agree, -1 = disagree, 0 = pass, as in Polis's votes.csv.
export type Vote = -1 | 0 | 1;

export type Statement = { id: number; text: string };

export type Me = { participantId: string };

// How many rows a Polis import brought in.
export type ImportResult = { statements: number; participants: number; votes: number };

export type Counts = { statements: number; participants: number; votes: number };

// The latest opinion groups, recomputed by the DO's alarm.
export type MathResult = {
  computedAt: number;
  k: number | null; // null when too few participants to cluster
  silhouettes: Record<number, number>; // silhouette for each k tried, for debugging
  participants: { id: string; x: number; y: number; group: number | null; nVotes: number }[];
  groups: { id: number; center: [number, number]; members: number }[];
};

// Sent by the DO over the WebSocket. Clients never send anything: all writes
// go through HTTP.
export type ServerMessage =
  | { type: "snapshot"; counts: Counts; math: MathResult | null }
  | { type: "counts"; counts: Counts }
  | { type: "math"; math: MathResult };
