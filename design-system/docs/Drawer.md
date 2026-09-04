---
category: Overlays
---

# Drawer

The slide-in navigation drawer behind the burger — navigation first, then settings.

```jsx
<Drawer>
  <DrawerGroup title="Navigation">
    <DrawerRow href="/" icon={<Icon name="homeIcon" />}>Home</DrawerRow>
    <DrawerRow icon={<Icon name="compass" />}>Four Noble Truths</DrawerRow>
  </DrawerGroup>
  <DrawerGroup title="Settings" collapsible={false}>
    <Segmented value="ru" options={[{ value: 'ru', label: 'RU' }, { value: 'en', label: 'EN' }]} />
  </DrawerGroup>
</Drawer>
```

This replaced a Bootstrap dropdown — the drawer is what makes the page read as an app rather than a website menu.
