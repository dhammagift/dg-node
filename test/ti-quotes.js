// Self-check for word-final "ti" after a closing quote (core/search-core.js tiQuoteVariants):
// avisayasminti must also search avisayasmin”ti / ’ti / ’”ti / ”’ti. Run: node test/ti-quotes.js
const assert = require('assert');
const { tiQuoteVariants } = require('../core/search-core.js');

assert.deepStrictEqual(tiQuoteVariants('avisayasminti'),
    ['avisayasminti', 'avisayasmin”ti', 'avisayasmin’ti', 'avisayasmin’”ti', 'avisayasmin”’ti']);
assert.deepStrictEqual(tiQuoteVariants('kacchapa'), ['kacchapa']);   // no "ti": unchanged
assert.deepStrictEqual(tiQuoteVariants('ti'), ['ti']);               // bare "ti" is not word-final after a letter
assert.deepStrictEqual(tiQuoteVariants('tissa'), ['tissa']);         // "ti" inside a word: unchanged
const two = tiQuoteVariants('bhāsitanti vadāmīti');
assert.strictEqual(two.length, 25);                                    // both word-final "ti" vary
assert.ok(two.includes('bhāsitan’ti vadāmī”ti'));
console.log('ti-quotes: ok');
