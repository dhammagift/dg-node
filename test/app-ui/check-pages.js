// Pages that must exist in the app build, compared against the site.
//
// This is the check that found the "tile opens the search page" family (History, Materials, grammar,
// Tools, Abbr.): on a device a missing path is not a 404, it is index.html — so the reader taps
// "History" and gets the search box. Comparing the built app against the running site, page by page,
// is the only way that shows up without a phone in hand.
//
//   node test/app-ui/check-pages.js
//
// Needs: the pm2 "test" server on :3003 (or DG_SITE_URL), a built dg-app-full/www, and playwright-core.
const { launch, finish, startAppServer, waitForServer, pageFingerprint, APP, SITE, check, summary } = require('./lib');

// Profile name; its directory is removed when the run ends (see lib.finish).
const PROFILE = 'pages';

// The menu/tile surface plus the tools behind them. Paths, not titles: a title difference is the
// signal, and a fixed list keeps the check independent of menu markup changes.
const PAGES = [
    '/assets/common/history.html',
    '/assets/common/dictHelpRu.html',
    '/assets/common/dictHelp.html',
    '/assets/common/multiTool.html',
    '/assets/common/keyFeatures.html',
    '/assets/grammar/nouns.html',
    '/assets/grammar/verbs.html',
    '/assets/grammar/declentions.html',
    '/assets/materials/prat.html',
    '/assets/texts/abbr.html',
    '/assets/lbl.html',
    '/assets/lbl-en.html',
    '/assets/linebyline.html',
    '/assets/readylinebyline.html',
    '/assets/listdiff.html',
    '/assets/makelist.html',
    '/assets/rr.html',
    '/memo/index.html',
    '/settings/index.html',
];

(async () => {
    const server = startAppServer();
    await waitForServer(APP);
    const ctx = await launch(PROFILE);
    try {
        for (const url of PAGES) {
            const app = await pageFingerprint(ctx.pages()[0] || await ctx.newPage(), APP + url);
            const sitePage = await ctx.newPage();
            const site = await pageFingerprint(sitePage, SITE + url);
            await sitePage.close();
            check(`${url} matches the site`,
                app.title === site.title && !app.isSearch,
                `app="${app.title}" site="${site.title}" searchPage=${app.isSearch}`);
        }
    } finally {
            await finish(ctx, PROFILE);
        server.stop();
    }
    process.exit(summary() ? 0 : 1);
})();
