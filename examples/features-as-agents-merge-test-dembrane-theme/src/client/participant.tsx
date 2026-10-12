import { type ReactNode, useState } from "react";
import { OutletProvider } from "react-router";
import { ParticipantLayout } from "@/components/layout/ParticipantLayout";
import { ParticipantProjectProvider, toParticipantProject } from "@/components/participant/hooks";
import type { ProjectState } from "../server/project/agent";
import { useProject } from "./hooks/use-project";

/**
 * A participant page: echo's ParticipantLayout, with the page in its
 * outlet, and the project, from this app's ProjectAgent, where echo's
 * components look for it.
 */
export function ParticipantPage({
  projectId,
  children,
}: {
  projectId: string;
  children: (project: ParticipantProject | undefined, state: ProjectState | null) => ReactNode;
}) {
  const [state, setState] = useState<ProjectState | null>(null);
  useProject(projectId, { onStateUpdate: setState });
  const project = state ? toParticipantProject(projectId, state) : undefined;
  return (
    <ParticipantProjectProvider project={project}>
      <OutletProvider outlet={children(project, state)}>
        <ParticipantLayout />
      </OutletProvider>
    </ParticipantProjectProvider>
  );
}
