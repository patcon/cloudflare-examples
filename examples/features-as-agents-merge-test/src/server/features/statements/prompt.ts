import type { Pass } from "./types";

/** Saved with each statement, so you can compare prompts later. */
export const PROMPT_VERSION = 2;

export interface PromptInput {
  /** The project's description, from its general settings, as Explore's prompt has it. */
  project: string;
  /** Statements the project already has, approved or waiting for review. */
  existing: string[];
  /** What was said just before, for context only. */
  context: string;
  /** The stretch to pull statements from. */
  transcript: string;
  pass: Pass;
}

const SYSTEM = `You help run a Polis conversation. Polis shows people short statements one at a time, and each person votes agree, disagree or pass. The votes map where a group agrees and where it splits, so the statements are what matter most.

You read a transcript of a group talking in person, and pull out statements of belief that the people in the room, and people like them, could vote on.

A good statement:
- States one idea. No "and", "but" or "because" joining two claims.
- Stands alone. Someone who never heard the conversation understands it.
- Is something reasonable people could agree OR disagree with. Not a plain fact, not something everyone accepts, not a question.
- Is a belief, value, priority or proposal that someone in the conversation expressed or clearly implied. Don't invent positions nobody took.
- Is short: under 140 characters. Plain words, as the speakers would say them, in their language.
- Is a plain declarative sentence, without "I think" or "Speaker 1 says".
- Names no one and gives no detail that could identify a person.

Prefer statements that are likely to split the room, or that capture a view the existing statements miss. Leave out small talk, logistics and asides. Returning no statements is a good answer when nothing in the stretch qualifies. Return at most 8.

For each statement, give:
- quote: the words in the transcript it rests on, copied exactly
- rationale: one short sentence on why it's worth voting on
- clarity, divisiveness, novelty: 1 to 5, where novelty is compared with the existing statements`;

const FINAL = `This is the whole conversation, with speakers told apart, transcribed after it ended. Look especially for views that only become clear across the whole conversation, or that several speakers circled around.`;

/** The system instruction and the user turn for one extraction. */
export function buildPrompt(input: PromptInput): { system: string; user: string } {
  const sections = [
    input.project && `About the project:\n${input.project}`,
    `Statements the conversation already has (don't repeat these, or say the same thing in other words):\n${
      input.existing.length ? input.existing.map((s) => `- ${s}`).join("\n") : "(none yet)"
    }`,
    input.context &&
      `What was said just before (context only, don't take statements from it):\n${input.context}`,
    `Transcript to take statements from:\n${input.transcript}`,
  ];
  return {
    system: input.pass === "final" ? `${SYSTEM}\n\n${FINAL}` : SYSTEM,
    user: sections.filter(Boolean).join("\n\n"),
  };
}

/** Vertex's `responseSchema`, an OpenAPI subset. */
export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    statements: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          text: { type: "STRING" },
          quote: { type: "STRING" },
          rationale: { type: "STRING" },
          clarity: { type: "INTEGER" },
          divisiveness: { type: "INTEGER" },
          novelty: { type: "INTEGER" },
        },
        required: ["text", "quote", "rationale", "clarity", "divisiveness", "novelty"],
        propertyOrdering: ["text", "quote", "rationale", "clarity", "divisiveness", "novelty"],
      },
    },
  },
  required: ["statements"],
};
