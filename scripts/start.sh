#!/usr/bin/env bash
# Starts the dg-light.js search/reader server. Run scripts/setup.sh first (once) —
# this only checks that the skeleton exists, it doesn't build it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -f dg_db_light.json ]; then
  echo "dg_db_light.json is missing — run ./scripts/setup.sh (or 'npm run build-db') first." >&2
  exit 1
fi

exec npm start
