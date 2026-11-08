#!/usr/bin/env node
// The packs list (packs-manifest.json) against the files it names: each must be there with the manifest's bytes_gz and
// sha256_gz. The app checks the size and then the sum of every pack it downloads and throws away one that disagrees
// ("the downloaded pack has the wrong size", Sippa 2026-11-07: prod's manifest named 11-05 files with 11-07 numbers).
//
// Usage: node scripts/packs-check.js <mobile-data dir> [--manifest=<file>] [--fix]
//   <dir>/packs/<name> are the files; the manifest is <dir>/packs-manifest.json unless --manifest names another
//   (pull-db.sh checks the new one before it swaps it in).
//   --fix  a file that is there but disagrees keeps its bytes - one URL, one content, a cached copy stays valid - and the
//          manifest takes that file's numbers (bytes_gz, sha256_gz, and bytes/sha256 of the unpacked db). Same rows,
//          other gzip bytes is what a rebuild gives: the name is the rows' hash (build_id), built_at is not in it.
//   Exit 1 when a mismatch is left: a missing file, or one that disagrees without --fix. No manifest: nothing to check.
// The server runs it with fix at start (dg-fastify.js), the database build without (build-db.yml), pull-db.sh with.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

function hashFile(file, gunzip) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        let n = 0;
        let s = fs.createReadStream(file);
        if (gunzip) s = s.pipe(zlib.createGunzip());
        s.on('data', (b) => { h.update(b); n += b.length; });
        s.on('end', () => resolve({ sha: h.digest('hex'), n }));
        s.on('error', reject);
    });
}

async function checkPacks(dir, { manifest, fix = false } = {}) {
    const mf = manifest || path.join(dir, 'packs-manifest.json');
    let m, seen;
    try { seen = fs.statSync(mf); m = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch { return { checked: 0, problems: [], fixed: [] }; }
    const problems = [], fixed = [];
    for (const p of m.packs || []) {
        const name = path.basename(p.url || p.file || '');
        const f = path.join(dir, 'packs', name);
        let size;
        try { size = fs.statSync(f).size; } catch { problems.push(`${name}: no file`); continue; }
        const gz = await hashFile(f);
        if (size === p.bytes_gz && gz.sha === p.sha256_gz) continue;
        const what = `${name}: file ${size} B ${gz.sha.slice(0, 12)}, manifest ${p.bytes_gz} B ${String(p.sha256_gz).slice(0, 12)}`;
        if (!fix) { problems.push(what); continue; }
        let raw;
        try { raw = await hashFile(f, true); } catch (e) { problems.push(`${what} - not a gzip (${e.message})`); continue; }
        Object.assign(p, { bytes_gz: size, sha256_gz: gz.sha, bytes: raw.n, sha256: raw.sha });
        fixed.push(what);
    }
    // The hashing takes a while: pull-db.sh may have swapped in a new list meanwhile (it restarts the server before it
    // publishes the packs) - writing this one back would put the old list over it (Ultra's review 2026-11-08).
    const now = (() => { try { return fs.statSync(mf); } catch { return null; } })();
    if (fixed.length && (!now || now.ino !== seen.ino || now.mtimeMs !== seen.mtimeMs || now.size !== seen.size)) {
        problems.push('the manifest changed meanwhile - left as is, the next check sees the new one');
        fixed.length = 0;
    }
    if (fixed.length) {
        const tmp = `${mf}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(m, null, 2) + '\n');
        fs.renameSync(tmp, mf);
    }
    return { checked: (m.packs || []).length, problems, fixed };
}

module.exports = { checkPacks };

if (require.main === module) {
    const args = process.argv.slice(2);
    const dir = args.find((a) => !a.startsWith('--'));
    if (!dir) { console.error('usage: packs-check.js <mobile-data dir> [--manifest=<file>] [--fix]'); process.exit(2); }
    const manifest = (args.find((a) => a.startsWith('--manifest=')) || '').slice(11) || undefined;
    checkPacks(dir, { manifest, fix: args.includes('--fix') }).then((r) => {
        for (const x of r.fixed) console.log(`packs: ${x} - kept the file, the manifest takes its numbers`);
        for (const x of r.problems) console.error(`packs: ${x}`);
        console.log(`packs: ${r.checked} checked, ${r.fixed.length} fixed, ${r.problems.length} wrong`);
        process.exit(r.problems.length ? 1 : 0);
    }, (e) => { console.error(`packs: ${e.message}`); process.exit(1); });
}
