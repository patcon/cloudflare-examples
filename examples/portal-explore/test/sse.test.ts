import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isBlocked, readChunk, splitEvents } from "../src/server/explore/sse";

const fixture = readFileSync(`${import.meta.dirname}/fixtures/stream.txt`, "utf8");

/** Feeds the text through in pieces of `size` characters, as a network might. */
function readAll(text: string, size: number) {
  let buffer = "";
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    const { events, rest } = splitEvents(buffer + text.slice(i, i + size));
    buffer = rest;
    chunks.push(...events.map(readChunk));
  }
  return { chunks, rest: buffer };
}

describe("reading the stream", () => {
  it("joins text across events", () => {
    const { chunks, rest } = readAll(fixture, fixture.length);
    expect(chunks.map((c) => c.text).join("")).toBe(
      "It sounds like we keep coming back to housing.",
    );
    expect(chunks.at(-1)?.finishReason).toBe("STOP");
    expect(rest).toBe("");
  });

  it("gives the same text when events are split across network chunks", () => {
    for (const size of [1, 7, 64]) {
      expect(
        readAll(fixture, size)
          .chunks.map((c) => c.text)
          .join(""),
      ).toBe("It sounds like we keep coming back to housing.");
    }
  });

  it("skips thinking", () => {
    const chunk = readChunk(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: "Let me think.", thought: true }, { text: "Answer." }] } },
        ],
      }),
    );
    expect(chunk.text).toBe("Answer.");
  });
});

describe("isBlocked", () => {
  it("catches a blocked prompt, with no candidates", () => {
    const chunk = readChunk(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }));
    expect(chunk.text).toBe("");
    expect(isBlocked(chunk)).toBe(true);
  });

  it("catches an answer stopped for safety", () => {
    const chunk = readChunk(
      JSON.stringify({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] }),
    );
    expect(isBlocked(chunk)).toBe(true);
  });

  it("lets a normal finish through", () => {
    expect(isBlocked(readChunk(JSON.stringify({ candidates: [{ finishReason: "STOP" }] })))).toBe(
      false,
    );
  });
});
