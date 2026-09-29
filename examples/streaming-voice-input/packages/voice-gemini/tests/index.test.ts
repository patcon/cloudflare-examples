import { afterEach, expect, it, vi } from "vitest";
import {
  _buildConnectionUrl,
  _buildGenerateContentUrl,
  _buildSetupMessage,
  _buildTranscribeRequest,
  _parseTranscribeResponse,
  GeminiBatchSTT,
  GeminiLiveSTT
} from "../src/index";

class MockWebSocket extends EventTarget {
  accept = vi.fn();
  send = vi.fn();
  close = vi.fn(() => this.dispatchEvent(new Event("close")));
}

const options = { accessToken: "test-token", project: "test-project" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubSocket() {
  const ws = new MockWebSocket();
  const fetch = vi.fn(async () => ({ webSocket: ws }) as unknown as Response);
  vi.stubGlobal("fetch", fetch);
  return { ws, fetch };
}

function serverMessage(ws: MockWebSocket, message: object) {
  ws.dispatchEvent(
    new MessageEvent("message", { data: JSON.stringify(message) })
  );
}

it("uses the global host unless given a region", () => {
  expect(_buildConnectionUrl()).toMatch(/^https:\/\/aiplatform\.googleapis\.com\//);
  expect(_buildConnectionUrl("europe-west1")).toMatch(
    /^https:\/\/europe-west1-aiplatform\.googleapis\.com\//
  );
});

it("only sends voice detection settings that are set", () => {
  expect(_buildSetupMessage(options).setup).not.toHaveProperty(
    "realtimeInputConfig"
  );
  expect(
    _buildSetupMessage({ ...options, activityDetection: { silenceDurationMs: 500 } })
      .setup
  ).toMatchObject({
    realtimeInputConfig: {
      automaticActivityDetection: { silenceDurationMs: 500 }
    }
  });
});

it("fetches the token from a function for each session", async () => {
  const { ws, fetch } = stubSocket();
  const accessToken = vi.fn(async () => "fresh-token");
  const session = new GeminiLiveSTT({ ...options, accessToken }).createSession();
  await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());
  serverMessage(ws, { setupComplete: {} });
  await session.waitUntilReady?.();

  expect(accessToken).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer fresh-token" })
    })
  );
});

it("buffers audio until setup completes, then sends it as base64", async () => {
  const { ws } = stubSocket();
  const session = new GeminiLiveSTT(options).createSession();
  session.feed(new Uint8Array([1, 2, 3]).buffer);
  await vi.waitFor(() => expect(ws.send).toHaveBeenCalledTimes(1));

  serverMessage(ws, { setupComplete: {} });
  await session.waitUntilReady?.();

  expect(ws.send).toHaveBeenCalledTimes(2);
  expect(JSON.parse(ws.send.mock.calls[1][0])).toEqual({
    realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: "AQID" } }
  });
});

it("turns server messages into speech start, interim and final transcripts", async () => {
  const { ws } = stubSocket();
  const events: string[] = [];
  const session = new GeminiLiveSTT(options).createSession({
    onSpeechStart: () => events.push("start"),
    onInterim: (text) => events.push(`interim:${text}`),
    onUtterance: (text) => events.push(`final:${text}`)
  });
  await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());
  serverMessage(ws, { setupComplete: {} });
  await session.waitUntilReady?.();

  serverMessage(ws, { voiceActivity: { type: "ACTIVITY_START" } });
  serverMessage(ws, { serverContent: { interimInputTranscription: { text: " Hello " } } });
  serverMessage(ws, { serverContent: { inputTranscription: { text: "Hello there." } } });
  await vi.waitFor(() => expect(events).toHaveLength(3));

  expect(events).toEqual(["start", "interim:Hello", "final:Hello there."]);
});

it("ends the audio stream before closing", async () => {
  const { ws } = stubSocket();
  const session = new GeminiLiveSTT(options).createSession();
  await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());
  serverMessage(ws, { setupComplete: {} });
  await session.waitUntilReady?.();

  session.close();

  expect(JSON.parse(ws.send.mock.lastCall![0])).toEqual({
    realtimeInput: { audioStreamEnd: true }
  });
  expect(ws.close).toHaveBeenCalled();
});

it("rejects readiness and reports a fatal error when the socket upgrade fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ webSocket: undefined, status: 401 }) as unknown as Response)
  );
  const fatalErrors: Error[] = [];
  const session = new GeminiLiveSTT(options).createSession({
    onFatalError: (error) => fatalErrors.push(error)
  });

  await expect(session.waitUntilReady?.()).rejects.toThrow(
    "Gemini Live did not return a WebSocket"
  );
  expect(fatalErrors).toHaveLength(1);
});

it("reports one fatal error when Vertex closes, and none for our own close", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { ws } = stubSocket();
  const fatalErrors: Error[] = [];
  const session = new GeminiLiveSTT(options).createSession({
    onFatalError: (error) => fatalErrors.push(error)
  });
  await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

  ws.dispatchEvent(
    new CloseEvent("close", {
      code: 1008,
      reason: "Request had invalid authentication credentials."
    })
  );
  ws.dispatchEvent(new Event("error"));
  session.close();

  expect(fatalErrors).toHaveLength(1);
  expect(fatalErrors[0].message).toMatch(/expired or been revoked/);
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
