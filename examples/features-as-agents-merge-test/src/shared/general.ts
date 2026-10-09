/**
 * A project's own details, which aren't any one feature's: what it's
 * called and about, and what the portal shows participants. Each feature's
 * prompt takes what the original passes it:
 *
 * | Field           | Explore | Verify |
 * | --------------- | ------- | ------ |
 * | name            | no      | yes    |
 * | context         | yes     | no     |
 * | portalTitle     | yes     | no     |
 * | portalContent   | yes     | no     |
 *
 * Statements takes what Explore does.
 */
export interface GeneralSettings {
  /** Required. A new project starts with its ID. */
  name: string;
  /** What the project is about. */
  context: string;
  /** The portal's heading, the original's default conversation title. */
  portalTitle: string;
  /** The portal's text under it, the original's default conversation description. */
  portalContent: string;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  name: "",
  context: "",
  portalTitle: "",
  portalContent: "",
};

/** What Explore and Statements tell the model about the project. */
export type ProjectDetails = Pick<GeneralSettings, "context" | "portalTitle" | "portalContent">;

/**
 * The project's description, as the original's reply prompt builds it in
 * `platform/packages/conversations/src/v1/reply.ts`: its context, then
 * what the portal shows, under the original's names for those fields. The
 * original leaves out a field that's null, so an empty one is left out.
 */
export function projectDescription(project: ProjectDetails): string {
  const parts: string[] = [];
  if (project.context) parts.push(project.context);
  if (project.portalTitle) parts.push(`Default Conversation Title: ${project.portalTitle}`);
  if (project.portalContent) {
    parts.push(`Default Conversation Description: ${project.portalContent}`);
  }
  return parts.join("\n\n");
}

// Made up: the original has no limits.
export const MAX_NAME_CHARS = 100;
export const MAX_CONTEXT_CHARS = 2000;
export const MAX_PORTAL_TITLE_CHARS = 200;
export const MAX_PORTAL_CONTENT_CHARS = 2000;

/**
 * Checks a change from the settings page, which comes over the network, so
 * anything could be in it. Throws on a bad field, and drops unknown ones.
 */
export function checkGeneralChange(change: unknown): Partial<GeneralSettings> {
  if (typeof change !== "object" || change === null) throw new Error("Expected an object");
  const c = change as Record<string, unknown>;
  const out: Partial<GeneralSettings> = {};
  if ("name" in c) {
    out.name = text(c.name, "name", MAX_NAME_CHARS).trim();
    if (!out.name) throw new Error("The project needs a name");
  }
  if ("context" in c) out.context = text(c.context, "context", MAX_CONTEXT_CHARS);
  if ("portalTitle" in c) {
    out.portalTitle = text(c.portalTitle, "portalTitle", MAX_PORTAL_TITLE_CHARS);
  }
  if ("portalContent" in c) {
    out.portalContent = text(c.portalContent, "portalContent", MAX_PORTAL_CONTENT_CHARS);
  }
  return out;
}

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${name} must be text`);
  if (value.length > max) throw new Error(`${name} is over ${max} characters`);
  return value;
}
