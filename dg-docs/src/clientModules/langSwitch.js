// Compass icon + language link, injected next to the theme toggle button (owner's request —
// same spot as the theme toggle so it's reachable on mobile too, since Docusaurus's mobile
// sidebar silently drops custom `type: 'html'` navbar.items — verified, they render on
// desktop but never appear in the mobile menu at all).
//
// The language link recomputes its target on every route change (onRouteDidUpdate below) so
// switching language preserves the current page instead of always landing on that build's
// home. EN now shares identical slugs with RU across the whole site (Dhamma + User Help both
// ported off the old about/guide layout — see docs-todo.md), so every pair below is the same
// slug on both sides; kept as pairs (not a flat list) so a future page that genuinely needs a
// different EN/RU slug doesn't require reshaping this structure. Add a page here when it
// exists in both builds; anything not listed falls back to that build's home page (still
// correct, just not page-preserving).
var PAGE_PAIRS = [
  ['/', '/'],
  ['/sutta', '/sutta'],
  ['/principles', '/principles'],
  ['/rationale', '/rationale'],
  ['/key-features', '/key-features'],
  ['/search-guide', '/search-guide'],
  ['/read', '/read'],
  ['/settings', '/settings'],
  ['/toc', '/toc'],
  ['/dictionary', '/dictionary'],
  ['/tts', '/tts'],
  ['/multitool', '/multitool'],
  ['/login', '/login'],
  ['/memo', '/memo'],
  ['/quickmodal', '/quickmodal'],
  ['/translator', '/translator'],
  ['/policies', '/policies'],
];

function isRuBuild() {
  return window.location.pathname.indexOf('/ru/docs') === 0;
}

function currentSlug(base) {
  var slug = window.location.pathname.slice(base.length);
  if (slug.length > 1 && slug.charAt(slug.length - 1) === '/') slug = slug.slice(0, -1);
  return slug === '' ? '/' : slug;
}

function otherLangHref() {
  var ru = isRuBuild();
  var base = ru ? '/ru/docs' : '/docs';
  var otherBase = ru ? '/docs' : '/ru/docs';
  var slug = currentSlug(base);
  var pair = PAGE_PAIRS.filter(function (p) {
    return (ru ? p[1] : p[0]) === slug;
  })[0];
  var targetSlug = pair ? (ru ? pair[0] : pair[1]) : '/';
  return otherBase + (targetSlug === '/' ? '/' : targetSlug + '/');
}

// Real dropdown (Docusaurus's own localeDropdown widget, reused so a 3rd/4th language later is
// just another row here) — not a bare link. `hrefForLocale` only handles "current" vs "the one
// other" locale (otherLangHref) because there are only two builds today; a 3rd locale needs
// PAGE_PAIRS generalized into a per-page/per-locale table at the same time it's added.
var LOCALES = [
  { base: '/docs', label: 'English' },
  { base: '/ru/docs', label: 'Русский' },
];

function currentBase() {
  return isRuBuild() ? '/ru/docs' : '/docs';
}

function hrefForLocale(base) {
  return base === currentBase() ? window.location.pathname : otherLangHref();
}

// Plain 'clean-btn' only, no 'navbar__item'/'navbar__link' — those are exactly the classes
// Docusaurus's own responsive CSS hides at mobile widths (meant for the desktop navbar row).
var ITEM_STYLE =
  'display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;color:inherit;';

function makeCompassBtn() {
  var compass = document.createElement('button');
  compass.type = 'button';
  compass.className = 'clean-btn dg-compass-btn';
  compass.style.cssText = ITEM_STYLE;
  compass.title = isRuBuild()
    ? 'Открыть Cattāri Ariyasaccāni (Alt+P)'
    : 'Open Cattāri Ariyasaccāni (Alt+P)';
  compass.innerHTML = '<img src="/assets/svg/compass.svg" alt="" width="20" height="20">';
  compass.addEventListener('click', function () {
    if (window.dgOpenQuickModal) window.dgOpenQuickModal();
  });
  return compass;
}

// Click-toggled (Docusaurus's plain `.dropdown`, not `.dropdown--hoverable`) — hover doesn't
// exist on touch, and this needs to work on mobile same as desktop. Same dropdown/dropdown__menu/
// dropdown__link classes and behavior as Docusaurus's own native localeDropdown widget, just
// hand-assembled since a real localeDropdown needs one shared multi-locale build (see the
// baseUrl-collision note at the top of docusaurus.config.js).
function makeLangDropdown() {
  var wrap = document.createElement('div');
  wrap.className = 'dropdown dg-lang-dropdown';
  wrap.style.position = 'relative';

  var trigger = document.createElement('a');
  trigger.href = '#';
  trigger.className = 'clean-btn navbar__link dg-lang-trigger';
  trigger.style.cssText = ITEM_STYLE + 'width:auto;padding:0 .4rem;font-size:0.85rem;font-weight:600;text-decoration:none;gap:0.3rem;';
  trigger.setAttribute('role', 'button');
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  // Same icon + full label as Docusaurus's own native localeDropdown (@theme/Icon/Language),
  // not an abbreviation — owner flagged the plain "RU"/"EN" text as not matching the official
  // docs look closely enough.
  var currentLabel = (LOCALES.filter(function (l) { return l.base === currentBase(); })[0] || {}).label || '';
  trigger.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style="margin-right:0.3rem"><path fill="currentColor" d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>' +
    currentLabel;

  var menu = document.createElement('ul');
  menu.className = 'dropdown__menu dg-lang-menu';
  LOCALES.forEach(function (loc) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.className = 'dropdown__link dg-lang-link' + (loc.base === currentBase() ? ' dropdown__link--active' : '');
    a.dataset.base = loc.base;
    a.href = hrefForLocale(loc.base);
    a.textContent = loc.label;
    li.appendChild(a);
    menu.appendChild(li);
  });

  // "Help Us Translate" — same divider + external-link-icon row as the official Docusaurus
  // localeDropdown (dropdownItemsAfter). No real Crowdin project here, so this points at the
  // one real "reach us about translation" channel this project actually has.
  var divider = document.createElement('li');
  divider.style.cssText = 'border-top:1px solid var(--ifm-toc-border-color);margin:0.3rem 0;';
  menu.appendChild(divider);
  var helpLi = document.createElement('li');
  var helpA = document.createElement('a');
  helpA.className = 'dropdown__link';
  // Root-relative — same origin as the main app on prod, test, or any future mirror;
  // must never hardcode a specific domain (there are several: prod, test, f, m, ...).
  helpA.href = '/#contacts';
  helpA.target = '_blank';
  helpA.rel = 'noopener noreferrer';
  helpA.style.cssText = 'display:flex;align-items:center;gap:0.3rem;';
  helpA.innerHTML =
    (isRuBuild() ? 'Помощь с переводом' : 'Help Us Translate') +
    ' <svg width="13.5" height="13.5" aria-hidden="true"><use href="#theme-svg-external-link"></use></svg>';
  helpLi.appendChild(helpA);
  menu.appendChild(helpLi);

  trigger.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    var open = wrap.classList.toggle('dropdown--show');
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  wrap.appendChild(trigger);
  wrap.appendChild(menu);
  return wrap;
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', function (e) {
    document.querySelectorAll('.dg-lang-dropdown.dropdown--show').forEach(function (wrap) {
      if (!wrap.contains(e.target)) {
        wrap.classList.remove('dropdown--show');
        wrap.querySelector('.dg-lang-trigger').setAttribute('aria-expanded', 'false');
      }
    });
  });
}

function ensureControls() {
  if (typeof document === 'undefined') return;
  // The mobile sidebar's theme toggle is a SEPARATE DOM node from the desktop navbar's
  // (different wrapper classes, verified — no shared "colorModeToggle" class), so both
  // toggle-wrapper divs (desktop + mobile-sidebar) need their own copy of these controls,
  // one skipped if already injected (guarded per-wrapper, not by a single global id).
  var toggleButtons = document.querySelectorAll('[class*="toggleButton"]');
  toggleButtons.forEach(function (btn) {
    var wrapper = btn.parentNode;
    // Checked against the PARENT, not a specific sibling — insertion order (dropdown, then
    // compass, both "before wrapper") puts compass immediately before wrapper, not the
    // dropdown, so a sibling-specific check here previously guarded the wrong element and
    // silently re-inserted both controls on every route change (owner screenshot: duplicated
    // down the whole navbar).
    if (!wrapper || !wrapper.parentNode || wrapper.parentNode.querySelector('.dg-lang-dropdown')) return;
    wrapper.parentNode.insertBefore(makeLangDropdown(), wrapper);
    wrapper.parentNode.insertBefore(makeCompassBtn(), wrapper);
  });
}

// The navbar shell logo is a real Docusaurus <Link>, not a plain anchor we control — its
// `href` is always re-prefixed with THIS build's baseUrl by @docusaurus/theme-classic's Logo
// component (verified in its source: useBaseUrl(logo.href), and even the `pathname://` escape
// hatch used elsewhere in this project gets baseUrl re-applied afterwards for logo links
// specifically, since Logo doesn't expose the `autoAddBaseUrl: false` prop that makes that
// trick work for plain sidebar/navbar items). Owner: clicking the shell had no way back to the
// live app, only to the in-docs home page — needs to leave the docs build entirely. Since
// React Router's own click handler lives on this exact <a> (attached by React, not by us),
// simply overwriting its `href` attribute from here would change what a "copy link" shows but
// NOT where a real click goes — React still calls history.push() with its own internal target.
// A plain bubble-order listener registered directly ON the anchor fires before the event
// reaches Docusaurus's delegated root-level handler (this element itself has no other
// listener, so ours simply runs first); stopPropagation there keeps the click from ever
// reaching React Router, and preventDefault stops the native navigation to the wrong
// (baseUrl-prefixed) href — leaving only our own manual, real navigation to the actual root.
//
// One `<a class="navbar__brand">` wraps BOTH the shell icon (`.navbar__logo`) and the "Dhamma.
// gift Help" text title — owner caught that redirecting the whole brand block made clicking
// the word "Help" itself leave Help, landing on the live app instead (surprising: text says
// "Help", click takes you away from it). Split by click target: the icon is the one
// established "go to the live app" affordance (mirrors the main app's own shell icon,
// `.dg-go-home`/`.dg-shell-logo`) — overridden here to a real navigation to site root. The
// title text keeps the ORIGINAL default behavior (this is why only the icon branch calls
// preventDefault/stopPropagation) — Docusaurus's own Logo component already resolves
// `logo.href: '/'` to this build's baseUrl root (`/docs/` or `/ru/docs/`, the docs home page),
// which is exactly what the title should do — no override needed there at all.
function fixBrandLogoHref() {
  if (typeof document === 'undefined') return;
  var brand = document.querySelector('.navbar__brand');
  if (!brand || brand.dataset.dgHomeFixed) return;
  brand.dataset.dgHomeFixed = 'true';
  brand.addEventListener('click', function (e) {
    var onIcon = e.target.closest && e.target.closest('.navbar__logo');
    if (!onIcon) return;
    e.preventDefault();
    e.stopPropagation();
    window.location.href = '/';
  });
}

// Delegated (not attached to the button itself): the hamburger doesn't exist in the DOM yet
// at the moment onRouteDidUpdate first runs (verified — querySelector returns null then), so
// a direct listener would silently never attach. Delegation on document works regardless of
// when the button actually mounts. setTimeout(0) lets React finish the sidebar's own render
// (triggered by this same click) before ensureControls looks for its toggle button.
if (typeof document !== 'undefined') {
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.navbar__toggle')) {
      setTimeout(ensureControls, 0);
    }
  });
}

// onRouteDidUpdate, not DOMContentLoaded — Docusaurus calls this once after the initial
// render too, so injecting here (never earlier) avoids a React hydration mismatch (#418)
// from mutating the toggle's parent while React is still reconciling the server-rendered DOM.
export function onRouteDidUpdate() {
  ensureControls();
  fixBrandLogoHref();
  if (typeof document === 'undefined') return;
  // Per-link, not a single shared href: one of the two links is "this locale" (should point
  // at the current page, i.e. do nothing) and the other is "the other locale" (should follow
  // otherLangHref()) — stamping one href onto both broke the currently-active locale's own
  // link into always pointing at the other locale. `ensureControls()` only creates this menu
  // ONCE per session (guarded against re-creation), so every SPA-internal navigation after
  // that first mount depends on this recompute — it's the only thing keeping the links from
  // going stale on route changes that don't reload the page.
  document.querySelectorAll('.dg-lang-link').forEach(function (el) {
    el.href = hrefForLocale(el.dataset.base);
  });
}
