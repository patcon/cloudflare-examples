# counter-effect-cf: a count in an effect-cf Durable Object, over WebSockets

[`counter-no-effect-cf`](../counter-no-effect-cf), with its Durable Object and Worker written with [effect-cf](https://github.com/danieljvdm/effect-cf) (`effect-cf` on npm), which wraps Cloudflare's Worker and Durable Object entrypoints and bindings as [Effect](https://effect.website) services. The page and the WebSocket protocol are the same, so compare the two `src/server.ts` files line for line.

```
┌──────────────┐  { _tag }   ┌────────┐  upgrade  ┌──────────────────────┐
│ page (React) │ ──────────► │ Worker │ ────────► │ Counter (DO)         │
│ (each tab)   │ ◄────────── │        │           │ storage: count       │
└──────────────┘  { count }  └────────┘           │ hibernatable sockets │
        ▲                                         └──────────┬───────────┘
        └──────────── { count }, to every socket ────────────┘
```

- [`src/server.ts`](src/server.ts): what changes from the plain version:
  - **The events are a Schema.** `CounterEvent` is a union of tagged structs, and each message is decoded with `Schema.fromJsonString(CounterEvent)`. A message that isn't one of the events fails with a typed `SchemaError`, which `Effect.catchTag` turns into closing that socket with code 1007 and Schema's description of what it expected. That replaces the hand-written `BadEvent` check.
  - **The namespace is a service.** `Counters` is a `DurableObject.Tag`. The Durable Object class comes from `Counters.make(layer, handlers)`, and the Worker gets the `COUNTER` binding as `Counters.layer({ binding: "COUNTER" })` and calls `counters.byName("default").fetch(request)`.
  - **The handlers are Effects.** `fetch`, `webSocketMessage` and `webSocketClose` read `DurableObjectState` as a service, rather than `this.ctx`. `DurableObjectWebSocket.acceptUpgrade()` makes the socket pair and accepts it as hibernatable. Storage, `send` and `close` fail with tagged errors (`StorageOperationError`, `DurableWebSocketSendError`, …) rather than throwing. The broadcast ignores a `DurableWebSocketSendError` from a socket that has already closed.
  - **The Worker** is `Worker.make(layer, { fetch })`, which reads the request from `Worker.NativeRequest`.
- [`src/client.tsx`](src/client.tsx): the same page as `counter-no-effect-cf`.

effect-cf is pinned to an exact version (`0.56.3`) because it's pre-1.0 and releases often. Its tests run against the compatibility date in [`wrangler.jsonc`](wrangler.jsonc), `2026-09-26`.

## Run it

```sh
pnpm install
pnpm dev
```

Open <http://localhost:8803> in two tabs, and click in one to watch the other change at once.

## Deploy

```sh
pnpm deploy
```
