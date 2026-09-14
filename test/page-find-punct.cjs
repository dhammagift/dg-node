// Find on page (public/overrides/js/dg-page-find.js): a query typed without punctuation must match
// words written with apostrophes/quotes inside, as SuttaCentral texts do (avisayasmin’ti, bhikkhavo”ti).
// Run: node test/page-find-punct.cjs
const assert = require('assert');
const DGPageFind = require('../public/overrides/js/dg-page-find.js');
const f = Object.create(DGPageFind.prototype);
f.options = { wholeWord: false, ignorePunct: true, ignoreDiacritics: true, ignoreDoubles: true };
const q = f._norm('avisayasminti').out;
for (const text of ["avisayasmin'ti", 'avisayasmin"ti', 'avisayasmin’ti', 'avisayasmin‘ti', 'avisayasmin”ti',
  'avisayasmin“ti', 'avisayasmin’”ti', 'avisayasminʼti', 'avisayasmin`ti', 'avisayasmin„ti', 'Avisayasmin’ti.']) {
  assert.ok(f._norm(text).out.includes(q), `"${text}" should match "avisayasminti"`);
}
console.log('page find punctuation: ok');
