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

Pass `context` for the lines shown around a hit — it emits the same Bootstrap utilities the results view emits (`opacity-90` on the Pali, `text-muted opacity-75` on the translations). Only the translation side actually dims: `opacity-90` and `font-weight-light` are Bootstrap 4 names the app kept through its Bootstrap 5 upgrade, and neither resolves to a rule. The component reproduces them rather than silently correcting the app.

Segment ids are the addressing scheme end to end — the same `sn56.11:2.1` is the anchor, the copy-link target and the reader's scroll destination.
