# counter-no-durable-effect: a count in a plain Durable Object

The [`counter`](../counter) example, cut down to what [durable-effect](https://github.com/backpine/durable-effect) can do, so it compares line for line with [`counter-durable-effect`](../counter-durable-effect). The two share the same page and HTTP API, and differ only in `src/server.ts`.

Compared with `counter`, there's no Agents SDK and no WebSocket: the page reads the count over HTTP and polls once a second, so a change in another tab shows up within a second rather than at once.

```
┌──────────────┐  POST { _tag }     ┌────────┐  send(event)  ┌───────────────────┐
│ page (React) │ ─────────────────► │ Worker │ ────────────► │ Counter (DO)      │
│ polls 1/s    │ ◄───────────────── │        │ ◄──────────── │ storage: { count }│
└──────────────┘  { count }         └────────┘  getState()   └───────────────────┘
```

- [`src/server.ts`](src/server.ts): the `Counter` Durable Object, shaped like a durable-effect task: a state, `{ count }`, changed by tagged events (`Increment`, `Decrement`, `Reset`) through `send`, and read through `getState`. The Worker serves `GET /api/counter` and `POST /api/counter`, and calls the Durable Object over RPC.
- [`src/client.tsx`](src/client.tsx): shows the count, polls for it, and posts an event for each button.

## Run it

```sh
pnpm install
pnpm dev
```

Open <http://localhost:8800> in two tabs, and click in one to watch the other change.

## Deploy

```sh
pnpm deploy
```
