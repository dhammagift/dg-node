// search-core.js — the search, reader and word-report layer, lifted out of dg-fastify.js.
//
// This is the code that turns a query into an answer: keyword normalisation and folding, the
// FTS5/SQLite match, scope resolution, translator selection, context windows, the word report,
// and the reader's full-text assembly. It contains no HTTP: dg-fastify.js keeps the routes, the
// query-string parsing and the status codes, and calls in here.
//
// It was moved so there can be ONE implementation of it. The offline app used to answer the same
// endpoints from its own SQLite with its own code, and the two drifted — different result counts,
// a search that could not find a word inside a compound, translator selection that collapsed to
// one per language. The app now reads a slice of the same dg.db this reads, so it can run this
// same module instead of a second interpretation of it.
//
// The move was mechanical on purpose: the body below is the original text of dg-fastify.js lines
// 924-1901, unchanged apart from the three things that could not survive a move —
// require paths for configs (one directory up), __dirname for the same reason, and the three
// values it used to read from module scope, which now arrive through init()/setSkeleton().
// Behaviour is pinned by test/snapshots: the same 24 requests answer identically before and after.

const fsSync = require('fs');
const path = require('path');

// searchDb is the open dg.db handle; skeletonDB is the in-memory sutta index, which is rebuilt
// after the database is (re)loaded, so it arrives through a setter rather than being captured
// once. DG_OFFLINE is used only to reconstruct the "which tree did this translation come from"
// path that filterPreferredTranslators still decides on.
let searchDb = null;
let skeletonDB = {};
let DG_OFFLINE = '';

function init(deps) {
    searchDb = deps.searchDb;
    DG_OFFLINE = deps.DG_OFFLINE;
    registerRegexpTest();
}

function setSkeleton(skeleton) {
    skeletonDB = skeleton;
}

const TRANSLATOR_PRIORITY = require('../configs/reader/translator-priority.json');

// Единственный источник истины для "что значит режим single/multiTran/multiLang/memorize/
// devanagari" — раньше эту логику (columns/multiFor на каждый режим) дублировал клиент
// (MODE_CONFIGS в reader-template.html), теперь резолвится здесь, клиент просто шлёт ?mode=
// (см. /api/text/:suttaId). Owner: режим — это ТОЛЬКО поведенческий флаг (multiFor/dualScript/
// mnemonic), язык режим больше не хранит вообще — язык это отдельная ось (?lang=/?langs=), не
// хардкод в этом файле.
const MODE_TABLE = require('../configs/reader/mode-table.json');

// TOC/navigator: top-level book list (bilingual labels, one small file, see comment inside)
// and the interlinear-vs-literary translator classification (see /api/toc/book/:code below).
const TOC_BOOKS = require('../configs/reader/toc-books.json');
const TRANSLATOR_TYPES = require('../configs/reader/translator-types.json');
const INTERLINEAR_TRANSLATOR_KEYS = new Set(TRANSLATOR_TYPES.interlinear || []);

// Каждый код оглавления — книга, «лишняя» книга или собрание ("kn") — чтобы /:slug в конце файла
// мог отличить узел оглавления от поисковой строки и увести в /toc/<code>.
const TOC_CODES = new Set(Object.entries(TOC_BOOKS)
    .filter(([key]) => key !== '_comment')
    .flatMap(([, cat]) => [
        ...(cat.books || []),
        ...(cat.extraBooks || []),
        ...(cat.groups || []).flatMap(g => [g, ...(g.books || []), ...(g.extraBooks || [])]),
    ])
    .map(b => b.code));

// Интерфейсные языки, которые реально поддерживает сайт — сканируется из configs/reader/
// lang_*.json при старте (тот же приём auto-discovery, что и siteroot/, см. CLAUDE.md), а не
// зашитый список. Растёт сам, когда кто-то кладёт новый lang_de.json — правка кода не нужна.
// Используется клиентом только для дефолта multiLang при первом заходе (без сохранённого
// dgReadingLangOrder) — "текущий язык + следующий доступный", см. megareader.js buildSutta().
const READER_LANGS = fsSync.readdirSync(path.join(__dirname, '..', 'configs', 'reader'))
    .filter(f => /^lang_[a-z]+\.json$/.test(f))
    .map(f => f.match(/^lang_([a-z]+)\.json$/)[1])
    .sort();

function filterPreferredTranslators(results, multiForLangs) {
    const multiSet = new Set(multiForLangs || []);
    const byLang = {};
    for (const key of Object.keys(results)) {
        const lang = key.split('_')[0];
        if (!byLang[lang]) byLang[lang] = [];
        byLang[lang].push(key);
    }

    const filtered = {};
    for (const [lang, keys] of Object.entries(byLang)) {
        const priorities = TRANSLATOR_PRIORITY[lang];
        let chosen = priorities && priorities.find(p => keys.includes(p));

        if (!chosen && lang === 'en') {
            // Sujato и так широко доступен на SuttaCentral — если есть другой переводчик
            // (Thanissaro и т.п.), предпочитаем его; sujato берём только если больше никого нет.
            chosen = keys.find(k => k !== 'en_sujato');
        }

        // Язык без записи в TRANSLATOR_PRIORITY (сейчас только будущие языки вроде тайского) —
        // вместо произвольного keys[0] (порядок вставки для языка без приоритета: dgother → sc →
        // dgmain, dgmain пишется ПОСЛЕДНИМ — значит keys[0] обычно НЕ dgmain) предпочитаем
        // переводчика из основной DG-папки языка (DG_OFFLINE/{lang}/, не {lang}_other/ и не SC) —
        // по ПАПКЕ, а не по имени файла (у нового языка переводчик DG не обязан называться "o").
        if (!chosen) {
            const dgMainDir = path.join(DG_OFFLINE, lang).replace(/\\/g, '/') + '/';
            chosen = keys.find(k => {
                const p = results[k];
                return !!p && p.replace(/\\/g, '/').startsWith(dgMainDir);
            });
        }

        if (!chosen) chosen = keys[0];
        filtered[chosen] = results[chosen];

        if (multiSet.has(lang)) {
            // Режим mt/ee (два перевода одного языка) — второй переводчик берётся из
            // {lang}_other ("второе мнение" проекта), КТО БЫ там реально ни лежал для этой
            // конкретной сутты, а не хардкод конкретного имени (ru_o+ru_khantibalo были
            // захардкожены раньше — неверно, если хантибало не переводил именно этот текст).
            // Если в {lang}_other ничего нет — берём любого другого доступного переводчика,
            // чтобы режим не схлопывался в одну колонку без необходимости.
            const isFromOtherDir = k => {
                const p = results[k];
                return !!p && p.replace(/\\/g, '/').includes(`/${lang}_other/`);
            };
            const secondary = keys.find(k => k !== chosen && isFromOtherDir(k))
                || keys.find(k => k !== chosen);
            if (secondary) filtered[secondary] = results[secondary];
        }
    }
    return filtered;
}

// Приоритет источников по языку — от САМОГО приоритетного к наименее (так задал
// пользователь). Используется в обратном порядке как порядок ЗАПИСИ (см.
// collectForLang) — кто пишет последним, тот и побеждает при совпадении
// transKey (ru_sv/ru_khantibalo/ru_narinyanievmenenko физически лежат и в
// SC-зеркале, и в DG-other одновременно). ru: DG — почти всегда доверенный
// авторский текст, DG-other важнее сырого SC-зеркала. en: SC хостит десятки
// признанных переводчиков, важнее единственного DG-other (thanissaro).
const SOURCE_PRIORITY = {
    ru: ['dgmain', 'dgother', 'sc'],
    en: ['dgmain', 'sc', 'dgother'],
};
// Язык без явной записи (сайт сейчас только ru/en, задел на будущее) — DG-main
// первым, если появится, дальше произвольно; SC перед DG-other как более
// широкий источник по умолчанию.
const DEFAULT_SOURCE_PRIORITY = ['dgmain', 'sc', 'dgother'];








// Гибрид: buildTranslationIndex платит фиксированную цену (обход ВСЕГО языкового каталога)
// один раз, независимо от числа сутт — окупается только когда сутт много (для 785 сутт это
// быстрее в разы). Для обычной страницы (десятки сутт) эта фиксированная цена — единственное,
// что видит запрос: 46 секунд на 3-сутточный батч при полном обходе, потому что деревья
// SC_TRANS/ru и SC_TRANS/en покрывают ВЕСЬ корпус целиком. Точечный findTranslationFiles на
// каждую сутту (обход дерева, где findFilesByPrefix ищет конкретный префикс)
// быстрее для маленьких батчей, потому что каждый вызов недорогой сам по себе. Порог подобран
// эмпирически (30 в профилировании — типичный размер страницы — быстро точечно; 785 — быстрее
// батчево); при желании можно уточнить дальше.
const TRANSLATION_INDEX_THRESHOLD = 80;

// root/variant grep (enrichSuttaBatch) больше не нужен отдельный threshold-гибрид — resolveScopeDirs
// (см. выше buildMatchSkeleton) даёт заранее узкий, кешированный список директорий по scope,
// одинаково дешёвый для любого размера батча (не весь SC_ROOT/SC_VARIANT, но и не по файлу на сутту).




function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// Общий хвост buildWordReport/buildWordReportFast — оба насчитывают одну и ту же форму
// words{word: {textIds, matchCount, links}} разными способами (полный grep-отчёт против
// быстрого regex по уже найденным сегментам), но сериализуют и сортируют её одинаково.
function finalizeWordReport(words) {
    const report = Object.entries(words).map(([word, info]) => ({
        word,
        textCount: info.textIds.size,
        matchCount: info.matchCount,
        links: Array.from(info.links.entries()).map(([sutta_id, segment]) => ({ sutta_id, segment }))
    }));

    report.sort((a, b) => {
        if (b.textCount !== a.textCount) return b.textCount - a.textCount;
        return a.word.localeCompare(b.word, undefined, { sensitivity: 'base' });
    });

    return report;
}

// Отчёт с группировкой по словам — та же идея, что в легаси new/words.sh (grep по словам,
// группировка по уникальному слову вместо суттs), но без повторного grep: агрегируем
// уже собранные по каждой сутте сегменты (root_text/variant/unique_words) из buildSearchResponse.
// Одна ссылка на сутту в links (не на каждый сегмент), как в легаси-отчёте.
function buildWordReport(searchResults) {
    const words = {}; // word -> { textIds: Set<suttaId>, matchCount, links: Map<suttaId, segmentId> }

    for (const suttaId in searchResults) {
        const suttaRes = searchResults[suttaId];
        for (const seg of suttaRes.segments) {
            const combinedText = `${seg.root_text || ''} ${seg.variant || ''}`;
            if (!combinedText.trim()) continue;

            for (const word of suttaRes.unique_words) {
                const matches = combinedText.match(new RegExp(escapeRegExp(word), 'gi'));
                if (!matches) continue;

                if (!words[word]) {
                    words[word] = { textIds: new Set(), matchCount: 0, links: new Map() };
                }
                words[word].textIds.add(suttaId);
                words[word].matchCount += matches.length;
                if (!words[word].links.has(suttaId)) {
                    words[word].links.set(suttaId, seg.segment);
                }
            }
        }
    }

    return finalizeWordReport(words);
}

// A keyword containing any of these is treated as a regular expression, the power-user search
// path — everything else is a literal and goes through the FTS index (see the SQLite core
// below).

const REGEX_METACHARS = /[.*+?^${}()|[\]\\]/;


// Punctuation a person routinely pastes in from a translation (commas, quotes, colons…) that
// should never need to be typed back exactly to find a match — stripped once at the request door
// so grep/regex counting/cache-key/history all agree. Deliberately excludes regex-metacharacter
// punctuation (. ? * + ^ $ { } ( ) | [ ] \) — that stays meaningful for the power-user regex path.
const SEARCH_PUNCTUATION = /[,;:!"'“”‘’«»]/g;
function stripSearchPunctuation(keyword) {
    return keyword.replace(SEARCH_PUNCTUATION, '').trim();
}

// Owner: е/ё (Russian) and m/ṁ/ṃ (Pali niggahita — same sound, written differently depending on
// keyboard/edition) must be treated as the same character everywhere a keyword becomes a
// text-matching pattern — grep's own match AND the JS regexes that re-count/extract text
// server-side (buildWordReportFast/enrichSuttaBatch) must agree, or a fold-only match would be
// found by grep but then undercounted or missing from the words report. `changed` tells the grep
// caller a character class was introduced, so it knows -F (fixed-string) is no longer safe.
// Skipped whenever the keyword already has regex metacharacters — that's the power-user regex
// path (see the invalid-regex error handling above), folding could corrupt deliberate syntax.
const SEARCH_FOLD_GROUPS = [['е', 'ё'], ['m', 'ṁ', 'ṃ']];




// ---------------------------------------------------------------------------
// SQLite/FTS5 search core — dg.db, built by build-search-db.js.
//
// This replaces the grep engine the file used to carry. Measured on the live corpus:
// /search?q=dukkha took ~42s through grep, of which raw grep was only ~0.5s — the other 41.5s
// was re-reading JSON files to enrich the hits. Here the enrichment reads the same indexed
// table as the match, so the whole request is ~0.1s.
//
// The index is trigram rather than unicode61 so that MATCH keeps grep's substring semantics
// ("kacchapa" finds "mahākacchapa"). Its one hard floor is three characters, which
// MIN_KEYWORD_LENGTH already enforces before any of this runs.
//
// The short-lived skeletonCache that used to sit here is gone: it existed only to stop the
// phased client (?fast=1, then the full /search, then /search/enrich) from paying for three
// full-corpus greps. Three indexed queries are cheaper than the deep-clone the cache needed.

const SQL_MATCH = `SELECT t.sutta_id, t.segment_id, t.ord, t.kind, t.lang, t.translator, t.txt
    FROM fts JOIN texts t ON t.rowid = fts.rowid WHERE fts MATCH ?`;
// The regex path cannot use the index, so it scans — but the matching happens inside SQLite via
// the function registered below, not by materialising all 1.4M rows as JS objects and filtering
// them. Measured on `kacchapa|migala`: 167s materialising, 5.1s this way. The cheap translator
// check comes first so hidden rows never reach the regex.
const SQL_SCAN = `SELECT sutta_id, segment_id, ord, kind, lang, translator, txt FROM texts
    WHERE (translator IS NULL OR translator <> 'ai') AND regexp_test(?, txt)`;

// Called once per row, so the compiled RegExp is memoised on its source instead of being rebuilt
// a million times.
let scanRegexp = { source: null, compiled: null };
// Registered from init(), not here: the database only exists once the host hands it over, and at
// module-load time searchDb is still null. Same function, same moment relative to the first
// query — only the trigger moved.
function registerRegexpTest() {
    searchDb.function('regexp_test', { deterministic: true }, (pattern, text) => {
        if (scanRegexp.source !== pattern) {
            scanRegexp = { source: pattern, compiled: new RegExp(pattern, 'i') };
        }
        return scanRegexp.compiled.test(text) ? 1 : 0;
    });
}

// The FTS index stores a ё-folded copy (see build-search-db.js), so the query has to be folded
// the same way. Diacritics need no help here — the tokenizer folds those on both sides.
function ftsPhrase(keyword) {
    return `"${keyword.replace(/ё/g, 'е').replace(/Ё/g, 'Е').replace(/"/g, '""')}"`;
}

// Length-preserving fold approximating what the tokenizer does (strip diacritics, ё→е), used by
// the JS-side match counting and word extraction. Length-preserving matters: match offsets in
// the folded string have to line up with the original so the real word form ("kacchapānaṁ", not
// "kacchapanam") can still be sliced out of it for unique_words.
const foldCharCache = new Map();
function foldChar(ch) {
    let folded = foldCharCache.get(ch);
    if (folded === undefined) {
        const stripped = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
        folded = stripped.length === 1 ? stripped : ch.toLowerCase();
        if (folded.length !== 1) folded = ch;
        if (folded === 'ё') folded = 'е';
        foldCharCache.set(ch, folded);
    }
    return folded;
}

// Only non-ASCII and uppercase need touching, and a native replace beats accumulating the string
// character by character — this runs over every matched segment of every result.
const FOLDABLE_CHARS = /[A-Z\u0080-\uFFFF]/g;

function foldText(text) {
    return text.replace(FOLDABLE_CHARS, foldChar);
}

// Two memos, because a single answer needs both sets and the phased client asks for the same
// keyword three times within a couple of seconds (?fast=1, the full answer, /search/enrich).
// No TTL: the database is opened read-only and does not change while the process runs.
let lastKeywordRows = { keyword: null, rows: null };
let lastExactRows = { keyword: null, rows: null };

// Every row that contains the keyword anywhere, BEFORE the whole-word filter. Two paths, one
// output shape:
//   plain keyword -> FTS5 MATCH (the fast case);
//   regex keyword -> full scan filtered by the same RegExp that grep -E used to be handed.
// ponytail: the regex branch still scans the whole corpus — a few seconds, not milliseconds —
// because FTS5 cannot express alternation or anchors. Upgrade path if it ever matters: pull the
// literal substrings out of the pattern, use them as an FTS pre-filter, and run the regex only
// over what survives.
function sqlKeywordRows(keyword) {
    if (lastKeywordRows.keyword === keyword) return lastKeywordRows.rows;
    let rows;
    if (REGEX_METACHARS.test(keyword)) {
        // Validate here rather than a million rows deep inside the scan, and report it as bad
        // input rather than a server fault — the pattern came from the query string.
        try {
            new RegExp(keyword);
        } catch (e) {
            const err = new Error(e.message); // already reads "Invalid regular expression: ..."
            err.badRequest = true;
            throw err;
        }
        rows = searchDb.prepare(SQL_SCAN).all(keyword);
    } else {
        rows = searchDb.prepare(SQL_MATCH).all(ftsPhrase(keyword));
    }
    lastKeywordRows = { keyword, rows };
    return rows;
}

function sqlMatchRows(keyword, exactMatch) {
    const rows = sqlKeywordRows(keyword);
    if (!exactMatch) return rows;
    if (lastExactRows.keyword === keyword) return lastExactRows.rows;
    // MATCH is a substring test; grep -w additionally demanded whole words. Cheaper to apply that
    // to the matched rows than to push word boundaries into a trigram index.
    const bounded = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(foldText(keyword))}(?![\\p{L}\\p{N}_])`, 'u');
    const exact = rows.filter(r => bounded.test(foldText(r.txt)));
    lastExactRows = { keyword, rows: exact };
    return exact;
}

// SQLite's parameter limit is generous but not infinite, and a common word matches thousands of
// segments — every IN (...) below is fed through this.
function* sqlChunks(items, size = 800) {
    for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

function sqlRowsIn(columns, table, column, values, extraSql = '', extraParams = []) {
    const out = [];
    for (const chunk of sqlChunks(values)) {
        const holes = chunk.map(() => '?').join(',');
        out.push(...searchDb.prepare(
            `SELECT ${columns} FROM ${table} WHERE ${column} IN (${holes}) ${extraSql}`
        ).all(...chunk, ...extraParams));
    }
    return out;
}

// "…AND (kind <> 'translation' OR lang IN (?,?))" for the requested languages, or nothing when
// every language was asked for. Without it the window query drags back all 34 translation
// languages per segment and throws away the ones nobody asked for.
function langFilterSql(wantedLangs) {
    if (!wantedLangs) return { sql: '', params: [] };
    const langs = [...wantedLangs];
    return {
        sql: `AND (kind <> 'translation' OR lang IN (${langs.map(() => '?').join(',')}))`,
        params: langs
    };
}

// 4 nikaya + 6 kn books — vinaya is an opt-in resource (via explicit scope), not part of default.
const DEFAULT_SCOPE_PREFIXES = ['dn', 'mn', 'sn', 'an', 'ud', 'snp', 'dhp', 'thag', 'thig', 'iti'];

// Разрешает scope-параметр в список "allowedPrefixes" — category-имена ('dhamma'/'khudakka'/…)
// или id-префиксы ('dn'/'an'/…) для матчинга через matchesScope(). Чистая функция от searchScope,
// без обращения к skeletonDB.
function resolveAllowedPrefixes(searchScope) {
    if (!searchScope || searchScope === 'default') return DEFAULT_SCOPE_PREFIXES;
    if (searchScope === 'all') return ['all'];
    const prefixes = [];
    for (const p of searchScope.split(',').map(s => s.trim())) {
        prefixes.push(...(p === 'default' ? DEFAULT_SCOPE_PREFIXES : [p]));
    }
    return prefixes;
}

// Тот же предикат, что раньше был инлайн в buildMatchSkeleton — сутта проходит под scope, если
// её category ИЛИ id-префикс совпадают с одним из allowedPrefixes.
function matchesScope(suttaMeta, suttaId, allowedPrefixes) {
    if (allowedPrefixes.includes('all')) return true;
    return allowedPrefixes.some(prefix => {
        if (suttaMeta.category === prefix) return true;
        if (suttaId === prefix) return true;
        if (suttaId.startsWith(prefix)) return /[0-9.-]/.test(suttaId.charAt(prefix.length));
        return false;
    });
}

// Разрешает (scope, baseDir) в конкретный список директорий — ОДИН раз за время жизни процесса
// на каждую уникальную пару (skeletonDB статична после старта, TTL не нужен). Работает только для
// деревьев, чья структура повторяет root'а (root/variant — dir_path один и тот же для обоих, см.
// getRootPath/getVariantPath), НЕ для translation/* (там между языком и nikoya есть ещё уровень
// переводчика — translation/en/sujato/sutta/an/…, dir_path туда напрямую не ложится). Для
// переводов используется отдельный, уже существующий и уже эффективный путь —
// findTranslationFilesForBatch/buildTranslationIndex (per-sutta файлы, группировка по dirname).
//
// Только "pli/ms/..." dir_path — НЕ весь skeletonDB. getRootPath/getVariantPath/classifyMatchSource
// (весь остальной код этого файла, не тронуто этой правкой) жёстко предполагают имя файла
// "{suttaId}_root-pli-ms.json"/"_variant-pli-ms.json" — верно почти всегда, но НЕ для не-палийских
// подкорпусов вроде Патна-Дхаммапады (dir_path "pra/pts/sutta/pdhp", файл "..._root-pra-pts.json").
// Раньше это было не видно — старый SC_ROOT-константа физически не покрывала ничего за пределами
// pli/ms, так что эти сутты просто НИКОГДА не участвовали в поиске. Теперь resolveScopeDirs строит
// директории из dir_path напрямую и БЕЗ этого фильтра дотянулся бы и туда — но с неверным
// (root_text/count) результатом, т.к. getRootPath там ищёт несуществующий "_root-pli-ms.json".
// Правильный фикс — обобщить getRootPath/getVariantPath/classifyMatchSource на другие суффиксы;
// это отдельная задача (потенциально несколько соглашений об именовании в корпусе), не в рамках
// текущего перф-фикса. Фильтр здесь сохраняет ТЕКУЩЕЕ (как у SC_ROOT/SC_VARIANT) покрытие —
// не хуже, чем было, без ложных "count: 0" на не-pli/ms текстах.
const scopeDirsCache = new Map();







// Phase 1: find every matching segment and group it per sutta. One indexed query replaces what
// used to be three mutually exclusive grep strategies (explicit file list / Cyrillic-only
// language dirs / Pali-first with a translation fallback). Those existed to keep grep away from
// directories where a match was impossible; an index has no such cost, so the branch is gone.
//
// One deliberate behaviour change comes with that. The old Pali-first branch stopped as soon as
// root/variant produced anything, so for a keyword that appears in Pali, suttas matching only in
// a translation were never found at all. Here every source is searched in the same pass, so
// those suttas now show up.
async function buildMatchSkeleton(keyword, searchScope, exactMatch, targetLangs, lb = 0, la = 0, restrictToIds = null) {
    const isFullScan = !restrictToIds || restrictToIds.length === 0;
    const allowedPrefixes = isFullScan ? resolveAllowedPrefixes(searchScope) : ['all'];
    const restrict = isFullScan ? null : new Set(restrictToIds);
    // targetLangs are language codes ("ru"), while a row carries the language of its file — the
    // "_other" suffix is a source directory, not a language, and never appears in texts.lang.
    const wantedLangs = targetLangs.includes('all')
        ? null
        : new Set(targetLangs.map(l => l.split('_')[0]));

    const searchResults = {};
    // Side index instead of scanning suttaRes.segments for each row: a common word matches
    // hundreds of segments in one sutta, and the linear find made that quadratic. It stays out
    // of searchResults because that object is serialised straight into the response.
    const segIndex = new Map();
    let anyMatch = false;

    for (const row of sqlMatchRows(keyword, exactMatch)) {
        const suttaMeta = skeletonDB[row.sutta_id];
        if (!suttaMeta) continue;
        if (restrict ? !restrict.has(row.sutta_id) : !matchesScope(suttaMeta, row.sutta_id, allowedPrefixes)) continue;
        if (row.kind === 'translation' && wantedLangs && !wantedLangs.has(row.lang)) continue;

        anyMatch = true;
        let suttaRes = searchResults[row.sutta_id];
        if (!suttaRes) {
            suttaRes = searchResults[row.sutta_id] = {
                sutta_id: row.sutta_id,
                category: suttaMeta.category,
                dir_path: suttaMeta.dir_path,
                titles: { root: suttaMeta.title || row.sutta_id },
                mr: suttaMeta.mr,
                count: 0,
                unique_words: [],
                segments: []
            };
        }
        const segKey = `${row.sutta_id}|${row.segment_id}`;
        let seg = segIndex.get(segKey);
        if (!seg) {
            seg = { segment: row.segment_id, root_text: '', variant: '', translations: {}, lb_context: [], la_context: [] };
            suttaRes.segments.push(seg);
            segIndex.set(segKey, seg);
        }
        if (row.kind === 'root') seg.root_text = row.txt;
        else if (row.kind === 'variant') seg.variant = row.txt;
        else seg.translations[`${row.lang}_${row.translator}`] = row.txt;
    }

    if (!anyMatch) return { searchResults: {}, empty: 'no-matches' };
    if (lb > 0 || la > 0) attachRootContext(searchResults, lb, la);
    return { searchResults };
}

// lb/la context: the root segments immediately around each match. `ord` is the segment's
// position inside its own file, so a window is a plain range on it — no line numbers, and no
// second pass over the corpus. Only root rows carry context, as before: variant and translation
// files are numbered independently and their neighbours are not the same passage.
function attachRootContext(searchResults, lb, la) {
    const suttaIds = Object.keys(searchResults);
    const rootRows = sqlRowsIn(
        'sutta_id, segment_id, ord, txt', 'texts', 'sutta_id', suttaIds, "AND kind = 'root'"
    );
    const bySutta = new Map();
    for (const row of rootRows) {
        let list = bySutta.get(row.sutta_id);
        if (!list) bySutta.set(row.sutta_id, list = []);
        list.push(row);
    }
    for (const list of bySutta.values()) list.sort((a, b) => a.ord - b.ord);

    for (const suttaId in searchResults) {
        const list = bySutta.get(suttaId);
        if (!list) continue;
        const indexBySegment = new Map(list.map((row, i) => [row.segment_id, i]));
        for (const seg of searchResults[suttaId].segments) {
            const at = indexBySegment.get(seg.segment);
            if (at === undefined) continue;
            if (!seg.root_text) seg.root_text = list[at].txt;
            for (let i = Math.max(0, at - lb); i < at; i++) {
                seg.lb_context.push({ segment: list[i].segment_id, root_text: list[i].txt, variant: '', translations: {} });
            }
            for (let i = at + 1; i <= Math.min(list.length - 1, at + la); i++) {
                seg.la_context.push({ segment: list[i].segment_id, root_text: list[i].txt, variant: '', translations: {} });
            }
        }
    }
}

// Sort suttas: category first (dhamma == the 4 nikayas — dn/mn/sn/an, see dblight.js — then
// khudakka, vinaya, abhi, other), then legacy relevance/version rank `mr` (mtph in
// textinfo.json) descending as a tiebreak (TODO.md поиск п.5's "версионная сортировка"), then id.
function sortSuttaResults(searchResults) {
    const categoryOrder = { dhamma: 1, khudakka: 2, vinaya: 3, abhi: 4, other: 5 };
    const sortedKeys = Object.keys(searchResults).sort((a, b) => {
        const oa = categoryOrder[searchResults[a].category] || 99;
        const ob = categoryOrder[searchResults[b].category] || 99;
        if (oa !== ob) return oa - ob;
        const mrA = searchResults[a].mr || 0;
        const mrB = searchResults[b].mr || 0;
        if (mrA !== mrB) return mrB - mrA;
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    const sortedData = {};
    for (const key of sortedKeys) {
        searchResults[key].segments.sort((s1, s2) =>
            s1.segment.localeCompare(s2.segment, undefined, { numeric: true, sensitivity: 'base' })
        );
        sortedData[key] = searchResults[key];
    }
    return sortedData;
}

// Границы "слова" в отчёте по словам — что НЕ считается частью самого слова, и там регэксп
// должен остановиться. Раньше сюда пытались добавить типографские кавычки прямо в виде символов
// ("""''") — редактор/шрифт отрисовывает их похоже на изогнутые, но по кодпоинтам это ОКАЗАЛИСЬ
// дублирующиеся обычные ASCII " и ' — настоящие типографские кавычки (“ ” ‘ ’), которые реально
// встречаются в корпусе, никогда не были исключены. Результат: слово "прилипало" к соседней
// кавычке ("“‘dukkhaṁ" вместо "dukkhaṁ") и попадало в отчёт отдельной "грязной" строкой вместо
// того, чтобы схлопнуться со "чистым" вхождением того же слова. Явные \u-escape здесь намеренно —
// чтобы больше не наступить на ту же ловушку визуально неотличимых символов.
const WORD_BOUNDARY_CHARS = '\\s,.:;!?"\'\\u201C\\u201D\\u2018\\u2019\\u00AB\\u00BB()\\[\\]{}';

// One place deciding how a keyword is turned into matchers, because three call sites need the
// identical rule and any drift between them shows up as the Words column changing under the
// reader as the phased answer fills in. A regex keyword is matched against the raw text exactly
// as grep -E was; anything else is matched against folded text, so a query typed without
// diacritics still finds the real form.
function keywordMatchers(keyword) {
    const isRegexQuery = REGEX_METACHARS.test(keyword);
    const pattern = isRegexQuery ? keyword : escapeRegExp(foldText(keyword));
    return {
        prepare: isRegexQuery ? (text => text) : foldText,
        matchRegex: new RegExp(pattern, 'gi'),
        wordRegex: new RegExp(`[^${WORD_BOUNDARY_CHARS}]*${pattern}[^${WORD_BOUNDARY_CHARS}]*`, 'gi'),
    };
}

// Calls back with every whole word containing the keyword, sliced out of the ORIGINAL text —
// offsets come from the folded copy, which foldText keeps the same length for exactly this.
function forEachWordForm(text, m, onWord) {
    if (!text) return;
    const haystack = m.prepare(text);
    m.wordRegex.lastIndex = 0;
    let hit;
    while ((hit = m.wordRegex.exec(haystack)) !== null) {
        if (hit[0].length === 0) { m.wordRegex.lastIndex++; continue; }
        onWord(text.slice(hit.index, hit.index + hit[0].length).toLowerCase());
    }
}

// Word report built directly from phase-1's raw grep matches — no file reads at all. Mirrors
// legacy new/words.sh's grepForWords (its own dedicated grep, fully independent of the
// quotes/citations report), just reusing the text buildMatchSkeleton already parsed instead of
// grepping a second time. Keeps one preferred-translator match per (sutta, lang) so repeat
// translations of the same text don't inflate word counts — same intent as
// filterPreferredTranslators, but decided by translation key only (no file reads needed).
function buildWordReportFast(searchResults, keyword) {
    const m = keywordMatchers(keyword);
    const words = {};

    const addWordsFromText = (text, suttaId, segmentId) => {
        forEachWordForm(text, m, word => {
            if (!words[word]) words[word] = { textIds: new Set(), matchCount: 0, links: new Map() };
            words[word].textIds.add(suttaId);
            words[word].matchCount += 1;
            if (!words[word].links.has(suttaId)) words[word].links.set(suttaId, segmentId);
        });
    };

    for (const suttaId in searchResults) {
        const suttaRes = searchResults[suttaId];
        for (const seg of suttaRes.segments) {
            addWordsFromText(seg.root_text, suttaId, seg.segment);
            addWordsFromText(seg.variant, suttaId, seg.segment);

            const byLang = {};
            for (const transKey of Object.keys(seg.translations)) {
                const lang = transKey.split('_')[0];
                (byLang[lang] = byLang[lang] || []).push(transKey);
            }
            for (const [lang, keys] of Object.entries(byLang)) {
                const priorities = TRANSLATOR_PRIORITY[lang];
                let chosen = priorities && priorities.find(p => keys.includes(p));
                if (!chosen && lang === 'en') chosen = keys.find(k => k !== 'en_sujato');
                if (!chosen) chosen = keys[0];
                addWordsFromText(seg.translations[chosen], suttaId, seg.segment);
            }
        }
    }

    return finalizeWordReport(words);
}

// "Variants for {keyword}" (легаси new/words.sh, секция под отчётом по словам) — список
// сегментов, где keyword встречается в ВАРИАНТНОМ (не root) чтении, по ВСЕМУ корпусу, независимо
// от scope текущего поиска (по запросу пользователя — вариант можно искать везде). Важно: текст
// сегмента (со стрелкой "→", "(mr)"/"(?)" и т.п.) — это НЕ наша разметка и не diff, который мы
// вычисляем — это редакторская нотация SuttaCentral, УЖЕ буквально хранящаяся в самом
// variant-файле как есть (проверено на живых данных: tha-ap407 → "Macchakacchapasañchannā →
// macchakacchapasampannā (?)"). Мы просто находим нужные сегменты и отдаём их текст без изменений.
//
// The widened pass is now the same indexed query filtered to variant rows, so the whole
// caching apparatus this function used to need (a second grep of the variant tree, plus a TTL
// cache to stop the phased client from repeating it) is gone.
async function findVariantSegments(keyword, exactMatch) {
    const segments = sqlMatchRows(keyword, exactMatch)
        .filter(row => row.kind === 'variant')
        .map(row => ({ sutta_id: row.sutta_id, segment: row.segment_id, text: row.txt }));
    segments.sort((a, b) => a.sutta_id.localeCompare(b.sutta_id, undefined, { numeric: true })
        || a.segment.localeCompare(b.segment, undefined, { numeric: true }));
    return segments;
}

// Fast (zero file-read) response: skeleton sutta list + full word report, straight off phase-1's
// grep. metadata.partial=true tells the client segments/translations are stubs pending
// /search/enrich — wordReport, however, is already complete and final.
async function buildFastResponse(keyword, searchScope, exactMatch, targetLangs, lb = 0, la = 0) {
    const { searchResults, empty } = await buildMatchSkeleton(keyword, searchScope, exactMatch, targetLangs, lb, la);
    const suttaIds = Object.keys(searchResults);

    if (empty || suttaIds.length === 0) {
        return {
            metadata: { query: keyword, scope: searchScope || 'default', resolvedPrefixes: resolveAllowedPrefixes(searchScope), langs: targetLangs, totalFiles: 0, totalMatches: 0, hasVariantMatch: false, partial: true },
            data: {},
            wordReport: [],
            variantSegments: []
        };
    }

    let totalMatches = 0;
    for (const id of suttaIds) {
        searchResults[id].count = searchResults[id].segments.length; // approximate — exact count arrives with enrichment
        totalMatches += searchResults[id].count;
    }
    const variantSegments = await findVariantSegments(keyword, exactMatch);

    const wordReport = buildWordReportFast(searchResults, keyword);
    const sortedData = sortSuttaResults(searchResults);

    return {
        metadata: {
            query: keyword, scope: searchScope || 'default', resolvedPrefixes: resolveAllowedPrefixes(searchScope), langs: targetLangs,
            totalFiles: suttaIds.length, totalMatches, hasVariantMatch: variantSegments.length > 0, partial: true
        },
        data: sortedData,
        wordReport,
        variantSegments
    };
}

// Легаси (C:\soft\dg\new\functions.sh) не передаёт grep'у списки файлов вообще — оно грепает
// маленький фиксированный набор ДИРЕКТОРИЙ рекурсивно (-r), и alternation по id сам отфильтровывает
// нужное. Наша первая версия батчинга передавала явные пути файлов (по одному на сутту) — при
// частом слове (785 сутт) это либо превышает лимит длины командной строки Windows (ENAMETOOLONG),
// либо (после чанкинга по файлам) даёт кучу мелких chunk'ов и всё равно медленно (~3 минуты на
// q=dukkha). Директории вместо файлов — тот же трюк, что у легаси: список аргументов больше не
// растёт с числом сутт, растёт только id-alternation (которую тоже чанкуем на случай очень
// большого корпуса, но это на порядки более редкий случай).
const GREP_ID_BUDGET = 12000; // символов на -e id-паттерны в одном вызове
// Per-call stdout ceiling for the segment greps. Not a hard limit on what can be fetched: on
// overflow grepSegmentsWithContextRecursive splits the chunk and retries (see there).
const GREP_MAX_BUFFER = 1024 * 1024 * 20;
// Whole-command-line budget, ids AND directories together. Windows hard-fails the spawn at 32767
// characters; staying well under it leaves room for quoting overhead we do not model exactly.
const GREP_CMDLINE_BUDGET = 24000;





// Phase 2: fill in what the match rows alone cannot carry — the variant and translation readings
// of a segment that matched somewhere else, the sutta's title in each language, the exact match
// count and the distinct word forms.
//
// This is where the grep implementation spent its time: four batched grep passes plus a
// directory walk per language, ~41 of the 42 seconds a `dukkha` search used to cost. Here it is
// three indexed queries — the translator roster of the matched suttas, their title segments, and
// the text of the result window (matches plus their lb/la context plus titles). A segment id
// already names its own sutta ("sn35.240:1.6"), so that window is one `segment_id IN (...)`.
async function enrichSuttaBatch(searchResults, suttaIds, targetLangs, keyword, searchScope, lb = 0, la = 0) {
    // A regex keyword is matched against the raw text exactly as grep -E did. A plain keyword is
    // matched against folded text, so that a query typed without diacritics ("kacchapanam") still
    // counts the real form ("kacchapānaṁ") — the same folding the index itself applies.
    const m = keywordMatchers(keyword);
    const { prepare, matchRegex } = m;

    let globalTotalMatches = 0;
    let globalHasVariants = false;

    const presentIds = suttaIds.filter(id => searchResults[id]);
    if (presentIds.length === 0) return { globalTotalMatches, globalHasVariants };

    const wantedLangs = targetLangs.includes('all')
        ? null
        : new Set(targetLangs.map(l => l.split('_')[0]));

    // 1. Which translators to show, per sutta. filterPreferredTranslators reads its values as
    // file paths to recognise a DG-main translation; `source` is that same signal, so it is
    // handed a path shaped like the one it expects.
    const rosterBySutta = new Map();
    for (const row of sqlRowsIn('DISTINCT sutta_id, lang, translator, source', 'texts', 'sutta_id',
        presentIds, "AND kind = 'translation'")) {
        if (wantedLangs && !wantedLangs.has(row.lang)) continue;
        let roster = rosterBySutta.get(row.sutta_id);
        if (!roster) rosterBySutta.set(row.sutta_id, roster = {});
        roster[`${row.lang}_${row.translator}`] =
            row.source === 'dgmain' ? path.join(DG_OFFLINE, row.lang, 'x.json') : '';
    }
    const chosenBySutta = new Map();
    for (const [suttaId, roster] of rosterBySutta) {
        chosenBySutta.set(suttaId, new Set(Object.keys(filterPreferredTranslators(roster))));
    }

    // 2. Title segment: bilara stacks canon/book/vagga names in the `:0.N` front matter before
    // the sutta's own title, so the last of them is the one worth showing — same rule the grep
    // path used, expressed as "highest ord among the front-matter segments".
    const titleIdBySutta = new Map();
    for (const row of sqlRowsIn('sutta_id, segment_id, ord', 'texts', 'sutta_id', presentIds,
        "AND kind = 'root' AND (segment_id GLOB '*:0' OR segment_id GLOB '*:0.*')")) {
        const prev = titleIdBySutta.get(row.sutta_id);
        if (!prev || row.ord > prev.ord) titleIdBySutta.set(row.sutta_id, row);
    }

    // 3. Every text row of the result window, in one lookup.
    const windowIds = new Set();
    for (const suttaId of presentIds) {
        for (const seg of searchResults[suttaId].segments) {
            windowIds.add(seg.segment);
            seg.lb_context.forEach(c => windowIds.add(c.segment));
            seg.la_context.forEach(c => windowIds.add(c.segment));
        }
        const title = titleIdBySutta.get(suttaId);
        if (title) windowIds.add(title.segment_id);
    }
    // Keyword rows for the counting below, keyed by SEGMENT id — the same key the result window
    // uses. Not by sutta: a few suttas share segment ids with another (dn84's segments are all
    // "dn16:…"), so grouping per sutta would count a different set of rows than the window holds.
    const keywordRowsBySegment = new Map();
    for (const row of sqlKeywordRows(keyword)) {
        if (row.kind === 'translation' && wantedLangs && !wantedLangs.has(row.lang)) continue;
        let list = keywordRowsBySegment.get(row.segment_id);
        if (!list) keywordRowsBySegment.set(row.segment_id, list = []);
        list.push(row);
    }

    const langFilter = langFilterSql(wantedLangs);
    const bySegment = new Map();
    for (const row of sqlRowsIn('sutta_id, segment_id, kind, lang, translator, txt', 'texts',
        'segment_id', [...windowIds], langFilter.sql, langFilter.params)) {
        let list = bySegment.get(row.segment_id);
        if (!list) bySegment.set(row.segment_id, list = []);
        list.push(row);
    }

    for (const suttaId of presentIds) {
        const suttaRes = searchResults[suttaId];
        const chosen = chosenBySutta.get(suttaId);

        const fill = (segObj) => {
            segObj.translations = segObj.translations || {};
            for (const row of bySegment.get(segObj.segment) || []) {
                if (row.kind === 'root') { if (!segObj.root_text) segObj.root_text = row.txt; }
                else if (row.kind === 'variant') segObj.variant = row.txt;
                else {
                    const key = `${row.lang}_${row.translator}`;
                    if (!chosen || chosen.has(key)) segObj.translations[key] = row.txt;
                }
            }
        };

        const title = titleIdBySutta.get(suttaId);
        if (title) {
            for (const row of bySegment.get(title.segment_id) || []) {
                if (row.kind === 'root') suttaRes.titles.root = row.txt;
                else if (row.kind === 'translation') {
                    const key = `${row.lang}_${row.translator}`;
                    if (!chosen || chosen.has(key)) suttaRes.titles[key] = row.txt;
                }
            }
        }

        const uniqueWords = new Set();
        let matchCount = 0;
        const collect = (text, isVariant = false) => {
            if (!text) return;
            const haystack = prepare(text);
            const found = haystack.match(matchRegex);
            if (found) {
                matchCount += found.length;
                if (isVariant) globalHasVariants = true;
            }
            forEachWordForm(text, m, word => uniqueWords.add(word));
        };

        for (const seg of suttaRes.segments) {
            fill(seg);
            seg.lb_context.forEach(fill);
            seg.la_context.forEach(fill);
        }

        // Counting runs over the rows the index returned, not over the whole window that was just
        // filled for display: a row the index did not return cannot contain the keyword, so
        // searching it is wasted work. Measured on `dukkha`: 9211 rows scanned instead of 27307,
        // 336ms instead of 914ms, with byte-identical counts. It has to read the UNFILTERED
        // keyword rows — in exact mode `Ct` deliberately counts occurrences without a word
        // boundary, and those live in rows the whole-word filter drops.
        // No filtering by the chosen translators here: buildMatchSkeleton puts the text of EVERY
        // translator that matched into the segment, not just the preferred one, so a hit in a
        // non-preferred translation is displayed and has always been counted. Rows from chosen
        // translators that do not contain the keyword contribute nothing either way.
        for (const seg of suttaRes.segments) {
            for (const row of keywordRowsBySegment.get(seg.segment) || []) {
                collect(row.txt, row.kind === 'variant');
            }
        }

        suttaRes.count = matchCount;
        // totalMatches counts SEGMENTS, not occurrences, so the header ("N texts, M matches")
        // agrees with what a reader can count in the table and does not jump between the ?fast=1
        // answer and this one. suttaRes.count keeps the finer occurrence count for its own column.
        globalTotalMatches += suttaRes.segments.length;
        suttaRes.unique_words = Array.from(uniqueWords);
    }

    return { globalTotalMatches, globalHasVariants };
}

// Composition of the phases above — the default (no-flag) /search path.
async function buildSearchResponse(keyword, searchScope, exactMatch, targetLangs, lb = 0, la = 0) {
    const { searchResults, empty } = await buildMatchSkeleton(keyword, searchScope, exactMatch, targetLangs, lb, la);

    if (empty === 'no-targets') {
        return { metadata: { query: keyword, totalFiles: 0, totalMatches: 0, hasVariantMatch: false }, data: {}, variantSegments: [] };
    }
    const suttaIds = Object.keys(searchResults);
    if (empty === 'no-matches' || suttaIds.length === 0) {
        return { metadata: { query: keyword, langs: targetLangs, totalFiles: 0, totalMatches: 0, hasVariantMatch: false }, data: {}, variantSegments: [] };
    }

    const { globalTotalMatches } = await enrichSuttaBatch(searchResults, suttaIds, targetLangs, keyword, searchScope, lb, la);
    const wordReport = buildWordReport(searchResults);
    const sortedData = sortSuttaResults(searchResults);
    const variantSegments = await findVariantSegments(keyword, exactMatch);

    return {
        metadata: {
            query: keyword,
            scope: searchScope || 'default',
            resolvedPrefixes: resolveAllowedPrefixes(searchScope),
            langs: targetLangs,
            lb, la, exactMatch,
            totalFiles: Object.keys(sortedData).length,
            totalMatches: globalTotalMatches,
            hasVariantMatch: variantSegments.length > 0
        },
        data: sortedData,
        wordReport,
        variantSegments
    };
}

// SQL replacement for findTranslationFiles(): the roster of candidate translators for one sutta
// comes from the table instead of walking three directory trees per sutta. The SELECTION rule is
// unchanged — the same filterPreferredTranslators/TRANSLATOR_PRIORITY logic decides who is shown,
// and it inspects its values as file paths to spot a DG-main translation, so `source` is handed
// to it shaped like the path it expects.
function translatorsForSutta(suttaId, targetLangs, explicitTranslators, multiForLangs) {
    const rows = searchDb.prepare(
        `SELECT DISTINCT lang, translator, source FROM texts WHERE sutta_id = ? AND kind = 'translation'`
    ).all(suttaId);
    const wanted = (!targetLangs || targetLangs.includes('all'))
        ? null
        : new Set(targetLangs.map(l => l.split('_')[0]));

    const roster = {};
    for (const row of rows) {
        if (wanted && !wanted.has(row.lang)) continue;
        roster[`${row.lang}_${row.translator}`] =
            row.source === 'dgmain' ? path.join(DG_OFFLINE, row.lang, 'x.json') : '';
    }

    if (explicitTranslators && explicitTranslators.length) {
        return new Set(explicitTranslators.filter(key => key in roster));
    }
    return new Set(Object.keys(filterPreferredTranslators(roster, multiForLangs)));
}

// Everything stored for one sutta, fetched once. Split out from the assembly below for the same
// reason as before: /api/text/:suttaId can build the answer twice (once for the requested
// language, once for the en fallback) and only the translator choice differs between them.
async function getSuttaBaseData(suttaId) {
    const suttaMeta = skeletonDB[suttaId];
    if (!suttaMeta) return null;
    const rows = searchDb.prepare(
        'SELECT segment_id, ord, kind, lang, translator, txt FROM texts WHERE sutta_id = ?'
    ).all(suttaId);
    const htmlBySegment = new Map(searchDb.prepare(
        'SELECT segment_id, txt FROM html WHERE sutta_id = ?'
    ).all(suttaId).map(row => [row.segment_id, row.txt]));
    return { suttaMeta, rows, htmlBySegment };
}

async function buildTextDataFromBase(base, suttaId, targetLangs, explicitTranslators, multiForLangs) {
    const { suttaMeta, rows, htmlBySegment } = base;
    const chosen = translatorsForSutta(suttaId, targetLangs, explicitTranslators, multiForLangs);

    // Segments come from the root text and keep its order (`ord`), exactly as iterating the root
    // JSON's keys used to — a translation segment with no root counterpart is not a segment.
    const bySegment = new Map();
    const rootOrder = [];
    for (const row of rows) {
        let seg = bySegment.get(row.segment_id);
        if (!seg) {
            seg = { segment: row.segment_id, root_text: '', variant: '', html: '', translations: {} };
            bySegment.set(row.segment_id, seg);
        }
        if (row.kind === 'root') {
            seg.root_text = row.txt;
            rootOrder.push(row);
        } else if (row.kind === 'variant') {
            seg.variant = row.txt;
        } else {
            const key = `${row.lang}_${row.translator}`;
            if (chosen.has(key)) seg.translations[key] = row.txt;
        }
    }
    rootOrder.sort((a, b) => a.ord - b.ord);

    const segments = rootOrder.map(row => {
        const seg = bySegment.get(row.segment_id);
        seg.html = htmlBySegment.get(row.segment_id) || '';
        return seg;
    });

    return {
        sutta_id: suttaId,
        category: suttaMeta.category,
        dir_path: suttaMeta.dir_path,
        title: suttaMeta.title,
        mr: suttaMeta.mr,
        segments
    };
}

// Полный текст одной сутты (все сегменты, не только совпадения) — для ридера.
// Переиспользует те же хелперы, что и поиск, просто без grep-фильтра.
async function getFullTextData(suttaId, targetLangs, explicitTranslators, multiForLangs) {
    const base = await getSuttaBaseData(suttaId);
    if (!base) return null;
    return buildTextDataFromBase(base, suttaId, targetLangs, explicitTranslators, multiForLangs);
}

// Previous/next sutta in corpus order, honouring the search scope. Lives here rather than in the
// route because the app needs the same answer and the walk depends on skeletonDB's key order,
// which is this module's own state — reproducing it outside would be a second implementation of
// the one thing that must not drift: what "the next sutta" means.
function navFor(suttaId, scope) {
    const dbKeys = Object.keys(skeletonDB);
    const currentIndex = dbKeys.indexOf(suttaId);
    if (currentIndex === -1) return null;

    const allowedPrefixes = resolveAllowedPrefixes(scope);
    const inScope = (i) => matchesScope(skeletonDB[dbKeys[i]], dbKeys[i], allowedPrefixes);

    let prevIndex = -1;
    for (let i = currentIndex - 1; i >= 0; i--) { if (inScope(i)) { prevIndex = i; break; } }
    let nextIndex = -1;
    for (let i = currentIndex + 1; i < dbKeys.length; i++) { if (inScope(i)) { nextIndex = i; break; } }

    const toNavEntry = (slug) => slug ? { slug, title: skeletonDB[slug].title || '' } : null;
    return {
        prev: prevIndex !== -1 ? toNavEntry(dbKeys[prevIndex]) : null,
        next: nextIndex !== -1 ? toNavEntry(dbKeys[nextIndex]) : null,
    };
}

module.exports = {
    init,
    setSkeleton,
    navFor,
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
    langFilterSql,
    matchesScope,
    resolveAllowedPrefixes,
    sortSuttaResults,
    sqlRowsIn,
    stripSearchPunctuation,
};
