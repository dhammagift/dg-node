// Self-check: JS-side matchers ignore punctuation between a keyword's letters, the same marks the
// FTS index is built without (core/search-core.js punctTolerantPattern, build-search-db.js fts_fold).
// Run: node test/punct-search.js
const assert = require('assert');
const { punctTolerantPattern, stripSearchPunctuation } = require('../core/search-core.js');

const matches = (keyword, text) => new RegExp(punctTolerantPattern(keyword), 'i').test(text);

assert.ok(matches('avisayasminti', 'avisayasmin”ti'));
assert.ok(matches('avisayasminti', 'avisayasmin’”ti'));
assert.ok(matches('evam bhikkhave', 'evam, bhikkhave'));
assert.ok(matches('yanhidam', 'yanhi’dam'));
assert.ok(matches('kacchapa', 'mahakacchapa'));            // substring semantics unchanged
assert.ok(!matches('evam bhikkhave', 'evamx bhikkhave'));   // letters still have to be the letters
assert.ok(!matches('evam bhikkhave', 'evam. bhikkhave'));   // "." is not ignored (regex metachar)
assert.ok(matches('a.b', 'a.b') && !matches('a.b', 'axb')); // metachars in a plain keyword stay literal
// The index copy and the query drop the same marks, so a phrase meets itself either way.
assert.strictEqual(stripSearchPunctuation('“evaṁ, bhikkhave”'), 'evaṁ bhikkhave');
console.log('punct-search: ok');
