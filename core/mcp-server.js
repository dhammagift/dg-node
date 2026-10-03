// core/mcp-server.js — exposes dg-node's own search/reader data as MCP tools, mounted at
// POST /mcp in dg-fastify.js. Symmetric to core/tipitaka-mcp-client.js (we call the friend's
// server the same way another agent could call ours) — see docs/AI_SEARCH_BRIEF.md.
//
// Both tools are thin wrappers over the exact functions the REST routes already call
// (buildFastResponse for /search, getSuttaBaseData+buildTextDataFromBase for /api/text) — same
// data, same logic, just reachable over MCP too. No new search/reader logic lives here.
//
// Stateless (sessionIdGenerator: undefined, see the SDK's own examples/server/
// simpleStatelessStreamableHttp.js): each request gets a fresh server+transport pair. Fine for
// occasional tool calls from other agents; not meant for high-frequency traffic (that's what the
// plain REST routes are for).
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { buildFastResponse, getSuttaBaseData, buildTextDataFromBase, isRegexKeyword } = require('./search-core');
// Regex queries need the worker too — see core/regex-runner.js. The MCP route has no per-IP
// budget (no client address reaches here); the worker's single slot and deadline are what bound it.
const regexRunner = require('./regex-runner.js');

async function fastAnswer(query, scope, exact, langs) {
    if (!isRegexKeyword(query)) return { result: await buildFastResponse(query, scope, exact, langs, 0, 0) };
    const outcome = await regexRunner.runJob('fast', { keyword: query, scope, exact, langs, lb: 0, la: 0 });
    if (outcome.ok) return { result: outcome.result };
    if (outcome.unavailable) return { error: 'Regex search is temporarily unavailable, try again in a moment.' };
    if (outcome.timedOut) return { error: 'Regex search did not finish in time — narrow the pattern or the scope.' };
    if (outcome.busy) return { error: 'Too many regex searches are waiting, try again in a moment.' };
    return { error: outcome.message || 'Regex search failed.' };
}

const READER = 'https://dhamma.gift/'; // a clean path opens the reader: /mn129, /mn129:21.3 (segment anchor)
let mcpDb = null;
function db() { return mcpDb || (mcpDb = new DatabaseSync(path.join(__dirname, '..', 'dg.db'), { readOnly: true })); }
const asText = (obj, isError) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], isError: !!isError });

// What an agent should know before the first call: how to search, how to phrase answers, where the links go.
const INSTRUCTIONS = `Dhamma.gift: the Pali Canon (Sutta, Vinaya, Abhidhamma) with Pali root text and translations (Russian, English and more).
- search is a literal substring/keyword search (min 3 letters, diacritics ignored: "kacchap" finds mahakacchapa). It does NOT understand meaning: for a topic ("turtle") try the Pali word(s) and translation words yourself (kacchapa, kummo; turtle, tortoise; черепаха) and merge the results. Results contain every matching sutta; drop false friends by reading the matched text.
- Quote the Pali and a translation, name the translator, and give the reader link from the "link" fields (https://dhamma.gift/<id>, segment links open the exact place).
- get_text reads a sutta; compare_translations shows one segment in all translations; list_structure tells which texts exist.
- Sutta ids are SuttaCentral-style: dn22, mn1, sn56.11, an4.41, snp1.1, dhp1-20.`;

function getServer() {
    const server = new McpServer({ name: 'dg-node', version: '1.1.0' }, { instructions: INSTRUCTIONS });

    server.registerTool('search', {
        description: 'Search the Pali Canon on dhamma.gift by keyword/substring (min 3 letters, no semantic search). Returns matching suttas and segments (Pali + chosen translation languages) with reader links.',
        inputSchema: {
            query: z.string().describe('Keyword or phrase to search for (Pali or a translation word).'),
            scope: z.string().optional().describe('default|all|dhamma|vinaya|abhi|khudakka|or comma-separated nikaya codes (dn,mn,...). Default: default (4 nikayas + 6 KN books).'),
            langs: z.array(z.string()).optional().describe('Translation languages to include, e.g. ["ru","en"]. Default: ["en"].'),
            exact: z.boolean().optional().describe('Whole-word match only. Default: false.'),
            limit: z.number().int().min(1).max(200).optional().describe('Max suttas to return. Default: 40.'),
        },
    }, async ({ query, scope, langs, exact, limit }) => {
        const answer = await fastAnswer(query, scope || 'default', !!exact, langs && langs.length ? langs : ['en']);
        if (answer.error) return asText({ error: answer.error }, true);
        const r = answer.result, cap = limit || 40;
        if (r && r.data && typeof r.data === 'object') { // reader links + a cap, a common word would answer with hundreds of suttas
            const ids = Object.keys(r.data);
            if (ids.length > cap) { r.metadata.truncated = `showing ${cap} of ${ids.length} suttas, narrow the query or scope`; ids.slice(cap).forEach(id => delete r.data[id]); }
            for (const id of Object.keys(r.data)) {
                r.data[id].link = READER + id;
                for (const sg of r.data[id].segments || []) if (sg.segment) sg.link = READER + sg.segment;
            }
        }
        return asText(r);
    });

    server.registerTool('get_text', {
        description: 'Fetch a sutta\'s Pali root text and translations by id (e.g. "dn22", "mn1", "sn56.11") — same data as dhamma.gift/api/text.',
        inputSchema: {
            suttaId: z.string().describe('SuttaCentral-style id, e.g. dn22, mn1, sn56.11.'),
            langs: z.array(z.string()).optional().describe('Translation languages to include. Default: ["en"].'),
        },
    }, async ({ suttaId, langs }) => {
        const id = suttaId.toLowerCase();
        const base = await getSuttaBaseData(id);
        if (!base) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown sutta id: ${id}` }) }], isError: true };
        }
        const data = await buildTextDataFromBase(base, id, langs && langs.length ? langs : ['en'], null);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    });

    server.registerTool('compare_translations', {
        description: 'One segment of the canon in the Pali root and every available translation side by side. Use a segment id from search/get_text, e.g. "mn129:21.3".',
        inputSchema: {
            segmentId: z.string().describe('Segment id as returned by search, e.g. mn129:21.3 or dn22:1.1.'),
            langs: z.array(z.string()).optional().describe('Limit to these languages, e.g. ["ru","en"]. Default: all.'),
        },
    }, async ({ segmentId, langs }) => {
        const seg = segmentId.trim().toLowerCase();
        const rows = db().prepare("SELECT kind, lang, translator, txt FROM texts WHERE segment_id = ? ORDER BY CASE kind WHEN 'root' THEN 0 WHEN 'variant' THEN 1 ELSE 2 END, lang, translator").all(seg)
            .filter(r => r.translator !== 'ai') // AI translations are hidden content, as in search
            .filter(r => r.kind !== 'translation' || !langs || !langs.length || langs.includes(r.lang));
        if (!rows.length) return asText({ error: `Unknown segment id: ${seg}` }, true);
        return asText({ segment: seg, link: READER + seg, texts: rows.map(r => ({ kind: r.kind, lang: r.lang, translator: r.translator, text: r.txt })) });
    });

    server.registerTool('list_structure', {
        description: 'What texts exist. Without arguments: collections (sutta/vinaya/abhidhamma/khuddaka), books by id prefix with sutta counts, and translation languages with translators. With prefix (e.g. "mn", "sn56", "an4"): the suttas under it with titles.',
        inputSchema: {
            prefix: z.string().optional().describe('Sutta id prefix such as mn, sn56, an4, dhp. Max 200 suttas are listed.'),
        },
    }, async ({ prefix }) => {
        if (prefix) {
            const p = prefix.trim().toLowerCase().replace(/[%_]/g, '');
            const rows = db().prepare('SELECT id, title FROM suttas WHERE id LIKE ? ORDER BY rowid LIMIT 200').all(p + '%');
            return asText(rows.length ? { prefix: p, count: rows.length, suttas: rows.map(r => ({ id: r.id, title: r.title, link: READER + r.id })) } : { error: `No suttas under: ${p}` }, !rows.length);
        }
        const collections = db().prepare('SELECT category, COUNT(*) n FROM suttas GROUP BY 1 ORDER BY n DESC').all();
        const bookCount = {};
        for (const { id } of db().prepare('SELECT id FROM suttas').all()) { const b = (id.match(/^[a-z]+/) || ['?'])[0]; bookCount[b] = (bookCount[b] || 0) + 1; }
        const books = Object.entries(bookCount).map(([b, n]) => ({ b, n }));
        const langsRows = db().prepare("SELECT lang, translator, COUNT(*) segments FROM texts WHERE kind = 'translation' GROUP BY 1, 2 ORDER BY lang, segments DESC").all();
        const byLang = {};
        for (const r of langsRows) (byLang[r.lang] = byLang[r.lang] || []).push({ translator: r.translator, segments: r.segments });
        return asText({ collections: collections.map(c => ({ category: c.category, suttas: c.n })), books_by_prefix: books.map(b => ({ prefix: b.b, suttas: b.n })), translations: byLang, note: 'Pali root text covers everything; translation coverage differs per translator.' });
    });

    return server;
}

// Mounted as app.post('/mcp', mcpHandler) in dg-fastify.js — takes Fastify's (request, reply),
// hands the raw Node req/res to the transport the same way the SDK's own Express examples do.
async function mcpHandler(request, reply) {
    try {
        // dg-fastify.js registers a catch-all '*' content-type parser that hands back the raw
        // string body for every route (see its own comment, mirrors an Express text() route) —
        // Fastify never auto-parses JSON here, unlike the SDK's own Express example. Parse it
        // ourselves; handleRequest below needs the actual object, not the JSON text.
        const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
        const server = getServer();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        reply.raw.on('close', () => { transport.close(); server.close(); });
        await server.connect(transport);
        await transport.handleRequest(request.raw, reply.raw, body);
        reply.hijack(); // tell Fastify the transport already wrote the response
    } catch (err) {
        if (!reply.raw.headersSent) {
            reply.code(500).send({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
        }
    }
}

module.exports = { mcpHandler };
