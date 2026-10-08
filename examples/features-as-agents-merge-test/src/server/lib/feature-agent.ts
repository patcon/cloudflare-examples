import { Agent, getAgentByName } from "agents";
import type { SessionEvent } from "../session/agent";

/**
 * What every feature agent shares. Each is named by its session's ID, so it
 * finds its session, and the session finds it, by name alone.
 */
export class FeatureAgent<S> extends Agent<Env, S> {
  /** This feature's session, for `facts()` and `segmentsSince()`. */
  session() {
    return getAgentByName(this.env.SessionAgent, this.name);
  }

  /** The project this session belongs to. Throws before the page has attached it. */
  async project() {
    const { projectId } = await (await this.session()).facts();
    if (!projectId) throw new Error("This session isn't in a project yet");
    return { projectId, project: await getAgentByName(this.env.ProjectAgent, projectId) };
  }

  /** Called by the session when its recording starts or stops. Ignored unless overridden. */
  onSessionEvent(_event: SessionEvent): void | Promise<void> {}
}
