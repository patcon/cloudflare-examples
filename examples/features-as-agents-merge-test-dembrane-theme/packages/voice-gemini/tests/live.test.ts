import { afterEach, expect, it, vi } from "vitest";
import { _buildConnectionUrl, _buildSetupMessage, GeminiLiveSTT } from "../src/live";

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
  ws.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
}

it("uses the global host unless given a region", () => {
  expect(_buildConnectionUrl()).toMatch(/^https:\/\/aiplatform\.googleapis\.com\//);
  expect(_buildConnectionUrl("europe-west1")).toMatch(
    /^https:\/\/europe-west1-aiplatform\.googleapis\.com\//,
  );
});

it("only sends voice detection settings that are set", () => {
  expect(_buildSetupMessage(options).setup).not.toHaveProperty("realtimeInputConfig");
  expect(
    _buildSetupMessage({ ...options, activityDetection: { silenceDurationMs: 500 } }).setup,
  ).toMatchObject({
    realtimeInputConfig: {
      automaticActivityDetection: { silenceDurationMs: 500 },
    },
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
      headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }),
    }),
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
    realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: "AQID" } },
  });
});

it("turns server messages into speech start, interim and final transcripts", async () => {
  const { ws } = stubSocket();
  const events: string[] = [];
  const session = new GeminiLiveSTT(options).createSession({
    onSpeechStart: () => events.push("start"),
    onInterim: (text) => events.push(`interim:${text}`),
    onUtterance: (text) => events.push(`final:${text}`),
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

  expect(JSON.parse(ws.send.mock.lastCall?.[0])).toEqual({
    realtimeInput: { audioStreamEnd: true },
  });
  expect(ws.close).toHaveBeenCalled();
});

it("marks the whole session as one segment when detection is disabled", async () => {
  const { ws } = stubSocket();
  const session = new GeminiLiveSTT({
    ...options,
    activityDetection: { disabled: true },
  }).createSession();
  await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());
  expect(JSON.parse(ws.send.mock.calls[0][0]).setup).toMatchObject({
    realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
  });

  serverMessage(ws, { setupComplete: {} });
  await session.waitUntilReady?.();
  session.close();

  const sent = ws.send.mock.calls.slice(1).map(([m]) => JSON.parse(m));
  expect(sent).toEqual([
    { realtimeInput: { activityStart: {} } },
    { realtimeInput: { activityEnd: {} } },
    { realtimeInput: { audioStreamEnd: true } },
  ]);
});

it("rejects readiness and reports a fatal error when the socket upgrade fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ webSocket: undefined, status: 401 }) as unknown as Response),
  );
  const fatalErrors: Error[] = [];
  const session = new GeminiLiveSTT(options).createSession({
    onFatalError: (error) => fatalErrors.push(error),
  });

  await expect(session.waitUntilReady?.()).rejects.toThrow(
    "Gemini Live did not return a WebSocket",
  );
  expect(fatalErrors).toHaveLength(1);
});

it("reports one fatal error when Vertex closes, and none for our own close", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { ws } = stubSocket();
  const fatalErrors: Error[] = [];
  const session = new GeminiLiveSTT(options).createSession({
    onFatalError: (error) => fatalErrors.push(error),
  });
  await vi.waitFor(() => expect(ws.send).toHaveBeenCalled());

  ws.dispatchEvent(
    new CloseEvent("close", {
      code: 1008,
      reason: "Request had invalid authentication credentials.",
    }),
  );
  ws.dispatchEvent(new Event("error"));
  session.close();

  expect(fatalErrors).toHaveLength(1);
  expect(fatalErrors[0].message).toMatch(/expired or been revoked/);
});

/** Hands out a new socket for each connection, as a reconnect makes. */
function stubSockets() {
  const sockets: MockWebSocket[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const ws = new MockWebSocket();
      sockets.push(ws);
      return { webSocket: ws } as unknown as Response;
    }),
  );
  return sockets;
}

const setupOf = (ws: MockWebSocket) => JSON.parse(ws.send.mock.calls[0]?.[0]).setup;

it("asks for a sliding context window and resumption handles", () => {
  expect(_buildSetupMessage(options).setup).toMatchObject({
    contextWindowCompression: { slidingWindow: {} },
    sessionResumption: {},
  });
  expect(_buildSetupMessage(options, "h1").setup.sessionResumption).toEqual({ handle: "h1" });
});

it("resumes on goAway with the latest handle, sending the audio heard meanwhile", async () => {
  const sockets = stubSockets();
  const onFatalError = vi.fn();
  const session = new GeminiLiveSTT(options).createSession({ onFatalError });
  await vi.waitFor(() => expect(sockets[0]?.send).toHaveBeenCalled());
  const [first] = sockets as [MockWebSocket];
  serverMessage(first, { setupComplete: {} });
  await session.waitUntilReady?.();

  serverMessage(first, { sessionResumptionUpdate: { newHandle: "h1", resumable: true } });
  // Not resumable at this point, so h1 stays the one to use.
  serverMessage(first, { sessionResumptionUpdate: { newHandle: "h2", resumable: false } });
  serverMessage(first, { goAway: { timeLeft: "10s" } });
  await vi.waitFor(() => expect(sockets[1]?.send).toHaveBeenCalled());
  const second = sockets[1] as MockWebSocket;
  expect(first.close).toHaveBeenCalled();
  expect(setupOf(second).sessionResumption).toEqual({ handle: "h1" });

  session.feed(new Uint8Array([1, 2, 3]).buffer);
  expect(second.send).toHaveBeenCalledTimes(1);
  serverMessage(second, { setupComplete: {} });
  await vi.waitFor(() => expect(second.send).toHaveBeenCalledTimes(2));
  expect(JSON.parse(second.send.mock.calls[1]?.[0]).realtimeInput.audio.data).toBe("AQID");
  expect(onFatalError).not.toHaveBeenCalled();
});

it("resumes when the connection drops once there's a handle", async () => {
  const sockets = stubSockets();
  const onFatalError = vi.fn();
  const session = new GeminiLiveSTT(options).createSession({ onFatalError });
  await vi.waitFor(() => expect(sockets[0]?.send).toHaveBeenCalled());
  const [first] = sockets as [MockWebSocket];
  serverMessage(first, { setupComplete: {} });
  await session.waitUntilReady?.();
  serverMessage(first, { sessionResumptionUpdate: { newHandle: "h1", resumable: true } });

  first.dispatchEvent(new CloseEvent("close", { code: 1011, reason: "deadline exceeded" }));
  await vi.waitFor(() => expect(sockets[1]?.send).toHaveBeenCalled());
  expect(setupOf(sockets[1] as MockWebSocket).sessionResumption).toEqual({ handle: "h1" });
  expect(onFatalError).not.toHaveBeenCalled();
});

it("doesn't resume when the token is the problem", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const sockets = stubSockets();
  const onFatalError = vi.fn();
  const session = new GeminiLiveSTT(options).createSession({ onFatalError });
  await vi.waitFor(() => expect(sockets[0]?.send).toHaveBeenCalled());
  const [first] = sockets as [MockWebSocket];
  serverMessage(first, { setupComplete: {} });
  await session.waitUntilReady?.();
  serverMessage(first, { sessionResumptionUpdate: { newHandle: "h1", resumable: true } });

  first.dispatchEvent(
    new CloseEvent("close", {
      code: 1008,
      reason: "Request had invalid authentication credentials.",
    }),
  );
  await vi.waitFor(() => expect(onFatalError).toHaveBeenCalled());
  expect(sockets).toHaveLength(1);
});
