'use strict';
// Word-level comparison of a Pali edition's line against the Mahāsaṅgīti's - one rule for MCP compare_editions
// (core/mcp-server.js) and the variant readings build-search-db.js derives from the editions.
// Compared as words. Folded silently only what is the same letter or no letter at all: case, punctuation, and ṁ = ṃ
// (one letter in two transliterations). Spelling conventions stay visible but are classed as "spelling" (spelling())
// - owner 2026-10-30: «сañhita и saṁhita… совсем разные буквы… надо хоть как минимум подсвечивать».
// Apostrophes and quotes go without a space: "ariyasaccan’ti" (Mahāsaṅgīti) and "ariyasacca’nti" (VRI) are one word.
const foldWords = t => String(t || '').normalize('NFC').toLowerCase().replace(/[ṃŋ]/g, 'ṁ').replace(/[’'‘`“”"]/g, '')
    .replace(/[^\p{L}\s-]+/gu, ' ').replace(/(^|\s)-+|-+(?=\s|$)/g, ' ').split(/\s+/).filter(Boolean);
// the same words but for a spelling convention: a compound written apart or hyphenated (katamañca / katamañ ca,
// ariya-saccaṁ), a word-final m for niggahīta (PTS "samayam"), the Thai script's ñ for niggahīta before h (sañhito)
// ...and sandhi of the niggahīta: ṁ before a vowel or m written m (evam etassa, evamme for evaṁ me)
const spellingKey = s => s.split(' ').map(w => w.replace(/m$/, 'ṁ')).join('').replace(/-/g, '').replace(/ñh/g, 'ṁh')
    .replace(/ṁ(?=[aāiīuūeom])/g, 'm').replace(/[ṅñṇnm](?=[kgcjṭḍtdpb])/g, 'ṁ');   // a nasal before a stop: ṁ assimilated (saṅkhittena/saṁkhittena, idañca/idaṁ ca)
const spelling = d => spellingKey(d.ms) === spellingKey(d.ed);
// word-level difference of an edition's line against the Mahāsaṅgīti's: [{ms, ed}] runs (LCS over a few dozen words)
function wordDiff(a, b) {
    const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = []; let i = 0, j = 0, ms = [], ed = [];
    const flush = () => { if (ms.length || ed.length) out.push({ ms: ms.join(' '), ed: ed.join(' ') }); ms = []; ed = []; };
    while (i < n || j < m) {
        if (i < n && j < m && a[i] === b[j]) { flush(); i++; j++; }
        else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) ed.push(b[j++]);
        else ms.push(a[i++]);
    }
    flush();
    return out.map(d => ({ ...d, kind: spelling(d) ? 'spelling' : 'reading' }));
}

module.exports = { foldWords, spelling, wordDiff };
