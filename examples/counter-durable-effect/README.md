# counter-durable-effect: a count in a durable-effect task

[`counter-no-durable-effect`](../counter-no-durable-effect), with its Durable Object written as a [durable-effect](https://github.com/backpine/durable-effect) task (`@durable-effect/task`), on [Effect](https://effect.website/) 4. The two share the same page and HTTP API, and differ only in `src/server.ts`. To compare them:

```sh
diff ../counter-no-durable-effect/src/server.ts src/server.ts
```

durable-effect's Durable Object takes events and answers with its state, over RPC. It has no WebSocket, so the page polls once a second, as in `counter-no-durable-effect`.

```
┌──────────────┐  POST { _tag }     ┌────────┐  send(event)  ┌──────────────────────┐
│ page (React) │ ─────────────────► │ Worker │ ────────────► │ "counter" task (DO)  │
│ polls 1/s    │ ◄───────────────── │        │ ◄──────────── │ storage: { count }   │
└──────────────┘  { count }         └────────┘  getState()   └──────────────────────┘
```

- [`src/server.ts`](src/server.ts): the `counter` task. Its state, `{ count }`, and its events (`Increment`, `Decrement`, `Reset`) are Effect schemas, which durable-effect checks on the way in and out. `onEvent` reads the count with `ctx.recall()` and writes it with `ctx.save()`. `makeTaskGroupDO` turns the task into the `Counter` Durable Object class, and its client sends events and reads state from the Worker.
- The Worker's request handler is an Effect too, with typed errors. A POST body that isn't one of the events fails with a `BadEvent` (a `Schema.TaggedError`), decoded with `Schema.fromJsonString(CounterEvent)`, and durable-effect's client fails with a `TaskExecutionError` if the Durable Object does. `Effect.catchTags` turns them into a 400 and a 500, and the compiler flags any it doesn't handle. `counter-no-durable-effect` does the same with `throw` and `try`/`catch`.
- [`src/client.tsx`](src/client.tsx): the same as `counter-no-durable-effect`'s.
- [`CLAUDE.md`](CLAUDE.md): tells coding agents to read the guide that ships in `node_modules/effect/AGENTS.md` before writing Effect code, as the `effect-ts` skill suggests.

## Run it

```sh
pnpm install
pnpm dev
```

Open <http://localhost:8801> in two tabs, and click in one to watch the other change.

## Deploy

```sh
pnpm deploy
```
