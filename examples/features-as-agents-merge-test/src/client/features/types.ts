import type { SessionRow } from "../../server/project/agent";
import type { FeatureKey, ProjectSettings } from "../../shared/features";
import type { SessionFacts } from "../../shared/rules";
import type { ProjectConnection } from "../hooks/use-project";

/** What the session page gives each feature's panel. */
export interface PanelProps<K extends FeatureKey> {
  projectId: string;
  sessionId: string;
  /** The session's facts, live on this page, for the panel's own rules. */
  facts: SessionFacts;
  /** The feature's slice of the project's settings. */
  settings: ProjectSettings[K];
  now: number;
}

/** What the settings page gives each feature's section, under its on/off switch. */
export interface SectionProps<K extends FeatureKey> {
  projectId: string;
  /** The project's agent, to call its feature callables. */
  project: ProjectConnection;
  settings: ProjectSettings[K];
  sessions: SessionRow[] | null;
  /**
   * Goes up when a session joins, or the feature's data changes in one,
   * for a section that shows data from the sessions to load it again.
   */
  version: number;
  /** Runs a call, and shows why it failed on the page. Rethrows. */
  run: <T>(call: Promise<T>) => Promise<T>;
}
