import { Liquid } from "liquidjs";
import generateTemplate from "../prompts/generate_artifact.en.jinja?raw";
import reviseTemplate from "../prompts/revise_artifact.en.jinja?raw";

/**
 * The Verify prompts, ported from the dembrane portal's
 * `platform/packages/verify/src/service.ts`. Its `generate_artifact` and
 * `revise_artifact` templates are copied as they are, in English only.
 *
 * They're rendered with LiquidJS, whose `{{ }}` and `{% if %}` match the
 * Jinja these templates use. Nunjucks, which the original uses, compiles
 * templates with `new Function`, which Workers don't allow.
 */

/** A system prompt for Gemini, and the one user message that goes with it. */
export interface Prompt {
  system: string;
  user: string;
}

/** An earlier outcome of the session, as the generate prompt lists it. */
export interface EarlierOutcome {
  /** When it was made, in milliseconds since the epoch. */
  createdAt: number;
  topicKey: string;
  content: string;
}

// No HTML escaping, as Jinja doesn't escape .jinja files: transcripts
// go in as written.
const liquid = new Liquid();

/** Parses a template once, and renders it as Jinja would. */
function template(source: string) {
  const parsed = liquid.parse(source);
  // Jinja drops one trailing newline from each template.
  return (vars: Record<string, unknown> = {}) => liquid.renderSync(parsed, vars).replace(/\n$/, "");
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
): Prompt {
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
export function revisePrompt(transcript: string, outcome: string, feedback: string): Prompt {
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
