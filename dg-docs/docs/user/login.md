---
slug: /login
sidebar_position: 7
---

import AppFrame from '@site/src/components/AppFrame';
import LoginSynced from '@site/static/img/help/login-synced-en.png';

# Login

Dhamma.gift doesn't need an account or an email address. "Login" here
means cloud sync of your favorites, history, reading progress and
settings across devices — two ways to do it:

- **Google** — a regular Google account sign-in.
- **Secret passphrase** — fully anonymous: pick a phrase of at least 8
  characters (no email, no password). Anyone who types the same phrase on
  another device gets access to the same synced data — treat it like a
  password.

<AppFrame src="/login" title="Login / cloud sync" height={500} />

## If the device already has local data

Logging in (either way) on a device that already has its own history or
favorites shows a choice:

- **Merge** — keep what's already on this device and add the cloud data
  on top of it.
- **Overwrite** — wipe this device's data and pull down the cloud copy
  instead.

## After logging in

<img src={LoginSynced} alt="Post-login screen: phrase, last sync time, active devices, sign out/delete data" style={{maxWidth: 380, display: 'block', margin: '0 auto 1.5rem'}} />

- **Sync now** — force a sync right away instead of waiting for the
  automatic one.
- **Active devices** — a list of every device currently signed in with
  this same phrase/account, with its device model and browser (detected
  automatically, nothing you type in) and last-active time.

Three different actions are easy to mix up — they don't touch the same
data:

| Action | Where you click it | What it wipes |
|---|---|---|
| **Sign out** | On this device | Nothing — it just turns off sync on this device. Local and cloud data are both left alone. |
| **Delete data** | On this device | Everything in the cloud (history, favorites, progress, settings, the account itself). Doesn't touch local data on this device. |
| **Terminate session** (the ⏻ icon next to another device in the list) | Remotely, from any device in the list | Disconnects THAT device from the cloud and **wipes all of its local data** (except language and theme) — the confirmation prompt warns you about this honestly. |

:::danger["Terminate session" is not just a remote sign-out]
Clicking ⏻ on your OWN second device (say, your phone, thinking "I'll
just close that extra session") wipes everything on that phone the next
time it touches the network: history, favorites, reading progress,
settings. Only use it on devices that are genuinely lost or shouldn't
have access anymore.
:::

## How the secret passphrase is stored

The phrase is normalized (lowercased, spaces → hyphens) and hashed on
your device (SHA-256) before anything is sent to the cloud — the hash,
not the phrase itself, is what identifies your data in the cloud.
