#!/usr/bin/env node
// word-forms.js - what the search's Words column takes from a line (owner 2026-11-07, Trello YjPfhcp0: half-cut
// words, dashes, notes from the edition readings). `node test/word-forms.js`, no network, no database.
const assert = require('assert');
const { wordFormsText, buildWordReportFast } = require('../core/search-core.js');

const v = 'odhastapatodo → ubhantarapaṭodo (sya-all, km); obhastapatodo (mr) | manoviññāṇadhātu → See 63, 65. (pts note)'
    + ' | + → evaṁ me sutaṁ (bjt) | pe → spelled out in full | rāgo → chanda-rāgo (pts) | chando → rūpacchando-- (pts)';
const t = wordFormsText(v, true);
assert(!/odhastapatodo|See 63|note|spelled|bjt|sya-all|\(/.test(t), t);   // readings only
assert(/ubhantarapaṭodo/.test(t) && /obhastapatodo/.test(t) && /evaṁ me sutaṁ/.test(t), t);
assert(/chandarāgo/.test(t), t);                                          // PTS hyphen joined
assert.strictEqual(wordFormsText('yadidaṁ—chandasampadā'), 'yadidaṁ—chandasampadā');   // root text kept as is

const words = report => report.map(w => w.word).sort();
const res = { sn1: { segments: [{ segment: 'sn1:1.1', root_text: 'yadidaṁ—chandasampadā chando', translations: {},
    variant: 'rāgo → chanda-rāgo (pts) | chando → rūpacchando-- (pts) | x → -chando (pts) | y → See chando. (pts note)' }] } };
assert.deepStrictEqual(words(buildWordReportFast(res, 'chand')), ['chandarāgo', 'chandasampadā', 'chando']);
// hidden with the variants: a word met only in variant lines
assert.deepStrictEqual(buildWordReportFast(res, 'chand').filter(w => w.variant).map(w => w.word), ['chandarāgo']);
console.log('word-forms: ok');
