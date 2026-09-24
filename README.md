# cloudflare-examples

Small, standalone examples of using Cloudflare with dembrane. Each example has its own `package.json` (pnpm) and README.

| Example | What it shows |
|---|---|
| [`examples/dembrane-auth`](examples/dembrane-auth) | Gating a Worker and a per-user Durable Object on a dembrane (Directus) login, **for a Worker outside dembrane's cookie domain** (such as on `*.workers.dev`). The dashboard hands your token to the Worker in a link |
| [`examples/dembrane-auth-cookie`](examples/dembrane-auth-cookie) | The same demo, **for a Worker inside dembrane's cookie domain** (`.dembrane.com`). The Worker reads dembrane's session cookie, with no link or handoff |
| [`examples/dembrane-auth-cookie-ownership`](examples/dembrane-auth-cookie-ownership) | `dembrane-auth-cookie`, plus **owning an organisation**: owners can change their organisation's projects, members only see them, and platform admins can do anything |
| [`examples/directus`](examples/directus) | A local Directus on SQLite with dembrane's schema, pulled from a dembrane-echo checkout, with seeded users, organisations and projects, to log in to while testing the other examples |
