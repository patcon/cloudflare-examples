import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/hello", (c) => c.json({ hello: "world" }));

export default app;
