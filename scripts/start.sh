#!/usr/bin/env bash
# Starts dg-fastify.js — the Fastify + SQLite server, the one that runs in production.
# Run scripts/setup.sh first (once): this only checks that the data it needs is there,
# it does not build anything.
#
#   ./scripts/start.sh            # port 3902
#   PORT=3000 ./scripts/start.sh  # anywhere else
#
# The older Express + grep server is still in the repo, now as `npm run start:express` — it has
# not been kept in sync with the client (translator selection, issue #6), so `npm start` is this one.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -f dg.db ]; then
  echo "dg.db is missing — run ./scripts/setup.sh (or 'npm run build-search-db') first." >&2
  exit 1
fi

exec npm run start:fastify
