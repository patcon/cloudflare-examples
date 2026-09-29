/**
 * Sets up each model in `./models.ts`. Kept apart from it because the page
 * imports that file, and these are only for the server.
 */

import {
  WorkersAIFluxSTT,
  WorkersAINova3STT,
  type Transcriber
} from "agents/voice";
import { GeminiBatchSTT, GeminiLiveSTT } from "@cloudflare/voice-gemini";
import {
  MODELS,
  type BatchModelId,
  type Settings,
  type StreamingModelId
} from "./models";
import { WorkersAINova3DiarizedSTT } from "./nova3-diarized";

/** Transcribes a finished recording, such as `GeminiBatchSTT`. */
export type BatchTranscriber = Pick<GeminiBatchSTT, "transcribe">;

/**
 * Each streaming model's transcriber. It only holds settings: a connection
 * opens once per recording, when the voice pipeline creates a session.
 */
export const STREAMING: Record<
  StreamingModelId,
  (env: Env, settings: Settings) => Transcriber
> = {
  "nova-3": (env, { diarize }) =>
    diarize
      ? new WorkersAINova3DiarizedSTT(env.AI)
      : new WorkersAINova3STT(env.AI),
  flux: (env) => new WorkersAIFluxSTT(env.AI),
  "gemini-3.5-transcribe-live-preview": (env, { activityDetection }) => {
    const model = "gemini-3.5-transcribe-live-preview";
    console.log(
      `[${model}] Starting with voice detection`,
      JSON.stringify(activityDetection)
    );
    return new GeminiLiveSTT({
      accessToken: env.GOOGLE_ACCESS_TOKEN,
      project: env.GOOGLE_CLOUD_PROJECT,
      location: MODELS[model].location,
      model,
      activityDetection
    });
  }
};

/** Each batch model's transcriber, for a recording once you stop. */
export const BATCH: Record<BatchModelId, (env: Env) => BatchTranscriber> = {
  "gemini-3.5-transcribe-preview": (env) =>
    new GeminiBatchSTT({
      accessToken: env.GOOGLE_ACCESS_TOKEN,
      project: env.GOOGLE_CLOUD_PROJECT,
      location: MODELS["gemini-3.5-transcribe-preview"].location,
      model: "gemini-3.5-transcribe-preview"
    })
};
