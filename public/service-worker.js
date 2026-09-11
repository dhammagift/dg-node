// dg-node's own service worker. Deliberately network-first, not cache-first: the legacy
// service worker this replaces (assets/common/history.html registered navigator.serviceWorker.
// register('/sw.js'), see /var/www/html/sw.js) cached a hardcoded file list forever under a
// cache name that was never bumped — any browser that visited while the legacy PHP site was
// live got permanently stuck on stale JS, invisible to every later fix (owner report:
// "isInstant doesn't work, every time" traced back to this). Cache-first is exactly the trap
// that caused that; this SW tries the network first and only serves a cached copy when the
// network genuinely fails (offline), caching opportunistically as it goes instead of a
// hand-maintained URL list that inevitably goes stale.
//
// The shell is now precached at install so the SPA also opens offline (including a reload of a
// pushState URL like /dn22:2.2 — see the navigate branch below). The cache name is no longer a
// hand-bumped constant: it is 'dg-shell-<build_id>', read from /offline/build-id.json, which
// build-offline.js regenerates (a content hash of the offline layer) on every build. A deploy
// therefore lands in a NEW cache and activate() retires the old one, so the "cache name nobody
// ever bumps" failure mode above cannot come back through the precache path either. When
// build-id.json is missing (fresh checkout, build not run yet) we fall back to 'dg-shell-dev'
// rather than failing install.
//
// activate() deletes EVERY cache whose name is not the current one. That one rule is what
// cleans up the legacy 'pwa-fdg-v1' cache and this file's previous 'dg-node-v1' one on
// browsers still carrying them — deliberately not special-cased by name, because a list of
// legacy names is one more thing that rots.
//
// Bump nothing here by hand — change a file the build hashes (build-offline.js HASHED_FILES)
// and the next build picks a new build_id.
var CACHE_PREFIX = 'dg-shell-';
var DEV_CACHE_NAME = 'dg-shell-dev';
var BUILD_ID_URL = '/offline/build-id.json';
var SHELL_URL = '/';
var MOBILE_DATA_PREFIX = '/mobile-data/';

// URL roots whose asset URLs the server stamps with a ?v=<hash> cache-buster (sendVersionedHtml
// in dg-light.js). Precaching only knows the bare path, so offline lookups of the versioned
// form need ignoreSearch — see matchCached().
var VERSIONED_ASSET_ROOTS = ['/assets/', '/spa/', '/nodejs/res/', '/reader/', '/settings/'];

// Everything the shell needs to boot, and to run a search / open the reader, with no network.
// Some entries are GENERATED and may legitimately be absent on a fresh checkout (/offline/*,
// home-bundle.js, settings-bundle.js) — install() tolerates each URL failing on its own, so a
// missing file here never aborts the install.
var PRECACHE_URLS = [
    // The shell document itself; also the offline fallback for every navigation.
    '/',
    '/manifest.json',

    // The optional offline layer: fetch shim, data worker, sqlite-wasm vendor files.
    '/offline/app.js',
    '/offline/db-worker.js',
    '/offline/offline-status.js',
    '/offline/offline-library-settings.js',
    '/offline/core-bundle.js',
    '/offline/vendor/sqlite-wasm/index.js',
    '/offline/vendor/sqlite-wasm/sqlite3.wasm',
    '/offline/vendor/sqlite-wasm/sqlite3-opfs-async-proxy.js',

    // Reader mode definitions — the reader cannot resolve a mode without this, online or off.
    '/reader/mode-table.json',
    '/reader/translator-priority.json',
    // The TOC's translator filter and the settings page read these generated caches; without them the
    // TOC view died on a cold offline load ('/settings/translator-catalog.json' net::ERR_FAILED).
    '/settings/translator-catalog.json',
    '/settings/lang-counts.json',
    '/settings/scripts.json',
    '/settings/demo-data.json',
    // Exposed by a REAL outage (pm2 test stopped, nginx 503 for everything): these were missing, so
    // the shell came up with i18n placeholders ({{search.label}}) and a search box that silently did
    // nothing. Kept as bare paths — the page requests them with ?v=<hash> and matchCached() retries
    // with ignoreSearch.
    '/assets/js/datatables/datatables.min.css',
    '/assets/js/paliLookup.js',
    '/assets/js/paliLookup.css',
    '/nodejs/res/lang_ru.json',
    '/nodejs/res/lang_en.json',
    '/assets/i18n/lang_global_ru.json',
    '/assets/i18n/lang_global_en.json',
    // The settings page and the TOC: both are things a reader reaches for exactly when something is
    // wrong ("is the library there? what is in the canon?"), and neither was cached until visited —
    // so offline they failed with a browser error (measured: /settings/ would not open with the
    // server down). Both are small.
    '/settings/',
    '/api/toc',

    // Stylesheets in the shell's <head>.
    '/assets/css/bootstrap.5.3.1.min.css',
    '/assets/css/langswitch.css',
    '/assets/css/paliLookup.css',
    '/assets/css/extrastyles.css',
    '/assets/css/table.css',
    '/nodejs/res/css/home.css',

    // Scripts in the shell's <head>.
    '/assets/js/jquery-3.7.0.min.js',
    '/assets/js/bootstrap.bundle.5.3.1.min.js',
    '/assets/js/fontawesome-local.js',
    '/assets/js/diacritics.js',
    '/assets/js/dhamma-i18n.js',
    '/assets/js/mirror-link.js',
    '/assets/js/langswitch.js',
    '/assets/js/themeswitch.js',
    '/assets/js/openDicts.js',
    '/assets/js/openFdg.js',
    '/assets/js/smoothScroll.js',
    '/assets/js/dg-page-find.js',
    '/assets/js/dg-page-find-ui.js',
    '/assets/js/settings-bundle.js',
    '/assets/js/home-bundle.js',

    // Loaded lazily by the shell (loadScript) when a search runs or the reader opens — without
    // these the page boots offline but search and reader come up empty.
    '/assets/js/datatables/datatables.min.js',
    '/assets/js/search-render.js',
    '/assets/js/natural.js',
    '/assets/js/strip-html.js',
    '/assets/js/copyToClipboard.js',
    '/assets/js/linksdpr.js',
    '/assets/js/linksbjt.js',
    '/assets/js/linksbw.js',
    '/assets/js/linksru.js',
    '/assets/js/openBw.js',
    '/assets/js/openDpr.js',
    '/assets/js/openRu.js',
    '/reader/common.js',
    '/reader/megareader.js',
    '/spa/toc.js',

    // Home-tile data fetched on first paint.
    '/nodejs/res/menu-links.json',
    '/nodejs/res/slides.json',

    // webfonts @font-face'd by the stylesheets above; without them text reflows to a fallback
    // face online-offline.
    '/assets/fonts/lato-400.woff2',
    '/assets/fonts/lato-400-italic.woff2',
    '/assets/fonts/lato-600.woff2',
    '/assets/fonts/lato-700.woff2',
    '/assets/fonts/brahmi-subset.woff2'
];

// Memoized so install, activate and the fetch handler all agree on one name without racing
// three separate /offline/build-id.json fetches in the same worker instance.
var cacheNamePromise = null;

// build-offline.js writes {"build_id": "...", "built_at": "..."}, but accept the obvious
// sibling keys and a bare plain-text body too — a rename over there should not silently turn
// versioning off and quietly reintroduce a cache nobody bumps.
function readBuildId(text) {
    var raw = String(text || '').trim();
    if (!raw) return '';
    try {
        var data = JSON.parse(raw);
        if (data && typeof data === 'object') {
            raw = data.build_id || data.buildId || data.id || data.version || '';
        } else {
            raw = String(data);
        }
    } catch (e) {
        // Not JSON: treat the whole body as the id, unless it merely LOOKS like a JSON document
        // (starts with { or [) that failed to parse — an error page truncated into a bad cache
        // name is worse than falling back to the dev name.
        if (raw.charAt(0) === '{' || raw.charAt(0) === '[') raw = '';
    }
    // A build id is a hash or a version string; keep the cache name to a safe charset so a
    // corrupted body cannot invent a name full of spaces or slashes.
    return typeof raw === 'string' ? raw.replace(/[^A-Za-z0-9._-]/g, '').trim() : '';
}

function getCacheName() {
    if (!cacheNamePromise) {
        // cache: 'no-store' — a build id read out of the HTTP cache would version the new shell
        // under the previous build's name, which is the whole thing this scheme exists to avoid.
        cacheNamePromise = fetch(BUILD_ID_URL, { cache: 'no-store' })
            .then(function (response) {
                return response.ok ? response.text() : '';
            })
            .then(function (text) {
                var id = readBuildId(text);
                return id ? CACHE_PREFIX + id : DEV_CACHE_NAME;
            })
            .catch(function () {
                // Generated file, possibly not built yet, or the first install happens offline.
                // Neither may fail install().
                return DEV_CACHE_NAME;
            });
    }
    return cacheNamePromise;
}

// One entry at a time, six at a time, one retry each; anything still missing is named. Measured
// while chasing a real outage: a flat Promise.allSettled over ~145 URLs left the cache with 127
// entries (and /spa/toc.js among the missing, though the server answered it 200) — the same files
// cache perfectly when put from the page, so the gap is in this pass, not in the files.
function precacheAll(cache, cacheName) {
    var failed = [];
    var queue = PRECACHE_URLS.slice();
    function worker() {
        var url = queue.shift();
        if (!url) return Promise.resolve();
        return cache.add(new Request(url, { cache: 'reload' }))
            .catch(function () { return cache.add(new Request(url, { cache: 'reload' })); })
            .catch(function () { failed.push(url); })
            .then(worker);
    }
    return Promise.all([worker(), worker(), worker(), worker(), worker(), worker()])
        .then(function () {
            if (failed.length) {
                console.warn('[sw] precache missed ' + failed.length + ' of ' + PRECACHE_URLS.length +
                    ' for ' + cacheName + ': ' + failed.join(', '));
            } else {
                console.log('[sw] precache complete: ' + PRECACHE_URLS.length + ' entries in ' + cacheName);
            }
            return failed;
        });
}

self.addEventListener('install', function (event) {
    event.waitUntil(
        getCacheName()
            .then(function (cacheName) {
                return caches.open(cacheName).then(function (cache) {
                    // allSettled + one cache.add per URL, never cache.addAll: addAll is atomic,
                    // so a single 404 (a generated file not built yet, an asset absent from this
                    // deploy) would abort the WHOLE install and leave no shell cached at all. A
                    // missing entry is recoverable through network-first; an empty cache while
                    // offline is not.
                    //
                    // cache: 'reload' bypasses the HTTP cache for the precache fetch: the
                    // server marks public/overrides assets immutable for a year, so without it
                    // a returning browser could precache yesterday's JS into today's cache.
                    // ... but NOT all at once: measured on a real outage, ~145 simultaneous cache.add
                    // calls left the cache with 127 entries — /spa/toc.js and /reader/lang_ru.json among
                    // the missing, which is exactly why /toc and a cold /dn22:2.2 died offline while the
                    // server was answering those very files with 200. Small batches, one retry each, and
                    // anything still missing is named in the log.
                    return precacheAll(cache, cacheName);
                });
            })
            .then(function () {
                // Take over immediately: the point is to displace the legacy worker's stale
                // state, not to wait for every tab to close. Network-first makes an in-place
                // update safe — no page is served a cached response while online.
                return self.skipWaiting();
            })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        getCacheName()
            .then(function (cacheName) {
                return caches.keys().then(function (names) {
                    // Everything that is not the current cache goes. That includes the legacy
                    // 'pwa-fdg-v1' cache and the old constant-name 'dg-node-v1' one.
                    return Promise.all(
                        names
                            .filter(function (name) { return name !== cacheName; })
                            .map(function (name) { return caches.delete(name); })
                    );
                });
            })
            .then(function (cacheName) {
                // Second pass, fire-and-forget: whatever the install pass missed gets another go here
                // (a transient failure during install used to mean a shell file that was simply never
                // cached — /spa/toc.js, /reader/lang_ru.json — and therefore a page that died offline).
                return caches.open(cacheName).then(function (cache) {
                    return Promise.all(PRECACHE_URLS.map(function (url) {
                        return cache.match(url, { ignoreSearch: true });
                    })).then(function (present) {
                        var missing = PRECACHE_URLS.filter(function (url, i) { return !present[i]; });
                        if (!missing.length) return;
                        console.log('[sw] filling ' + missing.length + ' shell entries the install pass missed');
                        return precacheAll(cache, cacheName);
                    });
                }).catch(function () { /* the cache is still usable as-is */ });
            })
            .then(function () {
                return self.clients.claim();
            })
    );
});

// Fallback for a failed network fetch: exact URL first (so a query string is honoured whenever
// that exact response was cached opportunistically). Only if that misses AND the path is a
// versioned static asset do we retry with ignoreSearch — the shell HTML carries ?v=<hash> on
// its asset URLs while precache knows only the bare paths, so without this every script and
// stylesheet would fail offline. Never do this for /search or /api: a query string there
// selects the response, and ignoring it would serve another query's cached data as if it were
// this one's.
function matchCached(request, url) {
    return caches.match(request).then(function (cached) {
        if (cached) return cached;
        for (var i = 0; i < VERSIONED_ASSET_ROOTS.length; i++) {
            if (url.pathname.indexOf(VERSIONED_ASSET_ROOTS[i]) === 0) {
                return caches.match(request, { ignoreSearch: true });
            }
        }
        return undefined;
    });
}

self.addEventListener('fetch', function (event) {
    var request = event.request;

    // Non-GET (the offline DB download's range probes, form posts) must reach the network
    // untouched — Cache Storage only speaks GET.
    if (request.method !== 'GET') return;

    var url;
    try {
        url = new URL(request.url);
    } catch (e) {
        return;
    }

    // Non-same-origin: never intercept. Third-party responses (the Aksharamukha converter
    // script) are not ours to cache, and an opaque one cached here would be an unusable blob.
    if (url.origin !== self.location.origin) return;

    // /mobile-data/ is the ~170 MB offline database download. Caching it in Cache Storage is
    // both wrong (it is not a shell asset) and enormous; the offline layer streams it into OPFS
    // itself and does not want a second copy.
    if (url.pathname.indexOf(MOBILE_DATA_PREFIX) === 0) return;

    // Range requests are partial responses (the resumable database download). Caching one
    // would store a chunk as if it were the complete file and later serve that chunk as the
    // whole response.
    if (request.headers.get('range')) return;

    // Navigations stay network-first, but when the network fails answer with the precached
    // shell instead of letting the error through: offline, /dn22:2.2 has no server to return
    // search/index.html, and the SPA router needs that HTML to resolve the URL client-side.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(function (response) {
                    // A 5xx is the app being down, not a page worth showing: with the server stopped,
                    // nginx answers 502 and the reader saw that page instead of the cached shell —
                    // the fetch only *rejects* when the connection itself fails (airplane mode,
                    // DevTools offline), which is why this looked like it worked.
                    if (response.status >= 500) return matchCached(SHELL_URL).then(function (c) { return c || response; });
                    return response;
                })
                .catch(function () {
                    return caches.match(SHELL_URL);
                })
        );
        return;
    }

    event.respondWith(
        fetch(request)
            .then(function (response) {
                // Same reasoning as navigations: a 5xx means the app is down, so serve what we have
                // cached (if anything) instead of the proxy's error page.
                if (response.status >= 500) {
                    // matchCached(), not caches.match(): the page asks for '/assets/js/search-render.js?v=<hash>'
                    // and the precache holds the bare path — without ignoreSearch the 503 came straight
                    // through, which is exactly what a real outage looked like (pm2 stopped).
                    return matchCached(request).then(function (c) { return c || response; });
                }
                // Only cache real, same-origin, successful responses — an opaque/cross-origin
                // or error response cached here would just serve that error offline forever.
                if (response.ok && response.type === 'basic') {
                    var copy = response.clone();
                    getCacheName()
                        .then(function (cacheName) {
                            return caches.open(cacheName).then(function (cache) {
                                return cache.put(request, copy);
                            });
                        })
                        .catch(function () {
                            // Caching is best-effort: a quota or clone failure must not break
                            // the response the page is waiting for.
                        });
                }
                return response;
            })
            .catch(function () {
                return matchCached(request, url);
            })
    );
});
