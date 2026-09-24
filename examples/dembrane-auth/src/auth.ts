import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { jwt, verify } from "hono/jwt";

// The Worker's own cookie, set by POST /api/session after the link handoff.
// (It can't use dembrane's `directus_session_token` cookie: that one belongs to
// another site, so the browser never sends it here.)
export const SESSION_COOKIE = "demo_session";

// The claims Directus puts in its JWTs. dembrane's backend reads `id` and
// `admin_access` (see require_directus_session in dependency_auth.py); so do we.
export type DirectusClaims = {
  id: string;
  role?: string | null;
  app_access?: boolean;
  admin_access?: boolean;
  iat: number;
  exp: number;
  iss?: string;
};

export type AuthEnv = {
  Bindings: Env;
  Variables: { jwtPayload: DirectusClaims };
};

// The TypeScript twin of FastAPI's `require_directus_session`: an HS256 JWT
// signed with DIRECTUS_SECRET, from `Authorization: Bearer` (like the iOS app)
// or from our session cookie (like the browser). Anything else → 401.
export const requireDirectusSession = createMiddleware<AuthEnv>((c, next) =>
  jwt({ secret: c.env.DIRECTUS_SECRET, alg: "HS256", cookie: SESSION_COOKIE })(c, next),
);

export async function verifyDirectusToken(token: string, secret: string) {
  return (await verify(token, secret, "HS256")) as DirectusClaims;
}

// The raw token behind the current request, found the same way
// requireDirectusSession finds it (header first, then our cookie), so the Worker
// can pass it on to Directus and ask as this user.
export function sessionToken(c: Context<AuthEnv>): string | undefined {
  const header = c.req.header("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return getCookie(c, SESSION_COOKIE);
}
