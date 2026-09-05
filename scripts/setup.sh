#!/usr/bin/env bash
# Turnkey local setup for dg-node: clones the two external text-data repos plus the
# legacy assets repo, wires them into siteroot/ exactly the way dg-light.js expects
# (same recipe as .github/workflows/build-mobile.yml's "Create symlink structure"
# step, just without sudo/system paths — everything lives under $DATA_DIR instead),
# then installs npm deps and builds both databases the servers need: the skeleton
# dg_db_light.json (Express) and the SQLite/FTS5 corpus dg.db (Fastify, production).
#
# Safe to re-run: existing clones/symlinks are left alone unless --force is passed.
#
# Usage:
#   ./scripts/setup.sh              # clone into ../dg-data (sibling of this repo)
#   DATA_DIR=/some/path ./scripts/setup.sh
#   ./scripts/setup.sh --force      # re-clone even if a target dir already exists

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-"$REPO_ROOT/../dg-data"}"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

SC_DATA_DIR="$DATA_DIR/sc-data"          # suttacentral/sc-data (sc_bilara_data + structure)
OFFLINE_DATA_DIR="$DATA_DIR/offline-data" # dhammagift/offline-data (dhammagift/ subfolder)
LEGACY_DG_DIR="$DATA_DIR/dg"              # dhammagift/dg (legacy PHP site: assets/4nt/config/login/memo/read)

log() { echo "==> $*"; }

# node:sqlite is what dg-fastify.js reads the corpus through, and it only exists from
# Node 22.5 on. Checked here rather than left to blow up later: without it the build
# below still succeeds and the server then refuses to start with ERR_UNKNOWN_BUILTIN_MODULE.
node -e 'const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 5)) {
  console.error(`Node ${process.versions.node} is too old — dg-fastify.js needs node:sqlite, added in 22.5. Install a current Node and re-run.`);
  process.exit(1);
}'

# $1 = target dir, $2 = git URL, $3... = sparse-checkout cone-mode paths
sparse_clone() {
  local dir="$1" url="$2"; shift 2
  if [ -d "$dir/.git" ] && [ "$FORCE" -ne 1 ]; then
    log "already cloned: $dir (pass --force to re-clone)"
    return
  fi
  rm -rf "$dir"
  mkdir -p "$dir"
  log "cloning $url -> $dir (sparse: $*)"
  git -C "$dir" init -q
  git -C "$dir" remote add origin "$url"
  git -C "$dir" config core.sparseCheckout true
  git -C "$dir" sparse-checkout init --cone
  git -C "$dir" sparse-checkout set "$@"
  git -C "$dir" fetch --depth 1 origin HEAD -q
  git -C "$dir" checkout -q FETCH_HEAD
}

mkdir -p "$DATA_DIR"

sparse_clone "$SC_DATA_DIR" https://github.com/suttacentral/sc-data.git sc_bilara_data structure
sparse_clone "$OFFLINE_DATA_DIR" https://github.com/dhammagift/offline-data.git dhammagift
sparse_clone "$LEGACY_DG_DIR" https://github.com/dhammagift/dg.git assets 4nt config login memo read

log "wiring siteroot/ symlinks"

# dg-light.js: SC_BILARA = siteroot/data/suttacentral.net/sc-data/sc_bilara_data
rm -rf "$REPO_ROOT/siteroot/data/suttacentral.net"
mkdir -p "$REPO_ROOT/siteroot/data/suttacentral.net"
ln -s "$SC_DATA_DIR" "$REPO_ROOT/siteroot/data/suttacentral.net/sc-data"

# dg-light.js: DG_OFFLINE = siteroot/data/dhammagift
rm -rf "$REPO_ROOT/siteroot/data/dhammagift"
ln -s "$OFFLINE_DATA_DIR/dhammagift" "$REPO_ROOT/siteroot/data/dhammagift"

# siteroot/{assets,4nt,config,login,memo,read} — auto-mounted at server start (see
# CLAUDE.md "Публикация от корня сайта"), each replaced with a direct symlink into
# the legacy checkout instead of relying on the prod-only nested-repo relative path.
for name in assets 4nt config login memo read; do
  rm -rf "$REPO_ROOT/siteroot/$name"
  ln -s "$LEGACY_DG_DIR/$name" "$REPO_ROOT/siteroot/$name"
done

log "npm install (dg-node)"
(cd "$REPO_ROOT" && npm install)

log "npm install (dg-docs)"
(cd "$REPO_ROOT/dg-docs" && npm install)

log "building search skeleton (dg_db_light.json) — used by dg-light.js"
(cd "$REPO_ROOT" && npm run build-db)

# The one the production server actually reads. Takes ~85s and lands ~600MB in dg.db;
# dg-fastify.js refuses to start without it.
log "building search corpus (dg.db) — used by dg-fastify.js, takes a minute or two"
(cd "$REPO_ROOT" && npm run build-search-db)

log "verifying dg.db"
(cd "$REPO_ROOT" && node test-search-db.js)

log "done — start the server with ./scripts/start.sh"
