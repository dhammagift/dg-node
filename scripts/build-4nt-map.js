// Four Noble Truths map, mockup data (Trello KZRgTNrF): the elephant's footprint of mn28 — sn56.11 holds the four truths,
// each truth holds its vibhaṅga suttas, then every other sutta of the four nikāyas, placed under the truth and term
// whose words it uses most. Pali root text only. Usage: node scripts/build-4nt-map.js dg.db > map.json
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const B = '(?:^|[^a-zāīūṁṅñṭḍṇḷ])';
const TRUTHS = [
    { key: 'dukkha', name: 'dukkhaṁ ariyasaccaṁ', terms: { 'dukkha': /dukkh/, 'jāti': new RegExp(B + 'jāti'), 'jarāmaraṇa': /jarāmaraṇ|jarā(?![a-z])|maraṇ/,
        'soka…upāyāsa': /(?:^|[^a-zāīū])sok|parideva|domanass|upāyās/, 'upādānakkhandhā': /upādānakkhandh|khandh/ } },
    { key: 'samudaya', name: 'dukkhasamudayaṁ ariyasaccaṁ', terms: { 'taṇhā': /taṇh/, 'nandirāga': /nandirāg|nandī/, 'kāma': new RegExp(B + 'kām'),
        'bhava/vibhava': /bhavataṇh|vibhav|bhavapaccay|bhavarāg/, 'upādāna': /upādān(?!akkhandh)/, 'avijjā': /avijj/, 'samudaya': /samuday/ } },
    { key: 'nirodha', name: 'dukkhanirodhaṁ ariyasaccaṁ', terms: { 'nirodha': /nirodh/, 'nibbāna': /nibbān/, 'virāga': /virāg/, 'vimutti': /vimutt/,
        'cāga·paṭinissagga·anālaya': /(?:^|[^a-zāīū])cāg|paṭinissagg|anālay/ } },
    { key: 'magga', name: 'dukkhanirodhagāminī paṭipadā', terms: { 'sammādiṭṭhi': /sammādiṭṭh/, 'sammāsaṅkappa': /saṅkapp/, 'sammāvācā': /sammāvāc/,
        'sammākammanta': /kammant/, 'sammāājīva': /(?:^|[^a-zāīū])ājīv/, 'sammāvāyāma': /vāyām|padhān/, 'sammāsati': new RegExp(B + 'sat(?:i|iṁ|imā|ipaṭṭh)'),
        'sammāsamādhi': /samādh|jhān/ } },
];
const VIBHANGA = ['sn56.11', 'mn141', 'dn22', 'sn12.2', 'mn135', 'mn136', 'mn137', 'mn138', 'mn139', 'mn140', 'mn142', 'sn45.8', 'sn47.40',
    'sn48.9', 'sn48.10', 'sn48.36', 'sn48.37', 'sn48.38', 'sn51.20'];
const ALL_TRUTHS = new Set(['sn56.11', 'mn141', 'dn22']); // they expound all four: shown in every truth

const titles = new Map(db.prepare("SELECT id, title FROM suttas WHERE category = 'dhamma'").all().map(r => [r.id, (r.title || '').trim()]));
const text = new Map();
for (const r of db.prepare("SELECT sutta_id, txt FROM texts WHERE kind = 'root' ORDER BY sutta_id, ord").iterate()) {
    if (!titles.has(r.sutta_id)) continue;
    text.set(r.sutta_id, (text.get(r.sutta_id) || '') + ' ' + r.txt.toLowerCase());
}
const count = (t, re) => (t.match(new RegExp(re.source, 'g')) || []).length;

const root = { name: 'sn56.11', label: 'cattāri ariyasaccāni', children: TRUTHS.map(T => ({ name: T.name, key: T.key, children: [
    { name: 'vibhaṅga', vibh: true, children: [] }, ...Object.keys(T.terms).map(k => ({ name: k, children: [] })) ] })) };
for (const [id, t] of text) {
    const per = TRUTHS.map(T => Object.fromEntries(Object.entries(T.terms).map(([k, re]) => [k, count(t, re)])));
    const sums = per.map(p => Object.values(p).reduce((a, b) => a + b, 0));
    const total = sums.reduce((a, b) => a + b, 0);
    if (total < 3 && !VIBHANGA.includes(id)) continue;
    const leaf = ti => ({ name: id, title: titles.get(id), value: Math.max(1, sums[ti]), counts: sums, top: Object.entries(per[ti]).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(x => x[1]) });
    if (VIBHANGA.includes(id)) {
        const targets = ALL_TRUTHS.has(id) ? [0, 1, 2, 3] : [sums.indexOf(Math.max(...sums))];
        for (const ti of targets) root.children[ti].children[0].children.push({ ...leaf(ti), vibh: true });
        continue;
    }
    const ti = sums.indexOf(Math.max(...sums));
    const term = Object.entries(per[ti]).sort((a, b) => b[1] - a[1])[0][0];
    root.children[ti].children.find(c => c.name === term).children.push(leaf(ti));
}
for (const T of root.children) T.children = T.children.filter(c => c.children.length);
console.log(JSON.stringify(root));
