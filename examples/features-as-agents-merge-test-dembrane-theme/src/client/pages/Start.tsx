import { Loader } from "@mantine/core";
import ParticipantOnboardingCards from "@/components/participant/ParticipantOnboardingCards";
import { ParticipantPage } from "../participant";
import { InsecureNotice } from "../ui";

/**
 * For the recording phone: echo's onboarding deck, as its
 * ParticipantStartRoute shows it. The last card asks for a name, then
 * opens a new session at `/:projectId/conversation/:id`.
 */
export function Start({ projectId }: { projectId: string }) {
  return (
    <ParticipantPage projectId={projectId}>
      {(project) => (
        <div className="h-full grow">
          {project ? (
            <ParticipantOnboardingCards project={project} notice={<InsecureNotice />} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Loader size="sm" />
            </div>
          )}
        </div>
      )}
    </ParticipantPage>
  );
}
