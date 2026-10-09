import { ParticipantPostConversation } from "@/routes/participant/ParticipantPostConversation";
import { ParticipantPage } from "../participant";

/** After Finish: echo's thank-you page, at its own path. */
export function Finish({ projectId }: { projectId: string }) {
  return (
    <ParticipantPage projectId={projectId}>{() => <ParticipantPostConversation />}</ParticipantPage>
  );
}
