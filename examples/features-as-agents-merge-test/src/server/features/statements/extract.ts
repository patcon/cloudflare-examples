import type { VertexOptions } from "@cloudflare/voice-gemini";
import { generateJson } from "../../lib/gemini";
import { parseProposed } from "./parse";
import { buildPrompt, RESPONSE_SCHEMA, type PromptInput } from "./prompt";
import type { Proposed } from "./types";

/** Asks a Gemini text model for statements, as JSON. */
export async function extractStatements(
  vertex: VertexOptions & { model: string },
  input: PromptInput,
): Promise<Proposed[]> {
  return parseProposed(await generateJson(vertex, buildPrompt(input), RESPONSE_SCHEMA));
}
