// example: ours. echo's lib/types.d.ts declares its API's shapes as globals;
// here are only the ones the copied files use.

type TConversationChunk = {
  id: string;
  created_at: Date;
  updated_at: Date;
  conversation_id: string;

  transcript?: string;
  timestamp: Date;
  error?: string | null;
};
