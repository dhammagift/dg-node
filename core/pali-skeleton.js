// pali-skeleton.js — one normalization shared by the vocabulary builder (build-search-db.js) and
// the "did you mean" lookup (core/search-core.js suggestWords). It has to be the same function on
// both sides: the builder stores a skeleton per word form, the query side computes one for what
// was typed, and they only meet if the rules match exactly.
//
// The idea: reduce a Pali word to the shape it is usually MIS-spelled as, so the most common
// mistakes cost a plain map lookup instead of an edit-distance scan. What gets folded is what
// Latin transcriptions of Pali actually disagree about:
//   diacritics   ā→a, ī→i, ū→u, ṭ→t, ḍ→d, ṇ→n, ḷ→l, ṁ→m, ṅ→n, ñ→n   (NFD + strip marks)
//   aspirates    th→t, dh→d, bh→b, kh→k, gh→g, ch→c, jh→j, ph→p
//   gemination   tt→t, dd→d, mm→m, …
//   nasals       m before a consonant or at the end ≡ n  (saṁ-, saṅ-, san-)
// So satipaṭṭhāna, satipatthana, satipattana and satipathana all collapse to "satipatana".
//
// Gemination is collapsed BEFORE the nasal rule on purpose: otherwise "kamma" would become
// "kanma" (m followed by m, not a vowel) and stop matching "kāma" → "kama", which is exactly the
// confusion this is supposed to catch.
function paliSkel(word) {
    return String(word)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z]/g, '')        // apostrophes, hyphens, digits — never meaningful here
        .replace(/([kgcjtdpb])h/g, '$1')
        .replace(/(.)\1+/g, '$1')
        .replace(/m(?![aeiou])/g, 'n');
}

module.exports = { paliSkel };

// Self-check: `node core/pali-skeleton.js`. The point of the file is that these groups collapse
// together and the last group does not — a rule change that breaks either direction shows up here.
if (require.main === module) {
    const assert = require('assert');
    for (const group of [
        ['satipaṭṭhāna', 'satipatthana', 'satipattana', 'satipathana'],
        ['nibbāna', 'nibbana', 'nibana', 'nibbāṇa'],
        ['kamma', 'kāma', 'kama'],
        ['saṁyojana', 'saṃyojana', 'saṅyojana', 'sanyojana'],
        ['buddha', 'budda', 'budha'],
    ]) {
        const skels = group.map(paliSkel);
        assert(skels.every(s => s === skels[0]), `${group.join('/')} → ${skels.join('/')}`);
    }
    assert.notStrictEqual(paliSkel('dhamma'), paliSkel('dhātu'));
    assert.strictEqual(paliSkel('kacchapa'), 'kacapa');
    console.log('pali-skeleton: ok');
}
