#!/usr/bin/env node
// Translation linter, mechanical part (Trello r2Yw6stW, checks 5 and 3): how each translator renders each Pali term,
// measured over aligned segments of dg.db with no dictionary — a translation word counts as a rendering of a term when it
// is much more frequent in the segments holding the term than in that translator's segments overall.
// Usage: node scripts/term-lint.js dg.db > lint.json  (the review page is built from that JSON)
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2], { readOnly: true });

const TERMS = {
    'taṇhā': /taṇh/, 'upādāna': /upādān/, 'dukkha': /dukkh/, 'anicca': /anicc/, 'anattā': /anatt/,
    'bhava': /(?:^|[^a-zāīūṁṅñṭḍṇḷ])bhav(?:o|aṁ|ā|e|assa|ena|ānaṁ|esu)(?![a-zāīūṁ])(?![\s,]*(?:gotam|ānand|kassap|sāriput|moggall|kaccān|raṭṭhap|udāy|anuruddh|bhāradvāj|vacch))|bhavataṇh|bhavapaccay|bhavarāg|bhavāsav/,
    'vibhava': /vibhav/, 'pipāsā': /pipās/, 'tasinā/tasita': /tasin|tasit/, 'chanda': /chand/, 'rāga': /(?<!vi)rāg/,
    'nandī': /(?<![āa])nand(?!ak)/, 'sneha': /sneh/, 'ajjhosāna': /ajjhos/, 'pariyesanā': /pariyes/,
    'sati': /(?:^|[^a-zāīū])sat(?:i|iṁ|iyā|imā|imant)(?![a-zāīū])|satipaṭṭh|satisambojjh/, 'saṅkhāra': /saṅkhār/,
    'vitakka': /vitakk/, 'vicāra': /vicār/, 'viññāṇa': /viññāṇ/, 'vedanā': /vedan/, 'phassa': /phass/,
    'jāti': /(?:^|[^a-zāīū])jāti/, 'nibbāna': /nibbān/, 'nirodha': /nirodh/, 'samudaya': /samuday/, 'kāma': /(?:^|[^a-zāīū])kām/,
    'domanassa': /domanass/, 'upāyāsa': /upāyās/, 'virāga': /virāg/, 'āsava': /āsav/, 'avijjā': /avijj/,
    'paññā': /paññ/, 'samādhi': /samādh/, 'jhāna': /jhān/, 'mettā': /mett[aāā]/, 'sīla': /sīl/, 'cetanā': /cetan/,
    'patthanā': /patthan/, 'icchā': /(?:^|[^a-zāīū])icch/, 'āhāra': /āhār/, 'anusaya': /anusay/, 'saññā': /saññ/,
};
const TRANSLATORS = ['ru|o', 'ru|sv+edited+o', 'ru|sv', 'en|o', 'en|sujato', 'en|thanissaro', 'de|sabbamitta'];
const STOP = new Set('этот,такой,когда,котор,монах,бхикк,также,будда,which,there,those,these,where,bhikk,monks,mendi,because,about,their,would,sagte,diese,wenn,nicht,einen,einem,eines,schon'.split(','));
const stemOf = (w, lang) => w.slice(0, lang === 'ru' ? 5 : 6);
let WORDS = null; // stem -> Map(full word -> n), filled for term-holding segments: shows «чувственных» for «чувст»
const tokens = (txt, lang, words) => {
    const out = new Set();
    for (const w of String(txt).toLowerCase().split(/[^a-zа-яёäöüß]+/)) if (w.length >= 4) {
        const s = stemOf(w, lang); if (STOP.has(s)) continue; out.add(s);
        if (words) { const m = words.get(s) || words.set(s, new Map()).get(s); m.set(w, (m.get(w) || 0) + 1); }
    }
    return out;
};

// root text per segment, and which terms it holds
const segTerms = new Map();
for (const r of db.prepare("SELECT sutta_id, segment_id, txt FROM texts WHERE kind='root'").iterate()) {
    const t = r.txt.toLowerCase();
    const hit = Object.keys(TERMS).filter(k => TERMS[k].test(t));
    if (hit.length) segTerms.set(r.sutta_id + '|' + r.segment_id, hit);
}

const report = {};
const q = db.prepare("SELECT sutta_id, segment_id, txt FROM texts WHERE kind='translation' AND lang=? AND translator=?");
for (const tr of TRANSLATORS) {
    const [lang, who] = tr.split('|');
    const global = new Map(); let nSeg = 0;
    const perTerm = {}; // term -> {n, stems: Map, examples}
    const words = new Map();
    const rows = []; // [terms, stems] of every term-holding segment, for the collision check
    for (const r of q.iterate(lang, who)) {
        nSeg++;
        const hit = segTerms.get(r.sutta_id + '|' + r.segment_id);
        const toks = tokens(r.txt, lang, hit ? words : null);
        for (const s of toks) global.set(s, (global.get(s) || 0) + 1);
        if (!hit) continue;
        rows.push([hit, toks, r.sutta_id + ':' + r.segment_id.split(':')[1]]);
        for (const k of hit) {
            const pt = perTerm[k] || (perTerm[k] = { n: 0, stems: new Map() });
            pt.n++;
            for (const s of toks) pt.stems.set(s, (pt.stems.get(s) || 0) + 1);
        }
    }
    const out = {};
    for (const [k, pt] of Object.entries(perTerm)) {
        if (pt.n < 15) continue;
        const rend = [];
        for (const [s, a] of pt.stems) {
            const share = a / pt.n, base = (global.get(s) || 0) / nSeg, lift = share / base;
            if (share >= 0.08 && lift >= 4) {
                const top = [...(words.get(s) || [])].sort((x, y) => y[1] - x[1]).slice(0, 2).map(x => x[0]);
                rend.push({ stem: s, words: top, share: +share.toFixed(2), lift: +lift.toFixed(1), n: a });
            }
        }
        rend.sort((x, y) => y.share - x.share);
        out[k] = { segments: pt.n, renderings: rend.slice(0, 8) };
    }
    report[tr] = { segments: nSeg, terms: out, rows };
}

// collisions: one translation stem renders two different Pali terms, counted only where the other term is absent —
// so a shared formula (vitakka-vicāra, samudaya-nirodha) does not pass for one word
for (const tr of TRANSLATORS) {
    const R = report[tr], cands = new Map();
    for (const [k, v] of Object.entries(R.terms))
        for (const r of v.renderings.slice(0, 3)) if (r.share >= 0.25) (cands.get(r.stem) || cands.set(r.stem, []).get(r.stem)).push(k);
    R.collisions = [];
    for (const [stem, ks] of cands) {
        if (ks.length < 2) continue;
        for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
            // only rows with this term and none of the other terms this word renders — taṇhā next to sneha must not lend
            // «цепляние» to sneha
            const side = (a) => {
                const only = R.rows.filter(([h]) => h.includes(a) && !ks.some(o => o !== a && h.includes(o)));
                const withS = only.filter(([, t]) => t.has(stem));
                return { n: only.length, share: only.length ? +(withS.length / only.length).toFixed(2) : 0, ex: [...new Set(withS.map(x => x[2]))].slice(0, 4) };
            };
            const A = side(ks[i]), B = side(ks[j]);
            if (A.n >= 5 && B.n >= 5 && A.share >= 0.25 && B.share >= 0.25) R.collisions.push({ stem, a: ks[i], b: ks[j], A, B });
        }
    }
    delete R.rows;
}
console.log(JSON.stringify(report, null, 1));
