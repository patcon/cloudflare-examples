import { useEffect, useState } from "react";
import { Button, Modal, Stack, Text } from "@mantine/core";
import SpikeMessage from "@/components/participant/SpikeMessage";
import { useDisclosure } from "@mantine/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useAgent } from "agents/react";
import { toast } from "@/components/common/Toaster";
import { repliesKey, useConversationRepliesQuery } from "@/components/participant/hooks";
import type {
  ExploreAgent,
  ExploreMessage,
  ExploreState,
  Reply,
} from "../../../server/features/explore/agent";
import { EXPLORE_WAITS, whyNotExplore } from "../../../shared/features/explore/rules";
import { parse } from "../parse";
import type { PanelProps } from "../types";

/** A reply, as echo's ParticipantBody shows one: an assistant reply. */
const toConversationReply = (sessionId: string, r: Reply): ConversationReply => ({
  id: `reply-${r.id}`,
  type: "assistant_reply",
  content_text: r.text,
  conversation_id: sessionId,
  date_created: new Date(r.at).toISOString(),
  reply: null,
  sort: null,
});

/**
 * Explore as echo's portal offers it: the **ECHO** button in the record
 * bar, while recording. Until Explore can run, the button fills as the
 * recording goes on, and a press says how long is left, as echo's does.
 * Replies join the conversation, through the query echo's ParticipantBody
 * reads. It has its own connection, to this session's `ExploreAgent`.
 */
export function ExploreEcho({
  sessionId,
  facts,
  settings,
  now,
  recording,
}: PanelProps<"explore"> & { recording: boolean }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ExploreState | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [infoOpened, { open: openInfo, close: closeInfo }] = useDisclosure(false);

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
      .catch((e: Error) => toast.error(e.message));
  }, [agent]);

  // The replies, and the one on its way, as it streams.
  const status = state?.status;
  const draft = state?.status === "streaming" ? state.draft : null;
  useEffect(() => {
    const shown = replies.map((r) => toConversationReply(sessionId, r));
    if (status === "waiting" || status === "slow" || status === "streaming") {
      shown.push({
        ...toConversationReply(sessionId, { id: 0, at: Date.now(), text: "", mode: "summarize" }),
        id: "reply-pending",
        content_text: draft || (status === "slow" ? "Still working on it..." : "Thinking..."),
      });
    }
    queryClient.setQueryData(repliesKey(sessionId), shown);
  }, [queryClient, sessionId, replies, status, draft]);

  const failed = state?.status === "failed" ? state.error : null;
  useEffect(() => {
    if (failed) toast.error(failed);
  }, [failed]);

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
  const threshold = EXPLORE_WAITS.sinceStart.recordedSeconds;
  const progress = Math.min((facts.recordedSeconds / threshold) * 100, 100);
  const ready = notYet === null;

  const onClick = () => {
    if (!ready) {
      openInfo();
      return;
    }
    agent.call("explore").catch((e: Error) => toast.error(e.message));
  };

  return (
    <>
      {/* echo's refine info modal, for Explore alone. */}
      <Modal
        opened={infoOpened}
        onClose={closeInfo}
        centered
        size="sm"
        padding="xl"
        title={'"Explore" available soon'}
      >
        <Stack gap="lg">
          <Text>Get an immediate reply from dembrane to help you deepen the conversation.</Text>
          <Text c="dimmed" size="sm">
            We need a bit more context to help you use ECHO effectively. Please continue recording
            so we can provide better suggestions.
          </Text>
          {notYet && (
            <Text c="dimmed" size="sm">
              {notYet}.
            </Text>
          )}
          <Button onClick={closeInfo} fullWidth variant="filled" size="md">
            I understand
          </Button>
        </Stack>
      </Modal>
      {recording && (
        <Button
          size="lg"
          onClick={onClick}
          className="relative overflow-hidden"
          variant={progress < 100 || !ready ? undefined : "filled"}
        >
          {progress < 100 && (
            <div
              className="absolute bottom-0 left-0 top-0 bg-primary-600/20 transition-all duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          )}
          <span className="relative z-10">ECHO</span>
        </Button>
      )}
    </>
  );
}

/**
 * The replies, under the conversation, as echo's ParticipantEchoMessages
 * shows them: dembrane's mark beside each, a rule between them, and a
 * spinner on the one on its way.
 */
export function ExploreReplies({ projectId, sessionId }: { projectId: string; sessionId: string }) {
  const replies = useConversationRepliesQuery(projectId, sessionId).data ?? [];
  return (
    <Stack gap="sm">
      {replies.map((message, index) => (
        <SpikeMessage
          key={message.id}
          message={message}
          loading={message.id === "reply-pending"}
          className={`min-h-[180px] md:min-h-[169px] ${index !== replies.length - 1 ? "border-b" : ""}`}
        />
      ))}
    </Stack>
  );
}
