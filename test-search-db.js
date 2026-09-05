#!/usr/bin/env node
// Self-check for dg.db — the invariants build-search-db.js has to hold and that a silent build
// regression would break. Run: node test-search-db.js
const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'dg.db'), { readOnly: true });
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const phrase = w => `"${w.replace(/ё/g, 'е').replace(/"/g, '""')}"`;
const matches = w => one('SELECT count(*) c FROM fts WHERE fts MATCH ?', phrase(w)).c;

// Corpus is actually there.
assert.ok(one('SELECT count(*) c FROM suttas').c > 7000, 'suttas table looks empty');
assert.ok(one('SELECT count(*) c FROM texts').c > 1000000, 'texts table looks empty');
assert.ok(one('SELECT count(*) c FROM html').c > 400000, 'html table looks empty');
for (const kind of ['root', 'variant', 'translation']) {
    assert.ok(one('SELECT count(*) c FROM texts WHERE kind = ?', kind).c > 0, `no ${kind} rows`);
}

// trigram, not prefix matching: a keyword has to be found inside a longer word, which is what
// grep did and what the /search contract promises.
assert.ok(matches('kacchapa') > 0, 'kacchapa not found');
assert.ok(matches('acchap') > 0, 'substring inside a word not found — tokenizer is not trigram');

// Diacritics fold both ways (tokenizer), ё folds to е (done when the index is populated).
assert.ok(matches('nibbana') > 0 && matches('nibbāna') > 0, 'diacritic folding broken');
assert.strictEqual(matches('nibbana'), matches('nibbāna'), 'folded and unfolded disagree');
assert.strictEqual(matches('ещё'), matches('еще'), 'ё/е folding broken');

// AI translations are stored for the reader but must never be reachable through search.
const aiRows = one("SELECT count(*) c FROM texts WHERE translator = 'ai'").c;
assert.ok(aiRows > 0, 'ai translations missing from texts — the reader needs them');
const aiIndexed = one(`SELECT count(*) c FROM fts JOIN texts t ON t.rowid = fts.rowid
    WHERE fts MATCH ? AND t.translator = 'ai'`, phrase('Благословенный')).c;
assert.strictEqual(aiIndexed, 0, 'ai translations are reachable through search — must be hidden');

// One source copy wins per (sutta, segment, lang, translator): the losing copy must not also be
// stored, or the reader would show the segment twice. Grouped with `lang` on purpose — the same
// translator name legitimately appears under several languages (e.g. trush translates into both
// gu and hi), and those are different translations, not duplicates.
const dupe = one(`SELECT sutta_id, segment_id, lang, translator, count(*) c FROM texts
    WHERE kind = 'translation' GROUP BY sutta_id, segment_id, lang, translator HAVING c > 1 LIMIT 1`);
assert.strictEqual(dupe, undefined, `duplicate translation row: ${JSON.stringify(dupe)}`);

// ord is what reproduces grep's -B/-A context, so it must be a dense 0..n-1 run per file.
const ords = all(`SELECT ord FROM texts WHERE sutta_id = 'dn22' AND kind = 'root' ORDER BY ord`);
assert.ok(ords.length > 100, 'dn22 root segments missing');
ords.forEach((row, i) => assert.strictEqual(row.ord, i, `ord gap in dn22 at ${i}`));

// The queries the search path runs must use indexes, not scan 1.4M rows.
for (const [sql, param] of [
    ["EXPLAIN QUERY PLAN SELECT * FROM texts WHERE sutta_id = ? AND kind = 'root'", 'dn22'],
    ['EXPLAIN QUERY PLAN SELECT * FROM texts WHERE segment_id IN (?)', 'dn22:1.1'],
]) {
    const plan = all(sql, param).map(r => r.detail).join(' ');
    assert.ok(/USING (COVERING )?INDEX/.test(plan) && !/SCAN texts(?! USING)/.test(plan),
        `query would scan the table: ${plan}`);
}

db.close();
console.log('test-search-db: all checks passed');
