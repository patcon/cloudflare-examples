#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
wait_for_directus
node scripts/seed-users.mjs
node scripts/seed-orgs.mjs
