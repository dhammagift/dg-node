---
slug: /quickmodal
sidebar_position: 6
---

import AppFrame from '@site/src/components/AppFrame';

# Quick Window (compass)

Fast access to favorites, history, key suttas, and memorization — from
**anywhere** on the site, without leaving the page you're on.

:::tip[How to open it]
The compass icon in the toolbar or the burger menu, or the **Alt+P**
(or **Alt+Y** — both work regardless of your keyboard layout) shortcut.
:::

:::info[Jump straight to a specific tab]
Each tab can be opened directly from here, with one click:

- <a href="#" onClick={(e) => { e.preventDefault(); window.dgOpenQuickModal && window.dgOpenQuickModal('tab-fav'); }}>★ Favorites / History</a>
- <a href="#" onClick={(e) => { e.preventDefault(); window.dgOpenQuickModal && window.dgOpenQuickModal('tab-4as'); }}>4 Ariyasaccāni</a>
- <a href="#" onClick={(e) => { e.preventDefault(); window.dgOpenQuickModal && window.dgOpenQuickModal('tab-memo'); }}>Memorize</a>
- <a href="#" onClick={(e) => { e.preventDefault(); window.dgOpenQuickModal && window.dgOpenQuickModal('tab-dpd'); }}>Dictionary</a>
:::

<AppFrame src="/?action=true" title="Quick Window" height={550} />

At the top, above the tabs, is a search box — you can search without
closing this window or leaving the page you're on. Right-click (or
long-press on a phone) on the search button opens the results in a new
tab instead of replacing the current page.

## Tabs

- **★ Favorites** — your bookmarks and search history in one list.
  Sort alphabetically or by date (the ⇅ icon), rename or delete
  bookmarks, hide individual history entries. At the bottom, two more
  exits: **"← Your history"** (the full history page) and **"Overall
  history →"** (aggregated history across all texts).

  :::tip[The ⟳ sync icon doubles as a shortcut to logging in]
  If you're not signed in, clicking the sync icon opens the [Login
  page](/login) instead of attempting a sync — so it also happens to be
  the fastest way to get there. Right-click or middle-click the icon
  always goes to the login page, even if you're already signed in.
  :::

- **4 Ariyasaccāni** — a curated set of key suttas for studying the Four
  Noble Truths, in six thematic groups: the Four Noble Truths (SN 56.11,
  DN 22, SN 12.2), the five aggregates of clinging / khandha (SN 22.56,
  22.79, 22.85, all of SN 22), the six sense bases / āyatana (SN 35.228,
  229, 236, 238, all of SN 35), elements / dhātu (MN 28, MN 115, MN 140,
  all of SN 14), "delighting in what leads to suffering" (SN 14.35,
  22.29, 35.19, 35.20), and an "Extra" set of eight more suttas on
  related topics.
- **Memorize** — the same tool as the standalone [Memo](/memo) page,
  embedded here as a tab for quick access.
- **Dictionary** — the real [Dict.Dhamma.Gift](https://dict.dhamma.gift)
  as a tab (matching your current light/dark theme), without leaving for
  another site; see the dedicated [Dictionary](/dictionary) page for more.

## Hotkeys

| Key | Action |
|---|---|
| Alt+P, Alt+Y | Open/close the Quick Window |
| Esc | Close |
