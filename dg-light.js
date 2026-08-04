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
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
app.use('/nodejs/res', express.static(path.join(__dirname, 'res')));
app.use('/nodejs', express.static(__dirname));
app.use('/reader', express.static(path.join(__dirname, 'reader')));

// Офлайн-зеркала сторонних сайтов — /{имя-папки}/... отдаётся как статика напрямую из offline-data
for (const name of offlineMirrors) {
    app.use(`/${name}`, express.static(path.join(OFFLINE_MIRRORS_ROOT, name)));
}

// Страница поиска — главная точка входа
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

// Поиск файлов переводов по suttaId (без предварительного индекса)
// Возвращает { "ru_o": "/path/to/file.json", "en_sujato": "...", ... }
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

    return results;
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

async function searchWithGrep(keyword, searchScope, exactMatch, targetLangs, lb = 0, la = 0) {
    const grepDirs = buildGrepDirs(targetLangs);

    if (grepDirs.length === 0) {
        return { metadata: { query: keyword, totalFiles: 0, totalMatches: 0, hasVariantMatch: false }, data: {} };
    }

    const grepArgs = ['-ri'];
    if (exactMatch) grepArgs.push('-w');
    grepArgs.push(keyword, ...grepDirs);

    let stdout = '';
    try {
        const result = await execFile('grep', grepArgs, { maxBuffer: 1024 * 1024 * 50 });
        stdout = result.stdout;
    } catch (error) {
        if (error.code === 1) {
            return { metadata: { query: keyword, langs: targetLangs, totalFiles: 0, totalMatches: 0, hasVariantMatch: false }, data: {} };
        }
        throw error;
    }

    const defaultPrefixes = ['dn', 'mn', 'sn', 'an', 'ud', 'snp', 'dhp', 'thag', 'thig', 'iti', 'bu-', 'bi-', 'pli-tv-', 'kd', 'pvr'];
    let allowedPrefixes = [];

    if (!searchScope || searchScope === 'default') {
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

        const fileName = path.basename(match[1]);
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

        let segmentId = 'unknown';
        try {
            const cleanLine = match[2].trim().replace(/,$/, '');
            segmentId = Object.keys(JSON.parse(`{${cleanLine}}`))[0];
        } catch (e) {
            const fb = match[2].trim().match(/^"([^"]+)"\s*:\s*"(.*)"\s*,?$/);
            if (fb) segmentId = fb[1];
        }

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

        if (!searchResults[suttaId].segments.some(s => s.segment === segmentId)) {
            searchResults[suttaId].segments.push({ segment: segmentId });
        }
    }

    const regex = new RegExp(keyword, 'gi');
    const wordRegex = new RegExp(`[^\\s,.:;!?"'""''()\\[\\]{}]*${keyword}[^\\s,.:;!?"'""''()\\[\\]{}]*`, 'gi');

    let globalTotalMatches = 0;
    let globalHasVariants = false;

    for (const suttaId in searchResults) {
        const suttaRes = searchResults[suttaId];
        const uniqueWordsSet = new Set();
        let matchCount = 0;

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

        // Заголовок из root-файла
        let titleSegId = '';
        let lastZero = '';
        for (const k of Object.keys(rootData)) {
            if (k.match(/:0(?:\.\d+)?$/)) { lastZero = k; }
            else if (k.match(/:[1-9]/)) { titleSegId = lastZero; break; }
        }
        if (!titleSegId) titleSegId = lastZero;

        if (titleSegId) {
            if (rootData[titleSegId]) suttaRes.titles.root = rootData[titleSegId];
            for (const tKey in translationsData) {
                if (translationsData[tKey][titleSegId]) suttaRes.titles[tKey] = translationsData[tKey][titleSegId];
            }
        }

        const rootKeys = Object.keys(rootData);

        const buildSegData = (id) => {
            const tr = {};
            for (const tKey in translationsData) {
                if (translationsData[tKey][id]) tr[tKey] = translationsData[tKey][id];
            }
            return {
                segment: id,
                root_text: rootData[id] || '',
                variant: variantData[id] || '',
                html: skeletonDB[suttaId]?.html?.[id] || '',
                translations: tr
            };
        };

        const processText = (text, isVariant = false) => {
            if (!text) return;
            const m = text.match(regex);
            if (m) {
                matchCount += m.length;
                if (isVariant) globalHasVariants = true;
            }
            (text.match(wordRegex) || []).forEach(w => uniqueWordsSet.add(w.toLowerCase()));
        };

        const enrichedSegments = [];
        for (const seg of suttaRes.segments) {
            const sId = seg.segment;
            const sIdx = rootKeys.indexOf(sId);
            const mainSeg = buildSegData(sId);

            processText(mainSeg.root_text, false);
            processText(mainSeg.variant, true);
            Object.values(mainSeg.translations).forEach(t => processText(t, false));

            mainSeg.lb_context = [];
            mainSeg.la_context = [];

            if (sIdx !== -1) {
                for (let i = Math.max(0, sIdx - lb); i < sIdx; i++) {
                    mainSeg.lb_context.push(buildSegData(rootKeys[i]));
                }
                for (let i = sIdx + 1; i <= Math.min(rootKeys.length - 1, sIdx + la); i++) {
                    mainSeg.la_context.push(buildSegData(rootKeys[i]));
                }
            }

            enrichedSegments.push(mainSeg);
        }

        suttaRes.segments = enrichedSegments;
        suttaRes.count = matchCount;
        globalTotalMatches += matchCount;
        suttaRes.unique_words = Array.from(uniqueWordsSet);
    }

    const categoryOrder = { dhamma: 1, khudakka: 2, vinaya: 3, abhi: 4, other: 5 };
    const sortedKeys = Object.keys(searchResults).sort((a, b) => {
        const oa = categoryOrder[searchResults[a].category] || 99;
        const ob = categoryOrder[searchResults[b].category] || 99;
        if (oa !== ob) return oa - ob;
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    const sortedData = {};
    for (const key of sortedKeys) {
        searchResults[key].segments.sort((s1, s2) =>
            s1.segment.localeCompare(s2.segment, undefined, { numeric: true, sensitivity: 'base' })
        );
        sortedData[key] = searchResults[key];
    }

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
        data: sortedData
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
        res.json(await searchWithGrep(keyword, scope, exact, targetLangs, lb, la));
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
    console.log(`Server: http://localhost:${PORT}/search?q=kacchapa&scope=dhamma&langs=ru,en`);
    console.log(`UI: http://localhost:${PORT}/nodejs/res/?q=kacchapa&lb=1&la=2&scope=dhamma`);
    console.log(`Reader: http://localhost:${PORT}/dn22`);
});
