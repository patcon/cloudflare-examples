import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import {
  type AuthEnv,
  MOCK_USERS,
  SESSION_COOKIE,
  requireDirectusSession,
  signMockToken,
  verifyDirectusToken,
} from "./auth";

export { UserCounter } from "./user-counter";

const app = new Hono<AuthEnv>();

app.get("/", (c) => c.redirect("/dembrane-dashboard/"));

// Public config for the pages.
app.get("/api/config", (c) =>
  c.json({
    directusUrl: c.env.DIRECTUS_URL,
    demoMode: c.env.DEMO_MODE === "true",
    mockUsers: MOCK_USERS,
  }),
);

// Demo-only: sign a token for a mock user, playing the part of Directus.
app.post("/api/dev/mint", async (c) => {
  if (c.env.DEMO_MODE !== "true") return c.notFound();
  const { userId } = await c.req.json<{ userId: string }>();
  const user = MOCK_USERS.find((u) => u.id === userId);
  if (!user) return c.json({ error: "unknown mock user" }, 400);
  return c.json({ token: await signMockToken(user, c.env.DIRECTUS_SECRET) });
});

// The link handoff: trade the token from the link for our own cookie.
app.post("/api/session", async (c) => {
  const { token } = await c.req.json<{ token: string }>();
  let claims;
  try {
    claims = await verifyDirectusToken(token, c.env.DIRECTUS_SECRET);
  } catch {
    return c.json({ error: "invalid or expired token" }, 401);
  }
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: claims.exp - Math.floor(Date.now() / 1000),
  });
  return c.json({ id: claims.id });
});

app.delete("/api/session", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.body(null, 204);
});

// Everything below requires a valid dembrane (Directus) login.
app.use("/api/me", requireDirectusSession);
app.use("/api/users/*", requireDirectusSession);

app.get("/api/me", (c) => {
  const { id, admin_access, exp } = c.get("jwtPayload");
  return c.json({ id, isAdmin: admin_access === true, exp });
});

// Anyone logged in can read anyone's count...
app.get("/api/users/:id", async (c) => {
  const id = c.req.param("id");
  const count = await c.env.USER_COUNTER.getByName(id).getCount();
  return c.json({ id, count });
});

// ...but only you can increment yours (admins can increment anyone's).
app.post("/api/users/:id/increment", async (c) => {
  const id = c.req.param("id");
  const { id: me, admin_access } = c.get("jwtPayload");
  if (id !== me && admin_access !== true) {
    return c.json({ error: "you can only increment your own counter" }, 403);
  }
  const count = await c.env.USER_COUNTER.getByName(id).increment();
  return c.json({ id, count });
});

export default app;
