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
const { buildFastResponse, getSuttaBaseData, buildTextDataFromBase } = require('./search-core');

function getServer() {
    const server = new McpServer({ name: 'dg-node', version: '1.0.0' });

    server.registerTool('search', {
        description: 'Search the Pali Canon (Sutta/Vinaya) hosted on dhamma.gift by exact keyword — same engine as dhamma.gift/search.',
        inputSchema: {
            query: z.string().describe('Keyword or phrase to search for (Pali or a translation word).'),
            scope: z.string().optional().describe('default|all|dhamma|vinaya|abhi|khudakka|or comma-separated nikaya codes (dn,mn,...). Default: default (4 nikayas + 6 KN books).'),
            langs: z.array(z.string()).optional().describe('Translation languages to include, e.g. ["ru","en"]. Default: ["en"].'),
            exact: z.boolean().optional().describe('Whole-word match only. Default: false.'),
        },
    }, async ({ query, scope, langs, exact }) => {
        const result = await buildFastResponse(query, scope || 'default', !!exact, langs && langs.length ? langs : ['en'], 0, 0);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
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
