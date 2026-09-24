# dembrane-auth

A minimal example of gating a Cloudflare Worker and Durable Object on a **dembrane login**.

The Worker verifies the same Directus JWT that dembrane's FastAPI backend already accepts, checked the same way: HS256 with `DIRECTUS_SECRET`, reading `id` and `admin_access`. It then routes each user to their own Durable Object. **dembrane's code doesn't change.**

What you'll see:

- A stand-in for the dembrane dashboard, with a link to the demo and the link's URL printed beneath it.
- A demo page where every user has a counter in their own Durable Object. Anyone logged in can read everyone's count, but you can only increment your own; admins can increment anyone's. Other users' buttons are disabled in the UI, and the server still answers a direct request with a 403 (see the curl example below).

## Run it

```sh
pnpm install
cp .dev.vars.example .dev.vars   # DIRECTUS_SECRET for local dev
pnpm dev                         # http://localhost:8787
```

Open <http://localhost:8787>. It redirects to `/dembrane-dashboard/`.

## The flow

```
 /dembrane-dashboard/              /auth/#token=…             /demo/
 (pretend: dashboard.dembrane.com) (the demo, another site)
 ┌──────────────────────┐  click  ┌──────────────────┐       ┌─────────────────────────┐
 │ pick a user ↙        │ ──────▶ │ POST /api/session│ ────▶ │ GET  /api/users/:id     │
 │ Open realtime demo → │         │ token → our own  │       │ POST /api/users/:id/    │
 │ http://…/auth/#token │         │ httpOnly cookie  │       │      increment          │
 └──────────────────────┘         └──────────────────┘       └────────────┬────────────┘
          ▲                                                               │ Worker checks the JWT,
          └──── ?handoff=1: near expiry, fetch a fresh link ◀─────────────┤ then getByName(userId)
                                                                          ▼
                                                              UserCounter Durable Object
                                                              (one per user)
```

1. **Pick a user** in the bottom-left picker on the dashboard. You can choose:
   - a mock user (Alice, Bob, or Admin), whose token is signed by the Worker itself (demo-only)
   - a **real Directus login**
2. **Click the link.** The token travels in the URL **fragment** (`#token=…`). Browsers never send the fragment to servers, so it stays out of logs and `Referer` headers. `/auth/` hands the token to `POST /api/session`, which verifies it and stores it in the demo's own httpOnly cookie. Then `/auth/` removes the token from the address bar.
3. **Use the demo.** Each request's JWT is checked by `requireDirectusSession`, and the Worker calls the user's Durable Object with `getByName(id)`. The Durable Object does no auth itself, since it can only be reached through the Worker. In Cloudflare's words, *"Durable Objects do not receive requests directly from the Internet. Durable Objects receive requests from Workers or other Durable Objects."* ([docs](https://developers.cloudflare.com/durable-objects/get-started/))
4. **Stay logged in.** The dashboard renews its token about a minute before it expires. Mock users get a new token; a real login uses its Directus refresh token. The printed URL changes when this happens. About 30 seconds before the demo session expires, or on any 401, `/demo/` sends the browser through `/dembrane-dashboard/?handoff=1`, which gets a fresh token and sends it straight back. There's no need to log in again.

Mock tokens last 5 minutes, so you can watch the renewal happen.

### Why a link, and not dembrane's cookie?

dembrane.com isn't on Cloudflare DNS, so the Worker lives on `*.workers.dev`, a different site from the dashboard. The browser never sends the dashboard's `directus_session_token` cookie there. JavaScript can't read that cookie either (it's httpOnly), so the token has to travel in the link.

## How it maps to dembrane

| Here | In dembrane |
|---|---|
| `src/auth.ts` → `requireDirectusSession` | `require_directus_session` in `echo/server/dembrane/api/dependency_auth.py`: same secret, same algorithm, same claims. Both accept `Authorization: Bearer` or a cookie. (Hono checks the header first, FastAPI the cookie first. With one token per request this makes no difference.) |
| Dashboard's "Log in with real Directus" | The iOS app (`dembrane-go/.../DembraneCore/Auth.swift`): `POST /auth/login` and `/auth/refresh` with `mode: "json"`, then `Bearer` |
| The `?handoff=1` round trip | The dashboard's Directus SDK refreshing its session (`autoRefresh: true` in `echo/frontend/src/lib/directus.ts`) |
| `admin_access` → the admin badge | `admin_access`, which identifies staff (the admin panel's gate) |
| Mock users and `POST /api/dev/mint` | Directus issuing tokens (demo-only) |

## Try it with curl

```sh
A=$(pnpm -s mint-token alice); ADM=$(pnpm -s mint-token admin)
ALICE=a11ce000-0000-4000-8000-000000000001; BOB=b0b00000-0000-4000-8000-000000000002

curl localhost:8787/api/me                                                  # 401
curl -H "Authorization: Bearer $A" localhost:8787/api/me                    # Alice
curl -H "Authorization: Bearer $A" localhost:8787/api/users/$BOB            # read Bob's: 200
curl -X POST -H "Authorization: Bearer $A" localhost:8787/api/users/$ALICE/increment  # 200
curl -X POST -H "Authorization: Bearer $A" localhost:8787/api/users/$BOB/increment    # 403
curl -X POST -H "Authorization: Bearer $ADM" localhost:8787/api/users/$BOB/increment  # admin: 200
```

## Logging in with a real Directus

This needs a Directus you can log into, such as a local dembrane stack or the testing environment. Don't use production.

The quickest option is [`../directus`](../directus): a local Directus on SQLite with dembrane's schema. It's already set up for this demo (same secret, CORS allows `:8787`), so you can skip steps 1 and 2 below and log in as `alice@example.com` / `password`.

1. Put that Directus's `SECRET` in `.dev.vars` as `DIRECTUS_SECRET`.
2. Allow the demo's origin in Directus's CORS settings: `CORS_ENABLED=true` and `CORS_ORIGIN` including `http://localhost:8787`. This is a config change, not a code change.
3. On the dashboard, choose **Log in with real Directus…**, and enter the URL, email, password, and a two-factor code if your account uses one.

The browser talks to Directus directly; the Worker never sees a password. In the demo you'll appear as an extra "Directus user" row. Other people won't see you, because the list of users is only the three mock users plus whoever is logged in.

## Files

```
src/index.ts           routes
src/auth.ts            JWT check (+ demo-only mock users / token signing)
src/user-counter.ts    the Durable Object: getCount(), increment()
public/                the three pages (plain HTML, no build step)
scripts/mint-token.ts  mock tokens for curl
wrangler.jsonc         Durable Object binding, static assets, vars
```

## Going to production

- **How the real dashboard gets a token for the link.** Dashboard JavaScript can't read the httpOnly session cookie. It needs either a small backend endpoint that returns a token for the link (ideally short-lived and valid only for this Worker), or a way to get one from Directus while staying in session mode. The second option still needs checking.
- **Sharing `DIRECTUS_SECRET`.** Anything holding it can create valid dembrane tokens, so the Worker becomes as sensitive as the backend. A token issued only for the Worker, signed with its own secret, avoids this.
- **Logout is only noticed when the token expires.** The JWT is checked locally. FastAPI has exactly the same behaviour today.
- **Turn `DEMO_MODE` off** (set it to `"false"`). Otherwise `POST /api/dev/mint` lets anyone create tokens for the mock users.
- **Tokens in `localStorage`** (the fake dashboard's real login) are acceptable in a demo only.
- **Deploy** with `pnpm deploy` after `pnpm wrangler secret put DIRECTUS_SECRET`.
