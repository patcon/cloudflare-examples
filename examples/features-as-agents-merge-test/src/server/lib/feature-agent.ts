import { createTransformStub, timeout } from "@durability/transforms";
import { Agent, getAgentByName } from "agents";
import type { Moment } from "../../shared/rules";
import type { SessionEvent } from "../session/agent";

/**
 * How long a feature waits for its session or project, so a hang becomes
 * an error its caller already handles, such as `explore()` putting its
 * state back. Longer than `optional`'s 5 seconds, since some project calls,
 * such as `candidates()`, wait that long on each of its sessions.
 */
const RPC_TIMEOUT_MS = 10_000;

/**
 * What every feature agent shares. Each is named by its session's ID, so it
 * finds its session, and the session finds it, by name alone.
 */
export class FeatureAgent<S> extends Agent<Env, S> {
  /**
   * This feature's session, for `facts()` and `segmentsSince()`. Its calls
   * throw after `RPC_TIMEOUT_MS`.
   */
  async session() {
    return createTransformStub(await getAgentByName(this.env.SessionAgent, this.name)).with(
      timeout,
      RPC_TIMEOUT_MS,
    );
  }

  /**
   * The project this session belongs to. Throws before the page has attached
   * it. Its calls throw after `RPC_TIMEOUT_MS`.
   */
  async project() {
    const { projectId } = await (await this.session()).facts();
    if (!projectId) throw new Error("This session isn't in a project yet");
    const project = createTransformStub(await getAgentByName(this.env.ProjectAgent, projectId));
    return { projectId, project: project.with(timeout, RPC_TIMEOUT_MS) };
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
