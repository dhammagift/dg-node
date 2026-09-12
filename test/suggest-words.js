#!/usr/bin/env node
// suggest-words.js — "может быть, вы искали" (core/search-core.js suggestWords) на реальной dg.db.
// `npm run test-suggest`. Проверяет ровно то, что может незаметно сломаться: что опечатка находит
// настоящую форму из корпуса, что белиберда и кириллица не находят ничего, и что подсказка — это
// не то же самое слово, которое человек набрал.
const assert = require('assert');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const core = require('../core/search-core.js');

const DB = path.join(__dirname, '..', 'dg.db');
core.init({ searchDb: new DatabaseSync(DB, { readOnly: true }), DG_OFFLINE: '' });

// The vocabulary table is built by build-search-db.js. Without it suggestions are silently empty
// by design (search still works), so say so plainly instead of failing every assertion below.
const words = core.suggestWords('satipattana');
assert(words.length, 'таблица vocab пуста или отсутствует — пересоберите базу (npm run build-search-db)');

const found = q => core.suggestWords(q).map(w => w.word);

for (const [typo, expected] of [
    ['satipattana', 'satipaṭṭhānā'],   // gemination + aspiration + diacritics
    ['nibana', 'nibbāna'],                            // missing gemination
    ['kachapa', 'kacchapa'],                               // dropped letter
    ['bikkhave', 'bhikkhave'],                             // dropped aspirate
]) {
    const got = found(typo);
    assert(got.includes(expected), `${typo} → ожидали ${expected}, получили [${got.join(', ')}]`);
}

for (const nothing of ['kachcapxyz', 'sdfghjkl', 'сострадание', 'a', 'kacchapa mahā']) {
    assert.deepStrictEqual(found(nothing), [], `${nothing} не должно давать подсказок`);
}

// A word that IS in the corpus never suggests itself back: exact search already answered for it.
assert(!found('kacchapa').includes('kacchapa'), 'подсказка не должна повторять набранное слово');

console.log('suggest-words: ok');
