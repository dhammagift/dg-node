// build-mobile-db.js — the offline library: the slice of dg.db that every offline client uses (web
// PWA, TWA, the Android/iOS apps). It used to be produced outside this repository (the old app's
// mobile/dist/*.db, and on the test box a hand-made fixture), which meant the thing the site hands
// out was not built from the thing the site serves. Now it is: build-search-db.js makes dg.db, this
// makes dg-mobile.db out of it, and dg-fastify.js publishes both.
//
// Output (next to the served path):
//   siteroot/mobile-data/dg-mobile.db        the corpus slice + trigram FTS
//   siteroot/mobile-data/db-manifest.json    size, sha256, build id, langs, tokenizer
//
// Usage: node build-mobile-db.js [--langs=ru,en] [--source=dg.db] [--out=siteroot/mobile-data]
//
// The slice is defined by what the offline reader actually needs, and by what the phone measured:
//   suttas      — all of them (7605)
//   texts       — root + variant for every sutta, translations only for the chosen languages
//   html        — all segment markup (small, and /api/text returns it)
//   chunks      — per (sutta, kind, lang, translator) hash, the app's incremental-update unit
//   fts         — rebuilt from the sliced texts (external content table, hence 'rebuild')
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

function arg(name, fallback) {
    // --from is accepted as an alias for --source: that is the name the old app's build used, and the
    // test's build hint.
    for (const key of [name, name === 'source' ? 'from' : name]) {
        const hit = process.argv.slice(2).find((a) => a.startsWith(`--${key}=`));
        if (hit) return hit.slice(key.length + 3);
    }
    return fallback;
}

const LANGS = arg('langs', 'ru,en').split(',').map((s) => s.trim()).filter(Boolean);
const SOURCE = path.resolve(arg('source', path.join(__dirname, 'dg.db')));
const OUT_DIR = path.resolve(arg('out', path.join(__dirname, 'siteroot', 'mobile-data')));
const OUT_DB = path.join(OUT_DIR, 'dg-mobile.db');
const OUT_MANIFEST = path.join(OUT_DIR, 'db-manifest.json');
// Computed once, before anything is written: it goes both into the file's meta table and into the
// manifest, and the client insists they agree.
const BUILD_ID = buildId(LANGS);

const SCHEMA = `
CREATE TABLE suttas (id TEXT PRIMARY KEY, category TEXT, dir_path TEXT, title TEXT, mr INTEGER);
CREATE TABLE texts (sutta_id TEXT, segment_id TEXT, ord INTEGER,
                    kind TEXT, lang TEXT, translator TEXT, source TEXT, txt TEXT);
CREATE TABLE html (sutta_id TEXT, segment_id TEXT, ord INTEGER, txt TEXT);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID;
CREATE TABLE chunks (sutta_id TEXT, kind TEXT, lang TEXT, translator TEXT,
                     n INTEGER, hash TEXT,
                     PRIMARY KEY (sutta_id, kind, lang, translator)) WITHOUT ROWID;
CREATE INDEX idx_texts_sutta ON texts(sutta_id, kind);
CREATE INDEX idx_texts_lookup ON texts(sutta_id, kind, translator, ord);
CREATE INDEX idx_html_sutta ON html(sutta_id);
CREATE INDEX idx_texts_segid ON texts(segment_id);
CREATE VIRTUAL TABLE fts USING fts5(txt, content='texts', content_rowid='rowid',
                                    tokenize='trigram remove_diacritics 1');
`;

function buildId(langs) {
    // Derived from what the file contains, so two builds of the same corpus agree and a change of
    // languages or of dg.db is visible to every client (the web worker keeps several builds at once).
    const h = crypto.createHash('sha256');
    h.update('v1|' + langs.join(',') + '|');
    h.update(fs.readFileSync(SOURCE));
    return h.digest('hex').slice(0, 16);
}

function main() {
    if (!fs.existsSync(SOURCE)) {
        console.error(`no source database at ${SOURCE} — run 'npm run build-search-db' first`);
        process.exit(1);
    }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.rmSync(OUT_DB, { force: true });
    fs.rmSync(`${OUT_DB}-wal`, { force: true });
    fs.rmSync(`${OUT_DB}-shm`, { force: true });

    const t0 = Date.now();
    const db = new DatabaseSync(OUT_DB);
    db.exec('PRAGMA journal_mode = OFF');
    db.exec('PRAGMA synchronous = OFF');
    db.exec(SCHEMA);
    db.exec(`ATTACH DATABASE '${SOURCE.replace(/'/g, "''")}' AS src`);

    const langList = LANGS.map((l) => `'${l.replace(/'/g, "''")}'`).join(',');
    const slice = `(kind IN ('root','variant') OR (kind = 'translation' AND lang IN (${langList})))`;

    const suttas = db.prepare('INSERT INTO suttas SELECT * FROM src.suttas').run().changes;
    const texts = db.prepare(`INSERT INTO texts SELECT * FROM src.texts WHERE ${slice}`).run().changes;
    const html = db.prepare('INSERT INTO html SELECT * FROM src.html').run().changes;
    // meta is ours to define: the corpus built by build-search-db.js has no such table (only the old
    // app's slice did), so it is copied when it exists and filled with what clients may want.
    let meta = 0;
    const hasMeta = db.prepare("SELECT count(*) c FROM src.sqlite_master WHERE type='table' AND name='meta'").get().c > 0;
    if (hasMeta) meta = db.prepare('INSERT OR REPLACE INTO meta SELECT * FROM src.meta').run().changes;
    // The client checks that a stored file carries the build id its NAME claims (dg-mobile.<id>.db):
    // a file saved under an id it does not carry is treated as a download that stopped partway, so an
    // artifact without these rows is refused as "incomplete download" even when it is perfect. The old
    // app's slice had them; this builder has to write them itself.
    const metaRows = [
        ['schema_version', '1'],
        ['build_id', BUILD_ID],
        ['langs', LANGS.join(',')],
        ['fts', 'trigram'],
        ['source', path.basename(SOURCE)],
        ['built_at', new Date().toISOString()],
    ];
    const insMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
    for (const [k, v] of metaRows) insMeta.run(k, v);
    console.log(`suttas ${suttas}, texts ${texts}, html ${html}, meta ${meta} (${Date.now() - t0}ms)`);

    // Per-group hash: the unit the apps use to see what changed without re-downloading 480MB.
    // lang/translator are stored as '' (not NULL) for root/variant/html: the PRIMARY KEY of a WITHOUT
    // ROWID table cannot hold NULL — the first build died on exactly that constraint, and the existing
    // artifact shows '' is the convention the clients already expect.
    const tc = Date.now();
    const groups = db.prepare(`SELECT sutta_id, kind, coalesce(lang,'') lang, coalesce(translator,'') translator, count(*) n
                               FROM texts WHERE ${slice} GROUP BY 1,2,3,4`).all();
    const htmlGroups = db.prepare('SELECT sutta_id, count(*) n FROM html GROUP BY sutta_id').all();
    const insChunk = db.prepare('INSERT INTO chunks (sutta_id, kind, lang, translator, n, hash) VALUES (?,?,?,?,?,?)');
    const readTexts = db.prepare(`SELECT txt FROM texts WHERE sutta_id = ? AND kind = ? AND coalesce(lang,'') = ? AND coalesce(translator,'') = ? ORDER BY ord`);
    const readHtml = db.prepare('SELECT txt FROM html WHERE sutta_id = ? ORDER BY ord');
    db.exec('BEGIN');
    for (const g of groups) {
        const h = crypto.createHash('sha1');
        for (const t of readTexts.all(g.sutta_id, g.kind, g.lang, g.translator)) h.update(t.txt == null ? '' : String(t.txt));
        insChunk.run(g.sutta_id, g.kind, g.lang, g.translator, g.n, h.digest('hex'));
    }
    for (const g of htmlGroups) {
        const h = crypto.createHash('sha1');
        for (const t of readHtml.all(g.sutta_id)) h.update(t.txt == null ? '' : String(t.txt));
        insChunk.run(g.sutta_id, 'html', '', '', g.n, h.digest('hex'));
    }
    db.exec('COMMIT');
    const rows = { length: groups.length + htmlGroups.length };
    console.log('chunks ' + rows.length + ' hashed (' + (Date.now() - tc) + 'ms)');

    // External-content FTS: 'rebuild' re-reads the content table we just filled.
    const tf = Date.now();
    db.exec("INSERT INTO fts(fts) VALUES('rebuild')");
    db.exec('ANALYZE');
    console.log(`fts rebuilt (${Date.now() - tf}ms)`);
    db.exec('DETACH DATABASE src');
    db.exec('VACUUM');
    db.close();

    const bytes = fs.statSync(OUT_DB).size;
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(OUT_DB)).digest('hex');
    const manifest = {
        schema_version: 1,
        build_id: BUILD_ID,
        langs: LANGS.join(','),
        fts: 'trigram',
        source: 'dg.db',
        built_at: new Date().toISOString(),
        file: 'dg-mobile.db',
        bytes: bytes,
        sha256: sha256,
        chunks: rows.length,
        patches: [],
    };
    fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`\n${OUT_DB}: ${(bytes / 1048576).toFixed(1)} MB, build ${manifest.build_id}`);
    console.log(`${OUT_MANIFEST} written`);
    console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
