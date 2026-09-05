---
category: Shell
---

# Toolbar

The row of light pills above the results table and inside the reader.

```jsx
<Toolbar>
  <ToolbarButton label="Theme"><Icon name="circleHalfStroke" /></ToolbarButton>
  <ToolbarButton label="Dictionary"><Icon name="comment" /></ToolbarButton>
  <ToolbarButton label="Read marks" pressed><Icon name="solidStar" /></ToolbarButton>
</Toolbar>
```

Sticky toggles (read marks, column mode) carry `pressed`; one-shot actions leave it unset.
