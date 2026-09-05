---
category: Overlays
---

# DrawerGroup

A titled section of the Drawer.

```jsx
<DrawerGroup title="Navigation" open>
  <DrawerRow>Links</DrawerRow>
</DrawerGroup>
<DrawerGroup title="Settings" collapsible={false}>…</DrawerGroup>
```

Collapsible groups are a native `<details>` — no script, and they work before any JS runs. Pass `collapsible={false}` for a plain heading.
