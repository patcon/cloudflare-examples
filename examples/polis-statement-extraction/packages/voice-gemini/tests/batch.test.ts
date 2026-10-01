import { afterEach, expect, it, vi } from "vitest";
import {
  _buildGenerateContentUrl,
  _buildTranscribeRequest,
  _parseTranscribeResponse,
  GeminiBatchSTT
} from "../src/batch";

const options = { accessToken: "test-token", project: "test-project" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("asks for diarization only when told to", () => {
  expect(_buildTranscribeRequest("AAAA", {})).not.toHaveProperty(
    "generationConfig"
  );
  expect(_buildTranscribeRequest("AAAA", { diarize: true })).toMatchObject({
    generationConfig: {
      audioTranscriptionConfig: { mode: "VERBATIM", diarization: true }
    }
  });
});

it("sends WAV unless told the format", () => {
  const mimeType = (request: ReturnType<typeof _buildTranscribeRequest>) =>
    request.contents[0].parts[0].inlineData.mimeType;
  expect(mimeType(_buildTranscribeRequest("AAAA", {}))).toBe("audio/wav");
  expect(
    mimeType(_buildTranscribeRequest("AAAA", { mimeType: "audio/webm" }))
  ).toBe("audio/webm");
});

it("posts to the global generateContent endpoint by default", () => {
  expect(_buildGenerateContentUrl(options)).toBe(
    "https://aiplatform.googleapis.com/v1beta1/projects/test-project/locations/global/publishers/google/models/gemini-3.5-transcribe-preview:generateContent"
  );
});

it("numbers speakers in the order they're first heard", () => {
  const part = (text: string, speakerLabel?: string) => ({
    text,
    audioTranscription: { text, speakerLabel }
  });
  expect(
    _parseTranscribeResponse({
      candidates: [
        {
          content: {
            parts: [
              part("Hello.", "spk:1"),
              part("Hi there.", "spk:0"),
              part("How are you?", "spk:1")
            ]
          }
        }
      ]
    })
  ).toEqual([
    { speaker: 0, text: "Hello." },
    { speaker: 1, text: "Hi there." },
    { speaker: 0, text: "How are you?" }
  ]);
  expect(
    _parseTranscribeResponse({
      candidates: [{ content: { parts: [part(" Just me. ")] } }]
    })
  ).toEqual([{ speaker: null, text: "Just me." }]);
});

it("puts Vertex's reason in the error when a transcription fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("token expired", { status: 401 }))
  );
  await expect(
    new GeminiBatchSTT(options).transcribe(new Uint8Array(44))
  ).rejects.toThrow("Gemini transcription failed (401): token expired");
});
