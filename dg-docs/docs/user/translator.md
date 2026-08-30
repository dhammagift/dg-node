---
slug: /translator
sidebar_position: 9
---

import AppFrame from '@site/src/components/AppFrame';

# Translation Editor

Work in progress. A CAT (Computer-Assisted Translation) editor for
line-by-line translation of Pali Canon texts — convenient input, quick
templates, and two ways to work with the text.

<AppFrame src="/assets/lbl-en.html?q=mn1&demo=1" title="Translation Editor" height={650} />

:::info[The "Save" button is disabled in this demo]
The tool embedded here is the real thing, not a copy, so saving — both
downloading locally and sending to the server — is deliberately turned
off in this demo, so nobody can accidentally (or on purpose) overwrite a
real translation file with this draft. Clicking "Save" here just shows a
warning. To actually save, open the tool at its direct link:
[/assets/lbl-en.html](pathname:///assets/lbl-en.html) — that one isn't a
demo, saving works for real there.
:::

## Toolbar

- **◀ ▶** — previous/next text.
- **Sutta number** — type an id (e.g. `sn56.11`, `an3.70`), with
  auto-detection of whether a translation already exists.
- **Source language** — pick the source file's language.
- **DT.org / DG** — open the current text on DigitalPaliReader.online / on
  Dhamma.Gift.
- **Refresh** — reload the translation from source.
- **Find/Replace** — a search-and-replace window (escape `(`, `)`, `[`,
  `]` as `\(`, `\)`, `\[`, `\]`).
- **Format** — auto-format line breaks.
- **Clear** — clear the input field.
- **Open file / Load from server** — open a previously saved draft.
- **Save** — export the translation as JSON.
- **Diff Checker** — an external tool for comparing text versions.

## Two input modes

### Table mode

A two-column table (Text | Translation) — each row is edited separately.

- Click a cell — edit it.
- The 🔗 icon — jump to this row in quick-entry mode.
- **↑ / ←** — move to the cell above.
- **↓ / →** — move to the cell below.
- **Enter** — add an empty row, or wrap text onto a new row.
- **Ctrl+Enter** — move text to the start of the next row.
- **Backspace** at the start of a row — merge with the previous row.
- **Delete** at the end of a row — merge with the next row.

### Quick-entry mode

One large text field — the whole translation at once, synced live with
the table.

- **Ctrl+Q** — select a range of rows and merge them into one.
- **Ctrl+F / Ctrl+H** — search/replace (same escaping as the toolbar's
  find/replace, for `()`/`[]`).

## Quick templates

Buttons for phrases that come up over and over in the canon — insert text
at the cursor with one click: **4nt** / **4nt short** (the Four Noble
Truths formula, full and short), **n8p** / **n8p short** (the Noble
Eightfold Path), **Thus said…** (a sutta's closing formula), plus an
em-dash, curly quotes, and an inverted question mark for punctuation.

## Settings

Your translator name (used in the filename when saving) and a toggle to
replace `+edited+o` in the filename with `o` — for final versions.
