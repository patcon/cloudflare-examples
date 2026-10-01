import { Button, Surface, Text } from "@cloudflare/kumo";
import { MicrophoneIcon } from "@phosphor-icons/react";
import { Shell } from "../ui";

/** For the recording phone: starts a new session in this project. */
export function Start({ projectId }: { projectId: string }) {
  return (
    <Shell title={projectId}>
      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3">
        <Text size="sm">
          Put this phone in the middle of the group, then start a session.
        </Text>
        <Button
          variant="primary"
          icon={<MicrophoneIcon size={16} />}
          onClick={() => {
            location.href = `/${encodeURIComponent(projectId)}/sessions/${crypto.randomUUID()}`;
          }}
        >
          Start a session
        </Button>
        <a className="text-sm underline" href={`/${encodeURIComponent(projectId)}/review`}>
          Review this project's statements
        </a>
      </Surface>
    </Shell>
  );
}
