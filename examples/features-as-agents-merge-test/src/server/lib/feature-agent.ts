import { Agent, getAgentByName } from "agents";
import type { Moment } from "../../shared/rules";
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

  /**
   * Where the session is now, on both clocks, to count waits from. Used
   * once a reply or outcome is saved, so it never fails one: if the session
   * doesn't answer, it counts the recorded time as of `fallback`.
   */
  async moment(fallback: Moment): Promise<Moment> {
    try {
      const { recordedSeconds } = await (await this.session()).facts();
      return { at: Date.now(), recordedSeconds };
    } catch (error) {
      console.error(`[${this.name}] Couldn't ask the session the time: ${error}`);
      return { at: Date.now(), recordedSeconds: fallback.recordedSeconds };
    }
  }

  /** Called by the session when its recording starts or stops. Ignored unless overridden. */
  onSessionEvent(_event: SessionEvent): void | Promise<void> {}
}
