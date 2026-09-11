#!/usr/bin/env node
// End-to-end check of the optional offline PWA layer, against THIS repo's own server and its own
// search core (docs/OFFLINE_PWA_PLAN.md, Stage 1). It answers the one question that matters:
// with an offline library installed, does the site return the same answers as the server — and
// does it still work with the network switched off?
//
// What it does, in order:
//   1. State 1 (no library): the page must NOT intercept anything. `dgOfflineDiagnostics()` says
//      "server", no worker is started, and a reload with no library must not begin a download.
//   2. Opt-in: the settings page's button only records an intent in localStorage; this test sets
//      that same intent and reloads, then waits for window.dgOfflineReady — a real 170MB download
//      into OPFS through the real worker.
//   3. Parity: every request in CASES is fetched TWICE — once through the page (local SQLite) and
//      once through Playwright's request context (the real server, no page JS, so no shim) — and
//      the two responses must be byte-identical JSON. This is the requirement from CLAUDE.md: the
//      answer must not depend on which backend produced it.
//   4. Offline: the network is switched off and a pushState URL (/dn22:2.2) is reloaded, which is
//      the case that only works when the service worker precached the shell and falls back to it
//      for navigations.
//
// Requirements:
//   - a built database slice in .offline-test/ (gitignored):
//       cd /var/www/dg-app-full && DG_NODE_PATH=<this repo> node build-app-db.js \
//           --from=<this repo>/dg.db --langs=ru,en --out=<this repo>/.offline-test/dg-mobile.db
//   - Chrome (DG_CHROMIUM, default /usr/bin/google-chrome) and playwright-core
//     (DG_PLAYWRIGHT, default the dg-app-full checkout).
//
// Usage: node test/offline-e2e.js     [PORT=3123]

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PLAYWRIGHT = process.env.DG_PLAYWRIGHT || '/var/www/dg-app-full/node_modules/playwright-core';
const BROWSER = process.env.DG_CHROMIUM || '/usr/bin/google-chrome';
const PORT = Number(process.env.PORT) || 3123;
const BASE = `http://127.0.0.1:${PORT}`;
const FIXTURE_DIR = process.env.OFFLINE_TEST_DIR || path.join(ROOT, '.offline-test');
const MOBILE_DATA = path.join(ROOT, 'siteroot', 'mobile-data');

let chromium;
try { ({ chromium } = require(PLAYWRIGHT)); }
catch (e) {
    console.error(`playwright-core not found at ${PLAYWRIGHT} — set DG_PLAYWRIGHT`);
    process.exit(1);
}

// The same request matrix the app's own e2e uses: every route the shim takes over, plus the ones
// it deliberately does not (unknown sutta, too-short query).
const CASES = [
    ['search-kacchapa', '/search?q=kacchapa&langs=ru,en'],
    ['search-kacchapa-fast', '/search?q=kacchapa&langs=ru,en&fast=1'],
    ['search-kacchapa-exact', '/search?q=kacchapa&langs=ru,en&exact=true'],
    ['search-context', '/search?q=kacchapa&langs=ru,en&lb=1&la=2'],
    ['search-scope-dhamma', '/search?q=kacchapa&langs=ru,en&scope=dhamma'],
    ['search-scope-vinaya', '/search?q=kacchapa&langs=ru,en&scope=vinaya'],
    ['search-russian', '/search?q=%D1%87%D0%B5%D1%80%D0%B5%D0%BF%D0%B0%D1%85%D0%B0&langs=ru,en'],
    ['search-punctuation', '/search?q=%C2%AB%D1%87%D0%B5%D1%80%D0%B5%D0%BF%D0%B0%D1%85%D0%B0%C2%BB,&langs=ru,en'],
    ['search-diacritics', '/search?q=kacchap%C4%81na%E1%B9%81&langs=ru,en'],
    ['search-no-diacritics', '/search?q=kacchapanam&langs=ru,en'],
    ['search-too-short', '/search?q=ka&langs=ru,en'],
    ['search-no-hits', '/search?q=zzzzzz&langs=ru,en'],
    ['enrich-dn22', '/search/enrich?q=kacchapa&ids=dn22&langs=ru,en'],
    ['text-dn22-st', '/api/text/dn22?mode=st'],
    ['text-dn22-mt', '/api/text/dn22?mode=mt'],
    ['text-dn22-ml', '/api/text/dn22?mode=ml'],
    ['text-dn22-read', '/api/text/dn22?mode=read'],
    ['text-dn22-ee', '/api/text/dn22?mode=ee'],
    ['text-explicit-translators', '/api/text/dn22?translators=ru_o,ru_sv'],
    ['text-unknown', '/api/text/nosuchsutta'],
    ['nav-dn22', '/api/nav/dn22'],
    ['nav-sn56.11', '/api/nav/sn56.11'],
];

function fail(msg) {
    console.error(`\nFAILED: ${msg}`);
    process.exit(1);
}

// ---------------------------------------------------------------------------------------------
// Reference: the SAME bundled core, over the server's own dg.db, running in Node. The offline
// layer is a snapshot of dg.db, so this — not a grep-based HTTP route — is what its answers are
// defined against. The ops mirrored here are db-worker.js's OPS, verbatim in behaviour; if that
// worker changes shape, this file stops agreeing with it and says so, which is the point.
// ---------------------------------------------------------------------------------------------

const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('url');

let referenceDb = null;

async function loadReference() {
    const mod = await import(pathToFileURL(path.join(ROOT, 'public', 'offline', 'core-bundle.js')).href);
    const core = mod.default;
    const db = new DatabaseSync(path.join(ROOT, 'dg.db'), { readOnly: true });
    referenceDb = db;
    core.init({
        searchDb: {
            prepare: (sql) => ({ all: (...p) => db.prepare(sql).all(...p), get: (...p) => db.prepare(sql).get(...p) }),
            function: () => {},
        },
        DG_OFFLINE: '/offline-data/dhammagift',
    });
    const skeleton = {};
    for (const r of db.prepare('SELECT id, category, dir_path, title, mr FROM suttas').all()) {
        skeleton[r.id] = { category: r.category, dir_path: r.dir_path, title: r.title, mr: r.mr };
    }
    core.setSkeleton(skeleton);
    return core;
}

function stripStatus(result) {
    if (!result || !result.__status) return result;
    const body = {};
    for (const k of Object.keys(result)) if (k !== '__status') body[k] = result[k];
    return body;
}

async function referenceAnswer(core, url) {
    const u = new URL(url, 'http://x');
    const p = u.pathname;
    const qs = u.searchParams;
    const wrap = (result) => result && result.__status
        ? { status: result.__status, body: stripStatus(result) }
        : { status: 200, body: result };

    if (p === '/search/enrich') {
        const keyword = core.stripSearchPunctuation(qs.get('q') || '');
        const targetLangs = (qs.get('langs') || 'ru,en').split(',').map((s) => s.trim());
        const requestedIds = (qs.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (!keyword) return wrap({ __status: 400, error: 'Parameter "q" is mandatory.' });
        if (!requestedIds.length) return wrap({ __status: 400, error: 'Parameter "ids" is mandatory.' });
        if (keyword.length < 3) return wrap({ data: {}, variantSegments: [] });
        const scope = qs.get('scope') || 'default';
        const exact = qs.get('exact') === 'true';
        const lb = parseInt(qs.get('lb'), 10) || 0, la = parseInt(qs.get('la'), 10) || 0;
        const { searchResults, empty } = await core.buildMatchSkeleton(keyword, scope, exact, targetLangs, lb, la, requestedIds);
        const suttaIds = Object.keys(searchResults);
        if (empty || suttaIds.length === 0) return wrap({ data: {}, variantSegments: [] });
        await core.enrichSuttaBatch(searchResults, suttaIds, targetLangs, keyword, scope, lb, la);
        const sortedData = core.sortSuttaResults(searchResults);
        let totalMatches = 0;
        for (const id of suttaIds) totalMatches += sortedData[id].count;
        const variantSegments = await core.findVariantSegments(keyword, exact);
        return wrap({
            data: sortedData,
            wordReport: core.buildWordReport(searchResults),
            metadata: {
                query: keyword, scope, resolvedPrefixes: core.resolveAllowedPrefixes(scope),
                langs: targetLangs, lb, la, exactMatch: exact,
                totalFiles: suttaIds.length, totalMatches, hasVariantMatch: variantSegments.length > 0,
            },
            variantSegments,
        });
    }

    if (p.startsWith('/api/text/')) {
        const suttaId = decodeURIComponent(p.slice('/api/text/'.length)).toLowerCase();
        const mode = qs.get('mode'), langs = qs.get('langs'), lang = qs.get('lang');
        const translators = qs.get('translators'), multiFor = qs.get('multiFor');
        const modeConfig = mode ? core.MODE_TABLE[mode] : null;
        const targetLangs = langs ? langs.split(',').map((s) => s.trim())
            : lang ? [lang] : ['ru', 'en'];
        const explicitTranslators = translators ? translators.split(',').map((s) => s.trim()) : null;
        const multiForLangs = (modeConfig && modeConfig.multiFor && lang) ? [lang]
            : (multiFor ? multiFor.split(',').map((s) => s.trim()) : null);
        const base = await core.getSuttaBaseData(suttaId);
        if (!base) return wrap({ __status: 404, error: `Unknown sutta id: ${suttaId}` });
        let data = await core.buildTextDataFromBase(base, suttaId, targetLangs, explicitTranslators, multiForLangs);
        let effectiveLangs = targetLangs;
        const hasAnyTranslation = data.segments.some((seg) => Object.keys(seg.translations).length > 0);
        if (!modeConfig && !hasAnyTranslation && !targetLangs.includes('en') && !explicitTranslators) {
            const fallback = await core.buildTextDataFromBase(base, suttaId, ['en'], null, multiForLangs);
            const fallbackHas = fallback && fallback.segments.some((seg) => Object.keys(seg.translations).length > 0);
            if (fallbackHas) { data = fallback; effectiveLangs = targetLangs.concat(['en']); }
        }
        data.columns = effectiveLangs;
        data.lang = lang || effectiveLangs[0] || null;
        data.availableLangs = referenceDb.prepare(
            "SELECT DISTINCT lang FROM texts WHERE sutta_id = ? AND kind = 'translation'").all(suttaId).map((r) => r.lang);
        return wrap(data);
    }

    if (p.startsWith('/api/nav/')) {
        const suttaId = decodeURIComponent(p.slice('/api/nav/'.length)).toLowerCase();
        const nav = core.navFor(suttaId, qs.get('scope'));
        return wrap(nav || { __status: 404, error: `Unknown sutta id: ${suttaId}` });
    }

    // /search and /search/<keyword>
    const keyword = core.stripSearchPunctuation(p === '/search' ? (qs.get('q') || '') : decodeURIComponent(p.slice('/search/'.length)));
    const scope = qs.get('scope') || 'default';
    const targetLangs = (qs.get('langs') || 'ru,en').split(',').map((s) => s.trim());
    const exact = qs.get('exact') === 'true';
    const lb = parseInt(qs.get('lb'), 10) || 0, la = parseInt(qs.get('la'), 10) || 0;
    if (keyword.length < 3) {
        return wrap({
            metadata: {
                query: keyword, scope, resolvedPrefixes: core.resolveAllowedPrefixes(scope),
                langs: targetLangs, totalFiles: 0, totalMatches: 0, hasVariantMatch: false, tooShort: true,
            },
            data: {}, wordReport: [], variantSegments: [],
        });
    }
    return wrap(qs.get('fast') === '1'
        ? await core.buildFastResponse(keyword, scope, exact, targetLangs, lb, la)
        : await core.buildSearchResponse(keyword, scope, exact, targetLangs, lb, la));
}

function requireFixture() {
    const db = path.join(FIXTURE_DIR, 'dg-mobile.db');
    const manifest = path.join(FIXTURE_DIR, 'db-manifest.json');
    if (!fs.existsSync(db) || !fs.existsSync(manifest)) {
        fail(`no database slice in ${FIXTURE_DIR}.\nBuild one first (from this repository):\n` +
            `  npm run build-search-db\n` +
            `  node build-mobile-db.js --source=${ROOT}/dg.db --langs=ru,en --out=${FIXTURE_DIR}`);
    }
    return JSON.parse(fs.readFileSync(manifest, 'utf8'));
}

// The server publishes /mobile-data from siteroot/ (in production that is a symlink to the built
// artifact directory). In a fresh checkout the entry does not exist at all, so the test creates it
// for its own run and removes it again — nothing is left behind for git to notice.
function linkMobileData() {
    if (fs.existsSync(MOBILE_DATA)) return false;
    fs.symlinkSync(path.relative(path.dirname(MOBILE_DATA), FIXTURE_DIR), MOBILE_DATA, 'dir');
    return true;
}

function unlinkMobileData(created) {
    if (!created) return;
    try { fs.unlinkSync(MOBILE_DATA); } catch (e) { /* already gone */ }
}

async function waitForServer(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const r = await fetch(`${BASE}/`, { method: 'GET' });
            if (r.ok) return;
        } catch (e) { /* not up yet */ }
        await new Promise(r => setTimeout(r, 300));
    }
    throw new Error(`server did not answer on ${BASE} within ${timeoutMs / 1000}s`);
}

// Order-insensitive comparison for object keys (arrays keep their order — segment order is part
// of the answer). The server and the worker build the same object by different routes, and JSON
// key insertion order is not part of the API.
function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
        const out = {};
        for (const k of Object.keys(value).sort()) out[k] = canonical(value[k]);
        return out;
    }
    return value;
}
const J = (value) => JSON.stringify(canonical(value));

// availableLangs is the one field the offline library cannot reproduce exactly, by design: it
// answers from its own ru+en slice, while the server reads the whole corpus (dn22 has sr and de
// too). Everything else is compared strictly; this one is checked as a SUBSET — a language the
// library claims but the server does not have would still be a bug.
function withoutAvailableLangs(body) {
    if (!body || !Array.isArray(body.segments)) return body;
    const copy = Object.assign({}, body);
    delete copy.availableLangs;
    return copy;
}
function availableLangsOf(body) {
    return (body && Array.isArray(body.availableLangs)) ? body.availableLangs.slice().sort() : null;
}
function subsetProblem(localBody, serverBody) {
    const l = availableLangsOf(localBody), sr = availableLangsOf(serverBody);
    if (!l || !sr) return null;
    const extra = l.filter((x) => !sr.includes(x));
    return extra.length ? `availableLangs not a subset of the server's: ${extra.join(',')}` : null;
}

(async () => {
    const manifest = requireFixture();
    console.log(`fixture: ${path.relative(ROOT, FIXTURE_DIR)} (build ${manifest.build_id}, ` +
        `${(manifest.bytes / 1048576).toFixed(1)}MB)`);

    const profileDir = path.join(FIXTURE_DIR, 'chrome-profile');
    const linked = linkMobileData();
    const serverLog = [];
    // dg-fastify.js by default: it is the server that actually answers /search from core/search-core.js
    // over dg.db — the one whose answers the offline layer must match, and the one running in
    // production (:3000). dg-light.js still answers /search from the legacy grep path, so starting IT
    // would compare the offline library against an implementation the site no longer uses. Override
    // with DG_SERVER_FILE when checking that migration instead.
    const serverFile = process.env.DG_SERVER_FILE || 'dg-fastify.js';
    const server = spawn(process.execPath, [serverFile], {
        cwd: ROOT,
        env: Object.assign({}, process.env, { PORT: String(PORT) }),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', d => serverLog.push(String(d)));
    server.stderr.on('data', d => serverLog.push(String(d)));

    let browser = null;
    let context = null;
    const created = { linked };
    const cleanup = () => {
        if (browser) browser.close().catch(() => {});
        server.kill('SIGTERM');
        unlinkMobileData(created.linked);
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) { /* still flushing */ }
    };
    process.on('exit', cleanup);

    try {
        await waitForServer(60000);
        console.log(`server:  ${BASE}`);

        // A PERSISTENT profile, not an anonymous context. Chrome hands an ephemeral context a
        // nominal 1GiB quota and then starts failing writes with FILE_ERROR_NO_SPACE a few hundred
        // megabytes in (measured while building this: raw OPFS writes broke at ~230MB, quota
        // reported as 1GiB), and sqlite-wasm's importDb does not check those short writes — so an
        // ephemeral context turns this test into a check of Playwright's profile layout rather than
        // of the offline layer. A real reader's browser is disk-backed; this reproduces that, and
        // the profile lives in the gitignored .offline-test and is wiped before every run.
        // Chrome's profile holds the whole downloaded library in OPFS — ~500MB on this slice — so it
        // is wiped before AND removed after the run: a handful of forgotten profiles is several GB,
        // which is enough to fill a small disk (measured the hard way).
        fs.rmSync(profileDir, { recursive: true, force: true });
        context = await chromium.launchPersistentContext(profileDir, {
            executablePath: BROWSER,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        });
        browser = context;
        const page = await context.newPage();
        await page.addInitScript(() => { window.DG_DIST_BASE = '/mobile-data'; });

        const errors = [];
        page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 300)));
        page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });

        // ---- 1. state 1: nothing downloaded, nothing intercepted -----------------------------
        await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.evaluate(() => window.dgOfflineReady);
        const idle = await page.evaluate(() => window.dgOfflineDiagnostics());
        const state = await page.evaluate(() => JSON.parse(localStorage.getItem('dg.offline.state') || 'null'));
        console.log(`state 1 (no library): diagnostics=${JSON.stringify(idle)} state=${JSON.stringify(state)}`);
        if (idle.mode !== 'server') fail('page intercepted data with no offline library installed');
        if (state && state.present) fail('state says a library is present, but nothing was downloaded');
        if (errors.length) fail('page errors before any download:\n  ' + errors.join('\n  '));

        // ---- 2. opt-in: the settings button's intent, then a real download -------------------
        await page.evaluate(() => localStorage.setItem('dg.offline.wantData', '1'));
        const t0 = Date.now();
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
        const downloaded = await page.evaluate(async () => {
            try { return { ok: true, result: await window.dgOfflineReady }; }
            catch (e) { return { ok: false, error: e.message }; }
        });
        console.log(`download (${((Date.now() - t0) / 1000).toFixed(1)}s) -> ${JSON.stringify(downloaded)}`);
        if (!downloaded.ok) {
            console.log(serverLog.join(''));
            fail('the opt-in download did not complete: ' + downloaded.error);
        }
        const after = await page.evaluate(() => ({
            diag: window.dgOfflineDiagnostics(),
            state: JSON.parse(localStorage.getItem('dg.offline.state') || 'null'),
        }));
        console.log(`state 3 (library + network): diagnostics=${JSON.stringify(after.diag)} ` +
            `state=${JSON.stringify(after.state)}`);
        if (after.diag.mode !== 'local') fail('after the download the page is still server-backed');
        if (!after.state || !after.state.present) fail('settings state does not report the library as present');
        if (after.state.build_id !== manifest.build_id) {
            fail(`settings state build_id ${after.state.build_id} != published ${manifest.build_id}`);
        }

        // ---- 3. parity: the browser's answers vs the SAME core over the SAME data -------------
        //
        // The reference is dg.db itself, run through the same bundled core in Node — because that
        // is what the offline slice is a snapshot OF, and therefore what its answers are defined
        // against. It is deliberately NOT the running dev server: on this branch /search answers
        // from a grep path that currently disagrees with dg.db (scope=dhamma: 3 suttas against 5
        // in dg.db and on prod; exact=true: 0 against 1) — a server-side matter, so the server is
        // compared afterwards for INFORMATION and does not decide this test's verdict.
        const core = await loadReference();
        let same = 0;
        const differing = [];
        for (const [name, url] of CASES) {
            const local = await page.evaluate(async (u) => {
                const r = await fetch(u);
                let body; try { body = await r.json(); } catch (e) { body = { __nonJson: true }; }
                return { status: r.status, body };
            }, url);
            const reference = await referenceAnswer(core, url);

            const a = J({ status: reference.status, body: withoutAvailableLangs(reference.body) });
            const b = J({ status: local.status, body: withoutAvailableLangs(local.body) });
            const subset = subsetProblem(local.body, reference.body);
            if (a === b && !subset) { same++; console.log('SAME  ' + name); }
            else {
                differing.push(name);
                console.log('DIFF  ' + name + (subset ? ' (' + subset + ')' : ''));
                console.log('   dg.db: ' + a.slice(0, 300));
                console.log('   local: ' + b.slice(0, 300));
            }
        }
        console.log(`\n${same}/${CASES.length} identical to the same core over dg.db` +
            (differing.length ? `; differing: ${differing.join(', ')}` : ''));

        // Informational only (see above). page.request bypasses the page's own JS, so this is the
        // server's answer with no shim in the way.
        const serverDiff = [];
        for (const [name, url] of CASES) {
            const local = await page.evaluate(async (u) => {
                const r = await fetch(u);
                let body; try { body = await r.json(); } catch (e) { body = { __nonJson: true }; }
                return { status: r.status, body };
            }, url);
            const res = await page.request.get(BASE + url);
            let body; try { body = await res.json(); } catch (e) { body = { __nonJson: true }; }
            const subset = subsetProblem(local.body, body);
            if (J({ status: res.status(), body: withoutAvailableLangs(body) }) !==
                J({ status: local.status, body: withoutAvailableLangs(local.body) }) || subset) {
                serverDiff.push(name + (subset ? ' (' + subset + ')' : ''));
            }
        }
        console.log(`${serverFile}: agrees on ${CASES.length - serverDiff.length}/${CASES.length}` +
            (serverDiff.length ? `; differs on: ${serverDiff.join(', ')}` : ''));
        // Against the real server (dg-fastify, core over dg.db) a difference IS a failure. The
        // escape hatch exists for the one legitimate case: pointing DG_SERVER_FILE at dg-light.js to
        // measure its legacy grep path on purpose.
        if (serverDiff.length && process.env.DG_ALLOW_SERVER_DIFF !== '1') {
            fail(`${serverFile} does not agree with the offline library: ${serverDiff.join(', ')} ` +
                `(set DG_ALLOW_SERVER_DIFF=1 to compare against a server that is not the reference)`);
        }

        // ---- 4. offline: pushState URL + local data with the network off ----------------------
        await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.evaluate(() => window.dgOfflineReady);
        // The SW registers on 'load'; give it a moment to activate and claim this page.
        await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null,
            { timeout: 30000 }).catch(() => {});

        await context.setOffline(true);
        let offlineOk = false;
        let offlineNote = '';
        try {
            const res = await page.goto(`${BASE}/dn22:2.2`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const text = await page.evaluate(async () => {
                // /search is the one the READER uses (the reader links and the search box), and a page
                // that adopted an installed library used to answer it with "database not opened" — so
                // both routes are checked here, on a page that did NOT do the downloading.
                const s = await fetch('/search?q=kacchapa&langs=ru,en');
                const sj = await s.json();
                const r = await fetch('/api/text/dn22?mode=st');
                const j = await r.json();
                return { status: r.status, segments: (j.segments || []).length,
                         searchStatus: s.status, searchFiles: (sj.metadata || {}).totalFiles };
            });
            offlineOk = !!res && res.status() === 200 && text.status === 200 && text.segments > 0 &&
                       text.searchStatus === 200 && text.searchFiles > 0;
            offlineNote = `navigation ${res && res.status()}, /api/text/dn22 -> ${JSON.stringify(text)}`;
        } catch (e) {
            offlineNote = 'threw: ' + e.message;
        }
        console.log((offlineOk ? 'SAME  ' : 'DIFF  ') + `offline reload of /dn22:2.2 — ${offlineNote}`);
        await context.setOffline(false);

        if (errors.length) console.log('\npage errors:\n  ' + errors.slice(0, 8).join('\n  '));

        const failed = differing.length > 0 || !offlineOk;
        console.log(failed ? '\nOFFLINE E2E FAILED' : '\nOFFLINE E2E OK');
        cleanup();
        process.exit(failed ? 1 : 0);
    } catch (e) {
        console.log(serverLog.join(''));
        cleanup();
        fail(e.message);
    }
})();
