// Self-check for settings.js formatSlug(): a text inside a range file is saved as the text alone.
// Run: node test/format-slug.cjs
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../public/overrides/js/settings.js', 'utf8');
const formatSlug = new Function(src.slice(src.indexOf('const RANGE_TEXT_SLUG'), src.indexOf('async function addToSearchHistory')) + '; return formatSlug;')();
for (const [input, want] of [
    ['an1.11-20:an1.17:1.1', 'an1.17'],
    ['an1.11-20:an1.17', 'an1.17'],
    ['AN1.11-20:an1.17:1.1 Title', 'an1.17 Title'],
    ['sn56.48:1.4', 'sn56.48:1.4'],
    ['an1.11-20', 'an1.11-20'],
    ['kacchapa', 'kacchapa'],
    ['memo_Abc', 'memo_Abc'],
]) assert.strictEqual(formatSlug(input), want, input);
console.log('format-slug: ok');
