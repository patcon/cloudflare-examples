import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReplyBlockedError, streamText, VertexError } from "../src/server/verify/gemini";

/** A real response from gemini-3.5-flash, captured with curl. */
const fixture = readFileSync(`${import.meta.dirname}/fixtures/stream.txt`, "utf8");

const vertex = { accessToken: "token", project: "p", location: "global", model: "m" };

/** Stubs `fetch` with one response, and returns the stub to examine the request. */
function respond(body: string, status = 200) {
  const stub = vi.fn(async (_url: string, _init: RequestInit) => new Response(body, { status }));
  vi.stubGlobal("fetch", stub);
  return stub;
}

async function collect(prompt: { system?: string; user: string }) {
  let text = "";
  for await (const piece of streamText(vertex, prompt)) text += piece;
  return text;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamText", () => {
  it("sends the system prompt as systemInstruction, and the user message as contents", async () => {
    const stub = respond(fixture);
    const text = await collect({ system: "Be brief.", user: "Hello" });
    const [url, init] = stub.mock.calls[0];
    expect(url).toBe(
      "https://aiplatform.googleapis.com/v1/projects/p/locations/global/publishers/google/models/m:streamGenerateContent?alt=sse",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      systemInstruction: { parts: [{ text: "Be brief." }] },
      contents: [{ role: "user", parts: [{ text: "Hello" }] }],
    });
    expect(text).toMatch(/^It's clear this housing crisis/);
  });

  it("sends no systemInstruction without a system prompt", async () => {
    const stub = respond(fixture);
    await collect({ user: "Hello" });
    expect(JSON.parse(stub.mock.calls[0][1].body as string)).not.toHaveProperty(
      "systemInstruction",
    );
  });

  it("throws Vertex's reason on a failed call", async () => {
    respond('{"error": "token expired"}', 401);
    const error = await collect({ user: "Hello" }).catch((e) => e);
    expect(error).toBeInstanceOf(VertexError);
    expect(error.status).toBe(401);
    expect(error.message).toContain("token expired");
  });

  it("throws when the prompt is blocked", async () => {
    respond(`data: ${JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })}\n\n`);
    await expect(collect({ user: "Hello" })).rejects.toBeInstanceOf(ReplyBlockedError);
  });
});
