---
category: Results
---

# QuoteSegment

One canonical segment as the results render it: the Pali line, its variant reading, and every translation stacked in the right column.

```jsx
<QuoteSegment
  id="sn56.11:2.1"
  pali={<>Dveme, bhikkhave, antā pabbajitena na sevitabbā.</>}
  translations={[{ lang: 'ru', text: 'Монахи, эти две крайности не должны practiced.', translator: 'ru_o' }]}
/>
```

Segment ids are the addressing scheme end to end — the same `sn56.11:2.1` is the anchor, the copy-link target and the reader's scroll destination. Pass `context` for the lines shown around a hit.
