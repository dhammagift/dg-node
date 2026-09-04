---
category: Overlays
---

# MegaMenu

The anchored panel a home tile opens on wide screens — the same sheet shell, pinned to its tile instead of rising from the bottom.

```jsx
<MegaMenu title="External sources">
  <MegaMenuGroup title="Editions">
    <SheetRow label="SuttaCentral" />
    <SheetRow label="Buddha Jayanthi" />
  </MegaMenuGroup>
  <MegaMenuGroup title="AI" layout="chips" divider>
    <SheetRow label="Gemini" chip />
    <SheetRow label="DeepSeek" chip />
  </MegaMenuGroup>
</MegaMenu>
```

Closes on Escape and on backdrop click. Pass `compact` when the panel holds many short entries.
