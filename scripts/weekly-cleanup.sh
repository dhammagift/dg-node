#!/usr/bin/env bash
# Weekly disk cleanup, run from root cron right after update-external-repos.sh.
# Only caches and stale temp files: everything removed here is re-downloaded or re-created on demand.
# The systemd journal is capped separately (/etc/systemd/journald.conf.d/size.conf, 500M).
set -u
PATH=/root/.nvm/versions/node/v24.20.0/bin:/root/.local/bin:/usr/local/bin:/usr/bin:/bin

log() { echo "[$(date '+%F %T')] $*"; }
before="$(df -m / | awk 'NR==2{print $4}')"

npm cache clean --force >/dev/null 2>&1
command -v pip >/dev/null && pip cache purge >/dev/null 2>&1
command -v uv >/dev/null && uv cache clean >/dev/null 2>&1
apt-get clean

# Top-level /tmp entries untouched for 7+ days. Skips systemd service dirs, sockets and Claude session
# dirs (a live session's dir can keep an old mtime while files deep inside change).
find /tmp -mindepth 1 -maxdepth 1 -mtime +7 \
    -not -name 'systemd-private-*' -not -name 'claude-*' -not -name '.*-unix' -not -name 'tmux-*' \
    -exec rm -rf {} +

after="$(df -m / | awk 'NR==2{print $4}')"
log "cleanup: free ${before} MB -> ${after} MB"
