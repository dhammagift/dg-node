// The check for the other half of "a missing file on a device is not a 404".
//
// In the app, a path Capacitor cannot resolve is answered with the root index.html. So a forgotten
// script does not fail as a 404 — it fails as a JavaScript SyntaxError with a Russian word from the
// page's own top comment in it ("Unexpected identifier 'показывать'"), in a file nobody suspects.
// That is exactly how /read/js/voice.js and the two page-find scripts reached a device.
//
// This walks the built bundle and, for every same-site URL the copied HTML/JS/CSS names, asks the
// strict server whether the file is really there — with the same exceptions the build itself allows
// (fonts that are absent from the legacy checkout too, .json-under-a-.js fallbacks, a handful of
// pages missing upstream). Kept deliberately in sync with build-assets.js's verifyReferencedAssets():
// the build fails first, and this catches what a rebuild alone cannot (a page that requests something
// at runtime).
//
//   node test/app-ui/check-assets.js
const fs = require('fs');
const path = require('path');
const { WWW, SITE, launch, finish, startAppServer, waitForServer, APP, check, summary } = require('./lib');

// Profile name; its directory is removed when the run ends (see lib.finish).
const PROFILE = 'assets';

// Pages worth loading in a browser: the ones the UI reaches, plus the tools that lazily inject their
// own scripts (which is where runtime references hide).
const PAGES = [
    '/',
    '/toc',
    '/memo/index.html',
    '/settings/index.html',
    '/assets/common/multiTool.html',
    '/assets/common/history.html',
    '/assets/grammar/nouns.html',
    '/assets/materials/prat.html',
    '/assets/texts/abbr.html',
    '/assets/linebyline.html',
];

// The same allowances the build makes; see REFERENCE_EXCEPTIONS in dg-app-full/build-assets.js.
const ALLOWED = [
    /^\/assets\/fonts\//,
    /^\/(nodejs\/res|settings|reader)\/[A-Za-z0-9_-]+\.js$/,
    /^\/nodejs\/dg_db\.js$/,
    /^\/read\/reader-rus-translations\.js$/,
    // Server-side config fetched by the voice player; may contain the TTS key, so it is deliberately
    // not bundled (see REFERENCE_EXCEPTIONS in build-assets.js).
    /^\/config\//,
    /^\/assets\/brru\/blurbs-ru\.js$/,
    /^\/assets\/materials\/(cases|conjugations|pali_cases_ru)\.html$/,
    /^\/assets\/grammar\/numerals(_declension)?\.html$/,
    /^\/assets\/common\/modalsSC\.html$/,
];

(async () => {
    const server = startAppServer({ strict: true });
    await waitForServer(APP);
    const ctx = await launch(PROFILE);

    // Per page: 4xx that are not allowed, and page errors. Errors are compared against the SAME page
    // on the site, because several legacy pages throw on the site too (grammar's showNumberOnly,
    // checkForceLocalFlag, …) — failing on those would make this check permanently red and useless.
    // Only an error the app has and the site does not is a bug in the build.
    const load = async (base, url) => {
        const page = await ctx.newPage();
        const bad = new Set();
        const errors = new Set();
        page.on('response', r => {
            if (r.status() >= 400) {
                const path_ = r.url().replace(base, '');
                if (!ALLOWED.some(re => re.test(path_))) bad.add(`${r.status()} ${path_}`);
            }
        });
        page.on('pageerror', e => errors.add(String(e).split('\n')[0].slice(0, 80)));
        await page.goto(base + url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(2500);
        await page.close();
        return { bad: [...bad], errors: [...errors] };
    };

    try {
        const problems = [];
        for (const url of PAGES) {
            const app = await load(APP, url);
            const site = await load(SITE, url);
            for (const b of app.bad) problems.push(`${url}: ${b}`);
            for (const e of app.errors) {
                if (!site.errors.includes(e)) problems.push(`${url}: app-only error "${e}"`);
            }
        }
        check('no missing assets and no app-only page errors',
            problems.length === 0, problems.slice(0, 5).join(' | '));

        // The TOC snapshots are not referenced by any page (platform.js maps /api/toc to them), so
        // nothing above would notice them disappearing — the navigator just goes empty. It happened.
        const snaps = fs.existsSync(path.join(WWW, 'api-snapshots'))
            ? fs.readdirSync(path.join(WWW, 'api-snapshots'))
            : [];
        check('TOC snapshots are present', snaps.includes('toc.json') && snaps.some(n => n.startsWith('toc-book-')),
            `${snaps.length} snapshot files`);
    } finally {
            await finish(ctx, PROFILE);
        server.stop();
    }
    process.exit(summary() ? 0 : 1);
})();
