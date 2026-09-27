import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { Me, Vote } from "../shared/types";

export { Conversation } from "./conversation";

type AppEnv = { Bindings: Env; Variables: { participantId: string } };

// A random secret per browser. Browsers send cookies on the WebSocket upgrade,
// but won't let a page set headers on it.
const PARTICIPANT_COOKIE = "polis_participant";
const ONE_YEAR = 60 * 60 * 24 * 365;

// Participant IDs are sent to everyone (for the scatter plot), so they must
// not work as credentials: the public ID is a hash of the secret cookie.
async function participantIdFor(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// The browser attaches the cookie by itself, even to a request started by
// another site. So a request that changes something must come from our pages.
const isSafeMethod = (method: string) => method === "GET" || method === "HEAD" || method === "OPTIONS";
const fromOurOrigin = (req: Request) =>
  req.headers.get("sec-fetch-site") === "same-origin" || req.headers.get("origin") === new URL(req.url).origin;

const participant = createMiddleware<AppEnv>(async (c, next) => {
  if (!isSafeMethod(c.req.method) && !fromOurOrigin(c.req.raw)) {
    return c.json({ error: "cross-origin request" }, 403);
  }
  let secret = getCookie(c, PARTICIPANT_COOKIE);
  if (!secret) {
    secret = crypto.randomUUID();
    setCookie(c, PARTICIPANT_COOKIE, secret, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: ONE_YEAR,
      secure: new URL(c.req.url).protocol === "https:",
    });
  }
  c.set("participantId", await participantIdFor(secret));
  await next();
});

const app = new Hono<AppEnv>().basePath("/api/:convoId");
app.use(participant);

const conversation = (c: { env: Env; req: { param: (name: "convoId") => string } }) =>
  c.env.CONVERSATION.getByName(c.req.param("convoId"));

async function jsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

app.get("/me", (c) => c.json<Me>({ participantId: c.get("participantId") }));

app.get("/next", async (c) => c.json(await conversation(c).nextStatement(c.get("participantId"))));

app.post("/statements", async (c) => {
  const body = await jsonBody(c.req.raw);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.length < 1 || text.length > 1_000) return c.json({ error: "text must be 1–1,000 characters" }, 400);
  return c.json(await conversation(c).addStatement(c.get("participantId"), text), 201);
});

app.post("/votes", async (c) => {
  const body = await jsonBody(c.req.raw);
  const statementId = body?.statementId;
  const vote = body?.vote;
  if (!Number.isInteger(statementId)) return c.json({ error: "statementId must be an integer" }, 400);
  if (vote !== -1 && vote !== 0 && vote !== 1) return c.json({ error: "vote must be -1, 0 or 1" }, 400);
  const ok = await conversation(c).vote(c.get("participantId"), statementId as number, vote as Vote);
  if (!ok) return c.json({ error: "no such statement" }, 404);
  return c.body(null, 204);
});

export default app;
