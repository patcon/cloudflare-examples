// example: ours, in place of echo's config.ts, which reads deployment values.
// Only the names the copied files import are here.

/**
 * Echo builds the portal and the dashboard as separate apps. Here they're
 * one, so the participant pages are picked by path: a start page or a
 * conversation.
 */
export const USE_PARTICIPANT_ROUTER = /^\/[^/]+\/(start|(conversation|sessions)\/[^/]+)\/?$/.test(
  location.pathname,
);

export const PARTICIPANT_BASE_URL = location.origin;

export type AppEnvironment = "production" | "staging" | "development";
export const APP_ENVIRONMENT: AppEnvironment = "production";
export const IS_PRODUCTION = true;
export const PREVIEW_PR: { number: number; url: string } | null = null;
