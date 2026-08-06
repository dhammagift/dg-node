const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const fsSync = require('fs');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);

const app = express();
const PORT = 3000;

const isTermux  = fsSync.existsSync('/data/data/com.termux/files/usr');
const isWindows = process.platform === 'win32';

// SuttaCentral Bilara — основной источник пали и переводов
// DhammaGift offline — лучшие переводы проекта (один на язык)
// Структура: {DG_OFFLINE}/{lang}/sutta|vinaya/{nikaya}/{id}_translation-{lang}-{author}.json
let SC_BILARA, DG_OFFLINE;
if (isTermux) {
    SC_BILARA  = '/data/data/com.termux/files/usr/share/apache2/default-site/htdocs/suttacentral.net/sc-data/sc_bilara_data';
    DG_OFFLINE = '/data/data/com.termux/files/home/offline-data/dhammagift';
} else if (isWindows) {
    SC_BILARA  = 'C:/soft/sc-data/sc_bilara_data';
    DG_OFFLINE = 'C:/soft/offline-data/dhammagift';
} else {
    SC_BILARA  = '/var/www/html/suttacentral.net/sc-data/sc_bilara_data';
    DG_OFFLINE = '/home/user/offline-data/dhammagift';
}

const SC_ROOT     = `${SC_BILARA}/root/pli/ms`;
const SC_VARIANT  = `${SC_BILARA}/variant/pli/ms`;
const SC_TRANS    = `${SC_BILARA}/translation`;
const DG_LANGS    = ['ru', 'ru_other', 'en', 'en_other', 'ai'];

// Офлайн-зеркала сторонних сайтов (4nt, theravada.ru, словари и т.п.) — родитель DG_OFFLINE
const OFFLINE_MIRRORS_ROOT = path.dirname(DG_OFFLINE);
let offlineMirrors = new Set();
try {
    offlineMirrors = new Set(
        fsSync.readdirSync(OFFLINE_MIRRORS_ROOT, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name)
    );
} catch (e) {
    console.warn('Offline mirrors root not found:', OFFLINE_MIRRORS_ROOT);
}

const readerTemplatePath = path.join(__dirname, 'reader', 'reader-template.html');

const skeletonPath = path.join(__dirname, 'dg_db_light.json');
let skeletonDB = {};

async function initServer() {
    try {
        const data = await fs.readFile(skeletonPath, 'utf8');
        skeletonDB = JSON.parse(data);
        console.log(`Skeleton loaded: ${Object.keys(skeletonDB).length} suttas`);
    } catch (err) {
        console.error('Startup error:', err);
    }
}
initServer();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Статика — dg-node самодостаточен, ничего не зависит от соседнего легаси-репозитория
// Файлы, которые мы реально правим (не совпадают с легаси) — отдаём их первыми,
// прежде чем упасть на весь /assets (симлинк целиком на легаси-репозиторий, см. ниже).
app.use('/assets', express.static(path.join(__dirname, 'public', 'overrides')));
// public/assets — единый симлинк на легаси /var/www/html/assets (в проде; на этой
// Windows-машине — обычная папка с локальными копиями для разработки, см. README).
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
app.use('/spa', express.static(path.join(__dirname, 'public', 'spa')));
app.use('/nodejs/res', express.static(path.join(__dirname, 'res')));
app.use('/nodejs', express.static(__dirname));
app.use('/reader', express.static(path.join(__dirname, 'reader')));

// Офлайн-зеркала сторонних сайтов — /{имя-папки}/... отдаётся как статика напрямую из offline-data
for (const name of offlineMirrors) {
    app.use(`/${name}`, express.static(path.join(OFFLINE_MIRRORS_ROOT, name)));
}

// SPA главная точка входа — служит spa/index.html для всех маршрутов
// клиентский router.js обрабатывает URL распознавание
app.get('/spa/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'spa', 'index.html'));
});

// Поддержка SPA маршрутизации: любой неизвестный маршрут → spa/index.html
// Это позволяет использовать чистые URL (/, /kacchapa, /dn22:2.2, и т.д.)
// без сервер-сайд редиректов — браузер загружает SPA и router.js парсит URL
app.get('/spa/*splat', (req, res) => {
    // Все запросы в /spa/* служат SPA index.html (за исключением статики)
    res.sendFile(path.join(__dirname, 'public', 'spa', 'index.html'));
});

// Страница поиска — главная точка входа (легаси, для обратной совместимости)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'res', 'index.html'));
});

// Детерминированный путь к root-файлу через dir_path из скелета
// dir_path пример: "pli/ms/sutta/dn"  →  .../root/pli/ms/sutta/dn/dn22_root-pli-ms.json
function getRootPath(suttaId) {
    const meta = skeletonDB[suttaId];
    if (!meta) return null;
    return path.join(SC_BILARA, 'root', meta.dir_path, `${suttaId}_root-pli-ms.json`);
}

function getVariantPath(suttaId) {
    const meta = skeletonDB[suttaId];
    if (!meta) return null;
    return path.join(SC_BILARA, 'variant', meta.dir_path, `${suttaId}_variant-pli-ms.json`);
}

// Рекурсивный обход directory в поиске файлов "{suttaId}_*.json" — без внешнего find
// (на Windows системный find.exe — это MS-DOS find, не POSIX find, полагаться на PATH нельзя)
async function findFilesByPrefix(dir, prefix) {
    const matches = [];
    async function walk(current) {
        let entries;
        try {
            entries = await fs.readdir(current, { withFileTypes: true });
        } catch (e) { return; }
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
            } else if (entry.isFile() && entry.name.startsWith(`${prefix}_`) && entry.name.endsWith('.json')) {
                matches.push(full);
            }
        }
    }
    await walk(dir);
    return matches;
}

// Приоритет переводчиков на язык — при нескольких вариантах перевода одного текста
// показываем только один, лучший, а не все подряд (TODO.md п.3: "куча русских переводов").
// Языки вне списка — берём первый попавшийся файл.
// Приоритет переводчиков по языку — { "ru": ["ru_o", "ru_sv", ...] }. Языки без записи
// здесь не ломаются: filterPreferredTranslators() просто берёт первый найденный перевод
// (см. ниже), так что новый язык из SC-репо читается сразу, без правки кода — приоритет
// добавляется в этот файл только когда для языка есть за что выбирать.
const TRANSLATOR_PRIORITY = require('./reader/translator-priority.json');

function filterPreferredTranslators(results) {
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

        if (!chosen) chosen = keys[0];
        filtered[chosen] = results[chosen];
    }
    return filtered;
}

// Поиск файлов переводов по suttaId (без предварительного индекса)
// Возвращает { "ru_o": "/path/to/file.json", "en_sujato": "...", ... } — один файл на язык (см. выше)
async function findTranslationFiles(suttaId, targetLangs) {
    const searchDirs = [];

    for (const lang of targetLangs) {
        if (lang === 'all') {
            // SC: все доступные языки
            try {
                const langs = await fs.readdir(SC_TRANS);
                langs.forEach(l => searchDirs.push(path.join(SC_TRANS, l)));
            } catch (e) {}
            // DG offline: все языки проекта
            DG_LANGS.forEach(l => searchDirs.push(path.join(DG_OFFLINE, l)));
        } else {
            searchDirs.push(path.join(SC_TRANS, lang));
            // DG offline: точное совпадение + смежные (ru → ru, ru_other)
            DG_LANGS
                .filter(l => l === lang || l.startsWith(lang + '_'))
                .forEach(l => searchDirs.push(path.join(DG_OFFLINE, l)));
        }
    }

    const results = {};
    await Promise.all(searchDirs.map(async dir => {
        if (!fsSync.existsSync(dir)) return;
        const files = await findFilesByPrefix(dir, suttaId);
        for (const filePath of files) {
            const baseName = path.basename(filePath, '.json');
            // baseName: "dn22_translation-ru-o" → parts: ["dn22_translation","ru","o"]
            const parts = baseName.split('-');
            if (parts.length >= 3) {
                const transKey = `${parts[1]}_${parts.slice(2).join('-')}`;
                results[transKey] = filePath;
            }
        }
    }));

    return filterPreferredTranslators(results);
}

// Директории для grep в зависимости от запрошенных языков
function buildGrepDirs(targetLangs) {
    const dirs = [];

    if (fsSync.existsSync(SC_ROOT))    dirs.push(SC_ROOT);
    if (fsSync.existsSync(SC_VARIANT)) dirs.push(SC_VARIANT);

    for (const lang of targetLangs) {
        if (lang === 'all') {
            try {
                fsSync.readdirSync(SC_TRANS).forEach(l => {
                    const p = path.join(SC_TRANS, l);
                    if (fsSync.existsSync(p)) dirs.push(p);
                });
            } catch (e) {}
        } else {
            const scLang = path.join(SC_TRANS, lang);
            if (fsSync.existsSync(scLang)) dirs.push(scLang);
        }
    }

    // DG offline переводы — всегда включаем (лучшие переводы проекта)
    DG_LANGS.forEach(l => {
        const p = path.join(DG_OFFLINE, l);
        if (fsSync.existsSync(p)) dirs.push(p);
    });

    return dirs;
}

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Отчёт с группировкой по словам — та же идея, что в легаси new/words.sh (grep по словам,
// группировка по уникальному слову вместо суттs), но без повторного grep: агрегируем
// уже собранные по каждой сутте сегменты (root_text/variant/unique_words) из searchWithGrep.
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

// ---------------------------------------------------------------------------------------
// Fast-search grep strategy (TODO.md, поиск п.5)
//
// The whole point of this module is: no pre-built search index, ever (CLAUDE.md — "Никакого
// предварительного индекса файлов"). grep IS the index. That only stays fast if every grep
// call is used deliberately:
//
//   1. One process for the whole corpus, not one per directory. buildGrepDirs() + a single
//      execFile('grep', ['-ri', keyword, ...dirs]) lets GNU grep recurse the directory list
//      itself in one process — never split this into per-language/per-type calls.
//   2. Batch point-lookups instead of spawning one grep per file. A results page of ~25 suttas
//      x 3-5 files (root+variant+translations) is ~100 files — one grep invocation accepts a
//      list of files AND multiple -e patterns, so a whole sutta's root/variant/translation
//      lookups happen in one process each (grepSegmentsWithContext), not one per segment.
//   3. Never re-grep what a previous phase already found. Phase 1's grep already returns the
//      matched line's own text for free (see buildMatchSkeleton) — phase 2 only greps for
//      what's still missing: context lines (-B/-A) and sibling fields (variant/translations
//      of a segment that matched only in root).
//   4. Prefer -F (fixed-string) over regex whenever the pattern has no regex metacharacters —
//      faster, and side-steps ReDoS entirely. Every segment-id lookup (grepSegmentsWithContext)
//      is always -F, since a segment id is never a regex. The free-text keyword search opts
//      into -F only when it's safe to (looksLikeFixedString).
//   5. Run independent greps concurrently (Promise.all), never sequential awaits — root,
//      variant, and each translation language for a sutta don't depend on each other.
//   6. Only ever target deterministic, known files (getRootPath/getVariantPath/
//      findTranslationFiles) — never walk a whole language tree per request.
//   7. Keep maxBuffer proportional to what's actually being grepped: the full-corpus phase-1
//      grep needs a generous buffer, but a handful of known files for one sutta does not.
// ---------------------------------------------------------------------------------------

const REGEX_METACHARS = /[.*+?^${}()|[\]\\]/;

// True when keyword has no regex-special characters — safe (and faster) to grep with -F.
function looksLikeFixedString(keyword) {
    return !REGEX_METACHARS.test(keyword);
}

// Parses one JSON-line fragment ("segId": "text",) into {segmentId, text} — the same format
// grep returns both for the full-corpus phase-1 scan and for phase-2 point lookups, since SC
// Bilara / DhammaGift JSON always has one segment per line.
function parseJsonLineFragment(fragment) {
    try {
        const cleanLine = fragment.trim().replace(/,$/, '');
        const parsed = JSON.parse(`{${cleanLine}}`);
        const segmentId = Object.keys(parsed)[0];
        return { segmentId, text: parsed[segmentId] };
    } catch (e) {
        const fb = fragment.trim().match(/^"([^"]+)"\s*:\s*"(.*)"\s*,?$/);
        if (fb) return { segmentId: fb[1], text: fb[2] };
        return null;
    }
}

// Classifies a matched file path by role — root/variant/translation(lang_author) — purely from
// the filename, no file read. Mirrors the naming convention used by findTranslationFiles.
function classifyMatchSource(filePath) {
    const baseName = path.basename(filePath, '.json');
    if (baseName.endsWith('_root-pli-ms')) return { type: 'root' };
    if (baseName.endsWith('_variant-pli-ms')) return { type: 'variant' };
    const parts = baseName.split('-');
    if (parts.length >= 3 && parts[0].endsWith('_translation')) {
        return { type: 'translation', transKey: `${parts[1]}_${parts.slice(2).join('-')}` };
    }
    return { type: 'unknown' };
}

// Deterministic file list for one sutta (root + variant + preferred translation per requested
// language) — used to scope grep to a handful of known files (restrictToIds below) instead of
// the whole corpus (buildGrepDirs).
async function getGrepTargetFiles(suttaId, targetLangs) {
    const files = [];
    const rootPath = getRootPath(suttaId);
    if (rootPath && fsSync.existsSync(rootPath)) files.push(rootPath);
    const variantPath = getVariantPath(suttaId);
    if (variantPath && fsSync.existsSync(variantPath)) files.push(variantPath);
    const translationFiles = await findTranslationFiles(suttaId, targetLangs);
    files.push(...Object.values(translationFiles));
    return files;
}

// Phase 1: grep the corpus (or, when restrictToIds is given, only the known files of those
// suttas) and parse matches into a skeleton per sutta — without reading any file a second
// time. Each grep line already carries the matched segment's own text; unlike before, we keep
// it (instead of discarding everything but the segment id), since that's exactly what the
// phase-1 word report and quote preview need, for free.
async function buildMatchSkeleton(keyword, searchScope, exactMatch, targetLangs, restrictToIds = null) {
    let grepTargets;
    if (restrictToIds && restrictToIds.length > 0) {
        const fileLists = await Promise.all(restrictToIds.map(id => getGrepTargetFiles(id, targetLangs)));
        grepTargets = fileLists.flat();
    } else {
        grepTargets = buildGrepDirs(targetLangs);
    }

    if (grepTargets.length === 0) {
        return { searchResults: {}, empty: 'no-targets' };
    }

    const grepArgs = ['-ri'];
    if (exactMatch) grepArgs.push('-w');
    if (!exactMatch && looksLikeFixedString(keyword)) grepArgs.push('-F');
    grepArgs.push(keyword, ...grepTargets);

    let stdout = '';
    try {
        const result = await execFile('grep', grepArgs, { maxBuffer: 1024 * 1024 * 50 });
        stdout = result.stdout;
    } catch (error) {
        if (error.code === 1) return { searchResults: {}, empty: 'no-matches' };
        throw error;
    }

    const defaultPrefixes = ['dn', 'mn', 'sn', 'an', 'ud', 'snp', 'dhp', 'thag', 'thig', 'iti', 'bu-', 'bi-', 'pli-tv-', 'kd', 'pvr'];
    let allowedPrefixes = [];

    if (restrictToIds && restrictToIds.length > 0) {
        allowedPrefixes = ['all']; // already scoped to exactly these suttas' own files
    } else if (!searchScope || searchScope === 'default') {
        allowedPrefixes = defaultPrefixes;
    } else if (searchScope === 'all') {
        allowedPrefixes = ['all'];
    } else {
        for (const p of searchScope.split(',').map(s => s.trim())) {
            allowedPrefixes.push(...(p === 'default' ? defaultPrefixes : [p]));
        }
    }

    const searchResults = {};

    for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        // Жадный .+ вместо [^:]+ — путь к файлу на Windows содержит двоеточие буквы диска (C:/...)
        const match = line.match(/^(.+\.json):(.*)$/);
        if (!match) continue;

        const filePath = match[1];
        const fileName = path.basename(filePath);
        const suttaId = fileName.split('_')[0];
        const suttaMeta = skeletonDB[suttaId];
        if (!suttaMeta) continue;

        if (!allowedPrefixes.includes('all')) {
            const allowed = allowedPrefixes.some(prefix => {
                if (suttaMeta.category === prefix) return true;
                if (suttaId === prefix) return true;
                if (suttaId.startsWith(prefix)) return /[0-9.-]/.test(suttaId.charAt(prefix.length));
                return false;
            });
            if (!allowed) continue;
        }

        const parsed = parseJsonLineFragment(match[2]);
        if (!parsed) continue;
        const { segmentId, text } = parsed;

        if (!searchResults[suttaId]) {
            searchResults[suttaId] = {
                sutta_id: suttaId,
                category: suttaMeta.category,
                dir_path: suttaMeta.dir_path,
                titles: { root: suttaMeta.title || suttaId },
                mr: suttaMeta.mr,
                count: 0,
                unique_words: [],
                segments: []
            };
        }

        let seg = searchResults[suttaId].segments.find(s => s.segment === segmentId);
        if (!seg) {
            seg = { segment: segmentId, root_text: '', variant: '', translations: {} };
            searchResults[suttaId].segments.push(seg);
        }

        const source = classifyMatchSource(filePath);
        if (source.type === 'root') seg.root_text = text;
        else if (source.type === 'variant') seg.variant = text;
        else if (source.type === 'translation' && source.transKey) seg.translations[source.transKey] = text;
    }

    return { searchResults };
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

// Word report built directly from phase-1's raw grep matches — no file reads at all. Mirrors
// legacy new/words.sh's grepForWords (its own dedicated grep, fully independent of the
// quotes/citations report), just reusing the text buildMatchSkeleton already parsed instead of
// grepping a second time. Keeps one preferred-translator match per (sutta, lang) so repeat
// translations of the same text don't inflate word counts — same intent as
// filterPreferredTranslators, but decided by translation key only (no file reads needed).
function buildWordReportFast(searchResults, keyword) {
    const wordRegex = new RegExp(`[^\\s,.:;!?"'""''()\\[\\]{}]*${keyword}[^\\s,.:;!?"'""''()\\[\\]{}]*`, 'gi');
    const words = {};

    const addWordsFromText = (text, suttaId, segmentId) => {
        if (!text) return;
        const matches = text.match(wordRegex) || [];
        for (const raw of matches) {
            const word = raw.toLowerCase();
            if (!words[word]) words[word] = { textIds: new Set(), matchCount: 0, links: new Map() };
            words[word].textIds.add(suttaId);
            words[word].matchCount += 1;
            if (!words[word].links.has(suttaId)) words[word].links.set(suttaId, segmentId);
        }
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

// Fast (zero file-read) response: skeleton sutta list + full word report, straight off phase-1's
// grep. metadata.partial=true tells the client segments/translations are stubs pending
// /search/enrich — wordReport, however, is already complete and final.
async function buildFastResponse(keyword, searchScope, exactMatch, targetLangs) {
    const { searchResults, empty } = await buildMatchSkeleton(keyword, searchScope, exactMatch, targetLangs);
    const suttaIds = Object.keys(searchResults);

    if (empty || suttaIds.length === 0) {
        return {
            metadata: { query: keyword, scope: searchScope || 'default', langs: targetLangs, totalFiles: 0, totalMatches: 0, hasVariantMatch: false, partial: true },
            data: {},
            wordReport: []
        };
    }

    let totalMatches = 0;
    for (const id of suttaIds) {
        searchResults[id].count = searchResults[id].segments.length; // approximate — exact count arrives with enrichment
        totalMatches += searchResults[id].count;
    }

    const wordReport = buildWordReportFast(searchResults, keyword);
    const sortedData = sortSuttaResults(searchResults);

    return {
        metadata: {
            query: keyword, scope: searchScope || 'default', langs: targetLangs,
            totalFiles: suttaIds.length, totalMatches, hasVariantMatch: false, partial: true
        },
        data: sortedData,
        wordReport
    };
}

// Point-lookup grep: for one file, fetch the given known segment ids plus lb/la lines of
// context around each — in ONE grep process regardless of how many ids are requested (GNU grep
// merges overlapping -B/-A windows across multiple -e anchors in a single pass). Always -F
// (fixed-string), since segment ids are never regex. Returns Map<lineNumber, {segmentId, text}>
// so callers reconstruct "N lines before/after" from line numbers, independent of how grep
// grouped its output.
async function grepSegmentsWithContext(filePath, segmentIds, lb = 0, la = 0) {
    const result = new Map();
    if (!filePath || segmentIds.length === 0 || !fsSync.existsSync(filePath)) return result;

    const args = ['-n', '-F'];
    if (lb > 0) args.push(`-B${lb}`);
    if (la > 0) args.push(`-A${la}`);
    for (const segId of segmentIds) args.push('-e', `"${segId}":`);
    args.push(filePath);

    let stdout = '';
    try {
        const res = await execFile('grep', args, { maxBuffer: 1024 * 1024 * 5 });
        stdout = res.stdout;
    } catch (error) {
        if (error.code === 1) return result; // no matches in this file
        throw error;
    }

    for (const line of stdout.split('\n')) {
        if (!line.trim() || line === '--') continue;
        // grep -n: "42:content" for an anchor match, "42-content" for a -B/-A context line.
        const m = line.match(/^(\d+)[:-](.*)$/);
        if (!m) continue;
        const parsed = parseJsonLineFragment(m[2]);
        if (parsed) result.set(parseInt(m[1], 10), parsed);
    }

    return result;
}

// Last ":0"-style front-matter segment before the sutta's real content (same heuristic as
// before: title is the last piece of front matter right before the first ":1..." segment) — via
// one small targeted grep instead of reading+scanning the whole root file.
async function findTitleSegmentId(rootPath) {
    if (!rootPath || !fsSync.existsSync(rootPath)) return null;
    let stdout = '';
    try {
        const res = await execFile('grep', ['-n', '-E', ':0(\\.[0-9]+)?":', rootPath], { maxBuffer: 1024 * 1024 * 2 });
        stdout = res.stdout;
    } catch (error) {
        if (error.code === 1) return null;
        throw error;
    }
    const lines = stdout.split('\n').filter(l => l.trim());
    if (lines.length === 0) return null;
    const m = lines[lines.length - 1].match(/^(\d+):(.*)$/);
    if (!m) return null;
    const parsed = parseJsonLineFragment(m[2]);
    return parsed ? parsed.segmentId : null;
}

// Phase 2: enrich a known set of matched suttas with full segment/quote data — root, variant,
// translations, and lb/la context — entirely via targeted grep (see the strategy comment
// above), never a full-file JSON.parse. Two grep rounds per sutta, run in parallel across
// suttas: (1) grep root WITH context to learn every segment id in the lb/la window around each
// match, (2) grep variant/translation files for exactly that id set (no further context needed
// — round 1's id set already covers it).
async function enrichSuttaBatch(searchResults, suttaIds, targetLangs, keyword, lb = 0, la = 0) {
    const regex = new RegExp(keyword, 'gi');
    const wordRegex = new RegExp(`[^\\s,.:;!?"'""''()\\[\\]{}]*${keyword}[^\\s,.:;!?"'""''()\\[\\]{}]*`, 'gi');
    let globalTotalMatches = 0;
    let globalHasVariants = false;

    await Promise.all(suttaIds.map(async suttaId => {
        const suttaRes = searchResults[suttaId];
        if (!suttaRes) return;

        const matchedSegIds = suttaRes.segments.map(s => s.segment);
        const rootPath = getRootPath(suttaId);
        const variantPath = getVariantPath(suttaId);
        const translationFiles = await findTranslationFiles(suttaId, targetLangs);
        const translationKeys = Object.keys(translationFiles);

        const [rootLines, titleSegId] = await Promise.all([
            grepSegmentsWithContext(rootPath, matchedSegIds, lb, la),
            findTitleSegmentId(rootPath)
        ]);

        const rootHasTitle = titleSegId && [...rootLines.values()].some(v => v.segmentId === titleSegId);
        const windowSegIds = [...new Set([...rootLines.values()].map(v => v.segmentId).concat(titleSegId ? [titleSegId] : []))];

        const [titleRootLine, variantLines, ...translationLinesArr] = await Promise.all([
            !rootHasTitle && titleSegId ? grepSegmentsWithContext(rootPath, [titleSegId], 0, 0) : Promise.resolve(new Map()),
            grepSegmentsWithContext(variantPath, windowSegIds, 0, 0),
            ...translationKeys.map(key => grepSegmentsWithContext(translationFiles[key], windowSegIds, 0, 0))
        ]);

        const translationLinesByKey = {};
        translationKeys.forEach((key, i) => { translationLinesByKey[key] = translationLinesArr[i]; });

        const findBySegId = (lineMap, segId) => [...lineMap.values()].find(v => v.segmentId === segId);

        if (titleSegId) {
            const rootTitle = findBySegId(rootLines, titleSegId) || findBySegId(titleRootLine, titleSegId);
            if (rootTitle) suttaRes.titles.root = rootTitle.text;
            for (const key of translationKeys) {
                const t = findBySegId(translationLinesByKey[key], titleSegId);
                if (t) suttaRes.titles[key] = t.text;
            }
        }

        const buildSegFromLines = (segId) => {
            const rootLine = findBySegId(rootLines, segId);
            const variantLine = findBySegId(variantLines, segId);
            const translations = {};
            for (const key of translationKeys) {
                const t = findBySegId(translationLinesByKey[key], segId);
                if (t) translations[key] = t.text;
            }
            return {
                segment: segId,
                root_text: rootLine ? rootLine.text : '',
                variant: variantLine ? variantLine.text : '',
                html: skeletonDB[suttaId]?.html?.[segId] || '',
                translations
            };
        };

        const uniqueWordsSet = new Set();
        let matchCount = 0;
        const processText = (text, isVariant = false) => {
            if (!text) return;
            const m = text.match(regex);
            if (m) {
                matchCount += m.length;
                if (isVariant) globalHasVariants = true;
            }
            (text.match(wordRegex) || []).forEach(w => uniqueWordsSet.add(w.toLowerCase()));
        };

        const lineNumberBySegId = new Map([...rootLines.entries()].map(([ln, v]) => [v.segmentId, ln]));

        const enrichedSegments = [];
        for (const seg of suttaRes.segments) {
            const mainSeg = buildSegFromLines(seg.segment);

            processText(mainSeg.root_text, false);
            processText(mainSeg.variant, true);
            Object.values(mainSeg.translations).forEach(t => processText(t, false));

            mainSeg.lb_context = [];
            mainSeg.la_context = [];

            const anchorLine = lineNumberBySegId.get(seg.segment);
            if (anchorLine != null) {
                for (let ln = anchorLine - lb; ln < anchorLine; ln++) {
                    if (rootLines.has(ln)) mainSeg.lb_context.push(buildSegFromLines(rootLines.get(ln).segmentId));
                }
                for (let ln = anchorLine + 1; ln <= anchorLine + la; ln++) {
                    if (rootLines.has(ln)) mainSeg.la_context.push(buildSegFromLines(rootLines.get(ln).segmentId));
                }
            }

            enrichedSegments.push(mainSeg);
        }

        suttaRes.segments = enrichedSegments;
        suttaRes.count = matchCount;
        globalTotalMatches += matchCount;
        suttaRes.unique_words = Array.from(uniqueWordsSet);
    }));

    return { globalTotalMatches, globalHasVariants };
}

// searchWithGrep: composition of the phases above. Reproduces the pre-refactor monolithic
// function's exact output for the default (no-flag) /search path — same name/signature so
// nothing else in this file needs to change.
async function searchWithGrep(keyword, searchScope, exactMatch, targetLangs, lb = 0, la = 0) {
    const { searchResults, empty } = await buildMatchSkeleton(keyword, searchScope, exactMatch, targetLangs);

    if (empty === 'no-targets') {
        return { metadata: { query: keyword, totalFiles: 0, totalMatches: 0, hasVariantMatch: false }, data: {} };
    }
    const suttaIds = Object.keys(searchResults);
    if (empty === 'no-matches' || suttaIds.length === 0) {
        return { metadata: { query: keyword, langs: targetLangs, totalFiles: 0, totalMatches: 0, hasVariantMatch: false }, data: {} };
    }

    const { globalTotalMatches, globalHasVariants } = await enrichSuttaBatch(searchResults, suttaIds, targetLangs, keyword, lb, la);
    const wordReport = buildWordReport(searchResults);
    const sortedData = sortSuttaResults(searchResults);

    return {
        metadata: {
            query: keyword,
            scope: searchScope || 'default',
            langs: targetLangs,
            lb, la, exactMatch,
            totalFiles: Object.keys(sortedData).length,
            totalMatches: globalTotalMatches,
            hasVariantMatch: globalHasVariants
        },
        data: sortedData,
        wordReport
    };
}

// Полный текст одной сутты (все сегменты, не только совпадения) — для ридера.
// Переиспользует те же хелперы, что и поиск, просто без grep-фильтра.
async function getFullTextData(suttaId, targetLangs) {
    const suttaMeta = skeletonDB[suttaId];
    if (!suttaMeta) return null;

    const rootPath = getRootPath(suttaId);
    const rootData = rootPath
        ? JSON.parse(await fs.readFile(rootPath, 'utf8').catch(() => '{}'))
        : {};

    const variantPath = getVariantPath(suttaId);
    const variantData = variantPath
        ? JSON.parse(await fs.readFile(variantPath, 'utf8').catch(() => '{}'))
        : {};

    const translationFiles = await findTranslationFiles(suttaId, targetLangs);
    const translationsData = {};
    for (const [transKey, tPath] of Object.entries(translationFiles)) {
        translationsData[transKey] = JSON.parse(await fs.readFile(tPath, 'utf8').catch(() => '{}'));
    }

    const segments = Object.keys(rootData).map(id => {
        const tr = {};
        for (const tKey in translationsData) {
            if (translationsData[tKey][id]) tr[tKey] = translationsData[tKey][id];
        }
        return {
            segment: id,
            root_text: rootData[id] || '',
            variant: variantData[id] || '',
            html: suttaMeta.html?.[id] || '',
            translations: tr
        };
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

app.get('/api/text/:suttaId', async (req, res) => {
    const suttaId = req.params.suttaId.toLowerCase();
    const targetLangs = (req.query.langs || 'ru,en').split(',').map(l => l.trim());

    try {
        const data = await getFullTextData(suttaId, targetLangs);
        if (!data) return res.status(404).json({ error: `Unknown sutta id: ${suttaId}` });
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error.' });
    }
});

app.get('/search', async (req, res) => {
    const keyword = req.query.q;
    if (!keyword) return res.status(400).json({ error: 'Parameter "q" is mandatory.' });

    const scope      = req.query.scope || 'default';
    const exact      = req.query.exact === 'true';
    const targetLangs = (req.query.langs || 'ru,en').split(',').map(l => l.trim());
    const lb         = parseInt(req.query.lb) || 0;
    const la         = parseInt(req.query.la) || 0;

    try {
        // TODO.md поиск п.5: ?fast=1 skips per-sutta file reads entirely — grep-only skeleton
        // + full wordReport, quotes/context arrive later via /search/enrich.
        if (req.query.fast === '1') {
            return res.json(await buildFastResponse(keyword, scope, exact, targetLangs));
        }
        res.json(await searchWithGrep(keyword, scope, exact, targetLangs, lb, la));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error.' });
    }
});

// Phase 2 (TODO.md поиск п.5): enrich a known set of sutta ids with full segment/quote data.
// Client calls this with the ids of the currently visible page (from a prior ?fast=1 call),
// then again for further pages/background load. Response shape matches /search's data[id].
app.get('/search/enrich', async (req, res) => {
    const keyword = req.query.q;
    const idsParam = req.query.ids;
    if (!keyword) return res.status(400).json({ error: 'Parameter "q" is mandatory.' });
    if (!idsParam) return res.status(400).json({ error: 'Parameter "ids" is mandatory.' });

    const scope      = req.query.scope || 'default';
    const exact      = req.query.exact === 'true';
    const targetLangs = (req.query.langs || 'ru,en').split(',').map(l => l.trim());
    const lb         = parseInt(req.query.lb) || 0;
    const la         = parseInt(req.query.la) || 0;
    const requestedIds = idsParam.split(',').map(s => s.trim()).filter(Boolean);

    try {
        const { searchResults, empty } = await buildMatchSkeleton(keyword, scope, exact, targetLangs, requestedIds);
        const suttaIds = Object.keys(searchResults);
        if (empty || suttaIds.length === 0) return res.json({ data: {} });

        await enrichSuttaBatch(searchResults, suttaIds, targetLangs, keyword, lb, la);
        res.json({ data: sortSuttaResults(searchResults) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error.' });
    }
});

// Чистые URL: /dn22 → ридер, /dn22:12.1 → ридер с прокруткой к сегменту (разбор ":" — на клиенте).
// Старый формат /?q=dn22#12.1 продолжает работать без изменений (см. res/index.html, megareader.js).
app.get('/:slug', (req, res) => {
    const rawSlug = req.params.slug;
    const suttaId = rawSlug.split(':')[0].toLowerCase();
    if (skeletonDB[suttaId]) {
        return res.sendFile(readerTemplatePath);
    }
    return res.redirect(`/nodejs/res/?q=${encodeURIComponent(rawSlug)}`);
});

app.listen(PORT, () => {
    console.log(`\n=== Dhamma.gift Server (dg-light.js) ===\n`);
    console.log(`SPA (new): http://localhost:${PORT}/spa/`);
    console.log(`API: http://localhost:${PORT}/search?q=kacchapa&scope=dhamma&langs=ru,en`);
    console.log(`Legacy UI: http://localhost:${PORT}/nodejs/res/?q=kacchapa&lb=1&la=2&scope=dhamma`);
    console.log(`Legacy Reader: http://localhost:${PORT}/dn22`);
    console.log(`\n`);
});
