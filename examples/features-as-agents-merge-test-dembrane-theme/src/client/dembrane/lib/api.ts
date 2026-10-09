// example: ours, in place of echo's API client. Only what the copied files
// call is here, backed by this app's agents.

/**
 * A new conversation. Echo makes it on its server; here a session is made
 * when its page first connects, so this only picks its ID, and keeps its
 * name for that page (`sessionName`).
 */
export const initiateConversation = async (payload: {
  name?: string;
  projectId: string;
  email?: string;
  pin?: string;
  source?: string;
  tagIdList?: string[];
  visitorId?: string;
}): Promise<{ id: string }> => {
  const id = crypto.randomUUID();
  try {
    sessionStorage.setItem(`session-name:${id}`, payload.name ?? "");
  } catch {}
  return { id };
};

/** The name `initiateConversation` kept for a session, or `?name=` in its link. */
export const sessionName = (id: string) => {
  const fromLink = new URLSearchParams(location.search).get("name");
  if (fromLink) return fromLink;
  try {
    return sessionStorage.getItem(`session-name:${id}`) ?? "";
  } catch {
    return "";
  }
};
