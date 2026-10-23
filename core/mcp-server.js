// core/mcp-server.js — exposes dg-node's own search/reader data as MCP tools, mounted at
// POST /mcp in dg-fastify.js. Symmetric to core/tipitaka-mcp-client.js (we call the friend's
// server the same way another agent could call ours) — see docs/AI_SEARCH_BRIEF.md.
//
// The tools are thin wrappers over the exact functions the REST routes already call
// (buildFastResponse/enrichResponse for /search, getSuttaBaseData+buildTextDataFromBase for
// /api/text) — same data, same logic, just reachable over MCP too. No new search or reader logic
// lives here. What DOES live here is a presentation layer for agents, and it exists because an
// agent is not a human looking at a table:
//
//   * Pali only by default. Sujato, Sabbamitta and the rest translated the Mahāsaṅgīti, so a
//     translation is evidence ABOUT the text being researched, not a neutral convenience. An
//     agent checking what a term means must see the term, not one translator's rendering of it
//     — hence translations are opt-in (include_translations / langs) and en_sujato is never
//     picked on its own (see SUJATO below).
//   * A census, not a text dump. The old default carried the Pali text of every match, so a
//     common word could not be returned whole (dukkha, scope=all: 1489 suttas = 2855 KB) and the
//     list was truncated to 40 by a rule that had nothing to do with the query. The census (id +
//     title + match count) is 119 KB for the same 1489, so nothing is dropped.
//   * An order an agent can use. The site sorts by category, then `mr` — the NUMBER OF METAPHORS
//     from the legacy textinfo.json, filled for 665 of 7605 suttas — then alphabetically. A human
//     sees every row and chooses with their eyes; an agent sees the first N and answers. So the
//     MCP layer re-orders on its own: a sutta NAMED after the term first, then one that DEFINES
//     it, then by how often the term occurs. sortSuttaResults is deliberately NOT touched — it is
//     shared with the site, and changing it would reorder the search table on dhamma.gift.
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
const { buildFastResponse, enrichResponse, getSuttaBaseData, buildTextDataFromBase, isRegexKeyword } = require('./search-core');
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
function db() {
    if (!mcpDb) {
        mcpDb = new DatabaseSync(path.join(__dirname, '..', 'dg.db'), { readOnly: true });
        // GROUP BY over a chunk of ids can spill to a temp file; keeping it in memory avoids
        // depending on a writable TMPDIR (same reason the build scripts set it).
        try { mcpDb.exec('PRAGMA temp_store = MEMORY'); } catch { /* read-only is fine without it */ }
    }
    return mcpDb;
}
const asText = (obj, isError) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], isError: !!isError });

// ---------------------------------------------------------------------------
// Matching helpers for the agent-facing order. The search itself folds diacritics
// (`tokenize='trigram remove_diacritics 1'` in dg.db) plus ё-folding on the Russian side, so a
// ranking built on the raw strings would miss what the search found: "kacchap" has to match
// "kacchapa", "taṇhā" has to match "tanha". Same fold as core/search-core.js's foldText, plus ё.
const fold = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/ё/g, 'е');

function countOccurrences(text, needle) {
    const hay = fold(text), pin = fold(needle);
    if (!pin) return 0;
    let n = 0, at = 0;
    while ((at = hay.indexOf(pin, at)) !== -1) { n++; at += pin.length; }
    return n;
}

// A sutta named after the term is the strongest signal there is: searching "taṇhā" must not bury
// Mahātaṇhāsaṅkhayasutta at position 25 of 252 (that is what the legacy order did). Compared on
// the title the skeleton already carries, not on a segment number, so it does not depend on how
// the title segment happens to be numbered.
const titleMatches = (title, query) => {
    const t = fold(title).trim();
    return !!t && t.includes(fold(query).trim());
};

// "Katamā ca, bhikkhave, taṇhā? ... ayaṁ vuccati, bhikkhave, taṇhā" — the canon's own definition
// sentence. A sutta that explains the term is worth more to a researcher than one that merely
// repeats it, and the marker is cheap to spot in a segment that already matched.
//
// Each part of this pattern was measured on the corpus, not guessed. The measurements live here so
// the next reader does not repeat them:
//
//   vucca[n]?ti   4630 "vuccati" + 518 "vuccanti" + 164 "vuccatī" occurrences. The `?` matters:
//                 "vucca[n]ti" without it spells "vuccanti" exactly and does NOT match "vuccati".
//                 Folding is what makes one pattern cover vuccati/vuccatī. Measured on dukkha:
//                 52 suttas on "vuccati", 53 with the plural — the one it adds (mnd9: "Āgū vuccanti
//                 pāpakā akusalā dhammā") is a real instance, so the plural earns its place.
//   katam[aeo]    1971 "katama" occurrences, and it is NOT noise: the canon defines by asking
//                 ("Katamā ca, bhikkhave, dukkhā?"), which is how mn141 Saccavibhaṅga and mn9
//                 Sammādiṭṭhi get caught at all — their closing "ayaṁ vuccati" sits in a different
//                 segment from the matched one. The vowel class is load-bearing: it admits the whole
//                 interrogative paradigm (katama/katame/katamo/katamā) while rejecting "kataṁ"
//                 ("done", 4632 occurrences, which folds to "katam" and would swamp everything).
//   kathanca     986 occurrences in 261 of 7605 suttas (3.4%) — the suttas' own EXPOSITION formula:
//                 "Kathañca, bhikkhave, bhikkhu indriyesu guttadvāro hoti?" asked and then answered.
//                 This is the marker that reaches a term the formal definition never touches.
//
// What was deliberately NOT added, with the measurement that rejected it:
//   katham        this was my first mistake, and it is worth recording: "/katham/" folds "kathaṁ"
//                 ("how?", 2117 occurrences) into itself and MISSES "kathañca" entirely, because
//                 the latter folds to "kathanca". So the measurement that rejected it was measuring
//                 the wrong form — it added 11 suttas to dukkha, 10 of them rhetorical ("Kathaṁ
//                 dukkhā pamuccati" — how does one escape suffering?). It is the wrong word.
//   katha         ~1711 of 7605 suttas (23%), and it merges "kathā" (talk, 2297), "kathaṁ" (how?),
//                 and kaṭhala (an unrelated word) into one unreadable signal after folding.
//   kata          26703 occurrences in 3516 of 7605 suttas (46%): kālaṅkata ("deceased"),
//                 bahulīkata ("developed"), byākata ("declared"), sayaṅkatā ("self-made").
//
// Measured effect of the three retained parts over 26 terms: every term gains, and the gains are the
// expositions — magga 15->64 (the SN45 series), paññā 108->145, sati 101->133, nibbāna 54->85,
// sīla 47->64 (dn2/dn10), and mettā 1->8 (dn10, mn39, mn129), which the definition formula alone
// barely reached because the suttas describe mettā by practice rather than define it.
const DEFINITION = /vucca[n]?ti|katam[aeo]|kathanca/;
const definesTerm = (segments) => (segments || []).some(sg => DEFINITION.test(fold(sg.root_text)));

// The site's own collection order, kept as the FIRST key so a term that appears all over the
// Abhidhamma (vb6: 149 occurrences of taṇhā) cannot push the four nikayas out of the answer.
const CATEGORY_ORDER = { dhamma: 1, khudakka: 2, vinaya: 3, abhi: 4, other: 5 };

// How many census rows an agent gets when it does not ask for a number, and how those rows are
// composed. 40 rows, of which 25 are simply the suttas that mention the term most, and 15 are
// reserved so that a NUMBINGLY common word cannot bury the two most useful kinds of match:
//
//   40 = 25 by occurrence count  +  15 for the named/defining block
//        (10 named after the term + 5 defining it, or 15 named when nothing defines the term)
//
// metadata always carries the TRUE total plus a "truncated" line, so the answer never pretends the
// list is complete: a word spread across the whole canon reports its 1498 there.
const DEFAULT_LIMIT = 40;
const QUOTA_DEFINITIONS = 5;        // reserved for suttas that DEFINE the term, when any exist
const QUOTA_TITLED_WITH_DEFS = 10;  // 25 + 10 + 5 = 40
const QUOTA_TITLED_ALONE = 15;      // 25 + 15 = 40 when nothing defines the term

// Sujato is never picked on his own — only when a caller names him. This is a presentation rule
// for agents, NOT a change to translator selection in the site: core/search-core.js keeps its own
// "Sujato only if nobody else" fallback (see filterPreferredTranslators), which the reader needs.
const SUJATO_KEY = 'en_sujato';
const namesSujato = (translators) => (translators || [])
    .some(t => /^(en_)?sujato$/i.test(String(t).trim()));

function stripSujato(translations) {
    if (!translations || !(SUJATO_KEY in translations)) return false;
    delete translations[SUJATO_KEY];
    return true;
}

// A caller who NAMES a translator must get that translator, even where the project's priority
// would have chosen someone else. buildTextDataFromBase takes an explicitTranslators list, but
// enrichResponse does not (the result page never needs one — it picks from the popover, one
// language at a time), so for the search path the named keys are fetched separately and merged
// into the matched segments.
function fetchNamedTranslations(segmentIds, translatorKeys) {
    const wanted = [];
    for (const key of translatorKeys || []) {
        const k = String(key).trim();
        const at = k.indexOf('_');
        if (at > 0) wanted.push({ key: k, lang: k.slice(0, at), translator: k.slice(at + 1) });
    }
    const rows = [];
    for (const w of wanted) {
        for (let i = 0; i < segmentIds.length; i += 800) {
            const chunk = segmentIds.slice(i, i + 800);
            const holes = chunk.map(() => '?').join(',');
            rows.push(...db().prepare(
                `SELECT segment_id, txt FROM texts
                 WHERE kind = 'translation' AND lang = ? AND translator = ? AND segment_id IN (${holes})`
            ).all(w.lang, w.translator, ...chunk).map(r => ({ segment_id: r.segment_id, key: w.key, txt: r.txt })));
        }
    }
    return rows;
}

// Which translations actually exist for these suttas — one indexed query, so the agent can ask
// for a language that will return something instead of guessing. Includes en_sujato (it IS
// available) and lets the note explain that it must be named explicitly.
function availableTranslations(ids) {
    const out = {};
    for (let i = 0; i < ids.length; i += 800) {
        const chunk = ids.slice(i, i + 800);
        const holes = chunk.map(() => '?').join(',');
        const rows = db().prepare(
            `SELECT lang, translator, COUNT(DISTINCT sutta_id) AS suttas FROM texts
             WHERE kind = 'translation' AND translator IS NOT NULL AND translator <> 'ai'
               AND sutta_id IN (${holes}) GROUP BY 1, 2 ORDER BY 1, 3 DESC`
        ).all(...chunk);
        for (const r of rows) (out[r.lang] = out[r.lang] || {})[r.translator] = r.suttas;
    }
    return out;
}

// `matches` is the number of times the query occurs in the sutta's Pali root text — the number the
// ordering uses, so the order can be checked against the rows. (It is NOT the count of matched
// segments, which is what the site's own `count` means: for dn2 "dukkha" sits in 10 segments but
// occurs 21 times.) `metaphors` is `mr` in dg.db and `mtph` in the legacy textinfo.json — the
// number of metaphors the old site counted in the text. Named in full here because "mr" tells an
// agent nothing, and the number IS usable: a short sutta carrying several metaphors is a
// descriptive, figurative one. It is NOT a relevance rank, and it is not filled in for most of the
// corpus (mr = 0 for 91% of suttas, so 0 means "never counted", not "none").
const censusRow = (id, s, hits) => ({
    id,
    title: (s.titles && s.titles.root ? s.titles.root : '').trim(),
    category: s.category,
    matches: hits,
    metaphors: s.mr || 0,
    link: READER + id,
});

// Keep only what an agent reads. `html` (SuttaCentral's markup) and empty variant/context fields
// are noise that roughly triples the payload.
function squeezeSegment(sg, withTranslations) {
    const out = { segment: sg.segment, link: READER + sg.segment, pali: sg.root_text || '' };
    if (sg.variant) out.variant = sg.variant;
    if (withTranslations) {
        const tr = sg.translations || {};
        if (Object.keys(tr).length) out.translations = tr;
        if (sg.lb_context && sg.lb_context.length) out.context_before = sg.lb_context;
        if (sg.la_context && sg.la_context.length) out.context_after = sg.la_context;
    }
    return out;
}

const NOTE = 'Pali only by default. Translations are opt-in: pass include_translations: true with '
    + 'langs, e.g. langs: ["ru","en"]. en_sujato (Sujato) is never included unless named in '
    + 'translators — this corpus serves research against the Pali, and a translator\'s rendering is '
    + 'evidence being examined, not a neutral convenience.';

// The census an agent gets: every matching sutta scored (defines the term, named after it, how often it occurs) and,
// past the cap, COMPOSED rather than cut (below). Shared with the search pages' plain-HTML list (dg-fastify.js
// searchSsrHtml), so a reader without scripts gets the same suttas an MCP agent does.
function composeCensus(all, query, limit) {
    const ids = Object.keys(all);
    // A regex query needs different ordering signals: the literal text "kata.*dukkha" occurs in
    // no segment, so counting occurrences of it returns 0 for every sutta and the whole ranking
    // collapses to the legacy keys. For a pattern, the meaningful weight is how many segments
    // matched, and title matching does not apply at all (the title never contains the pattern).
    const isPattern = isRegexKeyword(query);
    const scored = ids.map(id => {
        const s = all[id];
        const segs = s.segments || [];
        return {
            id, s, segs,
            hits: isPattern ? segs.length : segs.reduce((n, sg) => n + countOccurrences(sg.root_text, query), 0),
            byTitle: isPattern ? false : titleMatches((s.titles && s.titles.root ? s.titles.root : '').trim(), query),
            defines: definesTerm(segs),
        };
    });
    // Sort for an agent, most useful first. A sutta that DEFINES the term comes before one
    // merely NAMED after it: an agent that reads only the top of the list should get the
    // canon's own definition ("Katamā ca, bhikkhave, taṇhā? … ayaṃ vuccati taṇhā") rather than
    // a dozen suttas that share the word. Then occurrence count, then the site's own keys.
    scored.sort((a, b) =>
        (CATEGORY_ORDER[a.s.category] || 99) - (CATEGORY_ORDER[b.s.category] || 99)
        || (b.defines ? 1 : 0) - (a.defines ? 1 : 0)
        || (b.byTitle ? 1 : 0) - (a.byTitle ? 1 : 0)
        || b.hits - a.hits
        || (b.s.mr || 0) - (a.s.mr || 0)
        || a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));

    // The census is COMPOSED, not just cut off. A plain top-25 by this order shows whichever
    // kind of match happens to be most numerous, and for a common word that is the suttas
    // NAMED after it — dukkha has 48 of those in the four nikayas alone, so a plain cut showed
    // 40 named suttas and not one that DEFINES the term. So each kind gets a reserved share of
    // the cap and the rest is filled by occurrence count:
    //
    //   40 rows = 25 by occurrence count + a 15-row block (10 named + 5 defining, or 15 named
    //             when nothing in the corpus defines the term)
    //
    // A sutta that both names and defines the term is counted once, toward the NAMED share —
    // the title is the stronger signal, and double-counting would silently shrink the rest.
    // The cap itself stays strict: nothing is pushed in past it, and the category order above
    // is still the first key, so later collections are not dragged in to fill a quota.
    // limit is a number, the string "all", or omitted (40).
    const cap = limit === 'all' ? Infinity : (typeof limit === 'number' ? limit : DEFAULT_LIMIT);
    const hasDefinitions = scored.some(x => x.defines);
    const titleQuota = hasDefinitions ? QUOTA_TITLED_WITH_DEFS : QUOTA_TITLED_ALONE;
    const definitionQuota = hasDefinitions ? QUOTA_DEFINITIONS : 0;

    let kept = scored;
    let truncated;
    if (scored.length > cap) {
        const taken = new Set();
        const picked = [];
        const take = (x) => {
            if (picked.length >= cap || taken.has(x.id)) return;
            taken.add(x.id);
            picked.push(x);
        };
        let budget = Math.min(titleQuota, cap);
        for (const x of scored) { if (picked.length >= budget) break; if (x.byTitle) take(x); }
        budget = Math.min(titleQuota + definitionQuota, cap);
        for (const x of scored) { if (picked.length >= budget) break; if (x.defines) take(x); }
        // The remaining 25 come from suttas that are NEITHER named after the term NOR defining
        // it — otherwise the fill would just continue down the title-first order and the two
        // quotas above would cap nothing (measured before this: 20 of 25 came out named, and a
        // plain cut of 40 for "dukkha" showed 40 named suttas and not one definition).
        for (const x of scored) { if (picked.length >= cap) break; if (!x.byTitle && !x.defines) take(x); }
        for (const x of scored) { if (picked.length >= cap) break; take(x); }

        kept = scored.filter(x => taken.has(x.id)); // keep the ranking order, not the pick order
        // Counted mutually exclusively, so the three numbers add up to what was returned.
        const named = kept.filter(x => x.byTitle).length;
        const defining = kept.filter(x => x.defines && !x.byTitle).length;
        const composed = [];
        if (named) composed.push(`${named} named after the term`);
        if (defining) composed.push(`${defining} defining or explaining it`);
        if (kept.length - named - defining > 0) composed.push(`${kept.length - named - defining} by occurrence`);
        truncated = `showing ${kept.length} of ${scored.length} suttas`
            + (composed.length ? ` (${composed.join(', ')})` : '')
            + ` — ${scored.length - kept.length} more matched and are not listed. `
            + `totalFiles is the true count: pass a larger limit, or limit: "all", for more.`;
    }
    return { scored, kept, truncated };
}

function getServer() {
    const server = new McpServer({ name: 'dg-node', version: '1.2.0' }, { instructions: INSTRUCTIONS });

    server.registerTool('search', {
        description: 'Search the Pali Canon on dhamma.gift by keyword/substring or REGEX (min 3 letters, no semantic search). Patterns like "kata.*dukkha", "vucc.*dukkha", "katha.*dukkha" find the canon\'s own definitions and expositions of a term. Returns a CENSUS of every matching sutta — id, title, match count, metaphor count, reader link — Pali only, ordered so that suttas that DEFINE the term come first, then ones NAMED after it, then by how often it occurs. Set include_segments for the matched Pali lines, include_translations (+ langs) for translations. 40 suttas by default (25 by occurrence count, plus 15 for suttas named after the term and ones defining it); metadata.totalFiles reports the true count, and limit takes a number or "all".',
        inputSchema: {
            query: z.string().describe('Keyword, phrase, or REGEX pattern to search for (Pali or a translation word). Patterns work and are the way to find definitions: "kata.*dukkha" (Katamañca … dukkhaṁ?), "vucc.*dukkha" (idaṁ vuccati dukkhaṁ), "katha.*dukkha" (Kathañca … hoti?).'),
            scope: z.string().optional().describe('default|all|dhamma|vinaya|abhi|khudakka|or comma-separated nikaya codes (dn,mn,...). Default: default (4 nikayas + 6 KN books).'),
            exact: z.boolean().optional().describe('Whole-word match only. Default: false.'),
            langs: z.array(z.string()).optional().describe('Translation languages to include with include_translations, e.g. ["ru","en"]. Default: none (Pali only).'),
            translators: z.array(z.string()).optional().describe('Explicit translator keys, e.g. ["en_sujato"] to include Sujato, or ["ru_sv"]. Needed only to override the default translator choice.'),
            include_segments: z.boolean().optional().describe('Also return the matched Pali segments (segment id, text, reader link). Default: false — the census alone.'),
            include_translations: z.boolean().optional().describe('Also return translations of the matched segments (implies include_segments). Default: false.'),
            limit: z.union([z.number().int().min(1), z.literal('all')]).optional().describe('How many suttas to list: a number, or "all" for every match. Default: 40, composed of 25 by occurrence count plus 15 for suttas named after the term and defining it. Strict — the cap means the cap. metadata.totalFiles always carries the true match count, so a truncated answer still tells you how much more there is. Suttas whose TITLE matches the query rank first within their collection.'),
        },
    }, async ({ query, scope, langs, translators, include_segments, include_translations, exact, limit }) => {
        // Naming a translator is asking for his translation: without include_translations it was silently dropped.
        if (translators && translators.length) include_translations = true;
        const scopeArg = scope || 'default';
        // Always search every language: a Russian word has to find the sutta, and the old default
        // of ["en"] returned ZERO for "черепаха" and "tortoise" (5). Only the OUTPUT is limited
        // to Pali — the fast response carries no translation text either way.
        const answer = await fastAnswer(query, scopeArg, !!exact, ['all']);
        if (answer.error) return asText({ error: answer.error }, true);
        const r = answer.result || {};
        const all = r.data && typeof r.data === 'object' ? r.data : {};
        const { scored, kept, truncated } = composeCensus(all, query, limit);

        const metadata = {
            query,
            scope: scopeArg,
            totalFiles: r.metadata ? r.metadata.totalFiles : scored.length,
            totalMatches: r.metadata ? r.metadata.totalMatches : 0,
            returned: kept.length,
            pali: true,
            langs: (include_translations && langs && langs.length) ? langs : [],
        };
        if (truncated) metadata.truncated = truncated;

        const out = { metadata, suttas: [] };
        const keptIds = kept.map(x => x.id);

        if (include_translations) {
            // Phase 2, the same call the result page makes: matched segments only, plus context.
            const enriched = await enrichResponse(query, scopeArg, !!exact,
                (langs && langs.length) ? langs : [], 0, 0, keptIds);
            const data = (enriched && enriched.data) || {};
            let suppressed = 0;
            for (const x of kept) {
                const row = censusRow(x.id, x.s, x.hits);
                const segs = (data[x.id] && data[x.id].segments) || [];
                // Explicitly named translators go on top of whatever the priority picked.
                if (translators && translators.length && segs.length) {
                    for (const t of fetchNamedTranslations(segs.map(sg => sg.segment), translators)) {
                        const seg = segs.find(sg => sg.segment === t.segment_id);
                        if (seg) { seg.translations = seg.translations || {}; seg.translations[t.key] = t.txt; }
                    }
                }
                if (!namesSujato(translators)) for (const sg of segs) if (stripSujato(sg.translations)) suppressed++;
                row.segments = segs.map(sg => squeezeSegment(sg, true));
                out.suttas.push(row);
            }
            if (suppressed) metadata.suppressed = { en_sujato: `${suppressed} segments — pass translators:["en_sujato"] to include it` };
        } else {
            for (const x of kept) {
                const row = censusRow(x.id, x.s, x.hits);
                if (include_segments) row.segments = x.segs.map(sg => squeezeSegment(sg, false));
                out.suttas.push(row);
            }
        }

        out.translations_available = availableTranslations(keptIds);
        out.note = NOTE;
        return asText(out);
    });

    server.registerTool('get_text', {
        description: 'Fetch a sutta by id (e.g. "dn22", "mn1", "sn56.11") — the Pali root text of every segment. Pali only by default; pass langs for translations, translators to name a translator (e.g. ["en_sujato"]). Same data as dhamma.gift/api/text.',
        inputSchema: {
            suttaId: z.string().describe('SuttaCentral-style id, e.g. dn22, mn1, sn56.11.'),
            langs: z.array(z.string()).optional().describe('Translation languages to include, e.g. ["ru","en"]. Default: none (Pali only).'),
            translators: z.array(z.string()).optional().describe('Explicit translator keys, e.g. ["en_sujato"] to include Sujato.'),
        },
    }, async ({ suttaId, langs, translators }) => {
        const id = suttaId.toLowerCase();
        const base = await getSuttaBaseData(id);
        if (!base) {
            return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown sutta id: ${id}` }) }], isError: true };
        }
        // Empty array, not a fallback: buildTextDataFromBase treats [] as "no translations", which
        // is the pali-only answer this tool now defaults to. `translators` is passed through so a
        // named translator overrides the priority pick (the caller asked for it by name).
        // A named translator implies its language: translators:["en_thanissaro"] alone used to come back with no
        // translations at all, because langs stayed [] (agents read that as "not in the corpus").
        const named = (translators || []).map(t => String(t).trim()).filter(t => t.indexOf('_') > 0);
        const useLangs = (langs && langs.length) ? langs : [...new Set(named.map(t => t.slice(0, t.indexOf('_'))))];
        const data = await buildTextDataFromBase(base, id, useLangs, named.length ? named : null);
        let suppressed = 0;
        if (!namesSujato(translators)) {
            for (const sg of data.segments || []) if (stripSujato(sg.translations)) suppressed++;
        }
        for (const sg of data.segments || []) if (sg.segment) sg.link = READER + sg.segment;
        data.link = READER + id;
        if (suppressed) {
            data.suppressed = { en_sujato: `${suppressed} segments — pass translators:["en_sujato"] to include it` };
            data.note = NOTE;
        }
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    });

    server.registerTool('compare_translations', {
        description: 'One segment of the canon in the Pali root and every available translation side by side. Use a segment id from search/get_text, e.g. "mn129:21.3". Sujato (en_sujato) is excluded unless named in translators.',
        inputSchema: {
            segmentId: z.string().describe('Segment id as returned by search, e.g. mn129:21.3 or dn22:1.1.'),
            langs: z.array(z.string()).optional().describe('Limit to these languages, e.g. ["ru","en"]. Default: all.'),
            translators: z.array(z.string()).optional().describe('Explicit translator keys, e.g. ["en_sujato"] to include Sujato.'),
        },
    }, async ({ segmentId, langs, translators }) => {
        const seg = segmentId.trim().toLowerCase();
        const withSujato = namesSujato(translators);
        let rows = db().prepare("SELECT kind, lang, translator, txt FROM texts WHERE segment_id = ? ORDER BY CASE kind WHEN 'root' THEN 0 WHEN 'variant' THEN 1 ELSE 2 END, lang, translator").all(seg)
            .filter(r => r.translator !== 'ai') // AI translations are hidden content, as in search
            .filter(r => r.kind !== 'translation' || !langs || !langs.length || langs.includes(r.lang));
        if (!rows.length) return asText({ error: `Unknown segment id: ${seg}` }, true);
        let suppressed = 0;
        if (!withSujato) {
            const before = rows.length;
            rows = rows.filter(r => !(r.kind === 'translation' && r.lang === 'en' && r.translator === 'sujato'));
            suppressed = before - rows.length;
        }
        const out = { segment: seg, link: READER + seg, texts: rows.map(r => ({ kind: r.kind, lang: r.lang, translator: r.translator, text: r.txt })) };
        if (suppressed) out.suppressed = { en_sujato: `${suppressed} text(s) — pass translators:["en_sujato"] to include it` };
        return asText(out);
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
        const langsRows = db().prepare("SELECT lang, translator, COUNT(*) segments FROM texts WHERE kind = 'translation' AND translator <> 'ai' GROUP BY 1, 2 ORDER BY lang, segments DESC").all();
        const byLang = {};
        for (const r of langsRows) (byLang[r.lang] = byLang[r.lang] || []).push({ translator: r.translator, segments: r.segments });
        return asText({
            collections: collections.map(c => ({ category: c.category, suttas: c.n })),
            books_by_prefix: books.map(b => ({ prefix: b.b, suttas: b.n })),
            translation_languages: Object.keys(byLang).length,
            translations: byLang,
            note: 'Pali root text covers everything; translation coverage differs per translator. '
                + 'Also here, and nowhere else: the cross-edition variant apparatus (Burmese, Thai, Sri Lankan, PTS readings) is in dg.db — use compare_translations on a segment to see the text, and note that variants are not yet a separate tool.',
        });
    });

    return server;
}

// What an agent should know before the first call: how to search, how to phrase answers, where
// the links go, and why translations are opt-in.
const INSTRUCTIONS = `Dhamma.gift: the Pali Canon (Sutta and Vinaya) with Pali root text and translations (25 languages, including Russian and English).
- search is a literal substring/keyword search (min 3 letters, diacritics ignored: "kacchap" finds mahakacchapa, "tanha" finds taṇhā). It does NOT understand meaning: for a topic ("turtle") try the Pali word(s) and translation words yourself (kacchapa, kummo; turtle, tortoise; черепаха) and merge the results. The answer is a CENSUS of every matching sutta, ordered so that suttas that DEFINE the term come first, then ones named after it, then by how often it occurs — read the top of the list first: a definition tells you what the term means, which a list of similarly-named suttas does not.
- THE WAY TO FIND WHERE THE CANON DEFINES A TERM is to search the formula itself as a REGEX (the engine supports patterns). Three patterns cover the whole apparatus, and they are the sharpest tool here — sharper than reading a census:
    "kata.*<term>"  -> "Katamañca, bhikkhave, <term>? …"  the definition question. e.g. kata.*dukkha finds dn22:18.1 "Katamañca, bhikkhave, dukkhaṁ ariyasaccaṁ?"
    "vucc.*<term>"  -> "… idaṁ vuccati, bhikkhave, <term>" the closing line. e.g. vucc.*dukkha finds dn22:18.20 "idaṁ vuccati, bhikkhave, dukkhaṁ."
    "katha.*<term>" -> "Kathañca, bhikkhave, … <term> … hoti?" the exposition question, answered right after. e.g. katha.*dukkha finds mn48:8.1
  A pattern matches within ONE segment, so a definition split across segments may show under only one of the three — run all three and merge. Answer from the Suttas (and the Vinaya for monastic rules): scope "default,vinaya" adds the Vinaya; scope "all" searches the whole corpus and is only for a user who asks for it by name — do not suggest it or quote from beyond the Sutta and Vinaya on your own.
- The answer is Pali only by default. That is deliberate for research: the translations of this corpus are renderings of the same root text, so they are evidence to be examined, not a neutral convenience. Add include_translations + langs (["ru","en"]) when you need to quote a translation, and always name the translator.
- The census is capped at 40 suttas by default, strictly: 40 means 40, nothing is pushed in past the cap. Those 40 are COMPOSED, not just the top of the ranking: 25 are the suttas that mention the term most, and 15 are reserved for the most useful kinds of match — 10 named after the term plus 5 that define or explain it, or 15 named when nothing does. That is why a term matching 1498 suttas still surfaces its definitions. metadata.totalFiles is the TRUE number that matched, so never read the 40 as the whole answer. Pass limit as a number for more rows, or limit: "all" for every match. Ordering is by collection first (dhamma, then khuddaka, then vinaya, then abhidhamma), so when the four nikayas already fill the cap, later collections are deliberately not shown.
- Reading the census: "matches" is how many TIMES the query occurs in that sutta's Pali root text (the number the ordering uses, so the order can be checked against it — it is not the count of matched segments); "metaphors" is how many metaphors the old site counted in the text. A short sutta carrying several metaphors is a descriptive, figurative one — judge that yourself from the id and title. "metaphors" is 0 for 91% of the corpus, so 0 means "never counted", not "none".
- Sujato (en_sujato) is never included unless you name him in translators. Everything else follows the project's translator priority.
- get_text reads a sutta (Pali only unless you pass langs); include_segments in search gives the matched Pali lines; compare_translations shows one segment in all translations; list_structure tells which texts exist.
- Sutta ids are SuttaCentral-style: dn22, mn1, sn56.11, an4.41, snp1.1, dhp1-20. Read the census, then pull the text for the suttas you actually need — do not try to read the whole canon in one call.`;

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

module.exports = { mcpHandler, composeCensus, stripSujato };
