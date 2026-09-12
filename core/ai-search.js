// core/ai-search.js — query dispatcher for the AI-search fallback (see docs/AI_SEARCH_BRIEF.md).
//
// This is deliberately NOT a chatbot. The model's only job is to translate the user's query
// (any language) into a short English phrase for semantic search, and to name a handful of real
// Pali dictionary headwords that might be relevant. It never sees sutta content and never writes
// text the user reads directly — the "why this matched" text shown in the UI is a verbatim
// segment from the search results, not model output. Forcing a single tool call (tool_choice)
// keeps the model from answering in free text no matter what the user asks it.
//
// Three providers, tried in order, first success wins (see docs/AI_SEARCH_BRIEF.md — org part):
// Groq (free, high daily limit) -> Gemini Flash-Lite (free, smaller limit) -> DeepSeek (paid,
// fractions of a cent per query). All three speak the OpenAI chat-completions wire format, so one
// request builder covers all of them — Gemini via its OpenAI-compatibility endpoint.
const fs = require('fs');
const path = require('path');
const os = require('os');

// Keys live outside the repo (~/.secrets/.env, chmod 600), loaded once at require time. Same
// "real env wins" rule as the telegram plugin's own .env loader — an actual env var overrides
// the file, never the other way round.
(function loadSecretsEnv() {
    const envPath = path.join(os.homedir(), '.secrets', '.env');
    let text;
    try {
        text = fs.readFileSync(envPath, 'utf8');
    } catch {
        return; // no file — provider calls below will fail loudly with "no API key configured"
    }
    for (const line of text.split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
})();

const SYSTEM_PROMPT = `You are a dispatcher for a Pali Canon (Tipitaka) search engine, not a Buddhist teacher or chatbot.
You never explain, interpret, summarize, or discuss doctrine. You never answer questions directly.
Your ONLY job, for every input: call the dispatch_search tool with
(1) recognized: true if the input is actual language — a real word, phrase, or question, in ANY
    language, even if unrelated to Buddhism — false only for random keyboard-mashing / gibberish
    that is not language at all (e.g. "asdklfj", "лфадмлот").
(2) a short English phrase capturing the meaning, suitable for semantic search over sutta text
    (best-effort even for input unrelated to Buddhist texts; irrelevant when recognized is false —
    still fill it in, but it will not be used for a search).
(3) 3-5 real Pali words (dictionary headwords, not invented forms) that might be relevant search
    terms (irrelevant when recognized is false — still fill in your best guess).
Never refuse, never respond in free text, never call any other tool.`;

const TOOL = {
    type: 'function',
    function: {
        name: 'dispatch_search',
        description: 'Dispatch a Pali Canon search: translate the query and list candidate Pali headwords.',
        parameters: {
            type: 'object',
            properties: {
                recognized: {
                    type: 'boolean',
                    description: 'True if the input is real language (any language) worth searching for; false if it is meaningless keyboard-mashing / random characters.',
                },
                english_query: {
                    type: 'string',
                    description: 'Short English phrase capturing the meaning of the query, for semantic search.',
                },
                pali_candidates: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '3-5 real Pali dictionary headwords plausibly related to the query.',
                },
            },
            required: ['recognized', 'english_query', 'pali_candidates'],
            additionalProperties: false,
        },
    },
};

// ponytail: model ids are read from env (with a fallback default) rather than hardcoded — free-tier
// model rosters rotate without notice (see docs/AI_SEARCH_BRIEF.md research), so a rename on the
// provider's side is a .env edit, not a code change.
const PROVIDERS = [
    {
        name: 'groq',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        key: () => process.env.GROQ_TOKEN,
        model: () => process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    },
    {
        name: 'gemini',
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        key: () => process.env.GEMINI_TOKEN,
        model: () => process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    },
    {
        name: 'deepseek',
        url: 'https://api.deepseek.com/chat/completions',
        key: () => process.env.DEEPSEEK_TOKEN,
        model: () => process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    },
];

async function callProvider(provider, userQuery) {
    const key = provider.key();
    if (!key) throw new Error('no API key configured');
    const res = await fetch(provider.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: provider.model(),
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userQuery },
            ],
            tools: [TOOL],
            tool_choice: { type: 'function', function: { name: 'dispatch_search' } },
            temperature: 0,
        }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error('no tool call in response');
    let args;
    try {
        args = JSON.parse(call.function.arguments);
    } catch {
        throw new Error('tool arguments were not valid JSON');
    }
    if (typeof args.english_query !== 'string' || !Array.isArray(args.pali_candidates)) {
        throw new Error('malformed tool arguments');
    }
    // Fail open on a missing/malformed flag (args.recognized !== false, not === true) — a model
    // that forgets the field shouldn't silently block every search that follows.
    return {
        searchQuery: args.english_query,
        paliCandidates: args.pali_candidates,
        provider: provider.name,
        recognized: args.recognized !== false,
    };
}

// Sequential fallback — each provider is free/near-free, so trying all three on the rare failure
// costs nothing. First success wins; if all three fail, the caller falls back to plain exact search.
async function normalizeQuery(userQuery) {
    const errors = [];
    for (const provider of PROVIDERS) {
        try {
            return await callProvider(provider, userQuery);
        } catch (err) {
            errors.push(`${provider.name}: ${err.message}`);
        }
    }
    throw new Error(`All AI providers failed: ${errors.join(' | ')}`);
}

module.exports = { normalizeQuery };
