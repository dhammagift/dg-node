#!/usr/bin/env node
// npm run test-offline-outage — the whole app against a REAL outage — pm2 test stopped, nginx answering
// 503 — exercising everything that touches the database: search, interface language, a second tab,
// the TOC, and the reader. Always restores the service.
//
// Usage: node .offline-test/real-battery.js
const { execSync } = require('child_process');
const { chromium } = require('/var/www/dg-app-full/node_modules/playwright-core');

const HOST = process.env.DG_OUTAGE_HOST || 'http://test.dhamma.gift';
const ROOT = require('path').join(__dirname, '..');
const PROFILE = process.env.DG_OUTAGE_PROFILE || require('path').join(ROOT, '.offline-test', 'outage-profile');
const SHOTS = require('path').join(ROOT, '.offline-test', 'shots');
const pm2 = (c) => { try { return execSync(`PM2_HOME=/root/.pm2 pm2 ${c}`, { encoding: 'utf8' }); } catch (e) { return e.message; } };
const up = async () => { try { const r = await fetch(`${HOST}/`, { signal: AbortSignal.timeout(4000) }); return r.status; } catch (e) { return 'no answer'; } };

const results = [];
const check = (name, ok, extra) => { results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

// Playwright's bringToFront does not always move DOM focus between pages of one context, so the
// switch is made explicit here — the same events a real window switch delivers.
let PAGE_ONE = null;
const tab1Blur = async () => { if (PAGE_ONE) await PAGE_ONE.evaluate(() => window.dispatchEvent(new Event('blur'))); };

(async () => {
    const restore = () => pm2('start test');
    process.on('exit', restore);
    process.on('SIGINT', () => { restore(); process.exit(1); });

    const context = await chromium.launchPersistentContext(PROFILE, {
        executablePath: process.env.DG_CHROMIUM || '/usr/bin/google-chrome',
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--host-resolver-rules=MAP test.dhamma.gift 192.168.1.18'],
        ignoreHTTPSErrors: true,
        viewport: { width: 1000, height: 760 },
    });
    const wire = (page, tag) => {
        page.on('pageerror', (e) => console.log(`   [${tag} pageerror] ` + String(e).slice(0, 160)));
        page.on('console', (m) => { if (m.type() === 'error' && !/503|ERR_FAILED/.test(m.text())) console.log(`   [${tag}] ` + m.text().slice(0, 160)); });
        page.on('response', (r) => { if (r.status() >= 500) console.log(`   [${tag} ${r.status()}] ` + r.url().slice(0, 100)); });
    };

    const page = await context.newPage();
    PAGE_ONE = page;
    wire(page, 'main');
    await page.addInitScript(() => { window.DG_DIST_BASE = '/mobile-data'; });

    console.log('preparing online:', await up());
    await page.goto(`${HOST}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Clean slate for the shell cache (NOT the library, which lives in OPFS): a leftover cache from an
    // earlier build served the second tab yesterday's app.js, so a run could pass or fail on code that
    // is no longer in the repository.
    await page.evaluate(async () => {
        for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
        for (const k of await caches.keys()) await caches.delete(k);
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const present = await page.evaluate(() => { try { return !!(JSON.parse(localStorage.getItem('dg.offline.state') || 'null') || {}).present; } catch (e) { return false; } });
    if (!present) {
        console.log('installing the library');
        await page.evaluate(() => localStorage.setItem('dg.offline.wantData', '1'));
        await page.reload({ waitUntil: 'domcontentloaded' });
        console.log('   ->', await page.evaluate(async () => Promise.race([
            window.dgOfflineLibrary.then(() => 'resolved', (e) => 'rejected: ' + e.message),
            new Promise((r) => setTimeout(() => r('timeout'), 240000)),
        ])));
    }
    console.log('   before outage:', JSON.stringify(await page.evaluate(() => window.dgOfflineDiagnostics())));
    // let the service worker install/update and precache everything
    await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update().catch(() => {});
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }).catch(() => {});
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    const search = async (p, q) => {
        await p.evaluate((q) => {
            const i = document.getElementById('paliauto');
            if (i) { i.value = q; i.dispatchEvent(new Event('input', { bubbles: true })); }
            const f = document.getElementById('form');
            if (f) f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }, q);
        await p.waitForTimeout(6000);
        return p.evaluate(() => ({ rows: document.querySelectorAll('table tbody tr').length,
            error: (document.querySelector('.alert-warning, .alert-danger') || {}).textContent }));
    };

    // The precondition that actually matters before pulling the server down: this page must be
    // CONTROLLED by the worker and the shell must be in its cache. An entry count says neither (the
    // install pass is flaky — 102 of ~150 in one measured run — and the count says nothing about
    // control), and waiting on it let the test stop pm2 with no controller, then blame the app.
    await page.evaluate(async () => {
        for (let i = 0; i < 60; i++) {
            if (navigator.serviceWorker.controller) {
                for (const n of (await caches.keys()).filter((x) => x.indexOf('dg-shell-') === 0)) {
                    const c = await caches.open(n);
                    if (await c.match('/')) return;
                }
            }
            await new Promise((r) => setTimeout(r, 500));
        }
    }).catch(() => {});
    console.log('   controller:', await page.evaluate(() => !!navigator.serviceWorker.controller),
                '| shell cached:', await page.evaluate(async () => {
                    for (const n of (await caches.keys()).filter((x) => x.indexOf('dg-shell-') === 0)) {
                        if (await (await caches.open(n)).match('/')) return true;
                    }
                    return false;
                }));

    console.log('\n=== pm2 stop test ===');
    pm2('stop test');
    await new Promise((r) => setTimeout(r, 1500));
    console.log('host now:', await up());

    // 1. fresh navigation, EN
    await page.goto(`${HOST}/`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => console.log('   nav:', e.message));
    await page.waitForTimeout(2500);
    let d = await page.evaluate(() => window.dgOfflineDiagnostics());
    check('reload / (fresh navigation) is local', d.mode === 'local', JSON.stringify(d));
    let s = await search(page, 'kacchapa');
    check('search EN after reload', s.rows > 0, JSON.stringify(s));

    // 2. interface language -> Russian (the switcher navigates or reloads)
    await page.evaluate(() => localStorage.setItem('dhammaLanguage', 'ru'));
    await page.goto(`${HOST}/?lang=ru`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => console.log('   nav:', e.message));
    await page.waitForTimeout(3000);
    d = await page.evaluate(() => window.dgOfflineDiagnostics());
    check('after language switch is local', d.mode === 'local', JSON.stringify(d));
    s = await search(page, 'черепаха');
    check('search RU after language switch', s.rows > 0, JSON.stringify(s));
    await page.screenshot({ path: `${SHOTS}/30-outage-search-main.png` });

    // 3. second tab, fresh page, same origin
    const tab2 = await context.newPage();
    wire(tab2, 'tab2');
    await tab2.goto(`${HOST}/`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => console.log('   nav:', e.message));
    await tab2.bringToFront();
    await tab1Blur();                                                  // a real window switch
    await tab2.evaluate(() => window.dispatchEvent(new Event('focus')));
    await tab2.waitForTimeout(6000);
    d = await tab2.evaluate(() => window.dgOfflineDiagnostics());
    s = await search(tab2, 'kacchapa');
    // Either it got the pool itself (the owner yielded) or it is served by the tab that has it: both
    // mean the reader can use the second tab offline.
    check('second tab serves data offline', s.rows > 0, JSON.stringify({ diag: d, search: s }));
    d = await tab2.evaluate(() => window.dgOfflineDiagnostics());
    check('second tab reports how (local or relayed)', d.mode === 'local' || d.relayed === true, JSON.stringify(d));
    await tab2.screenshot({ path: `${SHOTS}/27-outage-tab2.png` });

    // Back to the first tab, the way a reader switches back: the tab in front asks for the library and
    // the owner — now hidden — hands it over. Everything below runs in the tab being looked at.
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await tab2.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(8000);
    console.log('   back in tab1:', JSON.stringify(await page.evaluate(() => window.dgOfflineDiagnostics())));

    // 4. TOC — in the MAIN tab, the one that owns the pool
    await page.goto(`${HOST}/toc`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => console.log('   nav:', e.message));
    await tab2.waitForTimeout(5000);
    const toc = await page.evaluate(() => {
        const txt = (document.body.innerText || '');
        const pane = document.querySelector('#toc-pane');
        return {
            failed: /Failed to load|Failed to fetch/i.test(txt),
            // The tree labels follow the interface language — checking only the Pali spelling was a
            // false negative (the Russian UI shows "Дигха").
            hasBook: /Dīgha|Digha|Дигха/i.test(txt + (pane ? pane.textContent : '')),
            hasVinaya: /Vinaya|Виная/i.test(txt + (pane ? pane.textContent : '')),
            state: document.body.className,
            paneNodes: pane ? pane.querySelectorAll('a, button, summary, li').length : 0,
        };
    });
    check('TOC opens offline', !toc.failed && toc.hasBook && toc.hasVinaya && toc.paneNodes > 5, JSON.stringify(toc));
    await page.screenshot({ path: `${SHOTS}/28-outage-toc.png` });

    // 5. reader, fresh navigation — main tab
    await page.goto(`${HOST}/dn22:2.2`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => console.log('   nav:', e.message));
    await tab2.waitForTimeout(7000);
    const reader = await page.evaluate(() => {
        const t = (document.body.innerText || '').replace(/\s+/g, ' ');
        return { diag: window.dgOfflineDiagnostics(), chars: t.length,
                 hasText: /Katañca|bhikkhave|satipaṭṭhāna|Dīgha/i.test(t), head: t.slice(0, 80) };
    });
    check('reader opens offline (fresh navigation)', reader.hasText && reader.chars > 2000, JSON.stringify(reader));
    await page.screenshot({ path: `${SHOTS}/29-outage-reader.png` });

    // 6. reader via SPA click, no reload — main tab
    await page.goto(`${HOST}/`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await search(page, 'kacchapa');
    await page.evaluate(() => { const a = document.querySelector('table tbody tr a[href*="/"]'); if (a) a.click(); });
    await page.waitForTimeout(6000);
    const spa = await page.evaluate(() => ({ url: location.href, chars: (document.body.innerText || '').length }));
    await page.screenshot({ path: `${SHOTS}/31-outage-reader-spa.png` });
    check('reader via SPA click (no reload)', spa.chars > 2000, JSON.stringify(spa));

    console.log('\n=== restoring pm2 test ===');
    restore();
    await new Promise((r) => setTimeout(r, 3000));
    console.log('host after:', await up());
    console.log('\nsummary: ' + results.filter((r) => r[1]).length + '/' + results.length + ' passed');
    console.log(results.filter((r) => !r[1]).map((r) => 'FAILED: ' + r[0]).join('\n'));
    await context.close();
})();
