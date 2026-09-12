// core/dpd-lookup.js — verify/gloss Pali headwords against the Digital Pali Dictionary's own
// public API (dpdict.net / ru.dpdict.net), so the AI-search word-suggestion chips (see
// docs/AI_SEARCH_BRIEF.md, Block 2) only ever show real dictionary words, never LLM inventions.
//
// API: https://digitalpalidictionary.github.io/technical/api_endpoints/ — GET /search_json?q=...
// returns {summary_html, dpd_html}; summary_html is "" (dpd_html says "No results found.") when
// the word doesn't exist. Response is a full formatted-HTML dump (tens of KB) meant for the
// dictionary's own UI — we only need "does this word exist" + one short gloss, so we parse the
// first summary entry out of summary_html rather than exposing the raw HTML further.
//
// Data is CC BY-NC-SA 4.0 (see the endpoint's own license header) — non-commercial, same as the
// tripitaka-mcp data (see docs/AI_SEARCH_BRIEF.md); dhamma.gift has used DPD this way for a long
// time already, so this is established, not a new risk.
//
// Headwords are stable dictionary data, so results are cached indefinitely in memory — a repeat
// lookup of a common word (dukkha, kamma...) costs nothing after the first request in the
// process's lifetime, and we avoid re-fetching a ~40KB+ HTML blob per AI-search request.
const cache = new Map(); // `${lang}:${word}` -> { exists, gloss } | Promise

function stripTags(html) {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// The first <p class="summary">...</p> block's bold gloss is the shortest useful "what is this
// word" text — good enough for a chip label. Anything more (full grammar/variants) belongs on a
// click-through to dpdict.net itself, not duplicated here.
function firstGloss(summaryHtml) {
    const firstBlock = summaryHtml.match(/<p class="summary">([\s\S]*?)<\/p>/);
    if (!firstBlock) return null;
    const bold = firstBlock[1].match(/<b>([\s\S]*?)<\/b>/);
    return bold ? stripTags(bold[1]) : stripTags(firstBlock[1]);
}

// When the word isn't found, dpd_html carries dpdict.net's own fuzzy "did you mean" list —
// e.g. "No results found. The closest matches are:</h3><br><p>kacca, kacchapa, ...</p>". Real
// suggestions, not invented — reusing DPD's own typo-correction beats guessing.
function closestMatches(dpdHtml) {
    const m = dpdHtml.match(/closest matches are:<\/h3><br><p>([\s\S]*?)<\/p>/);
    if (!m) return [];
    return m[1].split(',').map(s => stripTags(s).trim()).filter(Boolean);
}

// dpdict.net's own response can take several seconds (it renders a full formatted-HTML dump per
// word, see file header) — a hard timeout keeps one slow word from stalling the whole AI-search
// request; verifyCandidates() below already drops any candidate that fails rather than blocking.
async function fetchWord(word, lang) {
    const host = lang === 'ru' ? 'ru.dpdict.net' : 'www.dpdict.net';
    const res = await fetch(`https://${host}/search_json?q=${encodeURIComponent(word)}`, {
        signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`dpdict.net: HTTP ${res.status}`);
    const data = await res.json();
    const summaryHtml = data.summary_html || '';
    if (!summaryHtml) return { exists: false, gloss: null, closest: closestMatches(data.dpd_html || '') };
    return { exists: true, gloss: firstGloss(summaryHtml), closest: [] };
}

// Looks up one Pali word. `lang` picks www.dpdict.net (English glosses) or ru.dpdict.net
// (Russian glosses) — same headword index, different gloss language.
async function lookupWord(word, lang = 'en') {
    const key = `${lang}:${word.toLowerCase()}`;
    if (cache.has(key)) return cache.get(key);
    const promise = fetchWord(word, lang).catch(err => {
        cache.delete(key); // don't cache a network failure — only cache real answers
        throw err;
    });
    cache.set(key, promise);
    return promise;
}

// Verifies a batch of LLM-proposed candidates in parallel, dropping anything that isn't a real
// headword and attaching its gloss. A candidate that fails to look up (network error) is dropped
// rather than shown unverified — silence beats a chip that might be a hallucination.
async function verifyCandidates(words, lang = 'en') {
    const results = await Promise.allSettled(words.map(w => lookupWord(w, lang)));
    return words
        .map((word, i) => ({ word, result: results[i] }))
        .filter(({ result }) => result.status === 'fulfilled' && result.value.exists)
        .map(({ word, result }) => ({ word, gloss: result.value.gloss }));
}

// For a single mistyped/misremembered word: look up its own DPD-suggested near matches and
// gloss them, so a typo can be answered with "did you mean" chips instead of running the full
// LLM+semantic pipeline (see dg-fastify.js's /api/ai-search fast path, and
// docs/AI_SEARCH_BRIEF.md — owner: "не нужно было искать в ии режиме, а нужно было предположить
// что это другое слово"). Empty result means DPD had nothing close either — caller falls
// through to the normal AI pipeline.
async function suggestForTypo(word, lang = 'en') {
    const result = await lookupWord(word, lang);
    if (result.exists || !result.closest.length) return [];
    return verifyCandidates(result.closest.slice(0, 5), lang);
}

module.exports = { lookupWord, verifyCandidates, suggestForTypo };
