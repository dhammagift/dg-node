// Snapshots /api/toc and /api/toc/book/:code from the LIVE dg-light.js server into static JSON
// files the offline shim serves verbatim (see app.js's fetch shim). TOC data doesn't vary per
// request beyond ?langs= (this app always ships ru+en, matching the only two language DBs it
// bundles — see build-offline-db.js) and is fully deterministic given the corpus +
// configs/reader/toc-books.json. Reimplementing the branch-title resolution (colophon lookups,
// curated SN overrides, etc — see dg-light.js's annotateTree/getBranchTitle/describeBook) client-
// side would duplicate a lot of intricate, one-off logic for data that only needs regenerating
// when the corpus or toc-books.json changes — the same cadence as core.db/lang_*.db.
//
// Deliberately isolated from dg-light.js like the rest of mobile/ (CLAUDE.md, project memory): this
// is a one-time BUILD step that happens to read dg-light.js's live HTTP output, not a runtime
// dependency — the running app never talks to dg-light.js, only to these pre-fetched JSON files.
//
// Usage: node build-toc-snapshot.js [--base=http://localhost:3000] [--langs=ru,en]
// Requires dg-light.js running locally at --base.

const fs = require('fs');
const path = require('path');

const TOC_BOOKS = require('../configs/reader/toc-books.json');
const OUT_DIR = path.join(__dirname, 'www', 'api-snapshots');

function parseArgs() {
    const args = { base: 'http://localhost:3000', langs: 'ru,en' };
    for (const arg of process.argv.slice(2)) {
        const [key, value] = arg.replace(/^--/, '').split('=');
        if (key === 'base') args.base = value;
        if (key === 'langs') args.langs = value;
    }
    return args;
}

// Flattens toc-books.json into the full list of book codes dg-light.js's /api/toc/book/:code
// accepts — same shape describeBook()/describeGroup() there iterate (books, extraBooks, and
// groups' own books/extraBooks one level down).
function collectBookCodes(tocBooks) {
    const codes = new Set();
    for (const [key, catData] of Object.entries(tocBooks)) {
        if (key === '_comment') continue;
        for (const b of catData.books || []) codes.add(b.code);
        for (const b of catData.extraBooks || []) codes.add(b.code);
        for (const group of catData.groups || []) {
            for (const b of group.books || []) codes.add(b.code);
            for (const b of group.extraBooks || []) codes.add(b.code);
        }
    }
    return [...codes];
}

async function main() {
    const { base, langs } = parseArgs();
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const tocRes = await fetch(`${base}/api/toc`);
    if (!tocRes.ok) throw new Error(`/api/toc: HTTP ${tocRes.status}`);
    fs.writeFileSync(path.join(OUT_DIR, 'toc.json'), JSON.stringify(await tocRes.json()), 'utf8');
    console.log('Snapshotted /api/toc');

    const codes = collectBookCodes(TOC_BOOKS);
    let ok = 0, failed = 0;
    for (const code of codes) {
        try {
            const res = await fetch(`${base}/api/toc/book/${encodeURIComponent(code)}?langs=${langs}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            fs.writeFileSync(path.join(OUT_DIR, `toc-book-${code}.json`), JSON.stringify(await res.json()), 'utf8');
            ok++;
        } catch (e) {
            console.warn(`Book ${code}: ${e.message}`);
            failed++;
        }
    }
    console.log(`Snapshotted ${ok}/${codes.length} book(s), ${failed} failed.`);
    if (failed > 0) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exit(1); });
