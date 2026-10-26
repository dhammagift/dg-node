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
    await page.waitForSelector('#sutta article .quote', { state: 'attached', timeout: 20000 });
    await page.waitForTimeout(800);
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
    await browser.close();
    console.log(failed ? `\n${failed} failed (${BASE})` : `\nall passed (${BASE})`);
    process.exit(failed ? 1 : 0);
})();
