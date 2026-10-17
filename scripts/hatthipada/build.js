// Hatthipada (/hatthipada): the four noble truths and, as deep as one goes, the definitions the suttas give themselves —
// "Katamā ca, bhikkhave, X?" … "ayaṁ vuccati … X", "Kathañca, bhikkhave, X hoti?" … and sn56.11's "Idaṁ kho pana,
// bhikkhave, X—" … Four nikāyas; Pali, with the project's preferred ru/en translation of each line.
// Usage: node scripts/hatthipada/build.js [dg.db] → siteroot/hatthipada/index.html (from scripts/hatthipada/page.html)
const { DatabaseSync } = require('node:sqlite');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const db = new DatabaseSync(process.argv[2] || path.join(ROOT, 'dg.db'), { readOnly: true });
const STOP = new Set(('ca cāvuso cāvusoti panāvuso panāvusoti sā so taṁ yā yo pana kho nu bhikkhave bhikkhavo āvuso bhante bhikkhu bhikkhunī gahapati brāhmaṇa mahārāja ānanda sāriputta ' +
    'moggallāna visākhe vāseṭṭha bhaggava aggivessana gāmaṇi kumāra udāyi cunda kaccāna anuruddha upāli rāhula mahānāma ambaṭṭha sīha tissa ' +
    'hoti honti viharati hotīti bhāvitā bhāvito bahulīkatā bahulīkato kataṁ katā vutto vuttā vuttaṁ bhagavatā ayye').split(' '));
const NUM = new Set(('eka ekaṁ dve dvīhi dvinnaṁ dvīsu tayo tīṇi tisso tīhi tiṇṇaṁ cattāro cattāri catasso catūhi catunnaṁ catūsu pañca pañcahi pañcannaṁ ' +
    'cha chahi channaṁ satta sattahi sattannaṁ aṭṭha aṭṭhahi nava dasa dasahi ekādasahi ti honti hoti').split(' '));
const words = s => s.toLowerCase().replace(/[“”‘’"'—–,.;:!?()]/g, ' ').split(/\s+/).filter(Boolean);
const fold = w => { w = w.replace(/ṁ$/, '').replace(/([aāiīuū])n$/, '$1'); return w.length > 3 ? w.replace(/[aāiīuūoe]$/, '') : w; };
const ok = new Set(db.prepare("SELECT id FROM suttas WHERE category = 'dhamma'").all().map(r => r.id));

const bySutta = new Map();
for (const r of db.prepare("SELECT sutta_id, segment_id, txt FROM texts WHERE kind = 'root' ORDER BY sutta_id, ord").iterate()) {
    if (!ok.has(r.sutta_id)) continue;
    (bySutta.get(r.sutta_id) || bySutta.set(r.sutta_id, []).get(r.sutta_id)).push([r.segment_id, r.txt]);
}
const isQ = t => /^\W*(?:katam|kathañc)/i.test(t) && /\?[”’"]*\s*$/.test(t.trim());
const isIdam = t => /^\W*idaṁ kho pana,? bhikkhave,? .+[—–-]\s*$/i.test(t.trim());
// "‘Nirodho, nirodho’ti, bhante, vuccati. Katamesānaṁ kho … nirodho?" (sn22.21, mn44, sn23.x): the term said twice, then asked
// the two halves are compared by stem: "khemaṁ, kheman", "diṭṭhadhammanibbānaṁ diṭṭhadhammanibbānan"
const twice = t => {
    const m = t.match(/[‘'“"]+\s*([^‘’'“”"]+?)\s*[’']+\s*ti,?\s*(?:\S+,\s*)?vuccat/i); if (!m) return null;
    const w = words(m[1]); if (!w.length || w.length % 2) return null;
    const h = w.length / 2; return w.slice(0, h).every((x, i) => fold(x) === fold(w[h + i])) ? w.slice(0, h).join(' ') : null;
};
const abbreviated = []; // "‘Nirodho, nirodho’ti, āvuso, vuccati …." (an9.60): the text is the series' first sutta with the word changed
const defs = [];
for (const [sid, segs] of bySutta) {
    for (let i = 0; i < segs.length; i++) {
        const t = segs[i][1];
        const x = twice(t);
        if (x) {
            const phrase = words(x).filter(w => !STOP.has(w));
            const ans = [];
            for (let j = i + 1; j < segs.length && ans.length < 14; j++) {
                if (isIdam(segs[j][1]) || (ans.length > 1 && twice(segs[j][1]))) break;
                ans.push(segs[j]);
                if (ans.length > 2 && /vuccat[iī][”’"]*\s*ti/i.test(segs[j][1])) break; // the closing "… ‘X’ti vuccatī”ti"
            }
            if (phrase.length && phrase.length <= 4 && ans.length <= 1 && /…/.test(t)) abbreviated.push({ key: phrase.map(fold).join(' '), phrase: phrase.join(' '), sutta: sid, q: segs[i] });
            if (phrase.length && phrase.length <= 4 && ans.length > 1) {
                defs.push({ key: phrase.map(fold).join(' '), phrase: phrase.join(' '), sutta: sid, q: segs[i], a: ans, twice: true });
                if (isQ(segs[i + 1][1])) i++; // its "Katamo nu kho … X?" is the same definition
            }
            continue;
        }
        let phrase;
        // the term is the first comma-separated part with real words: "Katamā ca sā, bhikkhave, taṇhā jālinī …, yāya …?"
        if (isQ(t)) phrase = (t.replace(/^\W*\S+/, '').split(/[,;]/).map(p => words(p).filter(w => !STOP.has(w) && w !== 'ti')).find(p => p.length) || []);
        else if (isIdam(t)) phrase = words(t).slice(3).filter(w => !STOP.has(w));
        else continue;
        if (!phrase.length || phrase.length > 7 || NUM.has(phrase[0]) || NUM.has(phrase[phrase.length - 1])) continue;
        const ans = [];
        for (let j = i + 1; j < segs.length && ans.length < 10; j++) {
            if (isQ(segs[j][1]) || isIdam(segs[j][1])) break;
            ans.push(segs[j]);
            if (/vuccat/i.test(segs[j][1])) break;
        }
        if (!ans.length) continue;
        defs.push({ key: phrase.map(fold).join(' '), phrase: phrase.join(' '), sutta: sid, q: segs[i], a: ans });
    }
}
// an abbreviated sutta takes the answer of the nearest full one before it in the same book (an9.60 → an9.51), marked as such
const num = id => { const m = id.match(/^([a-z]+\d+)\.(\d+)/); return m ? [m[1], +m[2]] : null; };
for (const ab of abbreviated) {
    const [book, n] = num(ab.sutta) || [];
    const tpl = defs.filter(d => d.twice && num(d.sutta) && num(d.sutta)[0] === book && num(d.sutta)[1] < n && n - num(d.sutta)[1] <= 12)
        .sort((a, b) => num(b.sutta)[1] - num(a.sutta)[1])[0];
    if (tpl) defs.push({ ...ab, a: tpl.a, tpl: tpl.sutta });
}
// a long phrase whose head word is defined on its own ("taṇhā jālinī saritā visaṭā visattikā", an4.199) also counts for it
const singles = new Set(defs.filter(d => !d.key.includes(' ')).map(d => d.key));
for (const d of defs.slice()) { const head = d.key.split(' ')[0]; if (d.key.split(' ').length >= 4 && singles.has(head)) defs.push({ ...d, key: head }); }
// the project's preferred translation of each line (configs/reader/translator-priority.json, then any other but Sujato,
// then Sujato), per language
const PRIO = JSON.parse(fs.readFileSync(path.join(ROOT, 'configs/reader/translator-priority.json'), 'utf8'));
const want = new Set(defs.flatMap(d => [d.q[0], ...d.a.map(s => s[0])]));
const trans = { ru: new Map(), en: new Map() };
const rank = (lang, who) => { const i = (PRIO[lang] || []).indexOf(lang + '_' + who); return i >= 0 ? i : who === 'sujato' ? 99 : 50; };
for (const r of db.prepare("SELECT segment_id, lang, translator, txt FROM texts WHERE kind = 'translation' AND lang IN ('ru', 'en')").iterate()) {
    if (!want.has(r.segment_id) || !r.txt.trim()) continue;
    const m = trans[r.lang], cur = m.get(r.segment_id);
    if (!cur || rank(r.lang, r.translator) < rank(r.lang, cur[0])) m.set(r.segment_id, [r.translator, r.txt.trim()]);
}
// where the text's own markup starts a new paragraph, heading or verse block (the html table, as the reader renders it)
const para = new Map();
for (const r of db.prepare('SELECT segment_id, txt FROM html').iterate()) if (want.has(r.segment_id)) para.set(r.segment_id, /<(?:p|h[1-6]|li|blockquote|dt|dd)[\s>]/.test(r.txt) ? 1 : 0);
const tr = seg => { const o = {}; for (const l of ['ru', 'en']) { const v = trans[l].get(seg); if (v) o[l] = v; } return o; };
const titles = new Map(db.prepare("SELECT id, title FROM suttas").all().map(r => [r.id, (r.title || '').trim()]));
const byKey = {};
for (const d of defs) (byKey[d.key] || (byKey[d.key] = { phrase: d.phrase, defs: [] })).defs.push({ s: d.sutta, t: titles.get(d.sutta) || '',
    // "Paṭhamaṁ." … "Dasamaṁ." count the suttas of a chapter: not part of the answer
    q: [...d.q, tr(d.q[0]), para.get(d.q[0]) ?? 1], a: d.a.filter(s => !/^\W*(?:paṭhamaṁ|dutiyaṁ|tatiyaṁ|catutthaṁ|pañcamaṁ|chaṭṭhaṁ|sattamaṁ|aṭṭhamaṁ|navamaṁ|dasamaṁ)\.?\W*$/i.test(s[1])).map(s => [...s, tr(s[0]), para.get(s[0]) ?? 0]), ...(d.tpl ? { tpl: d.tpl } : {}) });
const tpl = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8');
fs.mkdirSync(path.join(ROOT, 'siteroot/hatthipada'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'siteroot/hatthipada/index.html'), tpl.replace('__DATA__', () => JSON.stringify(byKey)));
console.log(Object.keys(byKey).length + ' terms, ' + defs.length + ' definitions → siteroot/hatthipada/index.html');
