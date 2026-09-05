---
category: Results
---

# ExternalLinks

The row of third-party source links a sutta carries.

```jsx
<ExternalLinks links={[
  { label: 'Voice', title: 'Text-to-Speech' },
  { label: 'SC', href: 'https://suttacentral.net/dn22', title: 'SuttaCentral.net' },
  { label: 'BJT', href: '#', title: 'Buddha Jayanthi' },
]} />
```

Order is fixed and matches the legacy reader, so the same sutta reads the same on both. Every link is marked `sc-ext-link`, which is how features like PDF export find them all.
