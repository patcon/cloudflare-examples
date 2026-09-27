// Types shared by the Worker and the React app.

// 1 = agree, -1 = disagree, 0 = pass, as in Polis's votes.csv.
export type Vote = -1 | 0 | 1;

export type Statement = { id: number; text: string };

export type Me = { participantId: string };
