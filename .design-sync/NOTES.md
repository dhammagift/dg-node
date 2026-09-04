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

## Known render warns

(none triaged yet — populate as they appear)

## Verified-name findings

- `.quote-segment` (emitted by `QuoteSegment`, and by `search-render.js` in the app) has **no
  CSS rule anywhere in the repo** — it is a pure DOM hook for anchors and copy-link handling.
  Real, but do not cite it as a styling class in `conventions.md`; the header names
  `dg-drawer-row` instead, which does carry rules.

## Re-sync risks

- The CSS harvest is **selector-driven**. A rename in the app's CSS (e.g. `.dg-tile` →
  something else) silently drops those rules from the bundle rather than erroring. After any
  large CSS refactor in `search/css/home.css` or `reader/css/*.css`, eyeball the contact sheets.
- The token block is located by an **exact selector match** on `body.dg-skin-minimal` /
  `body.dg-skin-minimal.dark` in `home.css`; `build-css.mjs` throws if either disappears. That
  is intentional — a silent fallback would ship an unstyled system.
- Brand PNGs are inlined as data URIs, so `dist/index.js` carries ~90 KB of base64. Replacing
  the logo means re-running `gen:icons`.
