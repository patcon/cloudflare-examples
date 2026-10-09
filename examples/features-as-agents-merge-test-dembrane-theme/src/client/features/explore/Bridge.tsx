import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Stack } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useAgent } from "agents/react";
import SpikeMessage from "@/components/participant/SpikeMessage";
import { toast } from "@/components/common/Toaster";
import { repliesKey, useConversationRepliesQuery } from "@/components/participant/hooks";
import type {
  ExploreAgent,
  ExploreMessage,
  ExploreState,
  Reply,
} from "../../../server/features/explore/agent";
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
 * Explore's connection, for echo's portal, where it's the Explore card
 * behind the **ECHO** button (echo's refine screen). The card comes back to
 * the conversation with `?echo=1`, which asks for a reply here, as echo's
 * audio screen does. Replies join the conversation, through the query
 * echo's ParticipantBody reads. It has its own connection, to this
 * session's `ExploreAgent`, and shows nothing itself.
 */
export function ExploreBridge({ sessionId }: PanelProps<"explore">) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ExploreState | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  // The refine screen turns the ECHO button off until the reply is done.
  const [, , enableRefine] = useLocalStorage({
    defaultValue: false,
    key: `refine_disabled_${sessionId}`,
  });

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

  // echo's `?echo=1`: asks once, then takes it off the URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const asked = searchParams.get("echo") === "1";
  const askedAlready = useRef(false);
  useEffect(() => {
    if (!asked || askedAlready.current) return;
    askedAlready.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete("echo");
    setSearchParams(next, { replace: true });
    agent.ready
      .then(() => agent.call("explore"))
      .catch((e: Error) => {
        enableRefine();
        toast.error(e.message);
      })
      .finally(() => {
        askedAlready.current = false;
      });
  }, [asked, agent, searchParams, setSearchParams, enableRefine]);

  // The replies, and the one on its way, as it streams.
  const status = state?.status;
  const draft = state?.status === "streaming" ? state.draft : null;
  const busy = status === "waiting" || status === "slow" || status === "streaming";
  useEffect(() => {
    const shown = replies.map((r) => toConversationReply(sessionId, r));
    if (busy) {
      shown.push({
        ...toConversationReply(sessionId, { id: 0, at: Date.now(), text: "", mode: "summarize" }),
        id: "reply-pending",
        content_text: draft || (status === "slow" ? "Still working on it..." : "Thinking..."),
      });
    }
    queryClient.setQueryData(repliesKey(sessionId), shown);
  }, [queryClient, sessionId, replies, busy, status, draft]);

  // Done, or failed: the ECHO button is back.
  useEffect(() => {
    if (status && !busy) enableRefine();
  }, [status, busy, enableRefine]);

  const failed = state?.status === "failed" ? state.error : null;
  useEffect(() => {
    if (failed) toast.error(failed);
  }, [failed]);

  return null;
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
