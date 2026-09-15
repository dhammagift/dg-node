# Server operations (handoff)

How the dhamma.gift server is kept running without a person: what is built where, what cron does,
and how to repeat it on another server. Everything here was set up and checked on the main server
(2026-09-15). All times are server time.

## Layout

| What | Path | Repo / branch | Served as |
|---|---|---|---|
| Site, prod | `/var/www/html/nodejs` | dhammagift/dg-node `main` | pm2 `dg-prod`, port 3000 → dhamma.gift |
| Site, test | `/var/www/html/dg-node-test` | dhammagift/dg-node `main` | pm2 `test`, port 3003 (env `PORT=3003`) → test.dhamma.gift |
| Search DB | `nodejs/dg.db` (test: symlink to it) | built on GitHub, see below | read by dg-fastify.js |
| Docs | `nodejs/dg-docs`, `dg-node-test/dg-docs` | dhammagift/dg-docs `dist` / `dist-preview` | /docs, /ru/docs |
| Dictionary | `/var/www/ddg-ui` | dhammagift/ddg-ui `main` | dict.dhamma.gift, dhamma.gift/dict (served from the working tree) |
| SuttaCentral texts | `/var/www/suttacentral.net/sc-data` | suttacentral/sc-data `main`, **shallow mirror** | read by the site |
| Our translations | `/var/www/offline-data` | dhammagift/offline-data `main` | translators commit here |
| Legacy PHP site | `/var/www/html` | dhammagift/dg `main` | assets, 4nt, read, /old |
| Issue bot (Telegram → GitHub issues) | `/var/www/issue_bot` | dhammagift/issue-bot `main` | pm2 `issue-bot`; setup from scratch in its README |
| Android apps (TWA) | `/var/www/dg-twa` | dhammagift/dg-twa | built by GitHub Actions on push to `prod` |

`pm2 restart dg-prod` after changing `search/js/home.js` or `settings.js` (bundles are built on start).
DG (the PHP project) is no longer developed; its old test tree `/var/www/test` was deleted.

## Memory rules (3.8 GB RAM, no room for two heavy jobs)

- Prod is **one** pm2 process. It grows to ~800 MB over hours; `pm2 restart dg-prod` is fine.
- Heavy jobs (builds, big git operations): `choom -n 1000 -- <cmd>` so the OOM killer takes them, not the site.
- Do **not** build the search DB or the Docusaurus docs on the server — both run on GitHub.
- Swap can be cleared when `available` memory is larger than used swap: `swapoff -a && swapon -a`.

## Search database: built on GitHub, installed by cron

1. `.github/workflows/build-db.yml` (dg-node) builds `dg.db` from shallow sparse checkouts of sc-data,
   offline-data and dg, runs the tests, and uploads release **`db-latest`**
   (`dg.db.gz`, `db-manifest.json`, `sutta_words.txt`).
   Runs: Sunday 19:00 UTC, on push of the build code, or by hand (Actions → build-db → Run workflow).
2. `scripts/pull-db.sh` installs it:
   - `pull-db.sh` — site DB: downloads, checks sha256 and build_id, swaps `dg.db` (old one kept as
     `dg.db.prev`), restarts `dg-prod` and `test`. Does nothing if the build is already installed.
   - `pull-db.sh --app` — additionally publishes the archive to `siteroot/mobile-data/`, which is what
     app/PWA users download. Kept to twice a month on purpose: every publish makes users
     re-download ~200 MB (patch updates: dg-node issue #19).
   - Refuses to run while `offline-data/dhammagift` has uncommitted or unpushed changes — the GitHub
     build would miss those translations.
   - Rollback: `mv dg.db dg.db.bad && mv dg.db.prev dg.db && pm2 restart dg-prod test`.

## Third-party repos: weekly shallow mirrors

`scripts/update-external-repos.sh` + `scripts/external-repos.conf` (`<path> <url> <branch>` per line).
Each mirror is reset to the upstream branch tip with depth 1; other refs, the reflog and old objects are
dropped, so no history accumulates. A missing path is cloned shallow. Local edits in a mirror are
discarded by design — never edit files there. Log: `nodejs/logs/update-external-repos.log`.

Listed now: sc-data, tipitaka.lk. Our own repos (commits happen in them) and AI tools are not listed.

## Leftovers of killed Claude sessions

`scripts/claude-reaper.sh` (report) / `--apply` (cron, every 30 min). Every process a session starts
inherits `CLAUDE_PID` and `CLAUDE_CODE_SESSION_ID`; when that `claude` is gone, its headless browsers,
playwright daemons, `http.server` previews and wrapper shells are killed. Two guards: only those known
artifact types, and never anything under pm2 (dg-prod/test carry a dead session's `CLAUDE_PID` because
pm2 was restarted from a Claude shell). Scratch dirs `/tmp/claude-*/<project>/<session>/` go when the
session is not running and its transcript is older than 24 h. Log: `nodejs/logs/claude-reaper.log`.

Run it without `--apply` to see every session, what it still holds and how much.

## Cron (root)

```cron
# docs: prod every 5 h, test every minute
0 */5 * * * git -C /var/www/html/nodejs/dg-docs fetch -q --depth 1 origin dist && git -C /var/www/html/nodejs/dg-docs reset -q --hard origin/dist >/dev/null 2>&1
* * * * * git -C /var/www/html/dg-node-test/dg-docs fetch -q --depth 1 origin dist-preview && git -C /var/www/html/dg-node-test/dg-docs reset -q --hard origin/dist-preview >/dev/null 2>&1
# third-party mirrors, then cache/tmp cleanup (scripts/weekly-cleanup.sh): Sunday 17:00, before the GitHub DB build
0 17 * * 0 mkdir -p /var/www/html/nodejs/logs && { /var/www/html/nodejs/scripts/update-external-repos.sh; /var/www/html/nodejs/scripts/weekly-cleanup.sh; } >> /var/www/html/nodejs/logs/update-external-repos.log 2>&1
# search DB: sites every Monday, app/PWA archive on the 1st and 15th
15 3 * * 1 mkdir -p /var/www/html/nodejs/logs && PATH=/root/.nvm/versions/node/v24.20.0/bin:/usr/local/bin:/usr/bin:/bin /var/www/html/nodejs/scripts/pull-db.sh >> /var/www/html/nodejs/logs/pull-db.log 2>&1
45 3 1,15 * * mkdir -p /var/www/html/nodejs/logs && PATH=/root/.nvm/versions/node/v24.20.0/bin:/usr/local/bin:/usr/bin:/bin /var/www/html/nodejs/scripts/pull-db.sh --app >> /var/www/html/nodejs/logs/pull-db.log 2>&1
# leftovers of killed Claude sessions (browsers, previews, scratch dirs)
*/30 * * * * mkdir -p /var/www/html/nodejs/logs && /var/www/html/nodejs/scripts/claude-reaper.sh --apply | grep -v ' kept)$' >> /var/www/html/nodejs/logs/claude-reaper.log 2>&1
# misc
0 3 1-31/15 * * rm -rf /var/www/html/result/* /var/www/html/result/.??*
*/10 * * * * cd /var/www/html/dg-node-test && /usr/bin/node scripts/disk-guard.js >> /var/www/html/dg-node-test/test/.disk-guard.log 2>&1
```

Adjust the paths and the node `PATH` (`which node`) on another server.

## Repeating this on another server

1. `git clone git@github.com:dhammagift/dg-node.git <dir>`; data: `scripts/setup.sh` makes shallow
   sparse clones of sc-data / offline-data / dg and wires `siteroot/` (skip its DB build step, use step 3).
2. `npm install`, `pm2 start dg-fastify.js --name dg-prod`, `pm2 save`.
3. `scripts/pull-db.sh --force` (set `PROD=` inside the script if the site is not in `/var/www/html/nodejs`).
4. Copy `scripts/external-repos.conf` with this server's paths, point `EXTERNAL_REPOS_CONF` at it.
5. Install the cron lines above with the paths changed.
6. Check: `curl -s 'localhost:3000/search?q=kacchapa' | head -c 300`, then open `/mn1` in a browser.

## Where to look when something breaks

- `pm2 logs dg-prod --lines 100`
- `nodejs/logs/pull-db.log`, `nodejs/logs/update-external-repos.log`
- GitHub Actions: dg-node → build-db; dg-twa → build-twa-release; dg-docs → deploy
- Apache vhosts: `/etc/apache2/sites-available/*.dhamma.gift.conf` (everything proxies to 3000 / 3003)
