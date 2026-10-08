import { describe, expect, it } from "vitest";
import {
  BRAINSTORM_PROMPT,
  buildPrompt,
  globalPrompt,
  modeUsed,
  projectDescription,
  SUMMARIZE_PROMPT,
} from "./prompt";
import { DEFAULT_EXPLORE_SETTINGS as DEFAULT_SETTINGS } from "../../../shared/features/explore/settings";
import { DEFAULT_GENERAL_SETTINGS as NO_DETAILS } from "../../../shared/general";
import { formatConversation } from "./transcript";

describe("globalPrompt", () => {
  it("picks the mode's template", () => {
    expect(globalPrompt(DEFAULT_SETTINGS)).toBe(SUMMARIZE_PROMPT);
    expect(globalPrompt({ ...DEFAULT_SETTINGS, mode: "brainstorm" })).toBe(BRAINSTORM_PROMPT);
    expect(globalPrompt({ ...DEFAULT_SETTINGS, mode: "custom", customPrompt: "Be terse." })).toBe(
      "Be terse.",
    );
  });

  it("says which mode a reply is written in", () => {
    expect(modeUsed({ ...DEFAULT_SETTINGS, mode: "brainstorm" })).toBe("brainstorm");
    expect(modeUsed({ ...DEFAULT_SETTINGS, mode: "custom", customPrompt: "Be terse." })).toBe(
      "custom",
    );
    expect(modeUsed({ ...DEFAULT_SETTINGS, mode: "custom", customPrompt: " " })).toBe("summarize");
  });

  it("falls back to summarize for an empty custom prompt", () => {
    expect(globalPrompt({ ...DEFAULT_SETTINGS, mode: "custom", customPrompt: "  " })).toBe(
      SUMMARIZE_PROMPT,
    );
  });
});

describe("projectDescription", () => {
  it("puts the context, then the portal's title and content", () => {
    expect(
      projectDescription({
        context: "Housing in Utrecht",
        portalTitle: "Your street",
        portalContent: "Tell us about it.",
      }),
    ).toBe(
      "Housing in Utrecht\n\nDefault Conversation Title: Your street\n\nDefault Conversation Description: Tell us about it.",
    );
  });

  it("leaves out what's empty", () => {
    expect(projectDescription({ ...NO_DETAILS, portalTitle: "Your street" })).toBe(
      "Default Conversation Title: Your street",
    );
    expect(projectDescription(NO_DETAILS)).toBe("");
  });
});

describe("buildPrompt", () => {
  it("fills each part of the system prompt", () => {
    const prompt = buildPrompt(
      DEFAULT_SETTINGS,
      { ...NO_DETAILS, context: "Housing in Utrecht" },
      formatConversation("This session", "we need more homes\n"),
      formatConversation("Session 2", "rents are too high\n"),
    );
    expect(prompt).toContain("<project_description>\nHousing in Utrecht\n</project_description>");
    expect(prompt).toContain(`<global_prompt>\n${SUMMARIZE_PROMPT}\n</global_prompt>`);
    expect(prompt).toMatch(/<other_transcripts>\n<conversation>[\s\S]*rents are too high/);
    expect(prompt).toMatch(/<main_user_transcript>\n<conversation>[\s\S]*we need more homes/);
  });
});

describe("rendering", () => {
  it("doesn't escape or re-read what goes in", () => {
    const transcript = "we said <b>this</b> & {{ that }} {% if x %}";
    const prompt = buildPrompt(
      DEFAULT_SETTINGS,
      NO_DETAILS,
      formatConversation("A", transcript),
      "",
    );
    expect(prompt).toContain(transcript);
  });

  it("drops the personal-details block", () => {
    const prompt = buildPrompt(DEFAULT_SETTINGS, NO_DETAILS, "", "");
    expect(prompt).not.toContain("PII");
    expect(prompt).toMatch(
      /always write "dembrane" in lowercase, even at the start of a sentence$/,
    );
  });
});
