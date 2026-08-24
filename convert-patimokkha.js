#!/usr/bin/env node
// One-off converter: legacy assets/texts/{bupm,bipm}.php (PHP, dead under Node) ->
// static reader/{bu-pm,bi-pm}.html served at /pm.php and /bipm.php (see dg-light.js).
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
    { src: 'bupm.php', out: 'bu-pm.html', title: 'Bhikkhupātimokkha', collapseId: 'bupmCollapse', otherHref: '/bipm.php?expand=true', otherLabel: 'bi-pm' },
    { src: 'bipm.php', out: 'bi-pm.html', title: 'Bhikkhunīpātimokkha', collapseId: 'bipmCollapse', otherHref: '/pm.php?expand=true', otherLabel: 'bu-pm' },
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

function renderPage({ title, collapseId, content, otherHref, otherLabel }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="/assets/css/styles.css" rel="stylesheet" />
  <link rel="icon" type="image/png" href="/assets/img/favico-noglass.png" />
  <link rel="stylesheet" href="/assets/css/playerStyle.css">
  <link rel="stylesheet" href="/assets/css/paliLookup.css">
  <link href="/assets/css/extrastyles.css" rel="stylesheet" />
  <link rel="apple-touch-icon" sizes="152x152" href="/assets/img/favico-noglass.png">
  <title>${title}</title>
</head>
<body>
  <div class="container mt-3">
    <div class="align-items-center toggle-switch input-group-append">
      <div class="input-group align-items-center">
        <top-nav-icons type="read" show-dict></top-nav-icons>
        <a class="ms-1 btn-sm btn-secondary rounded-pill text-decoration-none" href="${otherHref}">${otherLabel}</a>
      </div>
    </div>
  </div>
  <div class="container">
    <div class="mt-3">
      <div class="level1 d-flex align-items-center">
        <span class="toggle-button btn btn-primary btn-sm form-check-inline btn-fixed-width btn-rotate"
          data-bs-toggle="collapse" data-bs-target="#${collapseId}">-</span>
        <h2><a href="#" data-bs-toggle="collapse" data-bs-target="#${collapseId}">${title}</a></h2>
      </div>
      <div class="collapse" id="${collapseId}">
${content}
      </div>
    </div>
    <div class="mb-5"></div>
  </div>
  <script src="/assets/js/jquery-3.7.0.min.js"></script>
  <script src="/assets/js/bootstrap.bundle.5.3.1.min.js"></script>
  <script src="/assets/js/pmjs.js"></script>
  <script src="/assets/js/openFdg.js"></script>
  <script src="/assets/js/settings.js" defer></script>
  <script src="/assets/js/nav-component.js" defer></script>
  <script src="/assets/js/themeswitch.js" defer></script>
  <script src="/assets/js/standalone-dpd/pali-lookup-standalone.js" defer></script>
  <script>
    // save/restore collapsed state, ported verbatim from legacy pm.php
    $(document).ready(function () {
        var isLocal = window.location.href.includes("localhost");
        $(".collapse").on("shown.bs.collapse", function () {
            if (this.id !== "navbarResponsive" && this.id !== "collapseSettings") {
                var keyPrefix = isLocal ? "lcl_" : "fdg_";
                localStorage.setItem(keyPrefix + "coll_" + this.id, true);
            }
        });
        $(".collapse").on("hidden.bs.collapse", function () {
            if (this.id !== "navbarResponsive" && this.id !== "collapseSettings") {
                var keyPrefix = isLocal ? "lcl_" : "fdg_";
                localStorage.removeItem(keyPrefix + "coll_" + this.id);
            }
        });
        $(".collapse").each(function () {
            var keyPrefix = isLocal ? "lcl_" : "fdg_";
            if (localStorage.getItem(keyPrefix + "coll_" + this.id) === "true") {
                $(this).collapse("show");
            } else {
                $(this).collapse("hide");
            }
        });
    });
  </script>
  <script>
    document.addEventListener('DOMContentLoaded', function () {
        if (typeof enablePaliLookup === 'function') enablePaliLookup();
    });
    document.addEventListener('DOMContentLoaded', function () {
        var urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('expand') === 'true') {
            var collapseElement = document.getElementById('${collapseId}');
            if (collapseElement) {
                var collapseInstance = bootstrap.Collapse.getInstance(collapseElement) ||
                                       new bootstrap.Collapse(collapseElement);
                collapseInstance.show();
                var toggleButton = document.querySelector('[data-bs-target="#${collapseId}"]');
                if (toggleButton) {
                    toggleButton.classList.remove('collapsed');
                    toggleButton.setAttribute('aria-expanded', 'true');
                }
            }
        }
    });
  </script>
  <script src="/assets/js/smoothScroll.js" defer></script>
</body>
</html>
`;
}

const outDir = path.join(__dirname, 'reader');
for (const page of PAGES) {
    const raw = fs.readFileSync(path.join(LEGACY_ROOT, 'assets', 'texts', page.src), 'utf8');
    const { body, convertedCount } = convertBody(raw);
    if (convertedCount === 0) throw new Error(`${page.src}: no links converted, check source format`);
    const html = renderPage({ title: page.title, collapseId: page.collapseId, content: body, otherHref: page.otherHref, otherLabel: page.otherLabel });
    fs.writeFileSync(path.join(outDir, page.out), html, 'utf8');
    console.log(`${page.src} -> reader/${page.out} (${convertedCount} links converted)`);

    // Bare fragment (no page shell) — used by /toc's inline expand (public/spa/toc.js),
    // served via /api/patimokkha-fragment/:side (dg-light.js), fetched only on first click.
    const fragmentOut = page.out.replace('.html', '-fragment.html');
    fs.writeFileSync(path.join(outDir, fragmentOut), body, 'utf8');
    console.log(`${page.src} -> reader/${fragmentOut}`);
}
