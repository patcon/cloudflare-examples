import { createMiddleware } from "hono/factory";
import { jwt, sign, verify } from "hono/jwt";

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

// --- Demo-only: mock users and token minting --------------------------------
// Stand-ins for Directus users, so the demo runs without a dembrane stack.

export const MOCK_USERS = [
  // Not Alice and Bob: those are real accounts in the local ../directus.
  { id: "ca000000-0000-4000-8000-000000000001", name: "Carol", admin: false },
  { id: "da000000-0000-4000-8000-000000000002", name: "Dave", admin: false },
  { id: "ad000000-0000-4000-8000-000000000003", name: "Admin", admin: true },
] as const;

export const MOCK_TOKEN_TTL_SECONDS = 5 * 60;

export async function signMockToken(user: (typeof MOCK_USERS)[number], secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const claims: DirectusClaims = {
    id: user.id,
    role: null,
    app_access: true,
    admin_access: user.admin,
    iat: now,
    exp: now + MOCK_TOKEN_TTL_SECONDS,
    iss: "directus",
  };
  return sign(claims, secret, "HS256");
}
