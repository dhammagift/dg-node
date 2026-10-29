#!/usr/bin/env bash
# Keeps the reader's dictionary (public/overrides/js/standalone-dpd) current on a dg-node checkout.
# sync-dpd.yml commits a new DPD release to GitHub daily at 21:30 UTC (02:30 Almaty), but a server only gets it
# when someone pulls (owner 2026-10-29: the dictionary must be current on every prod, reserve and
# test host). Run from cron after the sync.
#
# Usage: scripts/dpd-pull.sh <checkout> [--test <pm2 name>]
#   prod:   fast-forwards ONLY when everything new on origin/main is the dictionary (static files,
#           no restart); any other commit waits for the normal prod rollout.
#   --test: a test tree follows main - fast-forward whatever is new and restart its pm2 process
#           if more than the dictionary changed. Uncommitted work in the tree is left alone
#           (git refuses the merge if it would touch it).
set -uo pipefail
DIR=$1; MODE=${2:-}; PM2_NAME=${3:-}
DPD=public/overrides/js/standalone-dpd/
log() { echo "$(date -u +%FT%TZ) $DIR $*"; }
cd "$DIR" || exit 1
git fetch -q origin main || { log "fetch failed"; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && exit 0
git merge-base --is-ancestor HEAD origin/main || { log "not a fast-forward of origin/main, skipped"; exit 0; }
other=$(git diff --name-only HEAD origin/main | grep -v "^$DPD" || true)
if [ -n "$other" ] && [ "$MODE" != --test ]; then
    log "behind with more than the dictionary ($(echo "$other" | wc -l) files), waits for a prod rollout"
    exit 0
fi
git merge -q --ff-only origin/main || { log "ff merge refused (local changes in its way)"; exit 1; }
log "now $(git rev-parse --short HEAD)"
if [ -n "$other" ] && [ -n "$PM2_NAME" ]; then pm2 restart "$PM2_NAME" >/dev/null && log "pm2 restart $PM2_NAME"; fi
