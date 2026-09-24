# cloudflare-examples

Small, standalone examples of using Cloudflare with dembrane. Each example has its own `package.json` (pnpm) and README.

| Example | What it shows |
|---|---|
| [`examples/dembrane-auth`](examples/dembrane-auth) | Gating a Worker and a per-user Durable Object on a dembrane (Directus) login |
| [`examples/dembrane-auth-cookie`](examples/dembrane-auth-cookie) | The same, for a Worker on the same site as dembrane: it reads dembrane's session cookie directly, with no link or handoff |
| [`examples/directus`](examples/directus) | A local Directus on SQLite with dembrane's schema, pulled from a dembrane-echo checkout, to log in to while testing the other examples |
