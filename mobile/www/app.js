// Offline data-shim for the mobile app. This file does NOT own any UI — mobile/www/index.html is
// a verbatim copy of the real production page (search/index.html); its own inline SPA engine
// (routeFromUrl/dgSetState/openReaderInPlace/initSearchApp/etc.) and the real, unmodified
// search-render.js/megareader.js/common.js drive everything the user sees. This file's only job
// is to intercept the handful of fetch() calls that need dynamic data and answer them from a
// local SQLite database instead of dg-light.js's grep API — see
// /root/.claude/plans/vast-questing-russell.md for the full "why" of this pivot.
//
// Pure JS/WASM (sql.js) in the WebView — no native plugin (sql.js has no FTS5 in its prebuilt
// binary, so the DBs built by build-offline-db.js are FTS4; see that file's header). Everything
// NOT intercepted here (static JSON/HTML, CSS, scripts) is served as a plain local file by
// whatever's hosting mobile/www/ — no shim code needed for those, see build-assets.js.
//
// DBs are downloaded at runtime (not bundled in the APK) so they stay updatable and support
// adding languages later without a new app release — cached in IndexedDB (see openStore below
// for why not Cache Storage), which persists across app restarts and works offline once
// downloaded.
//
// TOC (/api/toc, /api/toc/book/:code) is served from a build-time snapshot of the live server's
// JSON (see build-toc-snapshot.js), not reimplemented here — see that file's header for why.
//
// Deliberately NOT shimmed at all (confirmed with the project owner): /api/transliterate
// (Aksharamukha script conversion) — the affected UI option just won't work offline, doesn't
// block search/read/TOC. Fails soft (unhandled 404 response), doesn't break anything else.
// App Shortcuts (long-press launcher icon, Android/MainActivity.java + res/xml/shortcuts.xml)
// can't loadUrl() straight to a deep path — the static asset server behind this origin has no
// file at e.g. "/toc/pli-tv-bu-pm" (only index.html at root), same reason a raw reload of a
// pushState'd URL 404s. MainActivity instead loads "/?_nativeRoute=<path>" on the root, and this
// runs FIRST — before the page's own bootstrap script (search/index.html's inline $(document).
// ready handler) ever reads window.location — rewriting the visible URL to the real target via
// the same history.replaceState() trick the SPA already uses for its own pushState navigation.
// A plain browser load (no native shortcut involved) never has this param, so this is a no-op.
(function rewriteNativeShortcutRoute() {
    const params = new URLSearchParams(location.search);
    const route = params.get('_nativeRoute');
    if (route) history.replaceState(null, '', route);

    // "favorites" App Shortcut (res/xml/shortcuts.xml) — no dedicated route exists for
    // Favorites/History (they live inside the Quick Modal, not the SPA router), so this just
    // opens the modal once its lazy-load stub (settings-bundle.js) exists. No tab argument needed:
    // tab-fav (Favorites+History combined) is already the modal's default active tab.
    if (params.has('_openQuickModal')) {
        history.replaceState(null, '', route || location.pathname);
        window.addEventListener('load', () => {
            if (typeof window.toggleQuickModal === 'function') window.toggleQuickModal();
        });
    }
})();

const DIST_BASE = 'https://test.dhamma.gift/mobile-data';
const MIN_KEYWORD_LENGTH = 3; // mirrors dg-light.js's MIN_KEYWORD_LENGTH

let SQL;
let core, langDbs = {}; // { ru: Database, en: Database }
let ready; // Promise, resolves once core/langDbs are loaded — the fetch shim awaits this

// IndexedDB, not Cache Storage — Cache.put() on a cross-origin Response (DIST_BASE is never the
// WebView's own origin) hit QuotaExceededError in testing even well under the reported quota:
// Chromium pads cross-origin Cache Storage entries to block quota-based cross-origin size
// probing, and that padding is enough to blow the budget for a 60MB+ file. Storing the raw bytes
// ourselves in IndexedDB sidesteps that response-padding behavior.
function openStore() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('dg-offline-v1', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('dbs');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function idbGet(db, key) {
    return new Promise((resolve, reject) => {
        const req = db.transaction('dbs', 'readonly').objectStore('dbs').get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

function idbSet(db, key, value) {
    return new Promise((resolve, reject) => {
        const req = db.transaction('dbs', 'readwrite').objectStore('dbs').put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function fetchDbBytes(idb, name) {
    const cached = await idbGet(idb, name);
    if (cached) return new Uint8Array(cached);
    const response = await fetch(`${DIST_BASE}/${name}`);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    const buf = await response.arrayBuffer();
    await idbSet(idb, name, buf);
    return new Uint8Array(buf);
}

function rowsToObjects(result) {
    if (!result || !result.length) return [];
    const { columns, values } = result[0];
    return values.map(row => Object.fromEntries(row.map((v, i) => [columns[i], v])));
}

function suttaMeta(suttaId) {
    const rows = rowsToObjects(core.exec(
        'SELECT category, dir_path, title, mr FROM suttas WHERE id = ? LIMIT 1',
        [suttaId]
    ));
    return rows[0] || null;
}

function translationsForSegment(suttaId, segmentId) {
    const translations = {};
    for (const lang of Object.keys(langDbs)) {
        const rows = rowsToObjects(langDbs[lang].exec(
            'SELECT translator, text FROM translations WHERE sutta_id = ? AND segment_id = ? LIMIT 1',
            [suttaId, segmentId]
        ));
        if (rows[0]) translations[rows[0].translator] = rows[0].text;
    }
    return translations;
}

// Wraps a raw user search term as a quoted FTS4 phrase-prefix query — quoting protects against
// the term containing FTS operators (AND/OR/NOT/NEAR, -, parens) by forcing it to match
// literally, same intent as prod's grep -F (fixed-string) search; the trailing * makes the LAST
// token a prefix match instead of exact. Pali is agglutinative (kacchapa/kacchapena/kacchapassa/
// ...) — grep matches all of these as substrings, plain FTS exact-match finds only the bare form
// (16x fewer hits, verified against the real corpus). Prefix isn't full substring match (a
// mid-compound occurrence like "mahākacchapa" still won't match "kacchapa") — flagged gap, no
// full-text LIKE fallback for now, prefix covers the common case cheaply. Doubling embedded
// quotes is FTS4's own escape for a literal ".
function ftsQuery(term) {
    const escaped = term.replace(/"/g, '""').trim();
    return `"${escaped}*"`;
}

const CATEGORY_ORDER = { dhamma: 1, khudakka: 2, khuddaka: 2, vinaya: 3, abhi: 4, abhidhamma: 4 };
function sortSuttaIds(ids, metaById) {
    return ids.slice().sort((a, b) => {
        const oa = CATEGORY_ORDER[metaById[a].category] || 5;
        const ob = CATEGORY_ORDER[metaById[b].category] || 5;
        if (oa !== ob) return oa - ob;
        const mrA = metaById[a].mr || 0, mrB = metaById[b].mr || 0;
        if (mrA !== mrB) return mrB - mrA;
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
}

function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

// Batched lookups for buildSearchData below — a common Pali stem ("dukkha") matches thousands of
// segments across 1000+ suttas (verified against the real corpus). One query per segment (or per
// segment per language) turned that into tens of thousands of sql.js calls and made the search
// hang; grouping into a handful of `WHERE id IN (...)` queries (chunked to stay under SQLite's
// bound-parameter limit) does the same work in single digits of queries.
function fetchSuttaMetaBatch(suttaIds) {
    const result = {};
    for (const idChunk of chunkArray(suttaIds, 300)) {
        const placeholders = idChunk.map(() => '?').join(',');
        const rows = rowsToObjects(core.exec(
            `SELECT id, category, dir_path, title, mr FROM suttas WHERE id IN (${placeholders})`, idChunk
        ));
        for (const row of rows) result[row.id] = row;
    }
    return result;
}

function fetchSegmentsBatch(suttaIds) {
    const bySutta = new Map();
    for (const idChunk of chunkArray(suttaIds, 300)) {
        const placeholders = idChunk.map(() => '?').join(',');
        const rows = rowsToObjects(core.exec(
            `SELECT sutta_id, segment_id, root, variant FROM segments WHERE sutta_id IN (${placeholders})`, idChunk
        ));
        for (const row of rows) {
            if (!bySutta.has(row.sutta_id)) bySutta.set(row.sutta_id, new Map());
            bySutta.get(row.sutta_id).set(row.segment_id, { root: row.root, variant: row.variant });
        }
    }
    return bySutta;
}

function fetchTranslationsBatch(suttaIds) {
    const bySutta = new Map();
    for (const lang of Object.keys(langDbs)) {
        for (const idChunk of chunkArray(suttaIds, 300)) {
            const placeholders = idChunk.map(() => '?').join(',');
            const rows = rowsToObjects(langDbs[lang].exec(
                `SELECT sutta_id, segment_id, translator, text FROM translations WHERE sutta_id IN (${placeholders})`, idChunk
            ));
            for (const row of rows) {
                if (!bySutta.has(row.sutta_id)) bySutta.set(row.sutta_id, new Map());
                const segMap = bySutta.get(row.sutta_id);
                if (!segMap.has(row.segment_id)) segMap.set(row.segment_id, {});
                segMap.get(row.segment_id)[row.translator] = row.text;
            }
        }
    }
    return bySutta;
}

// Raw FTS match rows scanned before grouping — a safety cap, not a real-world limit for most
// queries (see MAX_DETAILED_SUTTAS below for the actually-hit limit on common words).
const MATCH_ROW_LIMIT = 10000;
// How many matched suttas get fully detailed (segments/translations fetched) per search. Common
// stems match 1000+ suttas; DataTables paginates 10-100 rows at a time anyway, and building
// thousands of detail rows client-side is its own cost regardless of query speed. Sorted by the
// same category/mr order as the real site BEFORE capping, so the cap drops the least-relevant
// tail, not an arbitrary slice. metadata.totalFiles/totalMatches still reflect the FULL matched
// set (see buildSearchResponse) — only which rows get full detail is capped.
const MAX_DETAILED_SUTTAS = 300;

// Builds the same {sutta_id, category, dir_path, titles, mr, count, unique_words, segments} shape
// as dg-light.js's /search response (see CLAUDE.md) so the real, unmodified search-render.js
// renders it exactly as on the live site.
//
// ponytail: unlike prod's two-phase fast=1 -> /search/enrich (grep-skeleton first, quotes filled
// in later), this returns fully-enriched data in one pass — SQLite queries are cheap enough that
// there's no need to replicate that optimization offline. __enriched:true on every row tells
// search-render.js not to show the "Loading quotes..." placeholder. Also simplified: titles only
// carries the Pali root (no per-language translated title), unique_words is just the search term
// (not the real matched word forms/declensions), wordReport/variantSegments are empty (Words tab
// and variant-match hint both render as empty, degrading gracefully — search-render.js already
// handles zero rows there). Upgrade path: none planned, these are minor/secondary features next
// to search+read working offline.
function buildSearchData(keyword, targetLangs, scope) {
    const q = ftsQuery(keyword);
    const matches = [...rowsToObjects(core.exec(
        'SELECT sutta_id, segment_id FROM fts WHERE fts MATCH ? LIMIT ?', [q, MATCH_ROW_LIMIT]
    ))];
    for (const lang of targetLangs) {
        if (!langDbs[lang]) continue;
        matches.push(...rowsToObjects(langDbs[lang].exec(
            'SELECT sutta_id, segment_id FROM fts WHERE fts MATCH ? LIMIT ?', [q, MATCH_ROW_LIMIT]
        )));
    }

    const segmentIdsBySutta = new Map();
    for (const m of matches) {
        if (!segmentIdsBySutta.has(m.sutta_id)) segmentIdsBySutta.set(m.sutta_id, new Set());
        segmentIdsBySutta.get(m.sutta_id).add(m.segment_id);
    }

    let suttaIds = [...segmentIdsBySutta.keys()];
    const metaById = fetchSuttaMetaBatch(suttaIds);
    // Mirrors dg-light.js's buildMatchSkeleton scope filter — without it, search ignores the
    // user's scope selection entirely and surfaces hits from the whole indexed corpus (Vinaya,
    // Abhidhamma, Apadana, ...) even under the default 4-nikaya/6-Khuddaka scope.
    const allowedPrefixes = resolveAllowedPrefixes(scope);
    suttaIds = sortSuttaIds(
        suttaIds.filter(id => metaById[id] && matchesScope(metaById[id].category, id, allowedPrefixes)),
        metaById
    );
    const totalMatchedSuttas = suttaIds.length;
    let totalMatchedSegments = 0;
    for (const id of suttaIds) totalMatchedSegments += segmentIdsBySutta.get(id).size;
    const detailedIds = suttaIds.slice(0, MAX_DETAILED_SUTTAS);

    const segmentsBySutta = fetchSegmentsBatch(detailedIds);
    const translationsBySutta = fetchTranslationsBatch(detailedIds);

    const data = {};
    for (const suttaId of detailedIds) {
        const meta = metaById[suttaId];
        const segIds = [...segmentIdsBySutta.get(suttaId)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const segMap = segmentsBySutta.get(suttaId) || new Map();
        const transMap = translationsBySutta.get(suttaId) || new Map();
        const segments = segIds.map(segmentId => {
            const rv = segMap.get(segmentId) || {};
            return {
                segment: segmentId,
                root_text: rv.root || '',
                variant: rv.variant || '',
                translations: transMap.get(segmentId) || {},
            };
        });
        data[suttaId] = {
            sutta_id: suttaId,
            category: meta.category,
            dir_path: meta.dir_path,
            titles: { root: meta.title },
            mr: meta.mr,
            count: segments.length,
            unique_words: [keyword],
            segments,
            __enriched: true,
        };
    }
    return { data, totalMatchedSuttas, totalMatchedSegments };
}

function buildSearchResponse(keyword, scope, targetLangs) {
    if (!keyword || keyword.length < MIN_KEYWORD_LENGTH) {
        return {
            metadata: { query: keyword || '', scope, resolvedPrefixes: [], langs: targetLangs, totalFiles: 0, totalMatches: 0, hasVariantMatch: false, tooShort: true },
            data: {}, wordReport: [], variantSegments: [],
        };
    }
    // buildSearchData already returns data pre-sorted (category/mr order) and capped to
    // MAX_DETAILED_SUTTAS — totalFiles/totalMatches below report the FULL matched set (pre-cap),
    // same intent as prod's totalFiles/totalMatches meaning "how many texts/matches exist", not
    // "how many rows did we bother detailing".
    const { data, totalMatchedSuttas, totalMatchedSegments } = buildSearchData(keyword, targetLangs, scope);
    return {
        metadata: { query: keyword, scope, resolvedPrefixes: resolveAllowedPrefixes(scope), langs: targetLangs, totalFiles: totalMatchedSuttas, totalMatches: totalMatchedSegments, hasVariantMatch: false },
        data, wordReport: [], variantSegments: [],
    };
}

// /search/enrich — prod's phase 2. Since buildSearchResponse above already returns fully-enriched
// data in one pass, this just re-runs the same query and filters to the requested ids; the real
// page only reads json.data from this response (see search/index.html's enrichChunk), so nothing
// else needs to match prod's shape exactly here.
function buildEnrichResponse(keyword, ids, targetLangs) {
    if (!keyword || keyword.length < MIN_KEYWORD_LENGTH) return { data: {}, variantSegments: [] };
    const { data } = buildSearchData(keyword, targetLangs);
    const filtered = {};
    for (const id of ids) if (data[id]) filtered[id] = data[id];
    return { data: filtered, variantSegments: [] };
}

// Mirrors dg-light.js's getSuttaBaseData+buildTextDataFromBase+/api/text/:suttaId handler, reading
// from local SQLite instead of the filesystem. Deliberately NOT ported: en-fallback when the
// requested language has zero translations, ?script= (Aksharamukha) conversion, and multiFor
// (second translator per language) — build-offline-db.js only stores one preferred translator per
// sutta per language, so a multiFor-requesting mode just sees one entry here and
// search-render.js's own "collapse to one column if the second translator is missing" fallback
// kicks in, same as a sutta that genuinely has no second translator.
function buildApiTextResponse(suttaId, params) {
    const meta = suttaMeta(suttaId);
    if (!meta) return null;

    const lang = params.get('lang');
    const langsParam = params.get('langs');
    const targetLangs = langsParam
        ? langsParam.split(',').map(s => s.trim())
        : lang ? [lang] : 'ru,en'.split(',');

    const segRows = rowsToObjects(core.exec(
        'SELECT segment_id, root, variant, html FROM segments WHERE sutta_id = ? ORDER BY rowid',
        [suttaId]
    ));
    const segments = segRows.map(row => ({
        segment: row.segment_id,
        root_text: row.root || '',
        variant: row.variant || '',
        html: row.html || '',
        translations: translationsForSegment(suttaId, row.segment_id),
    }));

    return {
        sutta_id: suttaId,
        category: meta.category,
        dir_path: meta.dir_path,
        title: meta.title,
        mr: meta.mr,
        segments,
        columns: targetLangs,
        lang: lang || targetLangs[0] || null,
    };
}

// 4 nikaya + 6 kn books — mirrors dg-light.js's DEFAULT_SCOPE_PREFIXES exactly (vinaya is
// opt-in via explicit ?scope=, not part of default).
const DEFAULT_SCOPE_PREFIXES = ['dn', 'mn', 'sn', 'an', 'ud', 'snp', 'dhp', 'thag', 'thig', 'iti'];

function resolveAllowedPrefixes(searchScope) {
    if (!searchScope || searchScope === 'default') return DEFAULT_SCOPE_PREFIXES;
    if (searchScope === 'all') return ['all'];
    const prefixes = [];
    for (const p of searchScope.split(',').map(s => s.trim())) {
        prefixes.push(...(p === 'default' ? DEFAULT_SCOPE_PREFIXES : [p]));
    }
    return prefixes;
}

function matchesScope(category, suttaId, allowedPrefixes) {
    if (allowedPrefixes.includes('all')) return true;
    return allowedPrefixes.some(prefix => {
        if (category === prefix) return true;
        if (suttaId === prefix) return true;
        if (suttaId.startsWith(prefix)) return /[0-9.-]/.test(suttaId.charAt(prefix.length));
        return false;
    });
}

// Mirrors dg-light.js's /api/nav/:suttaId, scope filtering included (owner: "попал в ридере в
// текст, который вообще не должен быть доступен без спец настройки — ротация прев/некст должна
// быть в рамках текстов, выбранных пользователем, или по умолчанию 4 никаи + 6 книг Кхуддаки").
// Was a bare positional walk over the whole suttas table — fixed to skip out-of-scope neighbors,
// same as the server.
function buildApiNavResponse(suttaId, scope) {
    const rows = rowsToObjects(core.exec('SELECT id, category, title FROM suttas ORDER BY rowid'));
    const idx = rows.findIndex(r => r.id === suttaId);
    if (idx === -1) return { prev: null, next: null };

    const allowedPrefixes = resolveAllowedPrefixes(scope);
    const inScope = (i) => matchesScope(rows[i].category, rows[i].id, allowedPrefixes);
    const toEntry = r => r ? { slug: r.id, title: r.title || '' } : null;

    let prev = null;
    for (let i = idx - 1; i >= 0; i--) { if (inScope(i)) { prev = toEntry(rows[i]); break; } }
    let next = null;
    for (let i = idx + 1; i < rows.length; i++) { if (inScope(i)) { next = toEntry(rows[i]); break; } }
    return { prev, next };
}

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

// Installed synchronously, at the very top of <head> (see index.html) — before any other script
// or asset on the page can issue a real fetch(). Requests this doesn't recognize pass straight
// through to the real fetch (static JSON/HTML/CSS/JS all resolve as plain local files — see
// build-assets.js, no shim code needed for those).
function installFetchShim() {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        let parsed;
        try { parsed = new URL(url, location.href); } catch (e) { return realFetch(input, init); }
        const p = parsed.pathname;

        if (p.startsWith('/api/text/')) {
            await ready;
            const suttaId = decodeURIComponent(p.slice('/api/text/'.length)).toLowerCase();
            const data = buildApiTextResponse(suttaId, parsed.searchParams);
            return data ? jsonResponse(data) : jsonResponse({ error: `Unknown sutta id: ${suttaId}` }, 404);
        }
        if (p.startsWith('/api/nav/')) {
            await ready;
            const suttaId = decodeURIComponent(p.slice('/api/nav/'.length)).toLowerCase();
            return jsonResponse(buildApiNavResponse(suttaId, parsed.searchParams.get('scope')));
        }
        // TOC — pre-baked at build time (mobile/build-toc-snapshot.js curls the live server's
        // /api/toc and /api/toc/book/:code once and saves the JSON) rather than reimplemented
        // client-side: dg-light.js's branch-title resolution (colophon lookups, curated SN
        // overrides, etc — see annotateTree/getBranchTitle there) is intricate, one-off logic
        // that only needs to change when the corpus or configs/reader/toc-books.json changes —
        // the same cadence as core.db, not something worth duplicating for a per-request answer.
        // No `await ready` needed — these are static files, not SQLite queries. ?langs= is
        // ignored: the snapshot was baked for ru,en, the only two languages this app ships.
        if (p === '/api/toc') {
            return realFetch('/api-snapshots/toc.json', init);
        }
        if (p.startsWith('/api/toc/book/')) {
            const code = decodeURIComponent(p.slice('/api/toc/book/'.length));
            return realFetch(`/api-snapshots/toc-book-${code}.json`, init);
        }
        // /api/patimokkha-fragment/:side — TOC's inline Patimokkha expand (public/spa/toc.js).
        // The file is already physically bundled at reader/{bu,bi}-pm-fragment.html
        // (build-assets.js) — just the URL shape differs from dg-light.js's own route, so remap.
        if (p.startsWith('/api/patimokkha-fragment/')) {
            const side = p.slice('/api/patimokkha-fragment/'.length);
            if (side !== 'bu' && side !== 'bi') return jsonResponse({ error: 'Not found' }, 404);
            return realFetch(`/reader/${side}-pm-fragment.html`, init);
        }
        if (p === '/search/enrich') {
            await ready;
            const keyword = parsed.searchParams.get('q') || '';
            const ids = (parsed.searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean);
            const targetLangs = (parsed.searchParams.get('langs') || 'ru,en').split(',').map(s => s.trim());
            return jsonResponse(buildEnrichResponse(keyword, ids, targetLangs));
        }
        if (p === '/search' || (p.startsWith('/search/') && p !== '/search/enrich')) {
            await ready;
            const keyword = p === '/search' ? (parsed.searchParams.get('q') || '') : decodeURIComponent(p.slice('/search/'.length));
            const scope = parsed.searchParams.get('scope') || 'default';
            const targetLangs = (parsed.searchParams.get('langs') || 'ru,en').split(',').map(s => s.trim());
            return jsonResponse(buildSearchResponse(keyword, scope, targetLangs));
        }
        return realFetch(input, init);
    };
}

// app.js is the very first <script> in <head> (see index.html) — sql-wasm.js hasn't loaded yet
// at that point, so it's injected here rather than declared as a separate earlier <script> tag,
// keeping the "install the shim before anything else can fetch" ordering with a single tag.
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

async function loadData() {
    await loadScript('/vendor/sql-wasm.js');
    SQL = await initSqlJs({ locateFile: f => `/vendor/${f}` });
    const idb = await openStore();
    core = new SQL.Database(await fetchDbBytes(idb, 'core.db'));
    langDbs.ru = new SQL.Database(await fetchDbBytes(idb, 'lang_ru.db'));
    langDbs.en = new SQL.Database(await fetchDbBytes(idb, 'lang_en.db'));
}

installFetchShim();
ready = loadData();
