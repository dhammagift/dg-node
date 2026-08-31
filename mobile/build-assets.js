// Resolves every real asset search/index.html references — the static <script>/<link> tags plus
// everything ensureSearchAssets()/ensureReaderAssets()/ensureTocAssets() lazily inject inside that
// file's own inline SPA engine — and copies each one into mobile/www/ at the IDENTICAL relative
// URL path production serves it at. That's the whole point: the copied index.html (see
// build-page.js) needs zero path edits, because every /assets/..., /reader/..., /nodejs/res/...
// URL it requests already resolves on disk exactly the way dg-light.js's static mounts resolve it.
//
// Mirrors dg-light.js's override-then-legacy resolution order (public/overrides/... wins,
// /var/www/html/assets/... is the fallback) WITHOUT requiring anything from dg-light.js — mobile/
// stays isolated from the live server (see CLAUDE.md, project memory: never require() either way).
//
// Also regenerates the two script bundles dg-light.js's buildScriptBundle() builds at server
// startup (there's no server here to do that for us), plus reader/mode-table.json's
// server-computed `availableLangs` field (normally a directory scan dg-light.js does at request
// time) baked to whatever languages this build actually bundles.
//
// Usage: node build-assets.js [--langs=ru,en]

const fs = require('fs');
const path = require('path');

const NODEJS_ROOT = path.join(__dirname, '..');
const LEGACY_ASSETS = '/var/www/html/assets';
const WWW = path.join(__dirname, 'www');

function parseArgs() {
    const args = { langs: ['ru', 'en'] };
    for (const arg of process.argv.slice(2)) {
        const [key, value] = arg.replace(/^--/, '').split('=');
        if (key === 'langs') args.langs = value.split(',');
    }
    return args;
}

// { url: where search/index.html fetches it from, sources: candidate absolute paths, first
// existing one wins — same precedence as dg-light.js's override-then-legacy static mounts }
const ASSETS = [
    // ---- head, eager ----
    { url: '/assets/js/dhamma-i18n.js', sources: [f('public/overrides/js/dhamma-i18n.js')] },
    { url: '/assets/js/mirror-link.js', sources: [f('public/overrides/js/mirror-link.js')] },
    { url: '/manifest.json', sources: [f('configs/manifest.json')] },
    { url: '/nodejs/res/menu-links.json', sources: [f('configs/search/menu-links.json')] },
    { url: '/assets/img/favico-noglass.png', sources: [l('img/favico-noglass.png')] },
    { url: '/assets/css/bootstrap.5.3.1.min.css', sources: [l('css/bootstrap.5.3.1.min.css')] },
    { url: '/assets/css/langswitch.css', sources: [f('public/overrides/css/langswitch.css')] },
    { url: '/assets/css/paliLookup.css', sources: [l('css/paliLookup.css')] },
    { url: '/assets/css/extrastyles.css', sources: [l('css/extrastyles.css')] },
    { url: '/assets/js/fontawesome-local.js', sources: [f('public/overrides/js/fontawesome-local.js')] },
    { url: '/assets/css/table.css', sources: [l('css/table.css')] },
    { url: '/nodejs/res/css/home.css', sources: [f('search/css/home.css')] },
    { url: '/assets/js/jquery-3.7.0.min.js', sources: [l('js/jquery-3.7.0.min.js')] },
    { url: '/assets/js/bootstrap.bundle.5.3.1.min.js', sources: [l('js/bootstrap.bundle.5.3.1.min.js')] },
    { url: '/assets/js/openFdg.js', sources: [l('js/openFdg.js')] },
    { url: '/assets/js/smoothScroll.js', sources: [f('public/overrides/js/smoothScroll.js')] },
    { url: '/assets/js/langswitch.js', sources: [f('public/overrides/js/langswitch.js')] },
    { url: '/assets/js/themeswitch.js', sources: [l('js/themeswitch.js')] },
    { url: '/assets/js/openDicts.js', sources: [l('js/openDicts.js')] },
    { url: '/assets/js/autopali.js', sources: [f('public/overrides/js/autopali.js')] },
    { url: '/assets/js/uihelp.js', sources: [l('js/uihelp.js')] },
    { url: '/assets/css/jquery-ui.min.css', sources: [l('css/jquery-ui.min.css')] },
    { url: '/assets/js/jquery-ui.min.js', sources: [l('js/jquery-ui.min.js')] },
    // paliLookup.js itself is a local script (Category B). Its dict.dhamma.gift iframe modes
    // ("dpdfull" etc, and the "newwindow" mode) are genuinely online-only (Category C) and
    // deliberately not shimmed. BUT: owner (real usage) — "не работает словарь встроенный" —
    // "standalone"/"standaloneru" (word-tap popup dictionary) is actually the DEFAULT mode
    // whenever the user hasn't picked one (see paliLookup.js's own fallback right after
    // `if (savedDict) {...} else { savedDict = "standalone(ru)" }`), and it's fully offline —
    // it works off 3 plain JS data files (dpd_i2h/dpd_deconstructor/dpd_ebts, ~24MB for both
    // langs), no dict.dhamma.gift involved at all. Those 3 were the actual missing piece.
    { url: '/assets/js/paliLookup.js', sources: [f('public/overrides/js/paliLookup.js')] },
    { url: '/assets/js/standalone-dpd/dpd_i2h.js', sources: [l('js/standalone-dpd/dpd_i2h.js')] },
    { url: '/assets/js/standalone-dpd/dpd_deconstructor.js', sources: [l('js/standalone-dpd/dpd_deconstructor.js')] },
    { url: '/assets/js/standalone-dpd/dpd_ebts.js', sources: [l('js/standalone-dpd/dpd_ebts.js')] },
    { url: '/assets/js/standalone-dpd/ru/dpd_ebts.js', sources: [l('js/standalone-dpd/ru/dpd_ebts.js')] },
    // Lazy-loaded by settings.js's toggleQuickModal() stub (script.src = "/assets/js/quickModal.js")
    // on first Quick Menu open — was missing here entirely, so that fetch 404'd and History/
    // Favorites/Quick search never rendered offline (the stub silently swallows script.onerror).
    { url: '/assets/js/quickModal.js', sources: [f('public/overrides/js/quickModal.js')] },
    { url: '/assets/img/buttons/chrome-cta.png', sources: [l('img/buttons/chrome-cta.png')] },
    { url: '/assets/img/buttons/firefox-cta.png', sources: [l('img/buttons/firefox-cta.png')] },
    { url: '/assets/img/buttons/edge-cta.png', sources: [l('img/buttons/edge-cta.png')] },
    { url: '/assets/img/buttons/opera-cta.png', sources: [l('img/buttons/opera-cta.png')] },
    { url: '/assets/img/buttons/google-play-cta.png', sources: [l('img/buttons/google-play-cta.png')] },
    { url: '/assets/img/buttons/apk-cta.png', sources: [l('img/buttons/apk-cta.png')] },
    { url: '/assets/img/buttons/telegram-cta.png', sources: [l('img/buttons/telegram-cta.png')] },

    // ---- ensureSearchAssets() (lazy, first search) ----
    { url: '/assets/js/datatables/datatables.min.css', sources: [l('js/datatables/datatables.min.css')] },
    { url: '/assets/js/datatables/datatables.min.js', sources: [l('js/datatables/datatables.min.js')] },
    { url: '/assets/js/search-render.js', sources: [f('public/overrides/js/search-render.js')] },
    { url: '/assets/js/natural.js', sources: [l('js/natural.js')] },
    { url: '/assets/js/strip-html.js', sources: [l('js/strip-html.js')] },

    // ---- ensureReaderAssets() (lazy, idle-prefetched) ----
    { url: '/reader/css/index.css', sources: [f('reader/css/index.css')] },
    { url: '/reader/css/rus-multi.css', sources: [f('reader/css/rus-multi.css')] },
    { url: '/reader/css/uiextra.css', sources: [f('reader/css/uiextra.css')] },
    { url: '/assets/js/copyToClipboard.js', sources: [f('public/overrides/js/copyToClipboard.js')] },
    { url: '/assets/js/linksdpr.js', sources: [l('js/linksdpr.js')] },
    { url: '/assets/js/linksbjt.js', sources: [l('js/linksbjt.js')] },
    { url: '/assets/js/linksbw.js', sources: [l('js/linksbw.js')] },
    { url: '/assets/js/linksru.js', sources: [l('js/linksru.js')] },
    { url: '/reader/common.js', sources: [f('reader/common.js')] },
    { url: '/reader/megareader.js', sources: [f('reader/megareader.js')] },

    // ---- loadPiEnRuScripts() / wireResultLinks() (lazy, quick-link columns) ----
    { url: '/assets/js/openDpr.js', sources: [l('js/openDpr.js')] },
    { url: '/assets/js/openRu.js', sources: [l('js/openRu.js')] },
    { url: '/assets/js/openBw.js', sources: [l('js/openBw.js')] },

    // ---- ensureTocAssets() — TOC data (/api/toc*) is deliberately not shimmed yet (deferred,
    // see plan), but the script itself is cheap to ship so the TOC pane fails softly (empty/error
    // state) instead of a script-load error. ----
    { url: '/spa/toc.js', sources: [f('public/spa/toc.js')] },

    // ---- static config JSON/HTML (category B — server just serves these as files, no logic) ----
    { url: '/reader/translator-priority.json', sources: [f('configs/reader/translator-priority.json')] },
    { url: '/reader/lang_ru.json', sources: [f('configs/reader/lang_ru.json')] },
    { url: '/reader/lang_en.json', sources: [f('configs/reader/lang_en.json')] },
    { url: '/reader/bu-pm-fragment.html', sources: [f('reader/bu-pm-fragment.html')] },
    { url: '/reader/bi-pm-fragment.html', sources: [f('reader/bi-pm-fragment.html')] },
    { url: '/assets/js/translators.json', sources: [l('js/translators.json')] },
    { url: '/nodejs/res/lang_ru.json', sources: [f('configs/search/lang_ru.json')] },
    { url: '/nodejs/res/lang_en.json', sources: [f('configs/search/lang_en.json')] },
    { url: '/assets/i18n/lang_global_en.json', sources: [f('public/overrides/i18n/lang_global_en.json')] },
    { url: '/assets/i18n/lang_global_ru.json', sources: [f('public/overrides/i18n/lang_global_ru.json')] },
    { url: '/nodejs/res/slides.json', sources: [f('configs/search/slides.json')] },
    { url: '/nodejs/res/announcements.json', sources: [f('configs/search/announcements.json')] },
    { url: '/nodejs/res/dict-modes.json', sources: [f('configs/search/dict-modes.json')] },
    { url: '/settings/scripts.json', sources: [f('settings/scripts.json')] },
    // Server-generated at startup (buildTranslatorCatalogCache in dg-light.js) — static once
    // built, same treatment as settings-bundle.js/home-bundle.js above: snapshot the current
    // file rather than reimplement the aggregation. Used by /spa/toc.js for translator badges.
    { url: '/settings/translator-catalog.json', sources: [f('settings/translator-catalog.json')] },
    // Master settings page (settings/index.html) — a SEPARATE page from search/index.html (the
    // gear icon does a real navigation to /settings/, not a modal), copied verbatim the same way,
    // plus its own small dependency surface (all static — no server logic beyond what's already
    // bundled above). buildSettingsDemoCache()/buildLangCountsCache() in dg-light.js generate the
    // two JSON files at server startup — same one-time-snapshot treatment as translator-catalog.
    { url: '/settings/index.html', sources: [f('settings/index.html')] },
    { url: '/settings/preview-frame.html', sources: [f('settings/preview-frame.html')] },
    { url: '/settings/demo-data.json', sources: [f('settings/demo-data.json')] },
    { url: '/settings/lang-counts.json', sources: [f('settings/lang-counts.json')] },
    { url: '/assets/css/styles.css', sources: [l('css/styles.css')] },
    { url: '/assets/texts/sutta_words.txt', sources: [l('texts/sutta_words.txt')] },
    { url: '/assets/js/textinfo.js', sources: [l('js/textinfo.js')] },

    // ---- header/shell images (the persistent search bar's surrounding chrome) ----
    { url: '/assets/img/dgsanhkalogo.png', sources: [l('img/dgsanhkalogo.png')] },
    { url: '/assets/img/dgsankhaonly.png', sources: [l('img/dgsankhaonly.png')] },
    { url: '/assets/img/gray.png', sources: [l('img/gray.png')] },
    { url: '/assets/img/logo4nt_plain.png', sources: [l('img/logo4nt_plain.png')] },
    { url: '/assets/img/read/favicon-black.png', sources: [l('img/read/favicon-black.png')] },
];

function f(rel) { return path.join(NODEJS_ROOT, rel); }
function l(rel) { return path.join(LEGACY_ASSETS, rel); }

function copyAsset({ url, sources }) {
    const src = sources.find(p => fs.existsSync(p));
    if (!src) {
        console.warn(`MISSING: ${url} — none of ${sources.join(', ')} exist`);
        return false;
    }
    const dest = path.join(WWW, url);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return true;
}

// Same concatenation dg-light.js's buildScriptBundle() does at server startup — copied, not
// require()'d, to keep mobile/ decoupled from the live server (CLAUDE.md, project memory).
function buildScriptBundles() {
    const pairs = [
        { out: '/assets/js/settings-bundle.js', sources: [
            f('public/overrides/js/settings.js'),
            f('public/overrides/js/dg-text-router.js'),
        ] },
        { out: '/assets/js/home-bundle.js', sources: [
            f('public/overrides/js/randPlaceholder.js'),
            f('search/js/home.js'),
        ] },
    ];
    for (const { out, sources } of pairs) {
        const parts = sources.map(src => `// ---- ${path.relative(NODEJS_ROOT, src)} ----\n${fs.readFileSync(src, 'utf8')}`);
        let content = parts.join('\n;\n');
        if (out.endsWith('settings-bundle.js')) {
            // ponytail: the probe is already dead code under Capacitor's default `localhost`
            // hostname (its own guard skips it there) — this is defense-in-depth, not a fix for
            // an active bug. Upgrade path if that ever changes: make the probe itself Capacitor-aware.
            content = content.replace(
                "if (window.location.hostname !== '127.0.0.1' && window.location.hostname !== 'localhost') {",
                "if (false) { // ponytail: neutered for offline app build (mobile/build-assets.js) — no local dev server to redirect to"
            );
        }
        const dest = path.join(WWW, out);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, content, 'utf8');
    }
}

// dg-light.js serves this by hand-merging the static file with a directory-scan-computed
// `availableLangs` (READER_LANGS) — no live server here to scan anything, so bake it to whatever
// this build actually bundles (mobile/dist/lang_<code>.db, see build-offline-db.js).
function buildModeTable(langs) {
    const modeTable = JSON.parse(fs.readFileSync(f('configs/reader/mode-table.json'), 'utf8'));
    const dest = path.join(WWW, 'reader', 'mode-table.json');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify({ ...modeTable, availableLangs: langs }, null, 2), 'utf8');
}

function copySvgIcons() {
    const srcDir = path.join(LEGACY_ASSETS, 'svg');
    const destDir = path.join(WWW, 'assets', 'svg');
    fs.mkdirSync(destDir, { recursive: true });
    for (const name of fs.readdirSync(srcDir)) {
        fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
    }
    return fs.readdirSync(srcDir).length;
}

function copyReaderImages() {
    const srcDir = f('reader/images');
    const destDir = path.join(WWW, 'reader', 'images');
    fs.mkdirSync(destDir, { recursive: true });
    for (const name of fs.readdirSync(srcDir)) {
        fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
    }
}

// settings/index.html is copied verbatim (via ASSETS above) on every run — this patches the
// copy afterward, same one-liner every time, so a re-run after a site update doesn't silently
// drop it. Gives the "Log in" button (native-bridge.js) a real browser to run Google/Firebase
// auth in — see that file's header for why the WebView itself can't do it.
function injectNativeBridge() {
    const dest = path.join(WWW, 'settings', 'index.html');
    let html = fs.readFileSync(dest, 'utf8');
    const tag = '<script src="/native-bridge.js"></script>\n';
    if (!html.includes(tag)) html = html.replace('<head>', `<head>\n${tag}`);
    fs.writeFileSync(dest, html, 'utf8');
}

// dg-docs (Help/Docs portal): deliberately NOT bundled. First cut baked the ~23MB Docusaurus
// build (en+ru) into the APK, but owner (weighing APK size vs. offline benefit): docs are read
// occasionally, not offline-critical the way search/reader are — the DB download at first launch
// already costs real MB/time, docs shouldn't tax every install for content most sessions never
// open. native-bridge.js routes /docs and /ru/docs links to the live site instead (same treatment
// as memo/login — see that file). A real "download docs for offline" toggle is a bigger separate
// feature (packaging+extracting a whole static site tree at runtime, not a single blob like the
// DBs) — worth doing if actually wanted, not implemented here.

function main() {
    const args = parseArgs();
    let ok = 0, missing = 0;
    for (const asset of ASSETS) {
        if (copyAsset(asset)) ok++; else missing++;
    }
    buildScriptBundles();
    buildModeTable(args.langs);
    const svgCount = copySvgIcons();
    copyReaderImages();
    injectNativeBridge();
    console.log(`Assets: ${ok} copied, ${missing} missing. +${svgCount} svg icons, reader/images/, 2 generated bundles, mode-table.json (langs=${args.langs.join(',')}).`);
    if (missing > 0) process.exitCode = 1;
}

main();
