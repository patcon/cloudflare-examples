import { Hono } from "hono";

export { Teleporter } from "./teleporter";

const app = new Hono<{ Bindings: Env }>();

// Both devices connect to the same PIN, and so to the same Teleporter, which
// accepts the socket.
app.get("/teleporter/:pin{[0-9]{6}}", async (c) => {
  if (c.req.header("upgrade") !== "websocket") return c.text("expected a WebSocket upgrade", 426);
  return await c.env.TELEPORTER.getByName(c.req.param("pin")).fetch(c.req.raw);
});

export default app;
