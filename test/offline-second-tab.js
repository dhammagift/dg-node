#!/usr/bin/env node
// npm-less check: node test/offline-second-tab.js
// Tab 1 has the offline library open (it owns the OPFS pool); the reader opens a second tab while ONLINE.
// That tab must work through the server without a word — no "the library is busy in another tab, close
// it" toast (owner: "стало как в какой-то 1с ... в онлайне точно анти фича").
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { chromium } = require('/var/www/dg-app-full/node_modules/playwright-core');

const OFFLINE = process.env.OFFLINE_DIR || path.join(__dirname, '..', 'public', 'offline');
const WORK = path.join(require('os').tmpdir(), 'dg-offline-second-tab');
const PORT = 3154;

function makeFixture() {
    fs.rmSync(WORK, { recursive: true, force: true });
    fs.mkdirSync(WORK, { recursive: true });
    const file = path.join(WORK, 'dg.db');
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = delete');
    db.exec('CREATE TABLE suttas (id TEXT PRIMARY KEY, category TEXT, dir_path TEXT, title TEXT, mr INTEGER)');
    db.exec('CREATE TABLE texts (sutta_id TEXT, segment_id TEXT, ord INTEGER, kind TEXT, lang TEXT, translator TEXT, source TEXT, txt TEXT)');
    db.exec('CREATE TABLE html (sutta_id TEXT, segment_id TEXT, ord INTEGER, txt TEXT)');
    db.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)');
    db.exec('CREATE TABLE filler (id INTEGER PRIMARY KEY, blob BLOB)');
    for (const id of ['dn21', 'dn22', 'dn23']) db.prepare('INSERT INTO suttas VALUES (?,?,?,?,?)').run(id, 'dhamma', 'pli/ms/sutta/dn', id, 7);
    for (const [k, v] of [['schema_version', '1'], ['build_id', 'tabsprobe'], ['langs', 'ru,en'], ['fts', 'none']]) db.prepare('INSERT INTO meta VALUES (?,?)').run(k, v);
    const filler = db.prepare('INSERT INTO filler (blob) VALUES (randomblob(?))');
    while (fs.statSync(file).size < 24 * 1048576) filler.run(1048576);
    db.close();
    const gz = zlib.gzipSync(fs.readFileSync(file));
    fs.writeFileSync(path.join(WORK, 'dg.db.gz'), gz);
    fs.writeFileSync(path.join(WORK, 'db-manifest.json'), JSON.stringify({
        schema_version: 1, build_id: 'tabsprobe', langs: 'ru,en', fts: 'none',
        bytes: fs.statSync(file).size, file_gz: 'dg.db.gz', bytes_gz: gz.length,
    }));
    return gz;
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script>window.__toasts = []; window.showBubbleNotification = (t) => window.__toasts.push(t);
localStorage.setItem('siteLanguage', 'ru'); window.DG_DIST_BASE = '/mobile-data';</script>
<script src="/offline/platform.js"></script>
<script src="/offline/app.js"></script>
<script src="/offline/offline-status.js"></script>
</head><body>tab</body></html>`;

(async () => {
    const gz = makeFixture();
    const app = express();
    app.use('/offline', express.static(OFFLINE));
    app.get('/mobile-data/dg.db.gz', async (req, res) => {
        const m = /^bytes=(\d+)-$/.exec(req.headers.range || '');
        const start = m ? Number(m[1]) : 0;
        res.writeHead(m ? 206 : 200, {
            'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Content-Length': String(gz.length - start),
            ...(m ? { 'Content-Range': `bytes ${start}-${gz.length - 1}/${gz.length}` } : {}),
        });
        for (let at = start; at < gz.length && !res.destroyed; at += 256 * 1024) { // slow: tab 1 stays mid-download
            res.write(gz.subarray(at, Math.min(at + 256 * 1024, gz.length)));
            await new Promise(r => setTimeout(r, 5));
        }
        res.end();
    });
    app.use('/mobile-data', express.static(WORK));
    app.get('/', (req, res) => res.type('html').send(PAGE));
    const server = app.listen(PORT);
    const ctx = await chromium.launchPersistentContext(path.join(WORK, 'profile'), {
        executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const log = [];
    try {
        // Tab 1 downloads and opens the library (it owns the OPFS pool from then on).
        const tab1 = ctx.pages()[0] || await ctx.newPage();
        await tab1.goto(`http://127.0.0.1:${PORT}/`);
        await tab1.evaluate(() => window.postMessage({ dgOfflineDownloadRequest: 'open' }, location.origin));
        await tab1.waitForFunction(() => window.dgOfflineDiagnostics && window.dgOfflineDiagnostics().mode === 'local', null, { timeout: 60000 });
        await tab1.evaluate(() => { window.__toasts.length = 0; });
        // Tab 2 opens the site normally, online, while tab 1 holds the library.
        const tab2 = await ctx.newPage();
        tab2.on('console', m => { if (/dg-offline/.test(m.text())) log.push('tab2 ' + m.text().slice(0, 160)); });
        await tab2.goto(`http://127.0.0.1:${PORT}/`);
        await tab2.bringToFront();
        await tab2.waitForTimeout(15000);
        const nav = await tab2.evaluate(() => fetch('/api/nav/dn22').then(r => r.status, e => 'ERR ' + e.message));
        const toasts = { tab1: await tab1.evaluate(() => window.__toasts), tab2: await tab2.evaluate(() => window.__toasts) };
        console.log(log.slice(-10).join('\n'));
        console.log('tab2 mode', JSON.stringify(await tab2.evaluate(() => window.dgOfflineDiagnostics())), 'nav', nav);
        console.log('TOASTS', JSON.stringify(toasts));
        const busy = toasts.tab2.filter(t => /занята|busy|закройте|close/i.test(t));
        console.log(busy.length ? 'FAIL: tab 2 was told to close another tab' : 'OK: no "close the other tab" toast');
        process.exitCode = busy.length ? 1 : 0;
    } finally {
        await ctx.close();
        server.close();
        fs.rmSync(WORK, { recursive: true, force: true });
    }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
