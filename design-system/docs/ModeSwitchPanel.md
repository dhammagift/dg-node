---
category: Reader
---

# ModeSwitchPanel

The reader's mode list — one row per way of laying a sutta out.

```jsx
<ModeSwitchPanel
  active="single"
  modes={[
    { id: 'single', label: 'Single', description: 'One translation beside the Pali', hotkey: '1' },
    { id: 'multiTran', label: 'Multi Translators', description: 'Two translators, same language', hotkey: '2' },
    { id: 'multiLang', label: 'Multi Language', description: 'Russian and English side by side', hotkey: '3' },
  ]}
/>
```

Modes come from `configs/reader/mode-table.json`, which the server and the client both read; the order of keys there is the order of rows here.
