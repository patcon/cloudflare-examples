import { useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { Badge, Button, Loader, Meter, Surface, Text } from "@cloudflare/kumo";
import { ArrowClockwiseIcon, SparkleIcon } from "@phosphor-icons/react";
import type {
  ExploreAgent,
  ExploreMessage,
  ExploreState,
  Reply,
} from "../../../server/features/explore/agent";
import { EXPLORE_WAITS, whyNotExplore } from "../../../shared/features/explore/rules";
import type { ExploreMode } from "../../../shared/features/explore/settings";
import { parse } from "../parse";
import type { PanelProps } from "../types";

const MODE_LABELS: Record<ExploreMode, string> = {
  summarize: "Summarize",
  brainstorm: "Brainstorm",
  custom: "Custom",
};

/**
 * Explore on the session page: the button, then the replies, the one on
 * its way, or why it failed. It has its own connection, to this session's
 * `ExploreAgent`.
 */
export function ExplorePanel({ sessionId, facts, settings, now }: PanelProps<"explore">) {
  const [state, setState] = useState<ExploreState | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [error, setError] = useState<string | null>(null);

  const agent = useAgent<ExploreAgent, ExploreState>({
    agent: "ExploreAgent",
    name: sessionId,
    onStateUpdate: setState,
    onMessage: (event) => {
      const message = parse<ExploreMessage>(event.data);
      if (message?.type === "reply") {
        setReplies((r) => (r.some((x) => x.id === message.reply.id) ? r : [...r, message.reply]));
      }
    },
  });
  useEffect(() => {
    agent.ready
      .then(() => agent.call("listReplies"))
      .then(setReplies)
      .catch((e: Error) => setError(e.message));
  }, [agent]);

  const notYet = state
    ? whyNotExplore({
        enabled: settings.enabled,
        status: state.status,
        firstRecordedAt: facts.firstRecordedAt,
        segments: facts.segments,
        lastReply: state.lastReply,
        now: { at: now, recordedSeconds: facts.recordedSeconds },
      })
    : "Connecting…";

  const explore = () => {
    setError(null);
    agent.call("explore").catch((e: Error) => setError(e.message));
  };

  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3">
      <div className="flex flex-col gap-1 items-center">
        <Button
          variant="secondary"
          icon={<SparkleIcon size={16} />}
          onClick={explore}
          disabled={notYet !== null}
        >
          Explore
        </Button>
        {facts.recordedSeconds < EXPLORE_WAITS.sinceStart.recordedSeconds && (
          <Meter
            className="w-full max-w-xs"
            label="Explore"
            showValue={false}
            value={(100 * facts.recordedSeconds) / EXPLORE_WAITS.sinceStart.recordedSeconds}
          />
        )}
        {notYet && (
          <Text size="xs" variant="secondary">
            {notYet}
          </Text>
        )}
        {error && (
          <Text size="sm" variant="error">
            {error}
          </Text>
        )}
      </div>

      {replies.map((r) => (
        <div key={r.id} className="flex flex-col gap-0.5 border-t border-kumo-line pt-3">
          <div className="flex gap-2 items-center">
            <Text size="xs" variant="secondary">
              {new Date(r.at).toLocaleTimeString()}
            </Text>
            <Badge variant="secondary">{MODE_LABELS[r.mode]}</Badge>
          </div>
          <p className="text-sm text-kumo-default">{r.text}</p>
        </div>
      ))}
      {(state?.status === "waiting" || state?.status === "slow") && (
        <div className="flex gap-2 items-center">
          <Loader size="sm" />
          <Text size="sm" variant="secondary">
            {state.status === "slow" ? "Still working on it…" : "Thinking…"}
          </Text>
        </div>
      )}
      {state?.status === "streaming" && <p className="text-sm text-kumo-default">{state.draft}</p>}
      {state?.status === "failed" && (
        <div className="flex flex-col gap-2 items-start">
          <Text size="sm" variant="error">
            {state.error}
          </Text>
          <Button
            size="sm"
            variant="secondary"
            icon={<ArrowClockwiseIcon size={14} />}
            onClick={explore}
          >
            Try again
          </Button>
        </div>
      )}
    </Surface>
  );
}
