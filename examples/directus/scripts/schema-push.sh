#!/usr/bin/env bash
# Push dembrane's schema (echo/directus/sync) into this Directus.
# The same step as `./sync.sh push` in echo, pointed at the echo checkout.
. "$(dirname "$0")/lib.sh"
wait_for_directus

# directus-sync writes a temp dump next to the dump path, so work on a copy
# rather than inside the echo checkout.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp -R "$ECHO_DIR/directus/sync" "$work/sync"
node scripts/sqlite-snapshot.mjs "$work/sync/snapshot"

pnpm exec directus-sync -c "$ECHO_DIR/directus/directus-sync.config.js" push \
    -u "$URL" -e "$ADMIN_EMAIL" -p "$ADMIN_PASSWORD" \
    --dump-path "$work/sync" "$@"
