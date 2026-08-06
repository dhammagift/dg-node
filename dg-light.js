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

// Батчевая версия findTranslationFiles для целой страницы разом — узкое место, которое батчинг
// grep'а (см. ниже) не трогал: enrichSuttaBatch раньше звал findTranslationFiles ОТДЕЛЬНО на
// каждую сутту, а findFilesByPrefix каждый раз заново рекурсивно обходит ВЕСЬ каталог языка в
// поисках файлов одной сутты — для 785 сутт это 785 обходов одного и того же дерева (67 из 90
// секунд в профилировании). Тут — обходим каждый нужный каталог РОВНО ОДИН РАЗ, собирая индекс
// suttaId -> {transKey: filePath} для ВСЕХ файлов сразу, потом просто читаем нужные суттs из
// него. O(размер каталога) вместо O(число сутт × размер каталога); каталог не растёт с числом
// совпавших сутт, так что это ровно тот же принцип батчинга, что и у grep-функций выше — просто
// на fs.readdir, не на grep.
async function walkTranslationDir(dir, wantedIds, bySutta) {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) { return; }
    await Promise.all(entries.map(async entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await walkTranslationDir(full, wantedIds, bySutta);
            return;
        }
        if (!entry.isFile() || !entry.name.endsWith('.json')) return;
        const suttaId = entry.name.split('_')[0];
        if (!wantedIds.has(suttaId)) return;
        const baseName = entry.name.slice(0, -'.json'.length);
        const parts = baseName.split('-');
        if (parts.length < 3) return;
        const transKey = `${parts[1]}_${parts.slice(2).join('-')}`;
        if (!bySutta.has(suttaId)) bySutta.set(suttaId, {});
        bySutta.get(suttaId)[transKey] = toPosixPath(full);
    }));
}

async function buildTranslationIndex(suttaIds, targetLangs) {
    const searchDirs = [];
    for (const lang of targetLangs) {
        if (lang === 'all') {
            try {
                const langs = await fs.readdir(SC_TRANS);
                langs.forEach(l => searchDirs.push(path.join(SC_TRANS, l)));
            } catch (e) {}
            DG_LANGS.forEach(l => searchDirs.push(path.join(DG_OFFLINE, l)));
        } else {
            searchDirs.push(path.join(SC_TRANS, lang));
            DG_LANGS
                .filter(l => l === lang || l.startsWith(lang + '_'))
                .forEach(l => searchDirs.push(path.join(DG_OFFLINE, l)));
        }
    }

    const wantedIds = new Set(suttaIds);
    const bySutta = new Map(); // suttaId -> { transKey: filePath }

    await Promise.all([...new Set(searchDirs)].map(async dir => {
        if (!fsSync.existsSync(dir)) return;
        await walkTranslationDir(dir, wantedIds, bySutta);
    }));

    const result = new Map();
    for (const suttaId of suttaIds) {
        result.set(suttaId, filterPreferredTranslators(bySutta.get(suttaId) || {}));
    }
    return result;
}

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

// Тот же гибрид для root/variant grep (enrichSuttaBatch) — явный список файлов дешевле весь
// SC_ROOT/SC_VARIANT рекурсивно для маленького батча, дороже (и рискует ENAMETOOLONG) для
// большого. Один порог на обе оптимизации, т.к. природа компромисса одинаковая.
const GREP_FILELIST_THRESHOLD = TRANSLATION_INDEX_THRESHOLD;

async function findTranslationFilesForBatch(suttaIds, targetLangs) {
    if (suttaIds.length <= TRANSLATION_INDEX_THRESHOLD) {
        const result = new Map();
        await Promise.all(suttaIds.map(async suttaId => {
            const files = await findTranslationFiles(suttaId, targetLangs);
            const normalized = {};
            for (const [key, filePath] of Object.entries(files)) normalized[key] = toPosixPath(filePath);
            result.set(suttaId, normalized);
        }));
        return result;
    }
    return buildTranslationIndex(suttaIds, targetLangs);
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

// path.join() на Windows отдаёт путь с обратными слэшами — но grep -r (GNU grep через Git/MSYS)
// САМ строит пути при рекурсии и всегда использует прямые слэши, независимо от того, как был
// задан каталог на входе. Если хранить/искать по путям из path.join() как есть, а grep-результаты
// класть в ту же Map — ключи никогда не совпадут (только "C:\...\dn1..." vs "C:/.../dn1..."),
// и все per-sutta lookups после grepSegmentsWithContextRecursive() молча возвращают пусто.
// Нормализуем к прямым слэшам везде, где путь служит ключом Map — это единственное место,
// где это важно (fs.existsSync/fs.readFile на Windows одинаково едят оба варианта).
function toPosixPath(p) {
    return p ? p.replace(/\\/g, '/') : p;
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

// Легаси (C:\soft\dg\new\functions.sh) не передаёт grep'у списки файлов вообще — оно грепает
// маленький фиксированный набор ДИРЕКТОРИЙ рекурсивно (-r), и alternation по id сам отфильтровывает
// нужное. Наша первая версия батчинга передавала явные пути файлов (по одному на сутту) — при
// частом слове (785 сутт) это либо превышает лимит длины командной строки Windows (ENAMETOOLONG),
// либо (после чанкинга по файлам) даёт кучу мелких chunk'ов и всё равно медленно (~3 минуты на
// q=dukkha). Директории вместо файлов — тот же трюк, что у легаси: список аргументов больше не
// растёт с числом сутт, растёт только id-alternation (которую тоже чанкуем на случай очень
// большого корпуса, но это на порядки более редкий случай).
const GREP_ID_BUDGET = 12000; // символов на -e id-паттерны в одном вызове

function chunkByBudget(items, toArgString, budget) {
    const chunks = [];
    let current = [];
    let currentLen = 0;
    for (const item of items) {
        const len = toArgString(item).length + 1; // +1 разделитель
        if (current.length && currentLen + len > budget) {
            chunks.push(current);
            current = [];
            currentLen = 0;
        }
        current.push(item);
        currentLen += len;
    }
    if (current.length) chunks.push(current);
    return chunks;
}

// Рекурсивный point-lookup grep: фиксированный небольшой набор ДИРЕКТОРИЙ (не файлов сутт —
// список директорий не растёт с числом совпавших сутт), плюс lb/la контекст. GNU grep с -r и
// несколькими каталогами/файлами префиксует каждую строку именем файла ("path:42:content" для
// совпадения, "path-42-content" для контекстной строки -B/-A — проверено эмпирически). Всегда -F
// (fixed-string), id сегмента никогда не регекс. Возвращает
// Map<filePath, Map<lineNumber, {segmentId, text}>>.
async function grepSegmentsWithContextRecursive(dirs, segmentIds, lb = 0, la = 0) {
    const result = new Map();
    const existingDirs = [...new Set(dirs.filter(d => d && fsSync.existsSync(d)))];
    if (existingDirs.length === 0 || segmentIds.length === 0) return result;

    const baseArgs = ['-r', '-n', '-F'];
    if (lb > 0) baseArgs.push(`-B${lb}`);
    if (la > 0) baseArgs.push(`-A${la}`);

    const idChunks = chunkByBudget(segmentIds, id => `-e "${id}":`, GREP_ID_BUDGET);

    await Promise.all(idChunks.map(async idChunk => {
        const args = [...baseArgs];
        for (const segId of idChunk) args.push('-e', `"${segId}":`);
        args.push(...existingDirs);

        let stdout = '';
        try {
            const res = await execFile('grep', args, { maxBuffer: 1024 * 1024 * 20 });
            stdout = res.stdout;
        } catch (error) {
            if (error.code === 1) return; // no matches for this id chunk
            throw error;
        }

        for (const line of stdout.split('\n')) {
            if (!line.trim() || line === '--') continue;
            // Жадный .+ вместо [^:]+ — путь к файлу на Windows содержит двоеточие буквы диска
            // (C:/...); [:-] дважды — grep использует ":" для строк-совпадений и "-" для
            // контекстных строк (-B/-A), но никогда не смешивает разделители внутри одной строки.
            const m = line.match(/^(.+\.json)[:-](\d+)[:-](.*)$/);
            if (!m) continue;
            const parsed = parseJsonLineFragment(m[3]);
            if (!parsed) continue;
            if (!result.has(m[1])) result.set(m[1], new Map());
            result.get(m[1]).set(parseInt(m[2], 10), parsed);
        }
    }));

    return result;
}

// Рекурсивный title lookup — тот же паттерн (":0"-style front-matter, последний перед первым
// реальным сегментом) одинаков для ЛЮБОЙ сутты, грепаем ВЕСЬ каталог(и) сразу одним процессом
// (обычно только SC_ROOT). Возвращает Map<filePath, segmentId|null> — для файлов вне запрошенных
// суттs результат просто не запрашивается вызывающим кодом (лишние строки не мешают).
async function findTitleSegmentIdRecursive(dirs) {
    const result = new Map();
    const existingDirs = [...new Set(dirs.filter(d => d && fsSync.existsSync(d)))];
    if (existingDirs.length === 0) return result;

    let stdout = '';
    try {
        const res = await execFile('grep', ['-r', '-n', '-E', ':0(\\.[0-9]+)?":', ...existingDirs], { maxBuffer: 1024 * 1024 * 20 });
        stdout = res.stdout;
    } catch (error) {
        if (error.code === 1) return result;
        throw error;
    }

    // grep выдаёт совпадения каждого файла по возрастанию номера строки — просто перезаписываем
    // на каждой новой строке того же файла, последняя и останется (без -B/-A: разделитель ":").
    for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        const m = line.match(/^(.+\.json):(\d+):(.*)$/);
        if (!m) continue;
        const parsed = parseJsonLineFragment(m[3]);
        result.set(m[1], parsed ? parsed.segmentId : null);
    }

    return result;
}

// Phase 2: enrich a known set of matched suttas with full segment/quote data — root, variant,
// translations, and lb/la context — entirely via targeted grep, never a full-file JSON.parse.
// Батчинг по образцу C:\soft\dg\new\functions.sh (getPliFromLangFirst/getLangFromVarFirst):
// собрать все нужные id/файлы для ВСЕЙ страницы разом, один grep-процесс НА ТИП ФАЙЛА
// (root+context, недостающие title, variant, переводы), а не один на сутту — для страницы
// из ~25 сутт это ~4 процесса вместо ~100.
async function enrichSuttaBatch(searchResults, suttaIds, targetLangs, keyword, lb = 0, la = 0) {
    const regex = new RegExp(keyword, 'gi');
    const wordRegex = new RegExp(`[^\\s,.:;!?"'""''()\\[\\]{}]*${keyword}[^\\s,.:;!?"'""''()\\[\\]{}]*`, 'gi');
    let globalTotalMatches = 0;
    let globalHasVariants = false;

    // --- Сбор путей/id по каждой сутте. Root/variant — чисто детерминированные пути
    // (getRootPath/getVariantPath, из skeletonDB, без обращения к диску). Переводы —
    // buildTranslationIndex обходит каждый языковой каталог РОВНО ОДИН РАЗ для всей страницы
    // разом (не findTranslationFiles на каждую сутту по отдельности — это и был настоящий
    // бутылочное горлышко: 67 из 90 секунд в профилировании на 785 суттах, а не grep).
    const rootPathBySutta = new Map();
    const variantPathBySutta = new Map();
    const matchedSegIdsBySutta = new Map();

    for (const suttaId of suttaIds) {
        const suttaRes = searchResults[suttaId];
        if (!suttaRes) continue;
        rootPathBySutta.set(suttaId, toPosixPath(getRootPath(suttaId)));
        variantPathBySutta.set(suttaId, toPosixPath(getVariantPath(suttaId)));
        matchedSegIdsBySutta.set(suttaId, suttaRes.segments.map(s => s.segment));
    }
    const translationFilesBySutta = await findTranslationFilesForBatch(suttaIds, targetLangs);

    const allMatchedSegIds = [...new Set(suttaIds.flatMap(id => matchedSegIdsBySutta.get(id) || []))];

    // 1. Root + контекст. Тот же гибрид, что и с переводами (findTranslationFilesForBatch) —
    // grepSegmentsWithContextRecursive() одинаково принимает и файлы, и директории (-r у grep —
    // no-op на обычном файле), так что для маленькой страницы дешевле дать явный список из
    // ~десятков root-файлов (быстро — не сканирует остальные ~7500), а для большого батча —
    // [SC_ROOT] целиком (список аргументов не растёт с числом сутт, не упрётся в лимит длины
    // командной строки). Профилирование: явный список для 3 сутт был <1с; весь SC_ROOT — 4-12с
    // независимо от того, 3 сутты нужны или 785 (цена одинакова — это же дерево целиком).
    const rootTargets = suttaIds.length <= GREP_FILELIST_THRESHOLD
        ? [...new Set(Array.from(rootPathBySutta.values()))]
        : [SC_ROOT];
    const [rootLinesByFile, titleSegIdByFile] = await Promise.all([
        grepSegmentsWithContextRecursive(rootTargets, allMatchedSegIds, lb, la),
        findTitleSegmentIdRecursive(rootTargets)
    ]);

    // Пер-суттный window (все id, попавшие в root-контекст + title) — то, что нужно спросить
    // у variant/переводов на шагах 2-3.
    const windowSegIdsBySutta = new Map();
    const rootHasTitleBySutta = new Map();
    for (const suttaId of suttaIds) {
        const rootPath = rootPathBySutta.get(suttaId);
        const rootLines = rootLinesByFile.get(rootPath) || new Map();
        const titleSegId = titleSegIdByFile.get(rootPath) || null;
        const rootHasTitle = !!(titleSegId && [...rootLines.values()].some(v => v.segmentId === titleSegId));
        rootHasTitleBySutta.set(suttaId, rootHasTitle);
        windowSegIdsBySutta.set(suttaId, [...new Set(
            [...rootLines.values()].map(v => v.segmentId).concat(titleSegId ? [titleSegId] : [])
        )]);
    }

    // 2. Title-сегменты, не попавшие в lb/la-окно контекста — тот же рекурсивный SC_ROOT,
    // только с id title-сегментов вместо matchedSegIds (обычно их немного/ноль).
    const suttasNeedingTitleRoot = suttaIds.filter(id => {
        const titleSegId = titleSegIdByFile.get(rootPathBySutta.get(id));
        return titleSegId && !rootHasTitleBySutta.get(id);
    });
    const titleRootIds = [...new Set(suttasNeedingTitleRoot.map(id => titleSegIdByFile.get(rootPathBySutta.get(id))))];
    const titleRootLinesByFile = titleRootIds.length
        ? await grepSegmentsWithContextRecursive(rootTargets, titleRootIds, 0, 0)
        : new Map();

    // 3. Variant — тот же гибрид: явные файлы для маленькой страницы, весь SC_VARIANT для
    // большого батча.
    const allWindowSegIds = [...new Set(suttaIds.flatMap(id => windowSegIdsBySutta.get(id) || []))];
    const variantTargets = suttaIds.length <= GREP_FILELIST_THRESHOLD
        ? [...new Set(Array.from(variantPathBySutta.values()))]
        : [SC_VARIANT];
    const variantLinesByFile = await grepSegmentsWithContextRecursive(variantTargets, allWindowSegIds, 0, 0);

    // 4. Переводы — грепаем не список файлов сутт, а небольшой фиксированный набор РОДИТЕЛЬСКИХ
    // директорий уже выбранных (filterPreferredTranslators) файлов перевода (обычно 2-6 штук —
    // translation/ru, translation/en, dhammagift/ru и т.п. — не растёт с числом сутт). Сутта и
    // transKey уже известны из translationFilesBySutta (сами построили список файлов), не нужно
    // восстанавливать их из пути результата — просто игнорируем совпадения из файлов, которые
    // мы не выбирали (другой переводчик той же сутты в той же папке).
    const translationDirs = new Set();
    for (const suttaId of suttaIds) {
        for (const filePath of Object.values(translationFilesBySutta.get(suttaId) || {})) {
            translationDirs.add(path.dirname(filePath));
        }
    }
    const translationLinesByFile = await grepSegmentsWithContextRecursive([...translationDirs], allWindowSegIds, 0, 0);

    // --- Сборка результата по каждой сутте — та же логика, что раньше, просто читает из уже
    // готовых батчевых Map (по имени файла) вместо повторного grep на каждую сутту.
    for (const suttaId of suttaIds) {
        const suttaRes = searchResults[suttaId];
        if (!suttaRes) continue;

        const rootPath = rootPathBySutta.get(suttaId);
        const variantPath = variantPathBySutta.get(suttaId);
        const rootLines = rootLinesByFile.get(rootPath) || new Map();
        const titleRootLine = titleRootLinesByFile.get(rootPath) || new Map();
        const variantLines = variantLinesByFile.get(variantPath) || new Map();
        const titleSegId = titleSegIdByFile.get(rootPath) || null;

        const translationFiles = translationFilesBySutta.get(suttaId) || {};
        const translationKeys = Object.keys(translationFiles);
        const translationLinesByKey = {};
        for (const key of translationKeys) {
            translationLinesByKey[key] = translationLinesByFile.get(translationFiles[key]) || new Map();
        }

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
    }

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
