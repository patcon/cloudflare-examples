/**
 * What `GeminiLiveSTT` and `GeminiBatchSTT` share: reaching Vertex AI.
 */

import { VoiceProviderError } from "agents/voice/errors";

/** Options both providers take, to reach Vertex AI. */
export interface VertexOptions {
  /**
   * OAuth access token for Vertex AI, such as from
   * `gcloud auth print-access-token`. Tokens last about an hour, so pass a
   * function to fetch a fresh one for each session or request.
   */
  accessToken: string | (() => string | Promise<string>);
  /** Google Cloud project with Vertex AI enabled. */
  project: string;
  /**
   * Vertex location. Each model is only served from some locations.
   * @default "global"
   */
  location?: string;
}

/** The API host for a Vertex location. */
export function vertexHost(location = "global"): string {
  return location === "global"
    ? "aiplatform.googleapis.com"
    : `${location}-aiplatform.googleapis.com`;
}

/** Fetches the token if it's a function, and rejects an empty one. */
export async function resolveAccessToken(
  accessToken: VertexOptions["accessToken"],
  provider: string,
): Promise<string> {
  const token = typeof accessToken === "function" ? await accessToken() : accessToken;
  if (!token) throw new VoiceProviderError(`${provider} access token is empty`);
  return token;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
