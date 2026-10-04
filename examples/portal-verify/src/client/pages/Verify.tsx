import { useState } from "react";
import Markdown from "react-markdown";
import { Button, Loader, Surface, Text } from "@cloudflare/kumo";
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  PencilSimpleLineIcon,
} from "@phosphor-icons/react";
import type { SessionState } from "../../server/session-agent";
import { isWriting, whyNotRevise } from "../../shared/rules";
import type { Topic } from "../../shared/topics";

/** "What do you want to verify?": a chip for each topic, then **Next**. */
export function TopicPicker({
  topics,
  start,
  cancel,
}: {
  topics: readonly Topic[];
  start: (topicKey: string) => void;
  cancel: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-4">
      <Text size="lg" bold>
        What do you want to verify?
      </Text>
      <div className="flex flex-wrap gap-2">
        {topics.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={selected === t.key}
            onClick={() => setSelected(t.key)}
            className={`flex items-center gap-2 rounded-full border-2 px-3 py-2 text-sm cursor-pointer ${
              selected === t.key
                ? "border-kumo-brand bg-kumo-info-tint"
                : "border-kumo-line hover:bg-kumo-tint"
            }`}
          >
            <span className="text-lg">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" icon={<ArrowLeftIcon size={16} />} onClick={cancel}>
          Back
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={!selected}
          onClick={() => selected && start(selected)}
        >
          Next <ArrowRightIcon size={16} />
        </Button>
      </div>
    </Surface>
  );
}

/** The five steps of the original, shown while the outcome is written. */
const STEPS = [
  (label: string) => `You'll soon get ${label} to verify.`,
  (label: string) =>
    `Once you receive the ${label}, read it aloud and share out loud what you want to change, if anything.`,
  (label: string) =>
    `Once you have discussed, hit "revise" to see the ${label} change to reflect your discussion.`,
  (label: string) => `If you are happy with the ${label} click "Approve" to show you feel heard.`,
  () => "Your approval helps us understand what you really think!",
];

/**
 * The instructions, while the outcome is written. **Next** turns on when
 * it's complete. A failed outcome shows why, with **Try again**.
 */
export function Instructions({
  state,
  topicLabel,
  next,
  retry,
  leave,
}: {
  state: SessionState;
  topicLabel: string;
  next: () => void;
  retry: (topicKey: string) => void;
  leave: () => void;
}) {
  const { verifyStatus, verifyError, verifyTopicKey } = state;
  const writing = isWriting(verifyStatus);
  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-5">
      <ol className="flex flex-col gap-4">
        {STEPS.map((step, i) => (
          <li key={step(topicLabel)} className="flex gap-3 items-start">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                writing ? "bg-kumo-brand text-white" : "bg-kumo-recessed text-kumo-subtle"
              }`}
            >
              {i + 1}
            </span>
            <span className="text-sm text-kumo-default pt-1.5">{step(topicLabel)}</span>
          </li>
        ))}
      </ol>
      {verifyStatus === "slow" && (
        <Text size="sm" variant="secondary">
          Still working on it…
        </Text>
      )}
      {verifyStatus === "failed" ? (
        <div className="flex flex-col gap-2 items-start">
          <Text size="sm" variant="error">
            {verifyError}
          </Text>
          <div className="flex gap-2">
            <Button variant="ghost" icon={<ArrowLeftIcon size={16} />} onClick={leave}>
              Back
            </Button>
            {verifyTopicKey && (
              <Button
                variant="secondary"
                icon={<ArrowClockwiseIcon size={16} />}
                onClick={() => retry(verifyTopicKey)}
              >
                Try again
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Button variant="primary" disabled={writing} onClick={next}>
          {writing ? (
            <>
              Loading <Loader size="sm" />
            </>
          ) : (
            <>
              Next <ArrowRightIcon size={16} />
            </>
          )}
        </Button>
      )}
    </Surface>
  );
}

/**
 * The pending outcome, as Markdown, with **Back** and **Revise**. A
 * revision streams in over the old text.
 */
export function OutcomeView({
  state,
  now,
  back,
  revise,
}: {
  state: SessionState;
  now: number;
  back: () => void;
  revise: () => Promise<unknown>;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const outcome = state.pendingOutcome;
  if (!outcome) return null;
  const revising = state.verifyStatus === "revising";
  // Only the waits disable the button. With no new speech it stays on, and
  // a press says so, as in the original.
  const wait = whyNotRevise({
    verifyStatus: state.verifyStatus,
    lastReviseAt: state.lastReviseAt,
    newSegments: 1,
    now,
  });
  const onRevise = () => {
    setNotice(null);
    revise().catch((e: Error) => setNotice(e.message));
  };
  return (
    <Surface className="p-4 rounded-xl ring ring-kumo-line flex flex-col gap-3">
      <Text size="xs" variant="secondary">
        {outcome.topicIcon} {outcome.topicLabel}
        {outcome.revisedAt && ` · revised ${new Date(outcome.revisedAt).toLocaleTimeString()}`}
      </Text>
      <div className={`markdown text-sm text-kumo-default ${revising ? "opacity-60" : ""}`}>
        <Markdown>{revising && state.verifyDraft ? state.verifyDraft : outcome.content}</Markdown>
      </div>
      {(notice || state.verifyError) && (
        <Text size="sm" variant="secondary">
          {notice || state.verifyError}
        </Text>
      )}
      <div className="flex gap-2">
        <Button variant="ghost" icon={<ArrowLeftIcon size={16} />} onClick={back}>
          Back
        </Button>
        <Button
          variant="secondary"
          icon={revising ? <Loader size="sm" /> : <PencilSimpleLineIcon size={16} />}
          disabled={wait !== null}
          onClick={onRevise}
        >
          {revising
            ? "Revising…"
            : wait?.startsWith("Wait")
              ? `Revise (${wait.match(/\d+/)?.[0]}s)`
              : "Revise"}
        </Button>
      </div>
    </Surface>
  );
}
