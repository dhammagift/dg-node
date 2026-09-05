#!/usr/bin/env node
// build-search-db.js — builds dg.db, the SQLite/FTS5 corpus that replaces the grep search path
// and the per-request JSON file reads (see CLAUDE.md). `npm run build-search-db`.
//
// Self-contained: it reads the corpus and nothing else — not dg_db_light.json, not dblight.js,
// not dg-light.js or dg-fastify.js, and nothing requires() it back. The sutta metadata it needs
// (category, dir_path, title, mr) is derived here from the same rules dblight.js uses, copied
// rather than shared, so the Express server's skeleton pipeline and this one can change
// independently. Same isolation rule already applied to mobile/.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_ROOT = path.join(__dirname, 'siteroot', 'data');
const SC_BILARA = path.join(DATA_ROOT, 'suttacentral.net', 'sc-data', 'sc_bilara_data');
const SC_TRANS = path.join(SC_BILARA, 'translation');
const DG_OFFLINE = path.join(DATA_ROOT, 'dhammagift');
const DG_LANGS = ['ru', 'ru_other', 'en', 'en_other', 'ai'];

// Owner: AI translations are hidden content — stored so the reader can still show them, but
// never fed to the FTS index, so search cannot surface them. Keyed by TRANSLATOR, not language:
// the files live under dhammagift/ai/ but are named "{id}_translation-ru-ai.json", so they carry
// a real language ("ru") and "ai" is the author.
const UNINDEXED_TRANSLATORS = new Set(['ai']);

const OUT_PATH = path.join(__dirname, 'dg.db');

// `mr` (legacy relevance rank) is the one piece of sutta metadata that is not in the corpus —
// it comes from the legacy site's textinfo.json. Everything else below is derived from the
// corpus itself, so this build does not depend on dg_db_light.json / dblight.js at all.
const TEXTINFO_PATH = fs.existsSync('/data/data/com.termux/files/usr')
    ? '/data/data/com.termux/files/usr/share/apache2/default-site/htdocs/assets/js/textinfo.json'
    : (process.platform === 'win32'
        ? 'C:/soft/dg/assets/js/textinfo.json'
        : '/var/www/html/assets/js/textinfo.json');

// Files that are not sutta texts (UI strings, blurbs, subject indexes, study guides), plus one
// real duplicate. Same list dblight.js keeps for the Express server's skeleton — duplicated
// rather than shared, because the two build pipelines are deliberately independent.
// dn84 is a truncated duplicate of dn16 shipped in the SuttaCentral corpus: same title, the same
// "dn16:…" segment ids, its 549 segments byte-identical to dn16's, but one translation instead of
// eight and no variants. Indexed, it appears as a second, poorer DN16 in every result, and since
// the two share segment ids each pollutes the other's quotes (owner: "она вообще не нужна").
// Excluding it here is the durable fix: the corpus is a live git checkout of suttacentral/sc-data,
// so deleting the files themselves would only last until the next pull.
const EXCLUDE_PATTERNS = [
    /xplayground/i, /name/i, /site/i, /blurbs/i, /dukkh/i, /subjects/i,
    /terminology/i, /similes/i, /-guide-/i, /an-introduction/i, /^dn84_/i,
];

// Mirrors SOURCE_PRIORITY in dg-fastify.js: when the same translator exists in several source
// trees, this decides which copy wins. Highest priority first.
const SOURCE_PRIORITY = { ru: ['dgmain', 'dgother', 'sc'], en: ['dgmain', 'sc', 'dgother'] };
const DEFAULT_SOURCE_PRIORITY = ['dgmain', 'sc', 'dgother'];

function sourceRank(lang, source) {
    const order = SOURCE_PRIORITY[lang] || DEFAULT_SOURCE_PRIORITY;
    const i = order.indexOf(source);
    return i === -1 ? order.length : i;
}

// Copied from dg-fastify.js: the suttaId is sliced off BY LENGTH, never split('-'), because
// range ids ("an1.1-10") contain hyphens of their own.
function parseTranslationFilename(baseName, suttaId) {
    const suffix = baseName.slice(suttaId.length + 1);
    const parts = suffix.split('-');
    if (parts.length < 3 || parts[0] !== 'translation') return null;
    return { lang: parts[1], author: parts.slice(2).join('-') };
}

function walkJson(dir, onFile) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (EXCLUDE_PATTERNS.some(p => p.test(entry.name))) continue;
        const full = path.join(dir, entry.name);
        // A symlink to a directory reports isDirectory() === false, so it must be followed
        // explicitly — dhammagift/{ru,en,ru_other,en_other} are symlinks into translation/.
        if (entry.isDirectory() || (entry.isSymbolicLink() && isDir(full))) walkJson(full, onFile);
        else if (entry.name.endsWith('.json')) onFile(full, entry.name);
    }
}

function isDir(p) {
    try {
        return fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
}

function readSegments(file) {
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function suttaIdFromFile(name) {
    const i = name.indexOf('_');
    return i === -1 ? null : name.slice(0, i);
}

// Sutta metadata, derived from the corpus rather than read out of dg_db_light.json — this build
// is deliberately independent of dblight.js and the Express server's skeleton. The heuristics
// below are copied from dblight.js, not shared with it (same rule already applied to
// parseTranslationFilename above).
function loadTextInfo() {
    try {
        const raw = fs.readFileSync(TEXTINFO_PATH, 'utf8')
            .replace(/^(var|let|const)\s+\w+\s*=\s*/, '')
            .replace(/;\s*$/, '');
        return JSON.parse(raw);
    } catch (e) {
        console.warn(`textinfo.json unreadable (${e.message}) — every mr will be 0`);
        return {};
    }
}

function collectSuttaMeta() {
    const textInfo = loadTextInfo();
    const byId = new Map();

    walkJson(path.join(SC_BILARA, 'root'), (file, name) => {
        const suttaId = suttaIdFromFile(name);
        if (!suttaId) return;
        if (!byId.has(suttaId)) {
            byId.set(suttaId, {
                category: 'other',
                dir_path: path.relative(path.join(SC_BILARA, 'root'), path.dirname(file)).replace(/\\/g, '/'),
                title: '',
                mr: parseInt(textInfo[suttaId] && textInfo[suttaId].mtph, 10) || 0,
            });
        }
        const meta = byId.get(suttaId);
        const posix = file.replace(/\\/g, '/');
        if (posix.includes('/vinaya/')) meta.category = 'vinaya';
        else if (posix.includes('/sutta/kn/')) meta.category = 'khudakka';
        else if (posix.includes('/sutta/')) meta.category = 'dhamma';
        else if (posix.includes('/abhidhamma/')) meta.category = 'abhi';

        // Bilara stacks several ":0.N" front-matter segments — canon, book, vagga — before the
        // sutta's own title, and only then the first real segment (":1…"). The LAST of them is
        // the sutta's title; taking the first gives "Aṅguttara Nikāya" for everything.
        const segments = readSegments(file);
        if (!segments) return;
        for (const segmentId of Object.keys(segments)) {
            if (/:0(?:\.\d+)?$/.test(segmentId)) {
                const text = segments[segmentId];
                if (typeof text === 'string' && text.trim()) meta.title = text;
            } else if (/:[1-9]/.test(segmentId)) break;
        }
    });

    // A sutta counts as present only if it also has an html file — the rule the skeleton has
    // always used, and what keeps half-published texts out of the corpus.
    const withHtml = new Set();
    walkJson(path.join(SC_BILARA, 'html'), (file, name) => {
        const id = suttaIdFromFile(name);
        if (id) withHtml.add(id);
    });

    // Insertion order matters downstream: the server walks this order to find the previous and
    // next sutta, so it is sorted the same way the skeleton was.
    const ordered = new Map();
    for (const id of [...byId.keys()].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))) {
        if (withHtml.has(id)) ordered.set(id, byId.get(id));
    }
    return ordered;
}

function build() {
    const started = Date.now();
    const t0 = Date.now();
    const meta = collectSuttaMeta();
    if (!meta.size) {
        throw new Error(`0 suttas found — is ${SC_BILARA} the right corpus root?`);
    }
    console.log(`metadata: ${meta.size} suttas (${Date.now() - t0}ms)`);

    fs.rmSync(OUT_PATH, { force: true });
    fs.rmSync(`${OUT_PATH}-wal`, { force: true });
    fs.rmSync(`${OUT_PATH}-shm`, { force: true });
    const db = new DatabaseSync(OUT_PATH);
    db.exec(`
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        CREATE TABLE suttas (
            id TEXT PRIMARY KEY, category TEXT, dir_path TEXT, title TEXT, mr INTEGER);
        -- source: which tree the row came from ('sc' | 'dgmain' | 'dgother'), NULL for Pali.
        -- Kept because translator selection falls back to "prefer the project's own translation"
        -- for a language that has no explicit priority list.
        CREATE TABLE texts (
            sutta_id TEXT, segment_id TEXT, ord INTEGER,
            kind TEXT, lang TEXT, translator TEXT, source TEXT, txt TEXT);
        CREATE TABLE html (sutta_id TEXT, segment_id TEXT, ord INTEGER, txt TEXT);
    `);

    const insSutta = db.prepare('INSERT INTO suttas VALUES (?,?,?,?,?)');
    db.exec('BEGIN');
    for (const [id, m] of meta) {
        // Stored verbatim, trailing space and all: titles come from the corpus's own front
        // matter and /api/text returns this string as-is, so trimming here would silently change
        // the response.
        insSutta.run(id, m.category, m.dir_path, m.title, m.mr);
    }
    db.exec('COMMIT');

    const insText = db.prepare('INSERT INTO texts VALUES (?,?,?,?,?,?,?,?)');
    const insHtml = db.prepare('INSERT INTO html VALUES (?,?,?,?)');

    // A single file becomes a run of rows sharing (sutta_id, kind, translator); `ord` is the
    // segment's position in it, which is what reproduces grep's -B/-A context without needing
    // line numbers.
    function ingest(file, kind, lang, translator, source) {
        const suttaId = suttaIdFromFile(path.basename(file));
        if (!suttaId || !meta.has(suttaId)) return 0;
        const segments = readSegments(file);
        if (!segments) return 0;
        let ord = 0;
        for (const segmentId of Object.keys(segments)) {
            const txt = segments[segmentId];
            if (typeof txt !== 'string' || !txt) continue;
            if (kind === 'html') insHtml.run(suttaId, segmentId, ord++, txt);
            else insText.run(suttaId, segmentId, ord++, kind, lang, translator, source ?? null, txt);
        }
        return ord;
    }

    let rows = 0;
    for (const [kind, dir] of [['root', 'root'], ['variant', 'variant']]) {
        let t = Date.now();
        let n = 0;
        db.exec('BEGIN');
        walkJson(path.join(SC_BILARA, dir), file => { n += ingest(file, kind, null, null); });
        db.exec('COMMIT');
        rows += n;
        console.log(`${kind}: ${n} segments (${Date.now() - t}ms)`);
    }

    let t = Date.now();
    let htmlRows = 0;
    db.exec('BEGIN');
    walkJson(path.join(SC_BILARA, 'html'), file => { htmlRows += ingest(file, 'html', null, null); });
    db.exec('COMMIT');
    console.log(`html: ${htmlRows} segments (${Date.now() - t}ms)`);

    // Translation files are resolved BEFORE any of them is read: the same translator can exist in
    // several source trees (ru_sv lives in both the SC mirror and DG-other), and only the
    // highest-priority copy should end up in the table. Resolving at file level keeps this to a
    // ~34k-entry map instead of deduplicating millions of rows afterwards.
    t = Date.now();
    const winners = new Map(); // `${suttaId}|${lang}_${author}` -> { file, lang, author, rank }
    function offerTranslations(dir, source) {
        walkJson(dir, (file, name) => {
            const suttaId = suttaIdFromFile(name);
            if (!meta.has(suttaId)) return;
            const parsed = parseTranslationFilename(path.basename(name, '.json'), suttaId);
            if (!parsed) return;
            const rank = sourceRank(parsed.lang, source);
            const key = `${suttaId}|${parsed.lang}_${parsed.author}`;
            const prev = winners.get(key);
            if (!prev || rank < prev.rank) winners.set(key, { file, ...parsed, rank, source });
        });
    }
    for (const lang of fs.readdirSync(SC_TRANS)) offerTranslations(path.join(SC_TRANS, lang), 'sc');
    for (const l of DG_LANGS) {
        offerTranslations(path.join(DG_OFFLINE, l), l.includes('_other') ? 'dgother' : 'dgmain');
    }
    console.log(`translation files resolved: ${winners.size} (${Date.now() - t}ms)`);

    t = Date.now();
    let transRows = 0;
    db.exec('BEGIN');
    for (const w of winners.values()) {
        transRows += ingest(w.file, 'translation', w.lang, w.author, w.source);
    }
    db.exec('COMMIT');
    rows += transRows;
    console.log(`translations: ${transRows} segments (${Date.now() - t}ms)`);

    t = Date.now();
    db.exec(`
        CREATE INDEX idx_texts_sutta   ON texts(sutta_id, kind);
        CREATE INDEX idx_texts_lookup  ON texts(sutta_id, kind, translator, ord);
        CREATE INDEX idx_html_sutta    ON html(sutta_id);
        -- segment_id alone, not (sutta_id, segment_id): a segment id already carries its sutta
        -- ("sn35.240:1.6"), so the search path fetches a whole result window with one
        -- "segment_id IN (...)" instead of a query per sutta.
        CREATE INDEX idx_texts_segid   ON texts(segment_id);
    `);
    console.log(`indexes (${Date.now() - t}ms)`);

    // trigram, not unicode61: grep matches substrings ("kacchapa" finds "mahākacchapa") and the
    // /search response has to stay identical. remove_diacritics folds the Pali diacritics
    // (ā→a, ṁ→m, ñ→n, ṇ→n) that the grep path folded by hand.
    // External content (content='texts') keeps the text stored once, and populating the index by
    // explicit SELECT rather than 'rebuild' is what lets the hidden `ai` rows stay out of it.
    t = Date.now();
    db.exec(`
        CREATE VIRTUAL TABLE fts USING fts5(
            txt, content='texts', content_rowid='rowid',
            tokenize='trigram remove_diacritics 1');
    `);
    // The indexed copy is ё-folded because the tokenizer will not do it: remove_diacritics folds
    // the Pali marks (ā→a, ṁ→m, ñ→n, ṇ→n) but treats ё as its own Cyrillic letter, and the grep
    // path this replaces folded е/ё by hand. The query side folds the same way. Storing a folded
    // copy in the index is safe precisely because the index is external-content — the readable
    // text lives in `texts` and is returned from there, never from here (so: never `rebuild`,
    // which would repopulate the index from the unfolded content).
    const placeholders = [...UNINDEXED_TRANSLATORS].map(() => '?').join(',');
    db.prepare(
        `INSERT INTO fts(rowid, txt)
         SELECT rowid, replace(replace(txt, 'ё', 'е'), 'Ё', 'Е') FROM texts
         WHERE translator IS NULL OR translator NOT IN (${placeholders})`
    ).run(...UNINDEXED_TRANSLATORS);
    console.log(`fts index (${Date.now() - t}ms)`);

    db.exec('PRAGMA journal_mode = WAL');
    db.exec('ANALYZE');
    // Counted from `texts`, not from `fts`: on an external-content table `SELECT count(*) FROM
    // fts` reports the content table's row count, so it cannot show what is actually indexed.
    const unindexed = db.prepare(
        `SELECT count(*) c FROM texts WHERE translator IN (${placeholders})`
    ).get(...UNINDEXED_TRANSLATORS).c;
    db.close();

    const mb = (fs.statSync(OUT_PATH).size / 1048576).toFixed(1);
    console.log(`\n${OUT_PATH}: ${mb} MB, ${rows} text rows (${rows - unindexed} indexed, ` +
        `${unindexed} hidden from search), ${htmlRows} html rows`);
    console.log(`Total ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

build();
