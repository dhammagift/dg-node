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
        // Native builds only (see dg-app-full's platform.js). onlineBase: prefix for "needs the
        // internet" requests when the page's own origin has no server behind it (the app's
        // https://localhost) — the site keeps it empty and asks its own origin as before.
        // mapStatic(p): rewrite an API URL the app serves as a bundled static file
        // (/api/toc* -> build-time snapshots, /api/patimokkha-fragment -> /reader/...); the
        // site has a real server behind every path and keeps it null.
        onlineBase: '',
        mapStatic: null,
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
    var downloadInFlight = false;   // pagehide must not cut a transfer short
    var freshWorkerRetry = false;   // one retry per page, see refuseOfStorage()
    var probeDone = null;           // the startup probe, awaited by the fetch gate (see installFetchShim)
    var probeSettled = false;
    // The gate. False until a database is open in THIS tab; every data route checks it first.
    var local = false;
    var ownsLibrary = false;

    var resolveReady, rejectReady;
    var ready = new Promise(function (resolve, reject) { resolveReady = resolve; rejectReady = reject; });
    window.dgOfflineLibrary = ready;
    ready.catch(function () {}); // an unobserved rejection must stay quiet; uploaders await it

    function log() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[dg-offline]');
        console.log.apply(console, args);
    }

    // OPFS exists only in a secure context (HTTPS, or localhost, which browsers treat as one). The
    // shim itself is harmless without it — it simply never activates — but a download the reader
    // asked for has to say so, instead of dying inside the worker with "Missing required OPFS APIs".
    function opfsAvailable() {
        return !!window.isSecureContext && !!navigator.storage &&
               typeof navigator.storage.getDirectory === 'function';
    }

    // A reader-visible sentence, through the site's own toast (settings-bundle.js). Guarded because
    // this file also runs in builds that do not have it.
    function notify(text) {
        if (typeof window.showBubbleNotification === 'function') window.showBubbleNotification(text, 6000, 'info');
    }

    // Only ONE tab can hold the OPFS pool (see acquireOwnership), so a download asked for in another
    // tab cannot be done here — it has to be handed to the tab that owns it. Doing nothing at all
    // was the old behaviour and the worst option: the click was consumed, the key stayed in
    // localStorage, the reader saw no progress and no reason, and NO request ever left the browser.
    var channel = (typeof BroadcastChannel === 'function') ? new BroadcastChannel('dg-offline') : null;
    var deferredRequest = null;   // asked for before this page knew whether it owns the pool
    var probePending = true;      // true until acquireOwnership() has answered
    var releaseOwnership = null;  // resolves the Web Lock callback, see yieldLibrary()
    var lastReleaseAsk = 0;       // throttles takeover requests (one every few seconds, not a loop)
    // "In use" means the reader is looking at THIS window/tab. visibilityState alone is not enough: a
    // background WINDOW (two windows side by side, an installed app next to a browser tab) keeps
    // reporting 'visible', so a visible-but-unfocused owner refused to hand over and the window the
    // reader was actually using stayed server-backed (owner's desktop Opera).
    var windowFocused = document.hasFocus();
    // A tab that cannot have the OPFS pool (another document holds the exclusive handles) answers its
    // data requests through the tab that does — the pool is a single-writer resource, but the READING
    // is not: the owner has the database open and can answer in a few milliseconds over the channel.
    var relayRequests = new Map();
    var relayUsed = false;
    var LIBRARY_KEY = 'dg.offline.libraryExists';
    // Set once the reader has agreed to a download, cleared when a library is installed or deleted:
    // the only way this page knows an unfinished transfer is waiting without starting the worker.
    var STARTED_KEY = 'dg.offline.downloadStarted';
    if (channel) {
        channel.onmessage = function (event) {
            var msg = event.data || {};
            // Progress made by the tab that owns the pool, replayed here as a local event so the
            // reader who pressed the button in THIS tab sees the same bar (offline-status.js listens
            // for dg:dl-progress on window).
            if (msg.type === 'progress') {
                window.dispatchEvent(new CustomEvent('dg:dl-progress', { detail: msg.detail }));
                return;
            }
            if (msg.type === 'error') {
                notify(msg.message || 'download failed');
                return;
            }
            // Serve another tab's data request from THIS tab's open database. Nothing is written and
            // nothing is locked, so this works no matter which window the reader is looking at.
            if (msg.type === 'data-request') {
                if (!local || !isDataRoute(String(msg.path || ''))) return;
                log('answering another tab:', msg.path);
                shimFetch(msg.path, { method: msg.method || 'GET' }).then(function (res) {
                    return res.text().then(function (body) { return { status: res.status, body: body }; });
                }).then(function (out) {
                    channel.postMessage({ type: 'data-response', id: msg.id, status: out.status, body: out.body });
                }).catch(function (e) {
                    channel.postMessage({ type: 'data-response', id: msg.id, error: String((e && e.message) || e) });
                });
                return;
            }
            if (msg.type === 'data-response') {
                var deliver = relayRequests.get(msg.id);
                if (deliver) { relayRequests.delete(msg.id); deliver(msg); }
                return;
            }

            // Another tab needs the pool and is in front of the reader: give it up if this page is
            // hidden and idle (a visible page keeps it — the reader is looking at that one).
            if (msg.type === 'release-request') {
                if (yieldLibrary()) {
                    log('handed the offline library over to the tab in front');
                    if (channel) channel.postMessage({ type: 'released' });
                }
                return;
            }
            if (msg.type === 'released') {
                log('the other tab released the offline library — taking it over');
                lastReleaseAsk = 0;
                // A few tries a second apart: the owner has just terminated its worker, and the
                // browser can take a moment to actually drop the exclusive handles. One attempt that
                // landed a fraction too early left the tab server-backed for good.
                var tries = 0;
                var take = function () {
                    tries++;
                    // Fresh worker per attempt: a failed pool install leaves that worker's SQLite VFS
                    // half-registered ("removeVfs() failed with no recovery strategy"), so retrying
                    // inside it can never succeed — the retry has to start from a clean wasm state.
                    if (worker) { try { worker.terminate(); } catch (e) { /* gone */ } worker = null; pending.clear(); }
                    probe().then(function () {
                        if (!local && tries < 4) setTimeout(take, 1200);
                        else if (local) log('took the offline library over');
                    }, function (e) {
                        log('takeover attempt ' + tries + ' failed:', (e && e.message) || e);
                        if (tries < 4) setTimeout(take, 1200);
                    });
                };
                setTimeout(take, 300);
                return;
            }
            if (msg.type !== 'download') return;
            var kind = msg.kind === 'update' ? 'update' : 'open';
            if (probePending) { deferredRequest = kind; return; } // this tab's own probe may not have finished yet
            if (!ownsLibrary) return; // the tab that owns the pool received the same broadcast
            log('another tab asked for the offline library — downloading here');
            download(kind).catch(function (e) {
                log('download asked for by another tab failed:', e && e.message);
                if (channel) channel.postMessage({ type: 'error', message: e && e.message });
            });
        };
    }

    // The settings SHEET asks for the download by message instead of navigating its own frame (see
    // offline-library-settings.js): it is an iframe ON this page, so navigating it would load a
    // second copy of the home page — and a second downloader — inside the sheet while the sheet
    // still covered the first. This page is already running, so the transfer starts here: no reload,
    // no navigation, one progress card, and the sheet is collapsed by search/js/home.js on the same
    // message.
    window.addEventListener('message', function (event) {
        if (event.origin !== location.origin) return;
        var data = event.data || {};
        // Delete the library at the reader's request from the settings sheet.
        if (data.dgOfflineDeleteRequest) {
            var ru = (localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en') === 'ru';
            window.dgDeleteOfflineData().then(function (result) {
                local = false;
                try { localStorage.removeItem(LIBRARY_KEY); } catch (e) { /* ignore */ }
                rememberState({ present: false, build_id: null, update: null, local: false, reason: 'none' });
                notify(ru ? 'Офлайн-библиотека удалена' : 'Offline library deleted');
                log('library deleted at request:', (result && result.deleted) || 0, 'files');
            }).catch(function (e) {
                notify(ru ? 'Не удалось удалить библиотеку' : 'Could not delete the library');
                log('delete failed:', (e && e.message) || e);
            });
            return;
        }
        if (!data.dgOfflineDownloadRequest) return;
        var kind = data.dgOfflineDownloadRequest === 'update' ? 'update' : 'open';
        if (probePending) { deferredRequest = kind; return; }
        requestDownload(kind);
    });

    // "Start it on this page if we can, otherwise hand it to whoever can."
    function requestDownload(kind) {
        // The frame also writes the intent keys before messaging (that is how a standalone settings
        // page asks). This message is the real request, so consume them — otherwise the next page
        // load would act on a click that has already been served.
        readIntent(WANT_DATA_KEY);
        readIntent(WANT_UPDATE_KEY);
        if (!opfsAvailable()) {
            notify('HTTPS is required for the offline library (or localhost)');
            return;
        }
        if (ownsLibrary) {
            download(kind).catch(function (e) { notify((e && e.message) || 'download failed'); });
            return;
        }
        if (!askOwningTab(kind)) notify('the offline library is in use by another tab — close it and try again');
    }

    // Anything on the page can start the download with a plain link — the obvious use is a home-page
    // announcement (configs/search/announcements.json), e.g.
    //   <a href="#offline-download">Скачать офлайн-библиотеку</a>
    // Delegated, so it also works for markup rendered later (the announcement appears a couple of
    // seconds after load) and for anything added in the future without touching this file again.
    document.addEventListener('click', function (event) {
        var el = event.target && event.target.closest
            ? event.target.closest('a[href="#offline-download"], [data-dg-offline-download]') : null;
        if (!el) return;
        event.preventDefault();
        var asked = el.getAttribute('data-dg-offline-download');
        requestDownload(asked === 'update' ? 'update' : 'open');
    });

    // The same thing for code that would rather call it directly (the settings page cannot — it is a
    // separate realm — but anything on this page can).
    window.dgStartOfflineDownload = function (kind) {
        requestDownload(kind === 'update' ? 'update' : 'open');
    };

    // The card's ×. The worker drops the partial download with it (see the abort op), so a later
    // visit has nothing to resume — which is the point when the download was started by mistake or
    // is running on mobile data.
    window.dgCancelOfflineDownload = function () {
        return call('abort', {}).then(function () {
            local = false;
            // A cancelled download must not start again by itself on the next visit.
            try { localStorage.removeItem(STARTED_KEY); } catch (e) { /* private mode */ }
            rememberState({ present: false, build_id: null, update: null });
            var ru = (localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en') === 'ru';
            notify(ru ? 'Загрузка отменена' : 'Download cancelled');
            return true;
        }).catch(function (e) {
            log('cancel failed:', e && e.message);
            return false;
        });
    };

    // Let go of the pool so another tab can own it: the worker holds the exclusive OPFS handles, so
    // terminating it is what actually releases them (same reasoning as the pagehide handler), and the
    // Web Lock has to be released too or the next tab cannot even try.
    function yieldLibrary() {
        if (!local || downloadInFlight) return false;
        if (windowFocused && document.visibilityState === 'visible') {
            log('not handing over: this window is the one being used');
            return false; // in use right now
        }
        log('yielding the offline library to another tab');
        local = false;
        if (worker) { try { worker.terminate(); } catch (e) { /* already gone */ } worker = null; }
        pending.clear();
        if (releaseOwnership) { try { releaseOwnership(); } catch (e) { /* already released */ } releaseOwnership = null; }
        return true;
    }

    // The tab the reader is actually looking at asks for the pool once; a hidden owner hands it over.
    function requestTakeover() {
        if (local || downloadInFlight || probePending || !channel) return;
        // Only the window being used takes the library over.
        if (!windowFocused && document.visibilityState === 'visible' && document.hasFocus && !document.hasFocus()) return;
        // Throttled, not one-shot: the holder may still have been busy (or downloading) the first
        // time, and a second tab that keeps being looked at deserves another try.
        if (Date.now() - lastReleaseAsk < 3000) return;
        lastReleaseAsk = Date.now();
        log('asking the other tab to hand the offline library over');
        channel.postMessage({ type: 'release-request' });
    }

    // Returns false when there is no way to hand it over, so the caller can say so instead.
    function askOwningTab(kind) {
        if (!channel) return false;
        channel.postMessage({ type: 'download', kind: kind });
        var ru = (localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en') === 'ru';
        notify(ru
            ? 'Загрузка идёт в другой вкладке этой страницы — прогресс и результат там. Когда закончится, обновите эту вкладку.'
            : 'The download is running in another tab of this site — progress is there. Reload this tab when it finishes.');
        return true;
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
                var detail = {
                    name: 'dg-mobile.db', step: 1, totalSteps: 1,
                    loaded: msg.loaded, total: msg.total, phase: msg.phase || 'download',
                    done: !!msg.done,
                    reason: msg.retrying ? 'stalled, retrying (attempt ' + msg.retrying + ')' : null,
                    resumed: msg.resumed,
                };
                window.dispatchEvent(new CustomEvent('dg:dl-progress', { detail: detail }));
                // Same event to the other tabs of this origin, which cannot run the download
                // themselves but can show its progress (see the channel handler above).
                if (channel) channel.postMessage({ type: 'progress', detail: detail });
                return;
            }
            if (msg.type === 'downloading') return;
            // The background integrity check found the freshly installed library unusable (the
            // storage layer ran out mid-transfer and left holes — see db-worker.js's checkCheap /
            // scheduleFullCheck). Better to read from the server than from a broken database.
            if (msg.type === 'library-invalid') {
                local = false;
                rememberState({ present: false, build_id: null, update: null });
                // A native shell can be showing this transfer in the status bar (the app's
                // DgProgress notification) — tell it the download is over, unsuccessfully.
                window.dispatchEvent(new CustomEvent('dg:offline-invalid'));
                var ruInvalid = (localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en') === 'ru';
                notify(ruInvalid
                    ? 'Скачанная библиотека повреждена — попробуйте скачать заново'
                    : 'The downloaded library is corrupted — please download it again');
                return;
            }
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
        // Web Locks are NOT reentrant: asking again while this page already holds it reports "taken"
        // and the page concludes it is not the owner — of its own lock, with a single tab open
        // (owner's desktop, one tab, "used by another tab or the app"). A page that already owns it
        // owns it.
        if (releaseOwnership) return Promise.resolve(true);
        function attempt(triesLeft) {
            return new Promise(function (resolve) {
                navigator.locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, function (lock) {
                        if (!lock) { resolve(false); return undefined; }
                    resolve(true);
                    return new Promise(function (release) {
                        releaseOwnership = release;   // so a visible tab can take over (yieldLibrary)
                        window.addEventListener('pagehide', function () { release(); }, { once: true });
                    });
                }).catch(function () { resolve(true); });
            }).then(function (got) {
                if (got) return true;
                // A lock held by the page we were just reloaded from (or restored from the back/forward
                // cache) is released a moment AFTER the new document starts: without this retry the new
                // page elected itself out, stayed server-backed, and offline simply did not work while
                // settings happily said "Downloaded" (owner's phone; also caught by test-offline-resume).
                if (triesLeft <= 0) return false;
                return new Promise(function (r) { setTimeout(r, 400); }).then(function () { return attempt(triesLeft - 1); });
            });
        }
        return attempt(6);
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
        try { localStorage.setItem(LIBRARY_KEY, '1'); localStorage.removeItem(STARTED_KEY); } catch (e) { /* private mode */ }
        // Always: a reader who installed the library before the dictionary existed must still get it.
        // The call is idempotent and cheap on a visit where the files are already cached (a match per
        // file and nothing else).
        cacheDictionary();
        rememberState({ present: true, build_id: (opened && opened.build_id) || null, update: null,
                        local: true, reason: 'local' });
    }

    // Why this tab is NOT reading from the library it may well have on disk. There is no console on
    // a phone, so the answer has to reach the settings row (offline-library-settings.js renders it):
    // 'insecure' | 'not-owner' | 'unusable' | 'none' | 'local'.
    function rememberMode(present, reason) {
        rememberState({ present: !!present, local: false, reason: reason });
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
    // The Pali dictionary (DPD) the reader opens by tapping a word. ~24MB, deliberately not part of the
    // database slice, but it belongs offline too — so it is fetched once in the background after the
    // library is in place and kept in the service worker's shell cache, which is where the reader's
    // fetch of it will look when there is no network. Idempotent: present files are skipped.
    // Everything the reader needs that the service worker's install pass has proven unreliable about:
    // it lost quickModal.js and friends often enough that oфлайн the toolbar showed broken icons and
    // the quick modal failed to load ("The FetchEvent for .../quickModal.js resulted in a network error
    // response" — owner's console, with the file answering 200 on the server). Cached from HERE, which
    // never failed: cache.put() from the page was always fine, only the SW's install pass is flaky.
    var OFFLINE_EXTRA_URLS = [
        '/assets/js/standalone-dpd/dpd_ebts.js',
        '/assets/js/standalone-dpd/dpd_i2h.js',
        '/assets/js/standalone-dpd/dpd_deconstructor.js',
        '/assets/js/standalone-dpd/ru/dpd_ebts.js',
        '/assets/css/paliLookup.css',
        '/assets/js/quickModal.js',
        '/assets/js/translators.js',
        '/assets/js/linksdpr.js', '/assets/js/openDpr.js',
        '/assets/js/linksru.js', '/assets/js/openRu.js',
        '/assets/js/linksbw.js', '/assets/js/openBw.js',
        '/assets/js/linksbjt.js',
        '/assets/svg/eye.svg', '/assets/svg/eye-slash.svg',
        '/assets/svg/clock-rotate-left.svg', '/assets/svg/rotate-solid-full.svg',
        '/assets/svg/open-link.svg', '/assets/svg/trash-can-regular-full.svg',
        '/assets/svg/link-solid-full.svg', '/assets/svg/volume-solid-full.svg',
    ];
    var dictionaryRun = null;
    function cacheDictionary() {
        if (dictionaryRun) return dictionaryRun;
        dictionaryRun = Promise.resolve()
            .then(function () {
                if (!window.caches || !navigator.serviceWorker || !navigator.serviceWorker.controller) return false;
                return caches.keys().then(function (names) {
                    var name = names.filter(function (n) { return n.indexOf('dg-shell-') === 0; })[0];
                    if (!name) return false;
                    return caches.open(name).then(function (cache) {
                        return OFFLINE_EXTRA_URLS.reduce(function (chain, url) {
                            return chain.then(function () {
                                return cache.match(url, { ignoreSearch: true }).then(function (hit) {
                                    if (hit) return null;
                                    log('caching for offline use:', url);
                                    return fetch(url, { cache: 'reload' }).then(function (res) {
                                        if (res && res.ok) return cache.put(url, res);
                                    });
                                });
                            });
                        }, Promise.resolve()).then(function () {
                            log('offline extras ready');
                            return true;
                        });
                    });
                });
            })
            .catch(function (e) {
                log('offline extras could not be cached (they stay online-only):', (e && e.message) || e);
                dictionaryRun = null;   // a later visit may have a network again
                return false;
            });
        return dictionaryRun;
    }

    function download(kind) {
        var info = {};
        downloadInFlight = true;
        return requestPersistence().then(function () {
            return platform.askConsent(info);
        }).then(function (ok) {
            if (!ok) throw new Error('offline-data-download-declined');
            try { localStorage.setItem(STARTED_KEY, '1'); } catch (e) { /* private mode */ }
            // 'update' replaces a copy that is already there; 'open' adopts an existing one or
            // downloads when there is none. Both leave a working copy in place until the new file
            // is proven (db-worker.js's fetchCurrent).
            var opts = { distBase: DIST_BASE };
            return kind === 'update'
                ? call('update', opts)
                : call('open', Object.assign({ download: true }, opts));
        }).then(function (result) {
            markLocal(result);
            cacheDictionary();   // background: the library is usable, the dictionary can follow
            return result;
        }).catch(function (e) {
            // The storage layer refused its own handles mid-transfer ("Failed to execute
            // 'createSyncAccessHandle'" on a real device). One retry from a clean worker: the
            // scratch file is still in OPFS, so this resumes instead of restarting the transfer.
            if (refuseOfStorage(e) && retryWithFreshWorker('the download')) {
                downloadInFlight = false;
                return download(kind);
            }
            // "Not now" or ×: the reader's own choice — no automatic restart on the next visit.
            if (e && /declined|cancelled/.test(e.message || '')) {
                try { localStorage.removeItem(STARTED_KEY); } catch (err) { /* private mode */ }
            }
            throw e;
        }).finally(function () {
            downloadInFlight = false;
        });
    }

    // A page that goes into the back/forward cache stays alive and keeps its worker — and that worker
    // holds the OPFS pool's EXCLUSIVE file handles. The document the reader navigated TO then cannot
    // open the library at all, so it comes up server-backed and says "the library is downloaded, but
    // this tab is not using it" (measured: switching the interface language navigates exactly like
    // that). Terminating the worker releases the handles; the next document starts a fresh one, and a
    // document restored from that cache re-opens the library itself.
    window.addEventListener('pagehide', function () {
        if (downloadInFlight) return; // never cut a transfer short
        local = false;
        if (worker) { try { worker.terminate(); } catch (e) { /* already gone */ } worker = null; }
        pending.clear();
    });

    // Reopening after the page was hidden, backgrounded, frozen or restored. pagehide releases the
    // pool (see above), and on a phone that release does NOT reliably come back as
    // pageshow(persisted=true) — with only that handler the tab stayed server-backed for good, and
    // every search answered "the library is downloaded, but this tab is not using it" in whichever
    // language it was (owner: exactly that, English and Russian, no navigation involved). probe() is
    // idempotent — it re-reads nothing, re-acquires the lock, adopts the stored copy and marks the
    // tab local again.
    function reopenIfNeeded() {
        if (local || downloadInFlight || probePending) return;
        probe().catch(function () { /* the console log already says what happened */ });
    }
    window.addEventListener('focus', function () { windowFocused = true; reopenIfNeeded(); requestTakeover(); });
    window.addEventListener('blur', function () { windowFocused = false; });
    window.addEventListener('pageshow', reopenIfNeeded);
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') return;
        reopenIfNeeded();
        requestTakeover();
    });

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

    // A refusal from the storage layer itself — as opposed to "another document holds the
    // handles", which is a normal state this file handles by waiting or relaying. The app hit the
    // refusal on a real device: the download died with "Failed to execute 'createSyncAccessHandle'"
    // and the toast stayed until the page was reloaded.
    //
    // Retrying inside the SAME worker cannot work: a failed installOpfsSAHPoolVfs() leaves
    // sqlite-wasm's VFS half-registered there ("removeVfs() failed with no recovery strategy" —
    // the same reason the takeover path below starts a fresh worker). So the one retry that can
    // succeed is with a brand-new worker, which is what this does, once per page.
    function refuseOfStorage(e) {
        var msg = (e && e.message) || '';
        return /Access Handle|createSyncAccessHandle|NoModificationAllowed|SAH|VFS|OPFS|storage/i.test(msg);
    }

    function dropWorker() {
        if (worker) { try { worker.terminate(); } catch (e) { /* already gone */ } worker = null; }
        pending.clear();
    }

    function retryWithFreshWorker(what) {
        if (freshWorkerRetry) return false;
        freshWorkerRetry = true;
        log('the storage layer refused the offline library — retrying ' + what + ' with a fresh worker');
        dropWorker();
        return true;
    }

    function probe() {
        probePending = true;
        return acquireOwnership().then(function (owns) {
            ownsLibrary = owns;
            probePending = false;

            // The intent is consumed FIRST, whatever happens next. Leaving it behind is how a click
            // used to turn into nothing at all: the key stayed in localStorage, and the reader's
            // next visit would try to act on a request they had already forgotten making.
            var wantsUpdate = readIntent(WANT_UPDATE_KEY);
            var wantsData = readIntent(WANT_DATA_KEY);

            // A secure context is checked before anything else touches OPFS. A plain visit over
            // HTTP stays silent — the site is simply the site — while a download the reader did ask
            // for says what is missing (offline-status.js turns the rejection into a toast).
            if (!opfsAvailable()) {
                log('offline storage unavailable: a secure context (HTTPS or localhost) is required');
                rememberMode(false, 'insecure');
                if (wantsData || wantsUpdate) {
                    throw new Error('HTTPS is required for the offline library (or localhost)');
                }
                return null;
            }

            // The lock is ADVISORY. What really decides is the storage itself: the OPFS pool refuses a
            // second writer on its own, so if it opens here, this tab is the one that got there —
            // whatever the lock says. Trusting the lock alone left a single tab in Opera showing
            // "another tab or the app is using it" with nobody else around. A tab that has an intent
            // (or was asked) still passes the request on if opening fails below.
            if (!owns) log('the pool lock is held elsewhere — trying the library anyway');

            // A request that arrived from another tab before this one knew it owned the pool.
            if (deferredRequest) {
                var kind = deferredRequest;
                deferredRequest = null;
                log('running the download another tab asked for before this one owned the pool');
                return download(kind);
            }

            // Owner: "почему без спроса он вообще пытается что-то делать? это нужно только если
            // человек пытается скачать". The status check below starts the SQLite worker, and a worker
            // that fails to start in some browser surfaced as "Could not download data" for readers
            // who never downloaded anything. So the worker only starts for a reason: a library was
            // installed here, a download was agreed to and may be unfinished, or a download is being
            // asked for right now. Everyone else gets the plain site — no worker, no toast.
            var hasReason = wantsData || wantsUpdate;
            try { hasReason = hasReason || localStorage.getItem(LIBRARY_KEY) === '1' || localStorage.getItem(STARTED_KEY) === '1'; } catch (e) { /* private mode */ }
            if (!hasReason) {
                rememberMode(false, 'none');
                return null;
            }

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
                            rememberMode(true, owns ? 'unusable' : 'not-owner');
                            if (!owns && (wantsData || wantsUpdate || deferredRequest)) {
                                var asked = deferredRequest || (wantsUpdate ? 'update' : 'open');
                                deferredRequest = null;
                                askOwningTab(asked);
                            }
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
                rememberMode(false, 'none');
                if (wantsData || wantsUpdate) return download('open');

                // An unfinished download continues by itself. The reader asked once; the bytes are
                // still in OPFS (db-worker.js's scratch file, and a retry resumes with Range from
                // exactly there); making them find the button again after a reload — or a browser
                // restart — would be a strange thing to require of a 479MB transfer. The progress
                // card comes back on its own, so nothing needs saying.
                // Only the OWNER continues a partial download. A tab that cannot have the pool (the
                // handles are held by another document — NoModificationAllowedError in the log) used
                // to fall through to a download it could never finish, and against a dead server that
                // is a guaranteed failure instead of the honest "another tab has it".
                // The gzip archive (all dg-node publishes) leaves no partial copy — a compressed
                // stream cannot be resumed — so "the reader agreed to a download that never finished"
                // (STARTED_KEY, cleared on install, delete, cancel or "not now") is enough on its own:
                // the archive simply starts again (owner: "нужно чтобы сама продолжалась").
                var agreedEarlier = false;
                try { agreedEarlier = localStorage.getItem(STARTED_KEY) === '1'; } catch (e) { /* private mode */ }
                if (ownsLibrary && (status.partialBytes > 0 || agreedEarlier)) {
                    log('continuing an unfinished download:', status.partialBytes, 'bytes already on disk');
                    return download('open');
                }
                return null;
            });
        }).catch(function (e) {
            if (!ownsLibrary && e && /Access Handle|createSyncAccessHandle|not opened/i.test(e.message || '')) {
                // The storage really is held by another document: this is the one honest "not owner".
                // Ask it to let go (it will, if it is hidden and idle) and try again on the reply.
                rememberMode(true, 'not-owner');
                requestTakeover();
            }
            // A reader pressing × — or saying "not now" to the platform's consent dialog (the
            // native app's askConsent) — is not a failure: it must not raise the "could not
            // download" toast, and it must not reject `dgOfflineLibrary`. The cancel already
            // answered with its own message; the decline is announced so the platform can
            // remember it (dg-app-full's platform.js listens for dg:download-declined).
            if (e && /cancelled/.test(e.message || '')) {
                log('download cancelled by the reader');
                return null;
            }
            if (e && /declined/.test(e.message || '')) {
                log('download declined by the reader');
                try { window.dispatchEvent(new CustomEvent('dg:download-declined')); } catch (err) { /* ignore */ }
                return null;
            }
            // A failed open of a copy that IS there is a real fault the reader should hear about
            // (offline-status.js turns it into a toast); an absent database never reaches here.
            // One exception: the storage layer refusing its own handles (see refuseOfStorage) —
            // that is worth one retry from a clean worker before the reader is told anything.
            if (refuseOfStorage(e) && retryWithFreshWorker('startup')) {
                return new Promise(function (r) { setTimeout(r, 400); }).then(probe);
            }
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
        // Native app: the page's own origin has no server, so "the server" is the real host,
        // prefixed by the platform (platform.onlineBase). Same-origin URLs only — anything already
        // absolute (the app's own distBase host, CDN links) passes through untouched.
        function withOnlineBase(input, init) {
            if (!platform.onlineBase) return input;
            var raw = typeof input === 'string' ? input : input.url;
            try {
                var u = new URL(raw, location.href);
                if (u.origin === location.origin) return platform.onlineBase + u.pathname + u.search;
            } catch (e) { /* keep the input as-is */ }
            return input;
        }

        // Bundled-instead-of-served routes (app only): TOC comes from build-time snapshots and the
        // Patimokkha fragments are pre-rendered files, so neither needs the worker or the network.
        function mapStatic(input, init) {
            if (!platform.mapStatic) return null;
            var raw = typeof input === 'string' ? input : input.url;
            var where;
            try { where = new URL(raw, location.href); } catch (e) { return null; }
            if (where.origin !== location.origin) return null;
            var mapped = platform.mapStatic(where.pathname);
            return mapped ? realFetch(mapped + where.search, init) : null;
        }

        function toServer(input, init, why) {
            // The URL as the REAL site would see it — the browser shell needs it to hand the reader
            // over to a browser that is online (the app's own origin has no server). withOnlineBase
            // does exactly that rewrite, so the same call serves both purposes here.
            var target = withOnlineBase(input, init);
            return realFetch(target).catch(function (e) {
                if (typeof window.showBubbleNotification === 'function') {
                    var ru = (localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en') === 'ru';
                    window.showBubbleNotification(ru
                        ? 'Нужен интернет: эта система письма или язык не входят в офлайн-библиотеку'
                        : 'Needs internet: this script or language isn’t in the offline library', 5000);
                }
                // ...and a native shell can do better than a toast: the app offers to open the same
                // URL in the device's own browser, which has no offline library and therefore asks
                // the server for the conversion (owner: "сможешь его пробрасывать в браузер и
                // предупреждать если кто в оффлайн откроет, что нужен интернет для этого режима?").
                // `why` says which of the two reasons it was, so the message can name it.
                try {
                    window.dispatchEvent(new CustomEvent('dg:online-only', {
                        detail: {
                            url: (typeof target === 'string') ? target : (target && target.url) || '',
                            reason: why || 'online',
                            offline: (typeof navigator !== 'undefined' && navigator.onLine === false),
                        },
                    }));
                } catch (err) { /* no CustomEvent — nothing to announce */ }
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

        // The routes the offline library can answer. Used for the one thing worth doing while it is
        // NOT installed: explaining a failure honestly.
        // Worth asking another tab only if a library exists somewhere: with nothing downloaded there is
    // nobody to ask, and the reader should get the explanation immediately rather than after a wait.
    function relayLikely() {
        try {
            // A flag the library itself sets, not the per-visit state: a tab whose own probe failed
            // writes present:false over the shared state, which would make every other tab believe
            // there is nothing to ask for.
            if (localStorage.getItem(LIBRARY_KEY) === '1') return true;
            var st = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
            return !!(st && st.present);
        } catch (e) { return false; }
    }

    function isDataRoute(p) {
            return p === '/search' || p.indexOf('/search/') === 0 ||
                   p.indexOf('/api/text/') === 0 || p.indexOf('/api/nav/') === 0;
        }

        // Ask the tab that owns the library to answer. Bounded, because the owner may be gone or
        // busy: then this tab falls through to the honest explanation instead of hanging the reader.
        function relayData(path, init) {
            return new Promise(function (resolve, reject) {
                var id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                var timer = setTimeout(function () {
                    relayRequests.delete(id);
                    reject(new Error('no answer from the tab holding the library'));
                }, 3500);
                relayRequests.set(id, function (msg) {
                    clearTimeout(timer);
                    if (msg.error) { reject(new Error(msg.error)); return; }
                    relayUsed = true;
                    resolve(new Response(msg.body, {
                        status: msg.status || 200,
                        headers: { 'content-type': 'application/json' },
                    }));
                });
                channel.postMessage({ type: 'data-request', id: id, path: path,
                                      method: (init && init.method) || 'GET' });
            });
        }

        function shimFetch(input, init) {
            var bundled = mapStatic(input, init);
            if (bundled) return bundled;

            if (!local) {
                var raw = typeof input === 'string' ? input : input.url;
                var where;
                try { where = new URL(raw, location.href); } catch (e) { return realFetch(input, init); }
                // Every /api/ path joins the forwarded routes: not a data route for the library, but
                // in the app the page's own origin cannot answer it either (withOnlineBase is a no-op
                // on the site, which has no onlineBase).
                if (where.origin !== location.origin ||
                    (!isDataRoute(where.pathname) && where.pathname.indexOf('/api/') !== 0)) {
                    return realFetch(input, init);
                }
                // Not installed yet (or not open here): the request goes to the network. In the
                // native app that means the REAL host — the page's own origin has no server — so
                // the same prefix the online branches use applies here too.
                return realFetch(withOnlineBase(input, init), init).catch(function (e) {
                    var ru = (localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en') === 'ru';
                    var st = null;
                    try { st = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (err) { /* ignore */ }
                    var why = st && st.present
                        ? (ru ? 'Библиотека скачана, но эта вкладка её не использует — закройте другие вкладки этого сайта и приложение, затем обновите страницу'
                              : 'The library is downloaded, but this tab is not using it — close the site’s other tabs and the installed app, then reload')
                        : (ru ? 'Нет сети, и офлайн-библиотека не скачана: Настройки → Офлайн-библиотека → Скачать'
                              : 'No connection, and the offline library is not downloaded: Settings → Offline library → Download');
                    notify(why);
                    throw e;
                });
            }

            var url = typeof input === 'string' ? input : input.url;
            var parsed;
            try { parsed = new URL(url, location.href); } catch (e) { return realFetch(input, init); }
            if (parsed.origin !== location.origin) return realFetch(input, init);

            var p = parsed.pathname;
            var qs = parsed.searchParams;

            if (p === '/api/transliterate') {
                if (ensureScriptMode() === 'online') return toServer(input, init, 'script');
            }

            if (p.indexOf('/api/text/') === 0) {
                if (langNeedsOnline(qs)) return toServer(input, init, 'lang');
                if (scriptRequested(qs)) return toServer(input, init, 'script');
                return withLoadingEvent(function () {
                    return call('text', {
                        suttaId: decodeURIComponent(p.slice('/api/text/'.length)).toLowerCase(),
                        mode: qs.get('mode'),
                        langs: qs.get('langs'),
                        lang: qs.get('lang'),
                        translators: qs.get('translators'),
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
                if (langNeedsOnline(qs)) return toServer(input, init, 'lang');
                if (scriptRequested(qs)) return toServer(input, init, 'script');
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
                if (langNeedsOnline(qs)) return toServer(input, init, 'lang');
                if (scriptRequested(qs)) return toServer(input, init, 'script');
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

            // An API the library does not answer (/api/ai-search, /api/settings-demo, ...): in the app
            // it must reach the real host — https://localhost would answer it with index.html.
            if (p.indexOf('/api/') === 0) return realFetch(withOnlineBase(input, init), init);
            return realFetch(input, init);
        }

        window.fetch = function (input, init) { return gate(input, init, false); };

        // `waited` matters: the probe can hang for good when the pool install is blocked by another
        // document, and re-entering this gate would then wait 2.5s, again and again — the request never
        // reached the relay and the reader stayed empty in the tab that had handed the library over.
        function gate(input, init, waited) {
            if (local) return shimFetch(input, init);
            var raw = typeof input === 'string' ? input : input.url;
            var where;
            try { where = new URL(raw, location.href); } catch (e) { return realFetch(input, init); }
            // A data request that arrives BEFORE the probe has decided whether a library exists has to
            // wait for that verdict, not go to the network: the reader starts fetching its text the
            // moment the page loads, and on a cold offline load that race is exactly what left
            // /dn22:2.2 showing the landing page with "Failed to fetch" in the console.
            if (where.origin === location.origin && isDataRoute(where.pathname) && !waited && probeDone && !probeSettled) {
                // Bounded wait: a probe can hang for good when the pool install is blocked by another
                // document, and then every request of this page would wait for a verdict that never
                // comes (second tab: no relay, no error, just an empty result).
                return Promise.race([
                    probeDone.catch(function () {}),
                    new Promise(function (r) { setTimeout(r, 2500); }),
                ]).then(function () { return gate(input, init, true); });
            }
            // Not local: if another tab holds the library, it answers — that is the whole point of
            // having opened the app twice. Only then does the plain explanation remain.
            if (where.origin === location.origin && isDataRoute(where.pathname) && channel && relayLikely()) {
                return relayData(where.pathname + where.search, init)
                    .catch(function (e) {
                        log('relayed request failed:', (e && e.message) || e);
                        return shimFetch(input, init);
                    });
            }
            return shimFetch(input, init);
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
            try { localStorage.removeItem(STARTED_KEY); } catch (e) { /* private mode */ }
            rememberState({ present: false, build_id: null, update: null });
            return result;
        });
    };

    // Small, stable surface for the end-to-end test to assert which of the two modes this tab is
    // in. Not used by any product code.
    window.dgOfflineDiagnostics = function () {
        return { mode: local ? 'local' : 'server', ownsLibrary: ownsLibrary,
                 distBase: DIST_BASE, workerStarted: !!worker,
                 // true once this tab has answered at least one request from the tab that owns the
                 // library — the supported way for a second tab to work offline.
                 relayed: relayUsed };
    };

    // ---------------------------------------------------------------------------------------
    // Go
    // ---------------------------------------------------------------------------------------

    installFetchShim();

    probeDone = probe();
    probeDone.then(function () { probeSettled = true; resolveReady({ local: local }); },
                   function (e) { probeSettled = true; rejectReady(e); });
})();
