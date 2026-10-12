/**
 * The six topics every project offers, from the dembrane portal: keys,
 * order and prompts from `platform/packages/verify/src/defaults.ts`, and
 * emoji from `TOPIC_ICON_MAP` in
 * `frontend/src/components/participant/verify/VerifySelection.tsx`. English
 * labels only.
 */

export interface Topic {
  key: string;
  label: string;
  /** An emoji. */
  icon: string;
  prompt: string;
}

export const DEFAULT_TOPICS: readonly Topic[] = [
  {
    key: "agreements",
    label: "What we actually agreed on",
    icon: "✅",
    prompt:
      "Extract the concrete agreements and shared understandings from this conversation. " +
      "Focus on points where multiple participants explicitly or implicitly aligned. " +
      "Include both major decisions and small points of consensus. Present these as clear, " +
      "unambiguous statements that all participants would recognize as accurate. Distinguish " +
      "between firm agreements and tentative consensus. If participants used different words " +
      "to express the same idea, synthesize into shared language. Format as a living document " +
      "of mutual understanding. Output character should be diplomatic but precise, like meeting " +
      "minutes with soul.",
  },
  {
    key: "gems",
    label: "Hidden gems",
    icon: "🔍",
    prompt:
      "Identify the valuable insights that emerged unexpectedly or were mentioned briefly but " +
      "contain significant potential. Look for: throwaway comments that solve problems, questions " +
      "that reframe the entire discussion, metaphors that clarify complex ideas, connections between " +
      "seemingly unrelated points, and wisdom hiding in personal anecdotes. Present these as discoveries " +
      "worth preserving, explaining why each gem matters. These are the insights people might forget but " +
      "shouldn't. Output character should be excited and precise.",
  },
  {
    key: "truths",
    label: "Painful truths",
    icon: "👀",
    prompt:
      "Surface the uncomfortable realities acknowledged in this conversation - the elephants in the room that " +
      "got named, the difficult facts accepted, the challenging feedback given or received. Include systemic " +
      "problems identified, personal blind spots revealed, and market realities confronted. Present these with " +
      "compassion but without sugar-coating. Frame them as shared recognitions that took courage to voice. " +
      "These truths are painful but necessary for genuine progress. Output character should be gentle but " +
      "unflinching.",
  },
  {
    key: "moments",
    label: "Breakthrough moments",
    icon: "🚀",
    prompt:
      "Capture the moments when thinking shifted, new possibilities emerged, or collective understanding jumped " +
      "to a new level. Identify: sudden realizations, creative solutions, perspective shifts, moments when " +
      "complexity became simple, and ideas that energized the group. Show both the breakthrough itself and what " +
      "made it possible. These are the moments when the conversation transcended its starting point. Output " +
      "character should be energetic and forward-looking.",
  },
  {
    key: "actions",
    label: "What we think should happen",
    icon: "↗️",
    prompt:
      "Synthesize the group's emerging sense of direction and next steps. Include: explicit recommendations made, " +
      "implicit preferences expressed, priorities that emerged through discussion, and logical next actions even " +
      "if not explicitly stated. Distinguish between unanimous direction and majority leanings. Present as " +
      "provisional navigation rather than fixed commands. This is the group's best current thinking about the " +
      "path forward. Output character should be pragmatic but inspirational.",
  },
  {
    key: "disagreements",
    label: "Moments we agreed to disagree",
    icon: "⚠️",
    prompt:
      "Document the points of productive tension where different perspectives remained distinct but respected. " +
      "Include: fundamental differences in approach, varying priorities, different risk tolerances, and contrasting " +
      "interpretations of data. Frame these not as failures to agree but as valuable diversity of thought. Show how " +
      "each perspective has merit. These disagreements are features, not bugs - they prevent premature convergence " +
      "and keep important tensions alive. Output character should be respectful and balanced.",
  },
];

/** A project's Verify settings, synced to every page connected to it. */
export interface VerifySettings {
  enabled: boolean;
  /**
   * The keys participants see, as the original's
   * `selected_verification_key_list`. Empty means every topic.
   */
  selectedTopics: string[];
  /** The project's own topics, oldest first. */
  customTopics: Topic[];
}

export const DEFAULT_VERIFY_SETTINGS: VerifySettings = {
  enabled: true,
  selectedTopics: [],
  customTopics: [],
};

/** Every topic of the project: the defaults, then its own, oldest first. */
export function allTopics(settings: VerifySettings): Topic[] {
  return [...DEFAULT_TOPICS, ...settings.customTopics];
}

/** The topics participants see, in the order of `allTopics`. */
export function offeredTopics(settings: VerifySettings): Topic[] {
  const all = allTopics(settings);
  const { selectedTopics } = settings;
  return selectedTopics.length ? all.filter((t) => selectedTopics.includes(t.key)) : all;
}
