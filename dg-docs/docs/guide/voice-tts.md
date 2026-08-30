---
slug: /voice-tts
sidebar_position: 5
---

import AppFrame from '@site/src/components/AppFrame';
import SiteLink from '@site/src/components/SiteLink';

# Voice / TTS

> The Dhamma was originally an oral teaching. — <SiteLink to="/an5.209">AN 5.209</SiteLink>

Live demo — voice mode starts automatically via a URL parameter, no
clicking required (the floating player at the bottom is the point here, not
the reader text behind it):

<AppFrame src="/an5.209?autoplay=1&lang=en" title="Live voice player" height={260} />

## 5 ways to activate Voice Mode

1. Click the **Voice** link at the top of the page (next to En, Ru, etc.).
2. Click the 🔉 icon to the left of the text's title.
3. Click any Pali or translation sentence to highlight it, then click the
   **Play** button that appears bottom-right.
4. Hover/tap before or after a line to reveal a **✦** link, then choose
   "Listen".
5. Press **Alt+R** (**Option+R** on Mac).

## Built-in player

Uses Google Cloud Voices or your browser's own speech synthesis.

- **Controls** — Play/Pause, previous/next sentence.
- **Navigation** — pause, click a Pali sentence to highlight it, press Play
  to resume from there.
- **Settings** — reading mode (Pali / Pali+Translation / Translation /
  Translation+Pali) and playback speed.
- **Scroll** — toggle auto-scroll.
- **Autoplay** — toggle automatic playback (subject to the browser's
  autoplay policy).

## Hotkeys

| Key | Action |
|---|---|
| Alt+R | Toggle Voice Mode |
| S | Toggle autoscroll |
| Space | Play / Pause |
| ← → or ↑ ↓ | Previous / Next segment |
| 1 | Mode: Pāḷi |
| 2 | Mode: Pāḷi + Translation |
| 3 | Mode: Translation |
| 4 | Mode: Translation + Pāḷi |
| + / - | Increase / decrease speed |
| R | Reset speed to default |

## Getting a Pali voice on your device

There is no dedicated Pali TTS engine. Install one of **Sanskrit (India)**,
**Hindi (India)**, **Nepali** or **Indonesian** voices for the closest
pronunciation; if none is installed, English is used as a fallback.

- **Android** — Settings → Language & Input → Text-to-Speech → Install voice data.
- **iOS** — Settings → Accessibility → Spoken Content → Voices.
- **PC / macOS** — install a system voice via your OS settings.

## Extra links (Voice panel footer)

- **TTS** — a dedicated page for external TTS apps (e.g. Read Aloud for
  Chrome, Voice Aloud Reader for iOS).
- **VSC** — link to [Voice.SC](https://www.sc-voice.net/) (SuttaCentral Voice).
- **File** — direct link to an audio file, when one exists for that text.
- **?** — link to this help page.

## Google API key (optional)

Enables Google Cloud Text-to-Speech for higher-quality voices with generous
free limits: create an API key in Google Cloud Console and enable the
**Text-to-Speech API**.
