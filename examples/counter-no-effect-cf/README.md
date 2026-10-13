# counter-no-effect-cf: a count in a plain Durable Object, over WebSockets

The [`counter`](../counter) example without the Agents SDK: one plain Durable Object holds the count, and every open page keeps a WebSocket to it. It compares line for line with [`counter-effect-cf`](../counter-effect-cf), which writes the same server with [effect-cf](https://github.com/danieljvdm/effect-cf). The two share the same page and WebSocket protocol, and differ only in `src/server.ts` and their dependencies.

```
┌──────────────┐  { _tag }   ┌────────┐  upgrade  ┌──────────────────────┐
│ page (React) │ ──────────► │ Worker │ ────────► │ Counter (DO)         │
│ (each tab)   │ ◄────────── │        │           │ storage: count       │
└──────────────┘  { count }  └────────┘           │ hibernatable sockets │
        ▲                                         └──────────┬───────────┘
        └──────────── { count }, to every socket ────────────┘
```

- [`src/server.ts`](src/server.ts): the `Counter` Durable Object. Its `fetch` accepts a [hibernatable WebSocket](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) and sends the page `{ count }`. Each message is an event, `{ "_tag": "Increment" }` (or `"Decrement"`, or `"Reset"`); the object changes the count in its storage and sends the new `{ count }` to every open socket. A message that isn't one of the events throws a `BadEvent`, and the object closes that socket with code 1007 and the reason. The Worker passes WebSocket upgrades on `/api/counter` to the one `Counter`, and answers anything else there with a 426.
- [`src/client.tsx`](src/client.tsx): shows the count from the socket, sends an event for each button, and reconnects a second after the socket drops.

## Run it

```sh
pnpm install
pnpm dev
```

Open <http://localhost:8802> in two tabs, and click in one to watch the other change at once.

## Deploy

```sh
pnpm deploy
```
