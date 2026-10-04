/**
 * Reads Vertex's `streamGenerateContent?alt=sse` responses: server-sent
 * events, each one `data:` line holding a `GenerateContentResponse`.
 * https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/projects.locations.endpoints/streamGenerateContent
 */

/** What one event adds to the reply. */
export interface ReplyChunk {
  /** Answer text, without any thinking. */
  text: string;
  /** Why Gemini stopped, on the last event, such as `STOP` or `SAFETY`. */
  finishReason: string | null;
  /** Set when the prompt itself was blocked, and no answer comes. */
  blockReason: string | null;
}

/**
 * Cuts complete events off the front of what's arrived so far. An event
 * split across network chunks stays in `rest` until its blank line comes.
 */
export function splitEvents(buffer: string): { events: string[]; rest: string } {
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  const events = blocks
    .map((block) =>
      block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n"),
    )
    .filter(Boolean);
  return { events, rest };
}

interface Response {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

/** One event's data. Parts marked `thought` are the model's thinking, so skipped. */
export function readChunk(data: string): ReplyChunk {
  const body = JSON.parse(data) as Response;
  const candidate = body.candidates?.[0];
  return {
    text:
      candidate?.content?.parts
        ?.filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("") ?? "",
    finishReason: candidate?.finishReason ?? null,
    blockReason: body.promptFeedback?.blockReason ?? null,
  };
}

/** Finish reasons that mean Gemini held the answer back on content grounds. */
const BLOCKED = new Set(["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "RECITATION"]);

export function isBlocked(chunk: ReplyChunk): boolean {
  return chunk.blockReason !== null || BLOCKED.has(chunk.finishReason ?? "");
}
