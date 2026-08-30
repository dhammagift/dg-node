---
slug: /toc-navigator
sidebar_position: 4
---

import AppFrame from '@site/src/components/AppFrame';

# TOC Navigator

A canon-wide table of contents (Sutta Piṭaka + Vinaya), separate from the
reader's own per-sutta TOC (see [Reader](/reader)) — this one lets you
browse the whole collection and jump straight into a chapter.

<AppFrame src="/toc" title="Live TOC navigator" height={700} />

## Features

- **Lazy tree** — books and chapters expand on demand instead of loading
  the whole canon up front.
- **Translator filter** — a filter panel lets you narrow the tree to
  chapters that have a translation in your chosen language(s), with
  checkboxes per translator and a "show more" for less common ones.
- **Collapsible side panel** — open/closed state is remembered
  (`localStorage`).
- **Inline preview** — clicking a Vinaya rule shows its text inline instead
  of navigating away to the full reader.
- **Short URLs** — `/toc/<id>` aliases work as shortcuts into a given
  section.
