---
title: The offline database
---

# The offline database (offline library)

The site works without a network on top of one artifact: a SQLite file with the corpus and a trigram
FTS index. It is built **in this repository** — nothing depends on the old `dg-app-full` checkout any
more — and the same file serves the web PWA, the TWA and, later, the native apps.

## Where everything lives

| What | Path | Served as |
|---|---|---|
| Corpus sources (SuttaCentral Bilara + DhammaGift) | `siteroot/data/suttacentral.net`, `siteroot/data/dhammagift` (symlinks) | — |
| Full server corpus (built) | `dg.db` | used by `dg-fastify.js` / `dg-light.js` |
| **Offline slice (built)** | `siteroot/mobile-data/dg-mobile.db` | `/mobile-data/dg-mobile.db` |
| Slice manifest | `siteroot/mobile-data/db-manifest.json` | `/mobile-data/db-manifest.json` |
| Web offline layer | `public/offline/*` (`app.js`, `db-worker.js`, `core-bundle.js`, `offline-status.js`, `offline-library-settings.js`, `platform.js`) | `/offline/*` |
| Shell cache (service worker) | `public/service-worker.js` | `/sw.js` |
| Dictionary (DPD, ~24 MB) | `assets/js/standalone-dpd/*` | `/assets/js/standalone-dpd/*` |

The artifacts themselves are never committed (hundreds of MB, rebuildable). On a server the directory
`siteroot/mobile-data/` must be a real directory; the *test* checkout symlinks it to the production
one so a second 500 MB copy is not kept around:

```bash
ls -l siteroot/mobile-data
# -> /var/www/html/nodejs/siteroot/mobile-data      (test host)
```

## How to build

```bash
npm run build-search-db          # siteroot/data/* -> dg.db (the full corpus, FTS5 trigram)
npm run build-mobile-db          # dg.db -> siteroot/mobile-data/dg-mobile.db + db-manifest.json
```

`build-mobile-db.js` flags: `--langs=ru,en` (translations to include), `--source=<path>`
(`--from=` is accepted as an alias), `--out=<dir>`. A build on the production box measured:

```
suttas 7605, texts 1195505, html 488428        (13 s)
chunks 36204 hashed                            (14 s)
fts rebuilt                                    (60 s)
dg-mobile.db: 509.2 MB, build 60d1e55ebe4500a7  (total 129 s)
```

What the slice contains: every sutta; `texts` for `kind IN ('root','variant')` plus translations of
the chosen languages only; all `html` segment markup; a `chunks` row per
(sutta, kind, lang, translator) with a hash — the unit a future delta update would use; and the FTS5
index (`tokenize='trigram remove_diacritics 1'`) rebuilt from the sliced content. In `chunks`,
`lang`/`translator` are `''` and not `NULL` for root/variant/html: a `WITHOUT ROWID` primary key
cannot hold NULL.

`db-manifest.json` is what clients read first:

```json
{ "schema_version": 1, "build_id": "60d1e55ebe4500a7", "langs": "ru,en", "fts": "trigram",
  "source": "dg.db", "built_at": "…", "file": "dg-mobile.db", "bytes": 509000000,
  "sha256": "…", "chunks": 36204, "patches": [] }
```

A legacy manifest that older builds of the Android app used (`dg-ru-en.db` + `.gz`) is kept next to it
as `db-manifest.legacy.json`; the web layer does not read it.

## How a client uses it

1. `distBase = window.DG_DIST_BASE || '/mobile-data'` (`public/offline/platform.js`).
2. Fetch `db-manifest.json`, then download `dg-mobile.db` (HTTP `Range` for resume) into OPFS under
   `dg-mobile.<build_id>.db` — the file name tells which build the reader holds.
3. Verify: a cheap check gates the install (rows readable), the full `PRAGMA quick_check` runs in the
   background and can still invalidate the library.
4. A worker (OPFS SAH pool + `@sqlite.org/sqlite-wasm`) answers `/search`, `/api/text/:id`,
   `/api/nav/:id`; the site's own `fetch` is shimmed before any other script runs.
5. The shell (HTML, JS, CSS, wasm, `core-bundle.js`) is cached by the service worker; the dictionary
   is cached by the page right after the library is adopted (the service worker's install pass alone
   proved unreliable — see below).

Only one tab owns the OPFS pool (single-writer resource); the tab in front takes it over and a tab
without it can be served by the owner over a `BroadcastChannel`.

## Verifying

```bash
npm run test-offline           # end-to-end: install, offline search/reader/TOC, parity against dg.db and dg-fastify
npm run test-offline-parity    # the worker's core bundle vs core/search-core.js
npm run test-offline-resume    # truncated response -> Range resume
```

For a *real* outage rather than an emulated one, stop the app server (`pm2 stop test`) and drive the
site: search, a sutta URL cold, `/toc` expanded, the dictionary, a second tab. DevTools "offline"
only makes requests reject; a stopped server also answers 5xx, which is the case that used to break
the shell.

## Gotchas worth remembering

- OPFS requires a secure context (HTTPS or localhost).
- The browser may evict storage; the page asks for persistent storage, and a missing library is a
  normal state the UI reports ("Settings → Offline library").
- A `5xx` must fall back to the cache, and a cache miss must **rethrow** — `respondWith(undefined)` is
  a TypeError in the page ("Failed to convert value to 'Response'") and a spinner that never stops.
- The service worker's install-time precache can silently miss entries (127 of ~145 in one measured
  run, with the server answering those files 200). Anything that must be there offline is cached from
  the page as well.
- Tab lifecycle: a page in the back/forward cache keeps its worker and the pool handles, so the worker
  is terminated on `pagehide` (never during a download) and the library is re-opened on
  `focus`/`visibilitychange`/`pageshow`.
