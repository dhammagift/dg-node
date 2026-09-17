// core/query-guard.js — "is this even a search query?" gate for /api/ai-search (dg-node issue #29).
//
// Owner: "зачем-то битые запросы улетают в AI режим так крайлеры и роботы будут тратить токены...
// нужно это починить". The AI fallback is reached whenever a plain exact search finds 0 results —
// which means EVERY unknown URL a crawler walks (/lzh-mg-bi-pm_pc127, /bu-vb-sk7, /thi16 — real
// SuttaCentral text ids this corpus has no text for) and every mangled URL a bot invents
// ("an10.76@1@   L烗      ,") was reaching a provider: a dpdict.net round-trip for the single-token
// case, a full LLM call (Groq/Gemini/DeepSeek) for anything with a space in it. Neither is a query
// anybody typed, so neither should cost anything.
//
// This runs BEFORE every network call in the endpoint (before DPD, before the LLM) and is purely
// local: no provider, no db, no filesystem. Two things are rejected, and both can only ever come
// from a crawler or a mangled URL — never from someone describing a sutta:
//
//   1. tipitaka_id — a Tipitaka / SuttaCentral text id. Not a word to search for by meaning: it
//      either names a text the reader should open, or names one this corpus doesn't have at all
//      (the lzh-*/skt-* Chinese/Sanskrit ids above). Sending it to a dictionary and then to a
//      semantic search can only ever return noise — seen live: DPD's own fuzzy matcher "confirmed"
//      the literal string "thi16" as a Pali word and the site then showed 2 unrelated suttas.
//   2. not_language — characters no query contains (@ # $ % ^ & * { } < > | \ ~ ` _ [ ] = ...) or
//      no letters at all ("0 0"). Real keyboard-mashing ("лфадмлот", "asdklfj") is already caught
//      by the model's own `recognized:false` flag (core/ai-search.js) — this catches the rest one
//      step earlier, before the tokens are spent.
//
// Anything that doesn't match is a real query and goes down the normal pipeline untouched: a
// hyphenated English phrase like "non-self" or "one-pointed-ness" is NOT an id (see looksLikeId —
// a multi-part id needs a digit in it), a Cyrillic question, a Chinese phrase, a Pali compound, a
// typo — all pass.
'use strict';

// dn22, mn1, an10.76, sn56.11, sn56.11:1.1, thi16, tha5... A trailing number is what separates an
// id from a word: no Pali or English word a person searches for ends in digits.
const NUMERIC_ID = /^(?:[a-z]{2,4}\d+(?:[.:]\d+)*|[a-z]{1,3}\d+)$/;

// Multi-part ids: lzh-mg-bi-pm_pc127, lzh-sarv-bi-pm_np20, skt-mu-bu-pm-gbm2_pc52, pli-tv-bu-vb-pj1,
// bu-vb-sk7. Shape alone is not enough — a hyphenated English phrase has the same shape and IS a
// real query — so an id additionally needs a digit somewhere. That digit is what every id in the
// live traffic had (lzh-*_pc127, bu-vb-sk7, pli-tv-bu-vb-sn4); a digit-free text id
// (lzh-mg-bi-pm, pli-tv-bu-vb) still reaches DPD, one request, no tokens — deliberately, because
// the alternative ("three or more parts" with no digit) also swallowed real English like
// "one-pointed-ness" and "self-made-man".
const MULTIPART_ID = /^[a-z]{2,8}(?:[-_][a-z0-9]{1,8}){1,6}$/;

// A file path from the crawler, not a query: "w.php" was in the live log, and .html/.js get
// appended to ids the same way. Nobody searches for a filename, and the extension is unambiguous.
const URL_PATH = /\.(?:php\d?|html?|aspx?|jsp|cgi|xml|json|js|css|txt|csv|pdf|zip|gz|sql|ini|conf|png|jpe?g|gif|svg|ico|woff2?)$/i;

// Whitelist, not a blacklist of "bad symbols": everything a query can legitimately be made of is
// letters (any script — Chinese and Russian queries are valid input here, docs/AI_SEARCH_BRIEF.md),
// combining marks (Pali diacritics, Devanagari matras), digits, whitespace and ordinary
// punctuation. Anything else is a mangled URL, not language.
const ALLOWED_CHARS = /^[\p{L}\p{M}\p{N}\s.,;:!?'"()\-–—/+*]+$/u;

const VOWEL = /[aeiouyāīūаеёиоуыэюя]/i;
// Only pure latin/cyrillic tokens are judged by vowels — a Chinese/Japanese token has no latin
// vowels by definition and must not be mistaken for keyboard-mashing.
const LATIN_CYRILLIC_TOKEN = /^[a-z\u0400-\u04ff]+$/i;

function looksLikeId(q) {
    const s = q.toLowerCase();
    if (NUMERIC_ID.test(s)) return true;
    return MULTIPART_ID.test(s) && /\d/.test(s);
}

// Returns a short reason string ('tipitaka_id', 'url_path', 'junk_chars', 'no_letters',
// 'consonant_soup', 'empty') when the string is not a search query, or null when it is one.
function nonQueryReason(rawQuery) {
    const q = String(rawQuery == null ? '' : rawQuery).trim();
    if (!q) return 'empty';
    // Ids first: ids like lzh-mg-bi-pm_pc127 contain characters the whitelist below also rejects,
    // and "this is a text id" is the more useful thing to see in the log line.
    if (looksLikeId(q)) return 'tipitaka_id';
    if (URL_PATH.test(q)) return 'url_path';
    if (!ALLOWED_CHARS.test(q)) return 'junk_chars';
    if (!/\p{L}/u.test(q)) return 'no_letters';
    // A long token with no vowel is keyboard-mashing in a latin/cyrillic keyboard ("sdfghjkl").
    // Eight is well past any real consonant cluster in the languages searched here.
    const tokens = q.split(/\s+/);
    if (tokens.some(t => t.length >= 8 && LATIN_CYRILLIC_TOKEN.test(t) && !VOWEL.test(t))) return 'consonant_soup';
    return null;
}

module.exports = { nonQueryReason, looksLikeId };
