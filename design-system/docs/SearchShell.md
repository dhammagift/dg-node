---
category: Shell
---

# SearchShell

The signature search field: one glass shell holding the home link, the query input, a clear button, the quick-settings dot and the submit magnifier.

```jsx
<SearchShell placeholder="kacchapa" />
<SearchShell value="satipa" showClear busy />
```

This is the same element in every state — home, results, reader — which is why typed text and focus survive navigation. On the home screen the signboard shows above it, so pass `showLogo={false}` there.
