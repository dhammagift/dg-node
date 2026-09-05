---
category: Overlays
---

# Sheet

The bottom sheet a home tile opens — drag handle, title, optional tabs, and a body of rows.

```jsx
<Sheet title="Dīgha Nikāya" tabs={[{ id: 'all', label: 'All' }, { id: 'starred', label: 'Starred' }]} activeTab="all">
  <SheetRow label="DN 22" description="Mahāsatipaṭṭhāna" starred />
  <SheetRow label="DN 16" description="Mahāparinibbāna" />
</Sheet>
```

Rises from the bottom edge on phones; above 768px the same markup is centred as a panel. Use `MegaMenu` instead when the panel should stay anchored to the tile that opened it.
