#!/usr/bin/env node
// /login Backup & Restore round trip: does the header backup button save this device's
// localStorage, and does Restore put it back without a cloud account?
//
// Asserts: auth/cache keys never leave in the file, unrelated keys survive a restore,
// a broken file changes nothing.
//
// Usage: node test/login-backup.js   (needs a server on BASE, default the test instance)

const { chromium } = require('playwright');

const BASE = process.env.LOGIN_BASE || 'http://127.0.0.1:3003';

function fail(msg) {
    console.error(`\nFAILED: ${msg}`);
    process.exit(1);
}

const SEED = {
    selectedDict: 'dpd',
    removePunct: 'true',
    uiScale: '125',
    dg_favorites: JSON.stringify([{ slug: 'mn1', search: '?q=mn1', timestamp: 1 }]),
    localSearchHistory: JSON.stringify(Array.from({ length: 200 }, (_, i) => [`mn${i}`, `/mn${i}`, '2026-01-01T00:00:00.000Z'])),
    syncPhraseRaw: 'SECRET-SHOULD-NOT-LEAK'
};

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();

    try {
        await page.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });

        const header = await page.evaluate(() => {
            const b = document.getElementById('btn-backup');
            const r = document.getElementById('btn-restore');
            return b && r ? { w: b.getBoundingClientRect().width } : null;
        });
        if (!header) fail('backup/restore buttons are missing from the header');
        if (header.w < 40) fail(`backup button is collapsed in the header (${header.w}px)`);

        // In the apps the same page must hide the block: their WebView cannot save/pick a file yet.
        const appPage = await browser.newPage();
        await appPage.addInitScript(() => {
            window.Capacitor = { isNativePlatform: () => true };
        });
        await appPage.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });
        const hiddenInApp = await appPage.evaluate(() => {
            const box = document.getElementById('backup-restore');
            return !!box && getComputedStyle(box).display === 'none';
        });
        await appPage.close();
        if (!hiddenInApp) fail('backup/restore is visible inside the app shell');

        await page.evaluate((seed) => {
            localStorage.clear();
            for (const k in seed) localStorage.setItem(k, seed[k]);
            localStorage.setItem('firestore_junk', 'cache');
        }, SEED);

        const json = await page.evaluate(async () => {
            let captured = null;
            const create = URL.createObjectURL;
            const click = HTMLAnchorElement.prototype.click;
            URL.createObjectURL = (blob) => { captured = blob; return 'blob:captured'; };
            HTMLAnchorElement.prototype.click = function () {};
            window.uiBackupData();
            URL.createObjectURL = create;
            HTMLAnchorElement.prototype.click = click;
            return captured.text();
        });

        const dumped = JSON.parse(json).localStorage;
        for (const key of Object.keys(SEED)) {
            if (key === 'syncPhraseRaw' || key === 'localSearchHistory') continue;
            if (dumped[key] !== SEED[key]) fail(`backup lost ${key}: ${JSON.stringify(dumped[key])}`);
        }

        // History is capped: the newest 84 of the 200 seeded entries.
        const history = JSON.parse(dumped.localSearchHistory);
        if (history.length !== 84) fail(`backup kept ${history.length} history entries, expected 84`);
        if (history[0][0] !== 'mn0' || history[83][0] !== 'mn83') fail('history cap kept the wrong end of the list');
        if (json.includes('SECRET-SHOULD-NOT-LEAK')) fail('backup leaks the login passphrase');
        if (dumped.firestore_junk || Object.keys(dumped).some((k) => /^(firebase|firestore)_/.test(k))) {
            fail('backup carries firebase credentials/offline cache');
        }

        await page.evaluate(() => {
            localStorage.setItem('selectedDict', 'xxx');
            localStorage.removeItem('dg_favorites');
            localStorage.setItem('keepMe', '1');
        });

        await page.evaluate(async (fileJson) => {
            window.confirm = () => true;
            const dt = new DataTransfer();
            dt.items.add(new File([fileJson], 'backup.json', { type: 'application/json' }));
            const input = document.getElementById('restore-file-input');
            input.files = dt.files;
            input.dispatchEvent(new Event('change'));
        }, json);

        // Restore reloads the page after a second.
        await page.waitForLoadState('load').catch(() => {});
        await page.waitForTimeout(2000);

        const restored = await page.evaluate(() => ({
            dict: localStorage.getItem('selectedDict'),
            favs: localStorage.getItem('dg_favorites'),
            keepMe: localStorage.getItem('keepMe')
        }));
        if (restored.dict !== SEED.selectedDict) fail(`restore did not bring back selectedDict: ${restored.dict}`);
        if (restored.favs !== SEED.dg_favorites) fail(`restore did not bring back favorites: ${restored.favs}`);
        if (restored.keepMe !== '1') fail('restore wiped a key that was not in the backup');

        await page.evaluate(async () => {
            const dt = new DataTransfer();
            dt.items.add(new File(['{not json'], 'bad.json', { type: 'application/json' }));
            const input = document.getElementById('restore-file-input');
            input.files = dt.files;
            input.dispatchEvent(new Event('change'));
            await new Promise((r) => setTimeout(r, 300));
        });
        const afterBad = await page.evaluate(() => localStorage.getItem('selectedDict'));
        if (afterBad !== SEED.selectedDict) fail('a broken file changed localStorage');

        console.log('OK: /login backup + restore round trip');
    } finally {
        await browser.close();
    }
})();
