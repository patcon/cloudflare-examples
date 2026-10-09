import { useCallback, useEffect, useState } from "react";
import { Anchor, Badge, Button, Paper, Tabs, Text, Textarea, Title } from "@mantine/core";
import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  CopyIcon,
  LightningIcon,
  PencilSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { Candidate, CandidateStatus } from "../../server/features/statements/agent";
import type { ProjectMessage, SessionCandidates } from "../../server/project/agent";
import { parse } from "../features/parse";
import { useProject } from "../hooks/use-project";
import { Shell } from "../ui";

const TABS: { value: CandidateStatus; label: string }[] = [
  { value: "pending", label: "To review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "filtered", label: "Filtered out" },
];

/**
 * For the host: every session's proposed statements, to approve or reject.
 * Each session keeps its own, in its `StatementsAgent`; the project asks
 * them all.
 */
export function Review({ projectId }: { projectId: string }) {
  const [sessions, setSessions] = useState<SessionCandidates[]>([]);
  const [tab, setTab] = useState<CandidateStatus>("pending");
  const [error, setError] = useState<string | null>(null);

  const project = useProject(projectId, {
    onStateUpdate: () => {},
    onMessage: (event) => {
      const message = parse<ProjectMessage>(event.data);
      if (
        message?.type === "sessions" ||
        (message?.type === "changed" && message.feature === "statements")
      ) {
        void load();
      }
    },
  });
  const load = useCallback(
    () =>
      project
        .call("candidates")
        .then(setSessions)
        .catch((e: Error) => setError(e.message)),
    [project],
  );
  useEffect(() => {
    project.ready.then(load);
  }, [project, load]);

  const run = (p: Promise<unknown>) =>
    p.then(() => setError(null)).catch((e: Error) => setError(e.message));

  // Every session's, each with its session, newest session first.
  const candidates = sessions.flatMap((s, i) =>
    (s.candidates ?? []).map((c) => ({
      ...c,
      sessionId: s.id,
      session: `Session ${sessions.length - i}`,
    })),
  );
  const shown = candidates.filter((c) => c.status === tab);
  const approved = candidates
    .filter((c) => c.status === "approved")
    .map((c) => c.edited_text ?? c.text);

  return (
    <Shell title={`${projectId} · review`}>
      <Paper p="md" className="flex flex-col gap-2">
        <Title order={5}>Sessions</Title>
        {sessions.length === 0 && (
          <Text size="sm" c="dimmed">
            None yet. Start one at{" "}
            <Anchor inherit href={`/${encodeURIComponent(projectId)}/start`}>
              /{projectId}/start
            </Anchor>
            .
          </Text>
        )}
        {sessions.map((s, i) => (
          <div key={s.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Anchor size="sm" href={`/${encodeURIComponent(projectId)}/sessions/${s.id}`}>
                {s.name || `Session ${sessions.length - i}`}
              </Anchor>
              <Text size="xs" c="dimmed">
                started {new Date(s.startedAt).toLocaleTimeString()}
                {s.run?.lastRunAt &&
                  ` · last run ${new Date(s.run.lastRunAt).toLocaleTimeString()}`}
              </Text>
              {s.run?.lastRunError && <Badge color="red">last run failed</Badge>}
              {s.candidates === null && <Badge color="red">didn't answer</Badge>}
              <Button
                size="xs"
                leftSection={<LightningIcon size={14} />}
                onClick={() => run(project.call("extractNow", [s.id]))}
              >
                Extract now
              </Button>
            </div>
            {s.run?.lastRunError && (
              <Text size="xs" c="red">
                {s.run.lastRunError}
              </Text>
            )}
          </div>
        ))}
        <Anchor size="xs" href={`/${encodeURIComponent(projectId)}/settings#general`}>
          Extraction sees the project's details, on the settings page
        </Anchor>
      </Paper>

      {error && (
        <Text size="sm" c="red">
          {error}
        </Text>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Tabs value={tab} onChange={(v) => v && setTab(v as CandidateStatus)}>
          <Tabs.List>
            {TABS.map((t) => (
              <Tabs.Tab key={t.value} value={t.value}>
                {`${t.label} (${candidates.filter((c) => c.status === t.value).length})`}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
        {tab === "approved" && approved.length > 0 && (
          <Button
            size="sm"
            leftSection={<CopyIcon size={14} />}
            onClick={() => navigator.clipboard.writeText(approved.join("\n"))}
          >
            Copy approved
          </Button>
        )}
      </div>

      {shown.length === 0 && (
        <Text size="sm" c="dimmed">
          Nothing here.
        </Text>
      )}
      {shown.map((c) => (
        <CandidateCard
          key={`${c.sessionId}-${c.id}`}
          candidate={c}
          session={c.session}
          decide={(status, edited) =>
            run(project.call("decide", [c.sessionId, c.id, status, edited]))
          }
        />
      ))}
    </Shell>
  );
}

function CandidateCard({
  candidate: c,
  session,
  decide,
}: {
  candidate: Candidate;
  session: string;
  decide: (status: "approved" | "rejected" | "pending", edited?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const text = c.edited_text ?? c.text;
  const [draft, setDraft] = useState(text);

  return (
    <Paper p="md" className="flex flex-col gap-2">
      {editing ? (
        <Textarea
          aria-label="Statement"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
        />
      ) : (
        <Text>{text}</Text>
      )}
      {c.edited_text && !editing && (
        <Text size="xs" c="dimmed">
          Edited from: {c.text}
        </Text>
      )}
      {c.quote && (
        <blockquote className="border-l pl-2 text-xs text-[var(--app-muted)]">
          “{c.quote}”
        </blockquote>
      )}
      {c.rationale && (
        <Text size="xs" c="dimmed">
          {c.rationale}
        </Text>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge color="gray">{session}</Badge>
        <Text size="xs" c="dimmed">
          clarity {c.clarity} · divisiveness {c.divisiveness} · novelty {c.novelty}
        </Text>
        {c.filter_reason && (
          <Badge variant="outline" color="gray">
            {c.filter_reason.replace("_", " ")}
          </Badge>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">
        {editing ? (
          <>
            <Button
              size="sm"
              variant="filled"
              leftSection={<CheckIcon size={14} />}
              onClick={() => {
                decide("approved", draft);
                setEditing(false);
              }}
            >
              Save and approve
            </Button>
            <Button size="sm" variant="subtle" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            {c.status !== "approved" && (
              <Button
                size="sm"
                variant="filled"
                leftSection={<CheckIcon size={14} />}
                onClick={() => decide("approved")}
              >
                Approve
              </Button>
            )}
            <Button
              size="sm"
              leftSection={<PencilSimpleIcon size={14} />}
              onClick={() => {
                setDraft(text);
                setEditing(true);
              }}
            >
              Edit
            </Button>
            {c.status !== "rejected" && (
              <Button
                size="sm"
                leftSection={<XIcon size={14} />}
                onClick={() => decide("rejected")}
              >
                Reject
              </Button>
            )}
            {c.status !== "pending" && (
              <Button
                size="sm"
                variant="subtle"
                leftSection={<ArrowCounterClockwiseIcon size={14} />}
                onClick={() => decide("pending")}
              >
                Back to review
              </Button>
            )}
          </>
        )}
      </div>
    </Paper>
  );
}
