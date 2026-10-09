import { useState } from "react";
import { Button, Paper, Text, TextInput, Title } from "@mantine/core";
import { MicrophoneIcon } from "@phosphor-icons/react";
import type { ProjectState } from "../../server/project/agent";
import { useProject } from "../hooks/use-project";
import { Shell } from "../ui";

/**
 * For the recording phone: the portal's title and content, as the project
 * sets them, then a name and a button to start a new session in this
 * project. The name goes to the session page in its URL.
 */
export function Start({ projectId }: { projectId: string }) {
  const [state, setState] = useState<ProjectState | null>(null);
  useProject(projectId, { onStateUpdate: setState });
  const general = state?.general;
  const [name, setName] = useState("");
  const trimmed = name.trim();

  return (
    <Shell title={general?.name || projectId}>
      {(general?.portalTitle || general?.portalContent) && (
        <div className="flex flex-col gap-2">
          {general.portalTitle && <Title order={2}>{general.portalTitle}</Title>}
          {general.portalContent && (
            <div className="whitespace-pre-wrap">
              <Text size="sm">{general.portalContent}</Text>
            </div>
          )}
        </div>
      )}
      <Paper p="md" className="flex flex-col gap-3">
        <Text size="sm">Put this phone in the middle of the group, then start a session.</Text>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!trimmed) return;
            const query = new URLSearchParams({ name: trimmed });
            location.href = `/${encodeURIComponent(projectId)}/sessions/${crypto.randomUUID()}?${query}`;
          }}
        >
          <TextInput label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Button
            type="submit"
            variant="filled"
            leftSection={<MicrophoneIcon size={16} />}
            disabled={!trimmed}
          >
            Start a session
          </Button>
        </form>
        <a className="text-sm underline" href={`/${encodeURIComponent(projectId)}/settings`}>
          Project settings
        </a>
      </Paper>
    </Shell>
  );
}
