import { getAgentByName } from "agents";
import { Hono, type Context } from "hono";
import { agentsMiddleware } from "hono-agents";
import { isProjectId, isSessionId } from "../shared/ids";

export { ProjectAgent } from "./project-agent";
export { SessionAgent } from "./session-agent";

/** A 5-minute 16kHz WAV window, for `?debug=true`, is about 9.6MB. */
const MAX_WINDOW_BYTES = 12 * 1024 * 1024;

type AppEnv = { Bindings: Env };

const app = new Hono<AppEnv>();

// `/agents/:agent/:name`, for the pages' WebSockets to the agents.
app.use("/agents/*", agentsMiddleware());

/** The session a route names, once its IDs check out. */
async function sessionFor(c: Context<AppEnv>) {
  const { projectId, sessionId } = c.req.param();
  if (!isProjectId(projectId) || !isSessionId(sessionId)) return null;
  return {
    projectId,
    session: await getAgentByName(c.env.SessionAgent, sessionId),
  };
}

// For `?debug=true`: transcribes one window of an uploaded file, as if it
// had been said live.
app.post("/api/:projectId/sessions/:sessionId/replay", async (c) => {
  const target = await sessionFor(c);
  if (!target) return c.notFound();
  if (c.req.header("Content-Type") !== "audio/wav") {
    return c.text("Content-Type must be audio/wav", 415);
  }
  const wav = await c.req.arrayBuffer();
  if (wav.byteLength === 0 || wav.byteLength > MAX_WINDOW_BYTES) {
    return c.text("Bad window size", 413);
  }
  try {
    return c.json(await target.session.replayWindow(target.projectId, wav));
  } catch (error) {
    return c.text((error as Error).message, 409);
  }
});

export default app;
