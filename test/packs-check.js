// scripts/packs-check.js on a fake mobile-data: a pack that agrees, one rebuilt (same rows, other gzip bytes), one missing.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { checkPacks } = require('../scripts/packs-check.js');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'packs-check-'));
fs.mkdirSync(path.join(dir, 'packs'));
const rows = Buffer.from('the same rows '.repeat(500));
const good = zlib.gzipSync(Buffer.from('good')), published = zlib.gzipSync(rows, { level: 1 }), rebuilt = zlib.gzipSync(rows, { level: 9 });
fs.writeFileSync(path.join(dir, 'packs', 'a.1.db.gz'), good);
fs.writeFileSync(path.join(dir, 'packs', 'b.2.db.gz'), published);
const entry = (id, name, gz, raw) => ({ id, url: `packs/${name}`, bytes_gz: gz.length, sha256_gz: sha(gz), bytes: raw.length, sha256: sha(raw) });
const write = (packs) => fs.writeFileSync(path.join(dir, 'packs-manifest.json'), JSON.stringify({ build_id: 'x', packs }));
const read = () => JSON.parse(fs.readFileSync(path.join(dir, 'packs-manifest.json'), 'utf8')).packs;

(async () => {
    write([entry('a', 'a.1.db.gz', good, Buffer.from('good')), entry('b', 'b.2.db.gz', rebuilt, rows)]);
    let r = await checkPacks(dir);
    assert.deepStrictEqual([r.checked, r.fixed.length, r.problems.length], [2, 0, 1], 'without --fix a mismatch is reported');
    assert.strictEqual(read()[1].bytes_gz, rebuilt.length, 'without --fix the manifest stays');

    r = await checkPacks(dir, { fix: true });
    assert.deepStrictEqual([r.fixed.length, r.problems.length], [1, 0]);
    const b = read()[1];
    assert.deepStrictEqual([b.bytes_gz, b.sha256_gz, b.bytes, b.sha256], [published.length, sha(published), rows.length, sha(rows)],
        'the manifest takes the kept file\'s numbers');
    assert.strictEqual(fs.readFileSync(path.join(dir, 'packs', 'b.2.db.gz')).equals(published), true, 'the file keeps its bytes');
    assert.deepStrictEqual((await checkPacks(dir)).problems, [], 'agrees after the fix');

    write([...read(), entry('c', 'c.3.db.gz', good, Buffer.from('good'))]);
    r = await checkPacks(dir, { fix: true });
    assert.deepStrictEqual(r.problems, ['c.3.db.gz: no file'], 'a missing file cannot be fixed');

    const other = path.join(dir, 'new-manifest.json');
    fs.writeFileSync(other, JSON.stringify({ packs: [entry('b', 'b.2.db.gz', rebuilt, rows)] }));
    r = await checkPacks(dir, { manifest: other, fix: true });
    assert.strictEqual(JSON.parse(fs.readFileSync(other, 'utf8')).packs[0].sha256_gz, sha(published), '--manifest fixes that file');

    assert.deepStrictEqual(await checkPacks(path.join(dir, 'none')), { checked: 0, problems: [], fixed: [] }, 'no manifest, nothing to do');
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('packs-check: ok');
})().catch((e) => { console.error(e); process.exit(1); });
