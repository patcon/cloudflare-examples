// example: ours, in place of echo's API client. Only what the copied files
// call is here, backed by this app's agents.
import type { Outcome, VerifyState } from "../../../server/features/verify/agent";
import { isWriting } from "../../../shared/draft";
import {
  allTopics,
  offeredTopics,
  type VerifySettings,
} from "../../../shared/features/verify/topics";

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

/** Echo lets a participant delete a response. This app's sessions keep everything said. */
export const deleteParticipantConversationChunk = async (
  _projectId: string,
  _conversationId: string,
  _chunkId: string,
): Promise<void> => {
  throw new Error("This example can't delete what was said.");
};

/** Echo emails participants when the report is out. This app sends no email. */
export const submitNotificationParticipant = async (
  _emails: string[],
  _projectId: string,
  _conversationId: string,
): Promise<void> => {};

// Verify. echo's verify screens ask its API, and wait for each answer. Here
// the session page connects to the session's VerifyAgent (`connectVerify`),
// whose calls return once an outcome has started; these wait on its state
// for the outcome to be done.

type VerifyConnection = { call: (method: string, args?: unknown[]) => Promise<unknown> };

let verifyConnection: VerifyConnection | null = null;
let verifyState: VerifyState | null = null;
let verifySettings: VerifySettings | null = null;
const verifyListeners = new Set<() => void>();
const verifyChanged = () => {
  for (const listener of verifyListeners) listener();
};

/** For the session page: its VerifyAgent connection, its state, and the project's Verify settings. */
export const connectVerify = (connection: VerifyConnection | null) => {
  verifyConnection = connection;
  verifyChanged();
};
export const setVerifyState = (state: VerifyState) => {
  verifyState = state;
  verifyChanged();
};
export const setVerifySettings = (settings: VerifySettings) => {
  verifySettings = settings;
  verifyChanged();
};

/** Resolves when `ready` returns something, as the state and settings change. */
const whenVerify = <T>(ready: () => T | null | undefined, signal?: AbortSignal) =>
  new Promise<T>((resolve, reject) => {
    const check = () => {
      if (signal?.aborted) {
        verifyListeners.delete(check);
        const error = new Error("Canceled");
        error.name = "CanceledError";
        reject(error);
        return;
      }
      const value = ready();
      if (value != null) {
        verifyListeners.delete(check);
        resolve(value);
      }
    };
    verifyListeners.add(check);
    signal?.addEventListener("abort", check);
    check();
  });

const verifyCall = async <T = unknown>(method: string, args: unknown[] = []) => {
  const connection = await whenVerify(() => verifyConnection);
  return (await connection.call(method, args)) as T;
};

const iso = (at: number | null) => (at === null ? null : new Date(at).toISOString());

export type VerificationArtifact = {
  id: string;
  approved_at?: string | null;
  date_created?: string | null;
  content: string;
  conversation_id: string;
  key: string;
  topic_label?: string | null;
  read_aloud_stream_url: string;
};

export type VerificationArtifactDetail = Omit<VerificationArtifact, "conversation_id"> & {
  date_created: string | null;
};

export type VerificationTopicMetadata = {
  key: string;
  prompt?: string | null;
  icon?: string | null;
  sort?: number | null;
  is_custom?: boolean;
  translations: Record<string, { label: string }>;
};

export type VerificationTopicsResponse = {
  selected_topics: string[];
  available_topics: VerificationTopicMetadata[];
};

export type UpdateVerificationArtefactPayload = {
  artifactId: string;
  content?: string;
  approvedAt?: string;
  useConversation?: { conversationId: string; timestamp: string };
};

/** An outcome, as echo's artefact. Its date moves on with each revision, as echo's does. */
const toArtifact = (o: Outcome): VerificationArtifact & { date_created: string | null } => ({
  id: String(o.id),
  content: o.content,
  conversation_id: "",
  key: o.topicKey,
  topic_label: o.topicLabel,
  date_created: iso(o.revisedAt ?? o.createdAt),
  approved_at: iso(o.approvedAt),
  // No read-aloud here, so echo's button stays away.
  read_aloud_stream_url: "",
});

export const getVerificationTopics = async (
  _projectId: string,
): Promise<VerificationTopicsResponse> => {
  const settings = await whenVerify(() => verifySettings);
  return {
    selected_topics: offeredTopics(settings).map((t) => t.key),
    available_topics: allTopics(settings).map((t, sort) => ({
      key: t.key,
      prompt: t.prompt,
      icon: t.icon,
      sort,
      is_custom: settings.customTopics.some((c) => c.key === t.key),
      translations: { "en-US": { label: t.label } },
    })),
  };
};

const writingDone = (state: VerifyState | null) =>
  state && !isWriting(state.status) ? state : null;

export const generateVerificationArtefact = async ({
  topicList,
  signal,
}: {
  conversationId: string;
  topicList: string[];
  signal?: AbortSignal;
}): Promise<VerificationArtifact[]> => {
  const before = verifyState?.pendingOutcome?.id;
  await verifyCall("verify", [topicList[0]]);
  // The call returns once the outcome has started, and its state came first.
  const state = await whenVerify(() => {
    const s = writingDone(verifyState);
    return s && (s.status === "failed" || s.pendingOutcome?.id !== before) ? s : null;
  }, signal);
  if (state.status === "failed" || !state.pendingOutcome) {
    throw new Error(state.error ?? "The outcome couldn't be written");
  }
  return [toArtifact(state.pendingOutcome)];
};

export const getVerificationArtefactById = async (
  artifactId: string,
): Promise<VerificationArtifactDetail> => {
  const pending = verifyState?.pendingOutcome;
  if (pending && String(pending.id) === artifactId) return toArtifact(pending);
  const approved = await verifyCall<Outcome[]>("listOutcomes");
  const outcome = approved.find((o) => String(o.id) === artifactId);
  if (!outcome) throw new Error("That outcome is gone");
  return toArtifact(outcome);
};

export const getVerificationArtefacts = async (
  _conversationId: string,
): Promise<VerificationArtifact[]> =>
  (await verifyCall<Outcome[]>("listOutcomes")).map(toArtifact);

export const updateVerificationArtefact = async ({
  content,
  approvedAt,
  useConversation,
}: UpdateVerificationArtefactPayload): Promise<VerificationArtifact> => {
  const pending = verifyState?.pendingOutcome;
  if (!pending) throw new Error("There's no outcome to change");
  if (useConversation) {
    // Revise, then wait for the revision.
    await verifyCall("revise");
    const state = await whenVerify(() => writingDone(verifyState));
    if (state.status === "failed" || !state.pendingOutcome) {
      throw new Error(state.error ?? "The outcome couldn't be revised");
    }
    return toArtifact(state.pendingOutcome);
  }
  // echo saves an edit with the approval.
  if (content !== undefined && content !== pending.content) {
    await verifyCall("editOutcome", [content]);
  }
  if (approvedAt) {
    await verifyCall("approve");
    return toArtifact({ ...pending, content: content ?? pending.content, approvedAt: Date.now() });
  }
  return toArtifact({ ...pending, content: content ?? pending.content });
};
