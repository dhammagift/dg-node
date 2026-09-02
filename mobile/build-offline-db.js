// Builds the offline SQLite databases the mobile app ships/downloads — replaces dg-light.js's
// live grep search, which needs an OS `grep` process a WebView can't spawn (see
// /root/.claude/plans/vast-questing-russell.md for the full "why").
//
// Deliberately standalone: does not require anything from dg-light.js, and dg-light.js does not
// require anything from here — the web server and the mobile app build must stay decoupled.
//
// Output:
//   mobile/dist/core.db      — pali root + variant + html, mandatory, ships with the app
//   mobile/dist/lang_<code>.db — one optional file per language, user downloads what they want
//
// ponytail: FTS4, not FTS5 — the client reads these files with sql.js (pure JS/WASM in the
// WebView, no native plugin, fully testable in Node without a device), and sql.js's prebuilt
// binary has no FTS5 module (verified empirically). FTS4 covers our MATCH-based search fine;
// upgrade path if FTS5 ranking/features are ever needed: switch the client to
// @capacitor-community/sqlite (native, has FTS5) instead of sql.js.
//
// Usage:
//   node build-offline-db.js                          — full corpus, langs ru+en
//   node build-offline-db.js --suttas=dn22,mn1 --langs=ru,en   — small test build

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const {
    SC_BILARA, buildTranslationIndex,
} = require('./lib/translation-sources');

const SKELETON_PATH = path.join(__dirname, '..', 'dg_db_light.json');
const OUT_DIR = path.join(__dirname, 'dist');

function parseArgs() {
    const args = { langs: ['ru', 'en'] };
    for (const arg of process.argv.slice(2)) {
        const [key, value] = arg.replace(/^--/, '').split('=');
        if (key === 'suttas') args.suttas = value.split(',');
        if (key === 'langs') args.langs = value.split(',');
    }
    return args;
}

async function readJsonIfExists(filePath) {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (e) {
        return null;
    }
}

// Mirrors dg-light.js's findTitleSegmentIdRecursive: the title is the LAST segment in the file
// whose id has major index 0 (":0" or ":0.N", e.g. "dn1:0.4") — SC Bilara root files list book/
// vagga/collection headers before the sutta's own title at that same "0.N" level, in file order,
// so "last one" is the actual sutta title. JS object key order preserves JSON file order, so a
// plain forward scan replicates the grep-based "last match wins" behavior exactly.
function findTitleSegId(suttaId, root) {
    const re = new RegExp(`^${suttaId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:0(\\.\\d+)?$`);
    let found = null;
    for (const segmentId of Object.keys(root || {})) if (re.test(segmentId)) found = segmentId;
    return found;
}

function buildCoreDb(suttaIds, skeleton) {
    const dbPath = path.join(OUT_DIR, 'core.db');
    fsSync.rmSync(dbPath, { force: true });
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
        CREATE TABLE suttas (id TEXT PRIMARY KEY, category TEXT, dir_path TEXT, title TEXT, mr INTEGER, title_seg_id TEXT);
        CREATE TABLE segments (sutta_id TEXT, segment_id TEXT, root TEXT, variant TEXT, html TEXT);
        CREATE VIRTUAL TABLE fts USING fts4(root, variant, segment_id, sutta_id, notindexed=segment_id, notindexed=sutta_id);
    `);
    const insertSutta = db.prepare('INSERT INTO suttas (id, category, dir_path, title, mr, title_seg_id) VALUES (?, ?, ?, ?, ?, ?)');
    const insertSegment = db.prepare('INSERT INTO segments (sutta_id, segment_id, root, variant, html) VALUES (?, ?, ?, ?, ?)');
    const insertFts = db.prepare('INSERT INTO fts (root, variant, segment_id, sutta_id) VALUES (?, ?, ?, ?)');

    return (async () => {
        const insertAll = db.transaction((suttaId, meta, root, variant, html) => {
            insertSutta.run(suttaId, meta.category, meta.dir_path, meta.title, meta.mr, findTitleSegId(suttaId, root));
            for (const [segmentId, rootText] of Object.entries(root || {})) {
                const variantText = variant ? (variant[segmentId] || null) : null;
                const htmlText = html ? (html[segmentId] || null) : null;
                insertSegment.run(suttaId, segmentId, rootText, variantText, htmlText);
                insertFts.run(rootText, variantText, segmentId, suttaId);
            }
        });

        let done = 0;
        for (const suttaId of suttaIds) {
            const meta = skeleton[suttaId];
            if (!meta) continue;
            const root = await readJsonIfExists(path.join(SC_BILARA, 'root', meta.dir_path, `${suttaId}_root-pli-ms.json`));
            if (!root) continue; // no root text on disk — nothing to index for this id
            const variant = await readJsonIfExists(path.join(SC_BILARA, 'variant', meta.dir_path, `${suttaId}_variant-pli-ms.json`));
            const html = await readJsonIfExists(path.join(SC_BILARA, 'html', meta.dir_path, `${suttaId}_html.json`));
            insertAll(suttaId, meta, root, variant, html);
            done++;
        }
        // Built AFTER the bulk insert (cheap: one sorted pass) rather than declared up front
        // (which would maintain the b-tree on every single INSERT). Without this, opening any
        // sutta did `WHERE sutta_id = ?` over the whole segments table with no index — a full
        // scan of the entire core.db on every text open (reported as "reading is slower than the
        // live site" — confirmed root cause, not sql.js/WASM overhead).
        db.exec('CREATE INDEX idx_segments_sutta ON segments(sutta_id);');
        db.close();
        return done;
    })();
}

async function buildLangDb(lang, suttaIds) {
    const dbPath = path.join(OUT_DIR, `lang_${lang}.db`);
    fsSync.rmSync(dbPath, { force: true });
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
        CREATE TABLE translations (sutta_id TEXT, segment_id TEXT, translator TEXT, text TEXT);
        CREATE VIRTUAL TABLE fts USING fts4(text, segment_id, sutta_id, translator, notindexed=segment_id, notindexed=sutta_id, notindexed=translator);
    `);
    const insertTranslation = db.prepare('INSERT INTO translations (sutta_id, segment_id, translator, text) VALUES (?, ?, ?, ?)');
    const insertFts = db.prepare('INSERT INTO fts (text, segment_id, sutta_id, translator) VALUES (?, ?, ?, ?)');
    const insertAll = db.transaction((suttaId, translator, segments) => {
        for (const [segmentId, text] of Object.entries(segments)) {
            insertTranslation.run(suttaId, segmentId, translator, text);
            insertFts.run(text, segmentId, suttaId, translator);
        }
    });

    // buildTranslationIndex applies the same SOURCE_PRIORITY/filterPreferredTranslators logic as
    // the live web search (see lib/translation-sources.js header). Passing `lang` as a multiFor
    // language too (3rd arg) makes it keep a second, "_other"-sourced translator per sutta when
    // one exists — the same "second opinion" dg-light.js's ee/mt reader modes show online — not
    // just the single preferred one; buildApiTextResponse (mobile/www/app.js) already forwards
    // whatever translator keys land in `translations` as-is, no client change needed for this.
    const bySutta = await buildTranslationIndex(suttaIds, [lang], [lang]);
    let rows = 0;
    for (const [suttaId, files] of bySutta) {
        for (const [transKey, filePath] of Object.entries(files)) {
            const segments = await readJsonIfExists(filePath);
            if (!segments) continue;
            insertAll(suttaId, transKey, segments);
            rows += Object.keys(segments).length;
        }
    }
    // Same fix as core.db's segments index — translationsForSegment() was doing
    // `WHERE sutta_id = ? AND segment_id = ?` over the whole (un-indexed) translations table,
    // once per segment per language, i.e. a full 65MB+ scan repeated N times per sutta opened.
    db.exec('CREATE INDEX idx_translations_lookup ON translations(sutta_id, segment_id);');
    db.close();
    return rows;
}

async function main() {
    const args = parseArgs();
    const skeleton = JSON.parse(await fs.readFile(SKELETON_PATH, 'utf8'));
    const suttaIds = args.suttas || Object.keys(skeleton);
    await fs.mkdir(OUT_DIR, { recursive: true });

    console.log(`Building core.db for ${suttaIds.length} sutta id(s)...`);
    const segCount = await buildCoreDb(suttaIds, skeleton);
    console.log(`core.db: ${segCount} suttas with root text indexed.`);
    // Catches a broken SC_BILARA path early and loud (readJsonIfExists swallows ENOENT per-file,
    // so a wrong data root silently produces a near-empty db instead of an error) — cheaper to
    // fail here than 20 minutes later when the offline app's TOC/search comes up empty.
    if (segCount === 0 && suttaIds.length > 0) {
        throw new Error('0 suttas indexed into core.db — SC_BILARA path is likely wrong or empty (see lib/translation-sources.js)');
    }

    for (const lang of args.langs) {
        console.log(`Building lang_${lang}.db...`);
        const rows = await buildLangDb(lang, suttaIds);
        console.log(`lang_${lang}.db: ${rows} translated segments indexed.`);
        if (rows === 0) throw new Error(`0 segments indexed into lang_${lang}.db — translation source path is likely wrong or empty`);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
