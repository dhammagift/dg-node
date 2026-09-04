---
category: Icons
---

# Icon

A single glyph from the site's own icon set, inlined as SVG so it needs no asset origin.

```jsx
<Icon name="compass" size={18} title="Four Noble Truths" />
```

Names come from the app's shipped set: `compass`, `gear`, `question`, `book`, `star`, `moon`, `sun`, `play`, `memo`, `copy`, `eye`, and 30 more. File names are camel-cased: `open-link.svg` is `openLink`.

Two things to know before picking one. Most glyphs hard-code `fill="#989898"`, which beats the `currentColor` on the `<svg>` — they read grey on any ground, light or dark, which is how the app looks too. Only `select`, `memo`, `play`, `tableColumns`, `linkSolidFull` and `codeCompareSolidFull` follow `currentColor`. And `homeIcon` is unusable at normal sizes: its artwork occupies roughly the top-left 3% of its viewBox, so it renders as near-nothing — reach for `tableColumns` instead.

The set has no envelope and no brand marks; the app pulls those from Font Awesome at runtime.
