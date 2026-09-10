// Offline data shim for the WEBSITE. Ported from dg-app-full/src/app.js, which does the same job
// inside the Android/iOS app — see docs/OFFLINE_PWA_PLAN.md ("Два офлайна", Stage 1).
//
// What it does: intercepts the handful of fetch() calls that need data and answers them from a
// local SQLite copy in OPFS. What answers them is NOT a second implementation of the site's API:
// it is dg-node's own core/search-core.js, bundled by build-offline.js and running in
// db-worker.js over a slice of the same dg.db the server queries. test/core-parity.mjs and the
// end-to-end browser test diff its answers against the server's.
//
// Five deliberate differences from the app's copy — each one is a site constraint, not taste:
//
//  1. Opt-in, and nothing else. The shim is installed unconditionally (it has to be: it is the
//     first script on the page, and by the time anyone knows whether a database exists, requests
//     may already be in flight), but until a database is actually OPEN it forwards everything to
//     the server unchanged. No probe, no download, no question, no interception: a reader who has
//     never pressed "Download now" gets exactly the site that existed before this file.
//  2. No `await ready` on data routes. In the app every data route waits for the 170MB download,
//     because the app must work offline by definition. Here the first download must not freeze
//     search: while it runs, the gate above keeps every request on the server.
//  3. Same origin. The app forwards "this needs the network" to https://dhamma.gift, since its own
//     origin (https://localhost) has no server behind it. On the site the reader IS on the server,
//     so needing the network just means the original request, unmodified.
//  4. One owner per origin. The OPFS SAH pool is single-writer: a second tab installing the same
//     VFS fights the first over the same file handles. Web Locks elect a single owning tab; every
//     other tab simply stays server-backed (and says so in the console). This also means there is
//     no stale-second-tab problem to solve after an update — the non-owning tabs never opened the
//     old database in the first place.
//  5. No local script engine yet. Aksharamukha/Pyodide (dg-app-full's script-engine.js, ~16MB) is
//     not ported in this stage, so `?script=` requests and /api/transliterate go to the server,
//     which is where they went before. The call sites below keep the app's shape, so porting the
//     engine later is a change of one function (ensureScriptMode) and nothing else.

(function () {
    'use strict';

    var platform = (window.dgPlatform && typeof window.dgPlatform === 'object') ? window.dgPlatform : {
        name: 'browser',
        distBase: window.DG_DIST_BASE || '/mobile-data',
        askConsent: function () { return Promise.resolve(true); },
    };
    var DIST_BASE = platform.distBase || window.DG_DIST_BASE || '/mobile-data';

    // The languages the published slice is cut with (build-app-db.js --langs=ru,en). Anything else
    // the language picker offers exists on the corpus but not in this copy, and there is no
    // offline alternative for it — that request goes to the server or fails honestly.
    var OFFLINE_LANGS = ['ru', 'en'];

    // Written by this file, read by settings' "Offline library" row (offline-library-settings.js,
    // a separate page and a separate JS realm: it cannot see the worker or OPFS, so localStorage
    // is the shared channel). The two intent keys are the settings page's way of asking this page
    // to do the download, since only this page owns the worker.
    var STATE_KEY = 'dg.offline.state';
    var WANT_DATA_KEY = 'dg.offline.wantData';   // "I pressed Download now" (first download)
    var WANT_UPDATE_KEY = 'dg.offline.wantUpdate'; // "I pressed Update / Re-download"
    var LOCK_NAME = 'dg-offline-db';

    var worker = null;
    var nextCallId = 1;
    var pending = new Map();
    // The gate. False until a database is open in THIS tab; every data route checks it first.
    var local = false;
    var ownsLibrary = false;

    var resolveReady, rejectReady;
    var ready = new Promise(function (resolve, reject) { resolveReady = resolve; rejectReady = reject; });
    window.dgOfflineReady = ready;
    ready.catch(function () {}); // an unobserved rejection must stay quiet; uploaders await it

    function log() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[dg-offline]');
        console.log.apply(console, args);
    }

    // ---------------------------------------------------------------------------------------
    // Worker plumbing
    // ---------------------------------------------------------------------------------------

    function startWorker() {
        // A module worker: @sqlite.org/sqlite-wasm ships ESM only, and the core bundle is emitted
        // as a module for the same reason. Same directory as this file, so the worker's own
        // relative imports (./core-bundle.js, ./vendor/sqlite-wasm/index.js) resolve.
        var w = new Worker('/offline/db-worker.js', { type: 'module' });
        w.onmessage = function (event) {
            var msg = event.data || {};
            if (msg.type === 'progress') {
                if (msg.retrying) log('stalled, retrying (attempt ' + msg.retrying + ')');
                window.dispatchEvent(new CustomEvent('dg:dl-progress', {
                    detail: {
                        name: 'dg-mobile.db', step: 1, totalSteps: 1,
                        loaded: msg.loaded, total: msg.total, phase: msg.phase || 'download',
                        done: !!msg.done,
                        reason: msg.retrying ? 'stalled, retrying (attempt ' + msg.retrying + ')' : null,
                        resumed: msg.resumed,
                    },
                }));
                return;
            }
            if (msg.type === 'downloading') return;
            var entry = pending.get(msg.id);
            if (!entry) return;
            pending.delete(msg.id);
            if (msg.ok) entry.resolve(msg.result); else entry.reject(new Error(msg.error));
        };
        w.onerror = function (e) {
            // A worker that fails to start (a bad import, a missing wasm) would otherwise leave
            // every caller hanging forever — on screen that is a frozen page, not an error.
            var err = new Error('offline data worker failed: ' + (e.message || 'unknown'));
            pending.forEach(function (entry) { entry.reject(err); });
            pending.clear();
        };
        return w;
    }

    function call(op, args) {
        if (!worker) worker = startWorker();
        return new Promise(function (resolve, reject) {
            var id = nextCallId++;
            pending.set(id, { resolve: resolve, reject: reject });
            worker.postMessage({ id: id, op: op, args: args });
        });
    }

    // Only one tab may hold the OPFS SAH pool (see the header, point 4). The winning tab keeps
    // the lock until it goes away — releasing it while still holding the file handles open is
    // exactly the collision this prevents.
    function acquireOwnership() {
        if (!navigator.locks || typeof navigator.locks.request !== 'function') {
            return Promise.resolve(true); // no Web Locks: no election possible, proceed
        }
        return new Promise(function (resolve) {
            navigator.locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, function (lock) {
                if (!lock) { resolve(false); return undefined; }
                resolve(true);
                return new Promise(function (release) {
                    window.addEventListener('pagehide', function () { release(); }, { once: true });
                });
            }).catch(function () { resolve(true); });
        });
    }

    // ---------------------------------------------------------------------------------------
    // State shared with the settings page
    // ---------------------------------------------------------------------------------------

    function readIntent(key) {
        var value = null;
        try {
            value = localStorage.getItem(key);
            if (value !== null) localStorage.removeItem(key);
        } catch (e) { /* private mode — no intent, nothing breaks */ }
        return value === '1';
    }

    function rememberState(patch) {
        try {
            var previous = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
            var next = {};
            Object.keys(previous).forEach(function (k) { next[k] = previous[k]; });
            Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
            next.at = Date.now();
            localStorage.setItem(STATE_KEY, JSON.stringify(next));
        } catch (e) { /* quota/private mode — the settings row degrades to "unknown" */ }
    }

    // ---------------------------------------------------------------------------------------
    // Download / open / update
    // ---------------------------------------------------------------------------------------

    function markLocal(opened) {
        local = true;
        rememberState({ present: true, build_id: (opened && opened.build_id) || null, update: null });
    }

    // Ask for persistent storage before spending hundreds of megabytes of the reader's connection.
    // Best effort: a refusal changes nothing except that the browser is allowed to evict the
    // library under storage pressure — the "library disappeared" path (state 5 of the coexistence
    // model) is what handles that, and it is a path we need anyway.
    function requestPersistence() {
        if (!navigator.storage || typeof navigator.storage.persist !== 'function') return Promise.resolve(null);
        return navigator.storage.persist().then(function (granted) {
            log('persistent storage:', granted ? 'granted' : 'not granted');
            return granted;
        }).catch(function () { return null; });
    }

    // The reader asked for this (settings' button wrote the intent, or offline-status.js's retry
    // called us): ask the platform, then download or update.
    function download(kind) {
        var info = {};
        return requestPersistence().then(function () {
            return platform.askConsent(info);
        }).then(function (ok) {
            if (!ok) throw new Error('offline-data-download-declined');
            // 'update' replaces a copy that is already there; 'open' adopts an existing one or
            // downloads when there is none. Both leave a working copy in place until the new file
            // is proven (db-worker.js's fetchCurrent).
            return kind === 'update'
                ? call('update', { distBase: DIST_BASE })
                : call('open', { distBase: DIST_BASE, download: true });
        }).then(function (result) {
            markLocal(result);
            return result;
        });
    }

    // "Is there anything new?" — asked once per load, AFTER a working database is open, and it
    // only reports: replacing 170MB stays the reader's decision (docs/OFFLINE_PWA_PLAN.md).
    function checkForUpdate() {
        return call('check', { distBase: DIST_BASE }).then(function (status) {
            if (!status || status.unknown || status.current) return status;
            if (!status.schema_supported) {
                // Newer database than this build of the page understands — downloading it would
                // replace a working reader with a broken one.
                window.dispatchEvent(new CustomEvent('dg:update-blocked', { detail: status }));
                return status;
            }
            window.dispatchEvent(new CustomEvent('dg:update-available', { detail: status }));
            rememberState({ update: { build_id: status.build_id, bytes: status.bytes, built_at: status.built_at } });
            return status;
        }).catch(function () { return null; });
    }

    // ---------------------------------------------------------------------------------------
    // Startup
    // ---------------------------------------------------------------------------------------

    function probe() {
        return acquireOwnership().then(function (owns) {
            ownsLibrary = owns;
            if (!owns) {
                log('another tab owns the offline database — this tab stays server-backed');
                return null;
            }
            var wantsUpdate = readIntent(WANT_UPDATE_KEY);
            var wantsData = readIntent(WANT_DATA_KEY);

            // wantManifest:false — the site never shows the size before asking (its button in
            // Settings is the consent), so the startup probe stays one cheap request-free check.
            return call('status', { distBase: DIST_BASE, wantManifest: false }).then(function (status) {
                if (status.present && !wantsUpdate) {
                    // `download: false` is load-bearing: a stored copy that turns out to be
                    // corrupt or half-imported must NOT silently turn into a fresh 170MB download
                    // the reader never asked for. It falls back to the server instead.
                    return call('open', { distBase: DIST_BASE, download: false }).then(function (opened) {
                        if (!opened || opened.present === false) {
                            log('stored database is unusable — staying server-backed');
                            rememberState({ present: false, build_id: null, update: null });
                            return null;
                        }
                        markLocal(opened);
                        checkForUpdate();
                        return opened;
                    });
                }
                if (status.present && wantsUpdate) return download('update');

                // Nothing stored: exactly the site as it was, and no download unless the reader
                // pressed a button in Settings (the intent key is that click).
                rememberState({ present: false, build_id: null, update: null });
                if (wantsData || wantsUpdate) return download('open');
                return null;
            });
        }).catch(function (e) {
            // A failed open of a copy that IS there is a real fault the reader should hear about
            // (offline-status.js turns it into a toast); an absent database never reaches here.
            log('offline layer not activated:', e && e.message);
            throw e;
        });
    }

    // ---------------------------------------------------------------------------------------
    // The fetch shim
    // ---------------------------------------------------------------------------------------

    // Requests this does not recognise pass straight through to the real fetch. That includes
    // every static file and every route outside the data layer — /api/toc, /api/patimokkha-
    // fragment/*, /api/transliterate — which is deliberate: those are the server's, and the
    // service worker's shell cache is what keeps them available offline.
    function installFetchShim() {
        var realFetch = window.fetch.bind(window);

        function langNeedsOnline(qs) {
            var langs = (qs.get('langs') || '').split(',').map(function (s) { return s.trim(); })
                .filter(Boolean);
            return langs.some(function (l) { return OFFLINE_LANGS.indexOf(l) === -1; });
        }

        // 'isopali' is the default the client already omits (search/index.html only adds ?script=
        // when it is something else) — treated the same as absent.
        function scriptRequested(qs) {
            var script = qs.get('script');
            return (script && script.toLowerCase() !== 'isopali') ? script : null;
        }

        // Point 5 of the header: no local engine yet, so anything that needs script conversion
        // needs the server. Same path a reader without the offline library takes.
        function ensureScriptMode() {
            if (!window.dgScriptEngine) return Promise.resolve('online');
            return Promise.resolve(window.dgScriptEngine.getMode() || 'online');
        }

        // The server still answers this — when the reader is online it behaves exactly as before;
        // when they are offline the site's own error state is what they see, plus a toast that
        // says the real reason instead of "check your query".
        function toServer(input, init) {
            return realFetch(input, init).catch(function (e) {
                if (typeof window.showBubbleNotification === 'function') {
                    var ru = (localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en') === 'ru';
                    window.showBubbleNotification(ru
                        ? 'Нужен интернет: эта система письма или язык не входят в офлайн-библиотеку'
                        : 'Needs internet: this script or language isn’t in the offline library', 5000);
                }
                throw e;
            });
        }

        function jsonResponse(obj, status) {
            return new Response(JSON.stringify(obj), {
                status: status || 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // A worker result may carry the status the route would have set: an unknown sutta is a
        // 404, and answering 200 with an error body would be a different contract from the site's.
        function respond(result) {
            if (result && result.__status) {
                var body = {};
                Object.keys(result).forEach(function (k) { if (k !== '__status') body[k] = result[k]; });
                return jsonResponse(body, result.__status);
            }
            return jsonResponse(result);
        }

        function withLoadingEvent(fn) {
            window.dispatchEvent(new CustomEvent('dg:api-loading', { detail: { active: true } }));
            return fn().finally(function () {
                window.dispatchEvent(new CustomEvent('dg:api-loading', { detail: { active: false } }));
            });
        }

        window.fetch = function (input, init) {
            // The gate. Not local → the site's own fetch, untouched, with no bookkeeping at all.
            if (!local) return realFetch(input, init);

            var url = typeof input === 'string' ? input : input.url;
            var parsed;
            try { parsed = new URL(url, location.href); } catch (e) { return realFetch(input, init); }
            if (parsed.origin !== location.origin) return realFetch(input, init);

            var p = parsed.pathname;
            var qs = parsed.searchParams;

            if (p === '/api/transliterate') {
                if (ensureScriptMode() === 'online') return toServer(input, init);
            }

            if (p.indexOf('/api/text/') === 0) {
                if (langNeedsOnline(qs)) return toServer(input, init);
                if (scriptRequested(qs)) return toServer(input, init);
                return withLoadingEvent(function () {
                    return call('text', {
                        suttaId: decodeURIComponent(p.slice('/api/text/'.length)).toLowerCase(),
                        mode: qs.get('mode'),
                        langs: qs.get('langs'),
                        lang: qs.get('lang'),
                        translators: qs.get('translators'),
                        multiFor: qs.get('multiFor'),
                    }).then(respond);
                });
            }

            if (p.indexOf('/api/nav/') === 0) {
                return call('nav', {
                    suttaId: decodeURIComponent(p.slice('/api/nav/'.length)).toLowerCase(),
                    scope: qs.get('scope'),
                }).then(respond);
            }

            if (p === '/search/enrich') {
                if (langNeedsOnline(qs)) return toServer(input, init);
                if (scriptRequested(qs)) return toServer(input, init);
                return withLoadingEvent(function () {
                    return call('enrich', {
                        q: qs.get('q') || '',
                        ids: qs.get('ids') || '',
                        langs: qs.get('langs') || 'ru,en',
                        scope: qs.get('scope') || 'default',
                        exact: qs.get('exact') === 'true',
                        lb: parseInt(qs.get('lb'), 10) || 0,
                        la: parseInt(qs.get('la'), 10) || 0,
                    }).then(respond);
                });
            }

            if (p === '/search' || (p.indexOf('/search/') === 0 && p !== '/search/enrich')) {
                if (langNeedsOnline(qs)) return toServer(input, init);
                if (scriptRequested(qs)) return toServer(input, init);
                return withLoadingEvent(function () {
                    return call('search', {
                        q: p === '/search' ? (qs.get('q') || '') : decodeURIComponent(p.slice('/search/'.length)),
                        scope: qs.get('scope') || 'default',
                        langs: qs.get('langs') || 'ru,en',
                        exact: qs.get('exact') === 'true',
                        lb: parseInt(qs.get('lb'), 10) || 0,
                        la: parseInt(qs.get('la'), 10) || 0,
                        fast: qs.get('fast') === '1',
                    }).then(respond);
                });
            }

            return realFetch(input, init);
        };
    }

    // ---------------------------------------------------------------------------------------
    // Public API (settings page + offline-status.js + tests)
    // ---------------------------------------------------------------------------------------

    // Settings' "Download now"/"Re-download" and offline-status.js's retry both end up here.
    window.dgRetryOfflineDownload = function () {
        var run = ownsLibrary
            ? download('open')
            : probe().then(function () { return ownsLibrary ? download('open') : null; });
        return run.catch(function (e) {
            // Keep the documented rejection for a declined download so the UI can tell a choice
            // from a fault (offline-status.js).
            throw e;
        });
    };

    // Runs on the reader's say-so, never on checkForUpdate above.
    window.dgUpdateOfflineData = function () {
        return download('update');
    };

    window.dgCheckOfflineUpdate = function () {
        if (!local) return Promise.resolve(null);
        return checkForUpdate();
    };

    // "Удалить библиотеку" — back to the pre-download site with no reinstall (see the coexistence
    // model in docs/OFFLINE_PWA_PLAN.md). Wired to a button separately; the worker does the work.
    window.dgDeleteOfflineData = function () {
        return call('delete', {}).then(function (result) {
            local = false;
            rememberState({ present: false, build_id: null, update: null });
            return result;
        });
    };

    // Small, stable surface for the end-to-end test to assert which of the two modes this tab is
    // in. Not used by any product code.
    window.dgOfflineDiagnostics = function () {
        return { mode: local ? 'local' : 'server', ownsLibrary: ownsLibrary,
                 distBase: DIST_BASE, workerStarted: !!worker };
    };

    // ---------------------------------------------------------------------------------------
    // Go
    // ---------------------------------------------------------------------------------------

    installFetchShim();

    probe().then(function () { resolveReady({ local: local }); },
                 function (e) { rejectReady(e); });
})();
