// dg-fastify.js — the production server (SQLite/FTS5 via dg.db), run under pm2 as "dg-prod".
// Started life as an A/B port of dg-light.js (the older Express + grep server, see CLAUDE.md)
// to benchmark the two frameworks on identical business logic; that benchmark is over and this
// file won. dg-light.js is now legacy/unused — nothing requires() it and nothing runs it in
// prod — kept in the repo only as reference until it's archived. The two files still don't
// require() each other (comments below compare behavior for historical/porting context).

// Per-checkout settings (PORT, AI tokens) live in a gitignored .env next to this file, so prod
// and test checkouts keep their own port no matter how pm2 was started. Real env vars still win.
try { process.loadEnvFile(require('path').join(__dirname, '.env')); } catch {}

// A git pull can add a dependency without anyone running npm install — then the first require()
// below crashes the server in a restart loop. Install whatever package.json lists but is missing.
{
    const { existsSync } = require('fs');
    const { join } = require('path');
    const deps = Object.keys(require('./package.json').dependencies || {});
    const missing = deps.filter(d => !existsSync(join(__dirname, 'node_modules', d, 'package.json')));
    if (missing.length) {
        console.log(`Missing dependencies (${missing.join(', ')}) — running npm install`);
        require('child_process').execSync('npm install --no-audit --no-fund', { cwd: __dirname, stdio: 'inherit' });
    }
}

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
// Cheap local "is this even a query" gate in front of the whole AI pipeline — see that file and
// dg-node issue #29 (crawler noise like "lzh-mg-bi-pm_pc127" was reaching DPD and the LLM).
const { nonQueryReason } = require('./core/query-guard.js');
const { searchHybrid } = require('./core/tipitaka-mcp-client.js');
const { verifyCandidates, lookupWord } = require('./core/dpd-lookup.js');
const { mcpHandler } = require('./core/mcp-server.js');
// Regex-keyword searches run in a worker thread with a hard deadline — see core/regex-runner.js
// and core/regex-worker.js for why (one pattern used to block the whole HTTP process).
const regexRunner = require('./core/regex-runner.js');
// Limits for that: configs/search/regex-limits.json, read once at startup (a live worker keeps the
// values it was spawned with, so a change needs a restart).
const REGEX_LIMITS = (() => {
    try {
        const cfg = JSON.parse(fsSync.readFileSync(path.join(__dirname, 'configs', 'search', 'regex-limits.json'), 'utf8'));
        delete cfg._comment;
        return { ...regexRunner.DEFAULTS, ...cfg };
    } catch (err) {
        console.warn('regex-limits.json is unreadable, using defaults:', err.message);
        return { ...regexRunner.DEFAULTS };
    }
})();

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
    buildSearchResponse,
    buildTextDataFromBase,
    filterPreferredTranslators,
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
    inCorpusStem,
} = searchCore;

// bodyLimit mirrors the express.text({limit:'10mb'}) on /assets/lbl-save.php below — Fastify's
// body limit is instance-wide, not per-route, so it's set here instead.
// trustProxy: this process sits behind apache (127.0.0.1) behind nginx (see the IP list in
// configs/search/regex-limits.json → rateLimit.trustProxy). Without it req.ip is apache's address
// for every visitor and the per-IP regex budget becomes one shared budget. An explicit list of the
// proxy addresses, never `true`/a hop count: with those a client could rotate X-Forwarded-For to
// escape the limit, because the leftmost entry is taken on faith.
const app = Fastify({
    bodyLimit: 10 * 1024 * 1024,
    trustProxy: REGEX_LIMITS.rateLimit ? REGEX_LIMITS.rateLimit.trustProxy || false : false,
});

// Legacy reader URLs -> the SPA reader. External sites still link to them (SuttaCentral:
// "find.dhamma.gift/read/?q=MN1"), so they redirect rather than disappear. Only the pages
// themselves: /read/js/voice.js and the other files under these prefixes are left alone.
// /rev/, /frev/ and /rv (the PHP site's Reverse readers) are not part of DG (owner 2026-10-19): the plain reader. /ru/read/ is
// turned into /read/?…&lang=ru by the not-found handler first and lands here on the next hop.
const LEGACY_READERS = {
    '/read': {}, '/r': { lang: 'ru' }, '/d': { mode: 'devanagari' }, '/memorize': { mode: 'memorize' },
    '/ml': { mode: 'multi' }, '/mt': { mode: 'multi', lang: 'ru' }, '/multi': { mode: 'multi' },
    '/th': { lang: 'th' }, '/th/read': { lang: 'th' }, '/mlth': { mode: 'multi', lang: 'th' },
    '/rev': {}, '/frev': {}, '/rv': {},
};
function legacyReaderRedirect(url) {
    const [pathPart, queryPart = ''] = url.split('?');
    const page = pathPart.replace(/\/(index\.(html|php))?$/, '') || '/';
    const params = new URLSearchParams(queryPart);
    if (page === '/history.php') return '/4as';
    if (page === '/read.php') return '/toc';
    if (page === '/cse.php') return '/cse' + (queryPart ? '?' + queryPart : ''); // the Google Custom Search page, now served here
    if (page === '/pm.php' || page === '/bipm.php') return '/toc/vinaya'; // the standalone pages are gone, the TOC shows the Patimokkha
    const target = LEGACY_READERS[page];
    if (!target) return null;
    const q = (params.get('q') || '').trim();
    params.delete('q');
    for (const [k, v] of Object.entries(target)) if (!params.has(k)) params.set(k, v);
    const rest = params.toString();
    if (!q) return '/' + (rest ? '?' + rest : '');
    const [base, seg] = q.split(':');
    const classified = DgTextRouter.classify(base.toLowerCase());
    if (classified.type === 'text') {
        return '/' + encodeURIComponent(classified.id) + (seg ? ':' + seg : '') + (rest ? '?' + rest : '');
    }
    return '/?q=' + encodeURIComponent(q) + (rest ? '&' + rest : '');
}
app.addHook('onRequest', (req, res, done) => {
    const to = (req.method === 'GET' || req.method === 'HEAD') ? legacyReaderRedirect(req.url) : null;
    if (to) return res.redirect(to, 301);
    done();
});

// /bw (The Buddha's Words mirror), /ai (offline-data/dhammagift/ai/, the AI-assisted draft
// translation) and /b (legacy PHP reader shell — PHP is not executed under this vhost any more,
// so it only ever serves a blank shell now, but still a stray legacy page, owner: lock it down
// too) must be unreachable for ordinary visitors and crawlers, full stop — not just hidden from
// search/menu UI and robots.txt (owner: "ru_ai не должен быть виден пользователю нигде на
// сайте"; "/bw и ai переводы должны быть недоступны для обычных пользователей в принципе").
// The client-side "force_local" flag (dg-text-router.js/settings.js) only changes which URL a
// link on OUR OWN page points to — it was never real access control, so it changes nothing
// here. Gate all three prefixes with HTTP Basic Auth, checked before any static mount below.
let restrictedAuth = null;
try { restrictedAuth = require('./configs/local/restricted-auth.json'); }
catch (e) { console.warn('configs/local/restricted-auth.json missing — /bw, /ai and /b are UNPROTECTED:', e.message); }
// decoded, like the router sees it: "/%61i/" must not slip past the check below as "not /ai"
function decodedPath(url) {
    const raw = url.split('?')[0];
    try { return decodeURIComponent(raw); } catch { return raw; }
}
// Static mounts must not hand out dotfiles (/4nt/.git/config, .vscode, .htaccess) or PHP source
// (/assets/lbl-save.php, /assets/texts/sutta.php: PHP never runs here, the file would be read as
// text). Only .php inside a folder: the top-level old addresses (/w.php?q=…, /s.php, /r.php,
// /history.php) are not files, they reach the SPA or legacyReaderRedirect and keep working.
// /ai and /b are proxied to Apache, which does run their PHP; /.well-known stays public.
app.addHook('onRequest', (req, res, done) => {
    const p = decodedPath(req.url);
    if (/\/\.(?!well-known(\/|$))/.test(p)) return res.code(404).send('Not found');
    if (req.method === 'GET' && /^\/[^/]+\/.*\.php$/i.test(p.replace(/^\/ru(?=\/)/, '')) && !/^\/(ai|b)\//.test(p)) return res.code(404).send('Not found'); // /ru/w.php is a language prefix, not a folder
    done();
});
app.addHook('onRequest', (req, res, done) => {
    const p = decodedPath(req.url);
    // /reviews: the owner's review and status pages (siteroot/reviews, not in git), same password
    if (!restrictedAuth || !/^\/(bw|ai|b|reviews)(\/|$)/.test(p)) return done();
    const [, b64] = (req.headers.authorization || '').split(' ');
    const [user, pass] = b64 ? Buffer.from(b64, 'base64').toString().split(':') : [];
    if (user === restrictedAuth.user && pass === restrictedAuth.pass) return done();
    // Search engines get 410 Gone, not 401: with 401 (and, earlier, a robots.txt Disallow they could not read past) the
    // old /bw, /ai and /b pages stayed in the index. People (and the owner's login) still get the password prompt.
    if (/bot|crawl|spider|slurp|yandex|bingpreview|duckduck|facebookexternalhit/i.test(req.headers['user-agent'] || '')) return res.code(410).send('Gone');
    // Realm text is shown by some browsers in the login box; the body is shown when the visitor presses Cancel.
    res.header('WWW-Authenticate', 'Basic realm="Access restricted by rights holders"')
        .code(401).type('text/html; charset=utf-8')
        .send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Restricted</title>'
            + '<body style="font:18px/1.5 sans-serif;max-width:32em;margin:15vh auto;padding:0 1em;color:#222">'
            + '<p style="text-align:center"><img src="/assets/img/dgsanhkalogo-sm.webp" alt="Dhamma.Gift" width="120"></p>'
            + '<p>Access to this section is restricted by the rights holders.</p>'
            + '<p>Questions: <a href="mailto:agiftofdhamma@gmail.com">agiftofdhamma@gmail.com</a></p>'
            + '<p>Доступ к этому разделу ограничен правообладателями.</p>'
            + '<p>По вопросам: <a href="mailto:agiftofdhamma@gmail.com">agiftofdhamma@gmail.com</a></p>'
            + '<p><a href="/">Dhamma.Gift</a></p></body>');
});

// Real /robots.txt — without this exact route the parametric /:slug catch-all (keyword search
// fallback) answers instead, so crawlers got a 200 HTML search page with zero Disallow rules
// (confirmed live, 2026-09-28: dhamma.gift/robots.txt returned the SPA shell, not text/plain).
app.get('/robots.txt', (req, reply) => sendFile(req, reply, path.join(__dirname, 'configs', 'robots.txt'), 'text/plain; charset=utf-8'));
// /llms.txt (llmstxt.org, PageSpeed "Agentic Browsing"): what the site is and where its texts are, for AI agents - the
// same catch-all answered it with the SPA shell
app.get('/llms.txt', (req, reply) => sendFile(req, reply, path.join(__dirname, 'configs', 'llms.txt'), 'text/plain; charset=utf-8'));
// IndexNow (Yandex, Bing, Seznam…): the key file proves the site is ours when scripts/indexnow-ping.js
// announces new and changed pages. The key is public by design, not a secret.
const INDEXNOW_KEY_PATH = path.join(__dirname, 'configs', 'indexnow-key.txt');
const INDEXNOW_KEY = fsSync.readFileSync(INDEXNOW_KEY_PATH, 'utf8').trim();
app.get('/' + INDEXNOW_KEY + '.txt', (req, reply) => sendFile(req, reply, INDEXNOW_KEY_PATH, 'text/plain; charset=utf-8'));
// Same for /sitemap.xml (named in robots.txt). Built at startup by buildSitemapCache() from dg.db
// and the docs builds; it no longer comes from the legacy site's hand-kept file.
const SITEMAP_PATH = path.join(__dirname, 'settings', 'sitemap.xml');
app.get('/sitemap.xml', (req, reply) => sendFile(req, reply, SITEMAP_PATH, 'application/xml; charset=utf-8'));

// /ai and /b are legacy reader pages whose JS pulls its actual sutta text through PHP endpoints
// (read/js/common.js: `/read/php/translator-lookup.php?...`), and PHP is not executed by this
// Node process — a plain static mount (like the siteroot/ loop below gives every other legacy
// tool) would serve the page shell only, blank where the text belongs. Apache already runs that
// PHP correctly for the legacy site under the /old alias (same box, same files), so proxy these
// two prefixes there instead of serving them ourselves — same behavior as old.dhamma.gift,
// restrictedAuth above still gates them first. (/bw has no PHP dependency, stays a plain static
// mount via the siteroot/ loop.)
const http = require('http');
function proxyToOld(req, reply) {
    const target = http.request({
        // Host stays whatever the client actually browsed (test.dhamma.gift / dhamma.gift) —
        // that's the vhost with the working `Alias /old /var/www/html`, unlike old.dhamma.gift
        // itself, which has NO /old prefix (its DocumentRoot already IS /var/www/html).
        host: '127.0.0.1', port: 80, method: req.method, path: '/old' + req.url,
        headers: req.headers,
    }, (upstream) => {
        reply.code(upstream.statusCode);
        for (const [k, v] of Object.entries(upstream.headers)) if (v !== undefined) reply.header(k, v);
        reply.send(upstream);
    });
    target.on('error', (e) => reply.code(502).send('Proxy to /old failed: ' + e.message));
    req.raw.pipe(target);
}
for (const prefix of ['ai', 'b']) {
    app.all(`/${prefix}`, proxyToOld);
    app.all(`/${prefix}/*`, proxyToOld);
}

// 3000 is where production serves from (both dhamma.gift and test.dhamma.gift proxy here);
// dg-light.js, the legacy Express server, defaults to 3001 so the two can run side by side.
const PORT = Number(process.env.PORT) || 3000;

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
    path.join(__dirname, 'siteroot', 'login'), // /login/login.js|login.css — not under /assets
];
// Every value is a LIST of roots, tried in order, because that is how these prefixes are mounted:
// '/assets' is [public/overrides, siteroot/assets] (see its fastifyStatic registration) and a file
// that only exists in the legacy tree — /assets/js/datatables/datatables.min.css, loaded from JS by
// search/index.html — was invisible to the rewriter while only the first root was listed here. It
// stayed a bare URL, and a bare URL is exactly what a browser that cached it under the old
// immutable tier never revalidates (owner, 2026-10-01: the broken table header that only an
// incognito window fixed).
const HTML_ASSET_URL_ROOTS = {
    '/assets': [VERSIONED_STATIC_ROOTS[0], path.join(__dirname, 'siteroot', 'assets')],
    '/spa': [VERSIONED_STATIC_ROOTS[1]],
    '/nodejs/res': [VERSIONED_STATIC_ROOTS[2]],
    '/reader': [VERSIONED_STATIC_ROOTS[3]],
    '/settings': [VERSIONED_STATIC_ROOTS[4]],
    '/login': [VERSIONED_STATIC_ROOTS[5]],
};

// Built from HTML_ASSET_URL_ROOTS so a versioned root cannot be half-added: that map resolves a
// URL to its file, this pattern is what finds the URL inside the HTML. The optional ?v= is matched
// and dropped, so a version written by hand is replaced by the current hash rather than blocking
// the rewrite — /login/login.css carried a literal ?v=20260929 that no stamper could ever update.
const ASSET_URL_PATTERN = new RegExp(
    '((?:src|href)="|loadScript\\(\'|dgPreload\\(\'|addReaderCss\\(\'|\\.src = \'|\\.href = \')(\\/(?:' +
    Object.keys(HTML_ASSET_URL_ROOTS).map(p => p.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
    ')\\/[^"\'?#]+\\.(?:js|css|svg|png|ico))(?:\\?v=[^"\'&]*)?("|\')',
    'g'
);

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
// Developer notes live in HTML comments in the page sources (they stay there, for the people who work on
// the code); the visitor gets the page without them. <script>/<style> blocks are copied as they are (a
// "<!--" inside a script is code, not a comment), IE conditional comments (<!--[if ...]>) are kept.
const HTML_COMMENT_OR_BLOCK = /(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)|<!--(?!\s*\[if|\s*<!\[endif)[\s\S]*?-->/gi;
function stripHtmlComments(html) {
    return html.replace(HTML_COMMENT_OR_BLOCK, (m, block) => block || '');
}

// The stamped page is kept for a few seconds: building it reads the file, stats every asset it
// links and hashes the result (~10 ms per hit on the home page). An edit shows up within VERSIONED_HTML_TTL.
const VERSIONED_HTML_TTL = 3000;
const versionedHtmlCache = new Map(); // absPath -> { at, rewritten, etag }
function sendVersionedHtml(req, reply, absHtmlPath, statusCode = 200) {
    let entry = versionedHtmlCache.get(absHtmlPath);
    if (!entry || Date.now() - entry.at > VERSIONED_HTML_TTL) {
        entry = buildVersionedHtml(absHtmlPath);
        if (!entry) return reply.code(404).send();
        versionedHtmlCache.set(absHtmlPath, entry);
    }
    const { rewritten, etag } = entry;
    reply.header('cache-control', 'public, max-age=0, must-revalidate').header('etag', etag);
    if (statusCode === 200 && req.headers['if-none-match'] === etag) {
        return reply.code(304).send();
    }
    // returned: an async route (sendTextHtml) must hand back the reply, or @fastify/compress sends an empty body
    return reply.code(statusCode).type('text/html; charset=utf-8').send(rewritten);
}
// Speed: about half of search/index.html as served was developer comments inside its inline <script>
// and <style> blocks (owner: not needed on the site). The response goes without them; the file itself,
// which the apps build from, keeps them. terser parses the JS, so a "//" inside a string or a regex is
// safe; a block it cannot parse is served as it is. Keyed by content: rebuilt only when the page changes.
const { minify_sync: terserSync } = require('terser');
const strippedHtmlCache = new Map(); // md5 of the stamped page -> the page without comments
function stripInlineComments(html) {
    const key = crypto.createHash('md5').update(html).digest('hex');
    if (strippedHtmlCache.has(key)) return strippedHtmlCache.get(key);
    const out = html
        .replace(/(<script(?![^>]*\bsrc=)([^>]*)>)([\s\S]*?)(<\/script>)/g, (m, open, attrs, code, close) => {
            if (/\btype=["']?(?!text\/javascript|module)/i.test(attrs) || !code.trim()) return m;
            try {
                return open + terserSync(code, { compress: false, mangle: false, module: /module/.test(attrs), format: { comments: false } }).code + close;
            } catch (e) {
                console.warn(`stripInlineComments: a script kept as it is (${e.message})`);
                return m;
            }
        })
        .replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (m, open, css, close) => open + css.replace(/\/\*[\s\S]*?\*\//g, '') + close);
    if (strippedHtmlCache.size > 50) strippedHtmlCache.clear();
    strippedHtmlCache.set(key, out);
    return out;
}
function buildVersionedHtml(absHtmlPath) {
    let html;
    try { html = fsSync.readFileSync(absHtmlPath, 'utf8'); }
    catch { return null; }
    html = stripHtmlComments(html);
    const rewritten = stripInlineComments(html.replace(
        // Also stamps the lazy loadScript('/reader/megareader.js') / ('/spa/toc.js') calls in
        // search/index.html, `s.src = '/spa/toc.js'` (ensureTocAssets) and `css.href = '/assets/...'`
        // (ensureSearchAssets' DataTables stylesheet) — a bare lazy path has no other way to carry a
        // version. Each prefix is tried against every root it is mounted from, first hit wins.
        ASSET_URL_PATTERN,
        (m, pre, url, post) => {
            const prefix = Object.keys(HTML_ASSET_URL_ROOTS).find(p => url.startsWith(p + '/'));
            if (!prefix) return m;
            const relPath = url.slice(prefix.length + 1);
            const v = HTML_ASSET_URL_ROOTS[prefix]
                .map(root => getAssetVersion(path.join(root, relPath)))
                .find(Boolean);
            return v ? `${pre}${url}?v=${v}${post}` : m;
        }
    ));
    const out = absHtmlPath === path.join(__dirname, 'search', 'index.html') ? slimDataTables(deferOfflineScripts(bundleHeadCss(rewritten))) : rewritten;
    const etag = '"' + crypto.createHash('md5').update(out).digest('hex') + '"';
    return { at: Date.now(), rewritten: out, etag };
}

// Speed (PageSpeed; prod is HTTP/1.1, every request counts): the page's render-blocking styles in <head> -
// seven stylesheets and the page's own big <style> - are served as ONE file, in the same cascade order.
// Only the served page changes: search/index.html itself, which the apps build from, keeps its links.
// extrastyles.css's @import (quick-modal.css) is inlined in its place (an @import in the middle of a file
// is ignored) and relative url()s are rebased to the bundle's folder. Anything it cannot resolve leaves
// the page as it is.
const CSS_BUNDLE_URL = '/assets/css/dg-all.css';
const CSS_BUNDLE_PATH = path.join(__dirname, 'public', 'overrides', 'css', 'dg-all.css');
function resolveAssetFile(url) {
    const prefix = Object.keys(HTML_ASSET_URL_ROOTS).find(p => url.startsWith(p + '/'));
    if (!prefix) return null;
    const rel = url.slice(prefix.length + 1);
    return HTML_ASSET_URL_ROOTS[prefix].map(root => path.join(root, rel)).find(f => fsSync.existsSync(f)) || null;
}
function readBundledCss(url, depth = 0) {
    const file = resolveAssetFile(url);
    if (!file || depth > 2) return null;
    const dir = path.posix.dirname(url);
    let css = fsSync.readFileSync(file, 'utf8').replace(/@charset\s+"[^"]*";/gi, '');
    let failed = false;
    css = css.replace(/@import\s+url\(\s*["']?([^"')?]+)(?:\?[^"')]*)?["']?\s*\)\s*;/g, (m, imp) => {
        const inner = readBundledCss(imp.startsWith('/') ? imp : path.posix.join(dir, imp), depth + 1);
        if (inner == null) failed = true;
        return inner || '';
    });
    if (failed) return null;
    return css.replace(/url\(\s*(["']?)(?!data:|https?:|\/|#)([^"')]+)\1\s*\)/g, (m, q, rel) => `url(${q}${path.posix.join(dir, rel)}${q})`);
}
// Speed (PageSpeed: ~1.8 s of render blocking): the three offline-layer scripts at the top of <head> run
// first and synchronously only for a reader who has (or is getting) the offline library - the fetch shim
// must be in place before the first request then. Everyone else - nearly every visitor, and every
// crawler - gets them loaded in the background, in the same order, off the critical path: until a
// library is open the shim forwards everything to the server anyway (public/offline/app.js, point 1).
// The flags are the ones app.js itself writes. Served page only: the apps build from the file's tags.
const OFFLINE_TAGS = /<script src="\/offline\/platform\.js"><\/script>\s*<script src="\/offline\/app\.js"><\/script>\s*<script src="\/offline\/offline-status\.js"><\/script>/;
function deferOfflineScripts(html) {
    if (!OFFLINE_TAGS.test(html)) return html;
    const urls = ['platform', 'app', 'offline-status'].map(n => {
        const v = getAssetVersion(path.join(__dirname, 'public', 'offline', n + '.js'));
        return `/offline/${n}.js` + (v ? `?v=${v}` : '');
    });
    const loader = `<script>(function(){var u=${JSON.stringify(urls)},lib=false;` +
        `try{var s=localStorage;lib=s.getItem('dg.offline.libraryExists')==='1'||s.getItem('dg.offline.downloadStarted')==='1'||` +
        `!!s.getItem('dg.offline.wantData')||/"present":true/.test(s.getItem('dg.offline.state')||'')}catch(e){}` +
        `u.forEach(function(x){if(lib){document.write('<script src="'+x+'"><\\/script>')}else{var e=document.createElement('script');e.src=x;e.async=false;document.head.appendChild(e)}})})()</script>`;
    return html.replace(OFFLINE_TAGS, loader);
}
// Speed (PageSpeed, search results: datatables.min.js is the page's biggest script, 393 ms of scripting):
// the legacy DataTables download bundles 20 libraries, the results table uses 7 of them. The served page
// loads a cut with only those (core, Bootstrap 5, Buttons with colvis/HTML5 export and its JSZip, ColReorder,
// DateTime, Responsive, SearchBuilder - each with its Bootstrap 5 part), sliced from the same file at its
// "/*!" banners, so it is always the version the legacy file is. A file it cannot slice as expected leaves
// the page on the full bundle. Served page only: the apps build from search/index.html and keep the full one.
const DT_FULL_URL = '/assets/js/datatables/datatables.min.js';
const DT_SLIM_URL = '/assets/js/datatables-slim.js';
const DT_SLIM_PATH = path.join(__dirname, 'public', 'overrides', 'js', 'datatables-slim.js');
const DT_KEEP = [/^JSZip/, /^DataTables \d/, /^DataTables Bootstrap 5/, /^Buttons for DataTables/, /^Bootstrap integration for DataTables' Buttons/,
    /^Column visibility buttons/, /^HTML5 export buttons/, /^ColReorder/, /^DateTime picker/, /^Responsive/,
    /^Bootstrap 5 integration for DataTables' Responsive/, /^SearchBuilder/, /^Bootstrap 5 ui integration for DataTables' SearchBuilder/];
const DT_DROP = /^(AutoFill|Bootstrap integration for DataTables' (AutoFill|StateRestore)|Print button|ColumnControl|Bootstrap 5 styling wrapper for ColumnControl|FixedColumns|FixedHeader|KeyTable|RowGroup|RowReorder|Scroller|SearchPanes|Bootstrap 5 integration for DataTables' SearchPanes|Select for DataTables|StateRestore)/;
function buildSlimDataTables() {
    const file = resolveAssetFile(DT_FULL_URL);
    if (!file) return false;
    const src = fsSync.readFileSync(file, 'utf8');
    // sections start at a line opening a "/*!" banner; the text before the first one is the bundle's header comment
    const starts = [...src.matchAll(/^\/\*!/gm)].map(m => m.index);
    const sections = starts.map((s, i) => ({ text: src.slice(s, starts[i + 1] ?? src.length) }));
    for (const s of sections) s.name = s.text.slice(3, 300).split('\n').map(l => l.replace(/^\s*\*?\s*/, '')).find(Boolean) || '';
    let kept = 0;
    for (const s of sections) {
        const keep = DT_KEEP.some(re => re.test(s.name)), drop = DT_DROP.test(s.name);
        if (keep === drop) { console.warn(`DataTables cut: unknown section "${s.name.slice(0, 50)}", page keeps the full bundle`); return false; }
        s.keep = keep; kept += keep;
    }
    if (kept !== DT_KEEP.length + 1) { console.warn(`DataTables cut: ${kept} sections kept, expected ${DT_KEEP.length + 1}, page keeps the full bundle`); return false; }
    const text = src.slice(0, starts[0]) + sections.filter(s => s.keep).map(s => s.text).join('');
    let current = null;
    try { current = fsSync.readFileSync(DT_SLIM_PATH, 'utf8'); } catch { /* first build */ }
    if (current !== text) fsSync.writeFileSync(DT_SLIM_PATH, text);
    return true;
}
const DT_SLIM_OK = (() => { try { return buildSlimDataTables(); } catch (e) { console.warn('DataTables cut failed:', e.message); return false; } })();
function slimDataTables(html) {
    if (!DT_SLIM_OK) return html;
    return html.replace(/\/assets\/js\/datatables\/datatables\.min\.js(\?v=\w+)?/g, `${DT_SLIM_URL}?v=${getAssetVersion(DT_SLIM_PATH)}`);
}
const cssBundleCache = { key: '', html: '' };
function bundleHeadCss(html) {
    const headEnd = html.indexOf('</head>');
    if (headEnd < 0) return html;
    const head = html.slice(0, headEnd);
    const re = /<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref="(\/[^"?]+)(?:\?[^"]*)?"[^>]*>|<style>([\s\S]*?)<\/style>/g;
    const parts = [];
    for (let m; (m = re.exec(head));) parts.push({ start: m.index, end: re.lastIndex, url: m[1], css: m[2] });
    if (parts.length < 2) return html;
    const key = crypto.createHash('md5').update(head).digest('hex');
    if (cssBundleCache.key !== key) {
        const chunks = [];
        for (const part of parts) {
            const css = part.url ? readBundledCss(part.url) : part.css;
            if (css == null) { console.warn(`CSS bundle: ${part.url} not resolved, page served unbundled`); return html; }
            chunks.push(`/* ---- ${part.url || 'search/index.html <style>'} ---- */\n${css}`);
        }
        const text = '@charset "UTF-8";\n' + chunks.join('\n');
        let current = null;
        try { current = fsSync.readFileSync(CSS_BUNDLE_PATH, 'utf8'); } catch { /* first build */ }
        if (current !== text) fsSync.writeFileSync(CSS_BUNDLE_PATH, text);
        cssBundleCache.key = key;
        cssBundleCache.html = `<link rel="stylesheet" href="${CSS_BUNDLE_URL}?v=${getAssetVersion(CSS_BUNDLE_PATH)}">`;
    }
    let outHead = '', at = 0;
    parts.forEach((part, i) => { outHead += head.slice(at, part.start) + (i === 0 ? cssBundleCache.html : ''); at = part.end; });
    return outHead + head.slice(at) + html.slice(headEnd);
}

// §3: same dispatch as dg-light.js's staticCacheHeaders — @fastify/static's `setHeaders`
// option calls this with the Fastify REPLY object (not the raw Node ServerResponse the way
// Express's serve-static does — confirmed empirically: @fastify/static's own source calls
// `setHeaders?.(reply, metadata.path, metadata.stat)`; a first pass assuming `res.setHeader`
// would work unchanged crashed the server with "res.setHeader is not a function"), so this
// uses `reply.header(...)` instead of dg-light.js's `res.setHeader(...)` — same dispatch
// logic, Fastify reply API.
const CACHE_IMMUTABLE_YEAR = 'public, max-age=31536000, immutable';
// A URL we cannot tie to a content version (bare legacy <script src>, a path a script builds at
// runtime, a ?v= from an older copy of the file): keep the copy but always revalidate it. Cheap —
// ETag is already there, so an unchanged file answers 304 with no body. Replaces the old
// UNVERSIONED_LAZY_PATHS list, where every new case needed a hand-added entry.
const CACHE_REVALIDATE = 'public, max-age=0, must-revalidate';
const CACHE_FONT = 'public, max-age=604800';
const CACHE_IMAGE = 'public, max-age=86400';
const CACHE_LEGACY_CODE = 'public, max-age=86400';
const CACHE_CONFIG_JSON = 'no-cache'; // @fastify/static uses @fastify/send under the hood — real ETag by default, same as Express's serve-static (cache.md)
const CACHE_STATIC_SHORT = 'public, max-age=36000';
const CACHE_DB = 'public, max-age=3600'; // 1 h — /mobile-data/*.db; keep in lockstep with dg-light.js's CACHE_DB (same rationale there)

// UNVERSIONED_LAZY_PATHS used to live here: a hand-kept list of assets that lazy <script>
// injection (ensureSearchAssets, paliLookup.js, voice.js, dg-site.js on the dictionary) pulls in
// without a ?v=, each entry added after a fix sat behind the year-long immutable tier. The list is
// gone because the rule is now the same for every asset and needs no maintenance: immutable only
// when the ?v= matches the file's current md5, otherwise revalidate. See staticCacheHeaders below.

function staticCacheHeaders(reply, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    // Static HTML (siteroot pages — /login/, the label editors, ...) is always revalidated, never
    // served from a 10h cache: its bare <script>/<link> tags are how a JS fix reaches a reader, and a
    // cached page kept the old ones for up to 10 hours (the account-deletion fix on /login/,
    // 2026-09-30; before that the label editors, whose saves failed with a 401 from a stale copy).
    // no-cache still lets the browser keep the file — the etag makes the check cheap.
    if (ext === '.html' || ext === '.htm') {
        reply.header('cache-control', 'no-cache');
        return;
    }
    const inVersionedRoot = VERSIONED_STATIC_ROOTS.some(root => filePath.startsWith(root + path.sep));
    if (inVersionedRoot && ['.js', '.css', '.svg', '.png', '.ico'].includes(ext)) {
        // Immutable ONLY for a version that matches the file on disk right now — getAssetVersion()
        // is the same md5 sendVersionedHtml() stamps into HTML, cached by mtime, so this is one
        // stat per request and no hashing unless a ?v= is actually present. Everything else (bare
        // URL, stale ?v=, a path built in JS at runtime) revalidates: 304, always current bytes.
        const asked = /[?&]v=([^&]*)/.exec((reply.request && reply.request.url) || '');
        const fresh = asked && asked[1] === getAssetVersion(filePath);
        reply.header('Cache-Control', fresh ? CACHE_IMMUTABLE_YEAR : CACHE_REVALIDATE);
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
// GET for everything; /mcp also takes cross-origin POST with the MCP headers, so Swagger's "Try it out" (dhamma.gift/api-docs
// calling api.dhamma.gift) and browser MCP clients work. Not POST site-wide: /api/ai-search costs an LLM call per request.
await app.register(fastifyCors, {
    delegator: (req, cb) => {
        const mcp = (req.url || '').split('?')[0] === '/mcp';
        cb(null, {
            origin: '*',
            methods: mcp ? ['POST', 'OPTIONS'] : ['GET', 'OPTIONS'],
            allowedHeaders: mcp ? ['Content-Type', 'Accept', 'Mcp-Protocol-Version', 'Mcp-Session-Id'] : ['Content-Type'],
        });
    },
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
const FRAME_ANCESTORS = "frame-ancestors 'self' https://dhamma.gift https://*.dhamma.gift https://web.telegram.org"
    + ' https://localhost capacitor://localhost chrome-extension: moz-extension: safari-web-extension:';
const CACHE_PREFIXES = [
    '/search', '/api/text/', '/api/nav/',
    '/api/toc', '/api/transliterate', '/openapi.json', '/openapi.en.json',
    '/reader/mode-table.json', '/manifest.json', '/uposatha-calendar.webmanifest',
    '/config/tts-config.json', '/config/sync-config.json',
];
app.addHook('onSend', (req, reply, payload, done) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && !reply.getHeader('cache-control')) {
        const url = req.url.split('?')[0];
        if (CACHE_PREFIXES.some(p => url.startsWith(p))) {
            // An error (bad pattern, unknown text, a 5xx) must not stay in the browser for an hour: the
            // reader's "Try again" would get the same cached failure back.
            reply.header('cache-control', reply.statusCode < 400 ? 'public, max-age=3600' : 'no-store');
        }
    }
    // Security headers. Framing: only our own pages may frame these (the memo/settings sheets and the
    // quote popup are same-origin frames, *.dhamma.gift tools), plus Telegram Web, which shows the
    // bot's Mini App (telegram_bot WebAppInfo -> dhamma.gift) in an iframe, the apps' own origins and
    // the dictionary browser extension (dictPlugin: its side panel may frame https://dhamma.gift).
    // The dictionary (/dict/) is left frameable by anyone (owner).
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    if (req.protocol === 'https') reply.header('strict-transport-security', 'max-age=31536000');
    if (!/^\/dict([/?]|$)/.test(req.url)) reply.header('content-security-policy', FRAME_ANCESTORS);
    // The Dictionary registers its worker /dict/static/sw.js for the scope /dict/ (above its own folder);
    // without this header the registration failed here and dhamma.gift/dict/ never opened offline.
    if (/^\/dict\/static\/sw\.js(\?|$)/.test(req.url)) reply.header('service-worker-allowed', '/dict/');
    done(null, payload);
});

// Optional, non-blocking check: the local FontAwesome subset (public/overrides/js/
// fontawesome-local.js) is generated by build-icons.js from the icon references in the sources it
// scans — if someone adds a new icon and forgets to re-run `npm run build-icons`, rebuild instead
// of silently shipping a blank icon. Wrapped in try/catch on purpose: this must never stop the
// server from starting (missing bundle on a fresh checkout, unreadable file, whatever) — it's a
// dev-convenience step, not a requirement.
// Rebuilt HERE, at startup: the file is gitignored, so a fresh checkout / clean deploy has no copy
// at all and every FontAwesome icon on the site goes blank (test.dhamma.gift, 2026-09-05:
// fontawesome-local.js 404 after a deploy that never ran `npm run build-icons`). Same pattern as
// buildScriptBundle() below. Staleness is mtime, not a manifest diff: the old count only knew
// about search/js/home.js and settings.js, so the sign-in page's icons shipped blank on an
// existing checkout (the deploy that moved /login onto this subset, 2026-10-02) — every file the
// scan reads is listed here, and build-icons.js itself counts too.
// build-icons.js needs the @fortawesome/fontawesome-free devDependency — if it is not installed
// the build fails and we fall back to the warning, but never stop the server.
try {
    const iconBundlePath = path.join(__dirname, 'public', 'overrides', 'js', 'fontawesome-local.js');
    const iconSources = [
        'search/js/home.js',
        'public/overrides/js/settings.js',
        'siteroot/login/index.html',
        'siteroot/login/login.js',
        'build-icons.js',
    ].map((rel) => path.join(__dirname, rel));
    const bundleTime = fsSync.existsSync(iconBundlePath) ? fsSync.statSync(iconBundlePath).mtimeMs : 0;
    const stale = iconSources.some((file) => {
        if (!fsSync.existsSync(file)) return false;
        return fsSync.statSync(file).mtimeMs > bundleTime;
    });
    if (stale) {
        console.warn('[fontawesome-local] ' + (bundleTime ? 'stale subset' : 'not built yet') + ' — building now (build-icons.js)');
        try {
            // --dict=none: a server start must not rewrite the dictionary's icons (/var/www/ddg-ui has
            // no test copy — a restart turned its outline trash can solid on dict.dhamma.gift,
            // 2026-09-29). The dictionary's set is built on purpose: `npm run build-icons`.
            require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build-icons.js'), '--dict=none'], { stdio: 'inherit' });
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

// /app-site-manifest.json — the signed list of the site's files the apps may take without a new build (scripts/site-manifest.js
// writes it after a deploy; dg-apps src/site-updater.js checks the signature). Missing = 404 = the apps take nothing.
// Rebuilt on every start, so a deploy (pull + restart) never leaves it describing the previous commit: without it the apps'
// «App version → check» said «Could not check» after a deploy (owner, 2026-10-12). Only where configs/local/site-manifest.json
// names this site's origin ({"origin": "https://dhamma.gift"}) and the signing key is on the machine; a child process, so the
// server answers meanwhile, and a failure only leaves the previous list in place.
function rebuildSiteManifest() {
    let origin;
    try { origin = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'configs', 'local', 'site-manifest.json'), 'utf8')).origin; } catch (_) { return; }
    if (!origin || !require('fs').existsSync('/root/.secrets/site-manifest-signing.pem')) return;
    require('child_process').execFile(process.execPath, [path.join(__dirname, 'scripts', 'site-manifest.js'), '--origin', origin],
        { cwd: __dirname, timeout: 300000 }, (err, out, errOut) => {
            if (err) console.error('[site-manifest] not rebuilt: ' + String(errOut || err.message).trim().split('\n').pop());
            else console.log('[site-manifest] ' + String(out).trim().split('\n').pop());
        });
}
app.get('/app-site-manifest.json', (req, res) => {
    res.header('cache-control', 'no-cache');
    return sendFile(req, res, path.join(__dirname, 'app-site-manifest.json'), 'application/json')
        .catch(() => res.code(404).type('text/plain').send('Not found'));
});

// /uposatha-calendar.webmanifest — the calendar's OWN manifest (a single-segment path, no slash),
// so without an exact route it fell to the generic /:slug keyword-search catch-all below (any path
// find-my-way can't match exactly is treated as a search term/sutta id) - Chrome then fetched the
// search page's HTML instead of JSON and refused to offer installing the calendar as its own PWA.
// The file has no shortcuts: they are the next Uposatha days (core/uposatha-shortcuts.js), written in here for the time zone,
// language and scheme the page asks with (?tz=&lang=&su=0). Kept for the hour: the list changes with the day of that zone.
const uposathaManifests = new Map();
app.get('/uposatha-calendar.webmanifest', (req, res) => {
    const q = req.query || {};
    let tz = String(q.tz || 'UTC');
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { tz = 'UTC'; }
    const lang = q.lang === 'ru' ? 'ru' : 'en', sutta = q.su !== '0', hour = new Date().toISOString().slice(0, 13), key = [hour, tz, lang, sutta].join('|');
    let hit = uposathaManifests.get(key);
    if (!hit) {
        if (uposathaManifests.size > 300 || ![...uposathaManifests.keys()].every((k) => k.startsWith(hour))) uposathaManifests.clear();
        const m = JSON.parse(fsSync.readFileSync(path.join(__dirname, 'public', 'uposatha-calendar.webmanifest'), 'utf8'));
        try { m.shortcuts = require('./core/uposatha-shortcuts.js').build(uposathaCore, { now: new Date(), tz, lang, sutta }); } catch (e) { console.error('[uposatha manifest] shortcuts failed:', e.message); }
        const body = JSON.stringify(m);
        hit = { body, etag: '"' + crypto.createHash('md5').update(body).digest('hex') + '"' };
        uposathaManifests.set(key, hit);
    }
    res.header('etag', hit.etag);
    if (req.headers['if-none-match'] === hit.etag) return res.code(304).send();
    return res.type('application/manifest+json').send(hit.body);
});

// /open?url=... — in-scope redirector for manifest shortcuts that point at external, cross-origin
// sites (Aksharamukha, Dharmamitra): PWA manifest shortcuts must resolve to an in-scope URL or
// some platforms won't show them, but the destination itself can be anywhere — same trick legacy
// assets/openDDG.html used (client-side), just a one-line server redirect instead of a page.
// Only the external targets the manifest shortcuts themselves name (read from the manifest, so a new
// shortcut just works) or a same-site path are followed: anything else was an open redirect, i.e. a
// dhamma.gift link that lands on any site (phishing).
const OPEN_ORIGINS = new Set();
try {
    const manifestText = fsSync.readFileSync(path.join(__dirname, 'configs', 'manifest.json'), 'utf8');
    for (const m of manifestText.matchAll(/\/open\?url=([^"]+)/g)) OPEN_ORIGINS.add(new URL(decodeURIComponent(m[1])).origin);
} catch (err) {
    console.warn('/open: manifest shortcuts unreadable, only same-site paths are followed:', err.message);
}
app.get('/open', (req, res) => {
    const u = typeof req.query.url === 'string' ? req.query.url : '';
    let ok = /^\/(?![\/\\])[^\x00-\x1f]*$/.test(u); // "/path", but not "//host" or "/\host"
    if (!ok) { try { ok = OPEN_ORIGINS.has(new URL(u).origin); } catch { /* not a URL */ } }
    res.redirect(ok ? u : '/');
});

// Конвертация системы письма пали (настройка "selectedScript" в /settings/, приходит как
// ?script= в адресе — тот же параметр, что уже слала кнопка Alt+L, раньше ничего не делавший).
//
// Aksharamukha runs as native Python (scripts/aksharamukha-convert.py), one short process per
// request, not Pyodide inside this process. Measured on the server (2026-09-13): Pyodide kept
// ~240MB of RSS for the life of the process and converted DN 16 in ~10s; the Python script does DN
// 16 in ~0.7s with a 40MB peak that is gone when it exits (owner: "почему нельзя акшарамукху держать
// как питон скрипт"). Every text one request needs is queued within the same tick and sent in a
// single batch, so the call sites below keep converting segment by segment as before.
//
// The Python environment lives in a gitignored .venv-aksharamukha next to this file and installs
// itself in the background the first time the server starts without it (same idea as the missing
// npm packages above) — until it is ready, conversions return the text unchanged.
const AKSH_VENV = path.join(__dirname, '.venv-aksharamukha');
const AKSH_PYTHON = path.join(AKSH_VENV, 'bin', 'python');
const AKSH_CONVERT = path.join(__dirname, 'scripts', 'aksharamukha-convert.py');
let akshInstall = null;
function akshReady() {
    if (fsSync.existsSync(AKSH_PYTHON)) return true;
    if (!akshInstall) {
        console.log('Aksharamukha: installing Python environment in the background (.venv-aksharamukha)');
        akshInstall = new Promise(resolve => {
            const { exec } = require('child_process');
            exec(`python3 -m venv "${AKSH_VENV}" && "${AKSH_VENV}/bin/pip" install -q aksharamukha==2.3`,
                { timeout: 15 * 60 * 1000 }, err => {
                    if (err) console.error('Aksharamukha: Python environment install failed:', err.message);
                    else console.log('Aksharamukha: Python environment ready');
                    akshInstall = null; // a failed install is retried on the next request that needs it
                    resolve();
                });
        });
    }
    return false;
}
akshReady();

function runAkshBatch(src, dst, texts) {
    return new Promise(resolve => {
        const { execFile } = require('child_process');
        const child = execFile(AKSH_PYTHON, [AKSH_CONVERT], { timeout: 60000, maxBuffer: 256 * 1024 * 1024 }, (err, stdout) => {
            if (err) {
                console.warn(`Aksharamukha: ${src} -> ${dst} failed for ${texts.length} text(s):`, err.message.split('\n')[0]);
                return resolve(texts);
            }
            try {
                const out = JSON.parse(stdout);
                resolve(Array.isArray(out) && out.length === texts.length ? out : texts);
            } catch (e) {
                console.warn('Aksharamukha: unreadable output:', e.message);
                resolve(texts);
            }
        });
        child.stdin.end(JSON.stringify({ src, dst, texts }));
    });
}

// Queue per src->dst pair, flushed on the next turn of the event loop: all conversions started by
// one request (Promise.all over its segments) land in the same batch.
// ponytail: one Python process at a time (chain) — plenty for a handful of script requests a day;
// allow 2 in parallel if script traffic ever makes requests wait on each other.
const akshQueue = new Map(); // `${src}>${dst}` -> [{ text, resolve }]
let akshFlushScheduled = false;
let akshChain = Promise.resolve();
function akshConvert(src, dst, text) {
    if (!akshReady()) return Promise.resolve(text);
    return new Promise(resolve => {
        const key = src + '>' + dst;
        if (!akshQueue.has(key)) akshQueue.set(key, []);
        akshQueue.get(key).push({ text, resolve });
        if (akshFlushScheduled) return;
        akshFlushScheduled = true;
        setImmediate(() => {
            akshFlushScheduled = false;
            const batches = [...akshQueue.entries()];
            akshQueue.clear();
            for (const [k, items] of batches) {
                const [bSrc, bDst] = k.split('>');
                akshChain = akshChain.then(async () => {
                    const out = await runAkshBatch(bSrc, bDst, items.map(i => i.text));
                    items.forEach((item, idx) => item.resolve(out[idx]));
                });
            }
        });
    });
}
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
// The main Pali scripts are converted in-process by public/overrides/js/pali-script.js (pure JS,
// same file the offline app can run on the device) — verified against Aksharamukha on the whole
// vocab (89k word forms) + 3000 root segments with zero differences, except where Aksharamukha
// itself is wrong for Pali: it reads ḷ as the Sanskrit vocalic l (ऌ) and a+i/a+u as diphthongs
// (ै/ौ) because the source is IAST, not IASTPI. Everything else still goes to Python.
const PaliScript = require('./public/overrides/js/pali-script.js');
async function convertPaliScript(text, scriptCode) {
    const realKey = resolveScriptKey(scriptCode);
    if (!text || !realKey) return text;
    if (PaliScript.scripts.includes(realKey)) return PaliScript.convert(text, realKey);
    // ISOPali — the corpus is ISO 15919 Pali (SuttaCentral: ṁ, ḷ, long e/o), which is also why the site
    // calls its unconverted script "ISOPali". Checked in native Aksharamukha 2.3: IAST reads ḷ as vocalic
    // ऌ (daḷha -> दऌह), IASTPali leaves ṁ untouched (एवṁ), ISO makes e/o short; ISOPali gets all right.
    return akshConvert(AKSH_SCRIPTS.ISOPI, AKSH_SCRIPTS[realKey], text);
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
// a clicked word, so a short text; every call costs a Python batch in the one shared queue
const translitRateLimited = makeRateLimiter(60, 60 * 1000);
app.get('/api/transliterate', async (req, res) => {
    const text = (req.query.text || '').toString();
    if (!text) return res.send({ text: '', converted: false });
    if (text.length > 200) return res.code(400).send({ error: 'text too long' });
    if (translitRateLimited(req.ip)) return res.code(429).send({ error: 'Too many requests, try again shortly' });
    if (!akshReady()) return res.send({ text, converted: false });
    // ?from= — the script the page shows (paliLookup.js). Autodetect guesses from the word alone and a
    // short Lao Pali word (ນາປຣໍ) reads as modern Lao ("nāprṃ" instead of "nāparaṃ"). If the given
    // script does not fit the word (letters left unconverted), autodetect still gets its chance.
    const fromKey = resolveScriptKey((req.query.from || '').toString());
    let converted = fromKey ? await akshConvert(AKSH_SCRIPTS[fromKey], AKSH_SCRIPTS.IASTPI, text) : text;
    if (!fromKey || /[^\x00-\x7FĀ-ɏḀ-ỿ‐-―‘-‟…]/.test(converted)) {
        converted = await akshConvert(AKSH_SCRIPTS.AutoDetect, AKSH_SCRIPTS.IASTPI, text);
    }
    return res.send({ text: converted, converted: converted !== text });
});

// The settings sample in a script that demo-data.json does not carry (see SETTINGS_DEMO_SCRIPTS):
// the same groups, converted now. preview-frame.html asks for it once per script.
app.get('/api/settings-demo', async (req, res) => {
    const realKey = resolveScriptKey((req.query.script || '').toString());
    if (!realKey) return res.code(400).send({ error: 'unknown script' });
    const groups = await Promise.all(settingsDemoBase.map(async group => ({
        ...group,
        segments: await Promise.all(group.segments.map(async seg => ({
            ...seg,
            root_text: await convertPaliScript(seg.root_text, realKey),
            variant: await convertPaliScript(seg.variant, realKey),
        }))),
    })));
    return res.send({ script: realKey, groups });
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

// iOS's counterpart: Universal Links. A tap on a dhamma.gift link opens the iOS app instead of
// Safari once iOS has fetched this file from the domain root — /.well-known/apple-app-site-association
// or /apple-app-site-association, no redirect, application/json (Apple rejects a redirect and a
// wrong Content-Type, which is exactly what a generic static mount would produce). Same reasoning as
// the Android route above, and the same caveat: the app id carries the TEAM id, which only the
// account holder has; it is filled in now (7MXRJUJ7C3, the app's team) and has to be the team that
// signs the build, or iOS simply does not intercept the links.
//
// Every path is claimed ("/*"), deliberately: the app decides for itself which paths it serves and
// which it hands to the browser (dg-app-full/src/native-bridge.js, NOT_BUNDLED_RE plus the site-only
// list). Excluding the site-only paths here as well would be the same rule written twice, in two
// languages, on two schedules — the drift this repository has already paid for once.
for (const route of ['/.well-known/apple-app-site-association', '/apple-app-site-association']) {
    app.get(route, (req, res) => {
        res.header('content-type', 'application/json; charset=utf-8');
        res.header('cache-control', 'public, max-age=300');
        return res.send(fsSync.readFileSync(path.join(__dirname, 'configs', 'apple-app-site-association'), 'utf8'));
    });
}

app.get('/api-docs', (req, res) => res.redirect('/api-docs/'));
app.get('/api-docs/', (req, res) => {
    res.header('cache-control', 'public, max-age=0, must-revalidate');
    return res.type('text/html; charset=utf-8').send(SWAGGER_UI_HTML);
});
// Whole-sutta mp3s in the DG voices (SEO: "listen to the sutta"), made by a batch through the voice server and kept in
// Cloudflare R2 (bucket dg-files at files.dhamma.gift, audio/; owner: one free store for both prod hosts, 10 GB at most).
// audio/index.json lists them ({ files: [{ sutta, lang, translator, voice, duration, file, size }] }); read at start and
// every 10 minutes, so new batches show without a restart and both hosts link the same files. A text page names its
// files under the text (audioLineHtml) and in its JSON-LD (textHead).
const AUDIO_BASE = process.env.DG_AUDIO_BASE || 'https://files.dhamma.gift/audio/';
let SUTTA_AUDIO = new Map(); // sutta id -> [{ lang, file, duration, translator, voice }]
let suttaAudioStamp = '';
async function loadSuttaAudio() {
    try {
        const r = await fetch(AUDIO_BASE + 'index.json', { signal: AbortSignal.timeout(15000), headers: { 'cache-control': 'no-cache' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const { files = [] } = await r.json();
        const stamp = files.map(f => f.file + ':' + f.size).join('|');
        if (stamp === suttaAudioStamp) return;
        const next = new Map();
        for (const f of files) {
            // up to two folders, by Nikaya and book (owner 2026-10-19: an/an4/an4.200.ru.mp3, kn/dhp/dhp1-20.pli.mp3)
            if (!f.sutta || !/^([a-z]+\d*\/){0,2}[\w.+-]+\.(pli|ru|en)\.mp3$/.test(f.file || '')) continue;
            if (!next.has(f.sutta)) next.set(f.sutta, []);
            next.get(f.sutta).push({ lang: f.lang, file: f.file, duration: f.duration, translator: f.translator, voice: f.voice });
        }
        SUTTA_AUDIO = next;
        suttaAudioStamp = stamp;
        textHeadCache.clear(); textBodyCache.clear(); // the pages that now have (or lost) audio
        console.log(`Sutta audio: ${next.size} texts, ${files.length} files (${AUDIO_BASE})`);
    } catch (e) { console.warn('Sutta audio index:', e.message); }
}
setTimeout(loadSuttaAudio, 2000);
setInterval(loadSuttaAudio, 10 * 60 * 1000).unref();

// The line under the text, before the links row (owner: «как подпись „слушать в MP3“: пали · русский»): the Pali file
// and the one in the page's language. The same string goes into the server's text (textBodyHtml) and, through
// /api/text's audioHtml, into the reader's render, so the reader keeps the server's nodes. Right-aligned and italic like the
// byline - a caption, apart from the text (owner: «как подпись справа»). Inline style: no CSS file.
function audioLineHtml(id, lang) {
    const files = SUTTA_AUDIO.get(id) || [];
    const ru = lang === 'ru';
    const names = ru ? { pli: 'пали', ru: 'русский', en: 'английский' } : { pli: 'Pali', ru: 'Russian', en: 'English' };
    // a translation's file names its translator, as the byline does (owner: Pali needs no name; the end of the text
    // had lost its translator credit, this line brings it back with the audio)
    const who = a => String((SITE_TRANSLATORS[a.lang] || {})[a.translator] || a.translator || '').replace(/<[^>]+>/g, '');
    const links = ['pli', lang].map(l => files.find(a => a.lang === l)).filter(Boolean)
        .map(a => `<a href="${AUDIO_BASE}${a.file}" type="audio/mpeg">${names[a.lang]}</a>` + (a.lang === 'pli' || !who(a) ? '' : ` (${ru ? 'пер.' : 'trans.'} ${who(a)})`));
    return links.length ? `<p class="dg-audio-mp3" style="text-align:right;font-style:italic;font-size:.85em;opacity:.8;margin:2em 0 .5em">${ru ? 'Слушать в MP3' : 'Listen in MP3'}: ${links.join(' · ')}</p>` : '';
}

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
            // Only git metadata is skipped (offline-data is a git checkout, and `.git` would
            // otherwise be mounted as a static prefix, publishing the whole repository at
            // /.git/...). Not every dotfile: `.well-known` and friends are real content.
            .filter(d => (d.isDirectory() || d.isSymbolicLink()) && !d.name.startsWith('.git'))
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
// Pre-converted only for the scripts the settings list shows first (settings/index.html
// SCRIPT_MAIN_KEYS — keep the two lists in step); any other script is converted when someone picks
// it, through /api/settings-demo (owner: "не делай все, а только основные").
const SETTINGS_DEMO_SCRIPTS = ['Brahmi', 'Devanagari', 'Sinhala', 'Thai', 'BurmeseMyanmar'];
let settingsDemoBase = [];
async function buildSettingsDemoCache() {
    const cachePath = path.join(__dirname, 'settings', 'demo-data.json');
    const baseGroups = [];
    settingsDemoBase = baseGroups;
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

    // Reuse the file when the sample texts are unchanged: converting them into every script needs
    // Aksharamukha (Pyodide, ~240MB of RSS), which otherwise loaded on every server start for a
    // result identical to the one already on disk. A new database or sample list rebuilds it.
    try {
        const prev = JSON.parse(await fs.readFile(cachePath, 'utf8'));
        const sameScripts = JSON.stringify(Object.keys(prev).sort()) === JSON.stringify(['ISOPali', ...SETTINGS_DEMO_SCRIPTS].sort());
        if (JSON.stringify(prev.ISOPali) === JSON.stringify(baseGroups) && sameScripts) {
            console.log('Settings demo cache: sample texts unchanged, reusing settings/demo-data.json');
            return;
        }
    } catch { /* no file yet or unreadable — build it below */ }

    // First start on a machine without the Python environment: wait for its background install,
    // and never write a "converted" file full of Latin text — the reuse check above would keep it
    // forever. Not ready even then: leave the file alone, the next start tries again.
    if (!akshReady()) {
        if (akshInstall) await akshInstall;
        if (!akshReady()) {
            console.warn('Settings demo cache: Aksharamukha not ready — not written, retried on next start');
            return;
        }
    }

    const byScript = { ISOPali: baseGroups };
    for (const scriptCode of SETTINGS_DEMO_SCRIPTS) {
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
searchCore.init({ searchDb, DG_OFFLINE, limits: REGEX_LIMITS });
// The worker gets its own handle on the same file plus the same limits (workerData, at spawn).
regexRunner.configure({ dbPath: SEARCH_DB_PATH, dgOffline: DG_OFFLINE, limits: REGEX_LIMITS });
// Ordinary searches run in worker threads too: node:sqlite is synchronous, and one wide query
// ("ana": 3226 texts, 14 enrich chunks of ~4 s) used to hold the event loop, so everyone else's
// "kacchapa" took 8 s instead of 0.01 s. Two workers for the first answer (?fast=1 / full), two for
// enrich chunks, so a long enrich never stands in front of someone's first page. A dead or
// unconfigured worker falls back to the old in-process run (searchJob below).
const plainLimits = { ...REGEX_LIMITS, timeoutMs: 60000, maxQueue: 50, idleMs: 20000, maxHeapMb: Number(process.env.DG_SEARCH_HEAP_MB) || 1024 };
// Two for the first answer too: with one, a long query ("ana", full /search ~11 s) made the next person's
// ?fast=1 wait behind it (8.5 s instead of 0.01 s).
const searchPool = { first: [regexRunner.create(), regexRunner.create()], enrich: [regexRunner.create(), regexRunner.create()] };
for (const r of [...searchPool.first, ...searchPool.enrich]) r.configure({ dbPath: SEARCH_DB_PATH, dgOffline: DG_OFFLINE, limits: plainLimits });
// mmap is deliberately left off (SQLite's default). Mapping the file makes every page the query
// touches count towards this process's RSS, which measured ~500MB higher for no useful speed —
// the pages are in the OS page cache either way, and read() reaches them just as fast.
searchDb.exec('PRAGMA cache_size = -16000'); // 16MB page cache, per connection

// sitemap.xml for search engines: the home page, every text page in its final address (the one
// the reader serves without a redirect, same normalization as the /:slug route), and every docs
// page of both docs builds. Rebuilt on each start, like the other caches here, so it follows dg.db.
async function buildSitemapCache() {
    const base = 'https://dhamma.gift';
    const dbDate = (await fs.stat(SEARCH_DB_PATH)).mtime.toISOString().slice(0, 10);
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    // not /dict/: its canonical is dict.dhamma.gift — a sitemap entry whose page points elsewhere is a contradiction
    const entries = [[base + '/', dbDate, '1.0'], [base + '/?lang=ru', dbDate, '1.0']];
    // the contents pages: each links every text of its book — the shortest crawl path to the suttas
    for (const code of ['', ...TOC_CODES].filter(tocHasPali)) {
        const loc = base + '/toc' + (code ? '/' + encodeURIComponent(code) : '');
        entries.push([loc, dbDate, '0.7'], [loc + '?lang=ru', dbDate, '0.7']);
    }
    // the key terms' search results (SEO_TERMS), en and ru
    for (const t of SEO_TERMS.values()) {
        const loc = base + '/' + encodeURIComponent(t.q);
        entries.push([loc, dbDate, '0.6'], [loc + '?lang=ru', dbDate, '0.6']);
    }
    const seen = new Set();
    // the Russian page of every text that has a Russian translation (the second market, owner 2026-10-17);
    // other languages are reachable through each page's hreflang links
    const hasRu = new Set(searchDb.prepare(
        "SELECT DISTINCT sutta_id FROM texts WHERE lang = 'ru' AND kind = 'translation' AND translator <> 'ai'"
    ).all().map(r => r.sutta_id));
    for (const id of Object.keys(skeletonDB)) {
        // Pali texts only: the Chinese, Sanskrit and Gāndhārī parallels (lzh/, san/, pra/) open by their id but are
        // not what the site offers (owner: they must not be in the sitemap)
        if (!/^pli\//.test(skeletonDB[id].dir_path || '')) continue;
        const classified = DgTextRouter.classify(id.toLowerCase());
        const isVinayaAlias = classified.type === 'text' && /^pli-tv-/.test(classified.id) && skeletonDB[classified.id];
        const finalId = classified.type === 'text' && !isVinayaAlias ? classified.id : id;
        if (seen.has(finalId)) continue;
        seen.add(finalId);
        entries.push([base + '/' + encodeURIComponent(finalId), dbDate, '0.8']);
        if (hasRu.has(id)) entries.push([base + '/' + encodeURIComponent(finalId) + '?lang=ru', dbDate, '0.8']);
    }
    // Docs: each build has its own sitemap.xml. /docs/* is served with a trailing-slash redirect,
    // /ru/docs/* without one, so list each page the way it answers 200.
    for (const [dir, slash] of [['build', true], ['build-ru', false]]) {
        try {
            const xml = await fs.readFile(path.join(__dirname, 'dg-docs', dir, 'sitemap.xml'), 'utf8');
            for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
                let loc = m[1];
                if (slash && !loc.endsWith('/') && !/\.[a-z0-9]+$/i.test(loc)) loc += '/';
                entries.push([loc, dbDate, '0.5']);
            }
        } catch (e) {
            console.warn(`Sitemap: no docs sitemap in dg-docs/${dir} (${e.code || e.message})`);
        }
    }
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        entries.map(([loc, lastmod, prio]) => `  <url><loc>${esc(loc)}</loc><lastmod>${lastmod}</lastmod><priority>${prio}</priority></url>`).join('\n') +
        '\n</urlset>\n';
    try {
        await fs.writeFile(SITEMAP_PATH, xml, 'utf8');
        console.log(`Sitemap built: ${entries.length} URLs -> settings/sitemap.xml`);
    } catch (e) {
        console.warn('Sitemap: could not write file:', e.message);
    }
}

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
        await buildSitemapCache();
        countSeoTerms(); // not awaited: the titles get their numbers a few seconds after start
        await buildScriptBundle();
        rebuildSiteManifest(); // after the bundles: the list hashes them
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
// same reason as the other retired PHP pages). Reimplements the legacy PHP: write the POST body to
// offline-data/lbl/{file}, creating the dir if missing.
// --- Label editor: who may save (issue #18) ------------------------------------------------
// This endpoint used to take any body from anyone (up to 10MB, any name under offline-data/lbl/),
// so a stranger could overwrite a translator's draft or fill the disk. It now requires a Google
// (Firebase) ID token whose verified e-mail is listed in configs/local/lbl-authors.json.
// No new dependency: the RS256 signature is checked against Google's public JWKS for Firebase
// projects with node:crypto, which imports a JWK directly.
const LBL_AUTHORS_FILE = path.join(__dirname, 'configs', 'local', 'lbl-authors.json');
const FIREBASE_CONFIG_FILE = path.join(__dirname, 'configs', 'local', 'sync-config.json');
// Overridable so the self-check (test/lbl-auth.cjs) and a local end-to-end can serve their own keys.
const FIREBASE_JWKS_URL = process.env.DG_FIREBASE_JWKS_URL
    || 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let lblJwksCache = { at: 0, keys: [] };

function readJsonFile(file, fallback) {
    try { return JSON.parse(fsSync.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function b64urlJson(part) { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')); }

async function firebaseJwks(force) {
    if (!force && lblJwksCache.keys.length && Date.now() - lblJwksCache.at < 6 * 3600 * 1000) {
        return lblJwksCache.keys;
    }
    const r = await fetch(FIREBASE_JWKS_URL, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error('JWKS ' + r.status);
    const data = await r.json();
    lblJwksCache = { at: Date.now(), keys: Array.isArray(data.keys) ? data.keys : [] };
    return lblJwksCache.keys;
}

// {ok:true, email} or {ok:false, status, reason} — reason is a short code the editor translates.
// allowedEmails: the list to check against (default: the label editor's authors).
async function verifyLblToken(authHeader, allowedEmails) {
    const m = /^Bearer\s+(.+)$/i.exec(String(authHeader || ''));
    const token = m && m[1].trim();
    if (!token) return { ok: false, status: 401, reason: 'no-token' };
    const parts = token.split('.');
    if (parts.length !== 3) return { ok: false, status: 401, reason: 'malformed' };
    let header, payload;
    try { header = b64urlJson(parts[0]); payload = b64urlJson(parts[1]); }
    catch { return { ok: false, status: 401, reason: 'malformed' }; }
    if (header.alg !== 'RS256' || !header.kid) return { ok: false, status: 401, reason: 'alg' };
    const projectId = readJsonFile(FIREBASE_CONFIG_FILE, {}).projectId;
    if (!projectId) return { ok: false, status: 503, reason: 'no-project' };
    const now = Math.floor(Date.now() / 1000);
    if (payload.aud !== projectId) return { ok: false, status: 401, reason: 'aud' };
    if (payload.iss !== 'https://securetoken.google.com/' + projectId) return { ok: false, status: 401, reason: 'iss' };
    if (!(payload.exp > now)) return { ok: false, status: 401, reason: 'expired' };
    let keys;
    try { keys = await firebaseJwks(false); } catch { return { ok: false, status: 503, reason: 'jwks' }; }
    let jwk = keys.find(k => k.kid === header.kid);
    if (!jwk) {
        // A key rotation between two requests: refetch once before giving up.
        try { jwk = (await firebaseJwks(true)).find(k => k.kid === header.kid); } catch { /* keep undefined */ }
    }
    if (!jwk) return { ok: false, status: 401, reason: 'kid' };
    let signatureOk = false;
    try {
        signatureOk = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]),
            crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
    } catch { signatureOk = false; }
    if (!signatureOk) return { ok: false, status: 401, reason: 'signature' };
    const email = String(payload.email || '').toLowerCase();
    if (!email || payload.email_verified !== true) return { ok: false, status: 403, reason: 'unverified', email };
    const authors = (allowedEmails || readJsonFile(LBL_AUTHORS_FILE, {}).authors || []).map(a => String(a).toLowerCase());
    if (!authors.includes(email)) return { ok: false, status: 403, reason: 'not-author', email };
    return { ok: true, email };
}

const lblRateLimited = makeRateLimiter(30, 60 * 1000);
const LBL_MAX_FILES = 2000, LBL_MAX_BYTES = 300 * 1024 * 1024;
app.post('/assets/lbl-save.php', { bodyLimit: 2 * 1024 * 1024 }, async (req, res) => {
    res.header('cache-control', 'no-store'); // cache.md §5 — write endpoint
    // 2MB per route (the instance-wide 10MB stays for everything else): the largest real payload
    // is a whole translation file — dn16 is 340KB — and the editor's own saves are ~12KB.
    const auth = await verifyLblToken(req.headers.authorization);
    if (!auth.ok) {
        console.warn('[lbl-save] refused:', auth.reason, auth.email ? 'as=' + auth.email : '', 'file=' + String(req.query.file || '').slice(0, 60));
        return res.code(auth.status).send(auth.reason);
    }
    // per author: the editor saves on demand, ~12KB each; 30/min stops a runaway loop or a leaked token
    if (lblRateLimited(auth.email)) return res.code(429).send('Too many saves, try again shortly');
    const filename = path.basename(req.query.file || `backup_${Date.now()}.json`);
    // only translation JSON: the folder is served under /lbl/, so an .html here would run on the site
    if (!/^[\w.+-]+\.json$/.test(filename)) return res.code(400).send('Only .json files');
    const saveDir = path.join(OFFLINE_MIRRORS_ROOT, 'lbl');
    try {
        fsSync.mkdirSync(saveDir, { recursive: true });
        // a ceiling for the whole folder, so even a valid login in a loop cannot fill the disk
        // (real use: a few dozen translation files, ~10 MB). Overwriting an existing file is fine.
        const names = fsSync.readdirSync(saveDir);
        const used = names.reduce((sum, n) => { try { return sum + fsSync.statSync(path.join(saveDir, n)).size; } catch { return sum; } }, 0);
        if (!names.includes(filename) && (names.length >= LBL_MAX_FILES || used + Buffer.byteLength(req.body) > LBL_MAX_BYTES)) {
            console.warn('[lbl-save] folder full:', names.length, 'files,', used, 'bytes; refused', filename, 'as', auth.email);
            return res.code(507).send('The translations folder is full, ask the site owner');
        }
        fsSync.writeFileSync(path.join(saveDir, filename), req.body);
        // One line per save — who wrote what, so a surprise in the folder can be traced.
        fsSync.promises.mkdir(path.join(__dirname, 'logs'), { recursive: true })
            .then(() => fsSync.promises.appendFile(path.join(__dirname, 'logs', 'lbl-saves.log'),
                `${new Date().toISOString()}\t${auth.email}\t${filename}\t${Buffer.byteLength(req.body)}\n`))
            .catch(() => {});
        res.code(200).send('OK');
    } catch (err) {
        res.code(500).send('Error writing file: ' + err.message);
    }
});

// /api/app-log — error reports from the Android app (dg-app-full src/platform.js): JS errors,
// unhandled rejections, failed resources and console.error, batched and sent with sendBeacon.
// Answers 204 at once and appends after the reply, so a report never slows anyone down. One JSON
// line per report in logs/app-errors.log (*.log is gitignored), capped so a crash loop on some
// phone cannot fill the disk.
const APP_LOG = path.join(__dirname, 'logs', 'app-errors.log');
// The owner's review replies (kinds dg-review, dg-status, ...) come in here too and are read from this
// file, so at the cap it is rotated to app-errors.log.1, never just stopped. Writes go one at a time:
// two at once could both see a full file and rotate twice, throwing away the .1 just made.
const APP_LOG_MAX_BYTES = 20 * 1024 * 1024;
let appLogQueue = Promise.resolve();
function appendAppLog(file, lines, maxBytes) {
    appLogQueue = appLogQueue.then(async () => {
        const size = await fsSync.promises.stat(file).then(s => s.size, () => 0);
        if (size >= maxBytes) await fsSync.promises.rename(file, file + '.1');
        await fsSync.promises.mkdir(path.dirname(file), { recursive: true });
        await fsSync.promises.appendFile(file, lines);
    }).catch(err => console.error('[app-log] write failed:', err.message));
    return appLogQueue;
}
const appLogRateLimited = makeRateLimiter(120, 60 * 1000); // a person clicking reply buttons fast stays well under
app.post('/api/app-log', { bodyLimit: 32 * 1024 }, (req, res) => {
    if (appLogRateLimited(req.ip)) return res.header('cache-control', 'no-store').code(429).send();
    res.header('cache-control', 'no-store').code(204).send();
    let items;
    try { items = JSON.parse(req.body); } catch (e) { return; }
    if (!Array.isArray(items) || !items.length) return;
    const at = new Date().toISOString();
    const lines = items.slice(0, 50)
        .map(it => JSON.stringify({ at, ...(it && typeof it === 'object' ? it : { msg: String(it) }) }).slice(0, 4000))
        .join('\n') + '\n';
    appendAppLog(APP_LOG, lines, APP_LOG_MAX_BYTES);
});

// Google Text-to-Speech through the site, for the Android app: the trial key (configs/local/
// tts-config.json) only accepts requests from dhamma.gift pages, and the app's pages are
// https://localhost (Google answers 403). Only the two calls read/js/voice.js makes; the key stays
// on the server and is read per request, so a new key needs no restart and no app release (owner).
// The app posts text/plain (a simple CORS request, no preflight); the site keeps calling Google itself.
const TTS_KEY_FILE = path.join(__dirname, 'configs', 'local', 'tts-config.json');

// Abuse limits for the two paid endpoints (TTS proxy, AI search). Per address it is a request
// budget per window, not a connection count; the numbers are deliberately loose because one address
// can be many people behind a NAT. The real cost ceiling is the global cap under each one.
// ponytail: fixed window, in memory (a restart resets it), same idea as regexRateLimited above;
// fold the two together if a third caller appears.
function makeRateLimiter(max, windowMs, maxIps = 10000) {
    const hits = new Map(); // ip -> { count, resetAt }
    return ip => {
        const now = Date.now();
        const key = String(ip || 'unknown');
        let e = hits.get(key);
        if (!e || e.resetAt <= now) {
            if (hits.size >= maxIps) {
                for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
                if (hits.size >= maxIps) return false; // full: stop limiting, the global cap still holds
            }
            e = { count: 0, resetAt: now + windowMs };
            hits.set(key, e);
        }
        return ++e.count > max;
    };
}
const ttsRateLimited = makeRateLimiter(60, 60 * 1000); // ~20 segments/min per listener, so 3 people behind one NAT fit
// Monthly ceiling on characters sent to Google through the proxy (the Chirp 3 HD default voice has a
// free tier of about 1M characters a month, shared with the site's own direct calls) — over it the
// app gets 429 and its player falls back to the system voice. Persisted so a restart keeps the count.
const TTS_MONTHLY_CHARS = 500000;
const TTS_USAGE_FILE = path.join(__dirname, 'logs', 'tts-usage.log');
let ttsUsage = { month: '', chars: 0 };
try { ttsUsage = JSON.parse(fsSync.readFileSync(TTS_USAGE_FILE, 'utf8')); } catch { /* first run */ }
function ttsCharsOverCap(chars) {
    const month = new Date().toISOString().slice(0, 7);
    if (ttsUsage.month !== month) ttsUsage = { month, chars: 0 };
    return ttsUsage.chars + chars > TTS_MONTHLY_CHARS;
}
// Charged only for what Google actually synthesized: a rejected or failed request costs nothing there.
function ttsCharsCount(chars) {
    ttsUsage.chars += chars;
    fsSync.promises.mkdir(path.dirname(TTS_USAGE_FILE), { recursive: true })
        .then(() => fsSync.promises.writeFile(TTS_USAGE_FILE, JSON.stringify(ttsUsage))).catch(() => {});
}
async function googleTts(res, apiPath, init, chars = 0) {
    try {
        const key = JSON.parse(await fsSync.promises.readFile(TTS_KEY_FILE, 'utf8')).key;
        if (!key) return res.code(503).send({ error: { message: 'TTS key is not configured' } });
        const url = 'https://texttospeech.googleapis.com/v1/' + apiPath + (apiPath.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key);
        const r = await fetch(url, {
            ...init,
            headers: { ...(init && init.headers), Referer: 'https://dhamma.gift/' },
            signal: AbortSignal.timeout(20000),
        });
        if (r.ok && chars) ttsCharsCount(chars);
        return res.code(r.status).header('content-type', 'application/json').header('cache-control', 'no-store').send(await r.text());
    } catch (err) {
        console.error('[tts-proxy]', err.message);
        return res.code(502).send({ error: { message: 'Text-to-Speech is unavailable' } });
    }
}
app.get('/api/tts/voices', (req, res) => {
    if (ttsRateLimited(req.ip)) return res.code(429).send({ error: { message: 'Too many requests, try again shortly' } });
    return googleTts(res, 'voices' + (req.query.languageCode ? '?languageCode=' + encodeURIComponent(req.query.languageCode) : ''));
});
app.post('/api/tts/synthesize', { bodyLimit: 64 * 1024 }, (req, res) => {
    if (ttsRateLimited(req.ip)) return res.code(429).send({ error: { message: 'Too many requests, try again shortly' } });
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    let text = body; // unreadable body: judge and charge its size
    try { const input = JSON.parse(body).input || {}; text = String(input.text || input.ssml || '') || body; } catch { /* keep body */ }
    // Google refuses input over 5000 bytes anyway; answering here keeps junk from reaching it at all.
    if (Buffer.byteLength(text) > 5000) return res.code(413).send({ error: { message: 'Text is longer than 5000 bytes' } });
    if (ttsCharsOverCap(text.length)) return res.code(429).send({ error: { message: 'Monthly text-to-speech limit reached' } });
    return googleTts(res, 'text:synthesize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, text.length);
});

// Self-hosted Pali voice: Piper + IAST->IPA rules from the pali-tts listening tests
// (/var/www/pali-tts/tts_server.py, systemd pali-tts, localhost only). Same answer shape as
// Google's text:synthesize ({audioContent}), so read/js/voice.js plays both the same way. No monthly
// cap: it costs only our CPU, and the service caches every mp3 it makes.
const PALI_TTS_URL = process.env.PALI_TTS_URL || 'http://127.0.0.1:3011/synthesize';
app.post('/api/tts/pali', { bodyLimit: 16 * 1024 }, async (req, res) => {
    if (ttsRateLimited(req.ip)) return res.code(429).send({ error: { message: 'Too many requests, try again shortly' } });
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    try {
        // tts_server.py limits per X-Forwarded-For: without it every listener shares this server's one bucket
        const r = await fetch(PALI_TTS_URL, { method: 'POST', body, headers: { 'x-forwarded-for': req.ip }, signal: AbortSignal.timeout(60000) });
        return res.code(r.status).header('content-type', 'application/json').header('cache-control', 'no-store').send(await r.text());
    } catch (err) {
        console.error('[pali-tts]', err.message);
        return res.code(502).send({ error: { message: 'Pali voice is unavailable' } });
    }
});
// The Memo page's mp3 download with the DG voice: all lines with silences of any length between them
// (Google's SSML stops at 10 s). Binary answer (audio/mpeg), passed through as is; limits are the service's.
app.post('/api/tts/memo', { bodyLimit: 256 * 1024 }, async (req, res) => {
    if (ttsRateLimited(req.ip)) return res.code(429).send({ error: { message: 'Too many requests, try again shortly' } });
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    try {
        const r = await fetch(PALI_TTS_URL.replace(/\/synthesize$/, '/memo'), { method: 'POST', body, headers: { 'x-forwarded-for': req.ip }, signal: AbortSignal.timeout(300000) });
        return res.code(r.status).header('content-type', r.headers.get('content-type') || 'application/octet-stream')
            .header('cache-control', 'no-store').send(Buffer.from(await r.arrayBuffer()));
    } catch (err) {
        console.error('[pali-tts memo]', err.message);
        return res.code(502).send({ error: { message: 'Pali voice is unavailable' } });
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
// Old static help pages (/assets/common/*.html) now live in the docs (owner: "все документальные —
// заменить на docs"). Permanent redirects keep old bookmarks and links from the legacy site working;
// the tool/data pages next to them (history, multiTool, abbr, syrkin) are not help and stay.
const LEGACY_HELP_REDIRECTS = {
    'dictHelp.html': '/docs/dictionary', 'dictHelpRu.html': '/ru/docs/dictionary',
    'keyFeatures.html': '/docs/key-features', 'keyFeaturesRu.html': '/ru/docs/key-features',
    'privacy.html': '/docs/policies', 'privacy-ru.html': '/ru/docs/policies',
    'rationale-en.html': '/docs/rationale', 'rationale.html': '/ru/docs/rationale',
    'o-en.html': '/docs/principles', 'o.html': '/ru/docs/principles',
    'ttsHelp.html': '/docs/tts',
    'lunar.html': '/uposatha-calendar', 'lunarRu.html': '/uposatha-calendar?lang=ru', // the calendar is a page of its own now
};
for (const [file, target] of Object.entries(LEGACY_HELP_REDIRECTS)) {
    app.get('/assets/common/' + file, (req, res) => res.redirect(target, 301));
}
// The app's help page was /dhamma-gift-full while an online and a full app existed; one app now.
for (const p of ['/docs', '/ru/docs']) {
    for (const tail of ['', '/']) app.get(p + '/dhamma-gift-full' + tail, (req, res) => res.redirect(p + '/dhamma-gift-app', 301));
}
// Project tools retired on this site (owner: "не нужен", "было под проект"). The legacy tree keeps the
// files for the old site, so without these routes the static fallback would still serve them here.
// One edition-abbreviations page, /assets/common/abbr.html (the current copy); old links keep working.
app.get('/assets/texts/abbr.html', (req, res) => {
    const q = req.url.indexOf('?');
    res.redirect('/assets/common/abbr.html' + (q === -1 ? '' : req.url.slice(q)), 301);
});
for (const file of ['linebyline.html', 'readylinebyline.html']) {
    for (const url of ['/assets/' + file, '/ru/assets/' + file]) {
        app.get(url, (req, res) => res.code(404).type('text/plain').send('Not found'));
    }
}
app.get('/assets/js/translators.json', (req, res) => {
    res.header('Cache-Control', CACHE_CONFIG_JSON);
    return sendFile(req, res, path.join(__dirname, 'configs', 'reader', 'translators.json'), 'application/json');
});
// Speed (PageSpeed: about 400 KB of the pages' scripts, gzipped, was developer comments and indentation):
// our own scripts go out minified (core/min-js.js: no compress, no mangle - the same statements, only
// without comments and whitespace) with a source map at url + ".map" (sources included: DevTools shows the
// original file, and a logged file:1:column maps back with it). The files themselves, which the apps build
// from, are untouched; scripts/site-manifest.js signs these served bytes. One build per file version
// (warmed after start); a file terser cannot parse (an ES module) is served as it is.
const minJs = require('./core/min-js');
const minJsCache = new Map(); // abs -> { mtimeMs, code, map, etag } (code null: served as it is)
function minifiedJs(abs) {
    const mtimeMs = fsSync.statSync(abs).mtimeMs;
    const c = minJsCache.get(abs);
    if (c && c.mtimeMs === mtimeMs) return c;
    let entry = { mtimeMs, code: null };
    try {
        const r = minJs.minifyJs(fsSync.readFileSync(abs, 'utf8'), path.basename(abs));
        entry = { mtimeMs, code: r.code, map: r.map, etag: '"' + crypto.createHash('md5').update(r.code).digest('hex') + '"' };
    } catch (e) {
        console.warn(`minified JS: ${path.relative(__dirname, abs)} served as it is (${e.message})`);
    }
    minJsCache.set(abs, entry);
    return entry;
}
const minJsFiles = [];
for (const [prefix, rel] of Object.entries(minJs.MIN_JS_DIRS)) {
    const dir = path.join(__dirname, rel);
    let names = [];
    try { names = fsSync.readdirSync(dir).filter(n => minJs.servedMinified(n, fsSync.statSync(path.join(dir, n)).size)); } catch { continue; }
    for (const name of names) {
        const abs = path.join(dir, name), url = `${prefix}/${name}`;
        minJsFiles.push(abs);
        app.get(url, (req, reply) => {
            let c;
            try { c = minifiedJs(abs); } catch { return reply.code(404).type('text/plain').send('Not found'); }
            if (prefix === '/offline') reply.header('Cache-Control', CACHE_CONFIG_JSON); else staticCacheHeaders(reply, abs);
            if (!c.code) return sendFile(req, reply, abs, 'application/javascript; charset=utf-8');
            reply.header('etag', c.etag);
            if (req.headers['if-none-match'] === c.etag) return reply.code(304).send();
            return reply.type('application/javascript; charset=utf-8').send(c.code);
        });
        app.get(url + '.map', (req, reply) => {
            let c;
            try { c = minifiedJs(abs); } catch { c = {}; }
            if (!c.map) return reply.code(404).type('text/plain').send('Not found');
            reply.header('Cache-Control', CACHE_CONFIG_JSON);
            return reply.type('application/json; charset=utf-8').send(c.map);
        });
    }
}
// built after start, one file per tick, so the first visitors do not wait for it
setTimeout(function warm(i = 0) { if (i < minJsFiles.length) { try { minifiedJs(minJsFiles[i]); } catch { /* gone */ } setImmediate(warm, i + 1); } }, 3000);
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
// см. TODO.md). The bare reader PAGES (/read, /r, /d, /memorize...) still redirect to the SPA —
// untouched, see LEGACY_READERS above, an exact-path match that never sees a /read/js/... subpath.
// Anything this small override set doesn't have (js/php/images the /b and /ai legacy wrapper
// pages hardcode as absolute `/read/...` paths, now Basic-Auth-gated, see restrictedAuth above)
// falls through to the SAME /old proxy those two use, prefix-scoped 404 handler, same pattern
// as /spa below — not a blanket static fallback onto the whole legacy siteroot/read tree, just
// the specific files a miss actually asks for, fetched from Apache on demand.
app.register(async (read) => {
    read.register(fastifyStatic, {
        root: path.join(__dirname, 'public', 'overrides', 'read'),
        prefix: '/',
        setHeaders: staticCacheHeaders,
        decorateReply: false,
    });
    read.setNotFoundHandler((req, res) => proxyToOld(req, res));
}, { prefix: '/read' });
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

// /config/tts-config.json, /config/sync-config.json — the only 2 files out of the legacy
// siteroot/config/ (67 tracked files: apache/systemd/AndroidManifest, AWS creds, config.zip)
// dg-node code actually fetches (public/overrides/read/js/voice.js, settings.js/
// settings-bundle.js). Vendored into configs/legacy/ so siteroot/config can be dropped
// entirely instead of publishing the rest of that directory's unrelated legacy server files.
app.get('/config/tts-config.json', (req, res) => sendFile(req, res, path.join(__dirname, 'configs', 'local', 'tts-config.json'), 'application/json'));
app.get('/config/sync-config.json', (req, res) => sendFile(req, res, path.join(__dirname, 'configs', 'local', 'sync-config.json'), 'application/json'));

// Bare fragment (no page shell) of the same content, for /toc's inline expand
// (public/spa/toc.js renderBookRow) — fetched once on first click, not preloaded.
// Custom Google Search (Programmable Search Engine) — the one-page replacement for legacy cse.php
// The Uposatha calendar as a page of its own (also embedded in the docs); the hyphenated path cannot be
// mistaken for a Pali search word the way /uposatha could.
app.get('/uposatha-calendar', (req, res) => sendVersionedHtml(req, res, path.join(__dirname, 'public', 'uposatha-calendar.html')));
// Subscription feed for Google / Apple calendars. Stateless: everything the feed needs is in the query string, nothing is stored.
const uposathaCore = require('./public/overrides/js/uposatha-core.js');
const uposathaFeedCache = new Map();
app.get('/uposatha.ics', (req, reply) => {
    const q = req.query || {};
    const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
    let tz = String(q.tz || 'UTC');
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { return reply.code(400).type('text/plain').send('bad tz'); }
    const lat = num(q.lat, -90, 90), lon = num(q.lon, -180, 180);
    const opts = {
        lang: q.lang === 'ru' ? 'ru' : 'en', tz, sutta: q.scheme !== 'modern', loc: lat !== null && lon !== null ? { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 } : null,
        rem: { lead: num(q.lead, 0, 72) === null ? 24 : num(q.lead, 0, 72), d8: q.d8 !== '0', d14: q.d14 !== '0', d15: q.d15 === '1' }, days: 400, feed: true,
    };
    // day=HHMM: a second reminder on the Uposatha day itself at that time of the clock; adv=0 with it: without the one ahead
    const dayAt = /^([01]\d|2[0-3])([0-5]\d)$/.exec(String(q.day || ''));
    if (dayAt) { opts.rem.day = true; opts.rem.dayAt = dayAt[1] + ':' + dayAt[2]; opts.rem.on = q.adv !== '0'; }
    const key = JSON.stringify(opts) + new Date().toISOString().slice(0, 13); // a computed feed is reused for an hour
    let body = uposathaFeedCache.get(key);
    if (!body) {
        body = uposathaCore.buildIcs(opts);
        if (uposathaFeedCache.size > 300) uposathaFeedCache.clear();
        uposathaFeedCache.set(key, body);
    }
    return reply.type('text/calendar; charset=utf-8').header('cache-control', 'public, max-age=3600').send(body);
});
app.get('/cse', (req, res) => sendVersionedHtml(req, res, path.join(__dirname, 'public', 'cse.html')));
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
            // Git metadata only, same reason as the offline mirrors above.
            .filter(d => (d.isDirectory() || d.isSymbolicLink()) && !d.name.startsWith('.git'))
            .map(d => d.name)
    );
} catch (e) {
    console.warn('Siteroot not found:', SITEROOT);
}
// 'assets' and 'read' are already folded into the override root-arrays registered above (they'd
// otherwise be duplicate registrations on the same prefix, which Fastify rejects outright). Also
// skip anything whose real target isn't a directory (a siteroot entry such as sitemap.xml
// is a symlink to an individual FILE, harmless dead weight for
// express.static but a hard registration error for @fastify/static, which requires root to be a
// directory).
const mountedPrefixes = new Set(['assets', 'read', 'memorize', 'devanagari', 'mobile-data', 'ai', 'b']); // 'mobile-data' is the explicit /mobile-data mount above — the scan must not re-register it (duplicate route = hard error); 'ai'/'b' are proxied to /old below instead of statically mounted, see there
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

// --- Our own HTML goes through the rewriter, so no ?v= is ever written by hand ----------------
// sendVersionedHtml() stamps ?v=<md5 of the file on disk> onto every /assets|/spa|/reader|/settings
// link in the page, so a fix reaches readers as soon as the HTML is revalidated (HTML is always
// revalidated) and nothing has to be bumped by hand when an asset changes. Only these roots are
// routed per file: the legacy mirror trees under siteroot/ hold tens of thousands of .html each
// (suttacentral.net alone: 70k), where one route per file is not worth its startup cost — those
// are covered by the cache rule instead (unversioned asset = revalidate), which needs no per-file
// work at all. A new small tool in siteroot/ gets its routes on the next restart if it is added
// to this list; anything not listed stays correct, just without the immune-to-revalidation URLs.
const VERSIONED_HTML_ROOTS = [
    [path.join(__dirname, 'public', 'overrides'), '/assets'], // lbl, multiTool, makelist, grammar/*, ...
    [path.join(SITEROOT, 'assets'), '/assets'],               // legacy fallback of the same URL space
    [path.join(SITEROOT, 'login'), '/login'],
    [path.join(SITEROOT, 'login'), '/ru/login'],
    [path.join(SITEROOT, 'memo'), '/memo'],
    [path.join(SITEROOT, 'memo'), '/ru/memo'],
    [path.join(SITEROOT, 'help'), '/help'],
    [path.join(SITEROOT, 'app-tests'), '/app-tests']
];
// URLs that already have an explicit route (redirects, 404 stubs) must not be registered twice.
const versionedHtmlUrls = new Set([
    ...Object.keys(LEGACY_HELP_REDIRECTS).map(f => '/assets/common/' + f),
    '/assets/texts/abbr.html', '/assets/linebyline.html', '/assets/readylinebyline.html',
    '/ru/assets/linebyline.html', '/ru/assets/readylinebyline.html'
]);
for (const [rootDir, urlPrefix] of VERSIONED_HTML_ROOTS) {
    const stack = [rootDir];
    while (stack.length) {
        const dir = stack.pop();
        let entries;
        try { entries = fsSync.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const entry of entries) {
            const abs = path.join(dir, entry.name);
            // Dirent.isDirectory() is false for a symlink to a directory — the same trap the
            // siteroot scan above documents, so stat the link instead of trusting the dirent.
            let isDir = entry.isDirectory();
            if (entry.isSymbolicLink()) { try { isDir = fsSync.statSync(abs).isDirectory(); } catch { continue; } }
            if (isDir) { stack.push(abs); continue; }
            if (!entry.name.endsWith('.html')) continue;
            const rel = path.relative(rootDir, abs).split(path.sep).join('/');
            // /login/index.html and /login/ are one page; links on the site use the directory form.
            const urls = [`${urlPrefix}/${rel}`];
            if (rel.endsWith('index.html')) urls.push(`${urlPrefix}/${rel.slice(0, -'index.html'.length)}`);
            for (const url of urls) {
                if (versionedHtmlUrls.has(url)) continue;
                versionedHtmlUrls.add(url);
                app.get(url, (req, reply) => sendVersionedHtml(req, reply, abs));
            }
        }
    }
}

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
    // the old /?q=word form is a search page too (its canonical is the clean /word)
    return req.query.q ? sendSiteHtml(req, res, 'search', String(req.query.q)) : sendSiteHtml(req, res, 'home');
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
        // an1.9 / dhp5 live inside a range text: say which, so the SPA opens it there (a cold
        // load of /an1.9 gets the same answer as a redirect from the /:slug route)
        if (!base) return res.code(404).send({ error: `Unknown sutta id: ${suttaId}`, range: findRangeContaining(suttaId) || undefined });
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
        // Aksharamukha.Scripts, см. akshConvert/resolveScriptKey выше). Только root_text/variant —
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

        data.audioHtml = audioLineHtml(suttaId, data.lang); // the line under the text (audioLineHtml), '' when none
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
const AI_SEARCH_CACHE_MAX = 500;
const aiCacheSet = (key, data) => { // bounded: the oldest entry goes first (Map keeps insertion order)
    if (AI_SEARCH_CACHE.size >= AI_SEARCH_CACHE_MAX) AI_SEARCH_CACHE.delete(AI_SEARCH_CACHE.keys().next().value);
    AI_SEARCH_CACHE.set(key, { at: Date.now(), data });
};
const aiRateLimited = makeRateLimiter(10, 60 * 1000);
// Daily ceiling on searches that reach the paid pipeline, whoever asks (in memory: a restart resets it).
const AI_SEARCH_DAILY_MAX = 500;
let aiDaily = { day: '', count: 0 };
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

    // Owner: "зачем-то битые запросы улетают в AI режим так крайлеры и роботы будут тратить
    // токены... нужно это починить" (dg-node #29) — this endpoint is reached by every URL a
    // crawler walks whose exact search finds nothing, so the FIRST thing to decide is whether the
    // string is a query at all, before DPD and long before any paid model. Purely local: ids like
    // "lzh-mg-bi-pm_pc127" and mangled URLs like "an10.76@1@   L烗      ," cost nothing here and
    // never leave the process (core/query-guard.js has the rules and why each one is safe).
    // Deliberately not cached — a local regex answer is free to recompute, and caching crawler
    // noise would only fill the Map that real queries use.
    const nonQuery = nonQueryReason(q);
    if (nonQuery) {
        const responseBody = {
            ok: true, query: q, suttas: [], wordSuggestions: [],
            debug: { normalizedQuery: `(not a search query: ${nonQuery}, no provider call) ${q}`, provider: 'guard', paliCandidates: [] },
        };
        logAiSearch(q, responseBody);
        return res.send(responseBody);
    }

    // Everything below can reach a paid model: per-address budget first, then the daily ceiling.
    if (aiRateLimited(req.ip)) return res.code(429).send({ ok: false, reason: 'rate_limited', detail: 'too many AI searches from this address, try again shortly' });
    const today = new Date().toISOString().slice(0, 10);
    if (aiDaily.day !== today) aiDaily = { day: today, count: 0 };
    if (++aiDaily.count > AI_SEARCH_DAILY_MAX) return res.code(429).send({ ok: false, reason: 'daily_limit', detail: 'the daily AI search limit is reached, exact search still works' });

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
                // tripitaka-mcp holds Pāli + English only: the gloss sent there is always DPD's
                // English one, whatever the UI language (`wordInfo.gloss` stays for the chip).
                const enGloss = lang === 'en'
                    ? wordInfo.gloss
                    : await lookupWord(q, 'en').then(r => r.gloss).catch(() => null);
                const mcp = {};
                const hits = await searchHybrid(enGloss ? `${q} — ${enGloss}` : q, 15, mcp).catch(() => []);
                const responseBody = {
                    ok: true, query: q,
                    suttas: hitsToSuttaRows(hits, scope),
                    wordSuggestions: [{ word: q, gloss: wordInfo.gloss }],
                    debug: { normalizedQuery: `(DPD-confirmed word, no LLM call) ${q}`, provider: 'dpd', paliCandidates: [q], mcp },
                };
                logAiSearch(q, responseBody);
                aiCacheSet(cacheKey, responseBody);
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
                aiCacheSet(cacheKey, responseBody);
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
            aiCacheSet(cacheKey, responseBody);
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
        aiCacheSet(cacheKey, responseBody);
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
    //
    // Measured on 10 queries with a known right sutta, same candidates for every variant
    // (2026-09-13), right sutta in the top 5: phrase + all candidates 4, phrase + candidates found in
    // the corpus 5, both queries pooled 5 (but ranked the right sutta lower, at twice the MCP calls).
    // The model invents or misspells some candidates ("alagaddupáma") and those cost hits — so only
    // candidates the corpus actually contains a form of go into the query.
    const specificCandidates = (dispatch.paliCandidates || []).filter(w => !GENERIC_PALI_TERMS.has(w.toLowerCase()));
    const verifiedCandidates = specificCandidates.filter(inCorpusStem);
    debug.droppedCandidates = specificCandidates.filter(w => !verifiedCandidates.includes(w));
    const searchInput = verifiedCandidates.length
        ? `${dispatch.searchQuery} — ${verifiedCandidates.join(', ')}`
        : dispatch.searchQuery;
    debug.mcp = {};
    const hits = await searchHybrid(searchInput, 15, debug.mcp).catch(() => []); // over-fetch; deduped/trimmed to ~5 suttas below

    const responseBody = {
        // Owner: the loading skeleton promised "похожие палийские слова" that never arrived — the
        // corpus-checked candidates are exactly those, shown as chips above the table (glosses are
        // filled on the page from the bundled DPD, see ai-search.js enrichWithLocalDpd).
        ok: true, query: q, suttas: hitsToSuttaRows(hits, scope), wordSuggestions: verifiedCandidates.map(word => ({ word })), debug,
    };
    logAiSearch(q, responseBody);
    aiCacheSet(cacheKey, responseBody);
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

/* ---------------------------------------------------------------------------
   Regex-keyword searches (q contains a regex metacharacter) — see
   configs/search/regex-limits.json for every number used here.

   Why they are not answered like every other search: such a keyword cannot use the FTS index, so
   it scans rows of dg.db with a compiled RegExp, and a pattern like "(.+)+#" backtracks
   exponentially inside a single row — nothing in-process can interrupt that. Measured before this
   change: "d.*" blocked the whole HTTP process for 11s and took ~1GB of RSS, "(.+)+#" never
   returned. So the job runs in a worker (core/regex-runner.js) that the parent can terminate, the
   pattern must carry a real literal ("duk") which also prefilters rows through FTS, and each IP
   gets a small budget.

   Answers: 400 bad/too-short-pattern, 429 over budget or the queue is full, 503 over the deadline.
   Never a silent empty answer, and never a blocked event loop. */

const regexRate = new Map(); // ip -> { count, resetAt } — only for the /search entry points

function regexRateLimited(ip, enrich = false) {
    const cfg = REGEX_LIMITS.rateLimit || {};
    if (cfg.enabled === false) return false;
    const windowMs = Math.max(1000, Number(cfg.windowMs) || 60000);
    const max = enrich ? Math.max(1, Number(cfg.enrichMax) || 60) : Math.max(1, Number(cfg.max) || 10);
    const maxIps = Math.max(1, Number(cfg.maxTrackedIps) || 10000);
    const key = (enrich ? 'enrich:' : '') + String(ip || 'unknown');
    const now = Date.now();
    const entry = regexRate.get(key);
    if (!entry || entry.resetAt <= now) {
        if (regexRate.size >= maxIps) {
            for (const [k, v] of regexRate) if (v.resetAt <= now) regexRate.delete(k);
            // ponytail: a full map stops limiting instead of growing — the worker deadline is the
            // real protection, this counter is only there to stop a loop of patterns.
            if (regexRate.size >= maxIps) return false;
        }
        regexRate.set(key, { count: 1, resetAt: now + windowMs });
        return false;
    }
    entry.count++;
    if (entry.count > max) {
        // One line per over-budget address: the only way to see WHO hits the limit, since the
        // app never logs request addresses anywhere else.
        if (entry.count === max + 1) console.warn(`[regex] rate limit hit by ${key}`);
        return true;
    }
    return false;
}

// Runs one regex job in the worker. Returns { result } or { status, error } to answer with. When
// the worker is unavailable the answer is 503, never an in-process run: that would put back the
// blocked event loop (and uninterruptible backtracking) the worker exists to prevent.
async function regexSearch(kind, keyword, params) {
    const outcome = await regexRunner.runJob(kind, { keyword, ...params });
    if (outcome.ok) return { result: outcome.result };
    if (outcome.unavailable) {
        console.warn('[regex] worker unavailable:', outcome.message);
        return { status: 503, error: 'Regex search is temporarily unavailable, try again in a moment.' };
    }
    if (outcome.badRequest) return { status: 400, error: outcome.message };
    if (outcome.busy) return { status: 429, error: 'Too many regex searches are waiting, try again in a moment.' };
    if (outcome.timedOut) return { status: 503, error: `Regex search did not finish within ${REGEX_LIMITS.timeoutMs}ms — narrow the pattern or the scope.` };
    return { status: 500, error: 'Regex search failed.' };
}

// A non-regex job in the pool; null = run it in-process instead (worker unavailable or queue full).
// asJson: nothing will be changed in the answer here (no ?script= conversion), so the worker sends its
// finished JSON text and this process passes it on as is: { json, zero } instead of { result }.
async function searchJob(kind, keyword, params, asJson) {
    const runner = (kind === 'enrich' ? searchPool.enrich : searchPool.first).reduce((a, b) => (b.load() < a.load() ? b : a));
    const outcome = await runner.runJob(kind, { keyword, plain: true, asJson: !!asJson, ...params });
    if (outcome.ok) return outcome.json !== undefined
        ? (outcome.zero ? { result: JSON.parse(outcome.json) } : { json: outcome.json }) // zero results: suggestions are added below
        : { result: outcome.result };
    if (outcome.timedOut) return { status: 503, error: 'Search did not finish in time — narrow the query or the scope.' };
    if (outcome.badRequest) { const err = new Error(outcome.message); err.badRequest = true; throw err; }
    if (outcome.unavailable) console.warn('[search] worker unavailable, running in-process:', outcome.message);
    return null;
}

function sendJsonText(res, text) {
    return res.type('application/json; charset=utf-8').send(text);
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
    const lb         = Math.min(Math.max(parseInt(req.query.lb) || 0, 0), 10); // context lines; unbounded = a memory DoS
    const la         = Math.min(Math.max(parseInt(req.query.la) || 0, 0), 10);

    if (keyword.length < MIN_KEYWORD_LENGTH) {
        return res.send({
            metadata: { query: keyword, scope: scope || 'default', resolvedPrefixes: resolveAllowedPrefixes(scope), langs: targetLangs, totalFiles: 0, totalMatches: 0, hasVariantMatch: false, tooShort: true },
            data: {}, wordReport: [], variantSegments: []
        });
    }

    // A regex keyword is a different animal: check the pattern (400) and the per-IP budget (429)
    // before any work happens.
    const isRegex = searchCore.isRegexKeyword(keyword);
    if (isRegex) {
        const problem = searchCore.regexProblem(keyword);
        if (problem) return res.code(400).send({ error: problem });
        if (regexRunner.isBusy()) return res.code(429).send({ error: 'Too many regex searches are waiting, try again in a moment.' });
        if (regexRateLimited(req.ip)) return res.code(429).send({ error: 'Too many regex searches from this address — try again shortly.' });
    }
    const jobParams = { scope, exact, langs: targetLangs, lb, la };

    try {
        // TODO.md поиск п.5: ?fast=1 skips per-sutta file reads entirely — grep-only skeleton
        // + full wordReport, quotes/context arrive later via /search/enrich.
        if (req.query.fast === '1') {
            // ?fast=1 не содержит текста сегментов вообще (только grep-счётчики) — конвертировать
            // тут нечего, полный текст приходит позже через /search/enrich.
            // &metaOnly=1: only the counts (the Dictionary's "N texts · M matches" line), a few hundred
            // bytes instead of 1.35 MB of skeleton it never reads.
            const metaOnly = req.query.metaOnly === '1';
            const fastParams = metaOnly ? { ...jobParams, metaOnly } : jobParams;
            const routed = isRegex ? await regexSearch('fast', keyword, fastParams) : await searchJob('fast', keyword, fastParams, true);
            if (routed && routed.status) return res.code(routed.status).send({ error: routed.error });
            if (routed && routed.json) return sendJsonText(res, routed.json);
            const result = routed ? routed.result : await buildFastResponse(keyword, scope, exact, targetLangs, lb, la);
            if (metaOnly) return res.send({ metadata: result.metadata });
            return res.send(withSuggestions(result, keyword));
        }
        const routed = isRegex ? await regexSearch('full', keyword, jobParams) : await searchJob('full', keyword, jobParams, !resolveScriptKey(req.query.script));
        if (routed && routed.status) return res.code(routed.status).send({ error: routed.error });
        if (routed && routed.json) return sendJsonText(res, routed.json);
        const result = routed ? routed.result : await buildSearchResponse(keyword, scope, exact, targetLangs, lb, la);
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
    const lb         = Math.min(Math.max(parseInt(req.query.lb) || 0, 0), 10); // context lines; unbounded = a memory DoS
    const la         = Math.min(Math.max(parseInt(req.query.la) || 0, 0), 10);
    const requestedIds = idsParam.split(',').map(s => s.trim()).filter(Boolean);

    if (keyword.length < MIN_KEYWORD_LENGTH) {
        return res.send({ data: {}, variantSegments: [] });
    }

    // Regex patterns go through the worker here too, with their own softer per-IP budget
    // (rateLimit.enrichMax): the client calls this once per result page, but nothing stops a
    // direct caller from looping it, and it takes the same single worker slot.
    const isRegex = searchCore.isRegexKeyword(keyword);
    if (isRegex) {
        const problem = searchCore.regexProblem(keyword);
        if (problem) return res.code(400).send({ error: problem });
        if (regexRateLimited(req.ip, true)) return res.code(429).send({ error: 'Too many regex searches from this address — try again shortly.' });
    }

    try {
        const jobParams = { scope, exact, langs: targetLangs, lb, la, ids: requestedIds };
        const routed = isRegex ? await regexSearch('enrich', keyword, jobParams) : await searchJob('enrich', keyword, jobParams, !resolveScriptKey(req.query.script));
        if (routed && routed.status) return res.code(routed.status).send({ error: routed.error });
        if (routed && routed.json) return sendJsonText(res, routed.json);
        const enrichResult = routed ? routed.result : await searchCore.enrichResponse(keyword, scope, exact, targetLangs, lb, la, requestedIds);
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
    return sendSiteHtml(req, res, 'toc', req.params.code);
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
const findRangeContaining = searchCore.findRangeContaining; // core/search-core.js: the offline worker answers the same

app.get('/:slug/:word', (req, res) => {
    const { slug, word } = req.params;
    // "/dn22/", "/dn22:2.2/?s=kacchapa", "/kacchapa/": a trailing slash, not a word. Drop it and keep the
    // query as it is (an empty word used to overwrite ?s= and a keyword got 404). A folder name stays
    // with the folder's own handling.
    if (!word) {
        if (mountedPrefixes.has(slug) || siteRootEntries.has(slug) || slug === 'settings') return res.callNotFound();
        return res.redirect('/' + slug.split(':').map(encodeURIComponent).join(':') + queryString(req), 301);
    }
    const base = slug.split(':')[0].toLowerCase();
    if (!skeletonDB[base] && !findRangeContaining(base)) return res.callNotFound();
    const params = new URLSearchParams(queryString(req).slice(1));
    params.set('s', word);
    return res.redirect('/' + slug.split(':').map(encodeURIComponent).join(':') + '?' + params.toString(), 301);
});

// SEO: a text page used to be served as the bare SPA shell — <title>Dhamma.gift</title>, no text — so
// Google took every sutta for one more copy of the home page ("Duplicate, Google chose /", GSC 2026-10).
// The served HTML now carries THIS text's title, description, canonical, hreflang and breadcrumbs, in
// the page's own language (owner: an English page is Pali + English, a Russian one Pali + Russian).
// Only the response changes: search/index.html, which the apps build from, is untouched.
const SITE = 'https://dhamma.gift';
const RU_CODES = { dn: 'ДН', mn: 'МН', sn: 'СН', an: 'АН' };
const htmlAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// "mn10" -> "MN 10", "sn56.11" -> "СН 56.11" on a Russian page, "dhp1-20" -> "Dhp 1-20"; Vinaya ids have no short code
function textCode(id, lang) {
    const m = /^([a-z]+)(\d.*)$/.exec(id);
    if (!m) return '';
    const p = m[1];
    return ((lang === 'ru' && RU_CODES[p]) || (p.length <= 2 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1))) + ' ' + m[2];
}
// Pali (ISO) -> the Russian Buddhist spelling Russian readers search with ("бахия сутта", "метта сутта" in GSC).
// Never shown as the title (owner: Pali is not written in Cyrillic) — only description, keywords, JSON-LD alternateName.
const PALI_CYR = [['kh', 'кх'], ['gh', 'гх'], ['ch', 'чх'], ['jh', 'джх'], ['ṭh', 'тх'], ['ḍh', 'дх'], ['th', 'тх'], ['dh', 'дх'],
    ['ph', 'пх'], ['bh', 'бх'], ['ya', 'я'], ['yā', 'я'], ['yu', 'ю'], ['yū', 'ю'], ['ye', 'е'], ['ñ', 'нь'], ['a', 'а'], ['ā', 'а'],
    ['i', 'и'], ['ī', 'и'], ['u', 'у'], ['ū', 'у'], ['e', 'е'], ['o', 'о'], ['k', 'к'], ['g', 'г'], ['ṅ', 'н'], ['c', 'ч'], ['j', 'дж'],
    ['ṭ', 'т'], ['ḍ', 'д'], ['ṇ', 'н'], ['t', 'т'], ['d', 'д'], ['n', 'н'], ['p', 'п'], ['b', 'б'], ['m', 'м'], ['ṁ', 'м'], ['ṃ', 'м'],
    ['y', 'й'], ['r', 'р'], ['l', 'л'], ['ḷ', 'л'], ['v', 'в'], ['s', 'с'], ['h', 'х']];
function paliToCyrillic(word) {
    let out = '', w = word.toLowerCase();
    for (let i = 0; i < w.length;) {
        const hit = PALI_CYR.find(([lat]) => w.startsWith(lat, i));
        if (!hit) { out += w[i++]; continue; }
        // "e" opening a word or after a vowel is "э" (Ekāyano -> Экаяно)
        out += hit[0] === 'e' && (i === 0 || /[aāiīuūeo]/.test(w[i - 1])) ? 'э' : hit[1];
        i += hit[0].length;
    }
    return out;
}
const paliCyr = name => { const c = name.split(' ').map(paliToCyrillic).join(' '); return c.charAt(0).toUpperCase() + c.slice(1); };
const paliAscii = name => name.normalize('NFD').replace(/[̀-ͯ]/g, '');
const cleanTitle = s => (s || '').replace(/^\s*[\dIVXLC]+\.\s*/, '').replace(/[\s.]+$/, '').trim();
const textHeadCache = new Map(); // `${id}|${lang}` -> head data
async function textHead(dataId, urlId, reqLang) {
    const roster = searchDb.prepare(
        "SELECT DISTINCT lang FROM texts WHERE sutta_id = ? AND kind = 'translation' AND translator <> 'ai'"
    ).all(dataId).map(r => r.lang);
    const lang = reqLang && reqLang !== 'en' && roster.includes(reqLang) ? reqLang : 'en';
    const key = urlId + '|' + lang;
    if (textHeadCache.has(key)) return textHeadCache.get(key);
    const base = await getSuttaBaseData(dataId);
    if (!base) return null;
    const { segments } = await buildTextDataFromBase(base, dataId, [lang], null);
    const tr = seg => Object.values(seg.translations || {})[0] || '';
    const headerEnd = segments.findIndex(s => /<\/header>/.test(s.html || ''));
    const header = segments.slice(0, headerEnd + 1);
    const titleSeg = header.find(s => /<h1/.test(s.html || '')) || header[header.length - 1] || segments[0];
    // the Pali name exactly as the text writes it (owner: Pali is never rewritten for convenience);
    // the split "Satipaṭṭhāna Sutta" people type goes only to keywords and alternateName
    // untitled ranges carry "~" for a name (an11.992-1151): the code stands in for it
    const pali = cleanTitle(titleSeg && titleSeg.root_text).replace(/^[~\s]+$/, '');
    const split = pali.replace(/(.)(sutta|vagga)$/i, '$1 $2');
    const local = cleanTitle(titleSeg && tr(titleSeg));
    const code = textCode(urlId, lang);
    // Owner 2026-10-18, an experiment: the title splits "-sutta" off the name ("Mahāsīhanāda Sutta") — named-sutta
    // queries are typed spaced ("kesi sutta", "assalayana sutta", GSC 90 days) and a fused compound is not reliably split.
    // Only the title; the name as the text writes it stays first in the description and in keywords.
    const titlePali = pali.replace(/^(.*[^\s-])(suttanta|suttaṁ|sutta)$/i, (m, stem, s) => stem + (/^suttanta$/i.test(s) ? ' Suttanta' : ' Sutta'));
    const name = pali ? titlePali + (code ? ` (${code})` : '') : code;
    const title = [name, local && local.toLowerCase() !== pali.toLowerCase() ? local : ''].filter(Boolean).join(' — ') + ' | Dhamma.Gift';
    let description = '';
    // the translation's own words; Pali only when this text has no translation in this language
    const body = segments.slice(headerEnd + 1);
    const hasTr = body.some(s => tr(s));
    for (const s of body) {
        description += (hasTr ? tr(s) : s.root_text || '') + ' ';
        if (description.length > 200) break;
    }
    description = description.replace(/\s+/g, ' ').trim();
    // Russian readers search the name in Cyrillic: it opens the Russian description
    const cyr = pali ? paliCyr(split) : '';
    if (lang === 'ru' && cyr) description = cyr + (code ? ', ' + code : '') + '. ' + description;
    else if (titlePali !== pali) description = pali + (code ? ', ' + code : '') + '. ' + description;
    // a text with its audio says so at the end of the description, which keeps its 160 characters
    const audio = SUTTA_AUDIO.get(dataId) || [];
    const AUDIO_LANG = { en: { pli: 'Pali', ru: 'Russian', en: 'English' }, ru: { pli: 'пали', ru: 'русский', en: 'английский' } };
    const audioNames = audio.map(a => (AUDIO_LANG[lang] || AUDIO_LANG.en)[a.lang]).filter(Boolean);
    const audioNote = !audioNames.length ? '' : lang === 'ru' ? ` Аудио: ${audioNames.join(', ')}.` : ` Audio: ${audioNames.join(', ')}.`;
    // two or more translations in this language: the description says they can be compared side by side (owner 2026-10-20:
    // «кто-то ищет MN 10 — видит „Сравнить переводы MN 10“»), no pages of their own - the reader's multi mode is the comparison
    // the name alone ("SV", "Сыркин", "Thanissaro"): the byline's source, editor and title don't fit 160 characters; o first
    const shortName = t => String((SITE_TRANSLATORS[lang] || {})[t] || t).replace(/<[^>]+>/g, '')
        .replace(/,? ред\..*$| с (Пали|Англ).*$| theravada\.(ru|su)\b|,? в процессе$| \(.*\)$/gi, '').replace(/\b(Bhikkhu|Thera)\b/g, '').trim();
    const trNames = [...new Set(searchDb.prepare("SELECT DISTINCT translator FROM texts WHERE sutta_id = ? AND kind = 'translation' AND lang = ? AND translator NOT IN ('ai', 'gemini')")
        .all(dataId, lang).map(r => r.translator).sort((a, b) => (b === 'o') - (a === 'o')).map(shortName).filter(Boolean))];
    const compareNote = trNames.length < 2 ? '' : lang === 'ru' ? ` Сравнить переводы: ${trNames.join(', ')}.` : ` Compare translations: ${trNames.join(', ')}.`;
    const room = 160 - audioNote.length - compareNote.length;
    if (description.length > room) description = description.slice(0, description.lastIndexOf(' ', room - 3)) + '…';
    description += compareNote + audioNote;
    // Cyrillic only for the Russian page: nobody reading the English one types it
    const names = [...new Set([split, paliAscii(split), paliAscii(pali), lang === 'ru' ? cyr : ''])].filter(n => n && n !== pali);
    const url = id => SITE + '/' + encodeURIComponent(urlId) + (id === 'en' ? '' : '?lang=' + id);
    const collection = cleanTitle((header[0] && (tr(header[0]) || header[0].root_text) || '').replace(/[\d.\s–-]+$/, ''));
    const prefix = (/^([a-z]+)\d/.exec(urlId) || [])[1];
    const crumbs = [{ name: 'Dhamma.Gift', item: SITE + '/' }];
    if (prefix && TOC_CODES.has(prefix) && collection) crumbs.push({ name: collection, item: SITE + '/toc/' + prefix });
    crumbs.push({ name: code || pali || local, item: url(lang) });
    const head = {
        lang, title, description, canonical: url(lang),
        // Chinese, Sanskrit, Gāndhārī parallels (lzh/, san/, pra/) open by id but are not what the site offers
        // (owner: in no sitemap or the like) — readable, not indexed
        noindex: !/^pli\//.test((skeletonDB[dataId] || {}).dir_path || ''),
        keywords: [pali, ...names, code, local].filter(Boolean).join(', '),
        work: { '@context': 'https://schema.org', '@type': 'CreativeWork', name: pali || code || local, alternateName: [...names, local].filter(Boolean),
            inLanguage: lang, url: url(lang), isPartOf: collection ? { '@type': 'CreativeWorkSeries', name: collection } : undefined,
            audio: audio.length ? audio.map(a => ({ '@type': 'AudioObject', name: `${name} — ${AUDIO_LANG.en[a.lang]}`, inLanguage: a.lang === 'pli' ? 'pi' : a.lang,
                contentUrl: AUDIO_BASE + a.file, encodingFormat: 'audio/mpeg', duration: a.duration ? `PT${Math.floor(a.duration / 60)}M${a.duration % 60}S` : undefined })) : undefined },
        alternates: [...new Set(['en', ...roster])].filter(l => l === 'en' || roster.includes(l)).map(l => [l, url(l)]),
        breadcrumbs: { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
            itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, ...c })) },
    };
    if (textHeadCache.size > 20000) textHeadCache.clear(); // ponytail: wholesale clear, an LRU if hit rate ever matters
    textHeadCache.set(key, head);
    return head;
}
// Speed + crawlers: the text itself in the served HTML, so the page shows the sutta before any script runs
// (mobile LCP was 10-11 s: HTML -> scripts -> /api/text -> render) and engines that do not run JS see it.
// It is megareader.js buildSutta()'s own markup for the default view, ported line for line (gathas merged,
// copy links with the segment URL, warning, byline): the reader compares its render with this one and keeps
// the server's nodes when they match (no second paint - the LCP stays the first one), else it swaps them in
// as before. Any drift between the two only costs the speed-up, never the display.
const SITE_TRANSLATORS = (() => {
    try { return JSON.parse(fsSync.readFileSync(path.join(__dirname, 'configs', 'reader', 'translators.json') /* what /assets/js/translators.json serves the reader */, 'utf8')); }
    catch { return {}; }
})();
const READER_WARNING = {};
for (const l of ['ru', 'en']) {
    try { READER_WARNING[l] = JSON.parse(fsSync.readFileSync(path.join(__dirname, 'configs', 'reader', `lang_${l}.json`), 'utf8')).reader.warningNote; }
    catch { READER_WARNING[l] = ''; }
}
// megareader.js window.mergeGathas: a verse line and the next one (not opening a new <p>) become one segment
function mergeGathasServer(htmlData, dataObjects) {
    const keys = Object.keys(htmlData), out = [];
    const toLower = (str) => !str ? '' : /^["“'‘]?(I\b|I'|O\b|О\b)/.test(str) ? str : str.charAt(0).toLowerCase() + str.slice(1);
    for (let i = 0; i < keys.length; i++) {
        const seg = keys[i], next = keys[i + 1];
        dataObjects.forEach(o => { if (o[seg] === undefined) o[seg] = ''; });
        if (htmlData[seg] && htmlData[seg].includes('verse-line') && next && htmlData[next] && htmlData[next].includes('verse-line')) {
            const [nextOpen, nextClose] = htmlData[next].split(/{}/);
            if (!nextOpen.includes('<p>')) {
                dataObjects.forEach(o => { if (o[next]) o[seg] = (o[seg] || '').trim() + ' ' + toLower(o[next].trim()); });
                htmlData[seg] = (htmlData[seg].split(/{}/)[0] || '') + '{}' + (nextClose || '');
                out.push(seg); i++; continue;
            }
        }
        out.push(seg);
    }
    return out;
}
const TRANSLATOR_PRIORITY = (() => {
    try { return JSON.parse(fsSync.readFileSync(path.join(__dirname, 'configs', 'reader', 'translator-priority.json'), 'utf8')); }
    catch { return {}; }
})();
const textBodyCache = new Map();
function textBodyHtml(segments, lang, urlId, pageUrl, dataId) {
    const key = urlId + '|' + lang + '|' + pageUrl.href;
    if (textBodyCache.has(key)) return textBodyCache.get(key);
    const trKey = (segments.find(s => Object.keys(s.translations || {}).length) || { translations: {} });
    const translatorKey = Object.keys(trKey.translations)[0] || '';
    const translatorId = translatorKey.slice(lang.length + 1);
    const name = (SITE_TRANSLATORS[lang] && SITE_TRANSLATORS[lang][translatorId])
        || (translatorId.charAt(0).toUpperCase() + translatorId.slice(1));
    const label = lang === 'ru' ? 'Пер. ' : lang === 'en' ? 'Trn: ' : `${lang}: `;
    // megareader.js readerShareUrl: a translator that is not the client-known default is named in the link
    const pool = searchDb.prepare("SELECT DISTINCT lang, translator FROM texts WHERE sutta_id = ? AND kind = 'translation' AND translator <> 'ai'")
        .all(dataId).map(r => `${r.lang}_${r.translator}`).filter(k => k.startsWith(lang + '_'));
    let def = (TRANSLATOR_PRIORITY[lang] || []).find(k => pool.includes(k));
    if (!def && lang === 'en') def = pool.find(k => k !== 'en_sujato');
    if (!def && pool.length === 1) def = pool[0];
    // copyToClipboard.js dgSegmentUrl: /mn10:1.2 with the page's query, no hash
    const segUrl = (seg) => {
        const u = new URL(pageUrl.href);
        u.hash = '';
        if (translatorKey && translatorKey !== def) { u.searchParams.set('translators', translatorKey); u.href = u.href.replace(/%2C/gi, ','); }
        if (!seg) return u.href;
        const p = u.pathname.replace(/\/+$/, ''), cut = p.lastIndexOf('/') + 1;
        u.pathname = p.slice(0, cut) + p.slice(cut).split(':')[0] + ':' + String(seg).toLowerCase();
        return u.href;
    };
    const htmlData = {}, pali = {}, variant = {}, trans = {};
    for (const seg of segments) {
        htmlData[seg.segment] = seg.html || '{}';
        pali[seg.segment] = seg.root_text || undefined;
        variant[seg.segment] = seg.variant || undefined;
        trans[seg.segment] = (translatorKey && seg.translations && seg.translations[translatorKey]) || undefined;
    }
    const order = mergeGathasServer(htmlData, translatorKey ? [pali, variant, trans] : [pali, variant]);
    const isRange = /\d-\d/.test(urlId);
    let html = '';
    for (const seg of order) {
        const [open = '', close = ''] = htmlData[seg].split(/{}/);
        const anchor = isRange ? seg : seg.slice(seg.indexOf(':') + 1);
        const url = segUrl(anchor).replace(/'/g, '%27');
        const start = `<a class="text-decoration-none copyLink copyLink-start" role="none" onclick="copyToClipboard('${url}')"></a>`;
        const end = `<a class="text-decoration-none copyLink" role="none" onclick="copyToClipboard('${url}')"></a>`;
        if (pali[seg] === undefined && trans[seg] === undefined) continue;
        let inner = '';
        if (pali[seg] !== undefined) {
            inner += `<span class="pli-lang inputscript-ISOPali quote" lang="pi">${start}${pali[seg].trim()}${end}`;
            if (variant[seg] !== undefined && variant[seg] !== '') inner += `<font class="variant"><br>${start}${variant[seg].trim()}${end}</font>`;
            inner += '</span>';
        }
        if (translatorKey && trans[seg] !== undefined) inner += `<span class="right-column"><span class="${lang}-lang quote" lang="${lang}" data-translator="${translatorId}">${start}${trans[seg].trim()}${end}</span></span>`;
        html += `${open}<span id="${anchor}">${inner}</span>${close}\n\n`;
    }
    const byline = `<div id="trn" class="byline">\n    <p><span class="pli-lang" lang="pi">Pāḷi <a class="text-decoration-none text-reset" href="/assets/common/abbr.html?s=ms" title="Mahāsaṅgīti Pāḷi">MS</a></span>\n    <span class="right-column">${translatorKey ? `<span class="${lang}-lang" lang="${lang}"> ${label}${name}</span>` : ''}</span></p></div>`;
    const page = segUrl('').replace(/'/g, '%27');
    const warning = (READER_WARNING[lang === 'ru' ? 'ru' : 'en'] || '').replace('{dUrl}', () => page.replace('/r/', '/d/')).replace('{thUrl}', () => page.replace('/r/', '/th/read/'));
    // the pinned rows' offsets before the text paints, again in the frame itself once styles settle (search/index.html
    // applyPadding; skipped by the reader's compare)
    const out = '<div id="top-links-container" class="min-h-24"></div><script>window.dgObserveTopLinks&&dgObserveTopLinks();window.dgObserveStack&&dgObserveStack();requestAnimationFrame(function(){window.dgApplyHeaderPadding&&dgApplyHeaderPadding()})</script>' +
        (warning ? `<div class="warning-container warning-box"><p class='warning'>${warning} </p></div>` : '') +
        byline + html + audioLineHtml(dataId, lang) + '<div id="bottom-links-container" class="min-h-24"></div>';
    if (textBodyCache.size > 300) textBodyCache.clear(); // ponytail: wholesale clear; bodies are big, keep the hot few
    textBodyCache.set(key, out);
    return out;
}
// { en: "e.g. Kāyagat or sn56.11", ru: ..., th: ... } from configs/search/lang_*.json, as inline JS (withTextHead)
const SEARCH_PLACEHOLDERS = JSON.stringify(Object.fromEntries(fsSync.readdirSync(path.join(__dirname, 'configs', 'search'))
    .map(f => /^lang_(\w+)\.json$/.exec(f)).filter(Boolean).map(m => {
        try { return [m[1], JSON.parse(fsSync.readFileSync(path.join(__dirname, 'configs', 'search', m[0]), 'utf8')).search.placeholder]; }
        catch { return [m[1], null]; }
    }).filter(e => e[1]))).replace(/</g, '\\u003c');
function withTextHead(html, h) {
    const t = htmlAttr(h.title), d = htmlAttr(h.description), u = htmlAttr(h.canonical);
    const ld = [h.breadcrumbs, h.work].filter(Boolean);
    const links = (h.noindex ? `<meta name="robots" content="${h.noindex === true ? 'noindex' : h.noindex}">\n` : '') +
        `<link rel="canonical" href="${u}">\n` +
        h.alternates.map(([l, href]) => `<link rel="alternate" hreflang="${l}" href="${htmlAttr(href)}">`).join('\n') +
        `\n<link rel="alternate" hreflang="x-default" href="${htmlAttr(h.alternates[0][1])}">\n` +
        (h.keywords ? `<meta name="keywords" content="${htmlAttr(h.keywords)}">\n` : '') +
        (ld.length ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n` : '');
    let out = html
        .replace('<html ', `<html lang="${h.lang}" `)
        .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
        .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${d}">`);
    // the home page keeps the owner's own preview card ("Dhamma.Gift — Find the Truth")
    if (!h.keepOg) out = out
        .replace(/(<meta (?:property|name)="(?:og|twitter):title" content=")[^"]*"/g, `$1${t}"`)
        .replace(/(<meta (?:property|name)="(?:og|twitter):description" content=")[^"]*"/g, `$1${d}"`)
        .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${u}"`);
    if (h.body) {
        // the reader's stylesheets up front (search/index.html adds them only when the reader script loads)
        const css = ['index.css', 'rus-multi.css', 'uiextra.css'].map(f => {
            const v = getAssetVersion(path.join(__dirname, 'reader', 'css', f));
            return `<link rel="stylesheet" class="dg-reader-css" href="/reader/css/${f}${v ? '?v=' + v : ''}">`;
        }).join('\n');
        out = out
            .replace('<body>', '<body class="dg-state-reader">')
            .replace('<div id="reader-pane" class="mt-4">', '<div id="reader-pane" class="mt-4" data-ssr>') // home.css: no cold-load prev/next reservation
            .replace('<div id="sutta" class="sutta"></div>', () => `<div id="sutta" class="sutta" data-ssr="1">${h.body}</div>`);
        return withCritical(out.replace('</head>', links + css + '\n</head>'), 'reader');
    }
    // contents / search results: the search box's hint text is the largest thing on the first screen (PageSpeed
    // LCP: the input's placeholder), and dhamma-i18n.js fills it in only after its JSON. Set the same text inline,
    // in the language dhamma-i18n.js will pick. Home keeps its own random hint (randPlaceholderOnMain).
    if (h.critical !== 'home') out = out.replace(/(<input [^>]*id="paliauto"[^>]*>)/, (m) => m + `<script>(function(){var P=${SEARCH_PLACEHOLDERS},` +
        `l=window.DHAMMA_LANG||new URLSearchParams(location.search).get('lang')||(/^\\/(ru|r|ml|mt)(\\/|$)/.test(location.pathname)?'ru':null);` +
        `try{l=l||localStorage.getItem('dhammaLanguage')}catch(e){}document.getElementById('paliauto').placeholder=P[l]||P.en})()</script>`);
    out = withCritical(out.replace('</head>', links + '</head>'), h.critical);
    return h.critical === 'home' ? withHomeTiles(out, h.lang) : out;
}
// Critical CSS per screen (scripts/critical-css.js, configs/critical/<state>.css: the server-rendered reader, and
// home / search results / contents): inlined, and the stylesheets it was cut from then load without blocking. Only
// while this page links exactly those stylesheets (their ?v= hashes, listed on the file's first line): an edited
// stylesheet changes its ?v=, and the page keeps the plain blocking links instead of a stale cut. Read at start;
// regenerate with `npm run critical -- --state <state>`.
const CRITICAL = Object.fromEntries(['reader', 'home', 'results', 'toc'].map(state => {
    try {
        const t = fsSync.readFileSync(path.join(__dirname, 'configs', 'critical', state + '.css'), 'utf8');
        const m = new RegExp(`^/\\* dg-critical ${state} sources: (\\[.*?\\]) \\*/\\n`).exec(t);
        return [state, m ? { css: t.slice(m[0].length).replace(/<\/style/gi, '<\\/style'), sources: JSON.parse(m[1]).sort().join(' '), stale: false } : null];
    } catch { return [state, null]; }
}));
function withCritical(html, state) {
    const crit = CRITICAL[state];
    if (!crit) return html;
    const end = html.indexOf('</head>');
    let head = html.slice(0, end);
    const hrefs = [...head.matchAll(/<link rel="stylesheet"[^>]*?href="([^"]+)"/g)].map(m => m[1]).sort().join(' ');
    if (hrefs !== crit.sources) {
        if (!crit.stale) console.warn(`critical CSS (${state}) is stale: the page links ${hrefs}, the file was cut from ${crit.sources} - blocking stylesheets until "npm run critical -- --state ${state}"`);
        crit.stale = true;
        return html;
    }
    let first = true;
    head = head.replace(/<link rel="stylesheet"([^>]*?)>/g, (tag, attrs) => {
        const style = first ? `<style id="dg-critical">${crit.css}</style>\n` : '';
        first = false;
        // the full stylesheets: the reader's text resizes once they apply, so they come at high priority (preload);
        // home/results/contents are complete with the cut, so theirs load at low priority (media=print swap) and
        // stay out of the first paint's competition for bandwidth (PSI home 86 -> 100, the reader 99 -> 86 the other way)
        return state === 'reader'
            ? `${style}<link rel="preload" as="style"${attrs} onload="this.onload=null;this.rel='stylesheet'"><noscript>${tag}</noscript>`
            : `${style}<link rel="stylesheet"${attrs} media="print" onload="this.onload=null;this.media='all'"><noscript>${tag}</noscript>`;
    });
    return head + html.slice(end);
}
// Home: the tile grid comes with the HTML (configs/critical/home-tiles.<lang>.html, scripts/home-tiles-snapshot.js)
// - it is the page's largest element, and home.js draws it only after home-bundle.js and menu-links.json (PageSpeed
// LCP 5.6 s). home.js re-renders the same grid over it. A visitor whose grid is not the default one (own order,
// hidden or own tiles, edited labels, descriptions off) or another language clears it before the first paint and
// gets today's page. Used only while its source files are the ones it was cut from.
const HOME_TILES = (() => {
    let hash = null;
    try { hash = require('./scripts/home-tiles-snapshot.js').sourcesHash(); } catch { return {}; }
    return Object.fromEntries(['en', 'ru'].map(lang => {
        try {
            const t = fsSync.readFileSync(path.join(__dirname, 'configs', 'critical', `home-tiles.${lang}.html`), 'utf8');
            const m = /^<!-- dg-home-tiles \w+ sources: (.*?) -->\n/.exec(t);
            if (!m || m[1] !== hash) { console.warn(`home tiles snapshot (${lang}) is stale - not used until "npm run home-tiles"`); return [lang, null]; }
            return [lang, t.slice(m[0].length).trim()];
        } catch { return [lang, null]; }
    }));
})();
function withHomeTiles(html, lang) {
    const grid = HOME_TILES[lang];
    if (!grid) return html;
    const guard = `<script>(function(){try{var s=localStorage,q=/[?&]lang=([a-z]+)/.exec(location.search),` +
        `l=q?q[1]:(s.getItem('dhammaLanguage')||s.getItem('siteLanguage')||'en');` +
        `if(l!==${JSON.stringify(lang)}||s.getItem('dgTileOrder')||s.getItem('dgTilesHidden')||s.getItem('dgCustomTiles')||` +
        `s.getItem('dgTileOverrides')||s.getItem('dgTileDesc')==='off')document.getElementById('home-tiles').innerHTML=''}` +
        `catch(e){document.getElementById('home-tiles').innerHTML=''}})()</script>`;
    return html.replace('<div class="dg-tiles" id="home-tiles"></div>', () => `<div class="dg-tiles" id="home-tiles" data-ssr="1">${grid}</div>${guard}`);
}
// Home, search results and contents: the template's own head said "Search Results - Dhamma.gift" on all of them
// "mn" -> { ru: "Маджхима Никая", en: "Majjhima Nikāya" }: the labels the contents page itself shows (/api/toc —
// toc-books.json plus the Abhidhamma books' own Pali names), built on first use
let BOOK_LABELS = null;
// a contents page worth indexing: its book has Pali texts. The TOC also lists Sarvāstivāda books the corpus
// does not carry (dk, dy, jp, mvs, pk, pr, sab, vk — empty) and the Chinese Saṅgītiparyāya (sg, lzh/) (f3-ultra)
const tocPaliCache = new Map();
function tocHasPali(code) {
    if (!code) return true;
    if (!tocPaliCache.has(code)) {
        const next = new RegExp('^' + code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|[\\d.-])');
        tocPaliCache.set(code, Object.entries(skeletonDB).some(([id, t]) => /^pli\//.test(t.dir_path || '')
            && (next.test(id) || (t.dir_path || '').split('/').includes(code))));
    }
    return tocPaliCache.get(code);
}
function bookLabel(code, lang) {
    if (!BOOK_LABELS) {
        BOOK_LABELS = {};
        const walk = n => {
            if (Array.isArray(n)) return n.forEach(walk);
            if (!n || typeof n !== 'object') return;
            if (n.code && n.label) BOOK_LABELS[n.code] = n.label;
            Object.values(n).forEach(walk);
        };
        for (const [key, cat] of Object.entries(TOC_BOOKS)) {
            if (key === '_comment') continue;
            walk((cat.books || []).map(b => describeBook(b, 'default')).concat((cat.extraBooks || []).map(b => describeBook(b, 'extra'))));
            walk((cat.groups || []).map(describeGroup));
        }
    }
    return BOOK_LABELS[code] && BOOK_LABELS[code][lang];
}
// Search results pages search engines may index: the key terms (configs/seo/search-terms.json, owner 2026-10-19 - the
// search is the site's strength, the key terms' results belong in Google). Keyed by the query as the path carries it;
// every other query stays noindex. count: texts found in the default scope, filled after start for the title.
const SEO_TERMS = new Map((() => {
    try { return JSON.parse(fsSync.readFileSync(path.join(__dirname, 'configs', 'seo', 'search-terms.json'), 'utf8')).terms; }
    catch (e) { console.warn('configs/seo/search-terms.json:', e.message); return []; }
})().filter(t => t.index !== false).map(t => [t.q.normalize('NFC').toLowerCase(), t]));
const seoTerm = q => SEO_TERMS.get(String(q).normalize('NFC').toLowerCase());
async function countSeoTerms() {
    for (const t of SEO_TERMS.values()) {
        try {
            const r = await searchJob('fast', t.q, { scope: 'default', exact: false, langs: ['ru', 'en'], lb: 0, la: 0, metaOnly: true }, false);
            if (r && r.result && r.result.metadata) t.count = r.result.metadata.totalFiles;
        } catch (e) { /* the title goes without the number */ }
    }
}
const ruSuttas = n => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'сутта' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'сутты' : 'сутт');
// The Pali term, the owner's rendering when the glossary has one (ru, en), and the number of suttas found
const SEO_TERM_TEXT = {
    en: t => [`${t.pali}${t.en ? ` (${t.en})` : ''}${t.count ? ` — ${t.count} suttas` : ''} in the Pali Canon | Dhamma.Gift`,
        `Where the suttas speak of ${t.pali}${t.en ? ` (${t.en})` : ''}: ${t.count ? t.count + ' texts' : 'the texts'} of the four Nikāyas and the Khuddaka, each passage in Pali with translations side by side.`],
    ru: t => [`${t.pali}${t.ru ? ` (${t.ru})` : ''}${t.count ? ` — ${ruSuttas(t.count)}` : ''} Палийского канона | Dhamma.Gift`,
        `${t.pali}${t.ru ? ` (${t.ru})` : ''} в суттах: ${t.count ? ruSuttas(t.count) : 'сутты'} четырёх никай и Кхуддаки, каждое место на пали с переводами рядом.`],
};
const SITE_HEAD_TEXT = {
    en: {
        home: () => ['Dhamma.Gift — Pali Canon: search, read, listen',
            'Search the Pali Canon — Sutta and Vinaya — in Pali and 25 languages: suttas with translations side by side, compare translators, listen, memorize.'],
        search: q => [`${q} — search in the Pali Canon | Dhamma.Gift`, `Suttas of the Pali Canon with “${q}”: the Pali text and translations, each match in its context.`],
        toc: n => [`${n} — contents | Dhamma.Gift`, `${n}: every text in Pali with translations. Dhamma.Gift — search, reader, voice, memorization.`],
    },
    ru: {
        home: () => ['Dhamma.Gift — Палийский канон: поиск, чтение, озвучка',
            'Поиск по Палийскому канону — Сутта и Виная — на пали и 25 языках: сутты с переводами рядом, сравнение переводчиков, озвучка, заучивание.'],
        search: q => [`${q} — поиск по Палийскому канону | Dhamma.Gift`, `Сутты Палийского канона, где есть «${q}»: пали и переводы, каждое вхождение в контексте.`],
        toc: n => [`${n} — содержание | Dhamma.Gift`, `${n}: все тексты на пали с переводами. Dhamma.Gift — поиск, ридер, озвучка, заучивание.`],
    },
};
function siteHead(kind, arg, reqLang) {
    const lang = reqLang === 'ru' ? 'ru' : 'en';
    const term = kind === 'search' && seoTerm(arg);
    if (term) arg = term.q; // one canonical spelling of the path
    const pathOf = kind === 'home' ? '/' : kind === 'toc' ? '/toc' + (arg ? '/' + encodeURIComponent(arg) : '') : '/' + encodeURIComponent(arg);
    const url = l => SITE + pathOf + (l === 'ru' ? '?lang=ru' : '');
    let what = arg;
    if (kind === 'toc') what = !arg ? (lang === 'ru' ? 'Палийский канон' : 'Pali Canon')
        : bookLabel(arg, lang) || textCode(arg, lang) || arg.toUpperCase();
    if (kind === 'search') what = String(arg).slice(0, 80);
    const [title, description] = term ? SEO_TERM_TEXT[lang](term) : SITE_HEAD_TEXT[lang][kind](what);
    return {
        lang, title, description, canonical: url(lang), keepOg: kind === 'home', alternates: [['en', url('en')], ['ru', url('ru')]],
        // search results stay out of the index, their links are followed (GSC, 16 months: keyword-search pages had
        // 1% of impressions and no clicks; an unbounded space of thin pages, crawler junk included). The title and
        // description stay for a shared link's preview. The key terms' pages (SEO_TERMS) are the exception.
        noindex: (kind === 'search' && !term) || (kind === 'toc' && !tocHasPali(arg)) ? 'noindex, follow' : false,
        critical: kind === 'search' ? 'results' : kind, // configs/critical/<state>.css (withCritical)
    };
}
function sendSiteHtml(req, res, kind, arg) {
    return sendHeadHtml(req, res, siteHead(kind, arg, req.query.lang));
}
async function sendTextHtml(req, res, dataId, urlId) {
    let h = null;
    try { h = await textHead(dataId, urlId, req.query.lang); }
    catch (e) { console.warn(`textHead ${dataId}: ${e.message}`); }
    if (!h) return sendVersionedHtml(req, res, searchIndexPath);
    // the text in the HTML only for the default view: another mode/script/translator set would be swapped at once
    const q = req.query;
    if (q.mode || q.langs || q.translators || q.script || q.s) return sendHeadHtml(req, res, h);
    // links in the text name the site the reader is on (test or prod); any other host (a direct localhost call) the canonical one
    const pageUrl = new URL(req.url, /(^|\.)dhamma\.gift$/.test(req.hostname || '') ? 'https://' + req.hostname : SITE);
    // the reader's column is the asked language even where the text has no such translation (Pali only),
    // while the head falls back to English (h.lang)
    const bodyLang = /^[a-z]{2,3}$/.test(q.lang || '') ? q.lang : h.lang;
    let body = textBodyCache.get(urlId + '|' + bodyLang + '|' + pageUrl.href);
    if (!body) {
        try {
            const base = await getSuttaBaseData(dataId);
            body = base && textBodyHtml((await buildTextDataFromBase(base, dataId, [bodyLang], null)).segments, bodyLang, urlId, pageUrl, dataId);
        } catch (e) { console.warn(`textBody ${dataId}: ${e.message}`); }
    }
    return sendHeadHtml(req, res, body ? { ...h, body } : h);
}
function sendHeadHtml(req, res, h) {
    let entry = versionedHtmlCache.get(searchIndexPath);
    if (!entry || Date.now() - entry.at > VERSIONED_HTML_TTL) {
        entry = buildVersionedHtml(searchIndexPath);
        if (!entry) return res.code(404).send();
        versionedHtmlCache.set(searchIndexPath, entry);
    }
    const etag = '"' + crypto.createHash('md5').update(entry.etag + h.canonical + h.title + (h.body ? h.body.length : '')).digest('hex') + '"';
    res.header('cache-control', 'public, max-age=0, must-revalidate').header('etag', etag);
    if (req.headers['if-none-match'] === etag) return res.code(304).send();
    return res.type('text/html; charset=utf-8').send(withTextHead(entry.rewritten, h));
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
    // Vinaya short aliases ("bu-pc1", "bi-pc3") stay in the address bar, as they did on the old
    // site (owner, dg-node #34): the canonical id is four times longer, so everything that shows a
    // URL or derives a label from it — launcher shortcuts, shared links, tabs — truncated it to
    // "pli-tv-bi…". The client resolves the alias with this same classify(), so the reader opens
    // the same text either way; only the redirect is skipped.
    const isVinayaAlias = classified.type === 'text' && /^pli-tv-/.test(classified.id) && skeletonDB[classified.id];
    if (classified.type === 'text' && classified.id !== rawBase && !isVinayaAlias) {
        return res.redirect('/' + encodeURIComponent(classified.id) + anchorSuffix + queryString(req), 301);
    }
    if (isVinayaAlias && classified.id !== rawBase) {
        return sendTextHtml(req, res, classified.id, rawBase);
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
        return sendTextHtml(req, res, suttaId, suttaId);
    }
    // Якорем идёт сам запрошенный id: внутри диапазона сегменты пронумерованы по вложенной
    // сутте ("an1.9:1.1"), и megareader.js для диапазонов кладёт в id элемента ПОЛНЫЙ segment id,
    // так что "an1.9" — валидный префикс якоря (точное совпадение ищется первым, см. там же).
    const range = findRangeContaining(suttaId);
    if (range) {
        const query = queryString(req); // сохраняем ?s=, ?lang= и т.п.
        // the line anchor too: /an1.9:1.1 -> /an1.1-10:an1.9:1.1 (the reader reads range:id:segment)
        return res.redirect('/' + encodeURIComponent(range) + ':' + encodeURIComponent(suttaId) + anchorSuffix + query);
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
    if (rawSlug === 'toc') return sendSiteHtml(req, res, 'toc', '');
    return sendSiteHtml(req, res, 'search', rawSlug);
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
        // one leading slash: "/ru//evil.example" must not become a protocol-relative "//evil.example"
        const rest = '/' + pathPart.slice(3).replace(/^[\/\\]+/, '');
        const params = new URLSearchParams(queryPart || '');
        params.set('lang', 'ru');
        return res.redirect(rest + '?' + params.toString());
    }
    // Dictionary clean-path words (/dict/dukkha, /dict/ru/dukkha), same as dict.dhamma.gift/dukkha
    // behind Apache's .htaccess: no such file under siteroot/dict -> serve the dictionary page,
    // which reads the word from the path itself.
    const dictWord = req.url.split('?')[0].match(/^\/dict\/(ru\/)?[^/]+\/?$/);
    if (dictWord) {
        // "/dict/dukkha/" would resolve the page's relative static/ paths under /dict/dukkha/ (404s)
        const [dictPath, dictQuery] = req.url.split('?');
        if (dictPath.endsWith('/')) return res.redirect(dictPath.replace(/\/+$/, '') + (dictQuery ? '?' + dictQuery : ''), 301);
        // a key term has its head pre-rendered (ddg-ui build-pages.js: w/<word>.html), as .htaccess serves it there
        const dictDir = path.join(SITEROOT, 'dict', dictWord[1] ? 'ru' : '');
        let word = dictPath.slice(dictPath.lastIndexOf('/') + 1);
        try { word = decodeURIComponent(word); } catch { word = ''; }
        const pre = word && !/[\\/.]/.test(word) ? path.join(dictDir, 'w', word + '.html') : '';
        return sendFile(req, res, pre && fsSync.existsSync(pre) ? pre : path.join(dictDir, 'index.html'));
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

// Event loop delay probe: logs p50/p99/max (ms) once a minute, then resets the histogram.
// Set ELD_INTERVAL_MS=0 to disable.
const eldInterval = Number(process.env.ELD_INTERVAL_MS ?? 60000);
if (eldInterval > 0) {
    const ELD_RES = 10;
    const eld = require('perf_hooks').monitorEventLoopDelay({ resolution: ELD_RES });
    eld.enable();
    setInterval(() => {
        // Histogram values include the sampling timer's own period, subtract it to get pure lag.
        const ms = (ns) => Math.max(0, ns / 1e6 - ELD_RES).toFixed(1);
        console.log(`[eld] p50=${ms(eld.percentile(50))} p99=${ms(eld.percentile(99))} max=${ms(eld.max)} ms`);
        eld.reset();
    }, eldInterval).unref();
}

})(); // end of the async IIFE started above the compress/cors registration
