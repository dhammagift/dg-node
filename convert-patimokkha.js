#!/usr/bin/env node
// One-off converter: legacy assets/texts/{bupm,bipm}.php (PHP, dead under Node) ->
// reader/{bu-pm,bi-pm}-fragment.html, the bare text /toc expands inline (/api/patimokkha-fragment).
// Rewrites every rule link from the legacy `$readerPage/?q=<id>#<anchor>` scheme to the
// real dg-node route: bu-pm/bi-pm (self-link) -> /pli-tv-{bu|bi}-pm, a rule id like
// bu-pj1/bi-ss3 -> /pli-tv-{bu|bi}-vb-<rest> (matches the existing ids in dg_db_light.json
// and the identical transform already used client-side in dg-text-router.js classify()).
// Run once: `node convert-patimokkha.js`. Source Pali text doesn't change often, so this
// isn't live/request-time code.
'use strict';
const fs = require('fs');
const path = require('path');

const LEGACY_ROOT = '/var/www/html';
const PAGES = [
    { src: 'bupm.php', out: 'bu-pm.html' },
    { src: 'bipm.php', out: 'bi-pm.html' },
];

function ruleIdToUrl(id, anchor) {
    const target = (id === 'bu-pm' || id === 'bi-pm')
        ? 'pli-tv-' + id
        : 'pli-tv-' + id.replace(/^(bu|bi)-/, '$1-vb-');
    return '/' + target + (anchor ? '#' + anchor : '');
}

function convertBody(raw) {
    let convertedCount = 0;
    let body = raw
        // dead debug comments, e.g. `<!-- <?php echo "$readerPage"; ?>?q=bu-pm#5.0-->`
        .replace(/<!--[\s\S]*?-->/g, '')
        // "right-text reverse-order" (extrastyles.css: rtl + flex column-reverse, cascading down
        // 4 more DOM levels via ".reverse-order > div > div..." — reaches the nested vagga
        // sub-headings too, not just the top-level sections) on the outer wrapper flips every
        // section's visual order and breaks each header/collapse pairing apart — a legacy
        // artifact, not needed structure. \s+ (not a literal single space): bipm.php has two
        // spaces between the classes, bupm.php has one — an earlier single-space regex silently
        // no-opped on bipm.php only, leaving bi-pm's fragment broken while bu-pm looked fixed.
        .replace(/\s*right-text\s+reverse-order/, '')
        .replace(/href="<\?php echo \$readerPage;\?>\/\?q=([a-z0-9-]+)#([^"]*)"/g, (m, id, anchor) => {
            convertedCount++;
            return `href="${ruleIdToUrl(id, anchor)}"`;
        });

    // self-check: nothing PHP-ish or the reverse-order class (see above) should survive
    if (/<\?php|readerPage/.test(body)) {
        throw new Error('conversion incomplete: leftover PHP/readerPage found');
    }
    if (/reverse-order/.test(body)) {
        throw new Error('conversion incomplete: leftover reverse-order class found');
    }
    return { body, convertedCount };
}

const outDir = path.join(__dirname, 'reader');
for (const page of PAGES) {
    const raw = fs.readFileSync(path.join(LEGACY_ROOT, 'assets', 'texts', page.src), 'utf8');
    const { body, convertedCount } = convertBody(raw);
    if (convertedCount === 0) throw new Error(`${page.src}: no links converted, check source format`);
    // Bare fragment (no page shell) — used by /toc's inline expand (public/spa/toc.js),
    // served via /api/patimokkha-fragment/:side, fetched only on first click.
    const fragmentOut = page.out.replace('.html', '-fragment.html');
    fs.writeFileSync(path.join(outDir, fragmentOut), body, 'utf8');
    console.log(`${page.src} -> reader/${fragmentOut} (${convertedCount} links converted)`);
}
