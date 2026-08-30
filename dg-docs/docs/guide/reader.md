---
slug: /reader
sidebar_position: 2
---

import AppFrame from '@site/src/components/AppFrame';

# Reader

Open any sutta directly by its id (`dn22`, `mn139`, `sn56.11`, `an4.180`) —
no search needed. Try it live below (this is the real reader, not a demo
clone — click around, switch modes, change the font):

<AppFrame src="/dn22" title="Live reader — DN 22" height={700} />

## Reading modes

Modes are defined in `configs/reader/mode-table.json` and control which
columns are shown:

| Mode | What it shows |
|---|---|
| `single` | One language column (Pali or one translation) |
| `multiTran` | Two translators of the same language side by side |
| `multiLang` | Pali + a translation language together |
| `memorize` | Mnemonic/memorization-oriented layout |
| `devanagari` | Dual-script view (e.g. Devanagari alongside Latin) |

Switch between them with **Alt+1** … **Alt+5**. Pressing the same mode key
again cycles through available languages/translators within that mode.

## Useful hotkeys

| Key | Action |
|---|---|
| Alt+1 … Alt+5 | Switch reading mode (see table above); repeat to cycle language |
| Alt+C | Toggle 1-column / 2-column layout |
| Alt+L | Cycle Pali script (ISO / Devanagari / Thai) |
| Alt+T | Toggle theme (light/dark) |
| Alt+F | Toggle favorite |
| Alt+R | Toggle voice/TTS player — see [Voice / TTS](/voice-tts) |
| Alt+W | Open the TOC — see [TOC Navigator](/toc-navigator) |
| Alt+N | Open dictionary in a new window |
| Alt+Space / Alt+Z | Switch interface language |
| Click a segment | Copy the quote + a link to it |
| Right-click / long-press a segment | Copy just the link |

## External editions and cross-references

Below the text, the reader links out to other editions and resources for
the same passage: Voice (TTS), 4nt, DPR (Digital Pali Reader — Thai/Burmese
editions), BJT (Tipitaka.lk), SuttaCentral, Bhikkhu Bodhi's translations,
TheBuddhasWords, Theravada.ru/Theravada.su, and (for Vinaya) the Final
edition.
