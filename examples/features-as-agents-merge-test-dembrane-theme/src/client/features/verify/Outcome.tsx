import { useState } from "react";
import Markdown from "react-markdown";
import {
  ActionIcon,
  Button,
  Chip,
  Group,
  Loader,
  Paper,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  CheckIcon,
  PencilSimpleIcon,
} from "@phosphor-icons/react";
import type { Outcome, VerifyState } from "../../../server/features/verify/agent";
import { isWriting } from "../../../shared/draft";
import { MAX_OUTCOME_CHARS, whyNotRevise } from "../../../shared/features/verify/rules";
import type { Topic } from "../../../shared/features/verify/topics";
import type { SessionFacts } from "../../../shared/rules";

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
  const [picked, setPicked] = useState<string | null>(null);
  // A chip the host takes away while it's picked is no longer picked.
  const selected = topics.some((t) => t.key === picked) ? picked : null;
  return (
    <Paper p="md" className="flex flex-col gap-4">
      <Title order={4}>What do you want to verify?</Title>
      <Chip.Group value={selected} onChange={(key) => setPicked(key as string)}>
        <Group gap="sm">
          {topics.map((t) => (
            <Chip key={t.key} value={t.key} size="md">
              {t.icon} {t.label}
            </Chip>
          ))}
        </Group>
      </Chip.Group>
      <div className="flex gap-2">
        <Button variant="subtle" leftSection={<ArrowLeftIcon size={16} />} onClick={cancel}>
          Back
        </Button>
        <Button
          variant="filled"
          className="flex-1"
          disabled={!selected}
          onClick={() => selected && start(selected)}
        >
          Next <ArrowRightIcon size={16} />
        </Button>
      </div>
    </Paper>
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
  state: VerifyState;
  topicLabel: string;
  next: () => void;
  retry: (topicKey: string) => void;
  leave: () => void;
}) {
  const { status, error, topicKey } = state;
  const writing = isWriting(status);
  return (
    <Paper p="md" className="flex flex-col gap-5">
      <ol className="flex flex-col gap-4">
        {STEPS.map((step, i) => (
          <li key={step(topicLabel)} className="flex gap-3 items-start">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${
                writing
                  ? "bg-[var(--app-action)] text-[var(--app-on-fill)]"
                  : "bg-[var(--app-quiet)] text-[var(--app-muted)]"
              }`}
            >
              {i + 1}
            </span>
            <span className="text-sm pt-1.5">{step(topicLabel)}</span>
          </li>
        ))}
      </ol>
      {status === "slow" && (
        <Text size="sm" c="dimmed">
          Still working on it…
        </Text>
      )}
      {status === "failed" ? (
        <div className="flex flex-col gap-2 items-start">
          <Text size="sm" c="red">
            {error}
          </Text>
          <div className="flex gap-2">
            <Button variant="subtle" leftSection={<ArrowLeftIcon size={16} />} onClick={leave}>
              Back
            </Button>
            {topicKey && (
              <Button
                leftSection={<ArrowClockwiseIcon size={16} />}
                onClick={() => retry(topicKey)}
              >
                Try again
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Button variant="filled" disabled={writing} onClick={next}>
          {writing ? (
            <>
              Loading <Loader size="xs" />
            </>
          ) : (
            <>
              Next <ArrowRightIcon size={16} />
            </>
          )}
        </Button>
      )}
    </Paper>
  );
}

/**
 * The pending outcome, as Markdown, with **Back**, **Revise**, **Approve**
 * and the pencil, which edits it as plain text. A revision streams in over the old
 * text.
 */
export function OutcomeView({
  state,
  facts,
  now,
  back,
  revise,
  save,
  approve,
}: {
  state: VerifyState;
  /** The session's facts, live on this page, for Revise's waits. */
  facts: SessionFacts;
  now: number;
  back: () => void;
  revise: () => Promise<unknown>;
  save: (content: string) => Promise<unknown>;
  approve: () => Promise<unknown>;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  /** The text being edited, or null when not editing. */
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const outcome = state.pendingOutcome;
  if (!outcome) return null;
  const revising = isWriting(state.status) && state.mode === "revise";
  // Only the waits disable the button. With no new speech it stays on, and
  // a press says so, as in the original.
  const wait = whyNotRevise({
    status: state.status,
    firstRecordedAt: facts.firstRecordedAt,
    lastRevise: state.lastRevise,
    newSegments: 1,
    now: { at: now, recordedSeconds: facts.recordedSeconds },
  });
  // The seconds left of a wait, on either clock, for the button.
  const waitLeft = wait?.match(/\d+/)?.[0];
  const onRevise = () => {
    setNotice(null);
    revise().catch((e: Error) => setNotice(e.message));
  };
  const onSave = () => {
    if (editing === null) return;
    setNotice(null);
    setSaving(true);
    save(editing)
      .then(() => setEditing(null))
      .catch((e: Error) => setNotice(e.message))
      .finally(() => setSaving(false));
  };

  if (editing !== null) {
    return (
      <Paper p="md" className="flex flex-col gap-3">
        <Textarea
          label={`${outcome.topicIcon} ${outcome.topicLabel}`}
          value={editing}
          maxLength={MAX_OUTCOME_CHARS}
          autosize
          minRows={16}
          className="font-mono text-xs"
          onChange={(e) => setEditing(e.target.value)}
        />
        {notice && (
          <Text size="sm" c="red">
            {notice}
          </Text>
        )}
        <div className="flex gap-2">
          <Button variant="subtle" onClick={() => setEditing(null)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="filled" onClick={onSave} disabled={saving || !editing.trim()}>
            Save
          </Button>
        </div>
      </Paper>
    );
  }
  return (
    <Paper p="md" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Text size="xs" c="dimmed">
          {outcome.topicIcon} {outcome.topicLabel}
          {outcome.revisedAt && ` · revised ${new Date(outcome.revisedAt).toLocaleTimeString()}`}
        </Text>
        <ActionIcon
          aria-label="Edit"
          disabled={revising}
          onClick={() => {
            setNotice(null);
            setEditing(outcome.content);
          }}
        >
          <PencilSimpleIcon size={16} />
        </ActionIcon>
      </div>
      <div className={`markdown text-sm ${revising ? "opacity-60" : ""}`}>
        <Markdown>{revising && state.draft ? state.draft : outcome.content}</Markdown>
      </div>
      {(notice || state.error || waitLeft) && (
        <Text size="sm" c="dimmed">
          {notice || state.error || wait}
        </Text>
      )}
      <div className="flex gap-2">
        <Button variant="subtle" leftSection={<ArrowLeftIcon size={16} />} onClick={back}>
          Back
        </Button>
        <Button
          leftSection={revising ? <Loader size="xs" /> : <ArrowsClockwiseIcon size={16} />}
          disabled={wait !== null}
          onClick={onRevise}
        >
          {revising ? "Revising…" : waitLeft ? `Revise (${waitLeft}s)` : "Revise"}
        </Button>
        <Button
          variant="filled"
          className="ml-auto"
          leftSection={<CheckIcon size={16} />}
          disabled={revising}
          onClick={() => {
            setNotice(null);
            approve().catch((e: Error) => setNotice(e.message));
          }}
        >
          Approve
        </Button>
      </div>
    </Paper>
  );
}

/**
 * The approved outcomes, newest first, below the transcript. Each opens in
 * place; the original opens a modal.
 */
export function ApprovedList({ outcomes }: { outcomes: readonly Outcome[] }) {
  return (
    <Paper p="md" className="flex flex-col gap-2">
      <Text size="xs" c="dimmed">
        Approved
      </Text>
      {outcomes.map((o) => (
        <ApprovedItem key={o.id} outcome={o} />
      ))}
    </Paper>
  );
}

/** One approved outcome: its emoji, label and time, opening to its text. */
export function ApprovedItem({ outcome: o }: { outcome: Outcome }) {
  return (
    <details className="group rounded-lg border">
      <summary className="flex items-center gap-2 cursor-pointer list-none p-3 [&::-webkit-details-marker]:hidden">
        <span className="text-lg">{o.topicIcon}</span>
        <span className="text-sm font-medium flex-1">{o.topicLabel}</span>
        {o.approvedAt && (
          <Text size="xs" c="dimmed">
            {new Date(o.approvedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </Text>
        )}
      </summary>
      <div className="markdown text-sm px-3 pb-3">
        <Markdown>{o.content}</Markdown>
      </div>
    </details>
  );
}
