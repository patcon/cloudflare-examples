import { getAgentByName } from "agents";
import { Hono, type Context } from "hono";
import { agentsMiddleware } from "hono-agents";
import { isProjectId, isSessionId } from "../shared/ids";

export { ProjectAgent } from "./project-agent";
export { SessionAgent } from "./session-agent";

/** A 10-second piece at 24kbps is about 30KB. This allows plenty more. */
const MAX_PART_BYTES = 1024 * 1024;

type AppEnv = { Bindings: Env };

const app = new Hono<AppEnv>();

// `/agents/:agent/:name`, for the pages' WebSockets to the agents.
app.use("/agents/*", agentsMiddleware());

/** The session a recording route names, once its IDs check out. */
async function sessionFor(c: Context<AppEnv>) {
  const { projectId, sessionId } = c.req.param();
  if (!isProjectId(projectId) || !isSessionId(sessionId)) return null;
  return {
    projectId,
    session: await getAgentByName(c.env.SessionAgent, sessionId),
  };
}

// Stores one piece of the page's compressed recording, numbered from 0.
app.put("/api/:projectId/sessions/:sessionId/recording/:part{[0-9]+}", async (c) => {
  const target = await sessionFor(c);
  if (!target) return c.notFound();
  const mimeType = c.req.header("Content-Type") ?? "";
  if (!mimeType.startsWith("audio/")) {
    return c.text("Content-Type must be audio/*", 415);
  }
  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_PART_BYTES) {
    return c.text("Bad piece size", 413);
  }
  try {
    await target.session.storePart(target.projectId, Number(c.req.param("part")), mimeType, body);
  } catch (error) {
    return c.text((error as Error).message, 409);
  }
  return c.body(null, 204);
});

// Streams the whole recording back, to listen to it.
app.get("/api/:projectId/sessions/:sessionId/recording", async (c) => {
  const target = await sessionFor(c);
  if (!target) return c.notFound();
  const parts = await target.session.recordingParts(target.projectId);
  if (!parts) return c.text("Nothing recorded yet", 404);
  const { readable, writable } = new TransformStream();
  void (async () => {
    for (const key of parts.keys) {
      const part = await c.env.RECORDINGS.get(key);
      if (part) await part.body.pipeTo(writable, { preventClose: true });
    }
    await writable.close();
  })();
  return c.body(readable, 200, { "Content-Type": parts.mimeType });
});

export default app;
