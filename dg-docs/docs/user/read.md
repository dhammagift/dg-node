---
slug: /read
sidebar_position: 2
---

import AppFrame from '@site/src/components/AppFrame';
import ReaderModesDrawer from '@site/static/img/help/reader-modes-drawer-en.png';
import ReaderContextMenu from '@site/static/img/help/reader-context-menu-en.png';
import ReaderQuickSettingsDict from '@site/static/img/help/reader-quick-settings-dict-en.png';

# Reader

Open any sutta directly by its id (`dn22`, `mn139`, `sn56.11`, `an4.180`) —
no search needed. Try it live below (this is the real reader, not a demo
clone — click around, switch modes, change the font):

<AppFrame src="/dn22?lang=en" title="Live reader — DN 22" height={700} />

## Reading modes

Five reading modes, listed under "Reading modes" in the burger menu (☰),
each with its own Alt hotkey:

<img src={ReaderModesDrawer} alt="The 'Reading modes' panel in the burger menu" style={{maxWidth: 320, display: 'block', margin: '0 auto 1.5rem'}} />

| Hotkey | Mode | What it shows |
|---|---|---|
| Alt+1 | One Translation | Pāḷi + one translation |
| Alt+2 | Multi Translation | Pāḷi + translation (two translators side by side) |
| Alt+3 | For Memorization | First-letter mnemonic (the same trick as [Memo](/memo#transform--first-letter-hints), applied straight to the live sutta text) |
| Alt+4 | Devanagari | Pāḷi in another script + Pāḷi in Latin |
| Alt+5 | Multi Language | Pāḷi alongside several translation languages |

:::tip[Alt+1…5 — mode first, language second]
The first press switches the mode TYPE on whatever language you're
currently reading in (reading in English stays in English). Pressing the
SAME key again is what cycles the language/translator inside the mode
that's already open — it cycles through whatever languages are actually
loaded for that text, and in single-column modes (One Translation / For
Memorization / Devanagari), where there's nothing to cycle through, it's
simply an En/Ru toggle.
:::

A mode isn't tied to one fixed language — "Devanagari", for instance,
shows Pali in whichever script you've selected (see below) alongside the
Latin transliteration, not literally the Devanagari script only.

## Context menu

The reader's real gem is the per-line context menu. Hover (or tap) the
start or end of any line — Pali or translation — and a tiny **✦**
appears; clicking it opens a menu with 7 actions:

<img src={ReaderContextMenu} alt="Segment context menu: Line, Paragraph, Link, Voice, Bookmark, Memorize, Compare" style={{maxWidth: 460, display: 'block', margin: '0 auto 1.5rem'}} />

- **Line** — copy this line (Pali + translation) with a link to it.
- **Paragraph** — copy every line from here to the end of the paragraph
  (for verse/gāthā texts with no shared paragraph, this just copies the
  current line).
- **Link** — copy just a link to the line, no text.
- **Voice** — start voice playback from this line — see
  [Voice / TTS](/tts).
- **Bookmark** — add the line to favorites — see the "Favorites" tab in
  the [Quick Window](/quickmodal).
- **Memorize** (sometimes labeled "Meditate" — both open the same thing,
  the label is picked at random) — opens
  [Memo](/memo) pre-filled with the text from this line to the end of
  the sutta.
- **Compare** — opens this line in 4nt with every Pali edition side by
  side (MS, royal, Burmese, BJT).

:::info[Why clicking the text itself does something different]
The menu only opens from the invisible **✦**. Clicking the line's text
directly (not the ✦) selects it for the voice player and shows a ▶ Play
button — a separate feature, covered in [Voice / TTS](/tts).
:::

**Right-click / long-press on ✦** is the shortcut: it copies just the
line link, no menu.

## Pali script

**Alt+L** cycles through three common scripts: Latin (ISO) → Devanagari →
Thai. The full list — around 160 scripts (Burmese, Khmer, Sinhala, and
anything else [Aksharamukha](https://www.aksharamukha.com/) can convert
to) — is in the dropdown on the [Settings](/settings) page.

## Dictionary

Clicking any Pali word (with the dictionary turned on) looks it up
straight in [Dict.Dhamma.Gift](/dictionary) — either in a popup over the
text or in a separate tab, depending on the dictionary mode you've
chosen. See [Dictionary](/dictionary) for the dictionary itself, its
hotkeys and display modes.

The dictionary mode (which window it opens) and a couple of other reading
options live in the **Quick Settings** panel (the sliders icon next to
the search box — also works inside the reader):

<img src={ReaderQuickSettingsDict} alt="Quick Settings panel in the reader: dictionary mode and reading options" style={{maxWidth: 300, display: 'block', margin: '0 auto 1.5rem'}} />

- **Dictionary** — the same list of modes described on the
  [Dictionary](/dictionary) page: built-in DPD, Dict.DG popup or new
  window (full or mini), DharmaMitra.org, sutta-search-only, or an
  external app (DictTango, Mdict, GoldenDict-NG) — separately for
  English and Russian DPD.
- **Show variants** (Alt+V) and **Column mode** (Alt+C) — the same
  buttons already in the toolbar above the text, duplicated here for
  convenience.
- **Hide Pāḷi punctuation** (Alt+.) — strips punctuation from the Pali
  text, handy for memorization.

Further down the same panel is a **"Pāḷi diacritics"** block — buttons
for the special Pali characters (ā ī ū ṁ ñ ṅ ṭ ḍ ṇ ḷ); clicking one
inserts it straight into the search box at the cursor, for when your
keyboard doesn't have them.

## Hotkeys

| Key | Action |
|---|---|
| Alt+1 … Alt+5 | Switch reading mode (see table above); repeat to cycle language |
| Alt+C | Toggle 1-column / 2-column layout |
| Alt+V | Show/hide Pali spelling variants |
| Alt+F | Add/remove the current page from favorites |
| Alt+A | Toggle the [dictionary](/dictionary) on word click |
| Alt+N | Open the [dictionary](/dictionary) in a separate window |
| Alt+W | Open the [TOC Navigator](/toc) |
| Ctrl+← / Ctrl+→ | Previous / next sutta |
| Click a line | Select it for the voice player (see [Voice / TTS](/tts)) |
| Click ✦ at the start/end of a line | Open the context menu (see above) |
| Right-click / long-press ✦ | Copy just the link |

More hotkeys (theme, font, interface language, dictionary mode, TTS) are
on [Settings](/settings) and [Voice / TTS](/tts).

## External editions and cross-references

The strip under the title links out to other editions and resources for
the same passage:

- **Voice** — the built-in TTS player (Alt+R).
- **4nt** (s.4nt.org) — side-by-side comparison of Pali editions.
- **DPR** — Digital Pali Reader, Burmese and Thai script.
- **BJT** — Buddha Jayanthi Tipitaka.
- **SC** — SuttaCentral.net.
- **BB** — Bhikkhu Bodhi's translations and others.
- **TBW** — TheBuddhasWords.net.
- **Th.ru / Th.su** — Theravada.ru / Theravada.su.
- **Final** (Vinaya texts only) — jumps to the final edition of a rule, if
  it changed over the course of the history/discussion.

Further along the same row: icons to show/hide variants (Alt+V above),
1/2 columns, the [dictionary](/dictionary), multi-select for the
dictionary, the compass, and "Help" (links to this page).
