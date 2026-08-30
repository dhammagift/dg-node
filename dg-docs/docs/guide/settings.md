---
slug: /settings-guide
sidebar_position: 3
---

import AppFrame from '@site/src/components/AppFrame';

# Settings

The real, live Settings page — no clicking or keyboard shortcut required:

<AppFrame src="/settings/" title="Live Settings page" height={700} />

## What each setting does

- **Script System** — Pali script: ISO/Latin, Devanagari, or Thai. Cycle
  with **Alt+L**.
- **Dictionary mode** — how the pop-up dictionary behaves: standalone
  (Russian), full popup, new window, compact, DharmaMitra, search-only, or
  an external dictionary (DictTango, Mdict, GoldenDict-NG).
- **Remove punctuation** — strips punctuation from the Pali text (useful for
  memorization). **Alt+.** or **Alt+M**.
- **Default reader mode** — which mode (see [Reader](/reader)) opens
  by default.
- **Font size** — **Alt+=** / **Alt+-**.
- **Theme** — light / dark / auto. **Alt+T**. (This choice is stored in
  `localStorage.theme`, the same key this Help site itself uses to remember
  its own light/dark toggle — so switching here or on this page keeps both
  in sync same-origin, live.)
- **Multiselect for dictionary lookups** — select several words at once.
  **Alt+J**.
- **TTS** — enable voice, and its playback speed. See
  [Voice / TTS](/voice-tts).
- **Reset all settings** — clears everything except favorites, history and
  cloud-sync keys (with a confirmation prompt).

## Related hotkeys

| Key | Action |
|---|---|
| Alt+Space / Alt+Z | Switch interface language |
| Ctrl+1 / Ctrl+2 / Ctrl+3 | Home / Read / "read by chapters" |
| Ctrl+Shift+1 | Site language |
| Alt+G | Toggle history panel |
| Alt+8 | ml/th display mode |
