---
category: Home
---

# Segmented

The small segmented switch used for language and theme in the drawer's settings group.

```jsx
<Segmented
  value="ru"
  options={[{ value: 'ru', label: 'Русский' }, { value: 'en', label: 'English' }]}
/>
```

Selection is carried by `aria-pressed` on the buttons, not by a class. Best for two or three options; more than that belongs in a `Sheet`.
