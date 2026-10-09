// example: ours, in place of echo's participant hooks, which query its API.
// Only what the copied files call is here. The data comes from this app's
// agents: the page connects to them, and puts what they say where these
// hooks read it.
import { useMutation, useQuery } from "@tanstack/react-query";
import { createContext, createElement, type ReactNode, useContext } from "react";
import type { ProjectState } from "../../../../../server/project/agent";
import { initiateConversation, submitNotificationParticipant } from "@/lib/api";

const ProjectContext = createContext<ParticipantProject | undefined>(undefined);

/** echo's project fields, from this app's project settings. */
export const toParticipantProject = (
  projectId: string,
  state: ProjectState,
): ParticipantProject => ({
  id: projectId,
  language: "en",
  name: state.general.name || projectId,
  default_conversation_title: state.general.portalTitle || null,
  default_conversation_description: state.general.portalContent || null,
  // The start page always asked for a name; Verify's outcomes see it.
  default_conversation_ask_for_participant_name: true,
  conversation_ask_for_participant_name_label: null,
  default_conversation_tutorial_slug: "basic",
  default_conversation_finish_text: null,
  default_conversation_ask_for_participant_email: false,
  is_project_notification_subscription_allowed: false,
  // Explore is echo's "Get reply", behind the ECHO button.
  is_get_reply_enabled: state.explore.enabled,
  is_verify_enabled: state.verify.enabled,
  is_dembrane_event_cta_enabled: false,
  tags: [],
  legal_basis: "client-managed",
  privacy_policy_url: null,
  organiser_name: null,
  whitelabel_logo_url: null,
});

export const ParticipantProjectProvider = ({
  project,
  children,
}: {
  project: ParticipantProject | undefined;
  children: ReactNode;
}) => createElement(ProjectContext.Provider, { value: project }, children);

/** The shape of echo's query, from the project the page provides. */
export const useParticipantProjectById = (_projectId: string) => {
  const data = useContext(ProjectContext);
  return {
    data,
    isLoading: data === undefined,
    isError: false,
    isRefetching: false,
    error: null as Error | null,
    // It's live from the project's agent, so there's nothing to fetch again.
    refetch: async () => {},
  };
};

export const useInitiateConversationMutation = () =>
  useMutation({ mutationFn: initiateConversation });

export const useSubmitNotificationParticipant = () =>
  useMutation({
    mutationFn: ({
      emails,
      projectId,
      conversationId,
    }: {
      emails: string[];
      projectId: string;
      conversationId: string;
    }) => submitNotificationParticipant(emails, projectId, conversationId),
  });

/**
 * echo's query keys, which UserChunkMessage also uses. The session page
 * fills them from its agents, with `queryClient.setQueryData`, so nothing
 * here fetches.
 */
export const chunksKey = (conversationId: string) => [
  "participant",
  "conversation_chunks",
  conversationId,
];
export const repliesKey = (conversationId: string) => [
  "participant",
  "conversation_replies",
  conversationId,
];

export const useConversationChunksQuery = (
  _projectId: string | undefined,
  conversationId: string | undefined,
) =>
  useQuery<TConversationChunk[]>({
    queryKey: chunksKey(conversationId ?? ""),
    queryFn: () => [],
    staleTime: Number.POSITIVE_INFINITY,
  });

export const useConversationRepliesQuery = (
  _projectId: string | undefined,
  conversationId: string | undefined,
) =>
  useQuery<ConversationReply[]>({
    queryKey: repliesKey(conversationId ?? ""),
    queryFn: () => [],
    staleTime: Number.POSITIVE_INFINITY,
  });

// Copied from echo's hooks as is.
export const combineUserChunks = (
  chunks: { type: "user_chunk"; timestamp: Date; data: TConversationChunk }[],
) => {
  return {
    data: {
      ...chunks[0].data,
      transcript: chunks.map((c) => c.data.transcript).join("..."),
    },
    timestamp: chunks[0].timestamp,
    type: "user_chunk" as const,
  };
};
