import { useCallback, useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { Badge, Button, Input, Surface, Tabs, Text, Textarea } from "@cloudflare/kumo";
import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  CopyIcon,
  LightningIcon,
  PencilSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import type {
  Candidate,
  CandidateStatus,
  ProjectAgent,
  ProjectMessage,
  ProjectState,
  SessionRow,
} from "../../server/project-agent";
import { Shell } from "../ui";

const TABS: { value: CandidateStatus; label: string }[] = [
  { value: "pending", label: "To review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "filtered", label: "Filtered out" },
];

/** For the host: every session's proposed statements, to approve or reject. */
export function Review({ projectId }: { projectId: string }) {
  const [topic, setTopic] = useState("");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [tab, setTab] = useState<CandidateStatus>("pending");
  const [error, setError] = useState<string | null>(null);

  const agent = useAgent<ProjectAgent, ProjectState>({
    agent: "ProjectAgent",
    name: projectId,
    onStateUpdate: (state) => setTopic(state.topic),
    onMessage: (event) => {
      const message = parse(event.data);
      if (message?.type === "sessions") void loadSessions();
      if (message?.type === "candidates") void loadCandidates();
    },
  });

  const loadSessions = useCallback(() => agent.call("listSessions").then(setSessions), [agent]);
  const loadCandidates = useCallback(
    () => agent.call("listCandidates").then(setCandidates),
    [agent],
  );
  useEffect(() => {
    agent.ready.then(() => Promise.all([loadSessions(), loadCandidates()]));
  }, [agent, loadSessions, loadCandidates]);

  const run = (p: Promise<unknown>) =>
    p.then(() => setError(null)).catch((e: Error) => setError(e.message));

  const shown = candidates.filter((c) => c.status === tab);
  const failedRun = sessions.find((s) => s.last_run_error)?.last_run_error;
  const approved = candidates
    .filter((c) => c.status === "approved")
    .map((c) => c.edited_text ?? c.text);
  const sessionLabel = (id: string) => {
    const i = sessions.findIndex((s) => s.id === id);
    return i === -1 ? id.slice(0, 8) : `Session ${sessions.length - i}`;
  };

  return (
    <Shell title={`${projectId} · review`}>
      <Surface className="p-4 rounded-xl ring ring-kumo-line">
        <Input
          label="Topic"
          description="What the conversations are about. It helps pick statements."
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onBlur={() => run(agent.call("setTopic", [topic]))}
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
        {sessions.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2 flex-wrap">
            <a
              className="text-sm underline"
              href={`/${encodeURIComponent(projectId)}/sessions/${s.id}`}
            >
              Session {sessions.length - i}
            </a>
            <Text size="xs" variant="secondary">
              started {new Date(s.started_at).toLocaleTimeString()}
              {s.last_run_at && ` · last run ${new Date(s.last_run_at).toLocaleTimeString()}`}
            </Text>
            {s.last_run_error && <Badge variant="destructive">last run failed</Badge>}
            <Button
              size="xs"
              variant="secondary"
              icon={<LightningIcon size={14} />}
              onClick={() => run(agent.call("extractNow", [s.id]))}
            >
              Extract now
            </Button>
          </div>
        ))}
        {failedRun && (
          <Text size="xs" variant="error">
            {failedRun}
          </Text>
        )}
      </Surface>

      {error && (
        <Text size="sm" variant="error">
          {error}
        </Text>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Tabs
          tabs={TABS.map((t) => ({
            value: t.value,
            label: `${t.label} (${candidates.filter((c) => c.status === t.value).length})`,
          }))}
          value={tab}
          onValueChange={(v) => setTab(v as CandidateStatus)}
        />
        {tab === "approved" && approved.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            icon={<CopyIcon size={14} />}
            onClick={() => navigator.clipboard.writeText(approved.join("\n"))}
          >
            Copy approved
          </Button>
        )}
      </div>

      {shown.length === 0 && (
        <Text size="sm" variant="secondary">
          Nothing here.
        </Text>
      )}
      {shown.map((c) => (
        <CandidateCard
          key={c.id}
          candidate={c}
          session={sessionLabel(c.session_id)}
          decide={(status, edited) => run(agent.call("decide", [c.id, status, edited]))}
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
    <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-2">
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
        <Text size="xs" variant="secondary">
          Edited from: {c.text}
        </Text>
      )}
      {c.quote && (
        <blockquote className="border-l-2 border-kumo-line pl-2 text-xs text-kumo-subtle">
          “{c.quote}”
        </blockquote>
      )}
      {c.rationale && (
        <Text size="xs" variant="secondary">
          {c.rationale}
        </Text>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary">{session}</Badge>
        <Badge variant="secondary">{c.pass === "final" ? "whole session" : "live"}</Badge>
        <Text size="xs" variant="secondary">
          clarity {c.clarity} · divisiveness {c.divisiveness} · novelty {c.novelty}
        </Text>
        {c.filter_reason && <Badge variant="outline">{c.filter_reason.replace("_", " ")}</Badge>}
      </div>
      <div className="flex gap-2 flex-wrap">
        {editing ? (
          <>
            <Button
              size="sm"
              variant="primary"
              icon={<CheckIcon size={14} />}
              onClick={() => {
                decide("approved", draft);
                setEditing(false);
              }}
            >
              Save and approve
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            {c.status !== "approved" && (
              <Button
                size="sm"
                variant="primary"
                icon={<CheckIcon size={14} />}
                onClick={() => decide("approved")}
              >
                Approve
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              icon={<PencilSimpleIcon size={14} />}
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
                variant="secondary"
                icon={<XIcon size={14} />}
                onClick={() => decide("rejected")}
              >
                Reject
              </Button>
            )}
            {c.status !== "pending" && (
              <Button
                size="sm"
                variant="ghost"
                icon={<ArrowCounterClockwiseIcon size={14} />}
                onClick={() => decide("pending")}
              >
                Back to review
              </Button>
            )}
          </>
        )}
      </div>
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
