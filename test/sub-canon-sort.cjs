// Self-check for window.subCanonSort (public/overrides/js/settings.js): subscription texts
// "in order" follow the results table's order (an dn mn sn / kn / vin), not /search's match rank.
// Run: node test/sub-canon-sort.cjs
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'overrides', 'js', 'settings.js'), 'utf8');
const window = {};
eval(src.slice(src.indexOf('var SUB_NIKAYAS'), src.indexOf('window.subUpsert')));
// kacchapa as /search returns it (by MR): dn2 came first, which made "Next: dn2" before dn1.
assert.deepStrictEqual(
    window.subCanonSort(['dn2', 'mn129', 'dn1', 'sn20.9', 'sn35.240', 'thig16.1', 'thig12.1']),
    ['dn1', 'dn2', 'mn129', 'sn20.9', 'sn35.240', 'thig12.1', 'thig16.1']);
// Nikāyas alphabetically (an first), then Khuddaka books alphabetically, then Vinaya, then
// Abhidhamma; numbers compare as numbers.
assert.deepStrictEqual(
    window.subCanonSort(['pli-tv-kd1', 'ds1', 'thig1.1', 'dhp1-20', 'sn2.10', 'sn2.9', 'dn33', 'an4.146', 'an4.1460', 'an4.47']),
    ['an4.47', 'an4.146', 'an4.1460', 'dn33', 'sn2.9', 'sn2.10', 'dhp1-20', 'thig1.1', 'pli-tv-kd1', 'ds1']);
console.log('sub-canon-sort: ok');
