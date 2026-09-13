#!/usr/bin/env node
// Interrupted download, resumed: the one behaviour the end-to-end test cannot exercise (it lets the
// transfer finish). A first response is cut off at 40%; the worker must retry with
// `Range: bytes=<have>-` instead of starting over, and the database must still pass the worker's
// own integrity check afterwards.
//
// It runs against a small synthetic database and a throwaway HTTP server, so it needs neither the
// 479MB fixture nor dg-fastify.js, and takes seconds rather than a minute and a half.
//
// Usage: node test/offline-resume.js          (plain file)
//        OFFLINE_RESUME_GZ=1 node test/offline-resume.js   (gzip archive, as prod publishes)

const fs = require('fs');
const path = require('path');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const zlib = require('zlib');
const { chromium } = require(process.env.DG_PLAYWRIGHT || '/var/www/dg-app-full/node_modules/playwright-core');

const ROOT = path.resolve(__dirname, '..');
const WORK = process.env.OFFLINE_RESUME_DIR || path.join(ROOT, '.offline-test', 'resume');
const PORT = Number(process.env.PORT) || 3141;
const BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join(WORK, 'dg-mobile.db');
const BUILD_ID = 'resumeprobe';
const TARGET_MB = 48;
const GZ = !!process.env.OFFLINE_RESUME_GZ;
const WIRE = GZ ? 'dg.db.gz' : 'dg-mobile.db';
const CUT = 0.4; // share of the file the first attempt is allowed to deliver

function fail(msg) {
    console.error(`\nFAILED: ${msg}`);
    process.exit(1);
}

// A dg-mobile-shaped database, small on purpose: inspect() needs suttas + meta, adopt() walks the
// skeleton, and navFor() needs neighbours to exist. No FTS — this test is not about searching.
function makeFixture() {
    fs.rmSync(WORK, { recursive: true, force: true });
    fs.mkdirSync(WORK, { recursive: true });
    const db = new DatabaseSync(DB);
    db.exec('PRAGMA journal_mode = delete');
    db.exec('CREATE TABLE suttas (id TEXT PRIMARY KEY, category TEXT, dir_path TEXT, title TEXT, mr INTEGER)');
    db.exec('CREATE TABLE texts (sutta_id TEXT, segment_id TEXT, ord INTEGER, kind TEXT, lang TEXT, translator TEXT, source TEXT, txt TEXT)');
    db.exec('CREATE TABLE html (sutta_id TEXT, segment_id TEXT, html TEXT)');
    db.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)');
    db.exec('CREATE TABLE filler (id INTEGER PRIMARY KEY, blob BLOB)');
    const sutta = db.prepare('INSERT INTO suttas VALUES (?,?,?,?,?)');
    for (const [id, title] of [['dn21', 'Sakkapañhasutta'], ['dn22', 'Mahāsatipaṭṭhānasutta'], ['dn23', 'Pāyāsisutta']]) {
        sutta.run(id, 'dhamma', 'pli/ms/sutta/dn', title + ' ', 7);
    }
    db.prepare('INSERT INTO texts VALUES (?,?,?,?,?,?,?,?)').run('dn22', 'dn22:1.1', 1, 'root', 'pli', null, null, 'evaṁ me sutaṁ');
    for (const [k, v] of [['schema_version', '1'], ['build_id', BUILD_ID], ['langs', 'ru,en'], ['fts', 'none']]) {
        db.prepare('INSERT INTO meta VALUES (?,?)').run(k, v);
    }
    const filler = db.prepare('INSERT INTO filler (blob) VALUES (randomblob(?))');
    const chunk = 1024 * 1024;
    while (fs.statSync(DB).size < TARGET_MB * chunk) filler.run(chunk);
    db.close();
    const bytes = fs.statSync(DB).size;
    fs.writeFileSync(path.join(WORK, 'db-manifest.json'), JSON.stringify({
        schema_version: 1, build_id: BUILD_ID, langs: 'ru,en', fts: 'none', bytes,
        ...(GZ ? { file_gz: WIRE, bytes_gz: fs.writeFileSync(path.join(WORK, WIRE), zlib.gzipSync(fs.readFileSync(DB))) || fs.statSync(path.join(WORK, WIRE)).size }
               : { file: WIRE }),
    }, null, 2) + '\n');
    return bytes;
}

const PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script src="/offline/platform.js"></script>
<script src="/offline/app.js"></script>
<script src="/offline/offline-status.js"></script>
</head><body><script>
window.__result = null;
window.__events = [];
window.addEventListener('dg:dl-progress', (e) => window.__events.push(e.detail));
(async () => {
    try {
        await window.dgOfflineLibrary;
        const nav = await fetch('/api/nav/dn22');
        const navBody = await nav.json();
        window.__result = { ok: true, diagnostics: window.dgOfflineDiagnostics(),
                            nav: { status: nav.status, prev: navBody.prev && navBody.prev.slug, next: navBody.next && navBody.next.slug } };
    } catch (e) { window.__result = { ok: false, error: String((e && e.message) || e) }; }
})();
</script></body></html>`;

(async () => {
    const bytes = makeFixture();
    console.log(`fixture: ${(bytes / 1048576).toFixed(1)}MB, first attempt cut at ${(bytes * CUT / 1048576).toFixed(1)}MB`);

    const buf = fs.readFileSync(path.join(WORK, WIRE));
    const attempts = [];
    const app = express();
    app.use('/offline', express.static(path.join(ROOT, 'public', 'offline')));
    app.get('/reader/mode-table.json', (req, res) => res.sendFile(path.join(ROOT, 'configs', 'reader', 'mode-table.json')));
    // BEFORE the static mount below: express matches in registration order, so the other way round
    // the whole file is served and this test never interrupts anything.
    app.get(`/mobile-data/${WIRE}`, (req, res) => {
        const range = req.headers.range;
        const m = range && /^bytes=(\d+)-$/.exec(range);
        const start = m ? Number(m[1]) : 0;
        attempts.push({ range: range || null, start });
        console.log(`  request #${attempts.length}: ${range ? range : 'no Range'} -> from ${start}`);
        if (attempts.length === 1) {
            // A response that is COMPLETE as far as HTTP is concerned, and short as far as the
            // database is concerned. Dropping the connection instead does not work here: Chrome
            // transparently re-issues an idempotent GET that dies mid-body (measured — the server
            // log showed two requests while the worker saw exactly one), so the failure never
            // reaches the code under test. A short Content-Length is also the nastier real case:
            // the stream ends with a clean `done`, no error and no stall, and only the byte count
            // reveals that 60% of the database never arrived.
            const cut = Math.floor(buf.length * CUT);
            res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(cut), 'Accept-Ranges': 'bytes' });
            res.end(buf.subarray(0, cut));
            return;
        }
        res.writeHead(206, {
            'Content-Type': 'application/octet-stream',
            'Content-Range': `bytes ${start}-${buf.length - 1}/${buf.length}`,
            'Content-Length': String(buf.length - start),
            'Accept-Ranges': 'bytes',
        });
        res.end(buf.subarray(start));
    });
    // The manifest must be real too: its bytes figure is what the worker verifies the transfer
    // against, so a truncated attempt has to be detected by the byte count, not just by SQLite.
    app.use('/mobile-data', express.static(WORK));
    app.get('/', (req, res) => res.type('html').send(PAGE));
    app.use((req, res) => { console.log('  404', req.url); res.status(404).end(); });

    const server = app.listen(PORT, async () => {
        const profileDir = path.join(WORK, 'chrome-profile');
        const context = await chromium.launchPersistentContext(profileDir, {
            executablePath: process.env.DG_CHROMIUM || '/usr/bin/google-chrome',
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        });
        const page = await context.newPage();
        page.on('pageerror', (e) => console.log('  PAGEERROR:', String(e).slice(0, 200)));
        page.on('console', (m) => console.log(`  [${m.type()}] ${m.text().slice(0, 200)}`));
        await page.addInitScript(() => { window.DG_DIST_BASE = '/mobile-data'; });
        await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => localStorage.setItem('dg.offline.wantData', '1'));
        await page.reload({ waitUntil: 'domcontentloaded' });

        let result = null;
        for (let i = 0; i < 120 && !result; i++) {
            result = await page.evaluate(() => window.__result);
            if (!result) await new Promise((r) => setTimeout(r, 500));
        }
        console.log('result:', JSON.stringify(result));
        console.log('attempts:', JSON.stringify(attempts));
        console.log('progress events:', JSON.stringify(await page.evaluate(() => window.__events)));
        await context.close();
        server.close();
        // The profile holds the fixture's database in OPFS; the whole working directory is a
        // throwaway (it is rebuilt at the start of every run), so it goes too.
        try { fs.rmSync(WORK, { recursive: true, force: true }); } catch (e) { /* still flushing */ }

        const resumed = attempts.slice(1).filter((a) => a.range && a.start > 0);
        if (!result || !result.ok) fail(`the resumed download did not finish: ${result && result.error}`);
        if (result.diagnostics.mode !== 'local') fail('the page is not using the local database after the download');
        if (!result.nav || result.nav.status !== 200 || result.nav.prev !== 'dn21' || result.nav.next !== 'dn23') {
            fail(`the opened database does not answer /api/nav: ${JSON.stringify(result.nav)}`);
        }
        if (attempts.length < 2) fail('the connection was not actually cut — no retry happened');
        if (!resumed.length) fail(`the retry restarted from 0 instead of resuming: ${JSON.stringify(attempts)}`);
        if (resumed[0].start < buf.length * CUT * 0.9) {
            fail(`resumed from ${resumed[0].start}, expected at least ${Math.floor(buf.length * CUT * 0.9)} (the bytes already on disk)`);
        }
        console.log(`\nOFFLINE RESUME OK (${WIRE})`);
        process.exit(0);
    });
})();
