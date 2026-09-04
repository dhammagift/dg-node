---
category: Reader
---

# TocItem

One line of a sutta's table of contents.

```jsx
<TocItem level="h1" pali="Uddesa" translated="Изложение" />
<TocItem level="h3" pali="Kāyānupassanā" translated="Созерцание тела" />
```

Both scripts sit in the same row and each is separately clickable, so tapping either scrolls to the same place — the reader's language toggle then decides which is visible.

`lang` takes the reader's **three-letter** codes here — `rus`, `eng`, `tha` — not the two-letter codes `ReaderSegment` and `QuoteSegment` use. The TOC styles are written as `.toc-item .rus-lang, .toc-item .eng-lang`, so `ru` renders unstyled. Default is `rus`.
