import { resolveAccessToken, vertexHost, type VertexOptions } from "@cloudflare/voice-gemini";
import { buildPrompt, RESPONSE_SCHEMA, type PromptInput } from "./prompt";
import { parseProposed } from "./parse";
import type { Proposed } from "./types";

/** A failed Vertex call, with its HTTP status to decide whether to retry. */
export class VertexError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }

  /** Rate limits and server errors are worth retrying. A bad token isn't. */
  get retryable() {
    return this.status === 429 || this.status >= 500;
  }
}

/** Asks a Gemini text model for statements, as JSON. */
export async function extractStatements(
  vertex: VertexOptions & { model: string },
  input: PromptInput
): Promise<Proposed[]> {
  const { system, user } = buildPrompt(input);
  const location = vertex.location ?? "global";
  const url = `https://${vertexHost(location)}/v1beta1/projects/${vertex.project}/locations/${location}/publishers/google/models/${vertex.model}:generateContent`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await resolveAccessToken(vertex.accessToken, "Gemini")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    })
  });
  if (!resp.ok) {
    // Vertex puts the reason, such as an expired token, in the body.
    throw new VertexError(`Extraction failed (${resp.status}): ${await resp.text()}`, resp.status);
  }
  const body = (await resp.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return parseProposed(JSON.parse(text));
}
