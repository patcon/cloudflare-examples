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
  language: string | null;
  name: string | null;
  default_conversation_title: string | null;
  default_conversation_description: string | null;
  default_conversation_ask_for_participant_name: boolean | null;
  conversation_ask_for_participant_name_label: string | null;
  default_conversation_tutorial_slug: string | null;
  tags: (string | ProjectTag)[];
  default_conversation_finish_text: string | null;
  default_conversation_ask_for_participant_email: boolean | null;
  is_project_notification_subscription_allowed: boolean | null;
  is_get_reply_enabled: boolean | null;
  is_verify_enabled: boolean | null;
  is_dembrane_event_cta_enabled: boolean | null;
}

interface ParticipantProject extends Project {
  whitelabel_logo_url: string | null;
  legal_basis: "client-managed" | "consent" | "dembrane-events" | null;
  privacy_policy_url: string | null;
  organiser_name: string | null;
}

interface ConversationArtifact {
  id: string;
  date_created: string | null;
  last_updated_at: string | null;
  content: string | null;
  approved_at: string | null;
  read_aloud_stream_url: string | null;
  key: string | null;
  topic_label: string | null;
  conversation_id: string | null;
}
