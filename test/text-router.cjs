// node test/text-router.cjs [dg.db] — every text id of the corpus must open its own text, plus the typed
// shorthands that broke live. A text the router does not know opens a search instead of the text.
const assert = require('assert');
const path = require('path');
const { DgTextRouter: R } = require('../public/overrides/js/dg-text-router.js');
const id = q => R.classify(q).id;
assert.strictEqual(id('pli-tv-bu-vb-ss13'), 'pli-tv-bu-vb-ss13'); // was rewritten to "...-sn13"
assert.strictEqual(id('pli-tv-bu-vb-sk20'), 'pli-tv-bu-vb-sk20');
assert.strictEqual(id('bu-ss3'), 'pli-tv-bu-vb-ss3');
assert.strictEqual(id('bu ss 3'), 'pli-tv-bu-vb-ss3');
assert.strictEqual(id('bu-vb-pc91'), 'pli-tv-bu-vb-pc91'); // the old site's form
assert.strictEqual(id('bu-pm'), 'pli-tv-bu-pm');
assert.strictEqual(id('ma1'), 'ma1'); // Madhyama Āgama, was opened as mn1
assert.strictEqual(id('ds1.1'), 'ds1.1');
assert.strictEqual(id('an11.992-1151'), 'an11.992-1151');
assert.strictEqual(id('s56.11'), 'sn56.11');
assert.strictEqual(id('sm56.11'), 'sn56.11');
assert.strictEqual(id('am3.70'), 'an3.70');
assert.strictEqual(id('m10'), 'mn10');
assert.strictEqual(R.classify('yathā').type, 'search');
assert.strictEqual(R.classify('sn36').type, 'chapter');

const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2] || path.join(__dirname, '..', 'dg.db'), { readOnly: true });
const bad = db.prepare('SELECT id FROM suttas').all().map(r => r.id).filter(x => id(x) !== x);
assert.deepStrictEqual(bad, [], bad.length + ' ids do not open their text: ' + bad.slice(0, 20).join(' '));
console.log('text-router ok');
