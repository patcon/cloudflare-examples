import { callable } from "agents";
import { IDLE_DRAFT, isWriting, type DraftState } from "../../../shared/draft";
import { whyNotExplore } from "../../../shared/features/explore/rules";
import type { ExploreMode, ExploreSettings } from "../../../shared/features/explore/settings";
import type { GeneralSettings } from "../../../shared/general";
import type { Moment } from "../../../shared/rules";
import { failDraft, finishDraft, recoverDraft, startDraft, streamDraft } from "../../lib/draft";
import { FeatureAgent } from "../../lib/feature-agent";
import { streamText } from "../../lib/gemini";
import { REPLY_MODEL, vertex } from "../../models";
import { buildPrompt, modeUsed } from "./prompt";
import { buildTranscript, formatConversation, sessionLabel } from "./transcript";

export interface ExploreState extends DraftState {
  /** When the last reply finished, on both clocks, for the wait between replies. */
  lastReply: Moment | null;
}

/** A finished reply, written into the transcript at the time it was saved. */
export interface Reply {
  id: number;
  at: number;
  text: string;
  /** How it was written. */
  mode: ExploreMode;
}

/** What Explore broadcasts to its pages. */
export type ExploreMessage = { type: "reply"; reply: Reply };

/**
 * Explore for one session, named by the session's ID: a short reply to
 * the conversation so far, when someone asks, with the project's other
 * sessions as context.
 */
export class ExploreAgent extends FeatureAgent<ExploreState> {
  initialState: ExploreState = { ...IDLE_DRAFT, lastReply: null };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS replies (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, text TEXT NOT NULL, mode TEXT NOT NULL)",
    );
  }

  onStart() {
    recoverDraft(this);
  }

  @callable()
  listReplies(): Reply[] {
    return this.sql<Reply>`SELECT id, at, text, mode FROM replies ORDER BY id`;
  }

  /**
   * Asks Gemini for a short reply to the conversation so far. It returns
   * once the reply has started: the text streams into `draft`, so every
   * open page sees it, and a page that reloads catches up.
   */
  @callable()
  async explore() {
    // Checked before anything awaits, and the draft started, so a second
    // press is refused at once. The rest is checked below, and undone if
    // it refuses.
    if (isWriting(this.state.status)) throw new Error("A reply is on its way");
    const { status, error } = this.state;
    startDraft(this);

    let settings: ExploreSettings;
    let general: GeneralSettings;
    let pressed: Moment;
    try {
      const facts = await (await this.session()).facts();
      const { project } = await this.project();
      // RPC loses `settings`' generic, so the type is put back by hand.
      settings = (await project.settings("explore")) as ExploreSettings;
      general = await project.general();
      pressed = { at: Date.now(), recordedSeconds: facts.recordedSeconds };
      const reason = whyNotExplore({
        enabled: settings.enabled,
        status,
        firstRecordedAt: facts.firstRecordedAt,
        segments: facts.segments,
        lastReply: this.state.lastReply,
        now: pressed,
      });
      if (reason) throw new Error(reason);
    } catch (e) {
      this.setState({ ...this.state, status, error });
      throw e;
    }
    // Not awaited, so the call returns now. This keeps the object awake
    // until the reply is done, even with no page connected.
    void this.keepAliveWhile(() => this.#generateReply(settings, general, pressed));
  }

  /** Streams the reply into state, then saves it. Never throws. */
  async #generateReply(settings: ExploreSettings, general: GeneralSettings, pressed: Moment) {
    try {
      const prompt = buildPrompt(
        settings,
        general,
        formatConversation(sessionLabel(this.name), await this.transcriptForContext()),
        await this.#otherSessions(),
      );
      const text = await streamDraft(
        this,
        streamText(vertex(this.env, REPLY_MODEL), { user: prompt }),
      );
      this.#saveReply(text, modeUsed(settings), await this.moment(pressed));
    } catch (error) {
      console.error(`[${this.name}] Reply failed: ${error}`);
      failDraft(this, error);
    }
  }

  /**
   * The one place a finished reply lands. Speaking it, with `speakAll`
   * after a switch to `withVoice`, would go here.
   */
  #saveReply(text: string, mode: ExploreMode, finished: Moment) {
    const [reply] = this.sql<Reply>`
      INSERT INTO replies (at, text, mode) VALUES (${finished.at}, ${text}, ${mode})
      RETURNING id, at, text, mode`;
    console.log(`[${this.name}] Replied: "${text}"`);
    this.#notify({ type: "reply", reply });
    finishDraft(this, { lastReply: finished });
  }

  /**
   * This session's transcript, with its replies written in. For its own
   * prompt, and over RPC from the project, for another session's.
   */
  async transcriptForContext(): Promise<string> {
    const { segments } = await (await this.session()).segmentsSince(0);
    return buildTranscript(segments, this.listReplies());
  }

  /**
   * The project's other sessions, as context. Without them the reply still
   * comes, from this session alone.
   */
  async #otherSessions(): Promise<string> {
    try {
      return await (await this.project()).project.otherTranscripts(this.name);
    } catch (error) {
      console.error(`[${this.name}] No other sessions as context: ${error}`);
      return "";
    }
  }

  #notify(message: ExploreMessage) {
    this.broadcast(JSON.stringify(message));
  }
}
