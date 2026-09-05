---
slug: /telegram-bot
sidebar_position: 16
---

import TelegramMock from '@site/src/components/TelegramMock';

# Telegram-бот

<div style={{textAlign: 'center', margin: '1em 0'}}>
  <a href="https://t.me/dgift_bot"><img src="/assets/img/buttons/telegram-cta.png" alt="Открыть @dgift_bot в Telegram" style={{maxWidth: '220px'}} /></a>
</div>

Это один и тот же бот под двумя именами — [@Dhammagift_bot](https://t.me/dhammagift_bot)
и его короткая форма [@Dgift_bot](https://t.me/dgift_bot) — функциональность
одинаковая, писать можно любому из двух.

Это **инлайн-бот** — открывать с ним отдельный чат не обязательно (хотя
можно и так). Основной способ: прямо в поле ввода **любого чата или
группы** наберите `@dgift_bot` и через пробел слово на пали или номер
текста — Telegram тут же покажет подсказки (слова, ссылки на тексты) не
выходя из этого чата. Отдельные мини-приложения:
[поиск](http://t.me/dhammagift_bot/find), [чтение](http://t.me/dhammagift_bot/read)
и [словарь](http://t.me/dhammagift_bot/dict).

<TelegramMock />

:::note[Мокап вместо скриншота]
Чат выше — не настоящий скриншот (Telegram нельзя встроить как `<iframe>`,
как остальные примеры в этом разделе документации), а мокап, собранный из
реального текста и вида интерфейса бота (`dgift_bot/main.py` —
`WELCOME_MESSAGES['ru']`, формат инлайн-результата "✏️ Отправить: ..."
из `inline_query()`). Настоящий скриншот можно добавить взамен в любой
момент.
:::
