import { describe, expect, it } from "vitest";
import { generatePrompt, revisePrompt } from "./prompt";

const TOPIC = "List what we agreed on, as short bullet points.";
const earlier = [{ createdAt: Date.UTC(2026, 9, 4, 12), topicKey: "agreements", content: "# Old" }];

describe("generatePrompt", () => {
  it("puts the topic prompt in the system prompt, and the rest in the user message", () => {
    expect(generatePrompt(TOPIC, "demo", earlier, "we agreed\nthen we left")).toMatchSnapshot();
  });

  it("says when there's nothing earlier and no transcript", () => {
    const { user } = generatePrompt(TOPIC, "demo", [], "");
    expect(user).toContain("Previous artifacts: None\n");
    expect(user).toContain("Conversation transcript:\nNo transcript available.");
  });
});

describe("revisePrompt", () => {
  it("puts the transcript, outcome and feedback in the system prompt", () => {
    expect(revisePrompt("we agreed", "# Outcome", "[t] add the date")).toMatchSnapshot();
  });
});

describe("rendering", () => {
  const odd = "we said <b>this</b> & {{ that }} {% if x %}";

  it("doesn't escape or re-read what goes in", () => {
    expect(generatePrompt(odd, "demo", [], odd).system).toContain(odd);
    expect(generatePrompt(odd, "demo", [], odd).user).toContain(odd);
    const { system } = revisePrompt(odd, odd, odd);
    expect(system.split(odd)).toHaveLength(4);
  });

  it("leaves no template syntax, and drops the personal-details block", () => {
    for (const { system } of [
      generatePrompt(TOPIC, "demo", [], "x"),
      revisePrompt("x", "y", "z"),
    ]) {
      expect(system).not.toMatch(/\{\{|\{%/);
      expect(system).not.toContain("PII");
      expect(system).toContain("MUST be written in English");
    }
  });
});
