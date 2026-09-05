---
category: Reader
---

# ReaderSegment

One segment as the reader lays it out: Pali on the left, every translation stacked in the right column.

```jsx
<ReaderSegment
  id="dn22:1.1"
  pali="Evaṁ me sutaṁ—"
  variant="evaṁ me sutaṁ (bj)"
  translations={[
    { lang: 'ru', text: 'Так я слышал.', translator: 'ru_o' },
    { lang: 'en', text: 'So I have heard.', translator: 'en_sujato' },
  ]}
/>
```

The same markup serves every mode — single, two translators, two languages. What changes is which columns get filled, never the structure, which is why switching mode keeps your place in the text.
