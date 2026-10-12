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

const getCount = (id: string) =>
  tasks
    .task("counter")
    .getState(id)
    .pipe(Effect.map((state) => state?.count ?? 0));

const sendEvent = (id: string, event: CounterEvent) => tasks.task("counter").send(id, event);

export default {
  async fetch(request) {
    if (new URL(request.url).pathname !== "/api/counter") {
      return new Response("Not found", { status: 404 });
    }
    // POST { "_tag": "Increment" } (or "Decrement", or "Reset") changes the count.
    if (request.method === "POST") {
      const event = await request.json();
      if (!Schema.is(CounterEvent)(event)) return new Response("Bad event", { status: 400 });
      await Effect.runPromise(sendEvent("default", event));
    }
    return Response.json({ count: await Effect.runPromise(getCount("default")) });
  },
} satisfies ExportedHandler<Env>;
