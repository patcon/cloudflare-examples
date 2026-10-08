import { callable } from "agents";
import { IDLE_DRAFT, isWriting, type DraftState } from "../../../shared/draft";
import {
  MAX_OUTCOME_CHARS,
  NO_NEW_FEEDBACK,
  whyNotRevise,
  whyNotVerify,
} from "../../../shared/features/verify/rules";
import type { Topic } from "../../../shared/features/verify/topics";
import { failDraft, finishDraft, recoverDraft, startDraft, streamDraft } from "../../lib/draft";
import { FeatureAgent } from "../../lib/feature-agent";
import { streamText, type Prompt } from "../../lib/gemini";
import { OUTCOME_MODEL, vertex } from "../../models";
import { generatePrompt, revisePrompt } from "./prompt";
import { buildTranscript, feedbackSince } from "./transcript";

export interface VerifyState extends DraftState {
  /** Whether the draft is a new outcome or a revision of the pending one. */
  mode: "generate" | "revise";
  /** The topic of the outcome being written, or last written. */
  topicKey: string | null;
  /** The outcome made and not yet approved, if any. */
  pendingOutcome: Outcome | null;
  /** When the last new outcome was complete, for the cooldown. */
  lastVerifyAt: number | null;
  /** When the last revision finished, or a Revise found no feedback. */
  lastReviseAt: number | null;
}

/**
 * A document Verify wrote from the conversation. It keeps its own copy of
 * the topic's label and emoji, so it still shows after the topic is gone.
 *
 * A type, not an interface, so it fits `sql.exec`'s row type.
 */
export type Outcome = {
  id: number;
  topicKey: string;
  topicLabel: string;
  topicIcon: string;
  content: string;
  /** When the text was first saved, as the original's `date_created`. */
  createdAt: number;
  revisedAt: number | null;
  approvedAt: number | null;
};

/**
 * An `outcomes` row's columns, named as in `Outcome`. Written into the SQL,
 * so it goes through `ctx.storage.sql.exec`, as `this.sql` would bind it
 * as a value.
 */
const OUTCOME_COLUMNS = `id, topic_key AS topicKey, topic_label AS topicLabel,
  topic_icon AS topicIcon, content, created_at AS createdAt,
  revised_at AS revisedAt, approved_at AS approvedAt`;

/** What Verify broadcasts to its pages. */
export type VerifyMessage = { type: "approved"; outcome: Outcome };

/**
 * Verify for one session, named by the session's ID: an outcome on a topic
 * the group picks, written from the transcript, which the group revises
 * from what they say next, and approves.
 */
export class VerifyAgent extends FeatureAgent<VerifyState> {
  initialState: VerifyState = {
    ...IDLE_DRAFT,
    mode: "generate",
    topicKey: null,
    pendingOutcome: null,
    lastVerifyAt: null,
    lastReviseAt: null,
  };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS outcomes (
        id INTEGER PRIMARY KEY, topic_key TEXT NOT NULL, topic_label TEXT NOT NULL,
        topic_icon TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL,
        revised_at INTEGER, approved_at INTEGER)`,
    );
  }

  onStart() {
    recoverDraft(this);
  }

  /**
   * Asks Gemini for an outcome on the topic. It returns once the outcome has
   * started: the text streams into `draft`, so every open page sees it, and
   * a page that reloads catches up. The finished outcome replaces the
   * pending one, whose row stays, unapproved, as in the original.
   */
  @callable()
  async verify(topicKey: string) {
    // Checked before anything awaits, and the draft started, so a second
    // press is refused at once. The rest is checked below, and undone if
    // it refuses.
    if (isWriting(this.state.status)) throw new Error("An outcome is being written");
    const before = pick(this.state);
    startDraft(this);
    this.setState({ ...this.state, mode: "generate", topicKey });

    let topic: Topic;
    let prompt: Prompt;
    try {
      const session = await this.session();
      const facts = await session.facts();
      const reason = whyNotVerify({
        // The project's switch is checked by its `topic()` below, with the
        // same reason.
        enabled: true,
        status: before.status,
        recordedSeconds: facts.recordedSeconds,
        segments: facts.segments,
        lastVerifyAt: this.state.lastVerifyAt,
        now: Date.now(),
      });
      if (reason) throw new Error(reason);
      const { projectId, project } = await this.project();
      topic = await project.topic(topicKey);
      const { segments } = await session.segmentsSince(0);
      prompt = generatePrompt(
        topic.prompt,
        projectId,
        this.#outcomes("ORDER BY id"),
        buildTranscript(segments),
      );
    } catch (error) {
      this.setState({ ...this.state, ...before });
      throw error;
    }
    // Not awaited, so the call returns now. This keeps the object awake
    // until the outcome is done, even with no page connected.
    void this.keepAliveWhile(() => this.#generate(topic, prompt));
  }

  /** Streams the outcome into state, then saves it. Never throws. */
  async #generate(topic: Topic, prompt: Prompt) {
    try {
      const text = await streamDraft(this, streamText(vertex(this.env, OUTCOME_MODEL), prompt));
      // Saved, and so dated, once the text is complete, as in the original.
      const now = Date.now();
      const [outcome] = this.ctx.storage.sql
        .exec<Outcome>(
          `INSERT INTO outcomes (topic_key, topic_label, topic_icon, content, created_at)
          VALUES (?, ?, ?, ?, ?) RETURNING ${OUTCOME_COLUMNS}`,
          topic.key,
          topic.label,
          topic.icon,
          text,
          now,
        )
        .toArray();
      console.log(`[${this.name}] Outcome ${outcome.id} on ${topic.key}`);
      finishDraft(this, { pendingOutcome: outcome, lastVerifyAt: now, lastReviseAt: null });
    } catch (error) {
      console.error(`[${this.name}] Outcome failed: ${error}`);
      failDraft(this, error);
    }
  }

  /**
   * Revises the pending outcome from what the group said since it was made
   * or last revised. The original sends everything since it was made, each
   * time, so a revision gets feedback an earlier one already used. As
   * `verify()`, it returns once the revision has started.
   */
  @callable()
  async revise() {
    const outcome = this.state.pendingOutcome;
    if (!outcome) throw new Error("There's no outcome to revise");
    // The waits first, before anything awaits. Whether there's feedback
    // needs the transcript, below.
    const wait = whyNotRevise({
      status: this.state.status,
      lastReviseAt: this.state.lastReviseAt,
      newSegments: 1,
      now: Date.now(),
    });
    if (wait) throw new Error(wait);
    const before = pick(this.state);
    startDraft(this);
    this.setState({ ...this.state, mode: "revise" });

    let feedback: string;
    let prompt: Prompt;
    try {
      const { segments } = await (await this.session()).segmentsSince(0);
      feedback = feedbackSince(segments, outcome.revisedAt ?? outcome.createdAt);
      prompt = revisePrompt(buildTranscript(segments), outcome.content, feedback);
    } catch (error) {
      this.setState({ ...this.state, ...before });
      throw error;
    }
    if (!feedback) {
      // As in the original, a Revise with nothing new also starts the wait.
      this.setState({ ...this.state, ...before, lastReviseAt: Date.now() });
      throw new Error(NO_NEW_FEEDBACK);
    }
    console.log(`[${this.name}] Revising outcome ${outcome.id} with: ${JSON.stringify(feedback)}`);
    void this.keepAliveWhile(() => this.#revise(outcome.id, prompt));
  }

  /**
   * Streams the revision into state, then saves it over the outcome. On a
   * failure the outcome stays as it was, with the reason. Never throws.
   */
  async #revise(id: number, prompt: Prompt) {
    try {
      const text = await streamDraft(this, streamText(vertex(this.env, OUTCOME_MODEL), prompt));
      const now = Date.now();
      const [outcome] = this.ctx.storage.sql
        .exec<Outcome>(
          `UPDATE outcomes SET content = ?, revised_at = ? WHERE id = ?
          RETURNING ${OUTCOME_COLUMNS}`,
          text,
          now,
          id,
        )
        .toArray();
      if (!outcome) throw new Error("The outcome is gone");
      console.log(`[${this.name}] Revised outcome ${id}`);
      finishDraft(this, { pendingOutcome: outcome, lastReviseAt: now });
    } catch (error) {
      console.error(`[${this.name}] Revision failed: ${error}`);
      // Not `failed`, which would leave the outcome for the instructions:
      // the outcome stays open, with the reason under it.
      finishDraft(this, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Saves the group's own edit of the pending outcome, at once, so every
   * tab shows it, a reload keeps it, and Revise starts from it. The
   * original keeps an edit in the browser until Approve. It leaves the
   * feedback point alone: speech before the edit still counts for Revise.
   */
  @callable()
  editOutcome(content: string) {
    const outcome = this.state.pendingOutcome;
    if (!outcome) throw new Error("There's no outcome to edit");
    if (isWriting(this.state.status)) throw new Error("An outcome is being written");
    if (typeof content !== "string" || !content.trim()) throw new Error("The outcome is empty");
    if (content.length > MAX_OUTCOME_CHARS) {
      throw new Error(`The outcome is over ${MAX_OUTCOME_CHARS} characters`);
    }
    const [edited] = this.ctx.storage.sql
      .exec<Outcome>(
        `UPDATE outcomes SET content = ? WHERE id = ? RETURNING ${OUTCOME_COLUMNS}`,
        content.trim(),
        outcome.id,
      )
      .toArray();
    this.setState({ ...this.state, pendingOutcome: edited, error: null });
  }

  /**
   * Approves the pending outcome, as it reads now, and tells every page.
   * The pages go back to the transcript, where it heads the approved list.
   */
  @callable()
  approve() {
    const outcome = this.state.pendingOutcome;
    if (!outcome) throw new Error("There's no outcome to approve");
    if (isWriting(this.state.status)) throw new Error("An outcome is being written");
    const [approved] = this.ctx.storage.sql
      .exec<Outcome>(
        `UPDATE outcomes SET approved_at = ? WHERE id = ? RETURNING ${OUTCOME_COLUMNS}`,
        Date.now(),
        outcome.id,
      )
      .toArray();
    console.log(`[${this.name}] Approved outcome ${outcome.id}`);
    this.setState({ ...this.state, pendingOutcome: null, error: null });
    this.#notify({ type: "approved", outcome: approved });
    void this.#tellProject();
  }

  /** Tells the project of an approval, for its settings page. */
  async #tellProject() {
    try {
      await (await this.project()).project.changed("verify");
    } catch (error) {
      console.error(`[${this.name}] Couldn't tell the project of an approval: ${error}`);
    }
  }

  /**
   * The approved outcomes, newest approval first. One made and never
   * approved, such as one a new outcome replaced, stays out.
   */
  @callable()
  listOutcomes(): Outcome[] {
    return this.#outcomes("WHERE approved_at IS NOT NULL ORDER BY approved_at DESC, id DESC");
  }

  /**
   * Clears why the last outcome or revision failed, from **Back**. The
   * pending outcome, if any, stays: Back only goes back to the transcript.
   */
  @callable()
  dismissError() {
    if (isWriting(this.state.status)) throw new Error("An outcome is being written");
    this.setState({
      ...this.state,
      status: this.state.status === "failed" ? "idle" : this.state.status,
      error: null,
    });
  }

  /** Outcomes, with the rest of a query after `FROM outcomes`. */
  #outcomes(rest: string, ...bindings: SqlStorageValue[]): Outcome[] {
    return this.ctx.storage.sql
      .exec<Outcome>(`SELECT ${OUTCOME_COLUMNS} FROM outcomes ${rest}`, ...bindings)
      .toArray();
  }

  #notify(message: VerifyMessage) {
    this.broadcast(JSON.stringify(message));
  }
}

/** The draft fields of the state, to put back when a call is refused. */
function pick({ status, mode, topicKey, draft, error }: VerifyState) {
  return { status, mode, topicKey, draft, error };
}
