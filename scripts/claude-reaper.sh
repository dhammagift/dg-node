#!/usr/bin/env bash
# What Claude Code sessions leave behind after they are killed: headless browsers, playwright daemons,
# `python -m http.server` previews, their wrapper shells, and scratch dirs under /tmp/claude-<uid>/.
#
# Usage: scripts/claude-reaper.sh            report only: every session, alive or not, with its processes and scratch size
#        scripts/claude-reaper.sh --apply    also kill orphaned artifacts and delete stale scratch dirs (cron)
#
# How a process is tied to a session: everything a session starts inherits CLAUDE_PID and
# CLAUDE_CODE_SESSION_ID in its environment, even daemons that detach from their parent. A process is
# an orphan when its CLAUDE_PID is no longer a running `claude`.
#
# That alone is NOT safe: pm2 restarted from a Claude shell passes the same variables to dg-prod/test,
# so the site carries a dead session's CLAUDE_PID too. Hence two guards, both required to kill:
#   - the command line must be a known session artifact (ARTIFACT_RE), never an arbitrary process;
#   - nothing under the pm2 daemon is ever touched.
# Scratch dirs (/tmp/claude-*/<project>/<session-uuid>/) are deleted only when no running process belongs
# to that session AND its transcript has not changed for STALE_HOURS (a resumable session keeps its files).
set -u

APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1
STALE_HOURS="${STALE_HOURS:-24}"
ARTIFACT_RE='chrome|chromium|headless_shell|ms-playwright|playwright|http\.server|shell-snapshots/snapshot-bash|tail -f /dev/null'
UUID_RE='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

log() { echo "[$(date '+%F %T')] $*"; }

live_claude=" $(pgrep -x claude | tr '\n' ' ') "
pm2_pid="$(pgrep -f '^PM2 v[0-9.]+: God Daemon' | head -1)"

under_pm2() {
    local p="$1"
    [ -z "$pm2_pid" ] && return 1
    while [ -n "$p" ] && [ "$p" -gt 1 ]; do
        [ "$p" = "$pm2_pid" ] && return 0
        p="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')"
    done
    return 1
}

declare -A live_sids=() orphan_rss=() orphan_pids=()
# A running `claude` keeps its own scratch dir open, so a session counts as live even when it has no
# child processes at the moment (idle, waiting for the user).
for cpid in $live_claude; do
    for sid in $(ls -l "/proc/$cpid/fd" 2>/dev/null | grep -oE '/tmp/claude-[^ ]*/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | grep -oE '[0-9a-f-]{36}$'); do
        live_sids[$sid]=1
    done
done
for d in /proc/[0-9]*; do
    pid="${d#/proc/}"
    [ "$pid" = "$$" ] && continue
    env="$(tr '\0' '\n' < "$d/environ" 2>/dev/null)" || continue
    cpid="$(sed -n 's/^CLAUDE_PID=//p' <<<"$env")"
    [ -z "$cpid" ] && continue
    sid="$(sed -n 's/^CLAUDE_CODE_SESSION_ID=//p' <<<"$env")"; sid="${sid:-unknown}"
    if [[ "$live_claude" == *" $cpid "* ]]; then live_sids[$sid]=1; continue; fi
    args="$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null)"
    [[ "$args" =~ $ARTIFACT_RE ]] || continue
    under_pm2 "$pid" && continue
    rss="$(awk '/^VmRSS/{print $2}' "$d/status" 2>/dev/null)"
    orphan_pids[$sid]+="$pid "
    orphan_rss[$sid]=$(( ${orphan_rss[$sid]:-0} + ${rss:-0} ))
    log "orphan process: session ${sid:0:8} (claude pid $cpid gone) pid $pid, $(( ${rss:-0} / 1024 )) MB: ${args:0:100}"
done

all_pids=""
for sid in "${!orphan_pids[@]}"; do
    log "session ${sid:0:8}: $(wc -w <<<"${orphan_pids[$sid]}") orphaned processes, $(( orphan_rss[$sid] / 1024 )) MB RAM"
    all_pids+="${orphan_pids[$sid]}"
done
if [ "$APPLY" = 1 ] && [ -n "$all_pids" ]; then
    kill -TERM $all_pids 2>/dev/null
    for _ in 1 2 3 4 5; do
        alive=""; for p in $all_pids; do kill -0 "$p" 2>/dev/null && alive+="$p "; done
        [ -z "$alive" ] && break
        timeout 1 tail -f /dev/null
    done
    [ -n "$alive" ] && kill -KILL $alive 2>/dev/null
    log "killed: $all_pids"
fi

now="$(date +%s)"
for dir in /tmp/claude-*/*/*/; do
    dir="${dir%/}"; sid="$(basename "$dir")"
    [[ "$sid" =~ $UUID_RE ]] || continue
    size="$(du -sm "$dir" 2>/dev/null | cut -f1)"
    if [ -n "${live_sids[$sid]:-}" ]; then
        state="live"
    else
        transcript="$(ls -t /root/.claude/projects/*/"$sid".jsonl 2>/dev/null | head -1)"
        age_h=$(( (now - $(stat -c %Y "${transcript:-$dir}")) / 3600 ))
        if [ "$age_h" -lt "$STALE_HOURS" ]; then state="idle ${age_h}h (kept)"; else state="stale ${age_h}h"; fi
    fi
    if [[ "$state" == stale* ]]; then
        log "scratch ${sid:0:8} $(basename "$(dirname "$dir")"): ${size} MB, $state$([ "$APPLY" = 1 ] && echo ', deleted')"
        [ "$APPLY" = 1 ] && rm -rf -- "$dir"
    elif [ "$APPLY" = 0 ]; then
        log "scratch ${sid:0:8} $(basename "$(dirname "$dir")"): ${size} MB, $state"
    fi
done
