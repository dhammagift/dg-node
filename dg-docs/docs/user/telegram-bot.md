---
slug: /telegram-bot
sidebar_position: 16
---

import TelegramMock from '@site/src/components/TelegramMock';

# Telegram bot

<div style={{textAlign: 'center', margin: '1em 0'}}>
  <a href="https://t.me/dgift_bot"><img src="/assets/img/buttons/telegram-cta.png" alt="Open @dgift_bot on Telegram" style={{maxWidth: '220px'}} /></a>
</div>

It's the same bot under two names — [@Dhammagift_bot](https://t.me/dhammagift_bot)
and its short form [@Dgift_bot](https://t.me/dgift_bot) — same
functionality, either one works.

It's an **inline bot** — you don't have to open a chat with it (though
you can). The main way to use it: right in the message box of **any chat
or group**, type `@dgift_bot` followed by a Pali word or a text number —
Telegram immediately shows suggestions (words, links to texts) without
leaving that chat. There are also dedicated Mini Apps:
[search](http://t.me/dhammagift_bot/find), [reading](http://t.me/dhammagift_bot/read)
and the [dictionary](http://t.me/dhammagift_bot/dict).

<TelegramMock lang="en" />

:::note[Mock-up, not a screenshot]
The chat above isn't a real screenshot (Telegram can't be embedded as an
`<iframe>`, unlike the other examples in this docs section) — it's a
mock-up built from the bot's real text and interface (`dgift_bot/main.py`
— `WELCOME_MESSAGES['en']`, the inline-result format "✏️ Send: ..." from
`inline_query()`). A real screenshot can replace it at any time.
:::
