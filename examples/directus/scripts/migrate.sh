#!/usr/bin/env bash
# Run echo's idempotent Directus migrations (echo/directus/migrations) here.
#
# echo's migrations are written to be run once per environment and then
# `sync.sh pull`ed into the snapshot, so on a fresh database the schema push
# already contains their changes and each script should say it is skipping.
# Running them anyway catches a migration that is not yet in the snapshot.
. "$(dirname "$0")/lib.sh"
wait_for_directus

# Skipped, each with its reason (the snapshot already has what they add):
#  - wave5 and wave28 import the echo server package
#    (dembrane.official_methodologies), which needs the server's Python env.
#  - backfill_billing_account reads workspace columns that the snapshot has
#    since dropped. It only applies to databases from before that split.
skip_reason() {
    case "$1" in
        add_smart_loop_wave5_schema.py | add_smart_loop_wave28_canvas_ledgers.py)
            echo "needs the echo server package" ;;
        backfill_billing_account.py)
            echo "only for databases from before the billing split" ;;
    esac
}

failed=()
for script in "$ECHO_DIR"/directus/migrations/*.py; do
    name="$(basename "$script")"
    reason="$(skip_reason "$name")"
    if [ -n "$reason" ]; then
        echo "== $name (skipped: $reason)"
        continue
    fi
    echo "== $name"
    args=(-u "$URL" -e "$ADMIN_EMAIL" -p "$ADMIN_PASSWORD")
    # This one plans by default and only deletes with --apply.
    [ "$name" = remove_leftover_basic_user_grants.py ] && args+=(--apply)
    uv run --no-project python "$script" "${args[@]}" || failed+=("$name")
done

# Partial unique indexes from echo/docs/database_migrations.md. directus-sync
# does not manage indexes. SQLite supports partial indexes, so the SQL is the
# same as on Postgres.
echo "== membership unique indexes"
sqlite3 "$DB_FILENAME" <<'SQL'
CREATE UNIQUE INDEX IF NOT EXISTS org_membership_active_org_user_uniq
    ON org_membership (org_id, user_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_membership_active_ws_user_uniq
    ON workspace_membership (workspace_id, user_id) WHERE deleted_at IS NULL;
SQL

if [ ${#failed[@]} -gt 0 ]; then
    echo "Failed: ${failed[*]}" >&2
    exit 1
fi
