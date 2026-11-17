#!/usr/bin/env node
// The semantic search alone, for a host that runs no dg-node site: the reserve behind api2.dhamma.gift (f2 now; owner
// 2026-11-17: «на f2 бекап»). Same answer as dg-fastify's /api/semantic-search (core/semantic-search.js and the model
// recall from core/ai-search.js), nothing else; the index is SEM_INDEX_DIR, the keys ~/.secrets as everywhere.
// Usage: node scripts/semantic-server.js [port]   (default 3021, localhost only: Apache proxies /api/semantic-search)
const http = require('http');
const { semanticSearch, hasLocalIndex } = require('../core/semantic-search.js');
const { recallSuttas } = require('../core/ai-search.js');

const PORT = Number(process.argv[2]) || 3021;
const hits = new Map();   // ip -> request times in the last minute (the same 120 a minute as dg-fastify)
function limited(ip) {
    const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 60000);
    list.push(now); hits.set(ip, list);
    if (hits.size > 5000) hits.clear();
    return list.length > 120;
}

http.createServer(async (req, res) => {
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/api/semantic-search') return send(404, { ok: false, reason: 'not_found' });
    const q = String(url.searchParams.get('q') || '').trim().slice(0, 300);
    if (!q) return send(400, { ok: false, reason: 'missing_query' });
    if (!hasLocalIndex()) return send(503, { ok: false, reason: 'no_index' });
    if (limited(String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim())) return send(429, { ok: false, reason: 'rate_limited' });
    try {
        const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 10));
        send(200, { ok: true, hits: await semanticSearch(q, { limit, recall: recallSuttas(q) }) });
    } catch (err) {
        send(502, { ok: false, reason: 'failed', detail: err.message });
    }
}).listen(PORT, '127.0.0.1', () => console.log(`[semantic] listening on 127.0.0.1:${PORT}`));
