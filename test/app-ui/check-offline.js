// The offline library on a phone, as far as a browser can stand in for one.
//
// Everything here was a real failure on a device at least once:
//   - /api/toc answered 404 because the TOC snapshots were not in www (the navigator was empty);
//   - /search and /api/text worked offline but the reader showed nothing for a pushState route;
//   - the settings page opened, but the version row stayed empty;
//   - a themed page left the status bar light (that one needs a device; only the page's own theme is
//     checked here).
//
// Needs the database in the profile's OPFS. On a fresh profile that means a 509MB download: set
// DG_APP_UI_ALLOW_DOWNLOAD=1 and be patient, or run this after check-progress-chunked.js has
// already put the library there (same profile directory).
//
//   node test/app-ui/check-offline.js
const {
    launch, finish, allowBigDownload, startAppServer, waitForServer, APP, LIBRARY_PROFILE, check, summary,
} = require('./lib');

// Profile name; its directory is removed when the run ends (see lib.finish).
const PROFILE = LIBRARY_PROFILE;

(async () => {
    const server = startAppServer();
    await waitForServer(APP);
    const ctx = await launch(PROFILE);
    const page = ctx.pages()[0] || await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 90)));

    // Same trick the app build uses for its own tests: distBase is the server this check started.
    await page.addInitScript(() => {
        window.DG_DIST_BASE = '/mobile-data';
        // The app asks before a download when the connection is metered; here it is local, and the
        // platform is the browser one, so consent is implicit. Nothing to stub.
    });

    try {
        await page.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        const opened = await page.evaluate(async () => {
            if (!window.dgOfflineLibrary) return { ok: false, why: 'no offline layer in the page' };
            try {
                const r = await Promise.race([
                    window.dgOfflineLibrary,
                    new Promise(res => setTimeout(() => res({ timedOut: true }), 20000)),
                ]);
                return { ok: true, result: r };
            } catch (e) { return { ok: false, why: String(e.message) }; }
        });

        const diag = await page.evaluate(() => (window.dgOfflineDiagnostics ? window.dgOfflineDiagnostics() : null));
        const local = !!(diag && diag.mode === 'local');

        if (!local) {
            console.log(`SKIP  offline checks — library not installed in this profile ` +
                `(${opened.why || 'still server-backed'}). Set DG_APP_UI_ALLOW_DOWNLOAD=1 for a full run.`);
            if (allowBigDownload('the offline library download')) {
                // Trigger the download the way the app's "Download now" does, then wait it out.
                await page.evaluate(() => window.dgStartOfflineDownload && window.dgStartOfflineDownload('open'));
                for (let i = 0; i < 200; i++) {
                    await page.waitForTimeout(3000);
                    const d = await page.evaluate(() => (window.dgOfflineDiagnostics ? window.dgOfflineDiagnostics() : null));
                    if (d && d.mode === 'local') break;
                }
                const after = await page.evaluate(() => window.dgOfflineDiagnostics());
                check('offline library downloads and opens', after.mode === 'local', JSON.stringify(after));
            }
        } else {
            check('offline library is active in this profile', true, JSON.stringify(diag));

            const search = await page.evaluate(async () => {
                const r = await fetch('/search?q=kacchapa&langs=ru,en');
                const j = await r.json();
                return { status: r.status, files: j.metadata && j.metadata.totalFiles };
            });
            check('offline search answers from the local database', search.status === 200 && search.files > 0, JSON.stringify(search));

            const toc = await page.evaluate(async () => {
                const r = await fetch('/api/toc');
                const t = await r.text();
                return { status: r.status, len: t.length };
            });
            check('offline TOC snapshot is present (/api/toc)', toc.status === 200 && toc.len > 500, JSON.stringify(toc));

            const reader = await page.goto(APP + '/dn22:2.2', { waitUntil: 'domcontentloaded', timeout: 60000 })
                .then(() => page.waitForTimeout(5000))
                .then(() => page.evaluate(() => ({ len: (document.body.innerText || '').length })))
                .catch(e => ({ len: 0, err: String(e.message) }));
            check('reader renders a pushState route offline', reader.len > 500, JSON.stringify(reader));

            await page.goto(APP + '/settings/index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
            await page.waitForTimeout(3000);
            await page.waitForTimeout(2500);   // the size arrives from the manifest a moment later
            const settings = await page.evaluate(() => ({
                rows: document.querySelectorAll('.row-title').length,
                offlineRow: !!document.getElementById('dgOfflineLibRow'),
                version: (document.getElementById('dgAppVersionDesc') || {}).textContent || '',
                offlineDesc: (document.getElementById('dgOfflineLibDesc') || {}).textContent || '',
            }));
            check('settings page renders with the offline row', settings.rows > 10 && settings.offlineRow, JSON.stringify(settings));
            check('the offline row states the library size', /\d+\s*(МБ|MB)/.test(settings.offlineDesc), settings.offlineDesc.trim());
            check('settings shows an app version', /^v\d/.test(settings.version.trim()), settings.version.trim());

            // Reader modes as URLs (configs/reader/mode-table.json): the legacy /memorize/?q=… and
            // /d/?q=… pages are gone from every link in dg-node, and ?mode=memorize renders offline.
            // ?mode=devanagari is NOT expected to work offline: it needs script conversion, which
            // is server-side (see the plan's "no local script engine yet") — checked as such below.
            const memorize = await page.goto(APP + '/sn56.11?mode=memorize', { waitUntil: 'domcontentloaded', timeout: 60000 })
                .then(() => page.waitForTimeout(8000))
                .then(() => page.evaluate(() => ({ len: (document.body.innerText || '').length,
                    url: location.pathname + location.search })))
                .catch(e => ({ len: 0, err: String(e.message) }));
            check('?mode=memorize renders offline', memorize.len > 3000 && memorize.url.includes('mode=memorize'),
                JSON.stringify(memorize));

            // Online-only mode (devanagari converts the script on the server): with the network
            // unreachable the app must SAY so and offer the browser, not just fail. Simulated here
            // by aborting every request to the real site, which is also how CI stays deterministic
            // (dhamma.gift is reachable from a runner).
            await page.route('https://dhamma.gift/**', route => route.abort());
            // addInitScript, not evaluate: the mode is opened by a real navigation, which would wipe
            // a listener installed into the current document (that mistake made this check report
            // "no event" while the app was working correctly).
            await page.addInitScript(() => {
                window.__onlineOnly = [];
                window.addEventListener('dg:online-only', e => window.__onlineOnly.push(e.detail));
                window.__dialog = null; window.__browserOpen = null;
                window.Capacitor = { Plugins: {
                    Dialog: { confirm: (opts) => { window.__dialog = opts; return Promise.resolve({ value: true }); } },
                    Browser: { open: (o) => { window.__browserOpen = o.url; return Promise.resolve(); } },
                } };
            });
            await page.goto(APP + '/sn56.11?mode=devanagari', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
            await page.waitForTimeout(8000);
            const onlineOnly = await page.evaluate(() => ({
                events: (window.__onlineOnly || []).map(e => e.reason),
                dialog: window.__dialog && window.__dialog.message,
                opened: window.__browserOpen,
            }));
            check('an online-only mode warns and offers the browser',
                onlineOnly.events.includes('script') && !!onlineOnly.dialog &&
                String(onlineOnly.opened).includes('dhamma.gift/sn56.11?mode=devanagari'),
                JSON.stringify(onlineOnly));
            await page.unroute('https://dhamma.gift/**');

            // Dynamic shortcuts: the payload the page hands to DgShortcuts must contain only real
            // texts (the owner's launcher showed "toc", "bupm", "история", "запись1", "запись2"),
            // at most two of them — Contents/Favorites/Dictionary/Memo are static XML now.
            // The stub has to be an init script (it must exist before native-bridge runs) and the
            // reload has to happen from here: calling location.reload() inside page.evaluate is the
            // documented way to make the evaluate itself die with the context.
            await page.addInitScript(() => {
                window.Capacitor = window.Capacitor || {};
                window.Capacitor.Plugins = window.Capacitor.Plugins || {};
                window.Capacitor.Plugins.DgShortcuts = { set: (p) => { window.__shortcutPayload = p; return Promise.resolve(); } };
                // native-bridge pushes the list from inside its App-plugin block (that is where the
                // back-button hook lives too), so a stub without App would make this check pass by
                // never running the code under test.
                window.Capacitor.Plugins.App = {
                    addListener: () => Promise.resolve(),
                    getInfo: () => Promise.resolve({ version: 'test', build: '1' }),
                    exitApp: () => {},
                };
            });
            await page.evaluate(() => {
                localStorage.setItem('localSearchHistory', JSON.stringify([
                    ['toc', '/toc', '2026-01-01'], ['bupm', '/bupm', '2026-01-02'],
                    ['запись1', '/memo/index.html', '2026-01-03'],
                    ['черепаха', '/?q=%D1%87%D0%B5%D1%80%D0%B5%D0%BF%D0%B0%D1%85%D0%B0', '2026-01-04'],
                    ['kacchapa', '/sn56.11?s=Kacchap', '2026-01-05'],
                ]));
                localStorage.setItem('dg_favorites', JSON.stringify([{ slug: 'dn22', title: 'DN 22' }]));
            });
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(4000);
            const shortcuts = await page.evaluate(() => window.__shortcutPayload);
            const payload = shortcuts && shortcuts.items ? shortcuts.items : [];
            check('dynamic shortcuts contain only recent texts, at most two',
                payload.length > 0 && payload.length <= 2 &&
                payload.every(i => /^\/[a-z][a-z-]*\d/i.test(i.route)) &&
                !payload.some(i => /bupm|memo|\?q=/.test(i.route)),
                JSON.stringify(payload));

            await page.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(2000);

            // The local-only links (bb, ai, the local TBW mirror) must NOT appear by default — the
            // app's own origin is https://localhost, and treating a local hostname as "the mirror
            // is here" showed them to every app user (owner's screenshot of dn1). The explicit
            // switch is localStorage.forceLocal, settable by ?force_local=1 or by typing the word
            // in the search box.
            const readLinks = async () => {
                await page.goto(APP + '/dn1', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
                await page.waitForTimeout(7000);
                return page.evaluate(() => [...document.querySelectorAll('.sc-ext-link')].map(a => a.textContent.trim()));
            };
            await page.evaluate(() => { try { localStorage.removeItem('forceLocal'); } catch (e) {} });
            const withoutFlag = await readLinks();
            check('the local-only reader links are hidden by default (no bb/ai)',
                !withoutFlag.includes('bb') && !withoutFlag.includes('ai'),
                JSON.stringify(withoutFlag));

            await page.evaluate(() => { try { localStorage.setItem('forceLocal', 'true'); } catch (e) {} });
            const withFlag = await readLinks();
            check('the secret switch reveals them (?force_local=1 / typed word)',
                withFlag.includes('bb') && withFlag.includes('ai'), JSON.stringify(withFlag));
            await page.evaluate(() => { try { localStorage.removeItem('forceLocal'); } catch (e) {} });

            const links = await page.evaluate(async () => {
                try {
                    const r = await fetch('/nodejs/res/menu-links.json');
                    const t = await r.text();
                    return { legacyMemorize: (t.match(/memorize\/\?q=/g) || []).length,
                             modeMemorize: (t.match(/mode=memorize/g) || []).length };
                } catch (e) {
                    // Reading the file through the page can fail while the shim is mid-recovery;
                    // fall back to the server copy, which is the same file the app bundles.
                    return { error: String(e), legacyMemorize: null, modeMemorize: null };
                }
            });
            if (links.error) {
                const fs = require('fs');
                const path = require('path');
                const file = path.join(require('./lib').WWW, 'nodejs/res/menu-links.json');
                const t = fs.readFileSync(file, 'utf8');
                links.legacyMemorize = (t.match(/memorize\/\?q=/g) || []).length;
                links.modeMemorize = (t.match(/mode=memorize/g) || []).length;
            }
            check('menu links use reader modes, not the legacy /memorize/ page',
                links.legacyMemorize === 0 && links.modeMemorize > 0, JSON.stringify(links));

            await page.goto(APP + '/memo/index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
            await page.waitForTimeout(3000);
            const memo = await page.evaluate(() => ({
                title: document.title,
                bridge: [...document.scripts].some(s => (s.src || '').includes('native-bridge')),
            }));
            check('memorisation app is bundled and bridged', memo.bridge && memo.title.length > 0, JSON.stringify(memo));
        }

        // The bridge has to be in every page that came from the legacy tree, otherwise Android's back
        // button does nothing there (the reader could only kill the app — owner's report).
        const grammar = await ctx.newPage();
        await grammar.goto(APP + '/assets/grammar/nouns.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
        await grammar.waitForTimeout(2000);
        const grammarInfo = await grammar.evaluate(() => ({
            bridge: [...document.scripts].some(s => (s.src || '').includes('native-bridge')),
            phpLinks: [...document.querySelectorAll('a[href*="read.php"]')].length,
        }));
        await grammar.close();
        check('legacy pages carry native-bridge.js (back button)', grammarInfo.bridge, JSON.stringify(grammarInfo));
        check('no links to the PHP reader (read.php) in bundled pages', grammarInfo.phpLinks === 0, `found ${grammarInfo.phpLinks}`);

        // Only errors that mean breakage: the legacy grammar page throws showNumberOnly on the site
        // too, so it is ignored here explicitly rather than silently.
        const real = errors.filter(e => !/showNumberOnly/.test(e));
        check('no unexpected page errors', real.length === 0, real.slice(0, 3).join(' | '));
    } finally {
            await finish(ctx, PROFILE);
        server.stop();
    }
    process.exit(summary() ? 0 : 1);
})();
