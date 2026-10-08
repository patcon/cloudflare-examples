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

/** Gemini held the reply back on content grounds, before sending any text. */
export class ReplyBlockedError extends Error {
  constructor(readonly reason: string) {
    super(`Gemini didn't reply, on content grounds (${reason})`);
  }
}

/**
 * Streams Gemini's answer to the prompt, one piece of text at a time, from
 * `streamGenerateContent`. Pieces come a few times a second. A system
 * prompt goes in `systemInstruction`, as the AI SDK sends `system` in the
 * original.
 */
export async function* streamText(
  vertex: VertexOptions & { model: string },
  prompt: { system?: string; user: string },
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const location = vertex.location ?? "global";
  const url = `https://${vertexHost(location)}/v1/projects/${vertex.project}/locations/${location}/publishers/google/models/${vertex.model}:streamGenerateContent?alt=sse`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await resolveAccessToken(vertex.accessToken, "Gemini")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...(prompt.system && { systemInstruction: { parts: [{ text: prompt.system }] } }),
      contents: [{ role: "user", parts: [{ text: prompt.user }] }],
    }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    // Vertex puts the reason, such as an expired token, in the body.
    throw new VertexError(`Reply failed (${resp.status}): ${await resp.text()}`, resp.status);
  }

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
        throw new ReplyBlockedError(chunk.blockReason ?? chunk.finishReason ?? "unknown");
      }
    }
  }
}
