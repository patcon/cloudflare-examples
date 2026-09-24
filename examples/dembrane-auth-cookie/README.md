# dembrane-auth-cookie

[`dembrane-auth`](../dembrane-auth), for when the Worker is on the **same site** as dembrane. The browser then sends dembrane's own session cookie to the Worker, so there's no link, no token handoff and no cookie of the Worker's own.

The Worker still verifies the same Directus JWT as dembrane's FastAPI backend, the same way: HS256 with `DIRECTUS_SECRET`, reading `id` and `admin_access`. It routes each user to their own Durable Object. **dembrane's code doesn't change.**

What you'll see is the same demo as `dembrane-auth`: a counter per user in their own Durable Object, and a shared directory of users that admins refresh from Directus. The rules are the same, and the Worker enforces them.

It's built for [`../directus`](../directus), which already names its cookie `dembrane_session_token` like production, and allows this Worker's origin in CORS.

## Run it

```sh
(cd ../directus && pnpm install && pnpm db:setup && pnpm start)   # in another terminal

pnpm install
cp .dev.vars.example .dev.vars   # DIRECTUS_SECRET, matching ../directus's SECRET
pnpm dev                         # http://localhost:8787
```

Open <http://localhost:8787>. It redirects to `/demo/`, which sends you to `/login/` until you're logged in. `dembrane-auth` uses port 8787 too, so run one at a time.

## Why it works locally

Cookies ignore the port. The cookie that Directus on `localhost:8055` sets is sent to the Worker on `localhost:8787` too, just as a cookie for `.dembrane.com` would reach `demo.dembrane.com`. You can also log in to Directus's own app at <http://localhost:8055/admin> as the admin. It uses the same cookie, so the demo sees you as logged in.

## The flow

```
 /login/ (pretend: dashboard.dembrane.com/login)     /demo/ (pretend: demo.dembrane.com)
 ┌────────────────────────────────────┐            ┌─────────────────────────┐
 │ POST {directus}/auth/login         │            │ GET  /api/me            │
 │   mode: "session"                  │ ─────────▶ │ GET  /api/users         │
 │ Directus sets dembrane_session_    │            │ POST /api/users/:id/    │
 │ token (httpOnly) for the site      │            │      increment          │
 └────────────────────────────────────┘            └────────────┬────────────┘
          ▲                                                     │ the browser sends the cookie;
          └──── no session left to refresh ◀────────────────────┤ the Worker checks the JWT,
                                                                │ then getByName(userId)
            POST {directus}/auth/refresh ◀── near expiry, or    ▼
            mode: "session"                  on a 401     User Durable Object (one per
                                                          user), and the Directory (one)
```

1. **Log in.** `/login/` stands in for dembrane's login. It calls Directus's `POST /auth/login` with `mode: "session"` and `credentials: "include"`, the way the dashboard's Directus SDK does. Directus answers by setting its httpOnly session cookie. The page never sees the token.
2. **Use the demo.** Every request to the Worker carries the cookie. `requireDirectusSession` checks the JWT in it, and the Worker calls the user's Durable Object with `getByName(id)`. The Durable Objects do no auth themselves, since they can only be reached through the Worker.
3. **Stay logged in.** With a minute left, or on any 401, `/demo/` calls Directus's `POST /auth/refresh` with `mode: "session"`. Directus replaces the cookie with a fresh one, and the page asks `/api/me` again. If there's no session left to refresh, you go back to `/login/`, which returns you afterwards. Session tokens last a day by default (`SESSION_COOKIE_TTL`). Lower it in `../directus/.env` to watch the refreshes happen, but keep it above a minute or the page will refresh in a loop.
4. **Log out.** Directus's `POST /auth/logout` ends the session and deletes the cookie. There's only one session, so this logs you out of dembrane too.

## What's different from dembrane-auth

| dembrane-auth | Here |
|---|---|
| `/auth/` swaps a `#token` link for the Worker's own `demo_session_cookie` | Gone. The Worker reads Directus's `dembrane_session_token` |
| `POST /api/session` and `DELETE /api/session` | Gone. Directus's `/auth/login` and `/auth/logout` set and delete the cookie |
| The dashboard stand-in, with an account switcher and tokens in localStorage | A login page. A browser holds one Directus session, so there's one account at a time |
| `?handoff=1`: the demo goes back to the dashboard for a fresh token | The demo refreshes the session with Directus itself |
| Your profile is fetched in `POST /api/session` | Fetched by `GET /api/me` the first time the Worker sees you. There's no login step here to do it in |
| The Worker's cookie is only ever sent to the Worker's own site | Directus's cookie is sent by every page on the site, so writes need the origin check below |

### The origin check

The browser attaches the cookie to any request made from the same site. That includes pages on other `*.dembrane.com` hosts, or on other `localhost` ports. `SameSite=Lax` stops other sites, not those. So `requireDirectusSession` turns down a request that changes something (`POST`, `PUT`, …) and is authenticated only by the cookie, unless it comes from the Worker's own origin. It checks this with `Sec-Fetch-Site: same-origin`, or with `Origin` for browsers that don't send that header. Bearer requests skip the check, because another page can't make the browser attach an `Authorization` header.

## Try it with curl

With [`../directus`](../directus) running. curl keeps cookies by host, not port, just as the browser does, so the cookie from `:8055` is sent to `:8787`:

```sh
login() { curl -s -c "$1" localhost:8055/auth/login -H 'content-type: application/json' \
  -d "{\"email\":\"$2\",\"password\":\"$3\",\"mode\":\"session\"}" -o /dev/null; }
login alice.txt alice@example.com password
ME=$(curl -s -b alice.txt localhost:8787/api/me | jq -r .id)

curl localhost:8787/api/me                                                     # 401
curl -b alice.txt localhost:8787/api/me                                        # Alice
curl -b alice.txt -X POST localhost:8787/api/users/$ME/increment               # 403: not from the demo's origin
curl -b alice.txt -H 'Origin: http://localhost:8787' -X POST localhost:8787/api/users/$ME/increment   # 200
curl -b alice.txt -H 'Origin: http://localhost:5173' -X POST localhost:8787/api/users/$ME/increment   # 403
```

`Authorization: Bearer` still works too, with the token from the cookie or from a `mode: "json"` login. The curl examples in [`dembrane-auth`](../dembrane-auth#try-it-with-curl) work unchanged.

## Files

```
src/index.ts           routes
src/auth.ts            JWT check on Directus's cookie (or Bearer), and the origin check
src/directus.ts        the Worker's calls to Directus: your profile, and, for admins, everyone's
src/user.ts            the per-user Durable Object: getCount(), increment(), the saved profile
src/directory.ts       the one shared Durable Object: the saved list of users, and settings
public/                the pages (plain HTML, no build step): /login/ and /demo/
wrangler.jsonc         Durable Object bindings, static assets, vars
```

## Going to production

- **The Worker must be on dembrane.com.** That means a custom domain or route, so the dembrane.com zone has to be on Cloudflare. This is why `dembrane-auth` uses a link instead. Directus must also set its cookie for the whole site (`SESSION_COOKIE_DOMAIN=.dembrane.com`), which production already does.
- **CORS.** `/demo/` calls Directus's `/auth/refresh` and `/auth/logout` itself, so Directus's `CORS_ORIGIN` must include the demo's origin, with `CORS_CREDENTIALS=true`.
- **Sharing `DIRECTUS_SECRET`.** Anything holding it can create valid dembrane tokens, so the Worker becomes as sensitive as the backend.
- **Logout is only noticed when the token expires.** The browser forgets the cookie at once, but the Worker checks the JWT locally, so a copied token stays valid until `exp`. Session tokens last a day by default rather than 15 minutes. FastAPI behaves the same way today.
- **Every host on the site can set the cookie.** Any `*.dembrane.com` page can write a cookie for `.dembrane.com`, so a compromised subdomain could log visitors in to another account. It can't forge one, since the Worker still checks the signature.
- **Deploy** with `pnpm deploy` after `pnpm wrangler secret put DIRECTUS_SECRET`.
