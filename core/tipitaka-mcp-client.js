// core/tipitaka-mcp-client.js — thin MCP client for the friend's hosted tripitaka-mcp server
// (see docs/AI_SEARCH_BRIEF.md). Used only for search_hybrid: given the English phrase produced
// by core/ai-search.js's dispatcher, find candidate sutta segments by meaning, not exact words.
//
// Data there is Pāli + Sujato English only (see docs/AI_SEARCH_BRIEF.md), offered as Dhamma Dāna.
// The operator is a personal contact and is fine with this use (confirmed 2026-09-12).
//
// A fresh client+transport is created per call rather than kept open: this endpoint is hit at
// most a few times a second (AI-search fallback, not the main search path), so the per-call
// connect overhead is negligible next to the LLM round trip in ai-search.js, and it avoids having
// to reason about a long-lived connection surviving the remote server restarting.
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const SERVER_URL = process.env.TRIPITAKA_MCP_URL || 'https://mcp.tripitaka-mcp.com/mcp';

async function withClient(fn) {
    const client = new Client({ name: 'dg-node', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(SERVER_URL));
    try {
        await client.connect(transport);
        return await fn(client);
    } finally {
        await transport.close().catch(() => {});
    }
}

// Returns the raw search_hybrid hits: [{ segment_id, sutta_id, text_pali, text_english, rrf_score, ... }]
// `trace` (optional) is filled with exactly what was sent and what came back, for the "raw data"
// debug panel — owner: "чтобы понимать кто лажает, mcp или мы с запросом".
async function searchHybrid(query, limit = 5, trace = {}) {
    const args = { query, limit, language: 'all' };
    Object.assign(trace, { server: SERVER_URL, tool: 'search_hybrid', arguments: args });
    const started = Date.now();
    try {
        const hits = await withClient(async client => {
            const result = await client.callTool({ name: 'search_hybrid', arguments: args });
            const textBlock = result.content.find(c => c.type === 'text');
            if (!textBlock) throw new Error('tripitaka-mcp: no text content in search_hybrid result');
            return JSON.parse(textBlock.text);
        });
        trace.hits = Array.isArray(hits) ? hits.map(h => ({ segment_id: h.segment_id, rrf_score: h.rrf_score })) : hits;
        return hits;
    } catch (err) {
        trace.error = err.message;
        throw err;
    } finally {
        trace.ms = Date.now() - started;
    }
}

module.exports = { searchHybrid };
