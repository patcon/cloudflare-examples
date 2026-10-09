// example: ours. echo's is generated from its Directus schema; here are only
// the types the copied files use, as globals, as there.

interface ConversationReply {
  content_text: string | null;
  conversation_id: string | null;
  date_created: string | null;
  id: string;
  reply: string | null;
  sort: number | null;
  type: string | null;
}

interface ProjectTag {
  id: string;
  text: string | null;
}

interface Project {
  id: string;
  name: string | null;
  default_conversation_title: string | null;
  default_conversation_description: string | null;
  default_conversation_ask_for_participant_name: boolean | null;
  conversation_ask_for_participant_name_label: string | null;
  default_conversation_tutorial_slug: string | null;
  tags: (string | ProjectTag)[];
}

interface ParticipantProject extends Project {
  whitelabel_logo_url: string | null;
  legal_basis: "client-managed" | "consent" | "dembrane-events" | null;
  privacy_policy_url: string | null;
  organiser_name: string | null;
}
