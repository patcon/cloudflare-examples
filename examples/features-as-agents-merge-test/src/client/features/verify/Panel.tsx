import { useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { Button, Meter, Surface, Text } from "@cloudflare/kumo";
import { CheckCircleIcon } from "@phosphor-icons/react";
import type {
  Outcome,
  VerifyAgent,
  VerifyMessage,
  VerifyState,
} from "../../../server/features/verify/agent";
import { MIN_RECORDED_SECONDS } from "../../../shared/constants";
import { whyNotVerify } from "../../../shared/features/verify/rules";
import { offeredTopics } from "../../../shared/features/verify/topics";
import { verifyView } from "../../../shared/features/verify/view";
import { parse } from "../parse";
import type { PanelProps } from "../types";
import { ApprovedList, Instructions, OutcomeView, TopicPicker } from "./Outcome";

/**
 * Verify on the session page: the button, then the topics, the
 * instructions while the outcome is written, and the outcome, in turn; and
 * under them, the approved outcomes. It has its own connection, to this
 * session's `VerifyAgent`.
 */
export function VerifyPanel({ sessionId, facts, settings, now }: PanelProps<"verify">) {
  const [state, setState] = useState<VerifyState | null>(null);
  const [approved, setApproved] = useState<Outcome[]>([]);
  const [error, setError] = useState<string | null>(null);

  const agent = useAgent<VerifyAgent, VerifyState>({
    agent: "VerifyAgent",
    name: sessionId,
    onStateUpdate: setState,
    onMessage: (event) => {
      const message = parse<VerifyMessage>(event.data);
      if (message?.type === "approved") {
        setApproved((a) => [message.outcome, ...a.filter((x) => x.id !== message.outcome.id)]);
      }
    },
  });
  useEffect(() => {
    agent.ready
      .then(() => agent.call("listOutcomes"))
      .then(setApproved)
      .catch((e: Error) => setError(e.message));
  }, [agent]);

  const notYet = state
    ? whyNotVerify({
        enabled: settings.enabled,
        status: state.status,
        recordedSeconds: facts.recordedSeconds,
        segments: facts.segments,
        lastVerifyAt: state.lastVerifyAt,
        now,
      })
    : "Connecting…";
  // The topics on offer, which change as the host changes them.
  const topics = offeredTopics(settings);
  const [picking, setPicking] = useState(false);
  const [awaitingNext, setAwaitingNext] = useState(false);
  const [backed, setBacked] = useState(false);
  // A new outcome opens, even after Back on the one it replaces.
  const pendingId = state?.pendingOutcome?.id;
  useEffect(() => {
    if (pendingId !== undefined) setBacked(false);
  }, [pendingId]);
  // Any page that sees an outcome being written, such as one reloaded
  // mid-way or a second tab, shows the instructions until Next.
  const generating =
    state?.mode === "generate" && (state.status === "waiting" || state.status === "slow");
  useEffect(() => {
    if (generating) setAwaitingNext(true);
  }, [generating]);
  const view = state
    ? verifyView(state, {
        // The chips close when Verify can't start, such as when the host
        // turns it off, or another tab starts an outcome.
        picking: picking && notYet === null,
        awaitingNext,
        backed,
      })
    : "none";

  const verify = (topicKey: string) => {
    setError(null);
    setPicking(false);
    setAwaitingNext(true);
    agent.call("verify", [topicKey]).catch((e: Error) => {
      setAwaitingNext(false);
      setError(e.message);
    });
  };
  // As in the original, one topic needs no picking.
  const startVerify = () => (topics.length === 1 ? verify(topics[0].key) : setPicking(true));
  // Back to the button. The pending outcome stays, one tap away.
  const back = () => {
    setError(null);
    setAwaitingNext(false);
    setBacked(true);
  };
  // Back from a failed outcome also clears why it failed.
  const backFromFailure = () => {
    back();
    agent.call("dismissError").catch((e: Error) => setError(e.message));
  };
  const topicLabel =
    topics.find((t) => t.key === state?.topicKey)?.label ??
    state?.pendingOutcome?.topicLabel ??
    "an outcome";

  return (
    <>
      {view === "none" && (
        <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-1 items-center">
          {state?.pendingOutcome && (
            <Button variant="primary" onClick={() => setBacked(false)}>
              {state.pendingOutcome.topicIcon} Return to outcome
            </Button>
          )}
          <Button
            variant="secondary"
            icon={<CheckCircleIcon size={16} />}
            onClick={startVerify}
            disabled={notYet !== null}
          >
            Verify
          </Button>
          {facts.recordedSeconds < MIN_RECORDED_SECONDS && (
            <Meter
              className="w-full max-w-xs"
              label="Verify"
              showValue={false}
              value={(100 * facts.recordedSeconds) / MIN_RECORDED_SECONDS}
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
        </Surface>
      )}
      {view === "topics" && (
        <TopicPicker topics={topics} start={verify} cancel={() => setPicking(false)} />
      )}
      {view === "instructions" && state && (
        <Instructions
          state={state}
          topicLabel={topicLabel}
          next={() => setAwaitingNext(false)}
          retry={verify}
          leave={backFromFailure}
        />
      )}
      {view === "outcome" && state && (
        <OutcomeView
          state={state}
          now={now}
          back={back}
          revise={() => agent.call("revise")}
          save={(content) => agent.call("editOutcome", [content])}
          approve={() => agent.call("approve")}
        />
      )}
      {view === "none" && approved.length > 0 && <ApprovedList outcomes={approved} />}
    </>
  );
}
