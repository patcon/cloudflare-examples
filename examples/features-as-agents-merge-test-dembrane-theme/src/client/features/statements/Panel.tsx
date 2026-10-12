import { useCallback, useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { Anchor, Badge, Button, Stack, Text } from "@mantine/core";
import { LightningIcon } from "@phosphor-icons/react";
import type {
  StatementsAgent,
  StatementsMessage,
  StatementsState,
  WindowRow,
} from "../../../server/features/statements/agent";
import { whyNotExtract } from "../../../shared/features/statements/rules";
import { parse } from "../parse";
import type { PanelProps } from "../types";

/**
 * Statement extraction on the session page: each run so far, and **Extract
 * now**. Runs also happen by themselves while recording. It has its own
 * connection, to this session's `StatementsAgent`. It sits in the session
 * page's Statements modal, which gives it its title.
 */
export function StatementsPanel({
  projectId,
  sessionId,
  facts,
  settings,
}: PanelProps<"statements">) {
  const [state, setState] = useState<StatementsState | null>(null);
  const [windows, setWindows] = useState<WindowRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const agent = useAgent<StatementsAgent, StatementsState>({
    agent: "StatementsAgent",
    name: sessionId,
    onStateUpdate: setState,
    onMessage: (event) => {
      if (parse<StatementsMessage>(event.data)?.type === "windows") void load();
    },
  });
  const load = useCallback(
    () =>
      agent
        .call("listWindows")
        .then(setWindows)
        .catch((e: Error) => setError(e.message)),
    [agent],
  );
  useEffect(() => {
    agent.ready.then(load);
  }, [agent, load]);

  const notYet = state
    ? whyNotExtract({
        enabled: settings.enabled,
        running: state.running,
        // Segment IDs count up from 1, so the newest is the count.
        newSegments: facts.segments - state.cursor,
      })
    : "Connecting…";
  const extract = () => {
    setError(null);
    agent.call("extractNow").catch((e: Error) => setError(e.message));
  };
  const kept = windows.reduce((n, w) => n + w.kept, 0);

  return (
    <Stack gap="xs">
      <div className="flex items-center gap-2 flex-wrap">
        <Text size="xs" c="dimmed">
          {kept} proposed ·{" "}
          <Anchor inherit href={`/${encodeURIComponent(projectId)}/review`}>
            review
          </Anchor>
        </Text>
        <Button
          size="xs"
          className="ml-auto"
          leftSection={<LightningIcon size={14} />}
          onClick={extract}
          disabled={notYet !== null}
        >
          Extract now
        </Button>
      </div>
      <Text size="xs" c="dimmed">
        {notYet ?? "Runs by itself every few minutes while recording, and when it stops."}
      </Text>
      {windows.map((w) => (
        <div key={w.id} className="flex items-center gap-2 text-xs text-[var(--app-muted)]">
          <span>{new Date(w.created_at).toLocaleTimeString()}</span>
          <span>
            segments {w.from_seg}–{w.to_seg}
          </span>
          {w.status === "done" ? (
            <span>
              {w.kept} kept, {w.filtered} filtered
            </span>
          ) : (
            <Badge variant={w.status === "failed" ? "destructive" : "secondary"}>{w.status}</Badge>
          )}
        </div>
      ))}
      {(error || state?.lastRunError) && (
        <Text size="xs" c="red">
          {error || state?.lastRunError}
        </Text>
      )}
    </Stack>
  );
}
