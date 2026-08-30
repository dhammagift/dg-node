// Translation-file discovery for the OFFLINE MOBILE APP build pipeline only.
// This is a standalone copy of dg-light.js's file-discovery logic (SOURCE_PRIORITY,
// translator-filename parsing, per-language priority filtering) — deliberately NOT required by
// dg-light.js and not requiring anything from it: the live web server must stay untouched and
// decoupled from the mobile app build. That means this file can drift from dg-light.js's copy
// if that logic changes there — re-sync manually (diff against dg-light.js's
// findTranslationFiles/SOURCE_PRIORITY/filterPreferredTranslators) if search results between
// web and mobile ever disagree.
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// SuttaCentral Bilara (пали root/variant/html + переводы) и DhammaGift offline (лучшие переводы
// проекта) — оба дерева читаются через один общий корень `siteroot/data/` (git-tracked symlink'и
// на реальные данные, см. CLAUDE.md "Публикация от корня сайта"). Same absolute layout is used
// by mobile/build-offline-db.js, no platform-specific paths needed here.
const DATA_ROOT = path.join(__dirname, '..', '..', 'siteroot', 'data');
const SC_BILARA = path.join(DATA_ROOT, 'suttacentral.net', 'sc-data', 'sc_bilara_data');

const SC_ROOT    = `${SC_BILARA}/root/pli/ms`;
const SC_VARIANT = `${SC_BILARA}/variant/pli/ms`;
const SC_TRANS   = `${SC_BILARA}/translation`;
const DG_LANGS   = ['ru', 'ru_other', 'en', 'en_other', 'ai'];

// DhammaGift offline — best translations of the project (one per language), flat structure
// (no per-translator subfolder like SC — DG historically has one main + one "other" translator
// per language, distinguished by filename): {DG_OFFLINE}/{lang}/sutta|vinaya/{nikaya}/
// {id}_translation-{lang}-{author}.json
const DG_OFFLINE = path.join(DATA_ROOT, 'dhammagift');

const TRANSLATOR_PRIORITY = require('../../configs/reader/translator-priority.json');

// Приоритет источников по языку — см. dg-light.js для полного объяснения (комментарий сохранён там).
const SOURCE_PRIORITY = {
    ru: ['dgmain', 'dgother', 'sc'],
    en: ['dgmain', 'sc', 'dgother'],
};
const DEFAULT_SOURCE_PRIORITY = ['dgmain', 'sc', 'dgother'];

function sourceWriteOrder(lang) {
    return [...(SOURCE_PRIORITY[lang] || DEFAULT_SOURCE_PRIORITY)].reverse();
}

function sourceDirsForLang(lang) {
    return {
        sc: [path.join(SC_TRANS, lang)],
        dgmain: DG_LANGS.filter(l => l === lang).map(l => path.join(DG_OFFLINE, l)),
        dgother: DG_LANGS.filter(l => l.startsWith(lang + '_')).map(l => path.join(DG_OFFLINE, l)),
    };
}

// Windows path separators normalized to posix — the only place this matters is when a path is
// used as a Map/object key (fs itself accepts either separator on Windows).
function toPosixPath(p) {
    return p ? p.replace(/\\/g, '/') : p;
}

function parseTranslationFilename(baseName, suttaId) {
    const suffix = baseName.slice(suttaId.length + 1); // "translation-ru-o"
    const parts = suffix.split('-');
    if (parts.length < 3 || parts[0] !== 'translation') return null;
    const lang = parts[1];
    const author = parts.slice(2).join('-');
    return { lang, author, transKey: `${lang}_${author}` };
}

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

async function collectTranslationFiles(dirs, suttaId, results) {
    await Promise.all(dirs.map(async dir => {
        if (!fsSync.existsSync(dir)) return;
        const files = await findFilesByPrefix(dir, suttaId);
        for (const filePath of files) {
            const baseName = path.basename(filePath, '.json');
            const parsed = parseTranslationFilename(baseName, suttaId);
            if (parsed) results[parsed.transKey] = filePath;
        }
    }));
}

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
            chosen = keys.find(k => k !== 'en_sujato');
        }

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

async function findTranslationFiles(suttaId, targetLangs, explicitTranslators, multiForLangs, skipPriorityFilter) {
    const results = {};

    if (targetLangs.includes('all')) {
        const scAllDirs = [];
        try {
            const langs = await fs.readdir(SC_TRANS);
            langs.forEach(l => scAllDirs.push(path.join(SC_TRANS, l)));
        } catch (e) {}
        const dgMainAllDirs = DG_LANGS.filter(l => !l.includes('_other')).map(l => path.join(DG_OFFLINE, l));
        const dgOtherAllDirs = DG_LANGS.filter(l => l.includes('_other')).map(l => path.join(DG_OFFLINE, l));
        await collectTranslationFiles(dgMainAllDirs, suttaId, results);
        await collectTranslationFiles(scAllDirs, suttaId, results);
        await collectTranslationFiles(dgOtherAllDirs, suttaId, results);
    } else {
        await Promise.all(targetLangs.map(async lang => {
            const dirsByGroup = sourceDirsForLang(lang);
            for (const group of sourceWriteOrder(lang)) {
                await collectTranslationFiles(dirsByGroup[group], suttaId, results);
            }
        }));
    }

    if (explicitTranslators && explicitTranslators.length) {
        const filtered = {};
        explicitTranslators.forEach(key => { if (results[key]) filtered[key] = results[key]; });
        return filtered;
    }

    if (skipPriorityFilter) return results;

    return filterPreferredTranslators(results, multiForLangs);
}

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
        const parsed = parseTranslationFilename(baseName, suttaId);
        if (!parsed) return;
        if (!bySutta.has(suttaId)) bySutta.set(suttaId, {});
        bySutta.get(suttaId)[parsed.transKey] = toPosixPath(full);
    }));
}

async function buildTranslationIndex(suttaIds, targetLangs) {
    const wantedIds = new Set(suttaIds);
    const bySutta = new Map();

    async function walkGroup(dirs) {
        await Promise.all([...new Set(dirs)].map(async dir => {
            if (!fsSync.existsSync(dir)) return;
            await walkTranslationDir(dir, wantedIds, bySutta);
        }));
    }

    if (targetLangs.includes('all')) {
        const scAllDirs = [];
        try {
            const langs = await fs.readdir(SC_TRANS);
            langs.forEach(l => scAllDirs.push(path.join(SC_TRANS, l)));
        } catch (e) {}
        const dgMainAllDirs = DG_LANGS.filter(l => !l.includes('_other')).map(l => path.join(DG_OFFLINE, l));
        const dgOtherAllDirs = DG_LANGS.filter(l => l.includes('_other')).map(l => path.join(DG_OFFLINE, l));
        await walkGroup(dgMainAllDirs);
        await walkGroup(scAllDirs);
        await walkGroup(dgOtherAllDirs);
    } else {
        await Promise.all(targetLangs.map(async lang => {
            const dirsByGroup = sourceDirsForLang(lang);
            for (const group of sourceWriteOrder(lang)) {
                await walkGroup(dirsByGroup[group]);
            }
        }));
    }

    const result = new Map();
    for (const suttaId of suttaIds) {
        result.set(suttaId, filterPreferredTranslators(bySutta.get(suttaId) || {}));
    }
    return result;
}

const TRANSLATION_INDEX_THRESHOLD = 80;

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

module.exports = {
    DATA_ROOT, SC_BILARA, SC_ROOT, SC_VARIANT, SC_TRANS, DG_LANGS, DG_OFFLINE,
    SOURCE_PRIORITY, DEFAULT_SOURCE_PRIORITY, sourceWriteOrder, sourceDirsForLang,
    toPosixPath, parseTranslationFilename, findFilesByPrefix, collectTranslationFiles,
    filterPreferredTranslators, findTranslationFiles, walkTranslationDir,
    buildTranslationIndex, findTranslationFilesForBatch, TRANSLATION_INDEX_THRESHOLD,
};
