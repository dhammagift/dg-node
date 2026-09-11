// The offline data layer. Everything that touches the database happens in here, and nothing else
// does.
//
// It is a Worker for one concrete reason: OPFS gives out synchronous access handles
// (createSyncAccessHandle) only inside a Worker — on the main thread that method does not exist.
// Synchronous access is what lets SQLite read a 170MB file from storage instead of holding it in
// memory, and it is also what lets dg-node's core/search-core.js run here UNCHANGED: that module
// queries synchronously, because on the server it runs against node:sqlite.
//
// So the shape is: page -> postMessage -> this worker -> the site's own core -> SQLite -> back.
// The page's fetch shim is already asynchronous, so nothing above this file had to change to
// accommodate the boundary.
//
// Ported to the WEBSITE from dg-app-full/src/db-worker.js (docs/OFFLINE_PWA_PLAN.md, Stage 1).
// Three differences, all of them things a browser needs and a native app does not:
//
//  1. `open` takes a `download` flag. In the app, "open the database" means "download it if it is
//     not here" — the app is useless without it. On the site a download is opt-in, so the startup
//     probe opens only what is already stored and falls back to the server otherwise; a 170MB
//     transfer must never start because a page was loaded.
//  2. Interrupted downloads are RESUMED, not restarted: the bytes received so far are kept in an
//     OPFS scratch file named after the build they belong to, and the next attempt asks the
//     server for `Range: bytes=<have>-`. In the app Android's DownloadManager covered this; on
//     the open web nothing does, and a reader on a train would otherwise pay for 170MB again.
//     Scratch is build-named on purpose — a partial file from an older build must never be glued
//     in front of a newer one, which would produce a database that opens and lies.
//  3. A `delete` op, so "remove the offline library" is possible at all (the app has no such
//     button: there, the library is the app).

// Both imports end in .js, deliberately: a browser only accepts a module served with a
// JavaScript MIME type, and Android's MimeTypeMap has no entry for "mjs". Capacitor's asset
// server therefore served these as application/octet-stream, this worker failed to start, and
// with it went every search and every reader request in the app. See build-core-bundle.js.
import sqlite3InitModule from './vendor/sqlite-wasm/index.js';
import core from './core-bundle.js';

// dg-mobile.db, not dg.db: the server's own database is dg.db and lives on the same box, so
// sharing the name is how a symlink ends up pointing 600MB of every language at a phone.
//
// A downloaded copy is stored under its own build id — /dg-mobile.<build_id>.db — for one
// reason: the SAH pool can import and unlink files but cannot rename one, so replacing a database
// in place would mean destroying the working copy before knowing the new one arrived. Naming by
// build instead lets the new file land alongside the old, and the old one is unlinked only once
// the new one opens. It also makes a half-finished download self-identifying: its meta either
// cannot be read or does not carry the build its name claims.
//
// LEGACY_DB_NAME is the unversioned name shipped before this, still on devices that installed
// early. It is read as a valid current copy and replaced by a named one at the first update.
const LEGACY_DB_NAME = '/dg-mobile.db';
const DB_PREFIX = '/dg-mobile.';
const POOL_NAME = 'dg-offline';

// Where an interrupted download parks the bytes it already has, so the next attempt can continue
// instead of starting over. Named after the build it belongs to: a partial file that outlived its
// build would otherwise be prepended to a different one (see point 2 of the header).
//
// It lives at the OPFS root, beside the pool's own directory (POOL_NAME), not inside it — the SAH
// pool exposes no way to write into a pool file at an offset, so the prefix has to be held
// somewhere this worker can read and append to with an ordinary sync access handle.
const SCRATCH_PREFIX = 'dg-mobile.';
const SCRATCH_SUFFIX = '.partial';
function scratchNameFor(target) {
    // target is '/dg-mobile.<build>.db' (or the legacy '/dg-mobile.db'), so strip the pool path
    // and the .db suffix and put .partial in their place.
    const base = target.replace(/^\//, '').replace(/\.db$/, '');
    return `${base}${SCRATCH_SUFFIX}`;
}
const SCRATCH_CHUNK = 4 * 1024 * 1024;

// Where sqlite-wasm puts the pool on disk: options.directory || "." + options.name (see
// installOpfsSAHPoolVfs), with the actual files one level deeper in .opaque/. Knowing this is what
// makes the startup probe cheap — see anyStoredFiles().
const POOL_DIR = '.' + POOL_NAME;
const OPAQUE_DIR = '.opaque';

// The shape this worker is written against. A file declaring anything else is not opened: the
// alternative is queries that almost fit, answering almost-right.
const SCHEMA_VERSION = 1;

function dbNameFor(buildId) { return `${DB_PREFIX}${buildId}.db`; }
function cancelledError() { return Object.assign(new Error('download cancelled'), { cancelled: true }); }
function nameToBuild(name) { return name.slice(DB_PREFIX.length, -'.db'.length); }

let db = null;
let ready = null;
let poolPromise = null;
// Cancellation, so a reader who started this by mistake — or is on mobile data — can stop it. The
// transfer has to be interrupted from outside the retry loop, and a cancel must NOT come back as a
// resumable partial: the scratch file goes too, or the next page load would quietly pick it up.
let cancelRequested = false;
let activeAbort = null;
// What the last transfer actually did: bytes handed to the pool, the size of the partial copy we
// wrote ourselves, and how many of OUR writes came up short. On a phone a SQLITE_CORRUPT at the end
// has several possible causes and no DevTools to look at, so the failure message carries these.
let lastTransferStats = null;

function post(msg) {
    self.postMessage(msg);
}

// dg-node's core was written against node:sqlite's prepare().all()/.get(). sqlite-wasm's oo1 API
// is equivalent but spelled differently, so this is the whole adapter. Kept deliberately thin: if
// it ever needs to reshape a result, the core has stopped being portable and that is worth
// noticing rather than smoothing over.
function nodeSqliteShim(oo1db) {
    return {
        prepare(sql) {
            return {
                all: (...params) => oo1db.selectObjects(sql, params),
                get: (...params) => oo1db.selectObject(sql, params),
            };
        },
        function(name, opts, fn) {
            oo1db.createFunction(name, (_ctx, ...args) => fn(...args), { deterministic: !!opts?.deterministic });
        },
    };
}

// Streams the database straight into OPFS. The pool's importDb() takes a callback and writes each
// chunk as it arrives, so the file never exists as one 170MB buffer — which is the difference
// between working on a phone and not.
// fetch()/ReadableStream have no built-in timeout: a mobile network that drops a connection
// without sending so much as a RST (common on cellular, and on Wi-Fi<->cellular handoff) leaves
// reader.read() awaiting a chunk that will never arrive — no error, nothing to catch, just a
// download that silently stops moving forever. STALL_MS bounds how long any single read may take;
// past it the fetch is aborted and the whole thing is retried rather than left hanging.
const STALL_MS = 15000;
const MAX_ATTEMPTS = 6;
const MANIFEST_TIMEOUT_MS = 8000;
// Retrying instantly into a connection that just dropped tends to hit the same dead spot again.
// Backoff is capped low (network conditions on a phone change in seconds, not minutes) and jitter
// keeps a whole fleet of readers from retrying in lockstep against the same server.
const RETRY_BACKOFF_MS = attempt => Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 500);

// Seen in production before (see the comment on DB_PREFIX above): mobile-data/dg-mobile.db on the
// server has, at least once, ended up symlinked to dg-node's own full dg.db — every language,
// several times the size of the ru+en slice this app expects — rather than the slice
// build-app-db.js is supposed to publish. That is a server-side mistake no client-side retry can
// fix, and left unchecked it reads as this app quietly downloading an ever-growing, seemingly
// made-up number rather than what it is: a real transfer of the wrong file. OVERSHOOT_FACTOR bounds
// how much more than the manifest promised is tolerated before that is called out directly instead
// of continuing (compressed responses can legitimately run a little over, so this is not 1.0).
const OVERSHOOT_FACTOR = 1.5;

// AbortController.abort() is the textbook way to interrupt a stuck reader.read(), but on-device
// testing showed it does not reliably do that in this WebView's Chromium build: a read that never
// gets a chunk stays pending forever even after abort() is called on it, silently — no
// AbortError, nothing to catch, the watchdog fires and nothing happens. So a stall is no longer
// detected by racing the read against an abort signal; it is detected by racing it against a
// plain setTimeout Promise, which needs no cooperation from fetch/ReadableStream at all to win.
// The abandoned read (and the fetch behind it) may keep running in the background after this
// races it out, uselessly — cancel()/abort() are still called on the way out as a best effort,
// but nothing here waits on them, since that would reintroduce exactly this bug one level up.
function readWithTimeout(reader, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(Object.assign(new Error(`no data for ${ms / 1000}s`), { name: 'AbortError' }));
        }, ms);
        reader.read().then(
            result => { clearTimeout(timer); resolve(result); },
            err => { clearTimeout(timer); reject(err); },
        );
    });
}

// expectedWireBytes/expectedDbBytes differ only for a gzipped download: the manifest's bytes_gz
// (what actually crosses the network, checked against Content-Length before reading anything) vs
// its bytes (what the file is once DecompressionStream — native, no library — expands it, checked
// against what importDb actually receives). For a plain download both are the same number.

// --- resumable downloads (see point 2 of the header) ---------------------------------------
//
// A worker is the only place OPFS hands out synchronous access handles, which is exactly what the
// scratch file needs: append the bytes as they arrive, read them back on the next attempt.

async function opfsRoot() {
    return navigator.storage.getDirectory();
}

// How much of an earlier interrupted attempt is still parked on disk (0 when there is none).
// Used before choosing a file to fetch: a resumed transfer must be the plain one, because a gzip
// stream cannot be continued from a byte offset.
async function partialBytes(scratchName) {
    try {
        const root = await opfsRoot();
        const handle = await root.getFileHandle(scratchName); // no create: absent means "nothing to resume"
        const file = await handle.getFile();
        return file.size || 0;
    } catch (e) { return 0; }
}

async function openScratch(scratchName) {
    const root = await opfsRoot();
    const handle = await root.getFileHandle(scratchName, { create: true });
    // Newer Chrome wants the options bag; older builds reject it. Both are in the wild.
    try { return await handle.createSyncAccessHandle({ mode: 'readwrite' }); }
    catch (e) { return await handle.createSyncAccessHandle(); }
}

// The scratch handle is closed by downloadInto on the cancel path; this only removes the file, so a
// later page load has nothing to resume from.
async function dropScratchAfterCancel(scratchName) {
    try { (await opfsRoot()).removeEntry(scratchName); } catch (e) { /* already gone */ }
}

async function dropScratch(scratch, scratchName) {
    try { scratch.close(); } catch (e) { /* already closed */ }
    try { (await opfsRoot()).removeEntry(scratchName); } catch (e) { /* already gone */ }
}

// Bytes of an unfinished download already on disk, whichever build they belong to. Cheap: OPFS
// directory entries only — no pool, no wasm, no manifest. This is what lets a page that was reloaded
// (or a browser that was restarted) pick a download back up on its own instead of pretending the
// reader never asked.
async function partialBytesAny() {
    let total = 0;
    try {
        const root = await opfsRoot();
        for await (const [name, handle] of root) {
            if (handle.kind !== 'file') continue;
            if (!name.startsWith(SCRATCH_PREFIX) || !name.endsWith(SCRATCH_SUFFIX)) continue;
            try { total += (await handle.getFile()).size || 0; } catch (e) { /* unreadable — ignore */ }
        }
    } catch (e) { /* no OPFS enumeration available */ }
    return total;
}

// A partial file is only meaningful for the build it came from (it gets prepended to that build's
// file). Anything left over from a different build is deleted when a download starts, so the
// scratch directory cannot grow by 170MB every time the corpus is rebuilt.
async function cleanScratchExcept(keepName) {
    try {
        const root = await opfsRoot();
        for await (const name of root.keys()) {
            if (name === keepName) continue;
            if (name.startsWith(SCRATCH_PREFIX) && name.endsWith(SCRATCH_SUFFIX)) {
                try { await root.removeEntry(name); } catch (e) { /* ignore */ }
            }
        }
    } catch (e) { /* no OPFS enumeration — nothing to clean */ }
}

async function downloadInto(pool, url, name, expectedWireBytes, expectedDbBytes, gzip, scratchName, resumable) {
    const phase = 'download';
    // 'plain' mode (no room for two copies) runs with no scratch file at all: no resume, and half the
    // peak space, which is the difference between finishing and SQLITE_CORRUPT near the end.
    const useScratch = resumable !== false;
    const scratch = useScratch ? await openScratch(scratchName) : null;
    let scratchShortWrites = 0;

    for (let attempt = 1; ; attempt++) {
        if (cancelRequested) { if (scratch) { try { scratch.close(); } catch (_) {} } throw cancelledError(); }
        const controller = new AbortController();
        activeAbort = controller;
        let reader = null;

        try {
            // What an earlier attempt already paid for. gzip transfers are never resumed (a
            // compressed stream has no meaningful byte offset to continue from), so they always
            // start from zero.
            const have = (gzip || !scratch) ? 0 : scratch.getSize();
            console.log(`[dg-offline] attempt ${attempt}: ${have} bytes already on disk`);
            const response = await fetch(url, {
                signal: controller.signal,
                headers: have > 0 ? { Range: `bytes=${have}-` } : undefined,
            });
            if (!response.ok) throw new Error(`dg-mobile.db: HTTP ${response.status}`);
            // A 200 answering a Range request means the server ignored it, or the file changed
            // under us. The body starts at zero, so the prefix we hold is worthless — drop it
            // rather than glue two different beginnings together.
            if (have > 0 && scratch && response.status === 200) scratch.truncate(0);
            const resumedFrom = (have > 0 && response.status === 206) ? have : 0;
            const remaining = Number(response.headers.get('Content-Length')) || 0;
            // The denominator. Content-Length alone is not enough: a chunked response (nginx
            // proxying without buffering, an older deploy that has not got the per-route
            // Content-Length/compression fix) has none, and then total was 0 — the card fell back
            // to an indeterminate bar with no percentage and no "X of Y MB" anywhere, so the
            // reader could not tell whether a 509MB transfer was 5% or 95% done (owner, on the
            // device, twice). The published manifest states the size, and it is the same file, so
            // it is the honest fallback; the overshoot check above still uses the manifest to
            // catch a server serving the wrong file entirely.
            const total = (resumedFrom + remaining) || expectedDbBytes || expectedWireBytes || 0;
            if (expectedWireBytes && total && total > expectedWireBytes * OVERSHOOT_FACTOR) {
                throw Object.assign(
                    new Error(`dg-mobile.db: server offered ${Math.round(total / 1048576)}MB, ` +
                        `manifest promised ${Math.round(expectedWireBytes / 1048576)}MB — ` +
                        `check mobile-data/dg-mobile.db on the server, it may point at the wrong file`),
                    { mismatch: true });
            }

            // What the reader is warned about before agreeing to a download is what crosses their
            // connection — for a gzipped response that's wireLoaded/expectedWireBytes, not the
            // (larger) decompressed count importDb receives. wireLoaded is read off the compressed
            // side via a counting TransformStream spliced in front of DecompressionStream; its
            // flush() fires exactly when the network side is exhausted, which is also the honest
            // point to stop calling this "downloading" — what is left is unpacking an already-
            // fully-arrived file, not more network.
            let wireLoaded = 0, networkDone = !gzip;
            let body = response.body;
            if (gzip) {
                const counting = new TransformStream({
                    transform(chunk, controller) { wireLoaded += chunk.byteLength; controller.enqueue(chunk); },
                    flush() { networkDone = true; },
                });
                body = response.body.pipeThrough(counting).pipeThrough(new DecompressionStream('gzip'));
            }
            reader = body.getReader();
            let loaded = 0, lastReport = 0;
            // Where the replayed prefix ends and the network part begins: `readFrom` walks the
            // scratch file, `writeAt` appends what this attempt receives so the NEXT one can
            // resume from further along, and `loaded` counts what importDb has actually been fed.
            let readFrom = 0;
            let writeAt = resumedFrom;

            const loadedBytes = await pool.importDb(name, async () => {
                if (readFrom < resumedFrom) {
                    const size = Math.min(SCRATCH_CHUNK, resumedFrom - readFrom);
                    const buf = new Uint8Array(size);
                    const n = scratch.read(buf, { at: readFrom });
                    if (n <= 0) throw new Error('dg-mobile.db: the partial copy could not be read back');
                    readFrom += n;
                    loaded += n;
                    return buf.subarray(0, n);
                }
                const { done, value } = await readWithTimeout(reader, STALL_MS);
                if (done) return undefined;
                if (!gzip && scratch) {
                    // Best effort for the transfer (a failed scratch write costs the next attempt its
                    // resume, never this one) — but COUNTED, because a short write here is the first
                    // sign of a storage layer that is not taking what it is given, and that is what
                    // turns into SQLITE_CORRUPT a moment later.
                    try {
                        const wrote = scratch.write(value, { at: writeAt });
                        if (wrote !== value.byteLength) scratchShortWrites++;
                    } catch (e) { scratchShortWrites++; }
                }
                writeAt += value.byteLength;
                loaded += value.byteLength;
                if (expectedDbBytes && loaded > expectedDbBytes * OVERSHOOT_FACTOR) {
                    throw Object.assign(
                        new Error(`dg-mobile.db: past ${Math.round(loaded / 1048576)}MB with only ` +
                            `${Math.round(expectedDbBytes / 1048576)}MB promised — ` +
                            `check mobile-data/dg-mobile.db on the server, it may point at the wrong file`),
                        { mismatch: true });
                }
                const now = Date.now();
                if (now - lastReport > 200) {
                    lastReport = now;
                    if (!gzip) {
                        post({ type: 'progress', loaded, total, phase });
                    } else if (networkDone) {
                        post({ type: 'progress', loaded: 0, total: 0, phase: 'import' });
                    } else {
                        post({ type: 'progress', loaded: wireLoaded, total: expectedWireBytes || total, phase });
                    }
                }
                return value;
            });
            // reader.read() returning {done: true} is the NORMAL, successful end of a stream — but
            // a dropped connection can also produce exactly that with no error at all (observed:
            // a from-scratch download that silently stopped 55% in, same exact byte count on a
            // repeat attempt, no stall, no exception, just an early "done"). Nothing above this
            // point ever checked the received count against what the manifest promised, so a
            // truncated file went straight to inspect()/SQLite as if it had arrived whole — the
            // resulting SQLITE_CORRUPT, several layers removed from "the download stopped early",
            // is what a reader actually saw. Treated as retryable (not `mismatch: true`, which is
            // reserved for "the server is serving the wrong file entirely") since an ordinary retry
            // already succeeds once the connection is good again.
            if (expectedDbBytes && loadedBytes !== expectedDbBytes) {
                throw new Error(`dg-mobile.db: stream ended after ${Math.round(loadedBytes / 1048576)}MB, ` +
                    `expected ${Math.round(expectedDbBytes / 1048576)}MB — connection likely dropped mid-transfer`);
            }
            console.log(`[dg-offline] attempt ${attempt}: imported ${loadedBytes} bytes`);
            // NOT done:true. The card says "Library ready" on done, and posting it here made the
            // page claim success before the file had been opened — the reader then saw "готово"
            // followed by an error, and settings still saying "Not downloaded" (owner's phone).
            // The real done is posted by fetchCurrent() once the library is actually open.
            post({ type: 'progress', loaded, total: gzip ? (expectedDbBytes || 0) : total, phase, done: false });
            // The whole file is in the pool now; the scratch copy has no further purpose and 170MB
            // of it sitting in OPFS would be the reader's storage quietly halved.
            lastTransferStats = {
                fed: loadedBytes,
                expected: expectedDbBytes || null,
                scratchSize: scratch ? scratch.getSize() : null,
                scratchShortWrites,
            };
            if (scratch) await dropScratch(scratch, scratchName);
            activeAbort = null;
            return loadedBytes;
        } catch (e) {
            if (cancelRequested) {
                // The reader said stop: no retry, and no scratch left behind for a later page load.
                controller.abort();
                if (reader) reader.cancel().catch(() => {});
                if (scratch) await dropScratch(scratch, scratchName);
                activeAbort = null;
                throw cancelledError();
            }
            if (e && e.mismatch) { activeAbort = null; if (scratch) { try { scratch.close(); } catch (_) {} } throw e; } // a server misconfiguration, not a network blip — retrying serves nobody
            const stalled = e && e.name === 'AbortError';
            controller.abort();
            if (reader) reader.cancel().catch(() => {});
            if (attempt >= MAX_ATTEMPTS) {
                // Give up, but keep the scratch file: a later retry (the reader pressing the
                // button again, or a better connection) continues from here instead of 0.
                activeAbort = null;
                if (scratch) { try { scratch.close(); } catch (_) {} }
                throw stalled
                    ? new Error(`dg-mobile.db: stalled (no data for ${STALL_MS / 1000}s), ` +
                        `gave up after ${MAX_ATTEMPTS} attempts`)
                    : e;
            }
            // importDbChunked() (sqlite-wasm) already removes the partial file on the exception
            // this abort caused, so the next attempt starts clean — nothing to unlink here.
            // `resumed` is what the NEXT attempt will ask the server for — the bytes already on
            // disk. Reported so "did the retry resume or start over" is answerable from the UI/logs
            // instead of by watching the network.
            // scratch is null in 'plain' mode (no room for a resumable copy) — reading getSize() off
            // it threw a TypeError inside this catch, which killed the retry loop outright: on
            // exactly the devices with the least room, the first dropped connection ended the
            // download instead of being retried six times.
            post({ type: 'progress', loaded: 0, total: 0, phase, retrying: attempt + 1,
                   resumed: scratch ? scratch.getSize() : 0 });
            await new Promise(resolve => setTimeout(resolve, RETRY_BACKOFF_MS(attempt)));
        }
    }
}

// Installing the VFS is cheap and idempotent per worker, and both status and open need it —
// status so the page can decide whether to ask about network use before anything is downloaded.
function getPool() {
    // The memo must NOT survive a failure. While another document holds the exclusive handles the
    // install throws NoModificationAllowedError, and a remembered rejection meant that a tab which
    // was handed the library a second later kept failing instantly — it never tried again (second tab
    // stayed server-backed for good, with "the other tab released the offline library — taking it
    // over" in the log and nothing happening afterwards).
    poolPromise = poolPromise || (async () => {
        const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
        // opfs-sahpool, not the plain "opfs" VFS: the latter needs the page to be cross-origin
        // isolated (COOP/COEP headers), which a Capacitor WebView does not give us.
        return sqlite3.installOpfsSAHPoolVfs({ name: POOL_NAME, initialCapacity: 6 });
    })().catch((e) => {
        poolPromise = null;   // let the next attempt try the storage for real
        throw e;
    });
    return poolPromise;
}

// Every dg-mobile file the pool holds, newest naming first. More than one means an update was
// interrupted between importing the new file and unlinking the old — normal, and resolved by
// opening them in turn until one proves sound.
function storedDatabases(pool) {
    return pool.getFileNames()
        .filter(n => n === LEGACY_DB_NAME || (n.startsWith(DB_PREFIX) && n.endsWith('.db')))
        .sort((a, b) => (a === LEGACY_DB_NAME ? 1 : 0) - (b === LEGACY_DB_NAME ? 1 : 0));
}

// What makes a stored file usable is that the reader can read from it — everything else is
// bookkeeping. A truncated import fails the first query here, which is where that should surface,
// rather than as a blank reader later.
//
// Missing provenance is deliberately NOT a rejection. Copies published before meta existed are
// already on devices; they read perfectly well and simply cannot say which build they are, so they
// are kept and treated as out of date. Their owner is then offered the current build instead of
// silently losing the 170MB they already downloaded.
function inspect(pool, name) {
    let handle = null;
    try {
        handle = new pool.OpfsSAHPoolDb(name);
        handle.selectObject('SELECT count(*) c FROM suttas');

        let meta = {};
        try {
            for (const row of handle.selectObjects('SELECT key, value FROM meta')) meta[row.key] = row.value;
        } catch (e) { meta = {}; }

        if (meta.schema_version && Number(meta.schema_version) !== SCHEMA_VERSION) {
            handle.close();
            return { name, ok: false, reason: `schema ${meta.schema_version} != ${SCHEMA_VERSION}` };
        }
        // A file saved under a build id it does not carry is a download that stopped partway and
        // happened to leave valid pages behind.
        if (name !== LEGACY_DB_NAME && meta.build_id !== nameToBuild(name)) {
            handle.close();
            return { name, ok: false, reason: 'incomplete download' };
        }
        return { name, ok: true, meta, handle };
    } catch (e) {
        if (handle) { try { handle.close(); } catch (_) {} }
        return { name, ok: false, reason: e.message };
    }
}

function adopt(candidate) {
    db = candidate.handle;
    core.init({ searchDb: nodeSqliteShim(db), DG_OFFLINE: '/offline-data/dhammagift' });

    // The same in-memory sutta index initServer() builds on the server, from the same query.
    const skeleton = {};
    for (const row of db.selectObjects('SELECT id, category, dir_path, title, mr FROM suttas')) {
        skeleton[row.id] = { category: row.category, dir_path: row.dir_path, title: row.title, mr: row.mr };
    }
    core.setSkeleton(skeleton);
    return Object.keys(skeleton).length;
}

// Downloads the current build and adopts it, leaving whatever was open until the new file is
// proven — a failed update must cost a reader nothing, and a reader who is mid-download is still
// reading from the old copy. Peak storage is two databases; the alternative is losing the only one.
// A 170-500MB download is expensive enough that failing it for lack of room should be said BEFORE
// it starts, not discovered page by page. Peak usage is the database plus its resumable partial
// copy (a retry replays the prefix while the network part appends), so ~2.1x the file, plus a
// little headroom for SQLite's own temp use. estimate() is advisory — a browser is free to lie,
// and the integrity check after the download is the backstop; this only spares the reader the
// download.
// Appended to a corruption message: the one number that explains it and the one thing to do.
function storageHint(plan) {
    const t = lastTransferStats;
    const facts = t ? ` [received ${Math.round(t.fed / 1048576)}MB` +
        (t.expected ? ` of ${Math.round(t.expected / 1048576)}MB` : '') +
        `, partial copy ${t.scratchSize === null ? 'none' : Math.round(t.scratchSize / 1048576) + 'MB'}` +
        (t.scratchShortWrites ? `, ${t.scratchShortWrites} short write(s) by this page` : '') + `]` : '';
    if (!plan || !plan.freeBytes) return facts;
    return facts + ` (device reports ${Math.round(plan.freeBytes / 1048576)}MB free, this download ` +
        `wanted about ${Math.round(plan.neededBytes / 1048576)}MB)`;
}

// How much room this download actually needs, and therefore how it can be done:
//   'resume' — the database plus its resumable partial copy (peak ~2x), a dropped connection can be
//              continued with a Range request;
//   'plain'  — the database alone (peak ~1x). No resume, but it FITS: on a phone with ~1GB free the
//              2x requirement is exactly what produced "качал-качал" and then SQLITE_CORRUPT, because
//              the writes started failing near the end (the pool's importDb does not check them).
// Throws only when even 'plain' does not fit, naming the numbers.
async function storagePlanFor(dbBytes) {
    if (!dbBytes) return { mode: 'resume', freeBytes: null, neededBytes: null };
    let est;
    try { est = await navigator.storage.estimate(); } catch (e) { return { mode: 'resume', freeBytes: null, neededBytes: null }; }
    if (!est || !est.quota) return { mode: 'resume', freeBytes: null, neededBytes: null };
    const free = est.quota - (est.usage || 0);
    const headroom = 32 * 1048576;
    const resumeNeeds = Math.ceil(dbBytes * 2.1) + headroom;
    const plainNeeds = Math.ceil(dbBytes * 1.15) + headroom;
    if (free >= resumeNeeds) return { mode: 'resume', freeBytes: free, neededBytes: resumeNeeds };
    if (free >= plainNeeds) {
        console.log(`[dg-offline] only ${Math.round(free / 1048576)}MB free: downloading without the ` +
            `resumable partial copy (needs ${Math.round(plainNeeds / 1048576)}MB instead of ` +
            `${Math.round(resumeNeeds / 1048576)}MB)`);
        return { mode: 'plain', freeBytes: free, neededBytes: plainNeeds };
    }
    throw new Error(`not enough storage for the offline library: about ` +
        `${Math.round(plainNeeds / 1048576)}MB of free space is needed, this browser allows ` +
        `${Math.round(free / 1048576)}MB more — free up space and try again`);
}

// What can be checked WITHOUT reading the whole file: the table we are about to depend on exists and
// has rows, and the file SQLite sees is not shorter than the manifest promised (a transfer that ran
// out of room produces exactly that). Returns null when nothing is wrong.
function checkCheap(handle, expectedBytes) {
    try {
        const suttas = handle.selectObject('SELECT count(*) c FROM suttas');
        if (!suttas || !suttas.c) return 'no suttas table';
    } catch (e) {
        return e.message;
    }
    if (expectedBytes) {
        try {
            const pages = handle.selectObject('PRAGMA page_count');
            const size = handle.selectObject('PRAGMA page_size');
            const bytes = (pages && pages.page_count ? pages.page_count : 0) *
                          (size && size.page_size ? size.page_size : 0);
            // Only "shorter than promised" — page_count*page_size is not guaranteed to equal the file
            // size byte for byte, and a false rejection would be worse than this check is worth.
            if (bytes && bytes < expectedBytes) return `only ${bytes} of ${expectedBytes} bytes`;
        } catch (e) { /* no page_count — the count(*) above is what matters */ }
    }
    return null;
}

// Runs after the library is already usable. On failure the file is dropped, the worker forgets it and
// the page is told, so the reader falls back to the server instead of reading a holey database.
function scheduleFullCheck(pool, name) {
    setTimeout(() => {
        const t0 = Date.now();
        const result = checkIntegrity(pool, name);
        console.log(`[dg-offline] full check after install: ${result} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        if (result === 'ok') return;
        post({ type: 'library-invalid', reason: result });
        try { pool.unlink(name); } catch (_) {}
        if (db) { try { db.close(); } catch (_) {} db = null; }
        ready = null;
    }, 500);
}

// 'ok' or the first problem SQLite names. quick_check() walks every page — the point is to touch
// pages the reader's first query would not (a hole in the middle of a table nobody has searched
// yet is exactly the case a cheap count(*) cannot see).
function checkIntegrity(pool, name) {
    let handle = null;
    try {
        handle = new pool.OpfsSAHPoolDb(name);
        const row = handle.selectObject('PRAGMA quick_check');
        if (!row) return 'no result';
        const value = row.quick_check !== undefined ? row.quick_check : Object.values(row)[0];
        return value === undefined ? 'no result' : value;
    } catch (e) {
        return e.message;
    } finally {
        if (handle) { try { handle.close(); } catch (_) {} }
    }
}

async function fetchCurrent(pool, distBase, args) {
    cancelRequested = false; // a fresh attempt clears any earlier cancel
    const manifest = await fetchManifest(distBase);
    if (manifest && Number(manifest.schema_version) !== SCHEMA_VERSION) {
        throw new Error(
            `published database is schema ${manifest.schema_version}, this app reads ${SCHEMA_VERSION}` +
            ` — update the app`);
    }
    // Without a manifest the build id is unknown until the file is here, so it lands under the
    // legacy name. That keeps an older server (one publishing no manifest) working.
    const target = manifest && manifest.build_id ? dbNameFor(manifest.build_id) : LEGACY_DB_NAME;
    const stale = storedDatabases(pool).filter(n => n !== target);
    const scratchName = scratchNameFor(target);
    await cleanScratchExcept(scratchName);
    const resumed = await partialBytes(scratchName);

    // The plain file wins over the gzipped one whenever the manifest publishes both: an
    // interrupted gzip transfer cannot be continued (the bytes on the wire are not the bytes of
    // the database), so it would restart from zero every time, while the plain one resumes with a
    // Range request. Nothing of value is given up — the plan's own measurement found gzip a net
    // loss on this database (168MB -> 177MB).
    const gzip = !!(manifest && manifest.file_gz) && !(manifest && manifest.file) && !resumed;
    const file = gzip ? manifest.file_gz : (manifest && manifest.file) || 'dg-mobile.db';
    const expectedWireBytes = gzip ? manifest.bytes_gz : (manifest && manifest.bytes);

    // How this download can be done: with a resumable partial copy (peak ~2x the file) or as a
    // single file (peak ~1x, no resume). On a phone with little room the 2x was what produced a
    // long download ending in SQLITE_CORRUPT — the writes fail near the end and importDb does not
    // check them. storagePlanFor() throws before anything is transferred when even one copy does
    // not fit, naming the numbers.
    const plan = await storagePlanFor(manifest && manifest.bytes);
    const wanted = (args && args.noResume) ? 'plain' : plan.mode;
    const modes = wanted === 'resume' ? ['resume', 'plain'] : ['plain'];

    // One attempt, from the transfer to an opened library. A corruption failure is marked retryable
    // so the caller can try again without the resumable copy — the most likely reason it happened.
    const runAttempt = async (resumable) => {
        post({ type: 'downloading' });
        // Phase timings, in the worker's own log: "the download is slow" has three very different
        // causes (the network, this browser's storage, or the check afterwards) and guessing between
        // them wastes everyone's time. Cheap enough to keep.
        const tTransfer = Date.now();
        let transferred;
        try {
            transferred = await downloadInto(pool, `${distBase}/${file}`, target, expectedWireBytes,
                manifest && manifest.bytes, gzip, scratchName, resumable);
        } catch (e) {
            if (e && e.cancelled) {
                // Nothing half-written is left to confuse the next visit: no pool file, no scratch.
                try { pool.unlink(target); } catch (_) {}
                await dropScratchAfterCancel(scratchName);
            }
            throw e;
        }
        const transferSec = (Date.now() - tTransfer) / 1000;
        console.log(`[dg-offline] transfer: ${(transferred / 1048576).toFixed(1)}MB in ${transferSec.toFixed(1)}s ` +
            `(${(transferred / 1048576 / transferSec).toFixed(1)} MB/s${resumable ? '' : ', no resumable copy'})`);

        // Measure, do not guess: the full page-by-page check takes ~36s on 479MB — far too long to
        // hold a reader in front of a bar that already reads 100%. What it guards against is a
        // storage layer that ran out mid-transfer and left holes, and the truncation that failure
        // actually produces is caught cheaply, before opening: a short file, or no suttas table at
        // all. So the cheap check gates the install and the full one runs afterwards, off the
        // critical path — if it does find something, the library is dropped and the page is told to
        // fall back to the server (see the `library-invalid` message app.js handles).
        const candidate = inspect(pool, target);
        if (!candidate.ok) {
            try { pool.unlink(target); } catch (_) {}
            throw Object.assign(new Error(`downloaded database unusable: ${candidate.reason}` +
                storageHint(plan)), { corrupt: true });
        }
        const cheapProblem = checkCheap(candidate.handle, manifest && manifest.bytes);
        if (cheapProblem) {
            candidate.handle.close();
            try { pool.unlink(target); } catch (_) {}
            throw Object.assign(new Error(`downloaded database is incomplete (${cheapProblem})` +
                storageHint(plan)), { corrupt: true });
        }
        if (db) { try { db.close(); } catch (_) {} db = null; }
        const tAdopt = Date.now();
        const suttas = adopt(candidate);
        console.log(`[dg-offline] opened ${suttas} suttas in ${((Date.now() - tAdopt) / 1000).toFixed(1)}s`);

        for (const name of stale) { try { pool.unlink(name); } catch (_) {} }
        // Now it is true.
        post({ type: 'progress', loaded: 1, total: 1, phase: 'download', done: true });
        scheduleFullCheck(pool, target);
        return { suttas, build_id: candidate.meta.build_id, langs: candidate.meta.langs || null,
                 downloaded: true, present: true };
    };

    for (let i = 0; i < modes.length; i++) {
        const resumable = modes[i] === 'resume';
        if (i > 0) {
            console.log('[dg-offline] retrying as a single file: the resumable copy is what ran the ' +
                'device out of room');
            post({ type: 'progress', loaded: 0, total: 0, phase: 'download',
                   reason: (typeof navigator !== 'undefined' ? '' : '') });
            try { pool.unlink(target); } catch (_) {}
            await dropScratchAfterCancel(scratchName);
        }
        try {
            return await runAttempt(resumable);
        } catch (e) {
            if (e && e.corrupt && resumable && i + 1 < modes.length) continue;
            throw e;
        }
    }
    throw new Error('download failed');
}

// The manifest is small and its absence is not an error: a device that is offline, or pointed at
// a server that publishes none, must still open the copy it already has.
function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Object.assign(new Error('timed out'), { name: 'AbortError' })), ms);
        promise.then(
            v => { clearTimeout(timer); resolve(v); },
            e => { clearTimeout(timer); reject(e); },
        );
    });
}

async function fetchManifest(distBase) {
    // Same silent-hang risk as the database itself (see readWithTimeout above), and for the same
    // reason not left to AbortController alone — it runs before the reader ever sees a progress
    // bar ('status' calls it just to decide whether to ask about a download at all), so a hang
    // here would mean nothing on screen, not just a stuck bar. A manifest is a few hundred bytes;
    // if it hasn't arrived in MANIFEST_TIMEOUT_MS it never will on this attempt, and its absence is
    // already a handled, non-fatal case.
    const controller = new AbortController();
    try {
        const response = await withTimeout(
            fetch(`${distBase}/db-manifest.json`, { cache: 'no-store', signal: controller.signal }),
            MANIFEST_TIMEOUT_MS);
        if (!response.ok) return null;
        return await withTimeout(response.json(), MANIFEST_TIMEOUT_MS);
    } catch (e) { return null; }
    finally { controller.abort(); }
}

// "Is there a library here at all?" answered WITHOUT loading sqlite-wasm: the pool directory is
// either empty or it is not. This matters more than it looks — the startup probe runs on every
// page load, and for the overwhelming majority of visitors, who never ask for the offline library,
// it must not cost an 865KB wasm fetch, a VFS installation and a manifest request. Those only
// happen once the answer is yes.
async function anyStoredFiles() {
    try {
        const root = await opfsRoot();
        const dir = await root.getDirectoryHandle(POOL_DIR);
        const opaque = await dir.getDirectoryHandle(OPAQUE_DIR);
        for await (const [, handle] of opaque) if (handle.kind === 'file') return true;
        return false;
    } catch (e) {
        return false; // no directory, or OPFS unavailable — either way there is nothing stored
    }
}

// allowDownload=false is the site's startup path: adopt what is stored, and when nothing usable is
// there, say so instead of turning a page load into a 170MB transfer (see point 1 of the header).
async function open(distBase, allowDownload, args) {
    const pool = await getPool();

    for (const name of storedDatabases(pool)) {
        const candidate = inspect(pool, name);
        if (!candidate.ok) {
            // Delete ONLY what is provably the wrong file: a copy missing its build id, or one this
            // build cannot read. An ambiguous failure (a lock, an I/O hiccup, the pool still waking
            // up) must never cost the reader the 479MB they downloaded — that is how a phone ended up
            // with "downloaded, but nothing works": the library was deleted by a transient error.
            const provablyBad = /incomplete download|schema \d+ !=/i.test(candidate.reason || '');
            console.log(`[dg-offline] ${name} was not adopted (${candidate.reason})${provablyBad ? ' — deleting it' : ' — keeping the file'}`);
            if (provablyBad) { try { pool.unlink(name); } catch (_) {} }
            continue;
        }
        // The scratch file is only a HINT that a download once stopped here, never proof that THIS
        // stored copy is the incomplete one: a failed attempt leaves one behind while a later attempt
        // completes the very same file — and then the page refused to open a perfectly good library
        // on every visit, offline dead, with settings honestly reading "Downloaded" (owner's phone).
        // So the file itself decides, cheaply, and a stale partial copy is cleaned up on the way
        // through. A genuinely incomplete copy fails the check and keeps its scratch for a resume.
        const scratchName = scratchNameFor(name);
        const partial = await partialBytes(scratchName);
        const problem = checkCheap(candidate.handle, null);
        if (problem) {
            console.log(`[dg-offline] ${name} is incomplete (${problem})` +
                (partial ? ` with ${Math.round(partial / 1048576)}MB of a partial download beside it` : '') +
                ` — not adopting it`);
            candidate.handle.close();
            continue;
        }
        if (partial) {
            console.log(`[dg-offline] ${name} is complete — dropping a stale partial copy ` +
                `(${Math.round(partial / 1048576)}MB)`);
            await dropScratchAfterCancel(scratchName);
        }
        const suttas = adopt(candidate);
        // `langs` comes straight from the file's own meta (build-mobile-db.js --langs): the page
        // decides from it which languages it can answer locally, instead of assuming ru+en.
        return { suttas, build_id: candidate.meta.build_id, langs: candidate.meta.langs || null,
                 downloaded: false, present: true };
    }
    if (!allowDownload) return { suttas: 0, build_id: null, downloaded: false, present: false };
    return fetchCurrent(pool, distBase, args);
}

// One operation per endpoint the shim intercepts. Each is the few lines dg-fastify.js's route
// does around the core — parameter defaults and nothing else. Response building stays in the
// core, which is the point.
const OPS = {
    async search({ q, scope = 'default', langs = 'ru,en', exact = false, lb = 0, la = 0, fast = false }) {
        const keyword = core.stripSearchPunctuation(q || '');
        const targetLangs = langs.split(',').map(l => l.trim());
        if (keyword.length < 3) {
            return {
                metadata: {
                    query: keyword, scope, resolvedPrefixes: core.resolveAllowedPrefixes(scope),
                    langs: targetLangs, totalFiles: 0, totalMatches: 0, hasVariantMatch: false, tooShort: true,
                },
                data: {}, wordReport: [], variantSegments: [],
            };
        }
        return fast
            ? core.buildFastResponse(keyword, scope, exact, targetLangs, lb, la)
            : core.buildSearchResponse(keyword, scope, exact, targetLangs, lb, la);
    },

    // Mirrors dg-fastify.js's /search/enrich route step for step. It is more than "enrich the
    // ids": the skeleton is rebuilt restricted to those ids first, because that is what decides
    // which segments matched, and the word report is the slow, exact one — by this point
    // unique_words are already computed, so it costs nothing and agrees with the full /search.
    async enrich({ q, ids, langs = 'ru,en', scope = 'default', exact = false, lb = 0, la = 0 }) {
        const keyword = core.stripSearchPunctuation(q || '');
        const targetLangs = langs.split(',').map(l => l.trim());
        const requestedIds = (ids || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!keyword) return { __status: 400, error: 'Parameter "q" is mandatory.' };
        if (!requestedIds.length) return { __status: 400, error: 'Parameter "ids" is mandatory.' };
        if (keyword.length < 3) return { data: {}, variantSegments: [] };

        const { searchResults, empty } = await core.buildMatchSkeleton(
            keyword, scope, exact, targetLangs, lb, la, requestedIds);
        const suttaIds = Object.keys(searchResults);
        if (empty || suttaIds.length === 0) return { data: {}, variantSegments: [] };

        await core.enrichSuttaBatch(searchResults, suttaIds, targetLangs, keyword, scope, lb, la);
        const sortedData = core.sortSuttaResults(searchResults);
        let totalMatches = 0;
        for (const id of suttaIds) totalMatches += sortedData[id].count;
        const variantSegments = await core.findVariantSegments(keyword, exact);
        return {
            data: sortedData,
            wordReport: core.buildWordReport(searchResults),
            metadata: {
                query: keyword, scope, resolvedPrefixes: core.resolveAllowedPrefixes(scope),
                langs: targetLangs, lb, la, exactMatch: exact,
                totalFiles: suttaIds.length, totalMatches, hasVariantMatch: variantSegments.length > 0,
            },
            variantSegments,
        };
    },

    // Mirrors dg-fastify.js's /api/text route. Two things here are easy to get wrong and were:
    // the columns come from ?langs/?lang, NOT from the mode's `columns` — a mode only supplies
    // multiFor, and only when ?lang is given too; and a language with no translation at all falls
    // back to English, which changes the columns it reports.
    async text({ suttaId, mode, langs, lang, translators, multiFor }) {
        const modeConfig = mode ? core.MODE_TABLE[mode] : null;
        const targetLangs = langs ? langs.split(',').map(l => l.trim())
            : lang ? [lang]
            : ['ru', 'en'];
        const explicitTranslators = translators ? translators.split(',').map(t => t.trim()) : null;
        const multiForLangs = (modeConfig && modeConfig.multiFor && lang) ? [lang]
            : (multiFor ? multiFor.split(',').map(l => l.trim()) : null);

        const base = await core.getSuttaBaseData(suttaId);
        if (!base) return { __status: 404, error: `Unknown sutta id: ${suttaId}` };
        let data = await core.buildTextDataFromBase(base, suttaId, targetLangs, explicitTranslators, multiForLangs);
        let effectiveLangs = targetLangs;

        const hasAnyTranslation = data.segments.some(seg => Object.keys(seg.translations).length > 0);
        if (!modeConfig && !hasAnyTranslation && !targetLangs.includes('en') && !explicitTranslators) {
            const fallbackData = await core.buildTextDataFromBase(base, suttaId, ['en'], null, multiForLangs);
            const fallbackHasTranslation = fallbackData &&
                fallbackData.segments.some(seg => Object.keys(seg.translations).length > 0);
            if (fallbackHasTranslation) {
                data = fallbackData;
                effectiveLangs = targetLangs.concat(['en']);
            }
        }
        data.columns = effectiveLangs;
        data.lang = lang || effectiveLangs[0] || null;
        // Languages THIS text has a translation in, answering the same query dg-fastify.js's route
        // does (see the comment there: the reader's language popover greys out the rest at load
        // time). What it means here is "in the offline slice": the server reads the whole corpus and
        // can name more (dn22 has sr and de as well), those are languages this library does not
        // have, and app.js sends a request for them to the server whenever there is a connection.
        data.availableLangs = db.selectObjects(
            "SELECT DISTINCT lang FROM texts WHERE sutta_id = ? AND kind = 'translation'", [suttaId]
        ).map(r => r.lang);
        return data;
    },

    async nav({ suttaId, scope }) {
        const nav = core.navFor(suttaId, scope);
        return nav || { __status: 404, error: `Unknown sutta id: ${suttaId}` };
    },
};

self.onmessage = async (event) => {
    const { id, op, args } = event.data || {};

    // Answerable before the database is opened, and deliberately so: the page needs to know
    // whether a download is coming before it asks the reader about it.
    if (op === 'status') {
        try {
            // Cheap path first: nothing stored is the common case, and it must cost nothing.
            if (!(await anyStoredFiles())) {
                const partialBytes = await partialBytesAny();
                post({ id, ok: true, result: { present: false, partialBytes, bytes: null, build_id: null, langs: null } });
                return;
            }
            // Reported in BOTH branches: with only a half-imported pool file on disk (a download
            // interrupted by a reload) the stored file is rejected below, and this figure is the
            // only thing that tells the page there is something to continue.
            const partialBytes = await partialBytesAny();
            const pool = await getPool();
            const present = storedDatabases(pool).length > 0;
            // The manifest is fetched before the reader is asked about a download, so that the
            // question can name the real size instead of a number compiled in months ago. Callers
            // that never ask that question (the site: its button is the consent) pass
            // wantManifest:false and save the request.
            const wantManifest = !args || args.wantManifest !== false;
            const manifest = (present || !wantManifest) ? null : await fetchManifest(args && args.distBase);
            post({ id, ok: true, result: {
                present,
                // With a working library present there is nothing to continue (an interrupted UPDATE
                // leaves the old copy in place and usable), so the figure only matters otherwise.
                partialBytes: present ? 0 : partialBytes,
                // The consent dialog states what actually crosses the connection, not the size on
                // disk afterward — for a gzipped manifest those are no longer the same number.
                bytes: manifest ? (manifest.bytes_gz || manifest.bytes) : null,
                build_id: manifest ? manifest.build_id : null,
                langs: manifest ? manifest.langs : null,
            } });
        } catch (e) { post({ id, ok: false, error: e.message }); }
        return;
    }

    // "Is there anything new for me?" — one small JSON fetch, compared against the build the open
    // database records. It only reports; replacing 170MB is the reader's decision, not a
    // background one, so nothing is downloaded here. Answering false while offline is correct.
    if (op === 'check') {
        try {
            if (!db) throw new Error('database not opened');
            const local = db.selectObject("SELECT value FROM meta WHERE key = 'build_id'");
            const manifest = await fetchManifest(args.distBase);
            post({ id, ok: true, result: manifest ? {
                current: manifest.build_id === (local && local.value),
                build_id: manifest.build_id,
                bytes: manifest.bytes_gz || manifest.bytes,
                built_at: manifest.built_at,
                schema_supported: Number(manifest.schema_version) === SCHEMA_VERSION,
            } : { unknown: true } });
        } catch (e) { post({ id, ok: false, error: e.message }); }
        return;
    }

    if (op === 'update') {
        try {
            const pool = await getPool();
            post({ id, ok: true, result: await fetchCurrent(pool, args.distBase) });
        } catch (e) { post({ id, ok: false, error: e.message }); }
        return;
    }

    if (op === 'open') {
        const distBase = args && args.distBase;
        // `download: false` (the site's startup probe) must never be memoised when it comes back
        // empty: the reader may press Download a second later, and that call needs a real attempt,
        // not this empty answer replayed from `ready`.
        if (args && args.download === false) {
            try {
                // A successful ADOPTION is memoised exactly like a download — without this the worker
                // forgot the database it had just opened, and every later data request died with
                // "database not opened" while the page believed it was offline-ready: settings said
                // "Working offline", and the site's own search said "check your query (invalid regular
                // expression)". Direct fetches looked fine only because they happened in the page that
                // had done the download (which does set `ready`). Owner's Opera, reproduced here.
                const result = await (ready = ready || open(distBase, false, args || {}));
                if (result && result.present === false) ready = null;
                post({ id, ok: true, result });
            } catch (e) { ready = null; post({ id, ok: false, error: e.message }); }
            return;
        }
        ready = ready || open(distBase, true, args || {});
        try { post({ id, ok: true, result: await ready }); }
        catch (e) { ready = null; post({ id, ok: false, error: e.message }); }
        return;
    }

    // Stop an in-flight download. Unsolicited by the page's own flow — the card's × — so it answers
    // immediately and does not touch `ready`: the rejecting `open` call already does that.
    if (op === 'abort') {
        cancelRequested = true;
        try { if (activeAbort) activeAbort.abort(); } catch (_) {}
        console.log('[dg-offline] download cancelled by the reader');
        post({ id, ok: true, result: { cancelled: true } });
        return;
    }

    // "Remove the offline library": back to the server-backed site with no reinstall. The scratch
    // partial (if any) goes too — it belongs to a build nobody is downloading any more.
    if (op === 'delete') {
        try {
            const pool = await getPool();
            if (db) { try { db.close(); } catch (_) {} db = null; }
            ready = null;
            let deleted = 0;
            for (const name of storedDatabases(pool)) {
                try { pool.unlink(name); deleted++; } catch (_) {}
            }
            await cleanScratchExcept(null);
            post({ id, ok: true, result: { deleted } });
        } catch (e) { post({ id, ok: false, error: e.message }); }
        return;
    }

    try {
        if (!ready) throw new Error('database not opened');
        await ready;
        const handler = OPS[op];
        if (!handler) throw new Error(`unknown op: ${op}`);
        post({ id, ok: true, result: await handler(args || {}) });
    } catch (e) {
        post({ id, ok: false, error: e.message });
    }
};
