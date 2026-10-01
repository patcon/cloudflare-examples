import { getAgentByName, routeAgentRequest } from "agents";
import { isProjectId, isSessionId } from "./ids";

export { ProjectAgent } from "./project-agent";
export { SessionAgent } from "./session-agent";

/** A 10-second piece at 24kbps is about 30KB. This allows plenty more. */
const MAX_PART_BYTES = 1024 * 1024;

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const recording = matchRecording(new URL(request.url).pathname);
    if (recording) return handleRecording(request, env, recording);
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
};

interface RecordingRoute {
  projectId: string;
  sessionId: string;
  /** The piece number, for an upload. */
  part: number | null;
}

/** `/api/:projectId/sessions/:sessionId/recording[/:part]` */
function matchRecording(pathname: string): RecordingRoute | null {
  const m = pathname.match(/^\/api\/([^/]+)\/sessions\/([^/]+)\/recording(?:\/(\d+))?$/);
  if (!m) return null;
  const projectId = decodeURIComponent(m[1]);
  const sessionId = decodeURIComponent(m[2]);
  if (!isProjectId(projectId) || !isSessionId(sessionId)) return null;
  return { projectId, sessionId, part: m[3] === undefined ? null : Number(m[3]) };
}

/**
 * PUT `…/recording/:part` stores one piece of the page's recording. GET
 * `…/recording` streams the whole recording back, to listen to it.
 */
async function handleRecording(request: Request, env: Env, route: RecordingRoute) {
  const session = await getAgentByName(env.SessionAgent, route.sessionId);

  if (request.method === "PUT" && route.part !== null) {
    const mimeType = request.headers.get("Content-Type") ?? "";
    if (!mimeType.startsWith("audio/")) {
      return new Response("Content-Type must be audio/*", { status: 415 });
    }
    const body = await request.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > MAX_PART_BYTES) {
      return new Response("Bad piece size", { status: 413 });
    }
    try {
      await session.storePart(route.projectId, route.part, mimeType, body);
    } catch (error) {
      return new Response(String((error as Error).message), { status: 409 });
    }
    return new Response(null, { status: 204 });
  }

  if (request.method === "GET" && route.part === null) {
    const parts = await session.recordingParts(route.projectId);
    if (!parts) return new Response("Nothing recorded yet", { status: 404 });
    const { readable, writable } = new TransformStream();
    void (async () => {
      for (const key of parts.keys) {
        const part = await env.RECORDINGS.get(key);
        if (part) await part.body.pipeTo(writable, { preventClose: true });
      }
      await writable.close();
    })();
    return new Response(readable, { headers: { "Content-Type": parts.mimeType } });
  }

  return new Response("Method not allowed", { status: 405 });
}
