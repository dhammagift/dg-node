## Building with the Dhamma.gift library

These components are not a fresh visual language — they are the dhamma.gift search and reader
UI, wrapped in React. Each one emits the same DOM the live site emits, styled by the site's own
stylesheets. Compose with them and the result is markup the project's engineers can ship; write
your own markup beside them and it will look like a different site.

### Setup

**No provider, no theme object, no context.** Import a component and render it. Everything
visual comes from `styles.css`, which must be loaded once — it carries Bootstrap 5.3.1 (the
components lean on its `.btn`, `.form-control`, `.table` and utility classes), the `@font-face`
for the reader's serif, the `--dg-*` token layer, and the harvested component rules.

```jsx
import { SearchShell, TileGrid, Tile, Icon } from '@dhammagift/dg-ui';
```

**Shell state is a prop, not a page mode.** The app gates chrome on `body.dg-state-results`,
`body.dg-busy` and friends. Since your composition has no such `<body>`, the components carry
that state themselves — `<SearchShell state="home" | "results" | "reader" | "toc">`, and
`BusyIndicator` reveals itself. Pick the state you are designing, don't add body classes.

**Dark theme** is a class, not a prop. Tokens are defined on `:root` for light and redefined
under `.dark`, `[data-theme="dark"]` and `prefers-color-scheme: dark`. To force one, put the
class on a wrapper:

```jsx
<div data-theme="dark">…</div>
```

### The styling idiom

Three vocabularies, in this order of preference:

**1. `--dg-*` tokens** — reach for these first for any surface, border or text colour you add
yourself. The complete set:

| Purpose | Tokens |
|---|---|
| Surfaces | `--dg-page`, `--dg-surface`, `--dg-surface-hover`, `--dg-surface-active` |
| Borders | `--dg-border`, `--dg-border-strong` |
| Text | `--dg-text`, `--dg-text-2`, `--dg-text-muted` |
| Accent (teal) | `--dg-accent`, `--dg-accent-ink`, `--dg-accent-dark`, `--dg-accent-bg` |
| Brand navy | `--dg-navy`, `--dg-navy-2` |
| Shape & motion | `--dg-radius` (10px), `--dg-ease`, `--dg-font`, `--dg-gutter` |

The accent is a muted teal (`#149c7c` light, `#136857` dark), never blue. `--dg-accent-bg` is
the pale wash behind icon discs. `--dg-accent-ink` is the accent tuned for *text*, which is a
different value from the icon accent in dark theme — use it whenever the accent carries words.

```css
.my-panel { background: var(--dg-surface); border: 1px solid var(--dg-border);
            border-radius: var(--dg-radius); color: var(--dg-text); }
```

**2. Bootstrap 5.3 utilities** for layout and spacing — `d-flex`, `gap-1`, `mb-1`,
`align-items-center`, `flex-wrap`, `text-muted`, `visually-hidden`, `container-fluid`. They are
in the stylesheet and the components already use them; do not add a second layout system.

**3. The reader's own palette** — `--off-white`, `--light-off-white`, `--off-black`,
`--dark-gray`, `--light-gray`, `--dark-blue`, `--blue`. Older than the `--dg-*` set and specific
to the text-reading surfaces. Use them only when extending the reader itself.

Do not invent class names. The component classes (`dg-tile`, `dg-input-shell`, `dg-sheet`,
`dg-drawer-row`, `right-column`, `pli-lang`, `lang-2nd`) are meaningful to the real app's own scripts and
CSS — a lookalike element with a made-up class gets none of that behaviour.

### Domain conventions that carry visual weight

- **Pali is marked, not merely styled.** Pali text lives in an element with `lang="pi"` and the
  class `pli-lang`. That is what gives it the serif face and what the dictionary lookup keys off.
  `PaliQuote`, `QuoteSegment` and `ReaderSegment` do it for you.
- **Segment ids are the addressing scheme**, end to end: `dn22:1.1` is the anchor, the copy-link
  target and the reader's scroll destination. Pass real ones.
- **Two titles, always.** A sutta is identified by its Pali title and recognized by its
  translated one; `ResultRow` shows both on purpose. Do not drop one to save space.
- **Second translations are muted.** `lang-2nd` greys the second and later columns. That is the
  reading hierarchy, not a bug to correct.

### Where the truth is

- `_ds/<folder>/styles.css` and the files it `@import`s — the real cascade, worth reading before
  you style anything.
- `components/<group>/<Name>/<Name>.prompt.md` — per-component API and a worked example.
- Groups: `shell` (brand, search field, toolbar), `home` (tiles, quote block, contacts),
  `overlays` (sheet, drawer, mega menu, settings toggles), `results` (table, row, quote segment),
  `reader` (hero, segment, mode list, TOC), `icons`.

### An idiomatic composition

```jsx
<div className="d-flex flex-column gap-3" style={{ background: 'var(--dg-page)', padding: '1rem' }}>
  <SearchShell state="home" placeholder="kacchapa" />
  <TileGrid>
    <Tile label="Dīgha Nikāya" description="34 long discourses" icon={<Icon name="book" size={20} />} />
    <Tile label="Dhammapada" description="423 verses" icon={<Icon name="book" size={20} />} />
  </TileGrid>
</div>
```

The library components carry the controls; `--dg-*` tokens and Bootstrap utilities carry your
own layout glue around them.
