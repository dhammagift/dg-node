---
category: Results
---

# ResultRow

One sutta in the results table: its id, both titles, the words that matched, and where else the text can be read.

```jsx
<ResultRow
  suttaId="sn56.11"
  paliTitle="Dhammacakkappavattanasutta"
  translatedTitle="Setting the Wheel of Dhamma Rolling"
  titleLang="en"
  matchedWords={<>kacchapa, <Match>kacchapānaṁ</Match></>}
  readMark read
/>
```

Titles come as a pair on purpose — the Pali is the stable identity, the translated title is what a reader recognizes. Show the inflected forms grep actually matched, not just the query.
