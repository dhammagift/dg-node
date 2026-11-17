// core/semantic-search.js — search by meaning over our own vectors (owner 2026-11-17: the AI search
// "выдаёт что угодно, кроме нужной сутты"; the friend's tripitaka-mcp embeds only Pāli lines with a
// small MiniLM, so a Russian or English description rarely meets its sutta there).
//
// The index (built outside the repo, /root/work/sem; SEM_INDEX_DIR) holds bge-m3 vectors of every
// segment and ~700-character chunk of DN MN SN AN Snp Ud Iti, in Pāli and every human ru/en
// translation, plus small "what is this sutta about" levels: SuttaCentral blurbs, theravada.ru
// summaries, and topic entries (Access to Insight subject index, theravada.ru themes). Those levels
// only rank; nothing from them is shown. The query gets its vector from the same model on Cloudflare
// Workers AI. No chat model anywhere: the same query always gives the same suttas.
//
// Speed: 637k vectors x 1024 int8 are 650 MB, too slow to scan per query (~3 s). A 1-bit copy
// (81 MB, in memory) picks the nearest 8000 by Hamming distance, and only those are scored exactly
// from the int8 file (measured: 97-100% of the exact top 300 survive the cut).
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = process.env.SEM_INDEX_DIR || '/var/www/sem-index';
const DIM = 1024, BYTES = DIM / 8, CANDIDATES = 8000, RRF_K = 60, MARGIN = 0.12, RECALL_MARGIN = 0.25, RECALL_WAIT_MS = 4000;
// Weights per level, from 26 queries with a known answer (/root/work/sem/tune.py): segments, chunks,
// SC blurbs, theravada.ru summaries, topics. Whole-sutta means scored 0 there and are left out.
const W = { seg: 1, chunk: 2, blurb: 1, trblurb: 1, topic: 1, llm: 3 };   // llm: suttas a chat model named and the index confirmed (25/26)

// A new index is picked up without a restart (owner 2026-11-17: Vinaya, later rebuilds): SEM_INDEX_DIR is a symlink to a
// dated build, a new build is a new directory and the link moves; once a minute the build's meta.json is looked at.
let IX = null, checkedAt = 0;
function load() {
    if (IX && Date.now() - checkedAt < 60000) return IX;
    checkedAt = Date.now();
    const stamp = fs.statSync(path.join(DIR, 'meta.json')).mtimeMs + ':' + fs.realpathSync(DIR);
    if (IX && IX.stamp === stamp) return IX;
    const old = IX;
    const f32 = name => { const b = fs.readFileSync(path.join(DIR, name)); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
    const json = name => JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));
    const bits = fs.readFileSync(path.join(DIR, 'bits.u8'));
    // a sutta's line ids are needed for the shown results only: one buffer and its line offsets, not 637k strings (~100 MB less)
    const segBuf = fs.readFileSync(path.join(DIR, 'segids.txt'));
    const segAt = new Uint32Array(segBuf.length ? segBuf.filter(b => b === 10).length + 1 : 1);
    for (let i = 0, n = 1; i < segBuf.length; i++) if (segBuf[i] === 10) segAt[n++] = i + 1;
    const segids = { get: u => segBuf.toString('utf8', segAt[u], segAt[u + 1] - 1) };
    const unitSuttaBuf = fs.readFileSync(path.join(DIR, 'unit_sutta.u16'));
    const unitSutta = new Uint16Array(unitSuttaBuf.buffer, unitSuttaBuf.byteOffset, unitSuttaBuf.length / 2);
    const firstUnit = new Map();
    const lastUnit = new Map();   // a sutta's units are contiguous in the index (extract.py writes them sutta by sutta)
    for (let i = 0; i < unitSutta.length; i++) { if (!firstUnit.has(unitSutta[i])) firstUnit.set(unitSutta[i], i); lastUnit.set(unitSutta[i], i); }
    IX = {
        n: unitSutta.length,
        bits: new Uint32Array(bits.buffer, bits.byteOffset, bits.length / 4),
        scale: f32('scale.f32'),
        isSeg: fs.readFileSync(path.join(DIR, 'unit_isseg.u8')),
        unitSutta, suttas: json('suttas.json'), segids, firstUnit, lastUnit,
        emb: fs.openSync(path.join(DIR, 'emb.i8'), 'r'),
        levels: Object.fromEntries(['blurb', 'trblurb', 'topic'].map(n => [n, { v: f32(`${n}.f32`), ids: json(`${n}.json`) }])),
        topicSuttas: json('topic_suttas.json'),
        stamp,
    };
    if (old) { console.log('[semantic] new index:', stamp); setTimeout(() => fs.closeSync(old.emb), 30000); }   // queries in flight finish on the old file
    return IX;
}

let cfToken = null;
function cfKey() {
    if (cfToken) return cfToken;
    const m = fs.readFileSync(path.join(os.homedir(), '.secrets', 'tools.env'), 'utf8').match(/^CF_TOKEN=['"]?([^'"\n]*)/m);
    if (!m) throw new Error('CF_TOKEN missing in ~/.secrets/tools.env');
    return (cfToken = m[1]);
}
async function embedQuery(text) {
    const account = process.env.CF_ACCOUNT_ID || '73afa0b044d16d2eb76f795a130bf82a';
    for (let attempt = 0; ; attempt++) {
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/baai/bge-m3`, {
            method: 'POST', headers: { Authorization: `Bearer ${cfKey()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: [text] }), signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
            const v = Float32Array.from((await res.json()).result.data[0]);
            let norm = 0; for (const x of v) norm += x * x; norm = Math.sqrt(norm);
            for (let i = 0; i < DIM; i++) v[i] /= norm;
            return v;
        }
        // Workers AI answers 409/429 under bursts; a short wait clears it (seen while building the index)
        if (attempt >= 2 || ![409, 429, 500, 502, 503].includes(res.status)) throw new Error(`embedding HTTP ${res.status}`);
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
}

// The nearest units by Hamming distance on the 1-bit copy, then exact int8 scores for them.
function nearestUnits(ix, q) {
    const qb = new Uint32Array(BYTES / 4);
    for (let i = 0; i < DIM; i++) if (q[i] > 0) qb[i >> 5] |= 1 << (31 - (i & 31)) >>> 0;
    // np.packbits is big-endian within a byte; the Uint32 view reads 4 bytes little-endian: swap to match
    for (let w = 0; w < qb.length; w++) { const x = qb[w]; qb[w] = (((x >>> 24) & 0xff) | ((x >>> 8) & 0xff00) | ((x << 8) & 0xff0000) | ((x << 24) & 0xff000000)) >>> 0; }
    const words = BYTES / 4, dist = new Uint16Array(ix.n), hist = new Uint32Array(DIM + 1);
    const bits = ix.bits;
    for (let u = 0, o = 0; u < ix.n; u++, o += words) {
        let d = 0;
        for (let w = 0; w < words; w++) {   // popcount inlined: a call per word doubled the scan time
            let x = bits[o + w] ^ qb[w];
            x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
            d += Math.imul((x + (x >>> 4)) & 0x0F0F0F0F, 0x01010101) >>> 24;
        }
        dist[u] = d; hist[d]++;
    }
    let cut = 0, acc = 0;
    while (cut <= DIM && acc + hist[cut] <= CANDIDATES) acc += hist[cut++];
    const cand = [];
    for (let u = 0; u < ix.n; u++) if (dist[u] < cut) cand.push(u);
    const row = Buffer.alloc(DIM), scored = [];
    for (const u of cand) {
        fs.readSync(ix.emb, row, 0, DIM, u * DIM);
        let s = 0; for (let i = 0; i < DIM; i++) s += ((row[i] << 24) >> 24) * q[i];
        scored.push([u, s * ix.scale[u]]);
    }
    return scored.sort((a, b) => b[1] - a[1]);
}

// The best line or passage of one sutta for the query, scored exactly (a sutta a model named may lie outside the candidates).
function suttaBest(ix, si, q) {
    const row = Buffer.alloc(DIM); let best = -1, at = -1;
    for (let u = ix.firstUnit.get(si), end = ix.lastUnit.get(si); u <= end; u++) {
        fs.readSync(ix.emb, row, 0, DIM, u * DIM);
        let s = 0; for (let i = 0; i < DIM; i++) s += ((row[i] << 24) >> 24) * q[i];
        s *= ix.scale[u];
        if (s > best) { best = s; at = u; }
    }
    return [best, at];
}

function suttaOrder(ids, limit = 300) {
    const out = [], seen = new Set();
    for (const s of ids) { if (!seen.has(s)) { seen.add(s); out.push(s); if (out.length >= limit) break; } }
    return out;
}
function levelOrder(level, q) {
    const n = level.ids.length, sc = new Float32Array(n);
    for (let r = 0; r < n; r++) { let s = 0; const o = r * DIM; for (let i = 0; i < DIM; i++) s += level.v[o + i] * q[i]; sc[r] = s; }
    return [...sc.keys()].sort((a, b) => sc[b] - sc[a]);
}

// -> [{ sutta_id, segment_id, score }], best first. segment_id is the sutta's best-matching line
// (for the quote under the result), or its first line when only a summary or a topic found it.
// recall: an optional promise of { ids } - suttas a chat model named for the query (core/ai-search.js recallSuttas); each is
// kept only if the index has it and its own text is within RECALL_MARGIN of the query's best text.
async function semanticSearch(query, { limit = 10, recall = null } = {}) {
    const ix = load();
    // the model gets RECALL_WAIT_MS at most: a slow free tier (16 s seen) must not hold the answer, the index alone answers then
    const late = new Promise(r => setTimeout(r, RECALL_WAIT_MS, null));
    const [q, named] = await Promise.all([embedQuery(query), recall ? Promise.race([recall.catch(() => null), late]) : null]);
    const units = nearestUnits(ix, q);
    const bestSeg = new Map(), bestScore = new Map();
    const segList = [], chunkList = [];
    for (const [u, sc] of units) {
        const s = ix.suttas[ix.unitSutta[u]];
        if (!bestSeg.has(s)) { bestSeg.set(s, ix.segids.get(u)); bestScore.set(s, sc); }
        (ix.isSeg[u] ? segList : chunkList).push(s);
    }
    const lists = {
        seg: suttaOrder(segList), chunk: suttaOrder(chunkList),
        blurb: suttaOrder(levelOrder(ix.levels.blurb, q).slice(0, 300).map(r => ix.levels.blurb.ids[r])),
        trblurb: suttaOrder(levelOrder(ix.levels.trblurb, q).slice(0, 300).map(r => ix.levels.trblurb.ids[r])),
        topic: suttaOrder(levelOrder(ix.levels.topic, q).slice(0, 8).flatMap(r => ix.topicSuttas[r].slice(0, 12))),
    };
    const top = units.length ? units[0][1] : 0;
    const suttaIndex = new Map(ix.suttas.map((s, i) => [s, i]));
    lists.llm = [];
    for (const id of (named && named.ids) || []) {
        if (!suttaIndex.has(id) || lists.llm.includes(id)) continue;
        const [score, u] = suttaBest(ix, suttaIndex.get(id), q);
        if (score < top - RECALL_MARGIN) continue;
        lists.llm.push(id);
        if (!bestSeg.has(id) || score > (bestScore.get(id) || 0)) { bestSeg.set(id, ix.segids.get(u)); bestScore.set(id, score); }
    }
    const fused = new Map();
    for (const [name, list] of Object.entries(lists)) list.forEach((s, r) => fused.set(s, (fused.get(s) || 0) + W[name] / (RRF_K + r + 1)));
    // A clear leader: when the best line and the best passage are in the same sutta, the texts
    // themselves answer the query (a named simile, a story), and the summaries and topics, which pull
    // in neighbours on the same theme, must not push it down («пила» put MN 21 second, after AN 3.15).
    const lead = lists.seg[0] === lists.chunk[0] ? lists.seg[0] : null;
    if (lead) fused.set(lead, 1e9);   // finite: the score also travels as JSON (Infinity would arrive as null)
    // Only what is near enough: nearest texts always exist, so without a bar every query shows ten suttas,
    // the tenth as far as the nearest unrelated one (owner 2026-11-17 on «притча про пилу»: MN 21 and
    // «ещё 10 каких-то непонятных»). A sutta stays when one of its lines or passages is within MARGIN of
    // the query's best text, or its summary is the nearest one (the summaries find what the
    // words of the text do not: «первая проповедь» -> SN 56.11).
    const indexed = new Set(ix.suttas);   // the summaries also cover Jātakas and whole chapters, not in the index
    const bySummary = new Set([lists.blurb.find(s => indexed.has(s)), lists.trblurb.find(s => indexed.has(s))]);
    const confirmed = new Set(lists.llm);
    const near = s => s === lead || confirmed.has(s) || (bestScore.get(s) || 0) >= top - MARGIN || bySummary.has(s);
    return [...fused.entries()].filter(([s]) => near(s)).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([s, score]) => ({
        sutta_id: s, score,
        segment_id: bestSeg.get(s) || (suttaIndex.has(s) ? ix.segids.get(ix.firstUnit.get(suttaIndex.get(s))) : null),
    }));
}

// The index lives on one host only (owner 2026-11-17: F1 has 3 GB of memory; the index ~200 MB of it). A host without
// it asks the service that has it, by its service name, never a machine's (api.dhamma.gift -> f3 now): the same answer,
// computed there. No local index and no answer -> the caller's old pipeline.
const REMOTE = process.env.SEM_REMOTE || 'https://api.dhamma.gift';
const hasLocalIndex = () => fs.existsSync(path.join(DIR, 'meta.json'));
async function remoteSearch(query, { limit = 10 } = {}) {
    const res = await fetch(`${REMOTE}/api/semantic-search?q=${encodeURIComponent(query)}&limit=${limit}`, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`remote semantic search HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(`remote semantic search: ${data.reason || 'failed'}`);
    return data.hits;
}

module.exports = { semanticSearch, remoteSearch, hasLocalIndex };

if (require.main === module) {
    (async () => {
        const t = Date.now(); const r = await semanticSearch(process.argv[2] || 'притча про пилу');
        console.log(r.map(x => `${x.sutta_id} ${x.segment_id}`).join('\n'), `\n${Date.now() - t} ms`);
        const t2 = Date.now(); await semanticSearch(process.argv[2] || 'притча про пилу'); console.log(`again ${Date.now() - t2} ms`);
    })();
}
