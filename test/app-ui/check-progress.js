// "Does the app tell the reader how long to wait?" — the check for the progress card.
//
// The bug this exists for: the denominator came only from the Content-Length header, and the
// deployment the app downloads from answers with a chunked response that has none. Result on a
// phone: a bar sliding side to side, no percentage, no "X of Y MB", the same in the status-bar
// notification — the reader could not tell 5% from 95% (owner, twice).
//
// server-chunked.js serves the database exactly that way (no Content-Length, no Accept-Ranges), so a
// regression shows up here instead of on a device.
//
//   node test/app-ui/check-progress.js
//
// Downloads the whole database into this check's own browser profile (~509MB, ~1-2 minutes locally).
const {
    launch, finish, allowBigDownload, startAppServer, waitForServer, CHUNKED_PORT, LIBRARY_PROFILE, check, summary,
} = require('./lib');

// Profile name; its directory is removed when the run ends (see lib.finish).
const PROFILE = LIBRARY_PROFILE;

(async () => {
    if (!allowBigDownload('check-progress.js')) process.exit(0);
    const server = startAppServer({ chunked: true });
    const url = `http://127.0.0.1:${CHUNKED_PORT}`;
    await waitForServer(url);
    const ctx = await launch(PROFILE);
    const page = ctx.pages()[0] || await ctx.newPage();

    // First launch of a fresh install: nothing stored, the page starts the download itself.
    await page.addInitScript(() => {
        window.DG_DIST_BASE = '/mobile-data';
        try { localStorage.setItem('dg.offline.wantData', '1'); } catch (e) {}
    });

    const seen = [];
    try {
        await page.goto(url + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        for (let i = 0; i < 60; i++) {
            await page.waitForTimeout(4000);
            const card = await page.evaluate(() => {
                const c = document.getElementById('dgDlCard');
                if (!c) return null;
                return {
                    pct: (c.querySelector('.dgdl-pct') || {}).textContent || '',
                    sub: (c.querySelector('.dgdl-sub') || {}).textContent || '',
                    indeterminate: c.classList.contains('indeterminate'),
                    width: (c.querySelector('.dgdl-fill') || {}).style ? c.querySelector('.dgdl-fill').style.width : '',
                };
            });
            if (card) seen.push(card);
            if (card && card.pct === '100%') break;
        }

        const pct = seen.filter(s => /^\d+%$/.test(s.pct) && s.pct !== '100%');
        check('progress card appears at all', seen.length > 0);
        check('percentage is shown while downloading (not indeterminate)',
            pct.length > 0, pct.length ? `e.g. ${pct[0].pct} — ${pct[0].sub}` : 'no percentage ever appeared');
        check('total size is known ("X of Y MB")',
            seen.some(s => /\d+ MB of \d+ MB/.test(s.sub)), seen[0] ? seen[0].sub : '');
        check('the bar is filled proportionally, not animated',
            pct.length > 0 && pct.every(s => !s.indeterminate && /%$/.test(s.width)),
            pct.length ? `${pct[0].width} (indeterminate=${pct[0].indeterminate})` : '');
        check('the transfer finishes and reports the real total',
            seen.some(s => s.pct === '100%' && /\d+ MB of \d+ MB/.test(s.sub)),
            seen.length ? seen[seen.length - 1].sub : '');
    } finally {
            await finish(ctx, PROFILE);
        server.stop();
    }
    process.exit(summary() ? 0 : 1);
})();
