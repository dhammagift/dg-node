// Builds dist/dg-ui.css from the app's OWN stylesheets — nothing here is authored by hand.
//
// Layers, in cascade order:
//   1. Bootstrap 5.3.1 (vendored in the repo; the app really loads it, and the
//      component markup leans on .btn/.form-control/grid/utilities)
//   2. Reader palette + "Robto Serif" @font-face  (reader/css/rus-multi.css)
//   3. --dg-* design tokens, light + dark          (search/css/home.css)
//   4. Component rules matched out of home.css / uiextra.css by selector
//
// Re-scoping: in the app the tokens hang off `body.dg-skin-minimal` and dark theme off
// `body.dg-skin-minimal.dark`. A design-system consumer has no such body class, so the token
// block is re-hosted on :root (the skin class is kept as an alias) and dark is accepted from
// `.dark`, `[data-theme="dark"]` and the OS preference. Selectors of component rules keep
// their real class names verbatim — that is what makes a generated design map 1:1 onto
// dhamma.gift markup.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

/** Split a stylesheet into top-level chunks, keeping @media/@supports blocks whole. */
function splitRules(css) {
  const out = [];
  let depth = 0, start = 0, inComment = false, inString = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i], next = css[i + 1];
    if (inComment) { if (c === '*' && next === '/') { inComment = false; i++; } continue; }
    if (inString) { if (c === '\\') { i++; continue; } if (c === inString) inString = null; continue; }
    if (c === '/' && next === '*') { inComment = true; i++; continue; }
    if (c === '"' || c === "'") { inString = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { out.push(css.slice(start, i + 1).trim()); start = i + 1; }
    }
  }
  return out.filter(Boolean);
}

const selectorOf = (rule) =>
  rule.slice(0, rule.indexOf('{')).replace(/\/\*[\s\S]*?\*\//g, '').trim();
const bodyOf = (rule) => rule.slice(rule.indexOf('{') + 1, rule.lastIndexOf('}'));

/** Classes the design system ships. A rule is kept when its selector mentions one of them. */
const DS_CLASSES = [
  // shell
  'dg-brand', 'dg-brand-logo', 'dg-brand-name', 'dg-icon-btn', 'dg-menu-btn', 'dg-plain-btn',
  'dg-hero-inner', 'dg-hero-form', 'hero-row', 'dg-input-shell', 'dg-shell-logo', 'dg-shell-btn',
  'dg-shell-sep', 'dg-shell-go', 'dg-search-icon', 'dg-shell-spinner', 'dg-qs-btn', 'searchinput',
  'dg-busy', 'dg-busy-indicator', 'dg-loading',
  // home
  'dg-tiles', 'dg-tile', 'dg-tile-ic', 'dg-tile-placeholder', 'dg-segmented', 'dg-seg-ic',
  'dg-scope', 'dg-scope-group', 'dg-scope-list', 'dg-scope-toggle', 'dg-scope-label',
  'dg-howto-quote', 'dg-howto-refs', 'dg-howto-warn', 'dg-extra-title', 'dg-cta', 'dg-cta-btn',
  'dg-contacts', 'dg-contact-btn', 'dg-contacts-motto', 'dg-powered-by', 'dg-announce',
  'dg-announce-box', 'dg-announce-close', 'dg-footer-link',
  'dg-state-home', 'dg-state-results', 'dg-state-reader', 'dg-state-toc', 'dg-header-hidden',
  'dg-hero-band', 'dg-header-backdrop', 'table-wrapper', 'container-fluid',
  // overlays
  'dg-sheet', 'dg-sheet-backdrop', 'dg-sheet-handle', 'dg-sheet-head', 'dg-sheet-close',
  'dg-sheet-tabs', 'dg-sheet-body', 'dg-sheet-row', 'dg-sheet-empty', 'dg-chip', 'dg-row-ic',
  'dg-row-ic-img', 'dg-row-icon', 'dg-row-label', 'dg-row-desc', 'dg-row-star', 'dg-group-title',
  'dg-qs-note', 'dg-toggle-label', 'dg-tile-label', 'dg-drawer', 'dg-drawer-row', 'dg-drawer-head',
  'dg-drawer-body', 'dg-drawer-group', 'dg-drawer-backdrop', 'dg-mega', 'dg-mega-col',
  'dg-mega-compact', 'dg-mega-block-divider', 'dg-drawer-head', 'dg-drawer-close', 'dg-toggle-row', 'dg-tgl', 'dg-toggle-hotkey', 'dg-icon-opt', 'dg-mode-row',
  'dg-mode-row-top', 'dg-mode-row-hotkey', 'dg-mode-row-desc', 'dg-mega-block', 'dg-chip-group',
  'smart-btn', 'smart-label', 'dg-field-input', 'dg-diac', 'dg-anchored', 'dg-topbar',
  // results
  'quote-segment', 'pli-lang', 'right-column', 'match', 'finder', 'fdgLink', 'ruLink', 'dprLink',
  'bwLink', 'dg-title-lang', 'dg-skeleton-bar', 'dg-read-mark', 'resultheader', 'variants',
  'quoteLink', 'quoteLink-start', 'copyLink',
  // reader
  'dg-reader-hero', 'dg-home-btn', 'dg-search-field', 'sutta', 'suttas', 'toc-item', 'toc-h1',
  'toc-h2', 'toc-h3', 'toc-h4', 'smart-btn', 'byline', 'lang-2nd', 'abbr', 'plain-label',
  'sc-ext-link', 'sc-link', 'voice-link', 'variant', 'quote', 'greyedout', 'column-view', 'right-text',
  'menu-icon', 'title-svg-icon', 'trn-title-icon', 'active-word', 'hide-pali', 'hide-russian',
  'hide-english', 'icon-button', 'button-area',
];
const classRe = new RegExp(`\\.(?:${DS_CLASSES.map((c) => c.replace(/[-]/g, '\\-')).join('|')})(?![\\w-])`);

/** Drop the app-shell scoping so the rules apply to a bare component tree. */
function rescope(selector) {
  return selector
    .split(',')
    .map((s) => s
      .replace(/body\.dg-skin-minimal\.dark\b/g, '.dark')
      .replace(/body\.dg-skin-minimal\b\s*/g, '')
      .replace(/body\.dark\b/g, '.dark')
      // The app gates a lot of chrome on the shell's own state — body.dg-state-results,
      // body.dg-busy, body.dg-header-hidden. A library consumer has no such <body>, so the
      // `body` qualifier is dropped and the component carries the state class itself (see
      // SearchShell's `state` prop and BusyIndicator's wrapper).
      .replace(/\bbody(\.[\w-]+)/g, '$1')
      .replace(/^\s*body\s+/, '')
      .trim())
    .filter(Boolean)
    .join(', ');
}

function harvest(css, label) {
  const kept = [];
  for (const rule of splitRules(css)) {
    if (rule.startsWith('@media') || rule.startsWith('@supports')) {
      const head = rule.slice(0, rule.indexOf('{')).trim();
      const inner = harvestPlain(bodyOf(rule));
      if (inner) kept.push(`${head} {\n${inner}\n}`);
      continue;
    }
    if (rule.startsWith('@keyframes') || rule.startsWith('@-webkit-keyframes')) { kept.push(rule); continue; }
    if (rule.startsWith('@')) continue;
    const one = keepPlain(rule);
    if (one) kept.push(one);
  }
  return kept.length ? `/* ---- from ${label} ---- */\n${kept.join('\n')}` : '';
}

function harvestPlain(css) {
  return splitRules(css).map(keepPlain).filter(Boolean).join('\n');
}

/* Selectors the class matcher can't see: the reader styles translation columns by attribute
   (`[class*="-lang"]`), and the sutta body hangs off #sutta. */
const EXTRA_SELECTORS = [
  /\[class\*=["']-lang["']\]/,
  /\.(?:ru|en|pli)-lang\b/,
  /p\.sc-link/,
  // Several shells are styled by id, not class — the drawer's panel chrome and its backdrop,
  // the sheet, the mega menu, the busy indicator, the sutta body. Matching classes alone
  // shipped those components without their surface.
  /#(?:form|paliauto|searchbtn)\b/,
  /#(?:dg-drawer|dg-drawer-backdrop|dg-sheet|dg-sheet-backdrop|dg-mega|dg-busy-indicator|dg-topbar|dg-hero-band|dg-header-backdrop|dg-announce|dg-brand|home-tiles|smart-panel|sutta)\b/,
];

function keepPlain(rule) {
  const sel = selectorOf(rule);
  if (!sel || sel.startsWith('@')) return '';
  if (!classRe.test(sel) && !EXTRA_SELECTORS.some((re) => re.test(sel))) return '';
  const rescoped = rescope(sel);
  return rescoped ? `${rescoped} {${bodyOf(rule)}}` : '';
}

// ---- 3. token layer, lifted verbatim out of home.css ----------------------------------------
const homeCss = read('search/css/home.css');
const grabBlock = (css, selector) => {
  const rule = splitRules(css).find((r) => selectorOf(r) === selector);
  return rule ? bodyOf(rule).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n    ') : '';
};
const lightTokens = grabBlock(homeCss, 'body.dg-skin-minimal');
const darkTokens = grabBlock(homeCss, 'body.dg-skin-minimal.dark');
if (!lightTokens || !darkTokens) throw new Error('token block not found in search/css/home.css');

const tokenLayer = `/* ---- design tokens, from search/css/home.css ---- */
:root,
.dg-skin-minimal {
    ${lightTokens}
}

.dark,
[data-theme="dark"],
.dg-skin-minimal.dark {
    ${darkTokens}
}

@media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]):not(.dg-theme-light) {
        ${darkTokens}
    }
}

@media (max-width: 767.98px) {
    :root, .dg-skin-minimal { --dg-gutter: 3px; }
}
`;

// ---- 2. reader palette + brand font ----------------------------------------------------------
const rusMulti = read('reader/css/rus-multi.css');
const paletteBlock = grabBlock(rusMulti, ':root');
const fontLayer = `/* ---- reader palette + brand face, from reader/css/rus-multi.css ---- */
@font-face {
    font-family: "Robto Serif";
    src: url("./fonts/roboto-lightest.woff") format("woff");
    font-display: swap;
}

:root {
    ${paletteBlock}
}
`;

const out = [
  `/* Dhamma.gift design system — generated by scripts/build-css.mjs.\n   Every rule below is lifted from the app's own stylesheets; do not edit this file. */`,
  `/* ---- Bootstrap 5.3.1 (vendored: public/overrides/css/bootstrap.5.3.1.min.css) ---- */`,
  read('public/overrides/css/bootstrap.5.3.1.min.css'),
  fontLayer,
  tokenLayer,
  harvest(homeCss, 'search/css/home.css'),
  harvest(read('reader/css/uiextra.css'), 'reader/css/uiextra.css'),
  harvest(rusMulti, 'reader/css/rus-multi.css'),
  harvest(read('public/overrides/css/extrastyles.css'), 'public/overrides/css/extrastyles.css'),
].filter(Boolean).join('\n\n');

const dist = path.resolve(here, '../dist');
fs.mkdirSync(path.join(dist, 'fonts'), { recursive: true });
fs.copyFileSync(path.join(repo, 'reader/css/roboto-lightest.woff'), path.join(dist, 'fonts/roboto-lightest.woff'));
fs.writeFileSync(path.join(dist, 'dg-ui.css'), out);
console.log(`css: ${(out.length / 1024).toFixed(1)} KB -> dist/dg-ui.css`);
