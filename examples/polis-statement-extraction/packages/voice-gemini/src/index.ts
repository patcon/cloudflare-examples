/**
 * @cloudflare/voice-gemini — Gemini speech-to-text for the Cloudflare Agents
 * voice pipeline, over Vertex AI. See README.md for options.
 *
 * - `GeminiLiveSTT` (`./live.ts`) streams over `BidiGenerateContent`.
 * - `GeminiBatchSTT` (`./batch.ts`) transcribes a finished recording with
 *   `generateContent`.
 */

export {
  GeminiLiveSTT,
  type ActivityDetection,
  type GeminiLiveSTTOptions
} from "./live";
export {
  GeminiBatchSTT,
  type GeminiBatchSTTOptions,
  type TranscribeOptions,
  type TranscriptSegment
} from "./batch";
export {
  resolveAccessToken,
  vertexHost,
  type VertexOptions
} from "./vertex";
