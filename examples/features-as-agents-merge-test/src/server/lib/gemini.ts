import { resolveAccessToken, vertexHost, type VertexOptions } from "@cloudflare/voice-gemini";
import { isBlocked, readChunk, splitEvents } from "./sse";

/** A failed Vertex call, with its HTTP status. */
export class VertexError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Gemini held its answer back on content grounds, before sending any text. */
export class BlockedError extends Error {
  constructor(readonly reason: string) {
    super(`The model didn't answer, on content grounds (${reason})`);
  }
}

/**
 * Rate limits and server errors are worth retrying. A bad token isn't.
 * Reads `status` from a `VertexError` or the batch transcriber's
 * `VoiceProviderError`.
 */
export function isRetryable(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  return typeof status === "number" && (status === 429 || status >= 500);
}

/** A system prompt for Gemini, and the one user message that goes with it. */
export interface Prompt {
  system?: string;
  user: string;
}

/**
 * Calls a model method. The examples this one merges used Vertex's `v1` API
 * to stream text, and `v1beta1` for JSON, so each call names its version.
 */
async function post(
  vertex: VertexOptions & { model: string },
  version: "v1" | "v1beta1",
  method: string,
  body: object,
  signal?: AbortSignal,
) {
  const location = vertex.location ?? "global";
  const url = `https://${vertexHost(location)}/${version}/projects/${vertex.project}/locations/${location}/publishers/google/models/${vertex.model}:${method}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await resolveAccessToken(vertex.accessToken, "Gemini")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    // Vertex puts the reason, such as an expired token, in the body.
    throw new VertexError(`The model failed (${resp.status}): ${await resp.text()}`, resp.status);
  }
  return resp;
}

/** The request body for a prompt. A system prompt goes in `systemInstruction`. */
function contents(prompt: Prompt) {
  return {
    ...(prompt.system && { systemInstruction: { parts: [{ text: prompt.system }] } }),
    contents: [{ role: "user", parts: [{ text: prompt.user }] }],
  };
}

/**
 * Streams Gemini's answer to the prompt, one piece of text at a time, from
 * `streamGenerateContent`. Pieces come a few times a second.
 */
export async function* streamText(
  vertex: VertexOptions & { model: string },
  prompt: Prompt,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const resp = await post(vertex, "v1", "streamGenerateContent?alt=sse", contents(prompt), signal);
  if (!resp.body) throw new VertexError("The model sent no body", resp.status);

  let buffer = "";
  let sent = false;
  for await (const piece of resp.body.pipeThrough(new TextDecoderStream())) {
    const { events, rest } = splitEvents(buffer + piece);
    buffer = rest;
    for (const data of events) {
      const chunk = readChunk(data);
      if (chunk.text) {
        sent = true;
        yield chunk.text;
      }
      if (!sent && isBlocked(chunk)) {
        throw new BlockedError(chunk.blockReason ?? chunk.finishReason ?? "unknown");
      }
    }
  }
}

/**
 * Asks Gemini for JSON in the shape of `schema`, an OpenAPI subset, from
 * `generateContent`, and returns it parsed.
 */
export async function generateJson(
  vertex: VertexOptions & { model: string },
  prompt: Prompt,
  schema: object,
): Promise<unknown> {
  const resp = await post(vertex, "v1beta1", "generateContent", {
    ...contents(prompt),
    generationConfig: { responseMimeType: "application/json", responseSchema: schema },
  });
  const body = (await resp.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return JSON.parse(body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "");
}
