import type { Prompt } from "../../lib/gemini";
import { template } from "../../lib/liquid";
import generateTemplate from "./prompts/generate_outcome.en.jinja?raw";
import reviseTemplate from "./prompts/revise_outcome.en.jinja?raw";

/**
 * The Verify prompts, ported from the dembrane portal's
 * `platform/packages/verify/src/service.ts`. Its `generate_artifact` and
 * `revise_artifact` templates are copied as they are, in English only, as
 * `generate_outcome` and `revise_outcome`: this example calls an artifact
 * an outcome throughout.
 */

/** An earlier outcome of the session, as the generate prompt lists it. */
export interface EarlierOutcome {
  /** When it was made, in milliseconds since the epoch. */
  createdAt: number;
  topicKey: string;
  content: string;
}

const renderGenerate = template(generateTemplate);
const renderRevise = template(reviseTemplate);

/**
 * The original passes the project's language code, such as `en`. A name
 * reads better in "MUST be written in …", and this example is English only.
 * Removing personal details is out of scope here.
 */
const COMMON = { language: "English", pii_redaction: false };

/**
 * The prompt for a new outcome. The user message has the shape of the
 * original's, without the participant's name and email, which sessions
 * don't have, and with no audio, as every segment here is transcribed.
 */
export function generatePrompt(
  topicPrompt: string,
  projectName: string,
  earlier: readonly EarlierOutcome[],
  transcript: string,
): Required<Prompt> {
  const previous = earlier.length
    ? [
        "Previous artifacts:",
        ...earlier.map(
          (o) => `- [${new Date(o.createdAt).toISOString()}] (${o.topicKey}) ${o.content}`,
        ),
        "",
      ].join("\n")
    : "Previous artifacts: None\n";
  const user = [
    `Project: ${projectName}`,
    "",
    previous,
    "Conversation transcript:",
    transcript || "No transcript available.",
    "",
    "Audio attachments: None.",
  ].join("\n");
  return { system: renderGenerate({ ...COMMON, prompt: topicPrompt }), user };
}

/** The prompt to revise an outcome from the group's feedback. */
export function revisePrompt(
  transcript: string,
  outcome: string,
  feedback: string,
): Required<Prompt> {
  return {
    system: renderRevise({
      ...COMMON,
      transcript: transcript || "No transcript available.",
      outcome,
      feedback: feedback || "No textual feedback available.",
    }),
    user: "Please revise the outcome using the feedback provided. Audio clips accompany segments without transcripts.",
  };
}
