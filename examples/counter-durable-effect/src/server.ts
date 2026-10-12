import { Task, TaskRegistry } from "@durable-effect/task";
import { makeTaskGroupDO } from "@durable-effect/task/cloudflare";
import { env } from "cloudflare:workers";
import { Effect, Schema } from "effect";

const CounterState = Schema.Struct({ count: Schema.Number });
const CounterEvent = Schema.Union([
  Schema.TaggedStruct("Increment", {}),
  Schema.TaggedStruct("Decrement", {}),
  Schema.TaggedStruct("Reset", {}),
]);
export type CounterState = typeof CounterState.Type;
export type CounterEvent = typeof CounterEvent.Type;

/** One count per ID. Events change it, and it's kept in the Durable Object's storage. */
const registry = TaskRegistry.make(
  Task.make("counter", { state: CounterState, event: CounterEvent }),
);

const handlers = registry.for("counter");

const counter = registry.handler("counter", {
  onEvent: handlers.onEvent((ctx, event) =>
    Effect.gen(function* () {
      const count = (yield* ctx.recall())?.count ?? 0;
      switch (event._tag) {
        case "Increment":
          return yield* ctx.save({ count: count + 1 });
        case "Decrement":
          return yield* ctx.save({ count: count - 1 });
        case "Reset":
          return yield* ctx.save({ count: 0 });
      }
    }),
  ),
  // The counter schedules no alarms.
  onAlarm: () => Effect.void,
});

const taskGroup = makeTaskGroupDO(registry.build({ counter }));
export const Counter = taskGroup.DO;
const tasks = taskGroup.client(env.COUNTER);

const getCount = Effect.fn("getCount")(function* (id: string) {
  const state = yield* tasks.task("counter").getState(id);
  return state?.count ?? 0;
});

const sendEvent = Effect.fn("sendEvent")(function* (id: string, event: CounterEvent) {
  yield* tasks.task("counter").send(id, event);
});

/** A POST body that isn't JSON, or isn't one of the events. */
class BadEvent extends Schema.TaggedError<BadEvent>()("BadEvent", { message: Schema.String }) {}

const decodeEvent = Effect.fn("decodeEvent")(function* (body: string) {
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(CounterEvent))(body).pipe(
    Effect.mapError((error) => new BadEvent({ message: error.message })),
  );
});

const handleRequest = Effect.fn("handleRequest")(
  function* (request: Request) {
    if (new URL(request.url).pathname !== "/api/counter") {
      return new Response("Not found", { status: 404 });
    }
    // POST { "_tag": "Increment" } (or "Decrement", or "Reset") changes the count.
    if (request.method === "POST") {
      const event = yield* decodeEvent(yield* Effect.promise(() => request.text()));
      yield* sendEvent("default", event);
    }
    return Response.json({ count: yield* getCount("default") });
  },
  Effect.catchTags({
    BadEvent: (error) => Effect.succeed(new Response(error.message, { status: 400 })),
    // The Durable Object checks the event too, but the Worker has already.
    TaskValidationError: (error) => Effect.succeed(new Response(error.message, { status: 400 })),
    TaskExecutionError: (error) =>
      Effect.succeed(new Response(`Counter failed: ${error.cause}`, { status: 500 })),
  }),
);

export default {
  fetch: (request) => Effect.runPromise(handleRequest(request)),
} satisfies ExportedHandler<Env>;
