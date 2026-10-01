import { useCallback, useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { Input, Surface, Text } from "@cloudflare/kumo";
import type {
  ProjectAgent,
  ProjectMessage,
  ProjectState,
  SessionRow
} from "../project-agent";
import { Shell } from "../ui";

/** For the host: the project's sessions and, later, their statements. */
export function Review({ projectId }: { projectId: string }) {
  const [topic, setTopic] = useState("");
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  const agent = useAgent<ProjectAgent, ProjectState>({
    agent: "ProjectAgent",
    name: projectId,
    onStateUpdate: (state) => setTopic(state.topic),
    onMessage: (event) => {
      if (parse(event.data)?.type === "sessions") void load();
    }
  });

  const load = useCallback(
    () => agent.call("listSessions").then(setSessions),
    [agent]
  );
  useEffect(() => {
    agent.ready.then(load);
  }, [agent, load]);

  return (
    <Shell title={`${projectId} · review`}>
      <Surface className="p-4 rounded-xl ring ring-kumo-line">
        <Input
          label="Topic"
          description="What the conversations are about. It helps pick statements."
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onBlur={() => agent.call("setTopic", [topic])}
        />
      </Surface>

      <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-2">
        <Text size="sm" bold>
          Sessions
        </Text>
        {sessions.length === 0 && (
          <Text size="sm" variant="secondary">
            None yet. Start one at{" "}
            <a className="underline" href={`/${encodeURIComponent(projectId)}/start`}>
              /{projectId}/start
            </a>
            .
          </Text>
        )}
        {sessions.map((s) => (
          <a
            key={s.id}
            className="text-sm underline"
            href={`/${encodeURIComponent(projectId)}/sessions/${s.id}`}
          >
            {new Date(s.started_at).toLocaleString()} · {s.id.slice(0, 8)}
          </a>
        ))}
      </Surface>
    </Shell>
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
