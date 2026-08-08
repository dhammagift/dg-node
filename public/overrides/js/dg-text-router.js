// Universal search/reader input classifier — shared between res/index.html (search results
// page) and reader/reader-template.html (reader page), so both boxes behave identically:
// typing a text/chapter reference opens it, anything else runs a keyword search.
//
// Ported from dhammagift/dg's scripts/opentexts.php (the legacy PHP router for the same
// input box) — see TODO.md "нюансы" for the mapping. Two differences from the PHP original:
//   1. The PHP version checks text existence itself (grep against text_indexes.txt + a
//      ranges.sh fallback). Here that check stays server-side: this module only produces a
//      normalized candidate id (for a specific text) or id-prefix (for a whole chapter/
//      category, e.g. "sn25" or a bare Vinaya rule category) — dg-light.js's `/:slug` route
//      already does the real `skeletonDB` lookup and falls back to a keyword search on its
//      own if the id turns out not to exist, exactly like the PHP fallback.
//   2. There's no dg-node equivalent of legacy `read.php`'s prebuilt table-of-contents page
//      yet, so a chapter/category id renders a minimal stub listing (see dg-light.js) instead
//      of a full TOC — same classification, simpler destination page.
(function (global) {
    'use strict';

    var VINAYA_CATS = ['pj', 'ss', 'ay', 'np', 'pc', 'pd', 'sk', 'as'];

    // Trim, lowercase, fix the keyboard layout (reuses settings.js's cyrillicToLatin — both
    // pages already load settings.js), join "letter <space> digit", normalize dot spacing,
    // then fix the same loose-prefix/typo shorthands opentexts.php fixes ("s123"/"s.123" ->
    // "sn123", "m."/"d."/"a." -> "mn"/"dn"/"an", "sm123" -> "sn123" — "m" next to "n").
    function normalize(raw) {
        var q = String(raw == null ? '' : raw).trim().toLowerCase();
        if (!q) return '';
        if (typeof global.cyrillicToLatin === 'function') {
            q = global.cyrillicToLatin(q);
        }
        q = q.replace(/([a-z])\s+(\d)/g, '$1$2');
        q = q.replace(/\s*\.\s*/g, '.');
        q = q.replace(/\bs(?!n)\.?(\d[\d.-]*)/, 'sn$1');
        q = q.replace(/\bsm(\d[\d.-]*)/, 'sn$1');
        q = q.replace(/(^|[^-])\bm\.?(\d[\d.-]*)/, '$1mn$2');
        q = q.replace(/(^|[^-])\bd\.?(\d[\d.-]*)/, '$1dn$2');
        q = q.replace(/(^|[^-])\ba\.?(\d[\d.-]*)/, '$1an$2');
        return q;
    }

    // Classify normalized input. Returns:
    //   { type: 'text', id }           — a specific text/rule, navigate straight to it.
    //   { type: 'chapter', id }        — a whole nikaya/samyutta/rule-category, no single
    //                                     text — navigate to it too, dg-light.js renders a
    //                                     stub listing (or falls back to search if empty).
    //   { type: 'search', query }      — not a recognized reference, run a keyword search.
    function classify(raw) {
        var q = normalize(raw);
        if (!q) return { type: 'search', query: '' };

        // Fully-qualified Vinaya id, already in skeleton-key form — pass through.
        if (/^pli-tv-/.test(q)) return { type: 'text', id: q };

        // mn/dn/dhp/iti + number (no vagga.sutta sub-numbering), or snp/sn/an/ud/thig/thag +
        // chapter.subnumber (with optional range) — all specific texts.
        if (/^(mn|dn|dhp|iti)\d{1,3}(-\d{1,3})?$/.test(q) ||
            /^(snp|sn|an|ud|thig|thag)\d{1,3}[.:]\d{1,3}(-\d{1,3})?$/.test(q)) {
            return { type: 'text', id: q };
        }

        // Bare Vinaya categories (no digits at all) — "pm/bu/bpm/bupm" = whole Bhikkhu
        // Patimokkha, "bi/bipm" = whole Bhikkhuni Patimokkha, bare rule-category code
        // ("pj", "bi-pj", ...) = that category. Trailing "-" marks these as prefixes for the
        // server-side chapter-children lookup (see findChapterChildren in dg-light.js).
        if (/^(bu|pm|bpm|bupm)$/.test(q)) return { type: 'chapter', id: 'pli-tv-bu-vb-' };
        if (/^(bi|bipm)$/.test(q)) return { type: 'chapter', id: 'pli-tv-bi-vb-' };
        var bareCat = q.match(new RegExp('^(bi-)?(' + VINAYA_CATS.join('|') + ')$'));
        if (bareCat) {
            return { type: 'chapter', id: 'pli-tv-' + (bareCat[1] ? 'bi' : 'bu') + '-vb-' + bareCat[2] };
        }

        // Numbered Vinaya rule: "pj1", "bi-pj1", "bu-pj1" -> pli-tv-{bu|bi}-vb-pj1.
        var numberedRule = q.match(new RegExp('^(bi-)?(' + VINAYA_CATS.join('|') + ')(\\d+)$')) ||
            q.match(/^(bu|bi)-([a-z]{2})(\d+)$/);
        if (numberedRule) {
            var side = /^bi/.test(q) ? 'bi' : 'bu';
            var rest = q.replace(/^(bu-|bi-)/, '');
            return { type: 'text', id: 'pli-tv-' + side + '-vb-' + rest };
        }

        // Khandhaka / Parivara.
        if (/^(kd|pvr)\d+/.test(q)) return { type: 'text', id: 'pli-tv-' + q };

        // Bare nikaya name (whole book, e.g. "sn", "mn", "dhp") or nikaya + chapter number
        // with no sub-number (e.g. "sn25", "an11") — a chapter, not a single text.
        if (/^(mn|dn|sn|an|kn|snp|ud|iti|thag|thig|dhp)$/.test(q)) return { type: 'chapter', id: q };
        if (/^(sn|an)\d{1,2}$/.test(q)) return { type: 'chapter', id: q };

        return { type: 'search', query: q };
    }

    global.DgTextRouter = { normalize: normalize, classify: classify };
})(typeof window !== 'undefined' ? window : this);
