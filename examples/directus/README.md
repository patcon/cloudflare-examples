# directus

A local Directus with **dembrane's schema**, running on SQLite. It's a real Directus to log in to when you're testing the other examples, such as [`dembrane-auth`](../dembrane-auth), [`dembrane-auth-cookie`](../dembrane-auth-cookie) and [`dembrane-auth-cookie-ownership`](../dembrane-auth-cookie-ownership), without running the full echo stack (Postgres, Redis, Docker).

- Directus **11.13.4**, the version echo's image pins (`tractr/directus-sync:11.13.4`)
- The schema, roles, policies, permissions and flows come from your **dembrane-echo checkout** (`echo/directus/sync`). Nothing is copied into this repo, so pulling echo is enough to update it.
- Uses the same `SECRET` as the `.dev.vars` of the auth examples, so its tokens pass their Workers' checks with no extra setup.

## Run it

Needs Node 22 (see `.tool-versions`), plus `uv` and `sqlite3` for the migrations step.

```sh
pnpm install
cp .env.example .env     # point ECHO_DIR at your dembrane-echo checkout's echo/ folder
pnpm db:setup            # create data/database.sqlite and apply dembrane's schema
pnpm start               # http://localhost:8055
```

Log in at <http://localhost:8055> as `admin@dembrane.com` / `admin`, or as one of the seeded users:

| Email | Password | Role |
|---|---|---|
| `admin@dembrane.com` | `admin` | Administrator (`admin_access: true`) |
| `alice@example.com` | `password` | Basic User |
| `bob@example.com` | `password` | Basic User |

and two organisations, each with a Default workspace and projects:

| Organisation | Owner | Members | Projects |
|---|---|---|---|
| Alice's Organisation | Alice | Bob | Town hall listening session, Budget survey |
| Bob's Organisation | Bob | | Park redesign |

`pnpm db:reset` deletes the database and runs setup again.

## What `db:setup` does

It's the same sequence echo's `scripts/remote-dev/up.sh` runs, adjusted for SQLite:

1. **`directus bootstrap`** creates the system tables and the admin user from `.env`.
2. **`pnpm schema:push`** runs `directus-sync push` on a copy of `echo/directus/sync`, the equivalent of echo's `./sync.sh push`. Two changes are made to the copy first (`scripts/sqlite-snapshot.mjs`):
   - The snapshot's vendor is changed from `postgres` to `sqlite`, because Directus won't apply a snapshot from a different vendor.
   - `nextval('…_seq')` defaults on the 14 serial ids are dropped. SQLite can't parse them, and the fields keep `has_auto_increment`.
3. **`pnpm migrate`** runs the scripts in `echo/directus/migrations` (with `uv run`). On a fresh database they should all report `exists, skipping`, because each one was pulled into the snapshot after it ran. They run anyway to catch any migration that hasn't reached the snapshot. It also creates the two partial unique indexes from `echo/docs/database_migrations.md`. Three scripts are skipped:
   - `add_smart_loop_wave5_schema.py` and `add_smart_loop_wave28_canvas_ledgers.py` import the echo server package.
   - `backfill_billing_account.py` only applies to databases from before the billing-account split.
4. **`pnpm seed`** creates Alice and Bob, each with a `directus_users` row (Basic User role) and an `app_user` row (`scripts/seed-users.mjs`). Then it creates the organisations above (`scripts/seed-orgs.mjs`), with the rows dembrane's onboarding creates for a personal organisation: `org`, an owner's `org_membership`, an org-scoped `billing_account` (a workspace needs one), a Default `workspace` with the owner's `workspace_membership`, and the `project`s. The rows have fixed ids, so it's safe to re-run.

You can run steps 2 to 4 again on their own while `pnpm start` is running, for example after pulling echo.

## Using it with the auth examples

They all use port 8787, so run one at a time. `.env` already allows that origin (`CORS_ORIGIN` includes `http://localhost:8787`).

- **[`dembrane-auth`](../dembrane-auth)** (a Worker outside dembrane's cookie domain, logged in by link): run `pnpm dev`, then log in on its dashboard stand-in with `http://localhost:8055` and one of the users above.
- **[`dembrane-auth-cookie`](../dembrane-auth-cookie)** (a Worker inside dembrane's cookie domain, logged in by cookie): run `pnpm dev`, then log in on its `/login/` page. It reads the cookie Directus sets, which `.env` names `dembrane_session_token` as in production.
- **[`dembrane-auth-cookie-ownership`](../dembrane-auth-cookie-ownership)** (the same, plus who owns an organisation): as above. It reads the seeded organisations with `ADMIN_TOKEN` from `.env`, as its `DIRECTUS_TOKEN`.

Or with curl:

```sh
T=$(curl -s -X POST localhost:8055/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"password","mode":"json"}' | jq -r .data.access_token)
curl -H "Authorization: Bearer $T" localhost:8787/api/me     # {"id":"…","isAdmin":false,…}
```

## How it differs from echo's Directus

- **SQLite instead of Postgres.** A `directus-sync diff` after the push still reports field changes. These are differences in how SQLite reports types (`char(36)` for `uuid`, an extra `cast-timestamp` special on timestamps), not missing schema. Every collection and field from the snapshot is present. Don't `pull` from here back into echo, because the snapshot would then be SQLite-flavoured.
- **No pgvector, S3, Redis, or email.** Files go to `./uploads`, and email uses `sendmail`, so nothing is delivered. For auth, and for plain CRUD on dembrane's collections, that's enough.
- **Why not [`directus-libsql`](https://github.com/linefusion/directus-libsql)?** It swaps the driver for libSQL so the database can sync to Turso. For a local mock, Directus's built-in `sqlite3` driver does the job. The libsql project is also experimental, was last updated in June 2024 (before Directus 11), and depends on a pre-release `libsql`. I haven't tried it with Directus 11.
- **Node 22, not 24.** Directus needs `isolated-vm`, which doesn't build on Node 24 yet. echo's Docker image uses Node 22 as well.

## Files

```
.env.example              Directus config (SQLite, SECRET, CORS, admin user, ECHO_DIR)
scripts/setup.sh          db:setup: bootstrap, then push, migrate, seed with a temporary server
scripts/schema-push.sh    directus-sync push from $ECHO_DIR/directus/sync
scripts/sqlite-snapshot.mjs  adapts the Postgres snapshot copy for SQLite
scripts/migrate.sh        echo's migrations + partial indexes
scripts/seed.sh           pnpm seed: both of the below
scripts/seed-users.mjs    Alice and Bob
scripts/seed-orgs.mjs     their organisations, workspaces and projects
data/                     the SQLite database (gitignored)
templates -> $ECHO_DIR/directus/templates   (symlink made by setup, gitignored)
```
