import { routeAgentRequest } from "agents";

export { ProjectAgent } from "./project-agent";
export { SessionAgent } from "./session-agent";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
};
