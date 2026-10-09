import { useState } from "react";
import { Loader } from "@mantine/core";
import { OutletProvider } from "react-router";
import { ParticipantLayout } from "@/components/layout/ParticipantLayout";
import ParticipantOnboardingCards from "@/components/participant/ParticipantOnboardingCards";
import { ParticipantProjectProvider, toParticipantProject } from "@/components/participant/hooks";
import type { ProjectState } from "../../server/project/agent";
import { useProject } from "../hooks/use-project";
import { InsecureNotice } from "../ui";

/**
 * For the recording phone: echo's onboarding deck, in echo's participant
 * layout, as its ParticipantStartRoute shows it. The last card asks for a
 * name, then opens a new session at `/:projectId/conversation/:id`.
 */
export function Start({ projectId }: { projectId: string }) {
  const [state, setState] = useState<ProjectState | null>(null);
  useProject(projectId, { onStateUpdate: setState });
  const project = state ? toParticipantProject(projectId, state) : undefined;

  return (
    <ParticipantProjectProvider project={project}>
      <OutletProvider
        outlet={
          <div className="h-full grow">
            {project ? (
              <ParticipantOnboardingCards project={project} notice={<InsecureNotice />} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Loader size="sm" />
              </div>
            )}
          </div>
        }
      >
        <ParticipantLayout />
      </OutletProvider>
    </ParticipantProjectProvider>
  );
}
