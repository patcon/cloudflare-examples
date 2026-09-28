# cloudflare-examples

Small, standalone examples of using Cloudflare with dembrane. Each example has its own `package.json` (pnpm) and README.

| Example | What it shows |
|---|---|
| [`examples/dembrane-auth`](examples/dembrane-auth) | Gating a Worker and a per-user Durable Object on a dembrane (Directus) login, **for a Worker outside dembrane's cookie domain** (such as on `*.workers.dev`). The dashboard hands your token to the Worker in a link |
| [`examples/dembrane-auth-cookie`](examples/dembrane-auth-cookie) | The same demo, **for a Worker inside dembrane's cookie domain** (`.dembrane.com`). The Worker reads dembrane's session cookie, with no link or handoff |
| [`examples/dembrane-auth-cookie-ownership`](examples/dembrane-auth-cookie-ownership) | `dembrane-auth-cookie`, plus **owning an organisation**: owners can change their organisation's projects, members only see them, and platform admins can do anything |
| [`examples/polis-durable-object`](examples/polis-durable-object) | A **Polis-style conversation** in a Durable Object: statements, votes, opinion groups recomputed by an alarm, and a live map over WebSockets. Seeds from a Polis CSV export |
| [`examples/first-come-first-admin`](examples/first-come-first-admin) | **Roles without a login**: the first visitor to a URL becomes its admin, with an admin page only they can open, to retitle the room, reset everyone's counter and make other users admins
| [`examples/session-teleporter`](examples/session-teleporter) | **Moving a session between devices** by PIN or QR code: one Durable Object per PIN relays messages over WebSockets between PartySocket clients. A port of a PartyKit app |
| `examples/statement-extraction-agent` | _Planned._ An **agent that pulls atomic, Polis-style statements** out of speech from a mic, an audio file, or pasted text |
| `examples/proxy-vote-agent` | _Planned._ TBD |
| [`examples/directus`](examples/directus) | A local Directus on SQLite with dembrane's schema, pulled from a dembrane-echo checkout, with seeded users, organisations and projects, to log in to while testing the other examples |
