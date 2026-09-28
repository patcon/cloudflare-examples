# session-teleporter: move a session between devices by PIN or QR code

A minimal example of **handing a session from one device to another** without logging in. Device A shows a 6-digit PIN, a link and a QR code. Device B opens the link or types the PIN, asks for the session, and device A sends its session ID across. The goal is to move something like a Polis `xid` to a phone without a login.

It's a port of [patcon/partykit-teleport-session](https://github.com/patcon/partykit-teleport-session) from PartyKit to a Hono Worker and a Durable Object. The client still uses [PartySocket](https://www.npmjs.com/package/partysocket), which is just a reconnecting WebSocket, so it barely changed.

## Run it

```sh
pnpm install
pnpm dev        # http://localhost:8792
```

Open <http://localhost:8792> and click **Generate Transfer Link**, then open the link in another tab. The second tab shows `Received session: …` with the first tab's session ID. Or click **Have a PIN?** in the second tab and type the PIN.

`pnpm dev` runs `pnpm build` first (the `build` in `wrangler.jsonc`), which bundles `client/` into `public/dist/client.js` with esbuild, and it rebuilds when `client/` changes.

## How it works

- **One Durable Object per PIN.** Both devices open a socket to `/teleporter/<pin>`. The Worker sends the upgrade to `TELEPORTER.getByName(pin)`, so both land in the same `Teleporter` instance.
- **A dumb relay.** `Teleporter` accepts each socket with the hibernation API (`ctx.acceptWebSocket`) and passes every message to every *other* socket on the same PIN (`ctx.getWebSockets()`). It stores nothing, and it can sleep between messages while the sockets stay open.
- **The protocol lives in the client.** The receiver sends `{ "type": "request_session" }`, and the sender answers `{ "type": "session_payload", "payload": { "sessionId": "…" } }`.

| PartyKit | Here |
|---|---|
| `partykit.json` `main`, `TransferParty` class | `src/index.ts` (Hono) + `src/teleporter.ts` (`Teleporter` Durable Object) |
| a room per id, `/parties/main/<room>` | a Durable Object per PIN via `getByName(pin)`, `/teleporter/<pin>` |
| `room.broadcast(data, [connection.id])` | a loop over `ctx.getWebSockets()` that skips the sender |
| `new PartySocket({ host, room, party })` | `new PartySocket({ host: location.host, basePath: "teleporter/<pin>" })` |
| `serve.build` + cache-busting script | wrangler's `build` runs esbuild. Static assets are served with ETags, so no cache busting |

| Route | Does |
|---|---|
| `GET /` | The page (static assets from `public/`) |
| `GET /teleporter/:pin` | WebSocket for a 6-digit PIN. Returns 426 without an upgrade, and 404 for anything that isn't 6 digits |

## Caveats

It's a proof of concept, as the original was. Anyone who knows or guesses a PIN while it's open can ask for the session, and the session ID crosses the relay in plain text. The original repo's to-do list (choosing to send or receive, seeing who's connected, confirming before overwriting a session) still applies.
