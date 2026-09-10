#!/usr/bin/env node
// Bundle parity: does the core we ship to the browser (public/offline/core-bundle.js, built by
// build-offline.js) answer exactly like the source core the server runs (core/search-core.js)?
//
// This is dg-node's own equivalent of dg-app-full's `npm run test-parity`. That one diffs the app's
// bundle against snapshots of the live site; here the source of truth is the source itself, over
// the same dg.db, which is what makes this test independent of any running server and of the
// corpus files' state.
//
// What it catches: the three substitutions build-offline.js makes (config JSON inlined, READER_LANGS
// scanned at build time, module.exports -> a global), the path shim's join-only promise, and any
// drift between the two copies of the core.
//
// Usage: node test/offline-parity.js

const path = require('path');
const { pathToFileURL } = require('url');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = process.env.OFFLINE_PARITY_DB || path.join(ROOT, 'dg.db');
const BUNDLE = path.join(ROOT, 'public', 'offline', 'core-bundle.js');

function fail(msg) {
    console.error(`\nFAILED: ${msg}`);
    process.exit(1);
}

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

function initWith(dbPath, core) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    core.init({
        searchDb: {
            prepare: (sql) => ({ all: (...p) => db.prepare(sql).all(...p), get: (...p) => db.prepare(sql).get(...p) }),
            function: () => {},
        },
        DG_OFFLINE: path.join(ROOT, 'siteroot', 'data', 'dhammagift', 'translation'),
    });
    const skeleton = {};
    for (const r of db.prepare('SELECT id, category, dir_path, title, mr FROM suttas').all()) {
        skeleton[r.id] = { category: r.category, dir_path: r.dir_path, title: r.title, mr: r.mr };
    }
    core.setSkeleton(skeleton);
    return core;
}

// Each entry: a name and something the two cores run. Kept as data so a failure names the call.
const CASES = [
    ['configs: MODE_TABLE', (c) => c.MODE_TABLE],
    ['configs: READER_LANGS', (c) => c.READER_LANGS],
    ['stripSearchPunctuation', (c) => c.stripSearchPunctuation('«kacchapa»,')],
    ['resolveAllowedPrefixes(default)', (c) => c.resolveAllowedPrefixes('default')],
    ['resolveAllowedPrefixes(vinaya)', (c) => c.resolveAllowedPrefixes('vinaya')],
    ['search fast=1', (c) => c.buildFastResponse('kacchapa', 'default', false, ['ru', 'en'], 0, 0)],
    ['search full', (c) => c.buildSearchResponse('kacchapa', 'default', false, ['ru', 'en'], 0, 0)],
    ['search exact', (c) => c.buildFastResponse('kacchapa', 'dhamma', true, ['ru', 'en'], 0, 0)],
    ['search russian', (c) => c.buildFastResponse('черепаха', 'default', false, ['ru', 'en'], 1, 2)],
    ['search too short', (c) => c.buildFastResponse('ka', 'default', false, ['ru', 'en'], 0, 0)],
    ['nav dn22', (c) => c.navFor('dn22', 'dhamma')],
    ['text dn22 st', async (c) => {
        const base = await c.getSuttaBaseData('dn22');
        const data = await c.buildTextDataFromBase(base, 'dn22', ['ru', 'en'], null, null);
        data.columns = ['ru', 'en'];
        data.lang = 'ru';
        return data;
    }],
    ['text dn22 explicit translators', async (c) => {
        const base = await c.getSuttaBaseData('dn22');
        const data = await c.buildTextDataFromBase(base, 'dn22', ['ru'], ['ru_o', 'ru_sv'], ['ru']);
        data.columns = ['ru'];
        data.lang = 'ru';
        return data;
    }],
    ['enrich dn1', async (c) => {
        const { searchResults, empty } = await c.buildMatchSkeleton('kacchapa', 'default', false, ['ru', 'en'], 0, 0, ['dn1']);
        const ids = Object.keys(searchResults);
        if (empty || !ids.length) return { data: {}, variantSegments: [] };
        await c.enrichSuttaBatch(searchResults, ids, ['ru', 'en'], 'kacchapa', 'default', 0, 0);
        return { data: c.sortSuttaResults(searchResults), wordReport: c.buildWordReport(searchResults) };
    }],
];

(async () => {
    if (!require('fs').existsSync(DB_PATH)) {
        fail(`${DB_PATH} is missing — run "npm run build-search-db" first ` +
            `(or point OFFLINE_PARITY_DB at a built dg.db)`);
    }
    if (!require('fs').existsSync(BUNDLE)) {
        fail(`${BUNDLE} is missing — run "npm run build-offline" first`);
    }

    const source = initWith(DB_PATH, require(path.join(ROOT, 'core', 'search-core.js')));
    const bundled = initWith(DB_PATH, (await import(pathToFileURL(BUNDLE).href)).default);

    let same = 0;
    const differing = [];
    for (const [name, run] of CASES) {
        let a, b, err = null;
        try { a = J(await run(source)); } catch (e) { err = `source: ${e.message}`; }
        try { b = J(await run(bundled)); } catch (e) { err = (err ? err + '; ' : '') + `bundle: ${e.message}`; }
        if (err) { differing.push(name); console.log(`DIFF  ${name} — ${err}`); continue; }
        if (a === b) { same++; console.log(`SAME  ${name}`); }
        else {
            differing.push(name);
            console.log(`DIFF  ${name}`);
            console.log('   source: ' + a.slice(0, 240));
            console.log('   bundle: ' + b.slice(0, 240));
        }
    }
    console.log(`\n${same}/${CASES.length} identical (db: ${path.relative(ROOT, DB_PATH)})`);
    if (differing.length) fail(`bundle differs on: ${differing.join(', ')}`);
    console.log('OFFLINE PARITY OK');
})();
