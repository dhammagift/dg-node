---
slug: /search-guide
sidebar_position: 1
---

import AppFrame from '@site/src/components/AppFrame';
import RegexTester from '@site/src/components/RegexTester';

# Search

Live search — try it directly (this is the real search page):

<AppFrame src="/nodejs/res/?q=kacchapa&scope=dhamma" title="Live search" height={700} />

## Tips & Tricks

**#0 — Language scope.** Search covers Pali, English, Russian and Thai
material from SuttaCentral.net and thebuddhaswords.net; if a translation
isn't hosted there, it won't be found here either (a word may exist under a
different English/Russian synonym than the one you expect).

**#1 — Diacritics.** You can type Pali in plain Latin letters; matching
words are suggested automatically. Special characters (ā ī ū ḍ ḷ ṁ ṇ ṅ ñ ṭ)
can be copied from the RegEx cheat-sheet (gear icon) if you want to type
them directly.

**#2 — Khuddaka Nikāya.** Search normally covers DN, MN, SN, AN. Add the
`-kn` option to also include Dhammapada, Udāna, Itivuttaka, Suttanipāta,
Theragāthā and Therīgāthā (other KN books are not searched even with
`-kn` — use another resource for Jātaka and the rest).
  - `-kn jamm` — searches DN/MN/SN/AN plus the KN books above.
  - `jamm` — searches DN/MN/SN/AN only.

**#3 — Vinaya.** Add `-vin` to search the Vinaya, e.g. `-vin cetana`.

**#4 — Stem.** If you get too few results, try the word's stem — drop the
prefix or the ending.

**#5 — Prefer Pali.** Pali is the language the oldest Dhamma texts survive
in; the Buddha did not speak English or Russian, and translations
necessarily narrow or shift meaning.

**#6 — Two result tables.** Pali results come back as both a
Suttas/Texts-with-quotes table and a by-word table — use both. Other
languages also generate a by-word table, but it can be less reliable there.

**#7 — Minimum length.** 3 characters minimum; longer, more specific
patterns give more precise results.

**#8 — Animals, plants, etc.** Pali often has several distinct words where
English/Russian collapse to one (e.g. several Pali words for "snake" vs.
one word in English or Russian) — searching in Pali surfaces distinctions
translations lose.

**#9 — Timeouts.** If a query times out, try a longer or more specific
pattern.

**#10 — Quick jump.** Type a sutta id (as used on suttacentral.net) instead
of a search term to jump straight to that Pali text, with a quick switch to
the line-by-line English translation — works for DN, MN, SN, AN, the KN
books listed above, and Vinaya.

**"Mtphr" column.** Counts matches for
`seyyathāpi|adhivacan|ūpama|opama|opamma` anywhere in the text (not tied to
your search pattern), ignoring
`adhivacanasamphass|adhivacanapath|ekarūp|tathārūpa|āmarūpa|\brūpa|evarūpa|\banopam|\battūpa|\bnillopa|opamaññ`.
Found a case that should be included/excluded? Open an issue on GitHub.

## Advanced

**#1 — Scope a pattern to a sutta/nikāya (Pali/English only).** e.g.
`Sn17.*seyyathāpi` finds every simile/metaphor in Sn17. For several
patterns within a scope, quote it:
`"Sn51.*(seyyathāpi|adhivacan|ūpama|opama)"`.

**#2 — Variants with `[]`.** `nand[iī]` matches both `nandi` and `nandī`.
The letter `е` is auto-expanded to `[ёе]` by default; use `[е]` to match
only `е` (`ё` needs no special handling).

**#3 — Word boundaries with `\b`.** `\bkummo\b` matches only `kummo`, not
`kummova` or other longer matches.

**#4 — Exclude a pattern with `-exc`.** `dundubh -exc devadundubh` matches
words like `dundubh` but skips `devadundubh`.

**#5 — Full GNU `grep -E` regex** is supported (with proper escaping). An
AI can generate a pattern for you — see the RegEx cheat sheet in the search
box's settings for links.

**#6 — Results use [DataTables](https://datatables.net/).**

**#7 — Collections.** Quote a pattern to build a custom collection:
`"sn42.8|sn20.5"` returns both full suttas in one table; `"Sn20.1"` returns
Sn20.1, Sn20.10, Sn20.11, etc.; `"Sn20.1\b"` returns only Sn20.1.

**How the "Def" (definition) option works.** It runs a fixed `grep -E -A1`
pattern tuned to catch definition-style phrasing (`X nāma`, the numeral
vocabulary for An1 through An11, `Seyyathāpi.*X`, question forms like
`Kiṁ...vadeth`, `vuccati`, etc.), excluding commentarial directories
(`ab, bv, cnd, cp, ja, kp, mil, mnd, ne, pe, ps, pv, tha-ap, thi-ap, vv`).
Found other criteria worth adding? Open an issue on GitHub.

## RegEx Memo — try it live

<RegexTester />

## Demo videos

- [How to search in Pali Suttas and Vinaya with Dhamma.Gift](https://youtube.com/playlist?list=PLFJDP30qrYJ2H2lYWREQHF1FVggRYsDB9)
