import { Effect, Layer, Schema } from "effect";
import { DurableObject, DurableObjectState, DurableObjectWebSocket, Worker } from "effect-cf";

export const CounterEvent = Schema.Union([
  Schema.TaggedStruct("Increment", {}),
  Schema.TaggedStruct("Decrement", {}),
  Schema.TaggedStruct("Reset", {}),
]);
export type CounterEvent = typeof CounterEvent.Type;

/** Fails with a `SchemaError` for a message that isn't JSON, or isn't one of the events. */
const decodeEvent = Schema.decodeUnknownEffect(Schema.fromJsonString(CounterEvent));

/** The `COUNTER` namespace, as a service the Worker can use. */
export class Counters extends DurableObject.Tag<Counters>()("Counter", {}) {}

const getCount = Effect.gen(function* () {
  const state = yield* DurableObjectState.DurableObjectState;
  return (yield* state.storage.get<number>("count")) ?? 0;
});

/** Sends `{ count }` to every open socket. */
const broadcast = Effect.fn("broadcast")(function* (count: number) {
  const state = yield* DurableObjectState.DurableObjectState;
  const update = JSON.stringify({ count });
  for (const socket of yield* state.getWebSockets()) {
    // A socket can close before Cloudflare has told the object.
    yield* socket.send(update).pipe(Effect.catchTag("DurableWebSocketSendError", () => Effect.void));
  }
});

/**
 * One count per ID, kept in the Durable Object's storage. Each page holds a
 * WebSocket to it, sends events, and is sent `{ count }` whenever it changes.
 */
export class Counter extends Counters.make(Layer.empty, {
  rpc: {},
  fetch: Effect.gen(function* () {
    // Hibernatable: the object can be evicted while sockets stay open.
    const { server, response } = yield* DurableObjectWebSocket.acceptUpgrade();
    yield* server.send(JSON.stringify({ count: yield* getCount }));
    return response;
  }),

  webSocketMessage: (socket, message) =>
    Effect.gen(function* () {
      const event = yield* decodeEvent(message);
      const count = yield* getCount;
      let next: number;
      switch (event._tag) {
        case "Increment":
          next = count + 1;
          break;
        case "Decrement":
          next = count - 1;
          break;
        case "Reset":
          next = 0;
          break;
      }
      const state = yield* DurableObjectState.DurableObjectState;
      yield* state.storage.put("count", next);
      yield* broadcast(next);
    }).pipe(
      // 1007: the message's data didn't match what the counter accepts.
      Effect.catchTag("SchemaError", (error) => socket.close(1007, error.message.slice(0, 120))),
    ),

  // Cloudflare answers the page's close itself (`web_socket_auto_reply_to_close`),
  // so there's nothing to do, but the handler has to exist.
  webSocketClose: () => Effect.void,
}) {}

export default Worker.make(Counters.layer({ binding: "COUNTER" }), {
  fetch: Effect.gen(function* () {
    const request = yield* Worker.NativeRequest;
    if (new URL(request.url).pathname !== "/api/counter") {
      return new Response("Not found", { status: 404 });
    }
    if (!Worker.isWebSocketUpgrade(request)) {
      return new Response("Expected a WebSocket", { status: 426 });
    }
    const counters = yield* Counters;
    return yield* counters.byName("default").fetch(request);
  }),
});
