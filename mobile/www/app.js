// Main page + search for the offline app. Pure JS/WASM (sql.js) in the WebView — no native
// plugin (see build-offline-db.js header for why: sql.js has no FTS5, so the DBs are FTS4).
//
// DBs are downloaded at runtime (not bundled in the APK) so they stay updatable and support
// adding languages later without a new app release — cached in IndexedDB (see openStore below
// for why not Cache Storage), which persists across app restarts and works offline once
// downloaded.
const DIST_BASE = 'https://test.dhamma.gift/mobile-data';

const statusEl = document.getElementById('status');
const formEl = document.getElementById('search-form');
const inputEl = document.getElementById('search-input');
const resultsEl = document.getElementById('results');

let SQL;
let core, langDbs = {}; // { ru: Database, en: Database }

function setStatus(text) {
    statusEl.textContent = text;
}

// IndexedDB, not Cache Storage — Cache.put() on a cross-origin Response (the WebView's own
// origin is never the same as DIST_BASE) hit QuotaExceededError in testing even well under the
// reported quota: Chromium pads cross-origin Cache Storage entries to block quota-based
// cross-origin size probing, and that padding is enough to blow the budget for a 60MB+ file.
// Storing the raw bytes ourselves in IndexedDB sidesteps that response-padding behavior.
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

    setStatus(`Downloading ${name}...`);
    const response = await fetch(`${DIST_BASE}/${name}`);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    const buf = await response.arrayBuffer();
    await idbSet(idb, name, buf);
    return new Uint8Array(buf);
}

async function init() {
    setStatus('Loading SQL engine...');
    SQL = await initSqlJs({ locateFile: f => `vendor/${f}` });
    const idb = await openStore();

    core = new SQL.Database(await fetchDbBytes(idb, 'core.db'));
    langDbs.ru = new SQL.Database(await fetchDbBytes(idb, 'lang_ru.db'));
    langDbs.en = new SQL.Database(await fetchDbBytes(idb, 'lang_en.db'));

    setStatus('Ready — search in Pali, Russian, or English.');
    formEl.addEventListener('submit', onSearch);
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

function segmentRootVariant(suttaId, segmentId) {
    const rows = rowsToObjects(core.exec(
        'SELECT root, variant FROM segments WHERE sutta_id = ? AND segment_id = ? LIMIT 1',
        [suttaId, segmentId]
    ));
    return rows[0] || { root: '', variant: '' };
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

// Builds the same { sutta_id, category, dir_path, titles, mr, count, unique_words, segments }
// shape as dg-light.js's /search response (see CLAUDE.md) so the real, unmodified
// search-render.js (buildDataTable) can render it exactly as it does on the live site.
//
// ponytail: titles only carries the Pali root (no per-language translated title, no lb/la
// context lines, unique_words is just the query itself, not the real matched word forms) —
// search-render.js degrades gracefully for all of these (see its transKeys/__enriched checks).
// Upgrade path: look up the title segment's translation the way dg-light.js's enrichment does,
// once the reader/title pipeline is ported too.
function buildSearchData(query) {
    const paliMatches = rowsToObjects(core.exec(
        'SELECT sutta_id, segment_id FROM fts WHERE fts MATCH ? LIMIT 200',
        [query]
    ));
    const translationMatches = [];
    for (const lang of Object.keys(langDbs)) {
        translationMatches.push(...rowsToObjects(langDbs[lang].exec(
            'SELECT sutta_id, segment_id FROM fts WHERE fts MATCH ? LIMIT 200',
            [query]
        )));
    }

    const segmentIdsBySutta = new Map();
    for (const m of [...paliMatches, ...translationMatches]) {
        if (!segmentIdsBySutta.has(m.sutta_id)) segmentIdsBySutta.set(m.sutta_id, new Set());
        segmentIdsBySutta.get(m.sutta_id).add(m.segment_id);
    }

    const data = {};
    for (const [suttaId, segmentIds] of segmentIdsBySutta) {
        const meta = suttaMeta(suttaId);
        if (!meta) continue;
        const segments = [...segmentIds].sort().map(segmentId => {
            const rv = segmentRootVariant(suttaId, segmentId);
            return {
                segment: segmentId,
                root_text: rv.root || '',
                variant: rv.variant || '',
                translations: translationsForSegment(suttaId, segmentId),
            };
        });
        data[suttaId] = {
            sutta_id: suttaId,
            category: meta.category,
            dir_path: meta.dir_path,
            titles: { root: meta.title },
            mr: meta.mr,
            count: segments.length,
            unique_words: [query],
            segments,
            __enriched: true,
        };
    }
    return data;
}

function onSearch(e) {
    e.preventDefault();
    const query = inputEl.value.trim();
    if (!query) return;
    const data = buildSearchData(query);
    const rows = Object.values(data);
    setStatus(`${rows.length} sutta(s) matched.`);
    window.DgSearchRender.buildDataTable('#pali', rows, query, 'ru,en', false);
}

init().catch(err => setStatus(`Error: ${err.message}`));
