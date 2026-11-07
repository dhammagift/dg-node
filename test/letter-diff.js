#!/usr/bin/env node
// letter-diff.js - the reader's "Differences" marks (reader/megareader.js, the part between <letter-diff> marks; owner
// 2026-11-07, Trello qFyguxVl: the majority letter by letter over all the editions). `node test/letter-diff.js`.
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname, '../reader/megareader.js'), 'utf8');
const ctx = {};
vm.runInNewContext(src.slice(src.indexOf('// <letter-diff>'), src.indexOf('// </letter-diff>')) + ';this.diffMarks = diffMarks;', ctx);
// the texts with their marks shown: [letters], [whole words], ⟨a missing word's space⟩, ∅ a missing word at the edge
const show = texts => ctx.diffMarks(texts).map((r, i) => {
    let t = texts[i];
    if (t === undefined) return t;
    (r || []).slice().sort((a, b) => b[0] - a[0]).forEach(([a, b, c]) => {
        t = a === b ? t.slice(0, a) + '∅' + t.slice(a) : c.includes('gap') ? t.slice(0, a) + '⟨' + t.slice(a, b) + '⟩' + t.slice(b) : t.slice(0, a) + '[' + t.slice(a, b) + ']' + t.slice(b);
    });
    return t;
});
const eq = (texts, want) => {
    assert.deepStrictEqual(show(texts), want);
    assert.deepStrictEqual(show(texts.slice().reverse()), want.slice().reverse());   // the editions' order changes nothing
};
// a join or a split, punctuation, quotes, case, ṁ/ṃ: no difference (mn88 20.3, dn22 18.33)
eq(['“handa ca dāni mayaṁ, bhante', '‘handa cadāni mayaṃ bhante', 'handa cadāni mayaṃ bhante'],
    ['“handa ca dāni mayaṁ, bhante', '‘handa cadāni mayaṃ bhante', 'handa cadāni mayaṃ bhante']);
eq(['Katamañca, bhikkhave, yampicchaṁ', 'katamañca bhikkhave yam p’ icchaṃ'], ['Katamañca, bhikkhave, yampicchaṁ', 'katamañca bhikkhave yam p’ icchaṃ']);
// the minority's letter only, the same in every text that has it (dn22 1.1: evamme, Evam me against evaṁ me)
eq(['Evaṁ me sutaṁ—', 'evaṃ me sutaṃ:', 'evamme sutaṃ', 'Evam me sutaṃ.', 'Evaṃ me sutaṃ'],
    ['Evaṁ me sutaṁ—', 'evaṃ me sutaṃ:', 'eva[m]me sutaṃ', 'Eva[m] me sutaṃ.', 'Evaṃ me sutaṃ']);
// letters the majority has and this text lacks: the letter in their place (sāvatthi[ṃ]; an aspirate's h: its consonant)
eq(['sāvatthiyaṁ piṇḍāya', 'sāvatthiṃ piṇḍāya', 'sāvatthiyaṃ piṇḍāya'], ['sāvatthiyaṁ piṇḍāya', 'sāvatthi[ṃ] piṇḍāya', 'sāvatthiyaṃ piṇḍāya']);
eq(['kammāsadhammaṁ nāma', 'kammāsadammaṃ nāma', 'kammāsadhammaṃ nāma'], ['kammāsadhammaṁ nāma', 'kammāsa[d]ammaṃ nāma', 'kammāsadhammaṃ nāma']);
// two texts, or a tie: both readings
eq(['rūpupādānakkhandho', 'rūpūpādānakkhandho'], ['rūp[u]pādānakkhandho', 'rūp[ū]pādānakkhandho']);
// a whole word missing: its space, or a bar at the line's edge; a word the others have not: whole
eq(['ekaṁ samayaṁ bhagavā kurūsu', 'ekaṃ bhagavā kurūsu', 'ekaṃ samayaṃ bhagavā kurūsu'],
    ['ekaṁ samayaṁ bhagavā kurūsu', 'ekaṃ⟨ ⟩bhagavā kurūsu', 'ekaṃ samayaṃ bhagavā kurūsu']);
eq(['Katamañca, bhikkhave, yampicchaṁ', 'yampicchaṃ', 'katamañca bhikkhave yampicchaṃ'],
    ['Katamañca, bhikkhave, yampicchaṁ', '∅yampicchaṃ', 'katamañca bhikkhave yampicchaṃ']);
eq(['bhagavā etadavoca', 'bhagavā etadavoca', 'bhagavā kho etadavoca'], ['bhagavā etadavoca', 'bhagavā etadavoca', 'bhagavā [kho] etadavoca']);
// a missing or extra word is a gap or a whole word, not letters of its neighbour (Ultra's QA 2026-11-07: mn88 4.5,
// dn22 21.34, dn2 57.2); a changed letter one mark (pj1 2.1.12 ki[n]nu); a hyphen or a dash moves no mark (dn22 9.1, dn2 87.2)
eq(['bhante āyasmā ānando', 'bhante āyasmā ānando', 'bhante ānando'], ['bhante āyasmā ānando', 'bhante āyasmā ānando', 'bhante⟨ ⟩ānando']);
eq(['taṃ tatiyaṃ jhānaṃ', 'tatiyaṃ jhānaṃ', 'tatiyaṃ jhānaṁ'], ['[taṃ] tatiyaṃ jhānaṃ', 'tatiyaṃ jhānaṃ', 'tatiyaṃ jhānaṁ']);
eq(['daṇḍalakkhaṇaṁ satthalakkhaṇaṁ asilakkhaṇaṁ', 'daṇḍalakkhaṇaṃ asilakkhaṇaṃ', 'daṇḍalakkhaṇaṃ satthalakkhaṇaṃ asilakkhaṇaṃ'],
    ['daṇḍalakkhaṇaṁ satthalakkhaṇaṁ asilakkhaṇaṁ', 'daṇḍalakkhaṇaṃ⟨ ⟩asilakkhaṇaṃ', 'daṇḍalakkhaṇaṃ satthalakkhaṇaṃ asilakkhaṇaṃ']);
eq(['kiṁ nu kho', 'kiṃ nu kho', 'athakho kinnu kho'], ['kiṁ nu kho', 'kiṃ nu kho', '[athakho] ki[n]nu kho']);
eq(['aṭṭhikasaṅkhalikaṁ', 'aṭṭhikasaṅkhalikaṃ', 'aṭṭhikasaṅkhalikaṃ', 'aṭṭhisaṅkhalikaṃ', 'aṭṭhi-saṅkhalikaṃ'],
    ['aṭṭhikasaṅkhalikaṁ', 'aṭṭhikasaṅkhalikaṃ', 'aṭṭhikasaṅkhalikaṃ', 'aṭṭhi[s]aṅkhalikaṃ', 'aṭṭhi-[s]aṅkhalikaṃ']);
eq(['ākāse; paṭhaviyāpi', 'ākāse—paṭhaviyāpi', 'ākāse, pathaviyāpi'], ['ākāse; paṭhaviyāpi', 'ākāse—paṭhaviyāpi', 'ākāse, pa[t]haviyāpi']);
// words swapped round: the moved word whole, not a letter of it (mn88 9.4: [mayaṁ] [t]aṁ), and no gap where the others have it
eq(['bhāsanti, mayaṁ taṁ sārato', 'bhāsanti, taṃ mayaṃ sārato'], ['bhāsanti, mayaṁ [taṁ] sārato', 'bhāsanti, [taṃ] mayaṃ sārato']);
// other scripts: a vowel sign is part of its letter, the Thai ฯ is no letter
eq(['सावत्थियं', 'सावत्थिं', 'सावत्थियं'], ['सावत्थियं', 'साव[त्थिं]', 'सावत्थियं']);   // त्थि: one glyph, one unit
eq(['โส ภควา ฯ', 'โส ภควา', 'โส ภควโต'], ['โส ภควา ฯ', 'โส ภควา', 'โส ภคว[โต]']);
// one text or none: nothing to compare
assert.deepStrictEqual(ctx.diffMarks(['evaṁ', undefined, '  ']), [null, null, null]);
console.log('letter-diff: ok');
