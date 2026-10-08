import { describe, expect, it } from "vitest";
import {
  checkNewTopic,
  checkSettingsChange,
  MAX_TOPIC_PROMPT_CHARS,
  slugify,
  topicKey,
} from "../src/shared/features/verify/settings";
import {
  DEFAULT_VERIFY_SETTINGS,
  offeredTopics,
  type VerifySettings,
} from "../src/shared/features/verify/topics";

const custom = { key: "budget-1a2b3c4d", label: "Budget", icon: "💰", prompt: "List the costs." };
const settings: VerifySettings = { ...DEFAULT_VERIFY_SETTINGS, customTopics: [custom] };

describe("checkSettingsChange", () => {
  it("keeps the fields it knows, and drops the rest", () => {
    expect(checkSettingsChange({ enabled: false, admin: true }, settings)).toEqual({
      enabled: false,
    });
  });

  it("keeps selected keys in topic order, and refuses an unknown one", () => {
    expect(
      checkSettingsChange({ selectedTopics: ["budget-1a2b3c4d", "gems", "agreements"] }, settings),
    ).toEqual({ selectedTopics: ["agreements", "gems", "budget-1a2b3c4d"] });
    expect(() => checkSettingsChange({ selectedTopics: ["nope"] }, settings)).toThrow(/nope/);
  });

  it("refuses wrong types", () => {
    expect(() => checkSettingsChange({ enabled: "yes" }, settings)).toThrow(/true or false/);
    expect(() => checkSettingsChange({ selectedTopics: "gems" }, settings)).toThrow(/list/);
    expect(() => checkSettingsChange(null, settings)).toThrow(/object/);
  });
});

describe("checkNewTopic", () => {
  it("trims, and allows no emoji", () => {
    expect(checkNewTopic({ label: " Budget ", prompt: " List the costs. " })).toEqual({
      label: "Budget",
      icon: "",
      prompt: "List the costs.",
    });
  });

  it("refuses an empty label or prompt, and text over the original's limits", () => {
    expect(() => checkNewTopic({ label: " ", prompt: "x" })).toThrow(/label is empty/);
    expect(() => checkNewTopic({ label: "x", prompt: "" })).toThrow(/prompt is empty/);
    const long = "x".repeat(MAX_TOPIC_PROMPT_CHARS + 1);
    expect(() => checkNewTopic({ label: "x", prompt: long })).toThrow(/over/);
    expect(() => checkNewTopic({ label: "x", prompt: "y", icon: "🎉".repeat(11) })).toThrow(/icon/);
  });
});

describe("topicKey", () => {
  it("is a slug of the label and 8 random characters, as in the original", () => {
    expect(topicKey("Our Budget, 2026!", "0000-1111-2222-3333-44445555")).toBe(
      "our-budget-2026-44445555",
    );
  });

  it("slugifies as the original does", () => {
    expect(slugify("  Hello__World -- again ")).toBe("hello-world-again");
    expect(slugify("Café über")).toBe("café-über");
    expect(slugify("!!!")).toBe("custom");
    expect(slugify("a".repeat(80))).toHaveLength(60);
  });
});

describe("offeredTopics", () => {
  it("offers every topic, defaults first, when none is selected", () => {
    const keys = offeredTopics(settings).map((t) => t.key);
    expect(keys).toHaveLength(7);
    expect(keys.at(-1)).toBe("budget-1a2b3c4d");
  });

  it("offers only the selected ones, in topic order", () => {
    const selected = { ...settings, selectedTopics: ["gems", "budget-1a2b3c4d"] };
    expect(offeredTopics(selected).map((t) => t.key)).toEqual(["gems", "budget-1a2b3c4d"]);
  });
});
