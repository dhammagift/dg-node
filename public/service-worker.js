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
// Roots whose URLs legitimately carry a query (?v=<build> on assets, ?langs=ru,en on the TOC's
// per-book trees) and where a cached bare path is the right answer for any query.
var VERSIONED_ASSET_ROOTS = ['/assets/', '/spa/', '/nodejs/res/', '/reader/', '/settings/', '/api/toc/'];

// What the shell needs, in two tiers.
//
// CRITICAL_URLS is precached at install: the document itself, the CSS and JS its <head> pulls in,
// the i18n those render with, and the offline layer's page-side scripts. This is what a cold
// offline boot needs before it can show anything at all.
//
// SECONDARY_URLS is everything else — the lazily loaded scripts, the TOC's per-book trees, the
// settings caches, the data worker and its wasm, the fonts. It used to be precached at install
// too, which meant ~100 URLs fetched with cache:'reload' by EVERY visitor, including the large
// majority who never ask for the offline library, and — over HTTP/1.1's six connections — in
// direct competition with the page's own assets. That contention is the most plausible reading of
// an install pass dropping entries while the server answered every one of them 200 (127 of ~145
// in one measured run). It is now precached on a message from the page (public/offline/app.js
// sends it after `load`), so the shell ends up exactly as complete a couple of seconds later
// without racing the page it exists to make fast. Offline coverage does not change: what makes a
// later visit work offline is that some EARLIER online visit filled the cache, not which second
// of that visit it happened in.
//
// Some entries are GENERATED and may legitimately be absent on a fresh checkout (/offline/*,
// home-bundle.js, settings-bundle.js) — precaching tolerates each URL failing on its own, so a
// missing file here never aborts the install.
var CRITICAL_URLS = [
    // The shell document itself; also the offline fallback for every navigation.
    '/',
    '/manifest.json',

    // The offline layer's page-side scripts (the worker and its wasm are in the second tier: they
    // are only ever needed once a library is actually stored, which is never for most visitors).
    '/offline/app.js',
    '/offline/offline-status.js',
    '/offline/offline-library-settings.js',

    // Reader mode definitions — the reader cannot resolve a mode without this, online or off.
    '/reader/mode-table.json',
    '/reader/translator-priority.json',

    // Stylesheets in the shell's <head>.
    '/assets/css/bootstrap.5.3.1.min.css',
    '/assets/css/langswitch.css',
    '/assets/css/paliLookup.css',   // the dictionary panel's own stylesheet — without it the panel opens unstyled/invisible
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
    '/assets/js/dict-mode-shared.js', // settings-bundle.js and home-bundle.js below both call into it
    '/assets/js/settings-bundle.js',
    '/assets/js/home-bundle.js',

    // Exposed by a REAL outage (pm2 test stopped, nginx 503 for everything): without these the
    // shell came up with i18n placeholders ({{search.label}}) and a search box that silently did
    // nothing. Kept as bare paths — the page requests them with ?v=<hash> and matchCached() retries
    // with ignoreSearch.
    '/nodejs/res/lang_ru.json',
    '/nodejs/res/lang_en.json',
    '/assets/i18n/lang_global_ru.json',
    '/assets/i18n/lang_global_en.json'
];

var SECONDARY_URLS = [
    // The optional offline layer: data worker, sqlite-wasm vendor files, the search core.
    '/offline/db-worker.js',
    '/offline/core-bundle.js',
    '/offline/vendor/sqlite-wasm/index.js',
    '/offline/vendor/sqlite-wasm/sqlite3.wasm',
    '/offline/vendor/sqlite-wasm/sqlite3-opfs-async-proxy.js',

    // The TOC opens a book by fetching /api/toc/book/<code>?langs=... — a route that was never cached,
    // so offline the top-level list rendered and NOTHING could be expanded (owner: "покажи оглавление
    // sn12 полностью развёрнутое"). Cached bare; the ?langs= variant is matched through the /api/toc/
    // root in VERSIONED_ASSET_ROOTS.
    // The Patimokkha branches of the TOC and the two fragment endpoints they read: without these the
    // tree expanded offline and then died on 'Failed to fetch' (measured with pm2 stopped).
    '/api/patimokkha-fragment/bu', '/api/patimokkha-fragment/bi',
    '/api/toc/book/dn', '/api/toc/book/mn', '/api/toc/book/sn', '/api/toc/book/an', '/api/toc/book/kn',
    '/api/toc/book/iti', '/api/toc/book/ud', '/api/toc/book/snp', '/api/toc/book/dhp', '/api/toc/book/thag',
    '/api/toc/book/thig', '/api/toc/book/mil', '/api/toc/book/kp', '/api/toc/book/pe',
    '/api/toc/book/pli-tv-bu-pm', '/api/toc/book/pli-tv-bi-pm', '/api/toc/book/pli-tv-bu-vb',
    '/api/toc/book/pli-tv-bi-vb', '/api/toc/book/pli-tv-kd', '/api/toc/book/pli-tv-pvr',
    // The TOC's translator filter and the settings page read these generated caches; without them the
    // TOC view died on a cold offline load ('/settings/translator-catalog.json' net::ERR_FAILED).
    '/settings/translator-catalog.json',
    '/settings/lang-counts.json',
    '/settings/scripts.json',
    '/settings/demo-data.json',
    // The settings page and the TOC: both are things a reader reaches for exactly when something is
    // wrong ("is the library there? what is in the canon?"), and neither was cached until visited —
    // so offline they failed with a browser error (measured: /settings/ would not open with the
    // server down). Both are small.
    '/settings/',
    '/api/toc',

    // Asked for by the reader's toolbar and the quick modal; all 200 on the server but never cached,
    // so offline the toolbar showed broken icons and quickModal.js failed to load (owner's screenshots).
    '/assets/js/quickModal.js',
    '/assets/js/translators.js',
    '/assets/js/paliLookup.js',
    '/assets/svg/clock-rotate-left.svg',
    '/assets/svg/eye.svg',
    '/assets/svg/eye-slash.svg',
    '/assets/svg/rotate-solid-full.svg',
    '/assets/svg/open-link.svg',
    '/assets/svg/trash-can-regular-full.svg',
    '/assets/svg/link-solid-full.svg',
    '/assets/svg/volume-solid-full.svg',
    '/assets/js/datatables/datatables.min.css',

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
// cache perfectly when put from the page, so the gap is in this pass, not in the files. Since that
// measurement the list is no longer precached in one go at install (see CRITICAL_URLS above),
// which removes the contention that is the likeliest explanation for the gap.
function precacheAll(cache, cacheName, urls) {
    var failed = [];
    var queue = urls.slice();
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
                console.warn('[sw] precache missed ' + failed.length + ' of ' + urls.length +
                    ' for ' + cacheName + ': ' + failed.join(', '));
            } else {
                console.log('[sw] precache complete: ' + urls.length + ' entries in ' + cacheName);
            }
            return failed;
        });
}

// Which of these URLs the cache does not hold yet. Every precache pass goes through this first,
// because every pass can run against a cache that is already full: the page asks for the second
// tier on EVERY load, and activate()'s fill-in used to re-fetch the WHOLE list (with cache:'reload',
// so the HTTP cache could not soften it either) when a single entry was missing.
function missingFrom(cache, urls) {
    return Promise.all(urls.map(function (url) {
        return cache.match(url, { ignoreSearch: true });
    })).then(function (present) {
        return urls.filter(function (url, i) { return !present[i]; });
    });
}

// URLs this worker instance has already failed to fetch twice. A deploy where a generated file is
// genuinely absent (or a root the server does not serve) would otherwise be re-attempted on every
// single page load, since the page asks for the second tier every time — two requests per missing
// file, forever. Forgotten when the worker is torn down, so a file that appears later is picked up
// on the next visit; and anything skipped here is still cached opportunistically when the page
// actually uses it.
var failedUrls = Object.create(null);

function precacheMissing(cache, cacheName, urls, what) {
    return missingFrom(cache, urls).then(function (all) {
        var missing = all.filter(function (url) { return !failedUrls[url]; });
        if (!missing.length) return [];
        console.log('[sw] ' + what + ': fetching ' + missing.length + ' of ' + urls.length + ' entries');
        return precacheAll(cache, cacheName, missing).then(function (failed) {
            failed.forEach(function (url) { failedUrls[url] = true; });
            return failed;
        });
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
                    //
                    // Critical tier only. The rest follows on a message from the page, once the
                    // page has finished loading its own assets (see SECONDARY_URLS).
                    return precacheMissing(cache, cacheName, CRITICAL_URLS, 'install');
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
                    ).then(function () { return cacheName; });
                });
            })
            .then(function (cacheName) {
                // Whatever the install pass missed gets another go here — but only what is
                // actually missing (a transient failure during install used to mean a shell file
                // that was simply never cached — /spa/toc.js, /reader/lang_ru.json — and therefore
                // a page that died offline).
                return caches.open(cacheName).then(function (cache) {
                    return precacheMissing(cache, cacheName, CRITICAL_URLS, 'activate fill-in');
                }).catch(function () { /* the cache is still usable as-is */ });
            })
            .then(function () {
                return self.clients.claim();
            })
    );
});

// The second tier, asked for by the page (public/offline/app.js) once it has finished loading.
// Anything already cached is skipped, so the message costs a handful of cache lookups on the
// visits where there is nothing to do — which is all of them after the first.
self.addEventListener('message', function (event) {
    var data = event.data || {};
    if (!data || data.type !== 'dg-precache') return;
    var critical = data.scope === 'critical';
    var urls = critical ? CRITICAL_URLS : SECONDARY_URLS;
    event.waitUntil(
        getCacheName()
            .then(function (cacheName) {
                return caches.open(cacheName).then(function (cache) {
                    return precacheMissing(cache, cacheName, urls, critical ? 'critical' : 'secondary');
                });
            })
            .catch(function () { /* best effort: everything here is also cached on use */ })
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
        var pathname = url ? url.pathname : null;
        if (!pathname) {
            // Called without a parsed URL (the navigation fallback used to do exactly this, and
            // dereferencing the missing argument threw a TypeError INSIDE respondWith — the page
            // then got "Failed to convert value to 'Response'" instead of the cached shell).
            try { pathname = new URL(typeof request === 'string' ? request : request.url, self.location.href).pathname; }
            catch (e) { return undefined; }
        }
        for (var i = 0; i < VERSIONED_ASSET_ROOTS.length; i++) {
            if (pathname.indexOf(VERSIONED_ASSET_ROOTS[i]) === 0) {
                return caches.match(request, { ignoreSearch: true });
            }
        }
        return undefined;
    });
}

// One query's answer is not shell state: /search and /api/text responses are large, there are
// unboundedly many of them, and every one cached here eats the SAME origin quota the 170-500MB
// library in OPFS needs (a cache that quietly grows to a gigabyte is how a download starts failing
// for no visible reason). /api/toc* and /api/patimokkha-fragment/* are the exception — they are
// the shell's own data and are precached by name above.
function isUncacheableData(pathname) {
    if (pathname === '/search' || pathname.indexOf('/search/') === 0) return true;
    if (pathname.indexOf('/api/') !== 0) return false;
    return pathname.indexOf('/api/toc') !== 0 && pathname.indexOf('/api/patimokkha-fragment') !== 0;
}

// An asset URL stamped with ?v=<hash> (sendVersionedHtml in dg-light.js) names its own content:
// change the file and the page asks for a different URL. A cached copy of THAT exact URL can
// therefore be served without asking the network first — the trap this worker exists to avoid
// (cache-first pinning stale JS forever) needs a cache key that outlives the content, and a
// content hash inside the key is precisely what cannot. Bare paths and everything else stay
// network-first.
function isVersionedAsset(url) {
    if (!url.searchParams.get('v')) return false;
    for (var i = 0; i < VERSIONED_ASSET_ROOTS.length; i++) {
        if (url.pathname.indexOf(VERSIONED_ASSET_ROOTS[i]) === 0) return true;
    }
    return false;
}

// Store a copy, inside event.waitUntil: a bare cache.put() races the end of the fetch event and
// the browser is free to kill it once the response has been delivered, which is one more way an
// entry that "was definitely fetched" turns out not to be in the cache.
//
// For a ?v=<hash> URL the same path may already be cached under a previous build's hash — nobody
// will ever ask for that one again, so it goes. cache.keys(request, {ignoreSearch:true}) returns
// exactly the entries for this path and nothing else, so the sweep is bounded. The BARE path is
// deliberately kept: it is the precached copy matchCached() falls back to.
function cachePut(event, key, response, url) {
    var copy = response.clone();
    event.waitUntil(
        getCacheName()
            .then(function (cacheName) {
                return caches.open(cacheName).then(function (cache) {
                    return cache.put(key, copy).then(function () {
                        if (!url || !url.searchParams.get('v')) return undefined;
                        return cache.keys(key, { ignoreSearch: true }).then(function (keys) {
                            return Promise.all(keys.map(function (cached) {
                                if (cached.url === (typeof key === 'string' ? key : key.url)) return undefined;
                                var search;
                                try { search = new URL(cached.url).search; } catch (e) { return undefined; }
                                if (!search) return undefined;   // the bare precached path stays
                                return cache.delete(cached);
                            }));
                        });
                    });
                });
            })
            .catch(function () {
                // Caching is best-effort: a quota or clone failure must not break the response
                // the page is waiting for.
            })
    );
}

function networkFirst(event, request, url) {
    return fetch(request)
        .then(function (response) {
            // A 5xx means the app is down, so serve what we have cached (if anything) instead of
            // the proxy's error page.
            if (response.status >= 500) {
                // matchCached(), not caches.match(): the page asks for '/assets/js/search-render.js?v=<hash>'
                // and the precache holds the bare path — without ignoreSearch the 503 came straight
                // through, which is exactly what a real outage looked like (pm2 stopped).
                return matchCached(request, url).then(function (c) { if (c) return c; throw new Error('HTTP ' + response.status); });
            }
            // Only cache real, same-origin, successful responses — an opaque/cross-origin
            // or error response cached here would just serve that error offline forever.
            if (response.ok && response.type === 'basic' && !isUncacheableData(url.pathname)) {
                cachePut(event, request, response, url);
            }
            return response;
        })
        .catch(function (e) {
            // A miss here used to resolve to undefined, and respondWith(undefined) is a TypeError in
            // the page — "Failed to convert value to 'Response'" (owner's console: quickModal.js and
            // settings-bundle.js during an outage, with a spinner that never stopped). A missing
            // cache entry has to look like a failed request, which is what it is.
            return matchCached(request, url).then(function (c) { if (c) return c; throw e; });
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
                    if (response.status >= 500) return caches.match(SHELL_URL).then(function (c) { return c || response; });
                    // Keep the shell entry current. It was precached once at install and never
                    // refreshed afterwards, and the cache name only changes when the OFFLINE layer
                    // changes (build-offline.js hashes public/offline/*) — so a reader could be
                    // served an index.html months older than the site they had just loaded. The home
                    // page IS the shell, so it is the one navigation worth storing (every other one
                    // returns the same SPA document under a different URL: one cache entry per
                    // visited sutta, for nothing).
                    if (response.ok && response.type === 'basic' && url.pathname === SHELL_URL) {
                        cachePut(event, SHELL_URL, response, null);
                    }
                    return response;
                })
                .catch(function (e) {
                    return caches.match(request).then(function (c) {
                        return c || caches.match(SHELL_URL);
                    }).then(function (c) {
                        // Nothing cached at all (a first visit that happens to be offline): a
                        // rejected respondWith is the browser's own error page, while resolving to
                        // undefined would be a TypeError the reader can make even less sense of.
                        if (c) return c;
                        throw e;
                    });
                })
        );
        return;
    }

    // Versioned assets: cache-first, exact URL only (see isVersionedAsset).
    if (isVersionedAsset(url)) {
        event.respondWith(
            caches.match(request).then(function (cached) {
                return cached || networkFirst(event, request, url);
            })
        );
        return;
    }

    event.respondWith(networkFirst(event, request, url));
});
