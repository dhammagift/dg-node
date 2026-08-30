---
slug: /dictionary
sidebar_position: 4
---

import AppFrame from '@site/src/components/AppFrame';
import DictPlatformDropdown from '@site/static/img/help/dict-platform-dropdown-en.png';

# Dictionary

[Dict.Dhamma.Gift](https://dict.dhamma.gift) isn't just one dictionary,
it's a platform — the page itself is titled "Pali Multi-Dictionary", and
its manifest describes it as "a Pāḷi multi-dictionary combining DPD,
Gandhari, PTS, Sanskrit and Sutta-Vinaya definitions in one place". The
📘 button next to the search box opens access to all of these sources —
see below.

**DPD** (Digital Pāḷi Dictionary) specifically is what's built into the
popup dictionary while reading (Alt+A, click a word) and into the [Quick
Window](/quickmodal)'s "Dictionary" tab: just the one dictionary, without
the rest of the platform, because a click on a word inside the text
needs an instant answer, not a menu of sources to pick from.

<AppFrame src="/dict/" title="Dict.Dhamma.Gift" height={550} />

## Dictionary hotkeys

| Key | Action |
|---|---|
| `/` | Focus the search box |
| Ctrl/Alt+1 | Switch interface language (En/Ru) |
| Ctrl/Alt+2 | Open Dhamma.Gift (without the current word) |
| Ctrl/Alt+3 | Open Dhamma.Gift with the current query |
| Alt+T | Toggle theme |

Double-clicking any word inside an entry also searches for it.

## The whole platform at once — the 📘 button

<img src={DictPlatformDropdown} alt="Dict.Dhamma.Gift's menu of every connected dictionary" style={{maxWidth: 320, display: 'block', margin: '0 auto 1.5rem'}} />

- **Quick links** — search via Dhamma.Gift, DharmaMitra.org.
- **Pali dictionaries** — PTS Dictionary, Cone (Gandhari.org), DPR
  Analysis, Critical Pali Dictionary (CPD).
- **Sanskrit dictionaries** — Monier-Williams and three more from
  sanskrit-lexicon.uni-koeln.de (Śabda-sāgara, Apte, Macdonell), Glosbe
  Pāḷi-Sanskrit, Sanskrit Dictionary, LearnSanskrit.
- **Other resources** — WisdomLib, Google Custom Search, Aksharamukha
  (script converter).

## Display settings

The right-hand panel has font size, dark/light theme, serif font,
niggahita spelling (ṃ/ṁ), collapsing grammar/examples/summary sections by
default, an "one section at a time" accordion mode, the sandhi mark (’),
male/female voice for read-aloud, and showing/hiding source links.

## Dictionary mode while reading

Which dictionary window opens when you click a word while reading
(Alt+A) is a separate setting, in the app's own **Quick Settings** panel
(the sliders icon next to the search box), under **"Dictionary"**: the
built-in DPD, a Dict.DG popup or new window (compact or full),
DharmaMitra.org, sutta-search-only, or an external app (DictTango,
Mdict, GoldenDict-NG).
