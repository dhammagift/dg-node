---
category: Shell
---

# IconButton

A chrome button that is nothing but its icon — burger, back, close.

```jsx
<IconButton label="Menu" variant="menu">
  <Icon name="listUlSolidFull" size={19} />
</IconButton>
```

`label` is required: these buttons carry no visible text. Use `variant="plain"` inside `ReaderHero`, where the pill border would compete with the text.
