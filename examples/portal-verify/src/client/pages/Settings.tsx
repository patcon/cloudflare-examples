import { useCallback, useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { Surface, Text } from "@cloudflare/kumo";
import type {
  ProjectAgent,
  ProjectMessage,
  ProjectState,
  SessionRow,
} from "../../server/project-agent";
import { Shell } from "../ui";

/** For the host: this project's sessions. */
export function Settings({ projectId }: { projectId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);

  const agent = useAgent<ProjectAgent, ProjectState>({
    agent: "ProjectAgent",
    name: projectId,
    onMessage: (event) => {
      if (parse(event.data)?.type === "sessions") void loadSessions();
    },
  });

  // Loads on opening, and when a session joins.
  const loadSessions = useCallback(
    () =>
      agent
        .call("listSessions")
        .then(setSessions)
        .catch((e: Error) => setError(e.message)),
    [agent],
  );
  useEffect(() => {
    agent.ready.then(loadSessions);
  }, [agent, loadSessions]);

  return (
    <Shell title={`${projectId} settings`}>
      <Sessions projectId={projectId} sessions={sessions} />

      {error && (
        <Text size="sm" variant="error">
          {error}
        </Text>
      )}

      <a className="text-sm underline" href={`/${encodeURIComponent(projectId)}/start`}>
        Back to the start page
      </a>
    </Shell>
  );
}

/** The project's sessions, newest first. */
function Sessions({ projectId, sessions }: { projectId: string; sessions: SessionRow[] | null }) {
  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3">
      <Text size="sm" bold>
        Sessions
      </Text>
      {sessions === null && (
        <Text size="sm" variant="secondary">
          Loading…
        </Text>
      )}
      {sessions?.length === 0 && (
        <Text size="sm" variant="secondary">
          No sessions yet.
        </Text>
      )}
      {sessions?.map((s) => (
        <div key={s.id} className="border-t border-kumo-line pt-3">
          <a
            className="text-sm underline"
            href={`/${encodeURIComponent(projectId)}/sessions/${s.id}`}
          >
            {new Date(s.started_at).toLocaleString()}
          </a>
        </div>
      ))}
    </Surface>
  );
}

function parse(data: unknown): ProjectMessage | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
