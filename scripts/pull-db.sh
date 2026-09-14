#!/usr/bin/env bash
# Installs the search database built on GitHub (.github/workflows/build-db.yml, release db-latest):
# download, verify, swap into the prod checkout, restart. The build itself does not run on the
# server — it needs more free memory than the box has.
#
# Usage: scripts/pull-db.sh [--force]     (--force: install even if the build_id is already there)
#
# dg-node-test's dg.db is a symlink to prod's, so both sites get the new database. The previous one
# stays next to it as dg.db.prev — to roll back, swap the two files back and restart.
set -euo pipefail

PROD="${DG_PROD_DIR:-/var/www/html/nodejs}"
URL="https://github.com/dhammagift/dg-node/releases/download/db-latest"
cd "$PROD"

# Same filesystem as dg.db, so the final mv is an atomic rename, not a 600 MB copy.
TMP="$(mktemp -d "$PROD/.db-pull.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

curl -fsSL -o "$TMP/db-manifest.json" "$URL/db-manifest.json"
field() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$1" "$2"; }
db_build() { python3 -c 'import sqlite3,sys; print(sqlite3.connect("file:"+sys.argv[1]+"?mode=ro", uri=True).execute("select value from meta where key=\"build_id\"").fetchone()[0])' "$1" 2>/dev/null || echo none; }

NEW="$(field "$TMP/db-manifest.json" build_id)"
CUR="$(db_build dg.db)"
if [ "$NEW" = "$CUR" ] && [ "${1:-}" != "--force" ]; then
    echo "already on build $CUR"
    exit 0
fi

FREE_MB="$(df -Pm "$PROD" | awk 'NR==2 {print $4}')"
if [ "$FREE_MB" -lt 1500 ]; then
    echo "need ~1.5 GB free on $(df -P "$PROD" | awk 'NR==2 {print $6}'), have ${FREE_MB} MB" >&2
    exit 1
fi

echo "downloading build $NEW (installed: $CUR)"
curl -fsSL -o "$TMP/dg.db.gz" "$URL/dg.db.gz"
curl -fsSL -o "$TMP/sutta_words.txt" "$URL/sutta_words.txt"
gunzip -c "$TMP/dg.db.gz" > "$TMP/dg.db"

SHA="$(sha256sum "$TMP/dg.db" | cut -d' ' -f1)"
if [ "$SHA" != "$(field "$TMP/db-manifest.json" sha256)" ]; then
    echo "sha256 mismatch — not installing" >&2
    exit 1
fi
if [ "$(db_build "$TMP/dg.db")" != "$NEW" ]; then
    echo "build_id inside the database does not match the manifest — not installing" >&2
    exit 1
fi

# Swap: the WAL/SHM files belong to the old database and must move with it, or SQLite would apply
# them to the new one on the next open.
mv -f dg.db dg.db.prev
[ -f dg.db-wal ] && mv -f dg.db-wal dg.db.prev-wal
[ -f dg.db-shm ] && mv -f dg.db-shm dg.db.prev-shm
mv "$TMP/dg.db" dg.db

# The offline archive the app/PWA downloads: archive first, manifest last (it announces the build).
mkdir -p siteroot/mobile-data
mv "$TMP/dg.db.gz" siteroot/mobile-data/dg.db.gz.tmp && mv -f siteroot/mobile-data/dg.db.gz.tmp siteroot/mobile-data/dg.db.gz
mv "$TMP/db-manifest.json" siteroot/mobile-data/db-manifest.json.tmp && mv -f siteroot/mobile-data/db-manifest.json.tmp siteroot/mobile-data/db-manifest.json

pm2 restart dg-prod test >/dev/null
echo "installed build $NEW (previous $CUR kept as dg.db.prev)"

# sutta_words.txt is tracked in git — not overwritten here, only reported, so the checkout stays clean.
if ! cmp -s "$TMP/sutta_words.txt" public/overrides/texts/sutta_words.txt; then
    echo "note: public/overrides/texts/sutta_words.txt differs from this build — commit the new one"
    cp "$TMP/sutta_words.txt" "$PROD/.sutta_words.from-$NEW.txt"
fi
