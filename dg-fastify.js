// dg-fastify.js — the production server (SQLite/FTS5 via dg.db), run under pm2 as "dg-prod".
// Started life as an A/B port of dg-light.js (the older Express + grep server, see CLAUDE.md)
// to benchmark the two frameworks on identical business logic; that benchmark is over and this
// file won. dg-light.js is now legacy/unused — nothing requires() it and nothing runs it in
// prod — kept in the repo only as reference until it's archived. The two files still don't
// require() each other (comments below compare behavior for historical/porting context).
const { DatabaseSync } = require('node:sqlite');
const Fastify = require('fastify');
const fastifyStatic = require('@fastify/static');
const fastifyCompress = require('@fastify/compress');
const fastifyCors = require('@fastify/cors');
const fs = require('fs').promises;
const path = require('path');
const fsSync = require('fs');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const openapiSpec = require('./configs/openapi.json');
const openapiSpecEn = require('./configs/openapi.en.json');
const { default: Aksharamukha, Scripts: AKSH_SCRIPTS } = require('aksharamukha');
// Same classifier the client (search/index.html's textIdFromPath) uses to recognize a text id —
// reused here so a shared link like "an 10.72" (space instead of dot — Android share sheets do
// this) resolves server-side too, not just when the client's own copy happens to be loaded yet.
const { DgTextRouter } = require('./public/overrides/js/dg-text-router.js');
// AI-search fallback (see docs/AI_SEARCH_BRIEF.md) — three independent, optional modules: the
// route below degrades to "AI unavailable" if any of them throws (missing keys, provider down,
// friend's MCP server unreachable), it never breaks plain exact search.
const { normalizeQuery } = require('./core/ai-search.js');
const { searchHybrid } = require('./core/tipitaka-mcp-client.js');
const { verifyCandidates, lookupWord } = require('./core/dpd-lookup.js');
const { mcpHandler } = require('./core/mcp-server.js');

// The search/reader core lives in core/search-core.js — see that file for why. Destructured
// here so the routes below read exactly as they did when the functions were declared in this
// file; init() and setSkeleton() hand it the database and the sutta index.
const searchCore = require('./core/search-core');
const {
    DEFAULT_SCOPE_PREFIXES,
    INTERLINEAR_TRANSLATOR_KEYS,
    MODE_TABLE,
    READER_LANGS,
    TOC_BOOKS,
    TOC_CODES,
    TRANSLATOR_PRIORITY,
    buildFastResponse,
    buildMatchSkeleton,
    buildSearchResponse,
    buildTextDataFromBase,
    buildWordReport,
    buildWordReportFast,
    enrichSuttaBatch,
    filterPreferredTranslators,
    findVariantSegments,
    getFullTextData,
    getSuttaBaseData,
    getSuttaMeta,
    translatorLangsFallback,
    langFilterSql,
    matchesScope,
    navFor,
    resolveAllowedPrefixes,
    sortSuttaResults,
    sqlRowsIn,
    stripSearchPunctuation,
    suggestWords,
} = searchCore;

// bodyLimit mirrors the express.text({limit:'10mb'}) on /assets/lbl-save.php below — Fastify's
// body limit is instance-wide, not per-route, so it's set here instead.
const app = Fastify({ bodyLimit: 10 * 1024 * 1024 });
// 3000 is where production serves from (both dhamma.gift and test.dhamma.gift proxy here);
// dg-light.js, the legacy Express server, defaults to 3001 so the two can run side by side.
const PORT = Number(process.env.PORT) || 3003;

// The only POST route in this file (/assets/lbl-save.php) always wants the raw body as a string,
// regardless of what Content-Type the client sends — same as express.text({type:'*/*'}) did.
// Removing the default parsers (json/urlencoded) is safe: no other route reads a body.
app.removeAllContentTypeParsers();
app.addContentTypeParser('*', { parseAs: 'string' }, (req, body, done) => done(null, body));

// text/html helper standing in for Express's res.sendFile() (Fastify has no built-in equivalent
// outside @fastify/static's single-root reply decorator, which doesn't fit the multi-root
// override/fallback mounts below) — every sendFile() call in this file targets a known .html/.js
// file, so a small explicit-type reader covers all of them.
// Express's res.sendFile() attaches an ETag for free and answers 304 on a matching
// If-None-Match; this hand-rolled stand-in has to do it explicitly, or every route built on it
// re-sends the whole body on each visit. That matters most for the config JSON, which cache.md
// deliberately serves with no-cache — no-cache means "revalidate every time", which is only
// cheap if a 304 is possible.
async function sendFile(req, reply, filePath, type) {
    const buf = await fs.readFile(filePath);
    const etag = '"' + crypto.createHash('md5').update(buf).digest('hex') + '"';
    reply.header('etag', etag);
    if (req && req.headers['if-none-match'] === etag) return reply.code(304).send();
    reply.type(type || 'text/html; charset=utf-8');
    return reply.send(buf);
}

// Express's req.originalUrl.slice(req.path.length) trick for "just the ?query part" — Fastify
// has no req.path (that's Express-only), but request.url already IS the full path+query (like
// originalUrl), so the query is just whatever comes after its own '?'.
function queryString(req) {
    const qIdx = req.url.indexOf('?');
    return qIdx === -1 ? '' : req.url.slice(qIdx);
}

// ---------------------------------------------------------------------------------------
// Cache policy (see cache.md at repo root for the full design writeup) — content-hash
// versioning for our own static assets (§1-2) + differentiated Cache-Control by content
// type (§3) and by dynamic-route family (§4-5). Byte-identical logic to dg-light.js's
// same-named helpers (pure Node, no framework API surface) except sendVersionedHtml, which
// is adapted to Fastify's reply API.
// ---------------------------------------------------------------------------------------

const crypto = require('crypto');

const assetVersionCache = new Map(); // absPath -> { mtimeMs, hash }
function getAssetVersion(absPath) {
    try {
        const stat = fsSync.statSync(absPath);
        const cached = assetVersionCache.get(absPath);
        if (cached && cached.mtimeMs === stat.mtimeMs) return cached.hash;
        const hash = crypto.createHash('md5').update(fsSync.readFileSync(absPath)).digest('hex').slice(0, 10);
        assetVersionCache.set(absPath, { mtimeMs: stat.mtimeMs, hash });
        return hash;
    } catch { return null; }
}

const VERSIONED_STATIC_ROOTS = [
    path.join(__dirname, 'public', 'overrides'),
    path.join(__dirname, 'public', 'spa'),
    path.join(__dirname, 'search'),
    path.join(__dirname, 'reader'),
    path.join(__dirname, 'settings'),
];
const HTML_ASSET_URL_ROOTS = {
    '/assets': VERSIONED_STATIC_ROOTS[0],
    '/spa': VERSIONED_STATIC_ROOTS[1],
    '/nodejs/res': VERSIONED_STATIC_ROOTS[2],
    '/reader': VERSIONED_STATIC_ROOTS[3],
    '/settings': VERSIONED_STATIC_ROOTS[4],
};

// New function alongside sendFile, not a mode flag on it — sendFile stays a generic
// "read a file, send with optional content-type" helper (used for non-HTML cases too:
// /config/*.json, /sw.js); this one only rewrites HTML entry points.
//
// ETag (md5 of the fully-rewritten body, so it changes whenever any referenced asset's own
// version does, not just when the HTML source itself changes) added after an owner-run
// cache-header checker on the live site flagged: `max-age=0, must-revalidate` with no
// validator means every revalidation is a full re-download, never a cheap 304 — "stale
// cache can only be re-validated with a full download". This keeps must-revalidate's
// guarantee (client always asks the server first) while letting an unchanged page answer
// with a 304 instead of re-sending the whole document.
function sendVersionedHtml(req, reply, absHtmlPath, statusCode = 200) {
    let html;
    try { html = fsSync.readFileSync(absHtmlPath, 'utf8'); }
    catch { return reply.code(404).send(); }
    const rewritten = html.replace(
        // Also stamps the lazy loadScript('/reader/megareader.js') / ('/spa/toc.js') calls in
        // search/index.html — otherwise a 24h-cached copy could outlive the HTML that expects a
        // newer one (e.g. .reader-pending needs buildSutta() to clear it).
        /((?:src|href)="|loadScript\(')(\/(?:assets|spa|nodejs\/res|reader|settings)\/[^"'?#]+\.(?:js|css|svg|png|ico))("|')/g,
        (m, pre, url, post) => {
            const prefix = Object.keys(HTML_ASSET_URL_ROOTS).find(p => url.startsWith(p + '/'));
            if (!prefix) return m;
            const relPath = url.slice(prefix.length + 1);
            const absAssetPath = path.join(HTML_ASSET_URL_ROOTS[prefix], relPath);
            const v = getAssetVersion(absAssetPath);
            return v ? `${pre}${url}?v=${v}${post}` : m;
        }
    );
    const etag = '"' + crypto.createHash('md5').update(rewritten).digest('hex') + '"';
    reply.header('cache-control', 'public, max-age=0, must-revalidate').header('etag', etag);
    if (statusCode === 200 && req.headers['if-none-match'] === etag) {
        return reply.code(304).send();
    }
    reply.code(statusCode).type('text/html; charset=utf-8').send(rewritten);
}

// §3: same dispatch as dg-light.js's staticCacheHeaders — @fastify/static's `setHeaders`
// option calls this with the Fastify REPLY object (not the raw Node ServerResponse the way
// Express's serve-static does — confirmed empirically: @fastify/static's own source calls
// `setHeaders?.(reply, metadata.path, metadata.stat)`; a first pass assuming `res.setHeader`
// would work unchanged crashed the server with "res.setHeader is not a function"), so this
// uses `reply.header(...)` instead of dg-light.js's `res.setHeader(...)` — same dispatch
// logic, Fastify reply API.
const CACHE_IMMUTABLE_YEAR = 'public, max-age=31536000, immutable';
const CACHE_FONT = 'public, max-age=604800';
const CACHE_IMAGE = 'public, max-age=86400';
const CACHE_LEGACY_CODE = 'public, max-age=86400';
const CACHE_CONFIG_JSON = 'no-cache'; // @fastify/static uses @fastify/send under the hood — real ETag by default, same as Express's serve-static (cache.md)
const CACHE_STATIC_SHORT = 'public, max-age=36000';
const CACHE_DB = 'public, max-age=3600'; // 1 h — /mobile-data/*.db; keep in lockstep with dg-light.js's CACHE_DB (same rationale there)

// Anything pulled in by lazy <script> injection (search/index.html's ensureSearchAssets/
// ensureReaderAssets/ensureTocAssets, paliLookup.js) rather than a static HTML <script src="">
// tag never gets the ?v=<hash> sendVersionedHtml() stamps onto real tags — so the immutable
// one-year tier above would pin whatever copy a browser got first until it expires. Two flavors
// share the problem: third-party bundles vendored into public/overrides/js (DataTables, the DPD
// dictionary data) so dg-node no longer depends on the legacy repo's assets/ for them, AND our
// own app code that happens to load the same lazy way — public/spa/ (toc.js today; the rest of
// that directory is unused Phase-1 scaffold, see CLAUDE.md, but harmless to cover too) and the
// reader's own common.js/megareader.js. All get the same 24h tier the legacy copies had under
// siteroot/assets — confirmed live: a toc.js fix sat cached for a year in an already-visited
// browser until this was added (owner, 2026-09-06).
const UNVERSIONED_LAZY_PATHS = [
    ...['datatables', 'standalone-dpd'].map(dir => path.join(__dirname, 'public', 'overrides', 'js', dir) + path.sep),
    path.join(__dirname, 'public', 'spa') + path.sep,
    path.join(__dirname, 'reader', 'common.js'),
    path.join(__dirname, 'reader', 'megareader.js')
];

function staticCacheHeaders(reply, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const inVersionedRoot = VERSIONED_STATIC_ROOTS.some(root => filePath.startsWith(root + path.sep))
        && !UNVERSIONED_LAZY_PATHS.some(p => filePath.startsWith(p));
    if (inVersionedRoot && ['.js', '.css', '.svg', '.png', '.ico'].includes(ext)) {
        reply.header('Cache-Control', CACHE_IMMUTABLE_YEAR);
    } else if (['.woff', '.woff2', '.ttf', '.eot', '.otf'].includes(ext)) {
        reply.header('Cache-Control', CACHE_FONT);
    } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg'].includes(ext)) {
        reply.header('Cache-Control', CACHE_IMAGE);
    } else if (['.js', '.css'].includes(ext)) {
        reply.header('Cache-Control', CACHE_LEGACY_CODE);
    } else if (ext === '.db') {
        reply.header('Cache-Control', CACHE_DB);
    } else if (ext === '.json') {
        reply.header('Cache-Control', CACHE_CONFIG_JSON);
    } else {
        reply.header('Cache-Control', CACHE_STATIC_SHORT);
    }
}

// Everything from here on (compression/CORS plugins, every route, static mount, and the final
// app.listen) lives inside one async IIFE, not plain top-level calls — Fastify's compress plugin
// attaches itself via an `onRoute` hook (fastify.addHook('onRoute', ...)), which only affects
// ROUTES REGISTERED AFTER THE HOOK IS ACTUALLY ATTACHED. `app.register()` defers a plugin's own
// setup to Fastify's boot queue (avvio) — it does NOT block the synchronous code after it, so a
// bare `app.register(fastifyCompress); app.get(...)` (no await) runs every route registration
// below BEFORE compress's onRoute hook exists, and gzip/br silently never applies to any of them
// (confirmed empirically: responses came back uncompressed even with Accept-Encoding: gzip).
// Awaiting the register() call blocks until that plugin's setup has actually finished, so every
// route registered afterward is covered — same effect as dg-light.js's "register compression
// first" comment intended, just requiring an explicit await to actually land in Fastify.
(async () => {

// gzip/br для ВСЕГО, что отдаёт сервер — HTML, JSON, JS, CSS. Прод (легаси PHP) летает именно
// потому, что перед ним Apache/nginx сжимают ответы по умолчанию; у этого сервера такого слоя
// нет, и текстовые ответы уходили НЕСЖАТЫМИ. Регистрируем максимально рано — до всех
// static-маунтов и роутов ниже, — чтобы сжатие покрывало вообще все ответы.
// /mobile-data/*.db is served as application/octet-stream (mime-db has no `.db` entry, so
// @fastify/static/send falls back to that default type) — and @fastify/compress's
// defaultCompressibleTypes regex lists `octet-stream` explicitly, while its own shouldCompress()
// ALSO falls back to mime-db, which marks application/octet-stream `compressible: true`. There
// is no option that REMOVES a type from that set: `customTypes` only adds to it (a custom
// function returning false still hits the mime-db fallback and returns true). So the
// /mobile-data route opts out per-route with `compress: false` — documented @fastify/compress
// behaviour ("Setting compress: false on any route will disable compression on the route even
// if global compression is enabled"). Verified with curl before this: the 200 carried
// `content-encoding: br` on the 170 MB-class .db.
//
// This onRoute hook MUST be registered BEFORE the compress plugin below: compress adds its OWN
// onRoute hook, and that hook attaches the compression onSend to each route as it is declared —
// a hook registered afterwards cannot undo it (verified empirically: with the same hook added
// after app.register(fastifyCompress), /mobile-data still came back gzipped). dg-light.js gets
// the same result with a content-type filter on compression(); keep the two in lockstep.
app.addHook('onRoute', (routeOptions) => {
    if (typeof routeOptions.url === 'string' && routeOptions.url.startsWith('/mobile-data')) {
        routeOptions.compress = false;
    }
});
await app.register(fastifyCompress);
await app.register(fastifyCors, {
    origin: '*',
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
});

// Cache-Control tier (cache.md §4) — grouped here rather than per-handler, per cache.md's
// own note that a path-prefix onSend hook is more convenient than touching every /search*
// handler individually in Fastify. Replaces the earlier flat 60s-on-all-JSON placeholder
// hook entirely (not additive) — that was a stand-in before the real per-family design.
// `/sw.js` and POST /assets/lbl-save.php are deliberately NOT in this list; they get their
// own explicit reply.header() call in their handlers (cache.md §4/§5 one-offs), same as
// dg-light.js's per-handler res.set() for those two.
//
// Originally two tiers (3600s primary, 600s secondary for toc/openapi/manifest/etc.) — merged
// into one: that data is server-side cached in memory for the process lifetime anyway
// (tocTreeCache/bookTitleCache/branchTitleCache have no TTL), so 600s never reflected real
// volatility, just caution for scope outside the original ask. Owner: match search's 1h.
const CACHE_PREFIXES = [
    '/search', '/api/text/', '/api/nav/',
    '/api/toc', '/api/transliterate', '/openapi.json', '/openapi.en.json',
    '/reader/mode-table.json', '/manifest.json',
    '/config/tts-config.json', '/config/sync-config.json',
];
app.addHook('onSend', (req, reply, payload, done) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && !reply.getHeader('cache-control')) {
        const url = req.url.split('?')[0];
        if (CACHE_PREFIXES.some(p => url.startsWith(p))) {
            reply.header('cache-control', 'public, max-age=3600');
        }
    }
    done(null, payload);
});

// Optional, non-blocking check: the local FontAwesome subset (public/overrides/js/
// fontawesome-local.js) is generated by build-icons.js from the icons search/js/home.js and
// settings.js actually reference (see MANIFEST comment in the generated file) — if someone adds
// a new icon to the source and forgets to re-run `npm run build-icons`, warn about it instead of
// silently shipping a blank icon. Wrapped in try/catch on purpose: this must never stop the
// server from starting (missing bundle on a fresh checkout, unreadable file, whatever) — it's a
// dev-convenience warning, not a requirement.
// Rebuilt HERE, at startup, instead of only warning: the file is gitignored, so a fresh
// checkout / clean deploy has no copy at all and every FontAwesome icon on the site goes blank
// (test.dhamma.gift, 2026-09-05: fontawesome-local.js 404 after a deploy that never ran
// `npm run build-icons`). Same pattern as buildScriptBundle() below. build-icons.js needs the
// @fortawesome/fontawesome-free devDependency — if it is not installed the build fails and we
// fall back to the warning, but never stop the server.
try {
    const iconBundlePath = path.join(__dirname, 'public', 'overrides', 'js', 'fontawesome-local.js');
    const used = new Set();
    const homeSrc = fsSync.readFileSync(path.join(__dirname, 'search', 'js', 'home.js'), 'utf8');
    for (const m of homeSrc.matchAll(/\[\s*'(fa[srb])'\s*,\s*'([a-z0-9-]+)'\s*\]/g)) used.add(m[1] + '/' + m[2]);
    const settingsSrc = fsSync.readFileSync(path.join(__dirname, 'public', 'overrides', 'js', 'settings.js'), 'utf8');
    for (const m of settingsSrc.matchAll(/\bfaIcon\('([a-z0-9-]+)'\)/g)) used.add('fas/' + m[1]);
    let missing = [...used];
    if (fsSync.existsSync(iconBundlePath)) {
        const manifestMatch = fsSync.readFileSync(iconBundlePath, 'utf8').match(/MANIFEST:\s*([^\n*]*)/);
        const known = new Set((manifestMatch ? manifestMatch[1] : '').split(',').map(s => s.trim()).filter(Boolean));
        missing = [...used].filter(k => !known.has(k));
    }
    if (missing.length) {
        console.warn('[fontawesome-local] ' + (fsSync.existsSync(iconBundlePath) ? 'stale subset, missing: ' + missing.join(', ') : 'not built yet') + ' — building now (build-icons.js)');
        try {
            require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build-icons.js')], { stdio: 'inherit' });
        } catch (buildErr) {
            console.warn('[fontawesome-local] build failed — run `npm install` (devDependency @fortawesome/fontawesome-free) and `npm run build-icons`:', buildErr.message);
        }
    }
} catch (e) {
    console.warn('[fontawesome-local] Icon subset check skipped:', e.message);
}

// /sw.js — dg-node's own service worker (public/service-worker.js). Any browser that visited
// this origin while it served the legacy PHP site directly (assets/common/history.html
// registered navigator.serviceWorker.register('/sw.js'), see /var/www/html/sw.js) has a
// permanent cache-first SW still serving its stale cached copies of smoothScroll.js/
// paliLookup.js/settings.js/jquery/etc. today — invisible to every fix since, because it never
// touches the network for those URLs (owner report: "isInstant doesn't work, every time",
// traced back to this). Registering this SW at the same /sw.js scope replaces it — activate()
// deletes any cache not matching the current CACHE_NAME, which cleans up the legacy
// 'pwa-fdg-v1' cache too. Without an explicit route here /sw.js falls through to the generic
// /:slug catch-all below and gets served as SPA HTML (wrong content-type, breaks SW update
// checks silently). Registered early so nothing else can shadow it.
app.get('/sw.js', (req, res) => {
    res.header('cache-control', 'no-cache'); // cache.md §4 — stale service worker must always revalidate
    sendFile(req, res, path.join(__dirname, 'public', 'service-worker.js'), 'application/javascript');
});

// /manifest.json — dg-node's own PWA manifest (configs/manifest.json), replacing the legacy
// /manifest.php dependency search/index.html and reader-template.html used to link to (dead on
// any host where dg-node serves the whole domain, e.g. test.dhamma.gift). One static manifest,
// no ru/en variants: language here is client-side state (localStorage.siteLanguage / ?lang=),
// not a URL fork like the legacy /ru/ prefix was, so a single manifest already covers every
// language without hardcoding a list.
app.get('/manifest.json', (req, res) => {
    sendFile(req, res, path.join(__dirname, 'configs', 'manifest.json'), 'application/manifest+json');
});

// /open?url=... — in-scope redirector for manifest shortcuts that point at external, cross-origin
// sites (Aksharamukha, Dharmamitra): PWA manifest shortcuts must resolve to an in-scope URL or
// some platforms won't show them, but the destination itself can be anywhere — same trick legacy
// assets/openDDG.html used (client-side), just a one-line server redirect instead of a page.
app.get('/open', (req, res) => {
    res.redirect(typeof req.query.url === 'string' && req.query.url ? req.query.url : '/');
});

// Конвертация системы письма пали (настройка "selectedScript" в /settings/, приходит как
// ?script= в адресе — тот же параметр, что уже слала кнопка Alt+L, раньше ничего не делавший).
// Инициализация (~6-8с, поднимает Pyodide/Python-движок в самом Node, без браузера) стартует
// сразу при загрузке модуля, НЕ блокируя старт сервера — запрос, которому конвертация нужна
// раньше, чем инициализация закончится, просто дождётся этого же промиса. Один экземпляр на
// всё время жизни процесса, конвертация после инициализации — единицы-десятки миллисекунд.
//
// Owner: "деванагари не работает" — Aksharamukha.new() with no options tries (in order):
// getCurrentScriptPath() (browser-only, throws in Node) -> loadPyodide() with NO indexURL
// (this is the one that should just work — the "pyodide" npm package is installed locally,
// files and all) -> indexURL: <jsdelivr CDN>. In practice the middle branch was resolving to a
// bogus path (node_modules/src/js/pyodide.asm.wasm — not a real path anywhere in this install,
// some indexURL-detection quirk in pyodide 0.28.3 when it's reached via aksharamukha's own
// indirect `new Function(...)("import(...)")` loader) and falling through to the CDN branch,
// which then ALSO failed (dynamic import() of an https:// URL isn't network-fetched by this
// Node runtime without --experimental-network-imports — it gets treated as a relative
// filesystem path instead, hence the "no such file '.../https:/cdn.jsdelivr.net/...'" errors).
// Loading pyodide ourselves with an explicit LOCAL indexURL sidesteps that whole fallback chain
// — confirmed working standalone (Evaṁ me sutaṁ -> Devanagari) before wiring it in here.
const akshReady = (async () => {
    const { loadPyodide } = require('pyodide');
    const pyodideDir = path.dirname(require.resolve('pyodide'));
    // indexURL is used as a URL prefix internally (string-concatenated with filenames), not a
    // filesystem path — always '/', not path.sep (this project also runs dev on Windows).
    const pyodide = await loadPyodide({ indexURL: pyodideDir.replace(/\\/g, '/') + '/' });
    return Aksharamukha.new({ pyodide });
})().catch(err => {
    console.error('Aksharamukha init failed (script conversion will be a no-op):', err.message);
    return null;
});
// Раньше здесь была маленькая ручная таблица коротких кодов (deva/thai/sinh/mymr) на 4 системы
// письма — владелец попросил показывать ВСЕ рабочие системы, которые реально умеет Aksharamukha
// (проверено тестовым прогоном конвертации Pali IAST во все ключи Scripts — из ~163 не упал ни
// один, даже совсем неожиданные для пали System типа иврита/кириллицы/японской кана дают
// осмысленную фонетическую транслитерацию, а не мусор). Значит короткие коды — не нужны и не
// масштабируются на 163 системы; ?script=/selectedScript теперь хранит РЕАЛЬНОЕ имя ключа
// Aksharamukha.Scripts (например "BurmeseMyanmar", НЕ придуманное "mymr"). Клиент (megareader.js/
// search/index.html) исторически шлёт значение в нижнем регистре (.toLowerCase(), трогать этот
// код не стал — общий для читателя и поиска) — поэтому на сервере матчим регистронезависимо.
const AKSH_SCRIPT_LOOKUP = {};
for (const key of Object.keys(AKSH_SCRIPTS)) AKSH_SCRIPT_LOOKUP[key.toLowerCase()] = key;
function resolveScriptKey(code) {
    return code ? (AKSH_SCRIPT_LOOKUP[code.toLowerCase()] || null) : null;
}
async function convertPaliScript(text, scriptCode) {
    const realKey = resolveScriptKey(scriptCode);
    if (!text || !realKey) return text;
    const aksh = await akshReady;
    if (!aksh) return text;
    try {
        return await aksh.processAsync(AKSH_SCRIPTS.IAST, AKSH_SCRIPTS[realKey], text);
    } catch (err) {
        console.warn(`Aksharamukha: conversion to ${scriptCode} failed:`, err.message);
        return text;
    }
}

// Та же конвертация, но для формы ответа /search и /search/enrich: data — по суттам, у каждой
// segments[] с root_text/variant И вложенными lb_context/la_context (соседние строки — тоже
// пали, тоже нужно конвертировать); variantSegments — отдельный плоский список (поле text, не
// root_text). Один Promise.all на все найденные строки сразу — конкурентно (~50 строк
// пали конвертируются за ~130мс, замерено), а не одна за другой по сегментам/суттам.
async function convertScriptInSearchResult(result, scriptCode) {
    if (!resolveScriptKey(scriptCode)) return;
    const jobs = [];
    const convertField = (obj, field) => {
        if (obj && obj[field]) jobs.push((async () => { obj[field] = await convertPaliScript(obj[field], scriptCode); })());
    };
    for (const suttaId in (result.data || {})) {
        for (const seg of (result.data[suttaId].segments || [])) {
            convertField(seg, 'root_text');
            convertField(seg, 'variant');
            (seg.lb_context || []).forEach(c => convertField(c, 'root_text'));
            (seg.la_context || []).forEach(c => convertField(c, 'root_text'));
        }
    }
    (result.variantSegments || []).forEach(v => convertField(v, 'text'));
    await Promise.all(jobs);
}

// Word-click dictionary lookup (paliLookup.js, standalone DPD + external dict links) assumes
// the clicked word is Pali IAST — true only when the reader is showing the default ISOPali
// script. When the owner picks another script (Devanagari/Thai/any of the ~163 Aksharamukha
// systems, ?script= in /settings/), the clicked word is in THAT script and none of it (standalone
// dict, dict.dhamma.gift, CPD, PTS...) would find anything. AutoDetect (Aksharamukha's own script
// detector, same package as convertPaliScript above) picks the source script so the client
// doesn't need to know/send it. Owner: "для iast лишнюю лейтенси не добавляй" — the client
// (paliLookup.js) only calls this when the word contains non-Latin characters at all; plain
// IAST/ISO input never round-trips here.
app.get('/api/transliterate', async (req, res) => {
    const text = (req.query.text || '').toString();
    if (!text) return res.send({ text: '', converted: false });
    const aksh = await akshReady;
    if (!aksh) return res.send({ text, converted: false });
    try {
        const converted = await aksh.processAsync(AKSH_SCRIPTS.AutoDetect, AKSH_SCRIPTS.IASTPI, text);
        return res.send({ text: converted, converted: true });
    } catch (err) {
        console.warn('Transliterate to IAST failed:', err.message);
        return res.send({ text, converted: false });
    }
});

// Документация API — /api-docs. configs/openapi.json/openapi.en.json описывают /search,
// /search/enrich, /api/text, /api/nav и т.п.: какие параметры есть, что обязательно, что
// возвращается. Раздаём оба JSON-файла напрямую — нужно для выпадающего списка языков ниже
// (Swagger UI переключает спеки по URL, не по встроенному объекту). URL остаётся /openapi.json
// (без /configs) — это отдельный app.get(), не статика, физический путь на диске клиенту не
// виден и никого не касается.
app.get('/openapi.json', (req, res) => res.send(openapiSpec));
app.get('/openapi.en.json', (req, res) => res.send(openapiSpecEn));
// /api-docs — the same Swagger UI dg-light.js gets from swagger-ui-express, without adding a
// Fastify-specific plugin: swagger-ui-express only wraps the static swagger-ui-dist bundle
// (already installed as its dependency, now also a direct one in package.json) plus a tiny
// HTML page with the init call, so the page is written out here by hand and the dist folder
// is served under the same prefix. This is the server that runs in production — the
// redirect-to-raw-JSON stub this replaced was what made https://dhamma.gift/api-docs/ look
// broken (a JSON dump instead of the docs UI). `urls` + StandaloneLayout = the language
// picker at the top (English / Русский), same as `explorer: true` in dg-light.js.
const swaggerUiDistPath = require('swagger-ui-dist').getAbsoluteFSPath();
const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dhamma.gift API</title>
<link rel="stylesheet" href="./swagger-ui.css">
<link rel="icon" type="image/png" href="./favicon-32x32.png" sizes="32x32">
<link rel="icon" type="image/png" href="./favicon-16x16.png" sizes="16x16">
</head>
<body>
<div id="swagger-ui"></div>
<script src="./swagger-ui-bundle.js"></script>
<script src="./swagger-ui-standalone-preset.js"></script>
<script>
window.onload = function () {
    window.ui = SwaggerUIBundle({
        urls: [
            { url: '/openapi.en.json', name: 'English' },
            { url: '/openapi.json', name: 'Русский' }
        ],
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'StandaloneLayout'
    });
};
</script>
</body>
</html>
`;
// Relative asset URLs in the page (./swagger-ui.css) need the trailing slash — without the
// redirect /api-docs would resolve them against the site root.
// Android App Links verification for the native apps. A tap on a dhamma.gift link opens the app
// instead of the browser only after Android fetches this file and finds the APK's signing
// certificate in it; without it every link shows the "Open with" chooser, and links tapped inside
// Chrome are not intercepted at all. The production host has a copy under .well-known in the legacy
// tree that lists the TWA only — this one lists BOTH apps (configs/assetlinks.json), so it is the
// file to serve if the domain is ever pointed here. Content-Type matters: Android rejects the file
// when it arrives as text/plain, which is exactly what a generic static mount would do.
app.get('/.well-known/assetlinks.json', (req, res) => {
    // Read and send, not sendFile: this server registers its static plugin with decorateReply:false,
    // so reply.sendFile is not guaranteed to exist here (it 500'd on the first attempt).
    res.header('content-type', 'application/json; charset=utf-8');
    res.header('cache-control', 'public, max-age=300');
    return res.send(fsSync.readFileSync(path.join(__dirname, 'configs', 'assetlinks.json'), 'utf8'));
});

app.get('/api-docs', (req, res) => res.redirect('/api-docs/'));
app.get('/api-docs/', (req, res) => {
    res.header('cache-control', 'public, max-age=0, must-revalidate');
    return res.type('text/html; charset=utf-8').send(SWAGGER_UI_HTML);
});
// index: false — the dist folder's own index.html would otherwise shadow the page above
// (same static route, `/api-docs/` is an exact match and wins, but no reason to leave both).
app.register(fastifyStatic, {
    root: swaggerUiDistPath,
    prefix: '/api-docs/',
    index: false,
    setHeaders: staticCacheHeaders,
    decorateReply: false,
});

// Легаси (config/script_config.sh) везде держит minlength=2..3 не просто так — короткий keyword
// (особенно 1 символ) matches почти КАЖДУЮ строку всего корпуса; grep -ri на таком запросе
// реально роняет процесс (ERR_CHILD_PROCESS_STDIO_MAXBUFFER — стандартный execFile maxBuffer не
// успевает даже сработать как "мягкая" ошибка, вылетает как необработанное исключение). Тот же
// порог здесь — отсекаем до первого grep, а не полагаемся только на maxBuffer как единственную
// защиту.
const MIN_KEYWORD_LENGTH = 3;

const isTermux  = fsSync.existsSync('/data/data/com.termux/files/usr');
const isWindows = process.platform === 'win32';

// Offline mirrors root (внешние тяжёлые зеркала сторонних сайтов) — отдельный, не связанный с
// текстовыми данными механизм, платформо-зависимый путь вне web-root не переезжает на siteroot/.
let OFFLINE_MIRRORS_ROOT;
if (isTermux) {
    OFFLINE_MIRRORS_ROOT = '/data/data/com.termux/files/home/offline-data';
} else if (isWindows) {
    OFFLINE_MIRRORS_ROOT = 'C:/soft/offline-data';
} else {
    OFFLINE_MIRRORS_ROOT = '/var/www/offline-data';
}

// SuttaCentral Bilara (пали root/variant/html + переводы) и DhammaGift offline (лучшие переводы
// проекта) — оба дерева читаются через один общий корень `siteroot/data/` (git-tracked symlink'и
// на реальные данные, как и `siteroot/assets`/`siteroot/4nt`/и т.п. — см. CLAUDE.md "Публикация
// от корня сайта"). Один и тот же путь для всех платформ — кроссплатформенность обеспечивает сам
// symlink на диске, не платформенный if/else здесь (раньше было 3 разных хардкода абсолютных
// путей — Termux/Windows/прод-Linux — унифицировано в этом раунде).
const DATA_ROOT = path.join(__dirname, 'siteroot', 'data');
const SC_BILARA = path.join(DATA_ROOT, 'suttacentral.net', 'sc-data', 'sc_bilara_data');

const SC_ROOT     = `${SC_BILARA}/root/pli/ms`;
const SC_VARIANT  = `${SC_BILARA}/variant/pli/ms`;
const SC_TRANS    = `${SC_BILARA}/translation`;
const DG_LANGS    = ['ru', 'ru_other', 'en', 'en_other', 'ai'];

// DhammaGift offline — лучшие переводы проекта (один на язык), плоская структура (без подпапки
// на переводчика, в отличие от SC — DG исторически один главный + один "other" переводчик на
// язык, различаются именем файла). Структура (проверено напрямую на диске, включая реальный
// путь, найденный владельцем через `find` в data/dhammagift — папки лежат прямо под
// dhammagift/, БЕЗ промежуточной "translation/"; с ней путь был мёртвым — ru/en_other
// физически существуют на диске по адресу без "translation", а `fsSync.existsSync` c ней
// всегда давал false, так что все DG-переводы (главный "o" и "other") молча пропускались
// везде — search, ридер, batch-индекс — и результат тихо падал на SC/en вместо DG/ru):
// {DG_OFFLINE}/{lang}/sutta|vinaya/{nikaya}/{id}_translation-{lang}-{author}.json
const DG_OFFLINE = path.join(DATA_ROOT, 'dhammagift');
let offlineMirrors = new Set();
try {
    offlineMirrors = new Set(
        fsSync.readdirSync(OFFLINE_MIRRORS_ROOT, { withFileTypes: true })
            // isDirectory() смотрит на сырой тип записи и для symlink'а на директорию даёт
            // false, даже если цель реально директория (проверено эмпирически) — офлайн-зеркала
            // почти наверняка symlink'и на реальные данные, а не сами данные — без
            // isSymbolicLink() они бы молча не подхватывались этим циклом.
            .filter(d => d.isDirectory() || d.isSymbolicLink())
            .map(d => d.name)
    );
} catch (e) {
    console.warn('Offline mirrors root not found:', OFFLINE_MIRRORS_ROOT);
}

const readerTemplatePath = path.join(__dirname, 'reader', 'reader-template.html');
const searchIndexPath = path.join(__dirname, 'search', 'index.html');

let skeletonDB = {};

// Демо-сегменты для живого образца в /settings/ — заданы владельцем проекта явно, не
// подбираются автоматически. Сегменты одной сутты (dn22:18.18 + dn22:18.19) идут ОДНОЙ
// группой — на странице настроек показываются вместе, не по одному сегменту за раз.
const SETTINGS_DEMO_DEF = [
    { suttaId: 'an4.180', segments: ['an4.180:4.7'] },
    { suttaId: 'mn139', segments: ['mn139:3.9'] },
    { suttaId: 'dn22', segments: ['dn22:18.18', 'dn22:18.19'] },
    { suttaId: 'an6.63', segments: ['an6.63:12.2'] }
];

// Строится один раз при старте сервера (не на каждый запрос страницы настроек) — считает
// пали + варианты + ВСЕ найденные переводы на всех языках (targetLangs=['all'], тот же
// путь, что и обычный полнотекстовый обход) только для этих 5 сегментов, режет до них и
// кладёт результат в settings/demo-data.json — этот файл уже отдаётся статикой через
// app.use('/settings', ...) ниже, отдельный роут не нужен. getFullTextData/skeletonDB и
// прочее объявлены ниже по файлу как function-декларации (hoisting) — на момент, когда
// этот await реально выполнится (после fs.readFile выше), весь остальной модуль уже
// синхронно доисполнился, так что здесь ничего не в TDZ.
//
// Каждый вариант системы письма (ISOPali + ВСЕ ключи AKSH_SCRIPTS, не только 4 избранных)
// считается заранее, при старте, а не по запросу от preview-frame.html — данных мало (4 текста,
// по сегменту-два), а Aksharamukha живёт только в Node (не в браузере посетителя), так что демо
// в /settings/ иначе не смогло бы применить акшарамукху к образцу вообще (раньше и не
// применяло — жалоба владельца). Формат файла — { "ISOPali": [...группы...], "Devanagari":
// [...], ... }, тот же ключ (реальное имя Aksharamukha.Scripts), что и localStorage
// selectedScript, preview-frame.html просто берёт groups[selectedScript] || groups.ISOPali.
async function buildSettingsDemoCache() {
    const cachePath = path.join(__dirname, 'settings', 'demo-data.json');
    const baseGroups = [];
    for (const def of SETTINGS_DEMO_DEF) {
        try {
            const full = await getFullTextData(def.suttaId, ['all'], null);
            if (!full) continue;
            const segments = full.segments.filter(s => def.segments.includes(s.segment));
            if (segments.length) baseGroups.push({ sutta_id: full.sutta_id, title: full.title, segments });
        } catch (e) {
            console.warn('Settings demo cache: failed for', def.suttaId, e.message);
        }
    }

    const byScript = { ISOPali: baseGroups };
    for (const scriptCode of Object.keys(AKSH_SCRIPTS)) {
        byScript[scriptCode] = await Promise.all(baseGroups.map(async group => ({
            ...group,
            segments: await Promise.all(group.segments.map(async seg => ({
                ...seg,
                root_text: await convertPaliScript(seg.root_text, scriptCode),
                variant: await convertPaliScript(seg.variant, scriptCode)
            })))
        })));
    }

    try {
        await fs.writeFile(cachePath, JSON.stringify(byScript, null, 2), 'utf8');
        console.log(`Settings demo cache built: ${baseGroups.length} text(s) x ${Object.keys(byScript).length} script(s) -> settings/demo-data.json`);
    } catch (e) {
        console.warn('Settings demo cache: could not write file:', e.message);
    }
}

// Список реальных ключей Aksharamukha.Scripts для дропдауна "Система письма пали" в
// /settings/ — отдельный маленький файл, а не повторный fetch демо-данных (там на каждый ключ
// висит целый набор текстов, незачем тащить это ради одного списка названий).
async function buildScriptListCache() {
    const cachePath = path.join(__dirname, 'settings', 'scripts.json');
    try {
        await fs.writeFile(cachePath, JSON.stringify(Object.keys(AKSH_SCRIPTS)), 'utf8');
    } catch (e) {
        console.warn('Script list cache: could not write file:', e.message);
    }
}

// Реальное количество ТЕКСТОВ (уникальных sutta_id) на язык — для списка "Добавить язык" в
// /settings/ (по просьбе владельца показывать реальные цифры). Считается один раз при старте,
// не на каждый показ диалога.
//
// Считаем УНИКАЛЬНЫЕ suttaId, а не количество файлов — у одной сутты может быть несколько
// переводчиков одного языка (sc_bilara_data/translation/{lang}/{translator}/...), каждый со
// своим файлом; наивный подсчёт файлов посчитал бы такую сутту несколько раз (5 переводов
// одной сутты — это всё равно один текст, не пять). Также сюда же сводим DG offline
// (dhammagift/{ru,ru_other,en,en_other}) — иначе счётчик для ru/en в диалоге считал бы только
// SC-зеркало и был бы меньше настоящего числа доступных текстов.
// How many suttas each language has a translation of. Used to be a recursive scan of every
// language directory under both source trees at startup; the same question is one GROUP BY now.
async function buildLangCountsCache() {
    const cachePath = path.join(__dirname, 'settings', 'lang-counts.json');
    const counts = {};
    for (const row of searchDb.prepare(
        `SELECT lang, count(DISTINCT sutta_id) c FROM texts WHERE kind = 'translation' GROUP BY lang`
    ).all()) {
        counts[row.lang] = row.c;
    }
    try {
        await fs.writeFile(cachePath, JSON.stringify(counts, null, 2), 'utf8');
        console.log(`Lang counts cache built: ${Object.keys(counts).length} language(s) -> settings/lang-counts.json`);
    } catch (e) {
        console.warn('Lang counts cache: could not write file:', e.message);
    }
}

// Catalog of every translator key (transKey) that physically exists on disk per language, with
// a sutta count each — same walk as buildLangCountsCache (SC_TRANS + DG_OFFLINE), just grouped
// one level deeper (by transKey, not only by language). Built once at startup, same as
// lang-counts.json, so the TOC's translator-filter UI has something to populate its checkboxes
// from without walking the whole corpus on every page load.
// Per language, how many suttas each translator has done. The directory scan this replaces had
// to dedupe by realpath, because SC_TRANS carries convenience symlinks straight into DG_OFFLINE
// and the same file was otherwise counted twice (owner: "в англ o стоит 9 но реально только 3
// перевода"). That cannot happen here: the build already picked one winning copy per
// (sutta, lang, translator), so every row is a distinct translation.
async function buildTranslatorCatalogCache() {
    const cachePath = path.join(__dirname, 'settings', 'translator-catalog.json');
    // { lang: { translatorKey: count } } — bare translator key, no lang prefix: the outer key is
    // already the language and the client joins them itself.
    const countsByLang = {};
    for (const row of searchDb.prepare(
        `SELECT lang, translator, count(DISTINCT sutta_id) c FROM texts
         WHERE kind = 'translation' AND translator NOT IN ('site', 'ai') GROUP BY lang, translator`
    ).all()) {
        // "site" (excluded above) is SC's own UI-string translation — about/footer/home strings,
        // not a sutta translator (owner: "ru_site и любой другой site не должны попадать в
        // списки переводчиков"). "ai" (offline-data/dhammagift/ai/) is a working AI-assisted
        // draft for /assets/lbl.html's line-by-line tool only — same exclusion as the TOC's own
        // translator badges (see /api/toc/book/:code above) and core/search-core.js's search
        // matching (owner: "ru_ai не должен быть виден пользователю нигде на сайте").
        (countsByLang[row.lang] = countsByLang[row.lang] || {})[row.translator] = row.c;
    }
    try {
        await fs.writeFile(cachePath, JSON.stringify(countsByLang, null, 2), 'utf8');
        console.log(`Translator catalog cache built: ${Object.keys(countsByLang).length} language(s) -> settings/translator-catalog.json`);
    } catch (e) {
        console.warn('Translator catalog cache: could not write file:', e.message);
    }
}

// Concatenates a few always-loaded landing-page scripts into one file each, cutting HTTP
// request count under HTTP/1.1's ~6-connections-per-host limit (TODO.md batch 7 #2, part 2).
// Rebuilt on every server start (same pattern as buildSettingsDemoCache et al. above) rather
// than a manual `npm run` step, so editing a source file during dev never leaves a stale bundle.
// Only dg-node-owned files (public/overrides/js/, search/js/) are bundled, adjacent PAIRS that
// are already next to each other in search/index.html's script order — this changes request
// count only, not execution order, so it can't introduce a script-ordering bug. Legacy files
// (siteroot/assets, symlinked from the old PHP repo) are left alone on purpose: bundling them
// would mean baking a snapshot of someone else's repo into ours (see CLAUDE.md symlink policy).
async function buildScriptBundle() {
    const pairs = [
        { out: 'settings-bundle.js', sources: [
            path.join(__dirname, 'public', 'overrides', 'js', 'settings.js'),
            path.join(__dirname, 'public', 'overrides', 'js', 'dg-text-router.js'),
        ] },
        { out: 'home-bundle.js', sources: [
            path.join(__dirname, 'public', 'overrides', 'js', 'randPlaceholder.js'),
            path.join(__dirname, 'search', 'js', 'home.js'),
        ] },
    ];
    for (const { out, sources } of pairs) {
        try {
            const parts = await Promise.all(sources.map(async src => {
                const content = await fs.readFile(src, 'utf8');
                return `// ---- ${path.relative(__dirname, src)} ----\n${content}`;
            }));
            const outPath = path.join(__dirname, 'public', 'overrides', 'js', out);
            await fs.writeFile(outPath, parts.join('\n;\n'), 'utf8');
        } catch (e) {
            console.warn(`Script bundle ${out}: could not build:`, e.message);
        }
    }
}

const SEARCH_DB_PATH = path.join(__dirname, 'dg.db');
if (!fsSync.existsSync(SEARCH_DB_PATH)) {
    throw new Error(`${SEARCH_DB_PATH} is missing — run "npm run build-search-db" (after "npm run build-db")`);
}
const searchDb = new DatabaseSync(SEARCH_DB_PATH, { readOnly: true });
// Hand the core the two things it cannot reach on its own now that it lives in a module.
searchCore.init({ searchDb, DG_OFFLINE });
// mmap is deliberately left off (SQLite's default). Mapping the file makes every page the query
// touches count towards this process's RSS, which measured ~500MB higher for no useful speed —
// the pages are in the OS page cache either way, and read() reaches them just as fast.
searchDb.exec('PRAGMA cache_size = -16000'); // 16MB page cache, per connection

async function initServer() {
    try {
        // The skeleton comes out of dg.db like everything else — build-search-db.js derives it
        // straight from the corpus and does not read dg_db_light.json (that file is dg-light.js's
        // own build artifact, unrelated to this pipeline). No ORDER BY: rows come back in
        // insertion order, which happens to match the id ordering dblight.js used to produce, and
        // /api/nav and the TOC walk skeletonDB's key order to find the previous/next sutta.
        skeletonDB = {};
        for (const row of searchDb.prepare('SELECT id, category, dir_path, title, mr FROM suttas').all()) {
            skeletonDB[row.id] = { category: row.category, dir_path: row.dir_path, title: row.title, mr: row.mr };
        }
        // Not hot-reloaded — the database's mtime is logged so that "I rebuilt the corpus but the
        // server still serves the old one" is visible in the log instead of guessed at.
        const stat = await fs.stat(SEARCH_DB_PATH);
        console.log(`Skeleton loaded from dg.db: ${Object.keys(skeletonDB).length} suttas (built ${stat.mtime.toISOString()})`);
        // After it is filled, not before: initServer() replaces the object rather than clearing
        // it, so handing over the old one would leave the core reading an empty index.
        searchCore.setSkeleton(skeletonDB);
        await buildSettingsDemoCache();
        await buildScriptListCache();
        await buildLangCountsCache();
        await buildTranslatorCatalogCache();
        await buildScriptBundle();
    } catch (err) {
        console.error('Startup error:', err);
    }
}
initServer();

// CORS — registered as a plugin near the top of the file (fastifyCors), not a per-request
// header hook here; same headers (Access-Control-Allow-Origin: *, GET/OPTIONS, Content-Type).

// Статика — dg-node самодостаточен, ничего не зависит от соседнего легаси-репозитория
// Файлы, которые мы реально правим (не совпадают с легаси) — отдаём их первыми,
// прежде чем упасть на весь /assets — единый симлинк на легаси-репозиторий целиком
// (siteroot/assets, тот же паттерн, что и 4nt/config/login/memo/read, см. ниже) — второй
// маунт под тем же префиксом регистрирует уже ОБЩИЙ scan-цикл siteroot/ дальше по файлу, не
// отдельная явная строка здесь: порядок регистрации (overrides раньше siteroot-цикла) сам по
// себе гарантирует приоритет override-файлов, ничего дополнительно синхронизировать не нужно.
// maxAge: short (60s), dev-safe cache — was max-age=0 (express.static's bare default) on
// every mount, forcing a 304 round-trip on every asset on every navigation (TODO.md #global
// п.2). 60s specifically: short enough that a file edited during active dev becomes visible
// again within a minute, still long enough to cut the round-trip tax for normal browsing.
// /assets/lbl-save.php — Label Tool save endpoint (assets/lbl.html, assets/lbl-en.html), dead
// PHP under Node (siteroot/assets/lbl-save.php would otherwise serve raw unexecuted PHP source,
// same reason as /pm.php, /bipm.php below). Reimplements the legacy PHP: write the POST body to
// offline-data/lbl/{file}, creating the dir if missing.
app.post('/assets/lbl-save.php', (req, res) => {
    res.header('cache-control', 'no-store'); // cache.md §5 — write endpoint
    const filename = path.basename(req.query.file || `backup_${Date.now()}.json`);
    const saveDir = path.join(OFFLINE_MIRRORS_ROOT, 'lbl');
    try {
        fsSync.mkdirSync(saveDir, { recursive: true });
        fsSync.writeFileSync(path.join(saveDir, filename), req.body);
        res.code(200).send('OK');
    } catch (err) {
        res.code(500).send('Error writing file: ' + err.message);
    }
});

// Static mounts below use @fastify/static's array `root` (tries each dir in order, first match
// wins) — the direct equivalent of Express's "register override dir, then fallback dir on the
// same prefix, static.js calls next() on miss" chain used throughout dg-light.js. A prefix can
// only be registered ONCE in Fastify (duplicate routes throw), so every override/fallback pair
// that dg-light.js expressed as two separate app.use() calls on the same path becomes one
// registration here with a two-element root array instead.
// Translator credits ("sv+edited+o" -> "SV theravada.ru с Англ, ред. o"). Hand-written editorial
// text, so it lives with the project's other authored configs — next to translator-priority.json
// and translator-types.json, which are about the same translators — rather than among the
// vendored legacy assets. It is NOT corpus data and deliberately not a table in dg.db: that file
// is regenerated from the corpus on every build and would wipe anything written by hand. The
// public URL stays put, served by hand from its new home, the same trick the reader configs use.
// Same no-cache tier staticCacheHeaders gives any .json (cache.md — revalidated via the
// ETag sendFile() now sets, not re-sent in full unless the file actually changed).
app.get('/assets/js/translators.json', (req, res) => {
    res.header('Cache-Control', CACHE_CONFIG_JSON);
    return sendFile(req, res, path.join(__dirname, 'configs', 'reader', 'translators.json'), 'application/json');
});
app.register(fastifyStatic, {
    root: [path.join(__dirname, 'public', 'overrides'), path.join(__dirname, 'siteroot', 'assets')],
    prefix: '/assets',
    setHeaders: staticCacheHeaders,
    decorateReply: false,
});
// /read/js/voice.js — тот же override-приоритет паттерн, что и /assets выше: наш патченный
// voice.js (public/overrides/read/js/, чинит рассинхрон detectTranslationLang/prepareTextData
// с классами, которые реально рендерит megareader.js — rus-lang/eng-lang vs ru-lang/en-lang,
// second-translation-row vs lang-2nd — переводы молча не находились на страницах ридера,
// см. TODO.md) отдаётся ПЕРЕД siteroot/read/ (легаси-оригинал, второй элемент root-массива).
app.register(fastifyStatic, {
    root: [path.join(__dirname, 'public', 'overrides', 'read'), path.join(__dirname, 'siteroot', 'read')],
    prefix: '/read',
    setHeaders: staticCacheHeaders,
    decorateReply: false,
});
// /spa — static assets PLUS a client-routing fallback (any /spa/* path the static plugin can't
// find a file for serves index.html instead — router.js parses the real route client-side). In
// Express this was two separate app.use()/app.get() registrations on the same prefix, relying on
// static's next()-on-miss fallthrough; Fastify has no such fallthrough between two routes
// registered on the identical pattern (FST_ERR_DUPLICATED_ROUTE), so the SPA fallback has to be
// this encapsulated context's OWN not-found handler instead — the actual mechanism Fastify offers
// for "prefix-scoped 404" (see also /spa/app below, moved in here for the same reason).
const spaIndexPath = path.join(__dirname, 'public', 'spa', 'index.html');
app.register(async (spa) => {
    spa.register(fastifyStatic, {
        root: path.join(__dirname, 'public', 'spa'),
        prefix: '/',
        setHeaders: staticCacheHeaders,
        decorateReply: false,
    });
    // SPA главная точка входа — служит spa/index.html для всех маршрутов
    spa.get('/app', (req, res) => sendVersionedHtml(req, res, spaIndexPath));
    spa.setNotFoundHandler((req, res) => sendVersionedHtml(req, res, spaIndexPath));
}, { prefix: '/spa' });
// /settings — мастер-настройки (единая страница, вызывается по шестерёнке; отдельно от
// быстрых настроек в quickModal и смарт-панели ридера, см. TODO.md). Explicit route
// (cache.md §2) so its JS/CSS links get versioned.
app.get('/settings', (req, res) => sendVersionedHtml(req, res, path.join(__dirname, 'settings', 'index.html')));
app.get('/settings/', (req, res) => sendVersionedHtml(req, res, path.join(__dirname, 'settings', 'index.html')));
app.register(fastifyStatic, {
    root: path.join(__dirname, 'settings'),
    prefix: '/settings',
    setHeaders: staticCacheHeaders,
    decorateReply: false,
});
// URL-префикс /nodejs/res сознательно НЕ переименован вслед за папкой (обратная совместимость
// путей) — папка на диске называется search/ (см. CLAUDE.md "Структура проекта"), а
// /nodejs/res/... как публичный URL как был, так и остался. lang_ru.json/lang_en.json физически
// переехали в configs/search/ — второй элемент root-массива, тот же принцип, что и /assets выше.
app.register(fastifyStatic, {
    root: [path.join(__dirname, 'search'), path.join(__dirname, 'configs', 'search')],
    prefix: '/nodejs/res',
    setHeaders: staticCacheHeaders,
    decorateReply: false,
});
// Явный роут ПЕРЕД static-маунтом ниже — литеральный путь у Fastify всегда матчится раньше
// wildcard-роута static-плагина независимо от порядка регистрации (radix-tree роутер), в отличие
// от Express, где порядок регистрации был обязателен. Клиенту помимо самого mode-table.json нужен
// ещё и READER_LANGS (см. выше), а он не часть файла на диске (сканируется отдельно), поэтому
// раздаём JSON руками, а не статикой.
app.get('/reader/mode-table.json', (req, res) => {
    res.send({ ...MODE_TABLE, availableLangs: READER_LANGS });
});
// Same versioning treatment (cache.md §2) as /settings above — these two bare HTML files were
// previously served as plain static (no ?v= rewriting of their own JS/CSS links).
app.get('/reader/reader.html', (req, res) => sendVersionedHtml(req, res, path.join(__dirname, 'reader', 'reader.html')));
app.get('/reader/reader-template.html', (req, res) => sendVersionedHtml(req, res, path.join(__dirname, 'reader', 'reader-template.html')));
// mode-table.json/translator-priority.json/lang_ru.json/lang_en.json (ридер) физически
// переехали в configs/reader/ — второй элемент root-массива, тот же приём, что и /nodejs/res.
app.register(fastifyStatic, {
    root: [path.join(__dirname, 'reader'), path.join(__dirname, 'configs', 'reader')],
    prefix: '/reader',
    setHeaders: staticCacheHeaders,
    decorateReply: false,
});
// /offline — the optional offline PWA layer (docs/OFFLINE_PWA_PLAN.md, "Этап 1"): fetch shim,
// platform.js, data worker, bundled search core, sqlite-wasm vendor, status UI. Same no-cache
// reasoning as dg-light.js's mount: app.js and db-worker.js must be the same vintage, and ETag
// revalidation makes that free.
app.register(fastifyStatic, {
    root: path.join(__dirname, 'public', 'offline'),
    prefix: '/offline',
    setHeaders: (res) => res.header('Cache-Control', CACHE_CONFIG_JSON),
    decorateReply: false,
});

// /pm.php, /bipm.php — Bhikkhu/Bhikkhuni Patimokkha, rendered inline (not the reader), with
// rule links pointing at real dg-node routes. Static HTML generated once by
// convert-patimokkha.js from the legacy assets/texts/{bupm,bipm}.php (PHP, dead under Node —
// siteroot/pm.php and siteroot/bipm.php below would otherwise serve raw unexecuted PHP source,
// which is why the old menu links were broken). Registered before the siteroot scan loop so
// these routes win over those dead symlinks (same override-precedence pattern as /assets, /read).
app.get('/pm.php', (req, res) => sendVersionedHtml(req, res, path.join(__dirname, 'reader', 'bu-pm.html')));
app.get('/bipm.php', (req, res) => sendVersionedHtml(req, res, path.join(__dirname, 'reader', 'bi-pm.html')));

// /config/tts-config.json, /config/sync-config.json — the only 2 files out of the legacy
// siteroot/config/ (67 tracked files: apache/systemd/AndroidManifest, AWS creds, config.zip)
// dg-node code actually fetches (public/overrides/read/js/voice.js, settings.js/
// settings-bundle.js). Vendored into configs/legacy/ so siteroot/config can be dropped
// entirely instead of publishing the rest of that directory's unrelated legacy server files.
app.get('/config/tts-config.json', (req, res) => sendFile(req, res, path.join(__dirname, 'configs', 'legacy', 'tts-config.json'), 'application/json'));
app.get('/config/sync-config.json', (req, res) => sendFile(req, res, path.join(__dirname, 'configs', 'legacy', 'sync-config.json'), 'application/json'));

// Bare fragment (no page shell) of the same content, for /toc's inline expand
// (public/spa/toc.js renderBookRow) — fetched once on first click, not preloaded.
app.get('/api/patimokkha-fragment/:side', (req, res) => {
    if (req.params.side !== 'bu' && req.params.side !== 'bi') return res.code(404).send();
    sendVersionedHtml(req, res, path.join(__dirname, 'reader', `${req.params.side}-pm-fragment.html`));
});

// siteroot/ — публикация от корня сайта: самодостаточные легаси-приложения (Memorization
// Helper, вход/облачная синхронизация, 4nt — сравнение изданий пали, TTS voice-player), их
// конфиги, зеркала сторонних тулз/учебников, легаси-ассеты целиком (assets/) — не только
// "зеркала" в узком смысле, поэтому не mirrors/. Каждый элемент — symlink на реальную папку
// рядом с проектом (на проде, например, `siteroot/4nt` -> `../../4nt`, т.е. `/var/www/html/4nt`,
// сосед `nodejs/`) ИЛИ обычная папка/файл прямо здесь. Никакого хардкода per-инструмент: что
// появилось в siteroot/ — то и замаунтилось на /{имя} на следующем старте сервера (папка
// сканируется один раз при старте, не на каждый запрос — новый symlink требует рестарта; правки
// ВНУТРИ уже примонтированной папки видны сразу, без рестарта). Чтобы добавить новую тулзу/
// зеркало/учебник — просто положить symlink (или реальные файлы) в siteroot/, рестартовать
// сервер, ничего в коде трогать не нужно. Три элемента здесь — не совсем "новая тулза с нуля":
// `read/` (TTS voice-player) — жёстко зашитый в settings.js путь "/read/js/voice.js" (легаси,
// не трогаем), и сама папка становится ВТОРЫМ, запасным маунтом под /read — патченный
// voice.js в public/overrides/read/ (см. выше) регистрируется раньше и побеждает по тому же
// принципу, что и /assets; `assets/` — сюда же попадает ВТОРЫМ маунтом под /assets, публичным
// API поверх override-файлов (см. выше) чисто порядком регистрации в файле — никакой особой
// обработки в самом цикле нет, всё ничем не отличается от 4nt/config/login/memo с точки
// зрения этого кода.
const SITEROOT = path.join(__dirname, 'siteroot');
// /mobile-data — the optional offline PWA's ~170 MB SQLite database (public/offline/* fetches
// /mobile-data/dg-mobile.db). Same explicit mount as dg-light.js (see there for the full
// rationale); the two must stay behaviourally identical:
//   * registered BEFORE the siteroot/ scan just below; 'mobile-data' is also pre-added to
//     mountedPrefixes further down so the scan skips it instead of throwing a duplicate route;
//   * missing directory = clean 404, no crash. suppressWarning silences @fastify/static's
//     startup `"root" path ... must exist` warning for this known-optional build artifact
//     (the route exists either way, the file just isn't there yet);
//   * a miss never falls through to another route — @fastify/static answers 404 via the
//     not-found handler, the same clean 404 dg-light.js produces with its explicit 404
//     middleware (there the SPA catch-all would otherwise return 200 text/html);
//   * @fastify/static goes through @fastify/send, which serves byte ranges out of the box
//     (Accept-Ranges: bytes on 200, 206 + Content-Range on Range) — required for resumable
//     170 MB downloads (docs/OFFLINE_PWA_PLAN.md). The hand-rolled sendFile() helper in this
//     file reads the whole file into a Buffer and must NOT be used for this path.
app.register(fastifyStatic, {
    root: path.join(SITEROOT, 'mobile-data'),
    prefix: '/mobile-data',
    setHeaders: staticCacheHeaders,
    decorateReply: false,
    redirect: true, // bare /mobile-data -> 301 /mobile-data/, like every other siteroot mount
    suppressWarning: true,
});
let siteRootEntries = new Set();
try {
    siteRootEntries = new Set(
        fsSync.readdirSync(SITEROOT, { withFileTypes: true })
            // Dirent.isDirectory() отражает СЫРОЙ тип записи (d_type) и для symlink'а на
            // директорию возвращает false, даже если цель — директория (проверено эмпирически,
            // node -e с реальным symlink) — нужно явно включать isSymbolicLink() тоже, иначе
            // все реальные записи в siteroot/ (это же и есть symlink'и) молча отфильтруются.
            .filter(d => d.isDirectory() || d.isSymbolicLink())
            .map(d => d.name)
    );
} catch (e) {
    console.warn('Siteroot not found:', SITEROOT);
}
// 'assets' and 'read' are already folded into the override root-arrays registered above (they'd
// otherwise be duplicate registrations on the same prefix, which Fastify rejects outright). Also
// skip anything whose real target isn't a directory (a few siteroot entries — bipm.php, pm.php,
// read.php, sitemap.xml — are symlinks to individual FILES, harmless dead weight for
// express.static but a hard registration error for @fastify/static, which requires root to be a
// directory).
const mountedPrefixes = new Set(['assets', 'read', 'memorize', 'devanagari', 'mobile-data']); // 'mobile-data' is the explicit /mobile-data mount above — the scan must not re-register it (duplicate route = hard error)
// Skips are reported, not silent. statSync() follows symlinks, so an entry whose target has gone
// away (siteroot/mobile-data -> a dist/ directory that was never built, say) is indistinguishable
// here from a broken one — it just never gets a route, and every request under that prefix falls
// through to the 404 handler and looks like a missing FILE rather than a missing MOUNT. That cost
// real debugging time; one line at startup makes it obvious. Note the list is built ONCE: a new
// entry in siteroot/, or an existing one repointed at something that now exists, needs a restart.
const skippedPrefixes = [];
for (const name of siteRootEntries) {
    if (mountedPrefixes.has(name)) continue;
    const target = path.join(SITEROOT, name);
    let isDir = false;
    try { isDir = fsSync.statSync(target).isDirectory(); } catch (e) {}
    if (!isDir) { skippedPrefixes.push(name); continue; }
    // redirect: true — a directory requested without its trailing slash ("/4nt", "/4nt/sn/sn45")
    // gets a 301 to the slash form, the way Express's serve-static does by default. Without it
    // @fastify/static served the directory's index.html AT the slash-less URL, and every
    // relative link inside these self-contained tools (4nt's "../../help.html", "an/index.html")
    // resolved one directory too high. The bare prefix ("/4nt") is also caught in the /:slug
    // catch-all below for the same reason — see there.
    app.register(fastifyStatic, { root: target, prefix: `/${name}`, setHeaders: staticCacheHeaders, decorateReply: false, redirect: true });
    mountedPrefixes.add(name);
}
if (skippedPrefixes.length) {
    console.warn(
        `siteroot: NOT mounted (target missing or not a directory) — requests under these ` +
        `prefixes 404 until the target exists AND the server is restarted: ${skippedPrefixes.join(', ')}`
    );
}
// /memorize, /devanagari — 'memorize'/'devanagari' were pre-added to mountedPrefixes above so
// the siteroot/ loop skips them (siteroot/memorize is a symlink to the legacy PHP memorize.js
// tool; siteroot/devanagari doesn't even exist). Legacy URL shape:
// `/memorize/?q=<suttaId>#<segment>` — `#segment` is a URL FRAGMENT, never sent to the server
// (browsers strip it before the request), so this can only be resolved client-side, never as a
// server-side redirect. Target is dg-node's own clean URL,
// `/<suttaId>[:<segment>]?mode=<memorize|devanagari>` (the /:slug route further down parses the
// ":segment" suffix client-side, router.js) — a same-origin relative redirect, works under
// whichever hostname this server answers for (owner tested against f.dhamma.gift).
function legacyModeRedirectStub(modeKey) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Redirecting…</title></head><body><script>
(function () {
  var params = new URLSearchParams(location.search);
  var q = params.get('q') || '';
  params.delete('q');
  var seg = location.hash ? decodeURIComponent(location.hash.slice(1)) : '';
  var path = '/' + encodeURIComponent(q) + (seg ? ':' + encodeURIComponent(seg) : '');
  params.set('mode', ${JSON.stringify(modeKey)});
  location.replace(path + (params.toString() ? '?' + params.toString() : ''));
})();
</script></body></html>`;
}
for (const [urlPrefix, modeKey] of [['memorize', 'memorize'], ['devanagari', 'devanagari']]) {
    for (const routePath of [`/${urlPrefix}`, `/${urlPrefix}/`]) {
        app.get(routePath, (req, reply) => {
            reply.type('text/html; charset=utf-8').send(legacyModeRedirectStub(modeKey));
        });
    }
}

// ru/memo, ru/login — унаследованные от легаси языковые алиасы (тот же контент ещё и под /ru/).
// Это не отдельная тулза в siteroot/, а второй URL для уже примонтированной — оставлены явно.
app.register(fastifyStatic, { root: path.join(SITEROOT, 'memo'), prefix: '/ru/memo', setHeaders: staticCacheHeaders, decorateReply: false, redirect: true });
app.register(fastifyStatic, { root: path.join(SITEROOT, 'login'), prefix: '/ru/login', setHeaders: staticCacheHeaders, decorateReply: false, redirect: true });

// /ru/docs — real RU-locale docs build, baseUrl:'/ru/docs/' baked in at build time
// (dg-docs/docusaurus.config.js, DOCS_BUILD_LOCALE=ru), so this is a genuine static mount,
// not a redirect — /docs/ru/... never existed for readers to have bookmarked.
app.register(fastifyStatic, { root: path.join(__dirname, 'dg-docs', 'build-ru'), prefix: '/ru/docs', setHeaders: staticCacheHeaders, decorateReply: false });

// Офлайн-зеркала сторонних сайтов — /{имя-папки}/... отдаётся как статика напрямую из offline-data.
// Skips a name already mounted above (siteroot takes precedence — same behavior Express's
// registration-order chaining gave it) instead of hard-erroring on a duplicate prefix.
for (const name of offlineMirrors) {
    if (mountedPrefixes.has(name)) { console.warn(`Offline mirror '${name}' skipped — prefix already mounted from siteroot/`); continue; }
    app.register(fastifyStatic, { root: path.join(OFFLINE_MIRRORS_ROOT, name), prefix: `/${name}`, setHeaders: staticCacheHeaders, decorateReply: false, redirect: true }); // redirect: see siteroot loop
    mountedPrefixes.add(name);
}

// /ru → same routing as without the prefix, plus lang=ru — legacy PHP used
// REQUEST_URI.startsWith('/ru') site-wide for language detection; the SPA reads ?lang=
// client-side instead (dhamma-i18n.js). Real files under the legacy ru/ symlink (config, dpd,
// memo, login, ...) are matched by the static mounts above and never reach this — Fastify has no
// per-request "fall through to next middleware" like Express did, so the equivalent point to
// catch the leftover (no static file, no other route matched) is the not-found handler, not a
// regular middleware; see the redirect-based rewrite there, right below the final 404 fallback,
// for /ru, /ru/dn22, etc.

// /spa/app and /spa/* (SPA fallback) are registered together with the /spa static mount above.

// Страница поиска — главная точка входа (легаси, для обратной совместимости)
app.get('/', (req, res) => {
    sendVersionedHtml(req, res, searchIndexPath);
});





// Приоритет переводчиков на язык — при нескольких вариантах перевода одного текста
// показываем только один, лучший, а не все подряд (TODO.md п.3: "куча русских переводов").
// Языки вне списка — берём первый попавшийся файл.
// Приоритет переводчиков по языку — { "ru": ["ru_o", "ru_sv", ...] }. Языки без записи
// здесь не ломаются: filterPreferredTranslators() просто берёт первый найденный перевод
// (см. ниже), так что новый язык из SC-репо читается сразу, без правки кода — приоритет
// добавляется в этот файл только когда для языка есть за что выбирать.
// Физически лежит в configs/reader/ (все конфиги проекта собраны в одном месте, см. CLAUDE.md
// "Структура проекта"), но URL остаётся /reader/translator-priority.json — см. второй
// express.static на /reader ниже, серверный require() и клиентский fetch() указывают на один
// и тот же файл двумя разными путями (диск vs URL), это нормально и намеренно.

app.get('/api/text/:suttaId', async (req, res) => {
    const suttaId = req.params.suttaId.toLowerCase();

    // ?mode=memorize — основной путь для ридера: сервер резолвит ПОВЕДЕНИЕ (dualScript/mnemonic)
    // из MODE_TABLE (reader/mode-table.json), клиенту не нужно знать эту логику вовсе. Язык режим
    // не хранит — это отдельная ось, ?lang= (один язык) или ?langs= (список+порядок, для multi),
    // см. CLAUDE.md: "не хардкодить языки". ?langs=/?translators= работают и напрямую — ручной
    // доступ, /api-docs, отладка через curl.
    const modeConfig = req.query.mode && MODE_TABLE[req.query.mode];

    const targetLangs = req.query.langs
        ? req.query.langs.split(',').map(l => l.trim())
        : req.query.lang
            ? [req.query.lang]
            : modeConfig
                // Owner-reported bug: a real ?mode= with no &lang= (e.g. a cold /dn1?mode=single
                // load — switchReaderMode() never touches ?lang=, see megareader.js, so a fresh
                // page load can hit this with no lang set yet) used to fall through to the bare
                // "ru,en" branch below regardless of mode, silently rendering a SECOND language
                // in modes meant for exactly one. Only the truly bare "no mode at all" case
                // (curl/api-docs) should get the multi-lang fallback.
                ? ['ru']
                // Ни mode, ни lang, ни langs — тот же фоллбэк, что и был здесь всегда для голого
                // ручного доступа (curl/api-docs без единого языкового параметра), не новый хардкод.
                // Исключение — голый ?translators=ru_o,ru_sv: языки названы в самих ключах, и брать
                // вместо них "ru,en" значит доложить в ответ английский, которого не просили (с тех
                // пор как явный список переводчиков перестал вытеснять остальные языки, см.
                // translatorsForSutta).
                : translatorLangsFallback(req.query.translators) || ['ru', 'en'];
    // ?translators=ru_o,ru_khantibalo — сколько переводчиков названо, столько и придёт, в обход
    // обычного "один переводчик на язык" (см. translatorsForSutta). issue #6: это единственный
    // способ получить несколько переводов одного языка — прежний автоподбор ?multiFor= убран
    // вместе с режимом multiTran, ради которого он и существовал (владелец: "убери лишнее").
    const explicitTranslators = req.query.translators
        ? req.query.translators.split(',').map(t => t.trim())
        : null;

    try {
        // Один раз читаем root/variant/html (не зависят от языка перевода) — основной вызов
        // и en-fallback ниже переиспользуют один и тот же base, а не перечитывают эти 3 файла
        // с диска дважды ради одних и тех же данных (см. getSuttaBaseData).
        const base = await getSuttaBaseData(suttaId);
        if (!base) return res.code(404).send({ error: `Unknown sutta id: ${suttaId}` });
        let data = await buildTextDataFromBase(base, suttaId, targetLangs, explicitTranslators);
        let effectiveLangs = targetLangs;

        // Явный ?langs= (не ?mode=) на редко покрытый язык (напр. de) часто не находит вообще
        // НИ ОДНОГО перевода для конкретной сутты — раньше это молча оставляло голый пали без
        // перевода. Фоллбэк на "en" (общесайтовый дефолтный язык, см. dhamma-i18n.js) — только
        // для этого ручного пути, ?mode= (обычное ru/en-чтение через mode-table.json) не трогаем,
        // чтобы не менять поведение для существующих читателей без явного langs=.
        const hasAnyTranslation = data.segments.some(seg => Object.keys(seg.translations).length > 0);
        if (!modeConfig && !hasAnyTranslation && !targetLangs.includes('en') && !explicitTranslators) {
            const fallbackData = await buildTextDataFromBase(base, suttaId, ['en'], null);
            const fallbackHasTranslation = fallbackData &&
                fallbackData.segments.some(seg => Object.keys(seg.translations).length > 0);
            if (fallbackHasTranslation) {
                data = fallbackData;
                effectiveLangs = targetLangs.concat(['en']);
            }
        }

        // Порядок языков-колонок — чтобы клиент не держал собственную копию MODE_TABLE
        // только ради того, чтобы знать порядок рендера.
        data.columns = effectiveLangs;
        // Резолвленный "текущий" язык — раньше клиент вычислял его из columns[0]/family
        // (mode-table.json), теперь режим языка не хранит вообще, так что явно возвращаем его
        // отдельным полем.
        data.lang = req.query.lang || effectiveLangs[0] || null;
        // Who translated THIS text, whatever mode/langs were requested — the reader's language
        // popover lists the translators of each language and marks languages with none "нет
        // перевода" right at load time (owner) instead of discovering it one refetch at a time.
        // One indexed read of the same table the root text came from; `translator <> 'ai'` for
        // the reason spelled out in translatorsForSutta() — and it is what keeps a language whose
        // ONLY translation is the AI draft (9 such (sutta, lang) pairs) out of availableLangs.
        const roster = searchDb.prepare(
            "SELECT DISTINCT lang, translator FROM texts WHERE sutta_id = ? AND kind = 'translation' AND translator <> 'ai'"
        ).all(suttaId);
        data.availableLangs = [...new Set(roster.map(r => r.lang))];
        data.availableTranslators = roster.map(r => `${r.lang}_${r.translator}`);

        // Конвертация системы письма пали (?script=Devanagari/Thai/... — любой ключ
        // Aksharamukha.Scripts, см. akshReady/resolveScriptKey выше). Только root_text/variant —
        // сам пали, переводы не на пали и не трогаются. Параллельно по всем сегментам сразу
        // (Promise.all) — конвертация после инициализации быстрая (десятки мс), но
        // последовательно по сегментам целой сутты уже заметно набегало бы.
        //
        // Owner: "деванагари — это режим, 1 строка в НЕ латинском скрипте пали, а вторая —
        // латинский пали... это уже есть в любом обычном режиме" — a dualScript mode
        // (dev/dev_en в mode-table.json) needs BOTH: the converted script for the main line
        // AND the original ISO/Latin Pali for the second line (root_text_iso — stashed here
        // BEFORE overwriting root_text with the conversion, matching prod's devanagari.js which
        // fetches paliData/paliDevanagariData as two separate fields). Variant is intentionally
        // left UNconverted for dualScript modes — prod attaches it under the Latin line, not
        // the converted one.
        if (resolveScriptKey(req.query.script)) {
            const dualScript = !!(modeConfig && modeConfig.dualScript);
            await Promise.all(data.segments.map(async seg => {
                if (dualScript) seg.root_text_iso = seg.root_text;
                if (seg.root_text) seg.root_text = await convertPaliScript(seg.root_text, req.query.script);
                if (!dualScript && seg.variant) seg.variant = await convertPaliScript(seg.variant, req.query.script);
            }));
        }

        return res.send(data);
    } catch (error) {
        // A malformed regex keyword is the caller's mistake, not ours.
        if (error.badRequest) return res.code(400).send({ error: error.message });
        console.error(error);
        return res.code(500).send({ error: 'Internal Server Error.' });
    }
});

// Prev/next для навигации ридера — из уже загруженного в память skeletonDB, без похода на
// диск и без скачивания клиентом всей 18-мегабайтной dg_db_light.json ради одной пары ссылок.
//
// Owner (живой баг): "попал в ридере в Милиндапаньху, которая вообще не должна быть доступна
// без спец настройки — ротация прев/некст должна быть в рамках текстов, выбранных пользователем,
// или по умолчанию 4 никаи + 6 книг Кхуддаки". Раньше здесь был голый позиционный проход по
// ВСЕМУ dbKeys без какой-либо фильтрации по scope — mil8 оказывается соседом mn1 чисто по
// алфавиту ("mil" < "mn"), никакого отношения к учебному порядку. Тот же resolveAllowedPrefixes()/
// matchesScope(), что уже фильтрует /search (см. чуть выше по файлу), просто никогда не
// подключался к этому эндпоинту. resolveAllowedPrefixes(undefined) уже возвращает
// DEFAULT_SCOPE_PREFIXES (4 никаи + 6 КН) сама по себе — так что просто не требовать scope= от
// клиента и есть правильный дефолт; explicit ?scope= (из localStorage.dhammaSearchScope,
// reader/megareader.js) расширяет его ровно как /search уже умеет.
// Если ТЕКУЩИЙ текст сам не входит в scope (открыт прямой ссылкой/поиском, а не через prev/next)
// — соседей всё равно ищем от его позиции в ПОЛНОМ dbKeys, просто пропуская несовпадающие: так
// пользователь не застревает в исключённом тексте, а разумно попадает на ближайший подходящий.
app.get('/api/nav/:suttaId', (req, res) => {
    const suttaId = req.params.suttaId.toLowerCase();
    const nav = navFor(suttaId, req.query.scope);
    if (!nav) return res.code(404).send({ error: `Unknown sutta id: ${suttaId}` });
    res.send(nav);
});

// /api/ai-search — the fallback for "точный поиск дал 0 результатов" (and a direct button, see
// docs/AI_SEARCH_BRIEF.md). Contract is provisional: built ahead of the UI design, so shapes here
// may still need to change once the design is final — nothing else depends on this endpoint yet.
//
// The model in ai-search.js never writes text the user reads: `quotePali`/`quoteEnglish` below
// are verbatim segments from search_hybrid, `titlePali` is the sutta's real skeleton title, and
// `wordSuggestions` are DPD-verified real headwords. The model's own output (searchQuery,
// paliCandidates) is only ever used as input to those two lookups, never shown directly.
// Owner: "каждый раз ждать, пока перезагрузится страница" — going back to a query just made
// (browser back, re-running the same search) shouldn't pay the full 6-8s pipeline again. Plain
// in-memory Map, one process, no eviction beyond the TTL check on read — this endpoint's traffic
// doesn't warrant an LRU cap. Keyed by exactly what changes the answer (query text + gloss lang).
const AI_SEARCH_CACHE = new Map(); // `${lang}:${q}` -> { at, data }
const AI_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

// search_hybrid hits -> DataTables-shaped rows, filtered to scope and sorted the site's own way.
// Shared by the two callers below (a single DPD-confirmed word, and the full LLM+semantic path) —
// same reasoning either way: relevance picks which suttas make the cut, sortSuttaResults() decides
// the order they're shown in (dhamma -> khuddaka -> vinaya -> abhi), not raw rank (owner: "почему
// сортировка не наша?"). Shaped as a plain /search row (CLAUDE.md's documented response), not a
// bespoke object, so the frontend can feed these straight into window.DgSearchRender.
// buildDataTable() — real DataTables triangles/child-row animation, not a hand-rolled imitation
// (owner: "по-настоящему DataTable"). Fields the column renderers don't get from us (unique_words,
// lb_context/la_context, variant/html) are left empty — cheap degradation, not required for a
// single best-guess segment per sutta.
function hitsToSuttaRows(hits, scope) {
    // search_hybrid knows nothing about this site's scope filter (it searches the whole
    // Tipitaka) — filter its hits the same way plain /search already does, otherwise a scope
    // that excludes Abhidhamma/Vinaya can still surface them here (owner: "он выводит абхидхамму
    // вместо того чтобы следовать фильтру. ответы для ии тоже нужно фильтровать").
    const allowedPrefixes = resolveAllowedPrefixes(scope);
    const inScope = hits.filter(hit => {
        const meta = getSuttaMeta(hit.sutta_id);
        return meta && matchesScope(meta, hit.sutta_id, allowedPrefixes);
    });

    // One row per sutta, not per segment — search_hybrid returns segment-level hits and the same
    // sutta_id can appear several times; keep each sutta's single best-scoring segment as its quote.
    const bySutta = new Map();
    for (const hit of inScope) {
        const existing = bySutta.get(hit.sutta_id);
        if (!existing || hit.rrf_score > existing.rrf_score) bySutta.set(hit.sutta_id, hit);
    }
    const topHits = [...bySutta.values()].sort((a, b) => b.rrf_score - a.rrf_score).slice(0, 5);
    const forSort = {};
    for (const hit of topHits) {
        const meta = getSuttaMeta(hit.sutta_id);
        forSort[hit.sutta_id] = { category: meta ? meta.category : 'other', mr: meta ? meta.mr : 0, segments: [], hit, meta };
    }
    return Object.keys(sortSuttaResults(forSort)).map(suttaId => {
        const { hit, meta } = forSort[suttaId];
        return {
            sutta_id: suttaId,
            category: meta ? meta.category : 'other',
            dir_path: meta ? meta.dir_path : '',
            mr: meta ? meta.mr : 0,
            count: 1,
            unique_words: [],
            titles: meta && meta.title ? { root: meta.title } : {},
            __enriched: true,
            segments: [{
                segment: hit.segment_id,
                root_text: hit.text_pali || '',
                variant: '',
                html: '',
                translations: hit.text_english ? { en_sujato: hit.text_english } : {},
                lb_context: [],
                la_context: [],
            }],
        };
    });
}

// Owner: "откуда берутся эти заглушки? кто их дорисовывает?" — the LLM's own pali_candidates are
// a best-effort shot in the dark; when it isn't sure, it statistically reaches for the handful of
// terms that appear constantly in its training data, so ~one of these tends to show up even in an
// otherwise-good candidate list (e.g. "Buddho, nakhā, anta, paṭicca, DHAMMA" for the fingernail
// simile — the first four are genuinely on-topic, the last is just noise). Filtered out before
// candidates get blended into the actual search query below, so they don't dilute it query after
// query. Not a blocklist of "bad Pali" — dhamma/sacca/etc. are perfectly real, central concepts;
// they're excluded here only because they're too generic to ever narrow a search down.
const GENERIC_PALI_TERMS = new Set(['dhamma', 'dhammā', 'sutta', 'sacca', 'anicca', 'dukkha', 'anatta', 'nibbāna', 'nibbana', 'kamma', 'magga', 'metta']);

// Owner: "лучше сделай лог у себя где-то чтобы ты видел" — one line per request, visible in
// `pm2 logs`/stdout, so what the dispatcher actually did can be checked directly instead of
// relying on a screenshot of the (now deliberately compact) debug tooltip in the UI.
function logAiSearch(q, body) {
    const d = body.debug || {};
    console.log(`[ai-search] query="${q}" ok=${body.ok}${body.ok === false ? ` reason=${body.reason} detail="${body.detail}"` : ''} provider=${d.provider || '-'} normalized="${d.normalizedQuery || '-'}" candidates=[${(d.paliCandidates || []).join(', ')}] suttas=${body.suttas ? body.suttas.length : '-'} words=${body.wordSuggestions ? body.wordSuggestions.length : '-'}`);
}

app.get('/api/ai-search', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.code(400).send({ ok: false, reason: 'missing_query' });
    const lang = req.query.lang === 'en' ? 'en' : 'ru'; // word gloss language; UI language, not content language
    const scope = req.query.scope || 'default'; // same source as plain /search — passed through from the exact search that fell back here

    const cacheKey = `${lang}:${scope}:${q.toLowerCase()}`;
    const cached = AI_SEARCH_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.at < AI_SEARCH_CACHE_TTL_MS) {
        return res.send(cached.data);
    }

    // Fast path for a single word (no spaces): figure out whether it's real Pali BEFORE ever
    // asking the LLM to guess anything — owner: "сначала нужно понять, что сказал человек, если
    // это вообще пали... нужно попробовать поискать его в DPD и уже потом от этих слов
    // отталкиваться, потому что если он [LLM] будет отправлять в поиск сутт какое попало слово,
    // не факт что найдётся то, что нужно". A description (multiple words) has no single headword
    // to check this way — "если это описание, то смысла искать в дпд мало" — that case falls
    // through untouched to the full LLM+semantic pipeline below.
    if (!/\s/.test(q)) {
        try {
            const wordInfo = await lookupWord(q, lang);
            if (wordInfo.exists) {
                // A real, DPD-confirmed word — plain exact search already found 0 for it (that's
                // why we're here at all), so search by MEANING instead, grounded in DPD's own
                // gloss rather than an LLM's guess of what this word might mean.
                const hits = await searchHybrid(wordInfo.gloss ? `${q} — ${wordInfo.gloss}` : q, 15).catch(() => []);
                const responseBody = {
                    ok: true, query: q,
                    suttas: hitsToSuttaRows(hits, scope),
                    wordSuggestions: [{ word: q, gloss: wordInfo.gloss }],
                    debug: { normalizedQuery: `(DPD-confirmed word, no LLM call) ${q}`, provider: 'dpd', paliCandidates: [q] },
                };
                logAiSearch(q, responseBody);
                AI_SEARCH_CACHE.set(cacheKey, { at: Date.now(), data: responseBody });
                return res.send(responseBody);
            }
            if (wordInfo.closest.length) {
                // Not a real word, but DPD's own fuzzy "did you mean" found near matches — show
                // those instead of running the full pipeline at all (owner: "не нужно было искать
                // в ии режиме, а нужно было предположить что это другое слово").
                const typoSuggestions = await verifyCandidates(wordInfo.closest.slice(0, 5), lang);
                const responseBody = {
                    ok: true, query: q, suttas: [], wordSuggestions: typoSuggestions,
                    debug: { normalizedQuery: `(DPD typo suggestions, no LLM call) ${q}`, provider: 'dpd', paliCandidates: wordInfo.closest.slice(0, 5) },
                };
                logAiSearch(q, responseBody);
                AI_SEARCH_CACHE.set(cacheKey, { at: Date.now(), data: responseBody });
                return res.send(responseBody);
            }
            // Owner: "кто придумал эту заглушку?.. убери её, не нужно отдавать такое на
            // неподходящие вещи" — a single word that DPD couldn't verify AND had no fuzzy "did
            // you mean" for either (real gibberish, or just not a Pali word at all) used to fall
            // through to the full LLM pipeline like a multi-word description would. The model has
            // no dictionary basis to search from at that point, so it reliably fell back to its
            // own go-to Buddhist vocabulary ("dhamma, sacca, anicca, dukkha, nibbana" — seen live
            // for "kachcapxyz") — a generic non-answer, not a real guess about THIS input. DPD
            // already said there's nothing close; stop here instead of dressing that up.
            const responseBody = {
                ok: true, query: q, suttas: [], wordSuggestions: [],
                debug: { normalizedQuery: `(DPD: no match, no close match, no LLM call) ${q}`, provider: 'dpd', paliCandidates: [] },
            };
            logAiSearch(q, responseBody);
            AI_SEARCH_CACHE.set(cacheKey, { at: Date.now(), data: responseBody });
            return res.send(responseBody);
        } catch {
            // DPD unreachable (even after dpd-lookup.js's own retry) — not fatal, fall through to
            // the full pipeline rather than fail outright.
        }
    }

    let dispatch;
    try {
        dispatch = await normalizeQuery(q);
    } catch (err) {
        // All three LLM providers failed/unconfigured — degrade to "try exact search",
        // never a 500: this is an expected, handled state, not a server error.
        const responseBody = { ok: false, reason: 'ai_unavailable', detail: err.message };
        logAiSearch(q, responseBody);
        return res.send(responseBody);
    }

    // debug: what the LLM actually turned the query into — owner asked to see this to sanity-check
    // the dispatcher, not shown as a real UI feature (rendered as a small muted link, ai-search.js).
    const debug = { normalizedQuery: dispatch.searchQuery, provider: dispatch.provider, paliCandidates: dispatch.paliCandidates };

    // Owner: "я думаю что он дает ответы на белиберду - это нехороший знак... он должен отрезать
    // такой поиск" — keyboard-mashed input ("лфадмлот") isn't a real query in any language, but
    // the dispatcher was still forced to produce SOME english_query for it (the system prompt
    // never lets it refuse outright) — that best-effort guess (seen live: literally "unknown
    // query") is still just English TEXT, and searchHybrid happily finds semantic matches for it
    // (e.g. "unknown query" matched a sutta literally about searching). dispatch.recognized (see
    // core/ai-search.js) is a separate, explicit signal from the SAME tool call for exactly this
    // — false means "not language at all", so there is nothing worth searching for.
    if (!dispatch.recognized) {
        const responseBody = { ok: true, query: q, suttas: [], wordSuggestions: [], debug };
        logAiSearch(q, responseBody);
        AI_SEARCH_CACHE.set(cacheKey, { at: Date.now(), data: responseBody });
        return res.send(responseBody);
    }

    // Owner: "эти заглушки dhamma sutta даже обращаться в другой сервер не нужно" — the generic
    // ones are still not worth a DPD round-trip or a "did you mean" chip: only the DPD-typo-
    // correction branch above (real fuzzy matches for an actual misspelled headword, no LLM
    // involved) earns word-suggestion chips.
    //
    // Owner: "мы можем ему [tripitaka-mcp] как-то помочь?" — search_hybrid RRF-blends keyword +
    // semantic internally, but we were only ever giving it the English gloss, never the Pali
    // terms the SAME tool call already produced (seen live: it correctly named "nakhā" for a
    // fingernail-simile query, we just never used it — search_hybrid's keyword half had nothing
    // Pali to latch onto, only whatever English words happened to be in the gloss). Same pattern
    // as the DPD-confirmed-word branch above ("{q} — {gloss}"): append the SPECIFIC candidates
    // (generic ones filtered above) to the query text itself, giving the keyword half something
    // precise instead of only the semantic half having anything to go on.
    const specificCandidates = (dispatch.paliCandidates || []).filter(w => !GENERIC_PALI_TERMS.has(w.toLowerCase()));
    const searchInput = specificCandidates.length
        ? `${dispatch.searchQuery} — ${specificCandidates.join(', ')}`
        : dispatch.searchQuery;
    const hits = await searchHybrid(searchInput, 15).catch(() => []); // over-fetch; deduped/trimmed to ~5 suttas below

    const responseBody = {
        ok: true, query: q, suttas: hitsToSuttaRows(hits, scope), wordSuggestions: [], debug,
    };
    logAiSearch(q, responseBody);
    AI_SEARCH_CACHE.set(cacheKey, { at: Date.now(), data: responseBody });
    res.send(responseBody);
});

// /mcp — dg-node's own data (search, get_text) exposed as MCP tools, symmetric to how
// core/tipitaka-mcp-client.js calls the friend's server (see docs/AI_SEARCH_BRIEF.md). Stateless,
// POST-only per the SDK's own stateless example; GET/DELETE answer the same 405 that example does.
app.post('/mcp', mcpHandler);
app.get('/mcp', (req, res) => res.code(405).send({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }));
app.delete('/mcp', (req, res) => res.code(405).send({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }));

app.get('/search', searchHandler);

/* Подсказки "может быть, вы искали" едут в САМОМ ответе поиска, а не вторым запросом.
   Владелец: "зачем это давать в отдельном ответе когда мы можем вместо sutta words показывать сразу
   грамотные подсказки" — на нуле результатов отчёты (сутты/слова/варианты) всё равно пусты и
   прячутся (search/index.html, renderCurrentReport), так что именно туда и просится ответ на вопрос "тогда
   что же искать". Один запрос вместо двух, и подсказки есть даже когда ИИ-режим недоступен.

   Считаются только на нуле, так что успешный запрос за это не платит ничего. Одно место на все формы
   ответа (?fast=1 и полный), чтобы не разошлись. */
function withSuggestions(body, keyword) {
    if (body.metadata && !body.metadata.tooShort && body.metadata.totalFiles === 0) {
        body.metadata.suggestions = suggestWords(keyword);
    }
    return body;
}

async function searchHandler(req, res) {
    // req.params.keyword — заход через /search/:keyword (путь); req.query.q — через /search?q=.
    // Express 5 отдаёт req.query геттером без сохранённого состояния (заново парсит на каждое
    // обращение) — писать в req.query.q в отдельном middleware бесполезно, оно не переживёт
    // следующий доступ. Читаем обе возможные формы напрямую, без мутации req.query.
    let keyword = req.params.keyword || req.query.q;
    if (!keyword) return res.code(400).send({ error: 'Parameter "q" is mandatory.' });
    keyword = stripSearchPunctuation(keyword);

    const scope      = req.query.scope || 'default';
    const exact      = req.query.exact === 'true';
    const targetLangs = (req.query.langs || 'ru,en').split(',').map(l => l.trim());
    const lb         = parseInt(req.query.lb) || 0;
    const la         = parseInt(req.query.la) || 0;

    if (keyword.length < MIN_KEYWORD_LENGTH) {
        return res.send({
            metadata: { query: keyword, scope: scope || 'default', resolvedPrefixes: resolveAllowedPrefixes(scope), langs: targetLangs, totalFiles: 0, totalMatches: 0, hasVariantMatch: false, tooShort: true },
            data: {}, wordReport: [], variantSegments: []
        });
    }

    try {
        // TODO.md поиск п.5: ?fast=1 skips per-sutta file reads entirely — grep-only skeleton
        // + full wordReport, quotes/context arrive later via /search/enrich.
        if (req.query.fast === '1') {
            // ?fast=1 не содержит текста сегментов вообще (только grep-счётчики) — конвертировать
            // тут нечего, полный текст приходит позже через /search/enrich.
            return res.send(withSuggestions(await buildFastResponse(keyword, scope, exact, targetLangs, lb, la), keyword));
        }
        const result = await buildSearchResponse(keyword, scope, exact, targetLangs, lb, la);
        await convertScriptInSearchResult(result, req.query.script);
        return res.send(withSuggestions(result, keyword));
    } catch (error) {
        // A malformed regex keyword is the caller's mistake, not ours.
        if (error.badRequest) return res.code(400).send({ error: error.message });
        console.error(error);
        return res.code(500).send({ error: 'Internal Server Error.' });
    }
}

// Phase 2 (TODO.md поиск п.5): enrich a known set of sutta ids with full segment/quote data.
// Client calls this with the ids of the currently visible page (from a prior ?fast=1 call),
// then again for further pages/background load. Response shape matches /search's data[id].
app.get('/search/enrich', async (req, res) => {
    let keyword = req.query.q;
    const idsParam = req.query.ids;
    if (!keyword) return res.code(400).send({ error: 'Parameter "q" is mandatory.' });
    if (!idsParam) return res.code(400).send({ error: 'Parameter "ids" is mandatory.' });
    keyword = stripSearchPunctuation(keyword);
    if (!keyword) return res.code(400).send({ error: 'Parameter "q" is mandatory.' });

    const scope      = req.query.scope || 'default';
    const exact      = req.query.exact === 'true';
    const targetLangs = (req.query.langs || 'ru,en').split(',').map(l => l.trim());
    const lb         = parseInt(req.query.lb) || 0;
    const la         = parseInt(req.query.la) || 0;
    const requestedIds = idsParam.split(',').map(s => s.trim()).filter(Boolean);

    if (keyword.length < MIN_KEYWORD_LENGTH) {
        return res.send({ data: {}, variantSegments: [] });
    }

    try {
        const { searchResults, empty } = await buildMatchSkeleton(keyword, scope, exact, targetLangs, lb, la, requestedIds);
        const suttaIds = Object.keys(searchResults);
        if (empty || suttaIds.length === 0) return res.send({ data: {}, variantSegments: [] });

        await enrichSuttaBatch(searchResults, suttaIds, targetLangs, keyword, scope, lb, la);
        const sortedData = sortSuttaResults(searchResults);
        let totalMatches = 0;
        for (const id of suttaIds) {
            totalMatches += sortedData[id].count;
        }
        const variantSegments = await findVariantSegments(keyword, exact);
        const enrichResult = {
            data: sortedData,
            wordReport: buildWordReport(searchResults), // не buildWordReportFast — та же семантика wordReport, что и полный /search (buildSearchResponse), т.к. unique_words уже посчитаны enrichSuttaBatch
            metadata: { query: keyword, scope: scope || 'default', resolvedPrefixes: resolveAllowedPrefixes(scope), langs: targetLangs, lb, la, exactMatch: exact, totalFiles: suttaIds.length, totalMatches, hasVariantMatch: variantSegments.length > 0 },
            variantSegments
        };
        await convertScriptInSearchResult(enrichResult, req.query.script);
        return res.send(enrichResult);
    } catch (error) {
        // A malformed regex keyword is the caller's mistake, not ours.
        if (error.badRequest) return res.code(400).send({ error: error.message });
        console.error(error);
        return res.code(500).send({ error: 'Internal Server Error.' });
    }
});

// /search/:keyword — то же самое, что /search?q=:keyword, просто keyword как часть пути
// (короткие ссылки на время, пока нет полноценного SPA-роутинга): /search/kacchapa?scope=dhamma
// работает наравне с /search?q=kacchapa&scope=dhamma — остальные параметры (scope/lb/la/fast/...)
// всё так же читаются из query string, меняется только то, откуда берётся сам keyword.
// ВАЖНО: регистрируется ПОСЛЕ /search/enrich — иначе как wildcard-параметр перехватил бы
// "/search/enrich" тоже (Express матчит по порядку регистрации, а не по специфичности).
app.get('/search/:keyword', searchHandler);

// TOC/navigator — lazy tree browsing (see TODO.md, replaces the old read.php static-tree
// approach). Two endpoints: /api/toc (light top-level book list with leaf counts) and
// /api/toc/book/:code (one book's whole tree — small file, see comment on TOC_TREE_ROOT).

// suttacentral.net/sc-data/structure/tree/{sutta,vinaya,abhidhamma}/{code}-tree.json already
// holds the FULL canon tree, ready-made — 694 bytes for dn, up to ~74 KB for sn/an. No need to
// build or hardcode a tree: just read the small file for whichever book was requested.
const TOC_TREE_ROOT = path.join(DATA_ROOT, 'suttacentral.net', 'sc-data', 'structure', 'tree');
const TOC_TREE_KINDS = ['sutta', 'vinaya', 'abhidhamma'];
const tocTreeCache = new Map(); // code -> parsed tree JSON | null (small files, static for process lifetime)

// Real samyutta/group names for SN — legacy's own TOC data (assets/texts/sn_toc.csv, columns:
// groupNum,groupName,samyuttaCode,samyuttaName,vaggaNum,vaggaName,suttaId,suttaTitle), not
// something to reconstruct from corpus headers — SN's corpus files simply don't carry a samyutta-
// or group-level name anywhere (owner: real sn1..sn56 names, found in DG's own product/toc list).
// byCode: samyutta code -> its name ("sn1" -> "Devatāsaṁyuttaṁ"). byLeaf: any sutta id -> the
// group name it belongs to, used since a group's own firstLeafId is exactly one such sutta id.
function loadSnTocOverrides() {
    const result = { byCode: {}, byLeaf: {} };
    const file = path.join(__dirname, 'siteroot', 'assets', 'texts', 'sn_toc.csv');
    if (!fsSync.existsSync(file)) return result;
    for (const line of fsSync.readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const parts = line.split(',');
        if (parts.length < 8) continue;
        const groupName = parts[1].trim().replace(/p[āa]ḷi$/i, '').trim();
        const samyuttaCode = parts[2].trim();
        const samyuttaName = parts[3].trim();
        const suttaId = parts[6].trim();
        if (!result.byCode[samyuttaCode]) result.byCode[samyuttaCode] = samyuttaName;
        if (!result.byLeaf[suttaId]) result.byLeaf[suttaId] = groupName;
    }
    return result;
}
const SN_TOC = loadSnTocOverrides();

function loadBookTree(code) {
    if (tocTreeCache.has(code)) return tocTreeCache.get(code);
    let tree = null;
    for (const kind of TOC_TREE_KINDS) {
        const file = path.join(TOC_TREE_ROOT, kind, `${code}-tree.json`);
        if (fsSync.existsSync(file)) {
            try { tree = JSON.parse(fsSync.readFileSync(file, 'utf8')); } catch (e) { tree = null; }
            break;
        }
    }
    tocTreeCache.set(code, tree);
    return tree;
}

// A tree node is either a leaf (sutta id string) or a branch ({slug: [...children]}, exactly one
// key). Both collectLeafIds and findFirstLeafId walk this same generic shape.
function collectLeafIds(node, out) {
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(n => collectLeafIds(n, out)); return; }
    if (node && typeof node === 'object') {
        for (const key in node) collectLeafIds(node[key], out);
    }
}

function findFirstLeafId(node) {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) {
        for (const n of node) { const id = findFirstLeafId(n); if (id) return id; }
        return null;
    }
    if (node && typeof node === 'object') {
        for (const key in node) { const id = findFirstLeafId(node[key]); if (id) return id; }
    }
    return null;
}

// Best-effort title for a branch node (vagga/chapter/rule-category): reads a header segment
// (":0.2", ":0.3", ...) of its first leaf's root-pli-ms text. Which index is the right one
// varies by tree shape: SN's deep tree has its group title at ":0.2"; Vinaya-vibhanga's rule
// categories (Pārājika, Saṅghādisesa, ...) sit at ":0.3" instead, because ":0.2" there is a
// constant, book-wide "part" heading (e.g. "Mahāvibhaṅga") shared by every sibling branch — using
// it verbatim would title every branch identically. pickBranchTitleIndex() picks whichever index
// actually DISTINGUISHES a group of siblings, once, per sibling group (not per branch), instead of
// hardcoding a fixed index per book. Corpus files also key header segments by their OWN base id,
// which can differ from a range-folded leaf id ("pli-tv-bu-vb-as1-7" the leaf vs
// "pli-tv-bu-vb-as1" the file's own segment keys) — segmentAt() matches by suffix, not exact id,
// to survive that. Final fallback: the leaf's own skeletonDB title (right when a branch wraps a
// single combined-range leaf whose title already IS the group name); last resort: humanized slug.
const branchTitleCache = new Map();

// Canonical Pali "nipāta" (numbered-chapter) ordinal names — a small, fixed vocabulary shared by
// every book organized this way (Aṅguttara, Itivuttaka, Theragāthā, Therīgāthā...), not per-book
// data. One-time-scraped from legacy read.php's own hardcoded headings (grep "nipāta" there)
// instead of retyping it, so a bare-numbered top slug ("an3", "iti1"...) gets its real name
// instead of just the digit.
const NIPATA_ORDINALS = ['', 'Ekaka', 'Duka', 'Tika', 'Catukka', 'Pañcaka', 'Chakka', 'Sattaka', 'Aṭṭhaka', 'Navaka', 'Dasaka', 'Ekādasaka'];

// Fallback for a bare-numbered slug beyond NIPATA_ORDINALS' range (e.g. SN's samyuttas, sn1..sn56
// — no short canonical name exists for those, unlike nipātas): reuses the same "{Book} N" locator
// text every leaf already carries at header segment ":0.1" (see getBookTitle), just for this one
// number instead of the whole book — not hardcoded per book, reads whatever the corpus says.
function numberedGroupFallback(firstLeafId, n) {
    const raw = segmentAt(firstLeafId, 1);
    if (!raw) return String(n);
    // Trailing locator can be a combined-leaf range ("49.1–12", en-dash) as well as a plain
    // "N.N" — [\d.] alone misses the dash and leaves it stuck onto the result.
    const base = raw.replace(/\s+[\d.–-]+\s*$/, '').trim();
    return base ? `${base} ${n}` : String(n);
}

function humanizeSlug(slug, bookCode, firstLeafId, isTopLevel) {
    let rest = slug.startsWith(bookCode) ? slug.slice(bookCode.length) : slug;
    // A leading "N-" is a position locator (peyyāla/paññāsaka groups tagged with their chapter
    // number in the slug), not part of the name — strip it before humanizing.
    rest = rest.replace(/^\d+-/, '');
    rest = rest.replace(/^-+/, '');
    if (!rest) rest = slug;
    if (/^\d+$/.test(rest)) {
        const n = parseInt(rest, 10);
        // "nipāta" naming only applies to a bare-numbered BOOK-ROOT child (AN/Iti/Thag's own
        // top-level chapters) — a bare number nested deeper (SN's sn1..sn56 samyuttas, two levels
        // under the book root) is a different kind of unit entirely and must not get an AN-style
        // "Ekaka/Duka/..." label just because it happens to also be a bare digit.
        // Owner: number AN's nipātas 1..11 (only AN asked for — Iti/Thag/etc keep the bare name).
        if (isTopLevel && NIPATA_ORDINALS[n]) return (bookCode === 'an' ? `${n}. ` : '') + NIPATA_ORDINALS[n] + 'nipāta';
        if (firstLeafId) return numberedGroupFallback(firstLeafId, n);
    }
    return rest.charAt(0).toUpperCase() + rest.slice(1);
}
// Root JSON per id, cached — same pattern as colophonCache/branchTitleCache below (TOC data is
// static for the process lifetime, no TTL needed). pickBranchTitleIndex calls segmentAt for the
// SAME id at multiple idx (2, 3, 4) while probing for a title level, and getBranchTitle/
// annotateTree revisit the same firstLeafId across sibling branches — without this cache each of
// those was its own uncached readFileSync+JSON.parse of the same file.
const rootJsonCache = new Map(); // id -> { segmentId: text } | null

// Root text of one sutta, in file order — the database query that replaces the readFileSync +
// JSON.parse each of the three TOC helpers here used to do for itself.
function rootSegments(id) {
    let data = rootJsonCache.get(id);
    if (data === undefined) {
        const rows = searchDb.prepare(
            "SELECT segment_id, txt FROM texts WHERE sutta_id = ? AND kind = 'root' ORDER BY ord"
        ).all(id);
        data = rows.length ? Object.fromEntries(rows.map(r => [r.segment_id, r.txt])) : null;
        rootJsonCache.set(id, data);
    }
    return data;
}

function segmentAt(id, idx) {
    try {
        const data = rootSegments(id);
        if (!data) return null;
        const key = Object.keys(data).find(k => k.endsWith(`:0.${idx}`));
        return key ? String(data[key]).trim() : null;
    } catch (e) { return null; }
}
// A vagga's own root text almost always closes with a colophon line naming it — e.g. mn10:
// "Mūlapariyāyavaggo niṭṭhito paṭhamo.", dn13: "Sīlakkhandhavaggo niṭṭhito.", an1.10: "Rūpādivaggo
// paṭhamo." — the real, fully-diacritic Pali name, straight from the text, not a guess (owner:
// "просканируй тексты возьми главы из текстов... по слову vaggo"). Not every vagga/book uses this
// convention (checked below, at the LAST leaf of the vagga where the colophon lives); when absent
// this just returns null and callers fall back to the existing segmentAt/slug guess.
// The very last leaf of a book (or of one of SN's 5 outer groups) carries colophons for EVERY
// level closing at once — vagga, samyutta, AND the outer group all use the identical "{Name}vaggo"
// phrasing, stacked in the same file (e.g. sn11.25, last vagga of the last samyutta in Sagāthā-
// vaggasaṁyutta: "Tatiyo vaggo." / "Sakkasaṁyuttaṁ samattaṁ." / "Sagāthāvaggo paṭhamo." / "Sagāthā-
// vaggasaṁyuttapāḷi niṭṭhitā."). Reject a match that's actually one of SN's own group names (already
// known from SN_TOC) so the OUTER colophon doesn't leak down as if it named this inner vagga.
const SN_GROUP_NAMES = Array.from(new Set(Object.values(SN_TOC.byLeaf))).map(n => n.toLowerCase());
const colophonCache = new Map();
function findColophonVaggaName(lastLeafId) {
    if (colophonCache.has(lastLeafId)) return colophonCache.get(lastLeafId);
    let name = null;
    try {
        const data = rootSegments(lastLeafId);
        if (data) {
            for (const key of Object.keys(data)) {
                // Letters+marks only (not \S) — some colophons are wrapped in "(...)" or split
                // across segments ("vaggo sattamo." with the name in an earlier segment); this
                // both skips punctuation getting glued onto the name and requires an actual name
                // before "vaggo" (rejects a bare "vaggo" with nothing attached).
                const m = String(data[key]).match(/([\p{L}\p{M}]+)vaggo\b/iu);
                if (!m) continue;
                const candidate = m[1] + 'vagga';
                // Group names carry a "saṁyutta" suffix after the plain "vagga" word ("Sagāthā-
                // vaggasaṁyutta"), so match by prefix, not exact equality.
                const candidateLower = candidate.toLowerCase();
                if (SN_GROUP_NAMES.some(gn => gn.startsWith(candidateLower))) continue;
                // Mid-sentence Pali doesn't capitalize compounds the way a heading should.
                name = candidate.charAt(0).toUpperCase() + candidate.slice(1);
                break;
            }
        }
    } catch (e) { /* no colophon here, that's fine */ }
    colophonCache.set(lastLeafId, name);
    return name;
}
function pickBranchTitleIndex(siblingFirstLeafIds) {
    for (let idx = 2; idx <= 4; idx++) {
        const values = siblingFirstLeafIds.map(id => segmentAt(id, idx));
        if (!values.every(Boolean)) continue;
        // If MOST siblings' value at this index just echoes their own leaf title, this index has
        // gone PAST the group-title header level into the leaf-title level (happens on trees with
        // no separate header segment for this depth at all, e.g. SN's outer division/samyutta
        // levels) — stop escalating and keep the best-effort value found at a shallower index
        // instead of showing individual leaf titles as if they were the group's name. A single
        // coincidental match (a branch that legitimately wraps one combined-range leaf whose own
        // title already IS the group's name, e.g. Vinaya's Adhikaraṇasamatha) is not enough to
        // reject an otherwise-good, distinguishing index — only a majority is.
        const leafTitleHits = siblingFirstLeafIds.filter((id, i) => {
            const own = ((skeletonDB[id] && skeletonDB[id].title) || '').trim();
            return own && values[i] === own;
        }).length;
        if (leafTitleHits > siblingFirstLeafIds.length / 2) break;
        const distinct = new Set(values);
        if (distinct.size === values.length) return idx;
    }
    return 2;
}
// singleLeaf: true when this branch wraps exactly one leaf overall (e.g. Vinaya's
// Adhikaraṇasamatha, a single combined-range leaf) — there the leaf's own title legitimately IS
// the group's name, so it's an accepted fallback. For a multi-leaf branch, a candidate that just
// echoes its FIRST leaf's own title (DN: a vagga's first sutta title, read at an index with no
// real vagga-title segment) is not real group-title information — humanizeSlug is the better
// fallback there (crude but at least describes the group, not one arbitrary member of it).
function getBranchTitle(firstLeafId, slug, bookCode, idx, singleLeaf, trustSegment, isTopLevel, lastLeafId) {
    // Keyed by slug too, not just firstLeafId+idx: a branch and its own first child commonly
    // share the same firstLeafId (both start at the same leaf) and can land on the same idx —
    // without slug in the key they'd collide and the child's cached title would leak up to the
    // parent (e.g. MN's paññāsa-level node showing its first vagga's title instead of its own).
    const cacheKey = `${slug}:${firstLeafId}:${idx}`;
    if (branchTitleCache.has(cacheKey)) return branchTitleCache.get(cacheKey);
    const ownTitle = ((skeletonDB[firstLeafId] && skeletonDB[firstLeafId].title) || '').trim();
    let title = humanizeSlug(slug, bookCode, firstLeafId, isTopLevel);
    // Curated real name (SN_TOC) beats the generic slug-derived guess, at any level above the
    // vagga (samyutta code "sn1" matches by slug; a group's own firstLeafId is exactly one of the
    // sutta ids the CSV indexes) — see loadSnTocOverrides above.
    if (!trustSegment) {
        if (SN_TOC.byCode[slug]) title = SN_TOC.byCode[slug];
        // byLeaf maps ANY leaf to its outer GROUP name — only valid for the group level itself
        // (isTopLevel, SN's book-root children ARE the 5 groups). A samyutta with its own extra
        // paññāsaka layer (sn22, sn35) is also !trustSegment but NOT top-level — without this
        // guard it wrongly inherited the whole group's name (owner: found live, sn22's three
        // paññāsaka all showing "Khandhavaggasaṁyutta").
        else if (isTopLevel && SN_TOC.byLeaf[firstLeafId]) title = SN_TOC.byLeaf[firstLeafId];
    }
    // A leaf's own corpus file only ever carries ONE group-title header segment above its own
    // title (the vagga it directly sits in) — there is no separate segment for a deeper ancestor
    // (paññāsaka/samyutta/nipāta). trustSegment is only true when THIS branch's own children are
    // leaves (i.e. it IS that directly-containing vagga); otherwise segmentAt's value would just
    // be the vagga name leaking up from a grandchild, so skip it and keep the slug-derived title
    // (owner: MN/SN/AN's outer levels were all showing their innermost vagga's name, repeated).
    if (trustSegment) {
        // The colophon (see findColophonVaggaName) is the vagga's REAL name, straight from the
        // text — takes priority over the header-segment guess/humanized slug when it's there.
        const colophonName = lastLeafId ? findColophonVaggaName(lastLeafId) : null;
        if (colophonName) {
            title = colophonName;
        } else {
            const candidate = segmentAt(firstLeafId, idx);
            if (candidate && candidate !== ownTitle) {
                title = candidate;
            } else if (singleLeaf && ownTitle) {
                title = ownTitle;
            }
        }
    }
    branchTitleCache.set(cacheKey, title);
    return title;
}

// Book-level (top) title for books with no curated label in toc-books.json (Abhidhamma's
// sub-books) — read straight from the corpus instead of guessing a translation: segment ":0.1"
// of the book's first leaf is the book's own Pali name, sometimes with a trailing chapter/
// position number ("Saṁyutta Nikāya 1.1") which we strip.
const bookTitleCache = new Map();
function getBookTitle(code, firstLeafId) {
    if (bookTitleCache.has(code)) return bookTitleCache.get(code);
    let title = code;
    try {
        const data = rootSegments(firstLeafId);
        if (data) {
            const raw = data[`${firstLeafId}:0.1`];
            // Strips a leading OR trailing chapter/position locator ("1 Mūlayamaka" -> "Mūlayamaka",
            // "Saṁyutta Nikāya 1.1" -> "Saṁyutta Nikāya") — which side it's on depends on the book.
            if (raw) title = raw.replace(/^[\d.]+\s+/, '').replace(/\s+[\d.–-]+\s*$/, '').trim();
        }
    } catch (e) { /* keep code as last-resort fallback */ }
    bookTitleCache.set(code, title);
    return title;
}

// Recursively annotates a raw tree node into a shape the client can render generically: leaves
// carry their skeletonDB title, branches carry a resolved title (getBranchTitle) plus children.
// titleIdx is the header-segment index to use for THIS node's own title, decided by the caller
// from this node's sibling group (see pickBranchTitleIndex); each level picks its OWN index for
// its children's sibling group, since different tree depths map to different header segments.
function annotateTree(node, bookCode, titleIdx, isTopLevel) {
    if (typeof node === 'string') {
        return { type: 'leaf', id: node, title: (skeletonDB[node] && skeletonDB[node].title) || node };
    }
    const slug = Object.keys(node)[0];
    const rawChildren = node[slug];
    const childArr = Array.isArray(rawChildren) ? rawChildren : [rawChildren];
    // Only a branch whose OWN children are leaves directly contains suttas (a true vagga) — only
    // there does the leaf's corpus header segment actually describe THIS level (see getBranchTitle
    // trustSegment comment). A branch one or more levels above that (paññāsaka/samyutta/nipāta)
    // gets its title from the slug instead.
    const childrenAreLeaves = childArr.every(c => typeof c === 'string');
    const siblingFirstLeaves = childArr
        .filter(c => typeof c !== 'string')
        .map(c => findFirstLeafId(c[Object.keys(c)[0]]))
        .filter(Boolean);
    const childIdx = siblingFirstLeaves.length ? pickBranchTitleIndex(siblingFirstLeaves) : 2;
    const children = childArr.map(c => annotateTree(c, bookCode, childIdx, false));
    // Owner: number SN's samyuttas within each of its 5 outer vagga-groups, restarting at 1 per
    // group (Sagāthāvagga 1..11, Nidānavagga 1..10, ...) — this node IS one of those groups
    // whenever isTopLevel is true for SN (its own children are the samyuttas being numbered).
    if (isTopLevel && bookCode === 'sn') {
        children.forEach((child, i) => { child.title = `${i + 1}. ${child.title}`; });
    }
    const firstLeaf = findFirstLeafId(rawChildren);
    const allLeaves = [];
    collectLeafIds(rawChildren, allLeaves);
    const lastLeaf = allLeaves[allLeaves.length - 1];
    const title = firstLeaf ? getBranchTitle(firstLeaf, slug, bookCode, titleIdx || 2, allLeaves.length === 1, childrenAreLeaves, isTopLevel, lastLeaf) : slug;
    return { type: 'branch', slug, title, children };
}

// Top level: categories -> books, with bilingual labels (curated for sutta/vinaya/khudakka,
// read live from the corpus for Abhidhamma sub-books, see getBookTitle) and a leaf count each
// (countLeaves — cheap, the tree is already in memory once loadBookTree has cached it once).
// A handful of Abhidhamma tree files under sc-data are empty, or list ids that turn out to be
// non-Pali editions (Chinese Āgama/Abhidharma texts also tagged category:'abhi' in skeletonDB,
// e.g. "sab"/"sg" -> dir_path "lzh/..."). Not part of this project's Pali-only scope (see
// CLAUDE.md) — filter to leaves skeletonDB actually knows AND that live under root/pli/ms/...
function isPaliLeaf(id) {
    const meta = skeletonDB[id];
    return !!(meta && meta.dir_path && meta.dir_path.startsWith('pli/'));
}

// tier:'default' books always show; tier:'extra' books (rest of Khuddaka, all of Abhidhamma) only
// unlock client-side once the user has enabled the matching group in the EXISTING search-scope
// setting (dhammaSearchScope) — see extraScopeCodes comment in toc-books.json. Server doesn't know
// that per-browser setting, so it just tags tier and ships extraScopeCodes; the client decides.
function describeBook({ code, label, singlePage }, tier) {
    const tree = loadBookTree(code);
    const allLeafIds = [];
    if (tree) collectLeafIds(tree, allLeafIds);
    const leafIds = allLeafIds.filter(isPaliLeaf);
    let resolvedLabel = label;
    if (!resolvedLabel) {
        const title = leafIds.length ? getBookTitle(code, leafIds[0]) : code;
        resolvedLabel = { ru: title, en: title };
    }
    const entry = { code, label: resolvedLabel, count: leafIds.length, tier };
    if (singlePage) entry.singlePage = singlePage;
    return entry;
}

// A "group" is a Nikāya-level entry that itself contains books (Khuddaka, inside 'dhamma') — a
// peer of DN/MN/SN/AN, not a flattened list of its member books (owner: "кн это отдельное собрание
// как дн мн сн ан"). Same books/extraBooks/extraScopeCodes shape as a category, one level down.
function describeGroup(group) {
    const books = (group.books || []).map(b => describeBook(b, 'default'))
        .concat((group.extraBooks || []).map(b => describeBook(b, 'extra')))
        .filter(book => book.count > 0 || book.singlePage);
    // Total across whichever of its books currently show — mirrors a plain book's count, so the
    // Nikāya-level row (Khuddaka) reads the same way as DN/MN/SN/AN's "(34)" etc. hasExtra tells
    // the client whether to mark it partial (prod's asterisk convention, settings/index.html
    // ABHI_MARK) when the extra tier isn't unlocked — server doesn't know that per-browser setting.
    const count = books.reduce((sum, b) => sum + b.count, 0);
    const entry = { code: group.code, label: group.label, books, count };
    if (group.extraScopeCodes) entry.extraScopeCodes = group.extraScopeCodes;
    if ((group.extraBooks || []).length) entry.hasExtra = true;
    return entry;
}

app.get('/api/toc', (req, res) => {
    const categories = Object.entries(TOC_BOOKS).filter(([key]) => key !== '_comment').map(([category, catData]) => {
        const books = (catData.books || []).map(b => describeBook(b, 'default'))
            .concat((catData.extraBooks || []).map(b => describeBook(b, 'extra')))
            .filter(book => book.count > 0 || book.singlePage);
        const groups = (catData.groups || []).map(describeGroup).filter(g => g.books.length > 0);
        const entry = { category, label: catData.label, books, groups };
        if (catData.extraScopeCodes) entry.extraScopeCodes = catData.extraScopeCodes;
        return entry;
    }).filter(cat => cat.books.length > 0 || cat.groups.length > 0);
    res.send({ categories });
});

// One book's whole tree (small file — see TOC_TREE_ROOT comment above) plus, when ?langs= is
// given, which translators exist for each of its leaves (raw/unfiltered — buildFullTranslationIndex,
// not the reader's "one preferred translator" collapsing) so the client can render badges without
// a request per sutta.
app.get('/api/toc/book/:code', async (req, res) => {
    const code = req.params.code;
    const tree = loadBookTree(code);
    if (!tree) return res.code(404).send({ error: `Unknown book code: ${code}` });

    const rootSlug = Object.keys(tree)[0];
    const rawChildren = tree[rootSlug];
    const childArr = Array.isArray(rawChildren) ? rawChildren : [rawChildren];
    const topFirstLeaves = childArr
        .filter(c => typeof c !== 'string')
        .map(c => findFirstLeafId(c[Object.keys(c)[0]]))
        .filter(Boolean);
    const topIdx = topFirstLeaves.length ? pickBranchTitleIndex(topFirstLeaves) : 2;
    const annotated = childArr.map(c => annotateTree(c, code, topIdx, true));
    const leafIds = [];
    collectLeafIds(tree, leafIds);

    const targetLangs = (req.query.langs || '').split(',').map(s => s.trim()).filter(Boolean);
    const translations = {};
    if (targetLangs.length) {
        // Raw and unfiltered on purpose — badges show every translator a leaf has, not the one
        // the reader would collapse to. Used to walk each language's whole directory tree.
        const wanted = targetLangs.includes('all') ? null : new Set(targetLangs.map(l => l.split('_')[0]));
        const filter = langFilterSql(wanted);
        // translator <> 'ai': same exclusion core/search-core.js already applies to search
        // matching — "ai" (offline-data/dhammagift/ai/) is a working AI-assisted draft meant
        // only for /assets/lbl.html's line-by-line tool, not a real public translator. TOC badges
        // are otherwise deliberately "every translator, unfiltered" (comment above) — this is the
        // one deliberate exception, not a narrowing of that intent (owner: "ru_ai не должен быть
        // виден пользователю нигде на сайте, это только для lbl.html").
        for (const row of sqlRowsIn('DISTINCT sutta_id, lang, translator', 'texts', 'sutta_id',
            leafIds, `AND kind = 'translation' AND translator <> 'ai' ${filter.sql}`, filter.params)) {
            (translations[row.sutta_id] = translations[row.sutta_id] || []).push(`${row.lang}_${row.translator}`);
        }
    }

    // `return` is load-bearing: an async handler that resolves with undefined after calling
    // send() makes Fastify emit an empty compressed body, so the answer arrives as 0 bytes for
    // any client that sends Accept-Encoding — i.e. every browser.
    return res.send({ code, tree: annotated, translations, interlinearKeys: [...INTERLINEAR_TRANSLATOR_KEYS] });
});

// Заглушка TOC для "оглавленческих" id — целая никая/самьютта ("sn25", "mn") или Vinaya-
// категория без номера ("pj", "pli-tv-bu-vb-"), у которых нет отдельного skeletonDB[id], но
// есть дочерние тексты (sn25.1, sn25.2, ... / pli-tv-bu-vb-pj1, ...). Общая логика без
// хардкода списка никай — см. public/overrides/js/dg-text-router.js (classify()) за тем, как
// клиент строит такие id-префиксы из ввода пользователя ("sn25", "pm" и т.п.).
// Три случая границы после префикса:
//   - префикс оканчивается на "-" (Vinaya-категория целиком, "pli-tv-bu-vb-") → дальше буквы
//     кода правила ("pj1", "ss3", ...);
//   - префикс оканчивается цифрой ("sn25") → дальше обязательно "." или ":" (иначе "sn2"
//     ложно подхватил бы "sn25.1");
//   - префикс — голое имя никаи без цифр ("sn", "dhp") → дальше обязательно цифра (иначе
//     "sn" ложно подхватил бы "snp1.1", т.к. "snp" тоже начинается на "sn").
function findChapterChildren(prefix) {
    return Object.keys(skeletonDB).filter(id => {
        if (id === prefix || !id.startsWith(prefix)) return false;
        const rest = id.slice(prefix.length);
        if (prefix.endsWith('-')) return /^[a-z]/i.test(rest);
        if (/\d$/.test(prefix)) return /^[.:]/.test(rest);
        return /^\d/.test(rest);
    }).sort();
}

// /toc/<id> — оглавление, открытое на нужном месте ("/toc/mn", "/toc/sn25"). Та же SPA-страница,
// что и голый /toc; какой узел раскрыть, клиент читает из СВОЕГО адреса (public/spa/toc.js,
// targetFromPath) — сервер здесь только отдаёт шаблон, ничего про :code не знает.
app.get('/toc/:code', (req, res) => {
    sendVersionedHtml(req, res, searchIndexPath);
});

// Чистые URL: /dn22 → ридер, /dn22:12.1 → ридер с прокруткой к сегменту (разбор ":" — на клиенте),
// /kacchapa → страница поиска (search/index.html сам читает слово из пути — initSearchApp, если нет
// ?q=). Старый формат /?q=kacchapa#12.1 по-прежнему полностью рабочий как ВХОДНОЙ формат (старые
// ссылки/закладки) — initSearchApp читает ?q= первым делом, до пути — но сами мы теперь никогда
// не генерируем ?q=, только чистый путь (см. search/index.html, submit-обработчик #form). Раньше
// здесь был redirect на /?q=..., то есть адрес в строке браузера всё равно "портился" обратно
// в ?q= даже для собственной навигации сайта — теперь просто отдаём ту же страницу поиска прямо
// по чистому пути, без редиректа.
// Отдельного текста an1.9 в корпусе нет — он лежит внутри диапазона an1.1-10 (так свёрстаны
// короткие сутты в AN/SN/DHP и т.п.). Раньше такой запрос не находил ни текста, ни детей главы
// и молча уезжал на страницу поиска по строке "an1.9", хотя сам текст есть. Ищем диапазон,
// который его накрывает: сначала с номером главы ("an1.9" -> "an1.1-10"), затем без неё
// ("dhp5" -> "dhp1-20"). Легаси делал то же самое отдельным ranges.sh (см. комментарий в
// dg-text-router.js).
function findRangeContaining(id) {
    const withChapter = id.match(/^([a-z-]+)(\d+)\.(\d+)$/);
    const flat = id.match(/^([a-z-]+)(\d+)$/);
    let book, chapter, num;
    if (withChapter) {
        book = withChapter[1]; chapter = withChapter[2]; num = parseInt(withChapter[3], 10);
    } else if (flat) {
        book = flat[1]; chapter = null; num = parseInt(flat[2], 10);
    } else {
        return null;
    }
    const rangeRe = chapter
        ? new RegExp('^' + book + chapter + '\\.(\\d+)-(\\d+)$')
        : new RegExp('^' + book + '(\\d+)-(\\d+)$');
    for (const key of Object.keys(skeletonDB)) {
        const m = key.match(rangeRe);
        if (!m) continue;
        if (num >= parseInt(m[1], 10) && num <= parseInt(m[2], 10)) return key;
    }
    return null;
}

app.get('/:slug', (req, res) => {
    const rawSlug = req.params.slug;
    // A mounted directory asked for WITHOUT its trailing slash — "/4nt", "/dict", "/b" — is
    // not a search query. @fastify/static registers only "/4nt/*" for a prefix, so the bare
    // "/4nt" fell through to this catch-all and ran a full-text search for the word "4nt"
    // (Express's serve-static redirects to the slash form on its own; Fastify has to be told).
    // Redirecting rather than serving the index in place keeps the tool's own relative links
    // ("an/index.html") resolving under /4nt/, not under /. Query string is kept: 4nt's own
    // citation router is "/4nt/?q=mn1". mountedPrefixes = everything the siteroot/ and
    // offline-mirror scan loops actually registered (plus /assets, /read); /settings is the one
    // hand-mounted directory with an index page of its own.
    if (mountedPrefixes.has(rawSlug) || rawSlug === 'settings') {
        return res.redirect('/' + rawSlug + '/' + queryString(req), 301);
    }
    // A siteroot/ entry whose target is missing on this machine (skippedPrefixes at startup):
    // still a folder name, not a keyword — an honest 404 beats "0 texts found for mobile-data".
    if (siteRootEntries.has(rawSlug)) return res.callNotFound();
    const colonIdx = rawSlug.indexOf(':');
    const rawBase = (colonIdx === -1 ? rawSlug : rawSlug.slice(0, colonIdx)).toLowerCase();
    const anchorSuffix = colonIdx === -1 ? '' : rawSlug.slice(colonIdx);
    // Owner (live bug): sharing "AN 10.72" from a phone's OS share sheet produced a link with a
    // literal space ("/an%2010.72") instead of "an10.72" — the raw slug never matched skeletonDB,
    // so this fell through all the way to a useless 0-result keyword search. classify() already
    // knows how to join "letter <space> digit" (and other loose typo shorthands); redirect to the
    // canonical id when it resolves to something DIFFERENT from the raw slug, same pattern as the
    // range/TOC redirects below — a clean URL also sidesteps the client re-deriving the wrong id.
    const classified = DgTextRouter.classify(rawBase);
    if (classified.type === 'text' && classified.id !== rawBase) {
        return res.redirect('/' + encodeURIComponent(classified.id) + anchorSuffix + queryString(req), 301);
    }
    const suttaId = rawBase;
    if (skeletonDB[suttaId]) {
        // Раньше отдавали отдельную reader-template.html — прямой заход/reload/шаринг ссылки на
        // сутту НЕ был SPA (свой header, свой bootstrap, дублировал search/index.html). Теперь
        // отдаём тот же SPA-шаблон, что и на "/" — его собственный routeFromUrl() (см. конец
        // <script> в search/index.html) при загрузке сам распознаёт suttaId в пути и вызывает
        // openReaderInPlace(), который лениво подгружает ТОТ ЖЕ megareader.js в #reader-pane.
        // reader-template.html пока не в unused/ — держим как референс для допереноса
        // недостающих ссылок/кнопок в SPA-ридер (см. TODO.md, reader-бэклог).
        return sendVersionedHtml(req, res, searchIndexPath);
    }
    // Якорем идёт сам запрошенный id: внутри диапазона сегменты пронумерованы по вложенной
    // сутте ("an1.9:1.1"), и megareader.js для диапазонов кладёт в id элемента ПОЛНЫЙ segment id,
    // так что "an1.9" — валидный префикс якоря (точное совпадение ищется первым, см. там же).
    const range = findRangeContaining(suttaId);
    if (range) {
        const query = queryString(req); // сохраняем ?s=, ?lang= и т.п.
        return res.redirect('/' + encodeURIComponent(range) + ':' + encodeURIComponent(suttaId) + query);
    }
    // "Оглавленческий" id ("mn", "sn25", "pli-tv-bu-vb-") — не текст, а узел оглавления. Раньше
    // здесь отдавалась самодельная HTML-заглушка со списком детей; теперь есть настоящий TOC —
    // уводим в него, на нужный узел, вместо второй, урезанной копии того же самого.
    // Код из toc-books.json проверяем отдельно от findChapterChildren: у собрания ("kn") своих
    // текстов с таким префиксом нет вообще, дети — у его книг, так что по одному только скелету
    // такой узел не опознать.
    if (TOC_CODES.has(suttaId) || findChapterChildren(suttaId).length) {
        const query = queryString(req); // сохраняем ?lang= и т.п.
        return res.redirect('/toc/' + encodeURIComponent(suttaId) + query);
    }
    return sendVersionedHtml(req, res, searchIndexPath);
});

// Native 404 (public/404.html) — replaces legacy /assets/404.php (PHP includes for
// config/translate.php + a horizontal-menu partial, both from the old dg repo). This is a
// real 404 status, unlike the /:slug route above which always answers 200 (single-segment
// unknown slugs are valid search queries, not errors) — this only fires for what nothing else
// matched: multi-segment paths and missing static files under /assets etc. Self-contained,
// no legacy dependency (only /assets/{css,js,img} files already vendored in public/overrides/).
//
// Also where the /ru rewrite (see comment above the removed /spa/app section) lands: Express ran
// it as regular middleware, after the static mounts but before the final catch-all — here it's
// folded into the not-found handler instead, since that's the equivalent "nothing else matched"
// point in Fastify's routing model (see comment there for why). Only difference from the
// original: a 302 redirect to the rewritten URL instead of a silent internal rewrite — the
// browser's URL bar ends up showing the canonical (non-/ru) URL plus ?lang=ru, one extra
// round-trip, same final page. Fine for the bookmark-restoration use case this exists for
// (/ru, /ru/dn22, ...); a real static file under /ru/* is still served directly above, never
// reaching this handler at all.
app.setNotFoundHandler((req, res) => {
    if (req.url === '/ru' || req.url.startsWith('/ru/') || req.url.startsWith('/ru?')) {
        const [pathPart, queryPart] = req.url.split('?');
        const rest = pathPart.slice(3) || '/';
        const params = new URLSearchParams(queryPart || '');
        params.set('lang', 'ru');
        return res.redirect(rest + '?' + params.toString());
    }
    sendVersionedHtml(req, res, path.join(__dirname, 'public', '404.html'), 404);
});

app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) { console.error(err); process.exit(1); }
    console.log(`\n=== Dhamma.gift Server (dg-fastify.js) ===\n`);
    console.log(`SPA (new): http://localhost:${PORT}/spa/`);
    // /search — JSON API, ?q= здесь ОБЯЗАТЕЛЕН (не легаси) — это не HTML-страница с чистым
    // URL, а сырой API-эндпоинт. Остальные примеры ниже — чистые URL (?q= там только как
    // легаси-формат ВХОДА для старых ссылок, initSearchApp его всё ещё читает, но сама
    // навигация сайта его больше не генерирует — см. TODO.md "Проверено реальным сервером...
    // старый /?q=kacchapa по-прежнему работает").
    console.log(`API: http://localhost:${PORT}/search?q=kacchapa&scope=dhamma&langs=ru,en`);
    console.log(`API (произвольный язык): http://localhost:${PORT}/search?q=leiden&scope=dhamma&langs=de`);
    console.log(`Search UI: http://localhost:${PORT}/kacchapa?lb=1&la=2&scope=dhamma`);
    console.log(`API docs: http://localhost:${PORT}/api-docs`);
    console.log(`Legacy Reader: http://localhost:${PORT}/dn22`);
    console.log(`Reader (single, 1 язык):    http://localhost:${PORT}/dn22?mode=single&lang=ru`);
    console.log(`Reader (multi):             http://localhost:${PORT}/dn22?mode=multi&langs=ru,en`);
    console.log(`Reader (произвольный язык): http://localhost:${PORT}/dn22?langs=de`);
    console.log(`  (?mode= — временный резолвер до маршрутизации по префиксу пути, см. reader-template.html)`);
    console.log(`\n`);
});

})(); // end of the async IIFE started above the compress/cors registration
