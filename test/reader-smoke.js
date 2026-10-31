#!/usr/bin/env node
// Reader smoke test in a real browser, against a running site: run it on test before a prod rollout
// and on dhamma.gift after one. Each case here is a bug the owner found by hand (2026-10-26):
// the translation-only view shifted 2em right, a Vinaya text with no ru went blank with the Pali
// hidden, Vinaya ids (/pli-tv-...) got the results state on top of the reader's, Voice / Alt+R
// started in Pali after a tap on a Pali line.
//
//   node test/reader-smoke.js [https://test.dhamma.gift]
const { chromium } = require(process.env.DG_PLAYWRIGHT || '/usr/lib/node_modules/@playwright/cli/node_modules/playwright-core');

const BASE = (process.argv[2] || 'https://test.dhamma.gift').replace(/\/$/, '');

// [path, stored Pali toggle ('pli-2nd' both, '2nd' translation only), translation lang expected]
const CASES = [
    ['/sn56.11?lang=ru', 'pli-2nd', 'ru'],
    ['/sn56.11?lang=ru', '2nd', 'ru'],
    ['/mn10?lang=en', '2nd', 'en'],
    ['/an1.1-10?lang=ru', 'pli-2nd', 'ru'],
    ['/pli-tv-bu-vb-pj1?lang=ru', 'pli-2nd', null],
    ['/pli-tv-bu-vb-sk63?lang=ru', 'pli-2nd', 'en'],   // no ru: English instead
    ['/pli-tv-bu-vb-sk63?lang=ru', '2nd', 'en'],
    ['/pli-tv-kd1?lang=en', '2nd', 'en'],
];

async function check(page, [path, toggle, lang]) {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(t => { localStorage.setItem('paliToggle', t); localStorage.removeItem('tts_preferred_mode'); }, toggle);
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    // the reader's own render, not the server's first paint of the same text
    await page.waitForFunction(() => window.dgReaderSlug && document.querySelector('#sutta article .quote'), null, { timeout: 20000 });
    await page.waitForTimeout(500);
    return page.evaluate(({ toggle, lang }) => {
        const errs = [];
        const states = [...document.body.classList].filter(c => /^dg-state-/.test(c));
        if (states.join() !== 'dg-state-reader') errs.push('body states: ' + states.join(' '));
        const sutta = document.getElementById('sutta');
        const shown = sel => [...sutta.querySelectorAll(sel)].filter(e => e.offsetParent && e.textContent.trim());
        const pli = shown('article p .pli-lang.quote'), trn = shown('article p .quote:not(.pli-lang)');
        if (toggle === '2nd' && pli.length) errs.push(`Pali hidden but ${pli.length} Pali lines shown`);
        if (toggle !== '2nd' && !pli.length) errs.push('no Pali shown');
        if (lang && !trn.some(e => e.classList.contains(lang + '-lang'))) errs.push(`no ${lang} translation shown`);
        if (!pli.length && !trn.length) errs.push('blank text');
        // Every paragraph's text starts where the paragraph does (the 2em shift)
        const p = (pli[0] || trn[0])?.closest('p');
        const first = trn[0] || pli[0];
        if (p && first) {
            const dx = first.getBoundingClientRect().left - p.getBoundingClientRect().left - parseFloat(getComputedStyle(p).paddingLeft);
            if (Math.abs(dx) > 10) errs.push(`text shifted ${Math.round(dx)}px in its paragraph`);
            const art = sutta.querySelector('article').getBoundingClientRect().left;
            if (first.getBoundingClientRect().left - art > 10) errs.push(`text ${Math.round(first.getBoundingClientRect().left - art)}px right of the article`);
        }
        if (document.documentElement.scrollWidth > innerWidth + 1) errs.push('horizontal scroll');
        return errs;
    }, { toggle, lang });
}

// Voice / Alt+R start in the translation even after the title's Pali speaker was tapped.
async function checkVoice(page) {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.setItem('paliToggle', 'pli-2nd'); localStorage.removeItem('tts_preferred_mode'); });
    await page.goto(BASE + '/sn56.11?lang=ru', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.pli-lang .title-play-btn', { timeout: 20000 });
    const mode = () => page.evaluate(() => typeof ttsState !== 'undefined' && ttsState.speaking ? ttsState.langSettings : null);
    const stop = () => page.evaluate(() => document.querySelector('.close-tts-btn')?.click());
    const errs = [];
    await page.click('.pli-lang .title-play-btn');
    await page.waitForFunction(() => typeof ttsState !== 'undefined' && ttsState.speaking, null, { timeout: 15000 });
    if (await mode() !== 'pi') errs.push(`title speaker played ${await mode()}, not pi`);
    await stop();
    await page.click('.voice-link');
    await page.waitForTimeout(1500);
    if (await mode() !== 'trn') errs.push(`Voice after the speaker played ${await mode()}, not trn`);
    await stop();
    await page.keyboard.press('Alt+KeyR');
    await page.waitForTimeout(1500);
    if (await mode() !== 'trn') errs.push(`Alt+R after the speaker played ${await mode()}, not trn`);
    await stop();
    return errs;
}

async function checkExternalLinks(page) {
    const errs = [];
    let releaseText;
    const textGate = new Promise(resolve => { releaseText = resolve; });
    await page.route('**/api/text/**', async route => {
        await textGate;
        await route.continue();
    });
    await page.goto(BASE + '/sn56.11?lang=ru', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#reader-toolbar .dg-external-links-toggle', { state: 'visible', timeout: 10000 });
    const early = await page.evaluate(() => {
        const voice = document.querySelector('#reader-toolbar .voice-link');
        const toggle = document.querySelector('#reader-toolbar .dg-external-links-toggle');
        return {
            voice: !!voice && voice.offsetParent !== null,
            toggle: !!toggle && toggle.offsetParent !== null,
            label: toggle?.innerText.trim(),
        };
    });
    if (!early.voice) errs.push('Voice is not visible while the text is loading');
    if (!early.toggle) errs.push('external-links shell is not visible while the text is loading');
    if (early.label !== 'Внеш. ссылки') errs.push('wrong immediate Russian label: ' + early.label);
    const earlyToggle = page.locator('#reader-toolbar .dg-external-links-toggle');
    await earlyToggle.click();
    const earlyStatus = await page.locator('#reader-toolbar .dg-external-links-status').innerText();
    if (earlyStatus !== 'Загрузка…') errs.push('wrong immediate loading status: ' + earlyStatus);
    await earlyToggle.click();
    releaseText();
    await page.waitForFunction(() => window.dgReaderSlug && document.querySelector('#sutta article .quote'), null, { timeout: 20000 });
    await page.waitForTimeout(600);
    const header = await page.evaluate(() => {
        const root = document.querySelector('#reader-toolbar > .dg-external-links, #top-links-container .dg-external-links, #reader-toolbar .dg-row2-box > .dg-external-links');
        const voice = document.querySelector('#reader-toolbar > .voice-link, #top-links-container .voice-link, #reader-toolbar .dg-row2-box > .voice-link');
        return {
            root: !!root,
            voice: !!voice && !!voice.dataset.slug,
            nested: !!root && root.querySelectorAll('.dg-external-links-menu a').length > 1,
            label: root?.querySelector('.dg-external-links-toggle')?.textContent.trim(),
        };
    });
    if (!header.root) errs.push('dropdown was not kept as one header item');
    if (!header.voice) errs.push('rendered Voice has no text slug');
    if (!header.nested) errs.push('external links were not populated inside the dropdown');
    if (header.label !== 'Внеш. ссылки') errs.push('wrong Russian dropdown label: ' + header.label);
    const toggle = page.locator('#reader-pane .dg-external-links-toggle').first();
    await toggle.click();
    const menu = page.locator('#reader-pane .dg-external-links-menu').first();
    if (!await menu.isVisible()) errs.push('dropdown did not open');
    const box = await menu.boundingBox();
    const viewport = page.viewportSize();
    if (box && (box.x < 0 || box.x + box.width > viewport.width + 1)) errs.push('dropdown escapes the viewport: ' + JSON.stringify(box));
    const names = await menu.locator('a').allTextContents();
    if (!names.includes('SuttaCentral')) errs.push('full SuttaCentral name is missing: ' + names.join(', '));
    if (names.includes('SC')) errs.push('abbreviation is still shown instead of the full name');
    await page.keyboard.press('Escape');
    if (await menu.isVisible()) errs.push('Escape did not close the dropdown');
    if (await toggle.getAttribute('aria-expanded') !== 'false') errs.push('aria-expanded was not reset');
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) errs.push('horizontal scroll');
    return errs;
}

// Loose spelling finds the Pali word, but never a different word: moon is not monk (owner 2026-10-26).
async function checkLoose(page) {
    const errs = [];
    await page.goto(BASE + '/sn16.3?lang=en', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#sutta article .quote', { state: 'attached', timeout: 20000 });
    await page.waitForFunction(() => window.DGPageFind, null, { timeout: 15000 });
    const find = await page.evaluate(() => {
        const f = new DGPageFind({ root: document.getElementById('sutta') });
        return ['moon', 'bhikhave'].map(q => { f.setQuery(q); return f.matches.map(m => m.hit.toLowerCase()); });
    });
    if (find[0].some(h => h !== 'moon')) errs.push('find on page "moon" hit: ' + [...new Set(find[0])].join(', '));
    if (!find[1].length) errs.push('find on page "bhikhave" found no bhikkhave');
    await page.goto(BASE + '/candima?lang=en', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('div.dt-search input', { state: 'visible', timeout: 30000 });
    await page.waitForTimeout(1500);
    const rows = async q => {
        await page.fill('div.dt-search input', q);
        await page.waitForTimeout(700);
        return page.evaluate(() => { const api = new DataTable.Api('#pali'), s = api.settings()[0];
            return api.rows({ search: 'applied' }).indexes().toArray().map(i => s.aoData[i]._sFilterRow); });
    };
    const moon = await rows('moon');
    if (!moon.length || moon.some(r => !/moon/.test(r))) errs.push(`Filter "moon": ${moon.filter(r => !/moon/.test(r)).length} of ${moon.length} rows without moon`);
    return errs;
}

(async () => {
    const browser = await chromium.launch();
    let failed = 0;
    const run = async (name, viewport, fn) => {
        const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 600 });
        const page = await ctx.newPage();
        const jsErrors = [];
        page.on('pageerror', e => jsErrors.push('js: ' + e.message.split('\n')[0]));
        let errs;
        try { errs = await fn(page); } catch (e) { errs = [e.message.split('\n')[0]]; }
        errs = errs.concat(jsErrors);
        console.log(`${errs.length ? 'FAIL' : 'ok  '} ${name}${errs.length ? '\n     ' + errs.join('\n     ') : ''}`);
        if (errs.length) failed++;
        await ctx.close();
    };
    for (const viewport of [{ width: 412, height: 900 }, { width: 1280, height: 800 }])
        for (const c of CASES) await run(`${viewport.width}px ${c[0]} pali=${c[1]}`, viewport, page => check(page, c));
    await run('voice: speaker → Voice / Alt+R', { width: 1280, height: 800 }, checkVoice);
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }])
        await run(`external links: ready shell and dropdown (${viewport.width}px)`, viewport, checkExternalLinks);
    await run('loose spelling: find on page and the Filter box', { width: 1280, height: 800 }, checkLoose);
    await browser.close();
    console.log(failed ? `\n${failed} failed (${BASE})` : `\nall passed (${BASE})`);
    process.exit(failed ? 1 : 0);
})();
