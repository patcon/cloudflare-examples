# Shared by the scripts in this folder. Reads .env and resolves ECHO_DIR.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a

URL="${PUBLIC_URL:-http://localhost:8055}"
ECHO_DIR="$(cd "${ECHO_DIR:?set ECHO_DIR in .env}" 2>/dev/null && pwd)" \
    || { echo "ECHO_DIR does not exist. Point it at your dembrane-echo checkout's echo/ folder in .env." >&2; exit 1; }
[ -d "$ECHO_DIR/directus/sync" ] \
    || { echo "No directus/sync in $ECHO_DIR. Is ECHO_DIR the echo/ folder?" >&2; exit 1; }

wait_for_directus() {
    for _ in $(seq 60); do
        curl -sf "$URL/server/ping" >/dev/null && return 0
        sleep 1
    done
    echo "Directus is not answering at $URL. Start it first: pnpm start" >&2
    exit 1
}
