#!/usr/bin/env bash
# Weekly refresh of third-party data mirrors (scripts/external-repos.conf): each one is reset to its
# upstream branch tip with no history kept, so they stay current and take no extra disk.
#
# Usage: scripts/update-external-repos.sh            (root cron; runs git as the owner of each dir)
#        EXTERNAL_REPOS_CONF=/path/to.conf scripts/update-external-repos.sh
#
# For each "<path> <url> <branch>":
#   missing          → shallow clone (--depth=1 --single-branch), owned by www-data
#   present          → fetch --depth=1 of that branch, reset --hard to it (local edits are discarded:
#                      a mirror is upstream as-is — owner, 2026-09-15), then drop every other ref,
#                      the reflog and unreachable objects, which is what actually frees the history.
# gc runs with a single thread and small pack windows: this server has ~1 GB of free memory.
set -uo pipefail

CONF="${EXTERNAL_REPOS_CONF:-$(dirname "$(readlink -f "$0")")/external-repos.conf}"
NEW_OWNER="${EXTERNAL_REPOS_OWNER:-www-data}"
FAILED=0

log() { echo "[$(date '+%F %T')] $*"; }

# git as the directory's owner (root would hit git's "dubious ownership" check on www-data dirs)
as_owner() {
    local dir="$1"; shift
    local owner; owner="$(stat -c %U "$dir")"
    if [ "$owner" = "$(id -un)" ]; then "$@"; else runuser -u "$owner" -- "$@"; fi
}

gitq() {
    local dir="$1"; shift
    as_owner "$dir" nice -n 10 git -C "$dir" -c pack.threads=1 -c pack.windowMemory=64m \
        -c core.packedGitLimit=256m -c core.packedGitWindowSize=32m "$@"
}

while read -r path url branch; do
    [ -z "${path:-}" ] && continue
    case "$path" in \#*) continue ;; esac
    branch="${branch:-main}"

    if [ ! -d "$path/.git" ]; then
        if [ -e "$path" ] && [ -n "$(ls -A "$path" 2>/dev/null)" ]; then
            log "SKIP $path: exists but is not a git repo"; FAILED=1; continue
        fi
        log "clone $url ($branch) -> $path"
        mkdir -p "$(dirname "$path")"
        if nice -n 10 git clone -q --depth=1 --single-branch --branch "$branch" "$url" "$path"; then
            chown -R "$NEW_OWNER:$NEW_OWNER" "$path"
            log "cloned $path: $(du -sh "$path/.git" | cut -f1) history, $(du -sh --exclude=.git "$path" | cut -f1) files"
        else
            log "FAIL clone $url"; rm -rf "$path"; FAILED=1
        fi
        continue
    fi

    before_git="$(du -sm "$path/.git" | cut -f1)"
    old_head="$(gitq "$path" rev-parse --short HEAD 2>/dev/null)"
    if ! gitq "$path" fetch -q --depth=1 --no-tags origin "+refs/heads/$branch:refs/remotes/origin/$branch"; then
        log "FAIL fetch $path"; FAILED=1; continue
    fi
    gitq "$path" checkout -q -B "$branch" "origin/$branch" 2>/dev/null || { log "FAIL checkout $path"; FAILED=1; continue; }
    gitq "$path" reset -q --hard "origin/$branch"

    # Drop everything that keeps old history reachable: other branches, tags, the reflog.
    gitq "$path" for-each-ref --format='%(refname)' refs/heads refs/remotes refs/tags \
        | grep -vx -e "refs/heads/$branch" -e "refs/remotes/origin/$branch" \
        | while read -r ref; do gitq "$path" update-ref -d "$ref"; done
    gitq "$path" reflog expire --expire=now --all
    gitq "$path" gc -q --prune=now

    after_git="$(du -sm "$path/.git" | cut -f1)"
    log "ok $path: $old_head -> $(gitq "$path" rev-parse --short HEAD), history ${before_git} MB -> ${after_git} MB, shallow $(gitq "$path" rev-parse --is-shallow-repository)"
done < <(grep -v '^[[:space:]]*$' "$CONF")

exit "$FAILED"
