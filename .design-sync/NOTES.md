# design-sync notes — dhamma.gift

## What is being synced

`design-system/` (`@dhammagift/dg-ui`) is a library **extracted from this repo's own UI**, not a
separate product. The dhamma.gift app is server-rendered HTML plus vanilla JS; the package wraps
that markup in React so claude.ai/design can compose with it. Two rules keep it honest:

- Components emit the **same DOM the app ships** — same class names, same element choices
  (including the legacy `<font class="variant">` in `ReaderSegment`).
- The stylesheet is **generated, never authored**: `design-system/scripts/build-css.mjs` lifts
  the `--dg-*` token block out of `search/css/home.css` and harvests component rules by selector
  from `home.css`, `reader/css/uiextra.css`, `reader/css/rus-multi.css` and
  `public/overrides/css/extrastyles.css`, stacked on the vendored Bootstrap 5.3.1 the app loads.

If a component's look changes in the app, re-run `npm run build --prefix design-system` and the
library follows. If a NEW class appears that the DS should carry, add it to `DS_CLASSES` in
`build-css.mjs` — that allowlist is what decides which rules get harvested.

## Repo-specific gotchas

- **Tokens are re-scoped, deliberately.** In the app they hang off `body.dg-skin-minimal` and
  dark off `body.dg-skin-minimal.dark`. A library consumer has no such body class, so the
  generated CSS re-hosts them on `:root` and accepts dark from `.dark`, `[data-theme="dark"]`
  and `prefers-color-scheme`. This is the one intentional divergence from the source CSS.
- **`/assets/**` does not resolve anywhere but production.** `siteroot/assets` is a symlink to a
  legacy repo that isn't checked out here (see CLAUDE.md). That is why the 43 shipped SVGs and
  the two brand PNGs are inlined into `src/icons/generated.ts` by `scripts/gen-icons.mjs` — never
  reference an `/assets` URL from a component or a preview.
- **Playwright pin:** this container caches chromium build **1194**, which is pinned by
  **playwright 1.56.0**. `npm i playwright` grabs a newer release pinned to 1234 and the render
  check dies with "Executable doesn't exist". Install `playwright@1.56.0` into `.ds-sync/`.
- **`guidelinesGlob` is `[]` on purpose.** The default globs would copy all 33 per-component
  `docs/*.md` into `guidelines/`, duplicating what already ships as `.prompt.md`.
- `configs/reader/mode-table.json` no longer matches the mode table in CLAUDE.md (that doc still
  describes `st/mt/ml/read/ee`; the file now holds `single/multiTran/multiLang/memorize/
  devanagari`). `ModeSwitchPanel`'s docs follow the FILE.

## Preview conventions (learned in the calibration pass)

- **`Tile` must be wrapped in `TileGrid`, even alone.** The grid supplies the tile's height; a
  bare tile lets its caption ride the bottom border.
- **Overlays need `backdrop={false}`.** `Sheet`, `Drawer` and their backdrops cover the viewport;
  left on, the card screenshots as a dark rectangle.
- **`ReaderSegment` / `QuoteSegment` go inside `<div id="sutta">`.** The reader's column CSS is
  scoped to that id.
- Use **real canonical content** — real sutta ids (`dn22`, `sn56.11`, `dhp1`), real Pali with
  diacritics, real Russian and English translations. Both scripts render correctly; placeholder
  text makes the cards useless to the design agent that imitates them.
- The second and later translations render **muted** (`lang-2nd`) by design — that is the app's
  hierarchy, not a rendering fault.

## Icon-set facts (cost a preview round to rediscover)

- **`homeIcon` is effectively invisible.** Its artwork is a 0-123 unit drawing wrapped in a
  `transform: matrix(0.1338 …)` inside a `0 0 512 512` viewBox, so it paints in the top-left
  ~3% of the box at any normal size. Use `tableColumns` for an app-window glyph.
- **Most glyphs hard-code `fill="#989898"`** on their paths, which beats the `currentColor` on
  the `<svg>` — they read grey on every ground. That is how the app looks too (it renders them
  as `<img>`); do not "fix" it. Only `select`, `memo`, `play`, `tableColumns`, `linkSolidFull`
  and `codeCompareSolidFull` follow `currentColor`.
- The set has **no envelope and no brand marks** — the app pulls GitHub/Telegram/etc. from Font
  Awesome at runtime, which the DS does not bundle.
- `memo` is artwork of the letters "MEMO"; unreadable at row size.

## Components that need the surface they ship on

- **Overlays are parked out of view until the app adds `show`.** `Sheet`, `Drawer` and
  `MegaMenu` therefore take an `open` prop (default `true`) that emits that class — without it
  the drawer sits off-screen and the mega menu renders at `opacity: 0; scale(.35)`. Previews
  additionally pass `backdrop={false}`, or the card screenshots as a dark rectangle.
- **`AnnounceBox`** is `rgba(255,255,255,.16)` with `#fff` text — cut for the home screen's
  `#dg-hero-band`, invisible on white. Previews wrap it in
  `linear-gradient(165deg, var(--dg-navy) 0%, var(--dg-navy) 38%, var(--dg-accent-dark) 100%)`.
- **`ScopeSummary`** needs `className="dg-scope"` — the panel chrome lives on the wrapper the
  app supplies, not on the component. `.dg-scope-group` has no padding, so pair with `px-3 py-2`.
- **`SheetRow`** is unstyled outside a `.dg-sheet` host. **`ResultRow`** needs a `ResultsTable`
  around it (it is a `<tr>`). **`SmartButton`** stretches (`justify-content: flex-end`), so box
  it at ~190px like the real floating panel.
- **`TocItem`** takes the reader's THREE-letter language codes (`rus`/`eng`/`tha`), unlike
  `ReaderSegment`/`QuoteSegment` which take `ru`/`en`. Passing `ru` to a TocItem leaves it
  unstyled.
- `ResultsTable`/`ResultRow` settle at ~740px in a ~1000px card, so **no `cardMode` override is
  needed** — re-check if the default column set ever grows.
- An empty `TileGrid` is a real app state (the skeleton shimmer) but screenshots as a blank
  rectangle indistinguishable from an error — sweep tile *count* instead.

## The CSS harvest missed id-scoped chrome once — watch for it again

The first harvest matched **class** selectors only, so everything the app styles by **id** was
silently absent from the bundle: `#dg-drawer` and its backdrop (the whole 320px panel, border,
shadow and slide transform), `#dg-sheet`, `#dg-mega`, `#dg-busy-indicator`, `#sutta`. The
components rendered "fine" — they just had no surface, which is exactly the failure mode that
looks like a design choice rather than a bug. `EXTRA_SELECTORS` in `build-css.mjs` now carries
an id alternation; **add to it whenever a component is styled by id**. Same class of miss:
`.dg-mega-block-divider` was absent, which made `MegaMenuGroup`'s `divider` prop a no-op.

## Two traps in the verify loop itself

- **`package-capture.mjs` keys grades off the authored `.tsx`, not the library build.** After a
  change under `design-system/src`, a plain re-run prints "carried forward" and serves the STALE
  sheet — you will grade the old render. Pass `--force` whenever the component source moved.
- **A "fits the card, no override needed" measurement is only valid for the CSS bundle in front
  of you at the time.** `ResultsTable`/`ResultRow` genuinely fit before the id-scoped rules were
  harvested and overflowed after. Re-check every wide component after any CSS re-harvest.

## Fixed overlays measure 0px in a preview card — use a Stage

The card root (`.ds-cell` / `.ds-single` in `.ds-sync/lib/emit.mjs`) carries
`transform: translateZ(0)`, which makes IT — not the viewport — the containing block for any
`position: fixed` descendant, and its own height is 0 when the out-of-flow panel is its only
child. Measured, not inferred:

```
#r0         transform: matrix(1,0,0,1,0,0)   height: 0
#dg-drawer  position: fixed                  height: 0px   overflow-y: auto
```

The drawer resolves `top:0; bottom:0` against a zero-height box and clips itself away; `Sheet`
fails from the other edge (`bottom: 20px` of a zero-height box lands above the card). Cards go
**completely blank** — this is what `[RENDER_THIN]`/`[RENDER_BLANK]` report on `Drawer`,
`DrawerRow`, `DrawerGroup`, `Sheet`, `SheetRow` and `BusyIndicator`, and it is NOT benign.

**Preview fix (applied):** a `Stage` — one div with `position: relative`, an explicit `height`,
`overflow: hidden`, `background: var(--dg-page)` and `transform: translateZ(0)`. It supplies the
missing viewport and nothing else — no surface, border or shadow — so every visible edge is
still the component's. Copy it from `previews/Drawer.tsx`.

**Real fix, if ever wanted:** drop `transform: translateZ(0)` from `.ds-cell`/`.ds-single` in
the harness, or give them a `min-height`. That is converter territory, not this repo, and it
affects any design system with a fixed overlay. `MegaMenu` needs no stage — it is
`position: absolute`, so it lands at its static position.

## Composition rules

- **`SheetRow` is unstyled outside a sheet** — `.dg-sheet-row`, `.dg-row-desc` and `.dg-chip`
  are scoped under `.dg-sheet`. Put it inside `Sheet` or `MegaMenu` (both carry that class).
- **`DrawerGroup` needs a `Drawer`** — its heading rules are `.dg-drawer-body .dg-group-title`,
  and only `Drawer` emits that class.
- **`ToggleRow` is the one overlay that needs no stage.**
- **`.dg-qs-btn` renders empty** — the app fills the quick-settings dot from JS, so in a static
  composition it is a 34px gap between the separator and the magnifier. Pass
  `showQuickSettings={false}` unless the gap is wanted.
- **`SearchShell` sizes itself from its wrapper**, and the preview cell shrink-wraps its
  content, so `width: 100%` collapses to the pill's own width. Give the story an explicit width
  (640px) and let `.dg-state-*`'s maxima (640 home / 520 results) do the sizing.

## Known render warns

- `[TOKENS_MISSING]` — 4 vars: `--bs-body-text-align`, `--bs-nav-link-font-size`,
  `--bs-breadcrumb-font-size` (Bootstrap sets these contextually) and `--dg-mobile-scale`
  (home.css defines it only inside the `max-width: 767.98px` media query, and the only rule
  using it lives in that same query). Benign — do not chase.
- **Emoji render as tofu boxes in the headless container** (no emoji font installed). The
  `AnnounceBox.Beta` card shows this: its text is the app's real shipped announcement from
  `configs/search/announcements.json`, which genuinely contains 🎉. It renders correctly in any
  real browser, and so in the design pane. Faithful content, container limitation — do not
  "fix" the preview by stripping the emoji.

## Verified-name findings

- `.quote-segment` (emitted by `QuoteSegment`, and by `search-render.js` in the app) has **no
  CSS rule anywhere in the repo** — it is a pure DOM hook for anchors and copy-link handling.
  Real, but do not cite it as a styling class in `conventions.md`; the header names
  `dg-drawer-row` instead, which does carry rules.

## Findings in the app, surfaced by the extraction

- **The drawer's own comment contradicts its CSS.** `search/index.html` says the menu
  "выезжает слева" (slides out from the left), but `#dg-drawer` in `home.css` is `right: 0`
  with `border-left` and a `-8px` shadow — it docks on the RIGHT, which is what the extracted
  component reproduces. The comment is stale, not the CSS.

- **Dead Bootstrap 4 class names survive in the results view.** `search-render.js` dims context
  lines with `opacity-90` (Pali/variant) and `text-muted font-weight-light` + `opacity-75`
  (translations). Bootstrap 5 ships `.opacity-{0,25,50,75,100}` and renamed `font-weight-light`
  to `fw-light`, so **`opacity-90` and `font-weight-light` resolve to nothing** — in the live
  app as much as here. Net effect: context translations dim (via `opacity-75`), context Pali
  does not. `QuoteSegment` reproduces the app's classes verbatim rather than quietly correcting
  them; fixing it belongs in `search-render.js`, not in the design system.

## Re-sync risks

- The CSS harvest is **selector-driven**. A rename in the app's CSS (e.g. `.dg-tile` →
  something else) silently drops those rules from the bundle rather than erroring. After any
  large CSS refactor in `search/css/home.css` or `reader/css/*.css`, eyeball the contact sheets.
- The token block is located by an **exact selector match** on `body.dg-skin-minimal` /
  `body.dg-skin-minimal.dark` in `home.css`; `build-css.mjs` throws if either disappears. That
  is intentional — a silent fallback would ship an unstyled system.
- Brand PNGs are inlined as data URIs, so `dist/index.js` carries ~90 KB of base64. Replacing
  the logo means re-running `gen:icons`.
