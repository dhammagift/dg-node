---
slug: /installation
sidebar_position: 1
---

# Installation and running

The Dhamma.gift ecosystem is several independent git repositories that
together make up one product:

| Repository | What it is |
|---|---|
| [`dg-node`](https://github.com/dhammagift/dg-node) | The main site (Express + SPA) — search, reader, this docs portal (`dg-docs/`) |
| [`dg-app-full`](https://github.com/dhammagift/dg-app-full) | The offline Android/iOS app (Capacitor). Builds its UI from a `dg-node` checkout — nothing is copied by hand |
| [`dg`](https://github.com/dhammagift/dg) | The legacy PHP site — the source of assets (`assets/`), 4nt, the TTS player (`read/`) and old pages (`config/`, `login/`, `memo/`) that `dg-node` links to via symlinks |
| [`offline-data`](https://github.com/dhammagift/offline-data) | The project's own translations (best ru/en translation, second opinion, AI translation) |
| [`suttacentral/sc-data`](https://github.com/suttacentral/sc-data) | The external SuttaCentral repository — Pali texts and translations in Bilara format (not ours, public) |
| [`dgift_bot`](https://github.com/dhammagift/dgift_bot) | The Telegram bot (Python) |
| [`dg-twa`](https://github.com/dhammagift/dg-twa) | The **Dhamma.Gift online** Android app (Bubblewrap/TWA) |
| [`dictPlugin`](https://github.com/dhammagift/dictPlugin) | The browser extension (Chrome/Firefox) + userscript |

Only the site itself (`dg-node`) can be brought up fully automatically
with one script — everything else (the legacy repo, the texts) it uses
as external data, wired in via symlinks (see `CLAUDE.md` → "Prod: paths
and symlinks"), not as npm dependencies.

## The site (`dg-node`) — from nothing to a running server

Requires **Node.js 22.5 or newer** (production runs 24.20.0), **npm** and
**git**. The version floor is not a preference: the server reads its search
database through `node:sqlite`, which only exists from 22.5 on. `setup.sh`
checks this first and stops with a clear message rather than letting it fail
later.

```bash
git clone https://github.com/dhammagift/dg-node.git
cd dg-node
./scripts/setup.sh     # a few minutes, mostly cloning the texts
./scripts/start.sh     # → http://localhost:3000
```

That is the whole thing. `setup.sh` does, in one pass:

1. Sparse-clones three external repositories next to `dg-node` — by
   default into `../dg-data/`:
   - `suttacentral/sc-data` (`sc_bilara_data/`, `structure/`) — Pali texts
   - `dhammagift/offline-data` (`dhammagift/`) — the project's translations
   - `dhammagift/dg` (`assets/`, `4nt/`, `config/`, `login/`, `memo/`,
     `read/`) — legacy assets
2. Rebuilds the symlinks `siteroot/{assets,4nt,config,login,memo,read}`
   and `siteroot/data/{suttacentral.net,dhammagift}` so they point at the
   fresh clones (the same thing CI does, just without `sudo` or system
   paths — this version is meant for a regular dev machine).
3. `npm install` — both in the `dg-node` root and in `dg-docs/` (this
   docs portal).
4. `npm run build-db` — the search skeleton `dg_db_light.json`, used by the
   legacy Express server.
5. `npm run build-search-db` — **`dg.db`, the SQLite/FTS5 corpus the
   production server reads.** Around 600 MB and a minute or two; this is the
   slow step.
6. `node test-search-db.js` — asserts the freshly built database is sane
   before you ever start the server.

Safe to re-run: already-cloned repositories are left alone (unless
`--force` is passed), symlinks are just rebuilt, the databases are rebuilt
from scratch.

`DATA_DIR=/other/path ./scripts/setup.sh` — if you'd rather not clone
next to `dg-node`.

Check it works:

```
http://localhost:3000/search?q=kacchapa&scope=dhamma&langs=ru,en
http://localhost:3000/dn22:1.1
```

### Which server is running

There are two in the repository, serving the same site from the same texts:

| | Engine | Start | Default port |
|---|---|---|---|
| `dg-fastify.js` | Fastify, SQLite FTS5 (`dg.db`) | `./scripts/start.sh` or `npm run start:fastify` | 3000 |
| `dg-light.js` | Express, searches by shelling out to `grep` | `npm start` | 3001 |

`scripts/start.sh` launches the first one — it is what production serves.
Both honour `PORT`, and their defaults differ so you can run them side by
side and compare.

The docs portal (what you're reading now) builds separately, in two locales:

```bash
cd dg-docs
npm run build      # English version → build/
npm run build:ru   # Russian version → build-ru/
```

The built output is git-ignored, so a fresh checkout has no `dg-docs/build/`
until you run this — the `/docs` route stays empty until then.

## The search database (`dg.db`) and the Fastify server

The Fastify server exists because `grep` was not
the slow part: a full-corpus `/search?q=dukkha` took about 42 seconds, of
which raw `grep` was half a second — the rest was re-reading thousands of JSON
files to fill in quotes, translations and titles for the hits. Moving the
whole corpus into SQLite made that enrichment an indexed lookup instead of a
filesystem walk, and the same query now answers in roughly two seconds.

### Building it

```bash
npm run build-search-db     # → dg.db, about 600 MB, ~85 seconds
```

The build reads the corpus directly — the same trees `scripts/setup.sh` wires
up — and derives everything it needs itself, so it does **not** depend on
`dg_db_light.json` or on `npm run build-db` having been run first. (The
Express server still uses that skeleton; the two pipelines are deliberately
independent.) `scripts/setup.sh` does not call it yet, so on a fresh checkout
run it by hand before starting the Fastify server.

`dg.db` is generated and git-ignored. Never hand-edit it: the next build
replaces the file wholesale. Anything written by a person — translator
credits, reader modes, translator priority — lives in `configs/` instead.

To check a freshly built database:

```bash
node test-search-db.js
```

It asserts the invariants a silent build regression would break: that the
corpus is actually there, that the index does substring matching rather than
prefix matching, that diacritics and `ё`/`е` fold, that hidden translations
stay out of the index, that no segment is stored twice, and that the search
queries use indexes instead of scanning.

### Node version

The server reads the database through **`node:sqlite`, built into Node since
22.5** — there is no `better-sqlite3` or other native module to compile. That
also makes the Node version a hard requirement rather than a preference: on
anything older, `require('node:sqlite')` throws
`ERR_UNKNOWN_BUILTIN_MODULE` and the server does not start.

### Running

```bash
npm run start:fastify             # port 3000
PORT=3005 npm run start:fastify   # or anywhere else
```

### Under PM2

```bash
pm2 start dg-fastify.js --name dg-fastify -i 2 --max-memory-restart 700M
pm2 save
```

Two things are worth knowing before doing that.

**PM2 spawns cluster workers with its own Node, not the one on your `PATH`.**
If the PM2 daemon was started under an older Node, every worker dies the
instant it reaches `require('node:sqlite')` — and because PM2 pipes a cluster
worker's output through IPC, it dies before anything reaches the log, so you
get an endless restart loop with empty log files. Fork mode hides the problem,
since it launches a fresh `node` from `PATH`. Check with
`ls -l /proc/$(pgrep -f 'God Daemon')/exe`; fix by pointing the `PATH` in
`/etc/systemd/system/pm2-root.service` at a current Node, then
`systemctl daemon-reload && pm2 save && pm2 update`.

**Set a memory ceiling.** Each worker holds its own copy of the
transliteration runtime and settles around 550–600 MB under load, so two
workers on a 4 GB machine is comfortable and three is not. `max_memory_restart`
restarts a worker that grows past the limit while the other keeps serving.

Clustering is worth it because a heavy search occupies the event loop for its
whole duration — `node:sqlite` is synchronous and the enrichment is CPU-bound
JavaScript. On a single process a cheap query issued during a heavy one waits
for it (measured: 0.07 s alone, 2.2 s behind a `dukkha` search); with two
workers it is answered immediately.

## Telegram bot (`dgift_bot`)

Requires: Python 3.9+.

```bash
git clone https://github.com/dhammagift/dgift_bot.git
cd dgift_bot
./setup.sh
```

The script creates a venv (`telegram/`), installs the dependencies
(`python-telegram-bot>=20`, `watchdog`) and drafts two config files —
`config.dgift_bot.json` and `config.dhammagift_bot.json` (it's the same
code, two bot accounts under different names — see the
[Telegram bot page](/telegram-bot)). Fill in a real `TOKEN` in each.
Then:

```bash
telegram/bin/python main.py config.dgift_bot.json
```

For a production setup (systemd services, autostart for both bots) —
`install_sysctl_bots.sh` in the same repository.

Word autocomplete and `watcher.py`'s notifications expect a `dg-node`
running alongside (they read `assets/texts/...`) — the bot doesn't crash
without it, those features just silently stay off.

## Android app (`dg-twa`)

Requires: JDK 17, Android SDK (API 36, build-tools 36.0.0).

```bash
git clone https://github.com/dhammagift/dg-twa.git
cd dg-twa
./scripts/build.sh
```

Builds the APK/AAB with the same command CI uses
(`./gradlew app:assembleRelease`/`bundleRelease`). The result is
**unsigned** — CI applies the signature in a separate step from secrets
(`KEYSTORE_BASE64` etc.), locally you'll need to sign it yourself
(`apksigner`) before installing it on a device.

## Browser extension (`dictPlugin`)

The Chrome and Firefox builds already sit as ready folders in the
repository (`browser-extention/dictLookup-extention-*-{chrome,firefox}/`)
— no build step needed. To test locally: `chrome://extensions` →
"Developer mode" → "Load unpacked" → pick the folder.

## See also

The reference for every site endpoint — Swagger/OpenAPI, lives right
next to this page in the same section.
