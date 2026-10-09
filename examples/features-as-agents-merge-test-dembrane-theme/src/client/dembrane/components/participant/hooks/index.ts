// example: ours, in place of echo's participant hooks, which query its API.
// Only what the copied files call is here. The project comes from this
// app's ProjectAgent, which the page connects to once and provides.
import { useMutation } from "@tanstack/react-query";
import { createContext, createElement, type ReactNode, useContext } from "react";
import type { ProjectState } from "../../../../../server/project/agent";
import { initiateConversation } from "@/lib/api";

const ProjectContext = createContext<ParticipantProject | undefined>(undefined);

/** echo's project fields, from this app's project settings. */
export const toParticipantProject = (projectId: string, state: ProjectState): ParticipantProject => ({
  id: projectId,
  name: state.general.name || projectId,
  default_conversation_title: state.general.portalTitle || null,
  default_conversation_description: state.general.portalContent || null,
  // The start page always asked for a name; Verify's outcomes see it.
  default_conversation_ask_for_participant_name: true,
  conversation_ask_for_participant_name_label: null,
  default_conversation_tutorial_slug: "basic",
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
  return { data, isLoading: data === undefined, error: null as Error | null };
};

export const useInitiateConversationMutation = () =>
  useMutation({ mutationFn: initiateConversation });
