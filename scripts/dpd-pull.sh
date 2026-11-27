#!/usr/bin/env bash
# Keeps the reader's dictionary (public/overrides/js/standalone-dpd) current on a dg-node checkout.
# build-dpd-dictionary.yml commits a new dictionary to main when run with "publish" (by hand), but a server only gets it
# when someone pulls (owner 2026-10-29: the dictionary must be current on every prod, reserve and
# test host). Run from cron after the sync.
#
# Usage: scripts/dpd-pull.sh <checkout> [--test <pm2 name>]
#   prod:   the dictionary always comes (static files, no restart). When it is all that is new, a
#           fast-forward; when other commits wait for a prod rollout, only the dictionary's files are
#           taken from origin/main (owner 2026-11-17: «словарь - это словарь… он должен обновляться»).
#           The rollout's fast-forward later finds those files already as they are on main.
#   --test: a test tree follows main - fast-forward whatever is new and restart its pm2 process
#           if more than the dictionary changed. Uncommitted work in the tree is left alone
#           (git refuses the merge if it would touch it).
set -uo pipefail
DIR=$1; MODE=${2:-}; PM2_NAME=${3:-}
DPD=public/overrides/js/standalone-dpd/
log() { echo "$(date -u +%FT%TZ) $DIR $*"; }
# The dictionary site's word pages for search engines (ddg-ui build-pages.js: the Suttas' definitions, similes, assāda…,
# titles, sitemap) are built from this dictionary's dg-glossary.json; rebuilt on every dictionary update so new terms get
# their pages without anyone running it (owner 2026-11-21: «я думал это автоматом работает для новых статей»).
# Not on a test tree: the dictionary site is served from /var/www/ddg-ui with prod's dictionary.
words() {
    [ "$MODE" = --test ] && return 0
    [ -f /var/www/ddg-ui/build-pages.js ] || return 0
    if (cd /var/www/ddg-ui && DPD_DIR="$DIR/$DPD" node build-pages.js >/dev/null); then log "dictionary word pages rebuilt"; else log "dictionary word pages rebuild FAILED"; fi
}
# The apps' signed list of site files (scripts/site-manifest.js) names the dictionary files by hash: a new dictionary without a new
# list = one file that does not match = the apps take no update at all (owner's phone ran a mixed page, 2026-11-27). Sign again
# where this host signs (F1: configs/local/site-manifest.json + the key); a host without the key copies the signer's list.
resign() {
    [ "$MODE" = --test ] && return 0
    local origin
    origin=$(node -e 'try{process.stdout.write(require(process.argv[1]).origin||"")}catch(e){}' "$DIR/configs/local/site-manifest.json")
    if [ -n "$origin" ] && [ -f /root/.secrets/site-manifest-signing.pem ]; then
        if node scripts/site-manifest.js --origin "$origin" >/dev/null; then log "app list signed again"; else log "app list signing FAILED"; fi
    elif [ -n "${MANIFEST_FROM:-}" ]; then
        # e.g. MANIFEST_FROM="ssh -p1000 root@<signer>" in the crontab: wait for the signer's own run, take its list once it is newer
        for i in $(seq 1 20); do
            if $MANIFEST_FROM "cat $DIR/app-site-manifest.json" > app-site-manifest.json.new 2>/dev/null \
               && node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1]));process.exit(JSON.parse(m.signed).generated>=process.argv[2]?0:1)' app-site-manifest.json.new "$START"; then
                mv app-site-manifest.json.new app-site-manifest.json && log "app list copied from the signer"; return 0
            fi
            sleep 60
        done
        rm -f app-site-manifest.json.new; log "app list NOT copied (the signer signed nothing new in 20 min)"
    fi
}
START=$(date -u +%FT%TZ)
cd "$DIR" || exit 1
git fetch -q origin main || { log "fetch failed"; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && exit 0
git merge-base --is-ancestor HEAD origin/main || { log "not a fast-forward of origin/main, skipped"; exit 0; }
other=$(git diff --name-only HEAD origin/main | grep -v "^$DPD" || true)
if [ -n "$other" ] && [ "$MODE" != --test ]; then
    git diff --quiet origin/main -- "$DPD" && exit 0   # the tree has this dictionary already
    git checkout origin/main -- "$DPD" || { log "dictionary checkout failed"; exit 1; }
    log "dictionary from $(git rev-parse --short origin/main); $(echo "$other" | wc -l) other files wait for a prod rollout"
    words
    resign
    exit 0
fi
dpd_new=$(git diff --name-only HEAD origin/main -- "$DPD")
git merge -q --ff-only origin/main || { log "ff merge refused (local changes in its way)"; exit 1; }
[ -n "$dpd_new" ] && { words; resign; }
log "now $(git rev-parse --short HEAD)"
if [ -n "$other" ] && [ -n "$PM2_NAME" ]; then pm2 restart "$PM2_NAME" >/dev/null && log "pm2 restart $PM2_NAME"; fi
