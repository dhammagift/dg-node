---
category: Shell
---

# SearchShell

The signature search field: one glass shell holding the home link, the query input, a clear button, the quick-settings dot and the submit magnifier.

```jsx
<SearchShell state="results" placeholder="kacchapa" />
<SearchShell state="home" />
<SearchShell value="satipa" showClear busy />
```

This is the same element in every state — home, results, reader — which is why typed text and focus survive navigation. `state` is what changes its chrome: on `home` the field is a plain pill and the brand is carried by the separate signboard above it; on `results`/`reader`/`toc` the conch appears inside the field and the input loses its box. `busy` swaps the magnifier for the spinner. The component renders the app's own `id="form"`, `id="paliauto"` and `id="searchbtn"`, which several rules key off — so put one search shell on a page, as the app does.
