#!/usr/bin/env bash
# One-shot: create the SQLite database and bring it to dembrane's schema.
# Starts Directus for the duration, then stops it. Afterwards: pnpm start
. "$(dirname "$0")/lib.sh"

if curl -sf "$URL/server/ping" >/dev/null; then
    echo "Something is already listening at $URL. Stop it first." >&2
    exit 1
fi

# Email templates are read from EMAIL_TEMPLATES_PATH (./templates).
ln -sfn "$ECHO_DIR/directus/templates" templates
mkdir -p "$(dirname "$DB_FILENAME")" "$STORAGE_LOCAL_ROOT"

pnpm exec directus bootstrap

log="$(mktemp)"
# node rather than `pnpm exec`, so stopping it doesn't signal this script too.
node node_modules/directus/cli.js start >"$log" 2>&1 &
directus_pid=$!
stop_directus() {
    status=$?
    kill "$directus_pid" 2>/dev/null || true
    wait "$directus_pid" 2>/dev/null || true
    rm -f "$log"
    exit "$status"
}
trap stop_directus EXIT
wait_for_directus

echo "## Pushing schema from $ECHO_DIR/directus/sync"
# directus-sync logs at length; keep it for when it fails.
./scripts/schema-push.sh >"$log.push" 2>&1 || { tail -40 "$log.push"; exit 1; }
rm -f "$log.push"
echo "## Running migrations"
./scripts/migrate.sh
echo "## Seeding users"
node scripts/seed-users.mjs

echo
echo "Ready. Start it with: pnpm start   (admin: $ADMIN_EMAIL / $ADMIN_PASSWORD)"
