import type { ComponentType } from "react";
import type { FeatureKey } from "../../shared/features";
import type { PanelProps, SectionProps } from "./types";
import { ExploreBridge } from "./explore/Bridge";
import { ExploreSection } from "./explore/Section";
import { StatementsPanel } from "./statements/Panel";
import { StatementsSection } from "./statements/Section";
import { VerifyBridge } from "./verify/Bridge";
import { VerifySection } from "./verify/Section";

/**
 * Each feature's parts on the pages: its panel on the session page, and its
 * section on the settings page. Its label and settings are in the shared
 * `FEATURES`.
 */
export const FEATURE_UI: {
  [K in FeatureKey]: {
    Panel: ComponentType<PanelProps<K>>;
    Section: ComponentType<SectionProps<K>>;
    /** What the settings page says under the feature's switch. */
    about: string;
  };
} = {
  explore: {
    // Explore is behind the ECHO button, on echo's refine screen; its
    // replies join the conversation.
    Panel: ExploreBridge,
    Section: ExploreSection,
    about: "A short reply to the conversation so far, when someone asks.",
  },
  verify: {
    // Verify is behind the ECHO button, on echo's verify screens; its
    // approved outcomes join the conversation.
    Panel: VerifyBridge,
    Section: VerifySection,
    about: "An outcome on a topic the group picks, which they revise out loud and approve.",
  },
  statements: {
    Panel: StatementsPanel,
    Section: StatementsSection,
    about:
      "Candidate statements for Polis, pulled from the transcript as it grows, for the host to review.",
  },
};
