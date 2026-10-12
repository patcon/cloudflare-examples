# counter: a count in an Agent, synced live

The smallest [Agents SDK](https://developers.cloudflare.com/agents/) app: one `Counter` agent keeps a number, and every page open on it sees the number change at the same moment. The page uses [Kumo](https://github.com/cloudflare/kumo), Cloudflare's own components, as the [agents-starter](https://github.com/cloudflare/agents-starter) does.

It follows the agents package's [getting started guide](https://developers.cloudflare.com/agents/getting-started/quick-start/).

```
┌──────────────┐  increment() over WebSocket  ┌─────────────────────┐
│ page (React) │ ───────────────────────────► │ Counter agent       │
│ useAgent()   │ ◄─────────────────────────── │ setState({ count }) │
└──────────────┘  new state, to every page    │ kept in SQLite      │
                                              └─────────────────────┘
```

- [`src/server.ts`](src/server.ts): the `Counter` agent, with `increment`, `decrement` and `reset` as `@callable()` methods. `setState` saves the count and sends it to every connected page.
- [`src/client.tsx`](src/client.tsx): `useAgent` connects to the agent named `default`, shows `agent.state.count`, and calls the methods through `agent.stub`.

## Run it

```sh
pnpm install
pnpm dev
```

Open <http://localhost:8799> in two tabs, and click in one to watch the other change. The count survives a restart of the dev server, since it's kept in the agent's SQLite.

## Deploy

```sh
pnpm deploy
```
