import { useAgent } from "agents/react";
import type { ProjectAgent, ProjectState } from "../../server/project/agent";

/** The page's connection to its project's agent, with its settings synced. */
export function useProject(
  projectId: string,
  options: { onStateUpdate: (state: ProjectState) => void; onMessage?: (e: MessageEvent) => void },
) {
  return useAgent<ProjectAgent, ProjectState>({
    agent: "ProjectAgent",
    name: projectId,
    ...options,
  });
}

export type ProjectConnection = ReturnType<typeof useProject>;
