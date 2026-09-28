import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { RoomUser } from "./room";
import adminPage from "./pages/admin.html";
import roomPage from "./pages/room.html";
import styles from "./pages/style.css";

export { Room } from "./room";

// Your identity: a random secret in a cookie the Worker sets on your first
// visit. It's the same in every room; each room decides for itself whether
// you're its admin.
const TOKEN_COOKIE = "ffa_token";

// Your public id, which others (admins) see and use to make you an admin: part
// of a hash of your token, so it can't be turned back into your cookie.
async function publicId(token: string) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return Array.from(hash.slice(0, 6), (b) => b.toString(16).padStart(2, "0")).join("");
}

type Vars = { Bindings: Env; Variables: { userId: string } };

// Gives every visitor a token (setting the cookie if they have none) and works
// out their public id.
const identify = createMiddleware<Vars>(async (c, next) => {
  let token = getCookie(c, TOKEN_COOKIE);
  if (!token) {
    token = crypto.randomUUID();
    const secure = new URL(c.req.url).protocol === "https:";
    setCookie(c, TOKEN_COOKIE, token, { httpOnly: true, sameSite: "Lax", path: "/", secure, maxAge: 60 * 60 * 24 * 365 });
  }
  c.set("userId", await publicId(token));
  await next();
});

// The browser attaches the cookie to requests started by other pages in the
// same site too (on localhost, any other port), so a request that changes
// something must come from our own pages.
const fromOurOrigin = (req: Request) =>
  req.headers.get("sec-fetch-site") === "same-origin" || req.headers.get("origin") === new URL(req.url).origin;
const sameOrigin = createMiddleware<Vars>(async (c, next) => {
  const safe = c.req.method === "GET" || c.req.method === "HEAD";
  if (!safe && !fromOurOrigin(c.req.raw)) return c.json({ error: "cross-origin request" }, 403);
  await next();
});

const room = (env: Env, id: string) => env.ROOM.getByName(id);

// Room ids go in URLs and Durable Object names: keep them short and plain.
const ROOM_ID = "[A-Za-z0-9_-]{1,64}";

const app = new Hono<Vars>();

app.use("*", identify);
app.use("/api/*", sameOrigin);

// Each visit to / starts a new, empty room: whoever follows the redirect is its admin.
app.get("/", (c) => c.redirect(`/${crypto.randomUUID().slice(0, 8)}`));
app.get("/style.css", (c) => c.body(styles, 200, { "content-type": "text/css; charset=utf-8" }));

app.get(`/:id{${ROOM_ID}}`, (c) => c.html(roomPage));

// Only the room's admins get the admin page; to everyone else it doesn't exist.
app.get(`/:id{${ROOM_ID}}/admin`, async (c) => {
  const me = await room(c.env, c.req.param("id")).getUser(c.get("userId"));
  if (!me?.isAdmin) return c.notFound();
  return c.html(adminPage);
});

// The room, joining you first: the first visitor to an empty room is its admin.
app.get(`/api/rooms/:id{${ROOM_ID}}`, async (c) => {
  const r = room(c.env, c.req.param("id"));
  const me = await r.join(c.get("userId"));
  return c.json({ me, ...(await r.getState()) });
});

// Only yours: nobody, not even an admin, can increment anyone else's.
app.post(`/api/rooms/:id{${ROOM_ID}}/increment`, async (c) => {
  const r = room(c.env, c.req.param("id"));
  const me = await r.join(c.get("userId"));
  return c.json({ id: me.id, count: await r.increment(me.id) });
});

// Everything below is for the room's admins only.
const requireRoomAdmin = createMiddleware<Vars & { Variables: { me: RoomUser } }>(async (c, next) => {
  const me = await room(c.env, c.req.param("id")!).getUser(c.get("userId"));
  if (!me?.isAdmin) return c.json({ error: "only this room's admins can do that" }, 403);
  c.set("me", me);
  await next();
});
app.use(`/api/rooms/:id{${ROOM_ID}}/title`, requireRoomAdmin);
app.use(`/api/rooms/:id{${ROOM_ID}}/reset`, requireRoomAdmin);
app.use(`/api/rooms/:id{${ROOM_ID}}/users/*`, requireRoomAdmin);

app.put(`/api/rooms/:id{${ROOM_ID}}/title`, async (c) => {
  const { title } = await c.req.json<{ title: unknown }>();
  if (typeof title !== "string" || !title.trim() || title.trim().length > 100) {
    return c.json({ error: "title must be 1 to 100 characters" }, 400);
  }
  return c.json(await room(c.env, c.req.param("id")).setTitle(title.trim()));
});

app.post(`/api/rooms/:id{${ROOM_ID}}/reset`, async (c) => c.json(await room(c.env, c.req.param("id")).resetCounts()));

// Makes someone already in the room an admin. There's no demoting: once an
// admin, always an admin.
app.post(`/api/rooms/:id{${ROOM_ID}}/users/:uid/admin`, async (c) => {
  const r = room(c.env, c.req.param("id"));
  if (!(await r.makeAdmin(c.req.param("uid")))) return c.json({ error: "no such user in this room" }, 404);
  return c.json(await r.getState());
});

export default app;
