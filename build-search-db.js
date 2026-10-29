#!/usr/bin/env node
// build-search-db.js — builds dg.db, the SQLite/FTS5 corpus that replaces the grep search path
// and the per-request JSON file reads (see CLAUDE.md). `npm run build-search-db`.
//
// Self-contained: it reads the corpus and nothing else — not dg_db_light.json, not dblight.js,
// not dg-light.js or dg-fastify.js, and nothing requires() it back. The sutta metadata it needs
// (category, dir_path, title, mr) is derived here from the same rules dblight.js uses, copied
// rather than shared, so the Express server's skeleton pipeline and this one can change
// independently. Same isolation rule the offline app follows from its own repo (dg-app-full).
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { paliSkel } = require('./public/overrides/js/pali-skeleton.js');
// Только ради DEFAULT_SCOPE_PREFIXES/matchesScope для словаря подсказок (см. build()). Модуль при require
// ничего не делает — читает свои json-конфиги и ждёт init(), которого здесь не будет.
const { DEFAULT_SCOPE_PREFIXES, matchesScope, stripSearchPunctuation } = require('./core/search-core.js');

// DG_DATA_ROOT / DG_TEXTINFO / DG_LEGACY_WORDS: set by .github/workflows/build-db.yml, where the
// corpus is checked out next to the repo instead of symlinked into siteroot/ as on the server.
const DATA_ROOT = process.env.DG_DATA_ROOT || path.join(__dirname, 'siteroot', 'data');
const SC_BILARA = path.join(DATA_ROOT, 'suttacentral.net', 'sc-data', 'sc_bilara_data');
const SC_TRANS = path.join(SC_BILARA, 'translation');
const DG_OFFLINE = path.join(DATA_ROOT, 'dhammagift');
const DG_LANGS = ['ru', 'ru_other', 'en', 'en_other', 'ai', 'th'];

// Owner: AI translations are hidden content — stored so the reader can still show them, but
// never fed to the FTS index, so search cannot surface them. Keyed by TRANSLATOR, not language:
// the files live under dhammagift/ai/ but are named "{id}_translation-ru-ai.json", so they carry
// a real language ("ru") and "ai" is the author.
const UNINDEXED_TRANSLATORS = new Set(['ai']);

const OUT_PATH = path.join(__dirname, 'dg.db');

// `mr` is the one piece of sutta metadata that is not in the corpus — it comes from the legacy
// site's textinfo.json. It is NOT a relevance rank, whatever earlier comments said: the source
// field is `mtph`, the NUMBER OF METAPHORS in the text. It is only a display-order key for the
// search table (see sortSuttaResults), not a measure of relevance to a query.
//
// Coverage is thin: textinfo.json holds 4932 entries and `mtph` is filled for ~665 suttas, so
// mr = 0 for 6940 of the 7605 suttas in dg.db (91%) — those always sort after anything with a
// count. That is harmless while the reader sees the whole table, and misleading as soon as the
// list is truncated (see the MCP `search` cap).
//
// Everything else below is derived from the corpus itself, so this build does not depend on
// dg_db_light.json / dblight.js at all.
const TEXTINFO_PATH = process.env.DG_TEXTINFO || (fs.existsSync('/data/data/com.termux/files/usr')
    ? '/data/data/com.termux/files/usr/share/apache2/default-site/htdocs/assets/js/textinfo.json'
    : (process.platform === 'win32'
        ? 'C:/soft/dg/assets/js/textinfo.json'
        : '/var/www/html/assets/js/textinfo.json'));

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

// SC's variant line and ours for one segment: ours adds only the readings ("word → reading (sources)", joined by " | ")
// SC does not have, compared without ṁ/ṃ and spacing differences.
function mergeReadings(sc, ours) {
    if (!sc) return ours;
    const norm = t => t.normalize('NFC').replace(/ṃ/g, 'ṁ').replace(/\s+/g, ' ').trim();
    const have = new Set(sc.split(' | ').map(norm));
    const add = ours.split(' | ').map(t => t.trim()).filter(t => t && !have.has(norm(t)));
    return add.length ? sc.trimEnd() + ' | ' + add.join(' | ') + ' ' : sc;
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

    /* Словарь подсказок ("может быть, вы искали", core/search-core.js suggestWords) собирается
       ПОПУТНО, в ingest() ниже: тот же текст, что и так проходит через руки при записи.

       Область — четыре никаи + шесть книг КН + виная: DEFAULT_SCOPE_PREFIXES, тот же список и тот
       же предикат matchesScope, по которым ищет сам поиск, а не второй список префиксов рядом.
       Владелец: "только на четыре никая... и шесть книг КН максимум" и отдельно "и + виная".
       Виная в поиске — scope по запросу, но это канон, а не комментарий.

       Почему не весь pli/%: первая версия брала все пали-корни, и в подсказки лезли слова из
       джатак и абхидхаммы (kacchapajātaka, монстр на 66 букв). По ним дефолтный поиск возвращает
       ноль — подсказка вела в пустоту, что хуже, чем не подсказать. df по той же причине
       считается только внутри этой области. */
    const vocabScope = new Set();
    for (const [id, m] of meta) {
        if (m.dir_path && m.dir_path.startsWith('pli/') &&
            matchesScope(m, id, DEFAULT_SCOPE_PREFIXES.concat('vinaya'))) vocabScope.add(id);
    }
    // Apostrophes and hyphens stay in the stored form (it is shown to the person and pasted into
    // the search box, so it has to be the real form); paliSkel drops them on both sides anyway.
    const VOCAB_WORD = /[\p{L}\u2019'-]+/gu;
    const vocabDf = new Map();
    function countVocabWords(txt) {
        // Per segment, not per occurrence: df only ranks suggestions, and "appears in many places"
        // is the useful signal, not "repeated inside one verse".
        for (const w of new Set(txt.toLowerCase().match(VOCAB_WORD) || [])) {
            vocabDf.set(w, (vocabDf.get(w) || 0) + 1);
        }
    }

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
    function ingest(file, kind, lang, translator, source, given) {
        const suttaId = suttaIdFromFile(path.basename(file));
        if (!suttaId || !meta.has(suttaId)) return 0;
        const segments = given || readSegments(file);
        if (!segments) return 0;
        const countWords = kind === 'root' && vocabScope.has(suttaId);
        let ord = 0;
        for (const segmentId of Object.keys(segments)) {
            const txt = segments[segmentId];
            if (typeof txt !== 'string' || !txt) continue;
            if (kind === 'html') insHtml.run(suttaId, segmentId, ord++, txt);
            else insText.run(suttaId, segmentId, ord++, kind, lang, translator, source ?? null, txt);
            // Словарь подсказок считается здесь же, пока сегмент в руках. Раньше buildVocab читал
            // все 485 тысяч корневых строк обратно из texts — тот же текст, только что записанный,
            // вторым проходом. Считать на месте дешевле ровно на это чтение.
            if (countWords) countVocabWords(txt);
        }
        return ord;
    }

    let rows = 0;
    for (const [kind, dir] of [['root', 'root'], ['variant', 'variant']]) {
        let t = Date.now();
        let n = 0;
        db.exec('BEGIN');
        if (kind === 'root') walkJson(path.join(SC_BILARA, dir), file => { n += ingest(file, kind, null, null); });
        else {
            // The project's own variant readings (dhammagift/variant/pli/ms, the old site's assets/texts/variant: Siam
            // readings SC lacks) go in with SC's, file by file at the same path. A segment both have keeps both readings,
            // joined by " | " as SC joins its own; a reading SC already has is not repeated. (variant/pli/bjt, my, th next
            // to it are whole editions, not readings, and are not read here.)
            const ours = new Map();
            const DG_VARIANT = path.join(DG_OFFLINE, 'variant', 'pli', 'ms');
            if (isDir(DG_VARIANT)) walkJson(DG_VARIANT, file => ours.set(path.relative(DG_VARIANT, file), readSegments(file)));
            const root = path.join(SC_BILARA, dir, 'pli', 'ms');
            walkJson(path.join(SC_BILARA, dir), file => {
                const rel = path.relative(root, file), add = ours.get(rel);
                if (!add) { n += ingest(file, kind, null, null); return; }
                ours.delete(rel);
                const merged = Object.assign({}, readSegments(file));
                for (const [seg, txt] of Object.entries(add)) merged[seg] = mergeReadings(merged[seg], txt);
                n += ingest(file, kind, null, null, null, merged);
            });
            for (const [rel, segs] of ours) n += ingest(path.join(DG_VARIANT, rel), kind, null, null, null, segs);
        }
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
    // The indexed copy is folded because the tokenizer will not do it: ё→е (remove_diacritics
    // folds the Pali marks, ā→a, ṁ→m, but treats ё as its own Cyrillic letter), and the punctuation
    // the query side strips at the door (search-core.js stripSearchPunctuation) is stripped here
    // too — otherwise "evaṁ bhikkhave" never found "evaṁ, bhikkhave" (owner). The JS-side matchers
    // allow those marks back between letters (search-core.js punctTolerantPattern). Storing a
    // folded copy in the index is safe precisely because the index is external-content — the
    // readable text lives in `texts` and is returned from there, never from here (so: never
    // `rebuild`, which would repopulate the index from the unfolded content).
    db.function('fts_fold', { deterministic: true },
        s => stripSearchPunctuation(s || '').replace(/ё/g, 'е').replace(/Ё/g, 'Е'));
    const placeholders = [...UNINDEXED_TRANSLATORS].map(() => '?').join(',');
    db.prepare(
        `INSERT INTO fts(rowid, txt)
         SELECT rowid, fts_fold(txt) FROM texts
         WHERE translator IS NULL OR translator NOT IN (${placeholders})`
    ).run(...UNINDEXED_TRANSLATORS);
    console.log(`fts index (${Date.now() - t}ms)`);

    db.exec('PRAGMA journal_mode = WAL');
    const vocabWords = writeVocab(db, vocabDf);
    writeSuttaWords(vocabDf, vocabWords);
    db.exec('ANALYZE');
    const buildId = writeMeta(db);
    // Counted from `texts`, not from `fts`: on an external-content table `SELECT count(*) FROM
    // fts` reports the content table's row count, so it cannot show what is actually indexed.
    const unindexed = db.prepare(
        `SELECT count(*) c FROM texts WHERE translator IN (${placeholders})`
    ).get(...UNINDEXED_TRANSLATORS).c;
    db.close();

    if (process.argv.includes('--publish')) publishArchive(buildId);

    const mb = (fs.statSync(OUT_PATH).size / 1048576).toFixed(1);
    console.log(`\n${OUT_PATH}: ${mb} MB, ${rows} text rows (${rows - unindexed} indexed, ` +
        `${unindexed} hidden from search), ${htmlRows} html rows`);
    console.log(`Total ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

/* --publish: положить на раздачу ТУ ЖЕ базу, которую только что собрали, сжатой. Владелец:
   "почему не один общий провод делает одну базу и не кладет ее же в виде архива на раздачу".

   Раньше это был отдельный скрипт (publish-offline-db.js): он заново открывал базу, заново читал
   из неё build_id и заново решал, ту ли базу публикует. Три вопроса, которых просто нет, когда
   архив делается здесь же из файла, который эта функция и записала.

   Публикация специально НЕ происходит сама по себе: она меняет то, что качают люди, и смена
   build_id — это оповещение "доступна новая база" всем, у кого офлайн уже скачан. Поэтому флаг.

   `--no-build` — выложить базу, которая уже лежит, не пересобирая. Сначала этого не было: мол,
   сборка детерминированная, проще пересобрать. Аргумент оказался пустой. Во-первых, "а ту ли базу
   я выложил" здесь взяться неоткуда — эта функция хэширует ровно те байты, которые кладёт, и
   build_id читает из того же файла. Во-вторых, пересборка меняет built_at, а значит и sha256
   файла, и уже выложенная на прод база перестала бы совпадать с базой внутри архива — ровно то
   расхождение, ради устранения которого всё и затевалось. */
function publishArchive(buildId) {
    const outDir = (process.argv.find(a => a.startsWith('--out=')) || '').slice(6)
        || path.join(__dirname, 'siteroot', 'mobile-data');
    fs.mkdirSync(outDir, { recursive: true });
    const outGz = path.join(outDir, 'dg.db.gz');
    const t = Date.now();
    const tmpDir = path.join(outDir, `.offline-tmp-${process.pid}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
        /* What the apps download is no longer byte-for-byte the server's dg.db: the rows of
           OFFLINE_EXCLUDED_TRANSLATORS stay on the server (owner via Pablo, 2026-10-29: "AI убрать
           из всего офлайн"). The copy is rebuilt from dg.db (same schema, rowids and fts of its own)
           rather than DELETE + VACUUM, because VACUUM may renumber the rowids that the external-content
           fts points at. Its build_id is the copy's own content hash, written into its meta as before. */
        const full = writeOfflineDb(path.join(tmpDir, 'dg.db'), 'all', '1', [], true);
        console.log(`offline copy of build ${buildId}: ${full.buildId}, ${full.segments} rows`);
        const gz = gzipAtomic(full.file, outGz);

        // Только file_gz, без file: клиент предпочитает несжатый файл, когда объявлены оба (его можно
        // докачать после обрыва). Здесь выбран вес — 216 МБ против 595, ценой рестарта при обрыве.
        writeAtomic(path.join(outDir, 'db-manifest.json'), {
            schema_version: 1,
            build_id: full.buildId,
            langs: 'all',
            fts: 'trigram',
            source: path.basename(OUT_PATH),
            built_at: new Date().toISOString(),
            file_gz: path.basename(outGz),
            bytes_gz: gz.bytes,
            bytes: full.bytes,
            sha256: full.sha256,
        });
        console.log(`published: ${(gz.bytes / 1048576).toFixed(1)} МБ из ${(full.bytes / 1048576).toFixed(1)} ` +
                    `(${(full.bytes / gz.bytes).toFixed(1)}x, ${((Date.now() - t) / 1000).toFixed(0)}с) → ${outDir}`);

        // Once packs are published here they are rebuilt with every publish: left alone, the manifest would keep
        // readers on packs cut from an older dg.db.
        if (process.argv.includes('--packs') || fs.existsSync(path.join(outDir, 'packs-manifest.json'))) {
            publishPacks(outDir, tmpDir, buildId, full.segments);
        }
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

/* Rows that never leave the server: the reader shows them online (/ai), the offline copies and
   packs do not carry them at all, neither in texts nor in fts (owner via Pablo, 2026-10-29). */
const OFFLINE_EXCLUDED_TRANSLATORS = ['ai', 'bw'];
// Languages with a pack of their own; every other translation language goes into tr-small
// (sr included: owner, 2026-10-29).
const PACK_OWN_LANGS = ['en', 'de', 'ru', 'th'];
const BASE_TABLES = ['suttas', 'html', 'vocab'];

/* One offline database cut from dg.db: texts WHERE `where` (minus the excluded translators), the
   same table/index/fts definitions as dg.db (read from its sqlite_master, not restated here, so a
   pack can never drift from the server schema), rowids of its own (1..n in dg.db's order: dg.db's
   rowids interleave languages, so any corpus change would shift them in every pack and change every
   pack's build_id), and an fts filled the way build()
   fills it — folded text, never 'rebuild', no UNINDEXED_TRANSLATORS. `withBase` adds suttas/html/
   vocab: the main pack, which the client opens first. */
function writeOfflineDb(file, packId, where, params, withBase) {
    fs.rmSync(file, { force: true });
    const src = new DatabaseSync(`file:${OUT_PATH}?mode=ro`, { readOnly: true });
    const schema = src.prepare('SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL').all();
    const parent = src.prepare("SELECT value FROM meta WHERE key = 'build_id'").get()?.value || null;
    src.close();
    const tables = new Set(['texts', 'fts', 'meta', ...(withBase ? BASE_TABLES : [])]);
    const mine = schema.filter(s => tables.has(s.tbl_name) && !/^fts_/.test(s.name));

    const db = new DatabaseSync(file);
    db.function('fts_fold', { deterministic: true },
        s => stripSearchPunctuation(s || '').replace(/ё/g, 'е').replace(/Ё/g, 'Е'));
    for (const s of mine) if (s.type === 'table') db.exec(s.sql);
    db.prepare('ATTACH ? AS s').run(`file:${OUT_PATH}?mode=ro`);
    const ex = OFFLINE_EXCLUDED_TRANSLATORS.map(() => '?').join(',');
    db.exec('BEGIN');
    db.prepare(
        `INSERT INTO texts (sutta_id, segment_id, ord, kind, lang, translator, source, txt)
         SELECT sutta_id, segment_id, ord, kind, lang, translator, source, txt FROM s.texts
         WHERE (${where}) AND (translator IS NULL OR translator NOT IN (${ex})) ORDER BY rowid`
    ).run(...params, ...OFFLINE_EXCLUDED_TRANSLATORS);
    if (withBase) for (const t of BASE_TABLES) db.exec(`INSERT INTO ${t} SELECT * FROM s.${t}`);
    db.exec('COMMIT');
    db.exec('DETACH s');
    const un = [...UNINDEXED_TRANSLATORS];
    db.prepare(
        `INSERT INTO fts(rowid, txt) SELECT rowid, fts_fold(txt) FROM texts
         WHERE translator IS NULL OR translator NOT IN (${un.map(() => '?').join(',')})`
    ).run(...un);
    for (const s of mine) if (s.type === 'index') db.exec(s.sql);
    db.exec('ANALYZE');
    const segments = db.prepare('SELECT count(*) c FROM texts').get().c;
    const texts = db.prepare('SELECT count(DISTINCT sutta_id) c FROM texts').get().c;
    db.close();

    // build_id = content hash before meta goes in (as writeMeta does): the same rows give the same
    // id, so a client re-downloads a pack only when its content changed.
    const buildId = sha256File(file, `v1|${packId}|`).slice(0, 16);
    const m = new DatabaseSync(file);
    const ins = m.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
    for (const [k, v] of [['schema_version', '1'], ['build_id', buildId], ['pack_id', packId],
        ['langs', packId === 'all' ? 'all' : packId], ['fts', 'trigram'], ['source', path.basename(OUT_PATH)],
        ['parent_build_id', parent || ''], ['built_at', new Date().toISOString()]]) ins.run(k, v);
    m.close();
    return { file, buildId, parent, segments, texts, bytes: fs.statSync(file).size, sha256: sha256File(file) };
}

function sha256File(file, prefix = '') {
    const h = crypto.createHash('sha256').update(prefix);
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.allocUnsafe(1 << 20);
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
    fs.closeSync(fd);
    return h.digest('hex');
}

/* Во временный файл, потом rename. Прямая запись обрезала бы живой архив в первую же
   миллисекунду, а gzip наполняет его минуты — всё это время посетители качали бы огрызок,
   причём манифест ещё обещал бы старый sha256, так что проверка падала бы у них уже после
   200 МБ. rename в пределах одной ФС атомарен: читатель видит либо старый архив целиком,
   либо новый целиком. Манифест пишется последним. -n: no name/time in the header, so the same
   db gives the same archive bytes (sha256_gz). */
function gzipAtomic(src, outGz) {
    const tmpGz = `${outGz}.tmp-${process.pid}`;
    try {
        const out = fs.openSync(tmpGz, 'w');
        try {
            execFileSync('gzip', ['-6', '-n', '-c', src], { stdio: ['ignore', out, 'inherit'] });
        } finally {
            fs.closeSync(out);
        }
        const res = { bytes: fs.statSync(tmpGz).size, sha256: sha256File(tmpGz) };
        fs.renameSync(tmpGz, outGz);
        return res;
    } catch (e) {
        fs.rmSync(tmpGz, { force: true }); // не оставляем половину архива занимать место
        throw e;
    }
}

function writeAtomic(file, obj) {
    fs.writeFileSync(`${file}.tmp-${process.pid}`, JSON.stringify(obj, null, 2) + '\n');
    fs.renameSync(`${file}.tmp-${process.pid}`, file);
}

/* --packs: the offline library as packs the person picks in Settings (owner 2026-10-29, agreed with
   the app client in public/offline/db-worker.js): root-ms is the main db and carries the base
   tables, each other pack is opened with ATTACH. Every pack is read-only and comes with its fts
   ready, nothing is indexed on the device. packs-manifest.json is what switches the client from
   the single dg.db.gz to packs, so it is written last and only when this flag is given. */
function publishPacks(outDir, tmpDir, buildId, fullSegments) {
    const t = Date.now();
    const src = new DatabaseSync(`file:${OUT_PATH}?mode=ro`, { readOnly: true });
    const ex = OFFLINE_EXCLUDED_TRANSLATORS.map(() => '?').join(',');
    const langs = src.prepare(
        `SELECT lang, count(*) n FROM texts WHERE kind = 'translation'
         AND (translator IS NULL OR translator NOT IN (${ex})) GROUP BY lang ORDER BY n DESC, lang`
    ).all(...OFFLINE_EXCLUDED_TRANSLATORS).map(r => r.lang);
    src.close();
    const own = PACK_OWN_LANGS.filter(l => langs.includes(l));
    const small = langs.filter(l => !own.includes(l));
    const defs = [
        { id: 'root-ms', kind: 'root', lang: 'pli', edition: 'ms', main: true, required: true, default: true,
          has_vocab: true, where: "kind IN ('root', 'variant')", params: [], base: true },
        ...own.map(l => ({ id: `tr-${l}`, kind: 'translation', lang: l,
          where: "kind = 'translation' AND lang = ?", params: [l] })),
        { id: 'tr-small', kind: 'translation', langs: small,
          where: `kind = 'translation' AND lang IN (${small.map(() => '?').join(',')})`, params: small },
    ];
    const packDir = path.join(outDir, 'packs');
    fs.mkdirSync(packDir, { recursive: true });
    const packs = [];
    for (const d of defs) {
        const r = writeOfflineDb(path.join(tmpDir, `${d.id}.db`), d.id, d.where, d.params, !!d.base);
        // Named by build: one URL never serves two contents, so a cached old file (mobile-data is
        // cached for hours) or a Range resume cannot mix builds.
        const name = `${d.id}.${r.buildId}.db.gz`;
        const gz = gzipAtomic(r.file, path.join(packDir, name));
        fs.rmSync(r.file, { force: true });
        const { where, params, base, ...pub } = d;
        packs.push({ ...pub, texts: r.texts, segments: r.segments, fts: 'trigram', bytes: r.bytes,
            bytes_gz: gz.bytes, sha256: r.sha256, sha256_gz: gz.sha256, url: `packs/${name}`, build_id: r.buildId });
        console.log(`pack ${d.id}: ${r.segments} rows, ${(r.bytes / 1048576).toFixed(0)} MB, gz ${(gz.bytes / 1048576).toFixed(0)} MB`);
    }
    // Every row of the offline copy is in exactly one pack: a row left out would silently vanish offline.
    const sum = packs.reduce((a, p) => a + p.segments, 0);
    if (sum !== fullSegments) throw new Error(`packs hold ${sum} rows, the offline copy ${fullSegments}`);
    const manifestFile = path.join(outDir, 'packs-manifest.json');
    let before = [];
    try { before = JSON.parse(fs.readFileSync(manifestFile, 'utf8')).packs.map(p => path.basename(p.url)); } catch { /* first publish */ }
    writeAtomic(manifestFile, {
        schema: 1, db_schema_version: 1, build_id: buildId, built_at: new Date().toISOString(), packs,
    });
    // Files the manifest no longer names go a day after they left it: a reader who fetched the previous
    // manifest may still be downloading them. Leaving is stamped as the file's mtime.
    const keep = new Set(packs.map(p => path.basename(p.url)));
    for (const f of fs.readdirSync(packDir)) {
        const file = path.join(packDir, f);
        if (keep.has(f)) continue;
        if (before.includes(f)) fs.utimesSync(file, new Date(), new Date());
        else if (Date.now() - fs.statSync(file).mtimeMs > 86400e3) fs.rmSync(file, { force: true });
    }
    console.log(`packs: ${packs.length} → ${packDir} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
}

/* sutta_words.txt — список для автоподсказок в самом поле поиска (autopali.js). Пишется здесь,
   а не отдельным скриптом: данные те же самые и уже в руках, а отдельный скрипт означал бы второй
   вход, чтение vocab обратно из базы и правило "запускать строго после сборки", которое однажды
   забудут. Владелец: "что-то дописывается отдельно можно это все собрать централизовать".

   Отдаётся как override-копия (public/overrides → /assets), легаси-файл в старом репо не трогаем:
   его читает ещё и PHP-сайт. Из него же берутся первый и последний блоки — кураторские фразы
   (37 факторов пробуждения, четыре истины) и id текстов с названиями. Они написаны руками и из
   корпуса не выводятся; из корпуса выводится только средний, словарный блок. */
const LEGACY_WORDS = process.env.DG_LEGACY_WORDS || '/var/www/html/assets/texts/sutta_words.txt';
const OUT_WORDS = path.join(__dirname, 'public', 'overrides', 'texts', 'sutta_words.txt');
const WORD_LINE = /^\S+ \d+$/;

function writeSuttaWords(df, expected) {
    const t = Date.now();
    let legacy;
    try {
        legacy = fs.readFileSync(LEGACY_WORDS, 'utf8').split('\n');
    } catch {
        console.log(`sutta_words: пропущен, нет ${LEGACY_WORDS}`);
        return;
    }
    const firstWord = legacy.findIndex(l => WORD_LINE.test(l));
    const lastWord = legacy.length - 1 - [...legacy].reverse().findIndex(l => WORD_LINE.test(l));
    if (firstWord < 0) throw new Error(`${LEGACY_WORDS}: не нашёл ни одной словарной строки "слово N"`);

    /* Порядок строк = порядок подсказок: autopali.js отдаёт совпадения в порядке файла. Легаси-файл
       был по алфавиту, и на большом списке это топит нужное — на "satipa" первым шёл satipaññañca
       (1 вхождение), а satipaṭṭhānā уезжала вниз. Частота вперёд: то, что человек ищет, почти
       всегда частотнее того, чего он не ищет. Внутри одинаковой частоты — по алфавиту без
       диакритики, чтобы ā стояла рядом с a, а не после z, куда её отправила бы сортировка по кодам. */
    const bare = w => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const words = [];
    for (const [word, n] of df) {
        if (paliSkel(word).length < 3) continue; // тот же отсев, что и в vocab
        words.push([word, n, bare(word)]);
    }
    words.sort((a, b) => (b[1] - a[1]) || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0)
        || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    if (words.length !== expected) throw new Error(`sutta_words: ${words.length} слов против ${expected} в vocab`);

    const out = legacy.slice(0, firstWord)
        .concat(words.map(w => `${w[0]} ${w[1]}`), legacy.slice(lastWord + 1))
        .join('\n');
    fs.mkdirSync(path.dirname(OUT_WORDS), { recursive: true });
    fs.writeFileSync(OUT_WORDS, out);
    console.log(`sutta_words: ${words.length} форм, ${(Buffer.byteLength(out) / 1048576).toFixed(1)} МБ (${Date.now() - t}ms)`);
}

/* meta — часть базы, а не отдельная сборка. Офлайн-клиент (public/offline/db-worker.js) после
   распаковки читает `SELECT key, value FROM meta` и сверяет build_id с именем, под которым
   сохранил файл: база без этих строк отвергается как незавершённое скачивание. Раньше таблицу
   дописывал сборщик урезанной копии (build-mobile-db.js), из-за чего баз было две. Теперь она
   одна: dg.db и есть то, что раздаётся (в сжатом виде, publish-offline-db.js).

   build_id считается по содержимому готовой базы ДО вставки самих строк — иначе он зависел бы
   от себя. Одинаковый корпус даёт одинаковый id, и клиент не перекачивает то же самое. */
function writeMeta(db) {
    const h = crypto.createHash('sha256').update('v1|all|');
    const fd = fs.openSync(OUT_PATH, 'r');
    const buf = Buffer.allocUnsafe(1 << 20);
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
    fs.closeSync(fd);
    const buildId = h.digest('hex').slice(0, 16);

    db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID');
    const ins = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
    for (const [k, v] of [
        ['schema_version', '1'],
        ['build_id', buildId],
        ['langs', 'all'],
        ['fts', 'trigram'],
        ['source', path.basename(OUT_PATH)],
        ['built_at', new Date().toISOString()],
    ]) ins.run(k, v);
    console.log(`meta: build ${buildId}`);
    return buildId;
}

/* vocab — словарь словоформ пали из самого корпуса, для подсказки "может быть, вы искали"
   (core/search-core.js → suggestWords). Смысл в том, что подсказки берутся не из словаря, а из
   текстов: каждую предложенную форму гарантированно можно найти поиском, потому что она там есть.

   Владелец: "нам же нужно это делать только на pali тексты... только на четыре никая... и шесть книг КН
   максимум". Именно так и берётся — по DEFAULT_SCOPE_PREFIXES, тому же списку, по которому ищет
   дефолтный поиск, и тем же предикатом matchesScope.

   Почему не весь pli/%: сначала я взял все пали-корни — и в подсказки полезли слова из джатак,
   винаи и абхидхаммы (владелец заметил живьём: kacchapajātaka, и монстр на 60 букв оттуда же).
   Подсказать слово, по которому дефолтный поиск вернёт ноль — хуже, чем не подсказать ничего.
   Счётчик df по той же причине считается только внутри этого же scope. lzh/san/pra исключены: это не пали. */
function writeVocab(db, df) {
    const t = Date.now();
    db.exec(`
        DROP INDEX IF EXISTS idx_vocab_skel; -- был в первой версии, никто им не пользовался
        DROP TABLE IF EXISTS vocab;
        -- Без индекса по skel: читатели берут либо всю таблицу сразу (loadVocab в search-core.js
        -- строит свою Map в памяти), либо одну строку по word, а это и есть первичный ключ.
        CREATE TABLE vocab (word TEXT PRIMARY KEY, skel TEXT, df INTEGER) WITHOUT ROWID;
    `);
    const ins = db.prepare('INSERT INTO vocab VALUES (?,?,?)');
    db.exec('BEGIN');
    let kept = 0;
    for (const [word, n] of df) {
        const skel = paliSkel(word);
        if (skel.length < 3) continue; // nothing to fuzzy-match against, and huge useless buckets
        ins.run(word, skel, n);
        kept++;
    }
    db.exec('COMMIT');
    console.log(`vocab: ${kept} pali word forms (${Date.now() - t}ms)`);
    return kept;
}

if (process.argv.includes('--no-build')) {
    // Публикуем то, что уже собрано. build_id берём из самой базы — единственного места, где он
    // есть; никаких предположений о том, что это за файл.
    const db = new DatabaseSync(`file:${OUT_PATH}?mode=ro`, { readOnly: true });
    let buildId = null;
    try {
        buildId = db.prepare("SELECT value FROM meta WHERE key = 'build_id'").get()?.value || null;
    } catch { /* база собрана сборщиком без meta */ }
    db.close();
    if (!buildId) {
        console.error(`в ${OUT_PATH} нет meta.build_id — соберите базу: npm run build-search-db`);
        process.exit(1);
    }
    console.log(`публикуем готовую базу, build ${buildId}`);
    publishArchive(buildId);
} else if (process.argv.includes('--finish')) {
    // The last two steps of build() on a dg.db whose build was stopped after "sutta_words" (the
    // server killed it for low memory, 2026-09-14): statistics and meta. Everything before them is
    // already in the file — only valid for a build that got that far. Same order as build(): meta
    // hashes the file after ANALYZE.
    const db = new DatabaseSync(OUT_PATH);
    db.exec('ANALYZE');
    writeMeta(db);
    db.close();
    console.log(`${OUT_PATH}: ${(fs.statSync(OUT_PATH).size / 1048576).toFixed(1)} MB, finished`);
} else {
    build();
}
