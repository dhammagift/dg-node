# Шорткаты приложения: адреса, иконки, порядок

Спецификация для агента, который будет дорабатывать шорткаты. Источник правды — **`configs/manifest.json`**,
он же отдаётся сервером по `/manifest.json` (явный роут в `dg-fastify.js` и `dg-light.js`).

## Почему порядок важен

Телефон (лончер Android) показывает **только первые 3–4** шортката из массива, десктопные контекстные
меню — все. Поэтому «для телефона» = первые четыре записи, «для ПК» = всё остальное. Никакой
локализации у названий нет: манифест статический, имена заданы один раз (сейчас английские).

## Текущий список (порядок в массиве = порядок в меню)

Порядок 1–3 намеренно UX: TOC первым (самый частый вход), Favorites/history — вторым (владелец:
"избранное историю ближе к пальцу и гарантированно на всех устройствах"), дальше Dictionary и Memo.
Тот же порядок в приложении на Capacitor — там он достигается иначе (см. раздел про приложение).

| # | name | short_name | url | icon | где лежит иконка |
|---|---|---|---|---|---|
| 1 | Table of Contents | TOC | `/toc` | `/assets/img/maniIcon.png` | `siteroot/assets/img/maniIcon.png` (легаси-репо) |
| 2 | Favorites & history | Favorites | `/4as` | `/assets/svg/star.svg` | `public/overrides/svg/star.svg` (наш файл) |
| 3 | Dictionary | Dictionary | `/dict` | `/assets/svg/book-letter.svg` | `public/overrides/svg/book-letter.svg` (наш файл) |
| 4 | Memo | Memo | `/memo` | `/assets/svg/memo.svg` | `siteroot/assets/svg/memo.svg` (легаси-репо) |
| 5 | Bhikkhu Patimokkha | — | `/toc/pm` | `/assets/img/monkIcon.png` | `siteroot/assets/img/monkIcon.png` |
| 6 | Bhikkhuni Patimokkha | — | `/toc/bipm` | `/assets/img/nunIcon.png` | `siteroot/assets/img/nunIcon.png` |
| 7 | Aksharamukha.com | — | `/open?url=https://www.aksharamukha.com/converter` | `/assets/img/maniIcon.png` | то же |
| 8 | Dharmamitra.org | — | `/open?url=https://dharmamitra.org/` | `/assets/img/maniIcon.png` | то же |

Пункты 1–4 — то, что видно на телефоне; 5–8 оставлены для десктопа.

## JSON этих записей (как в `configs/manifest.json`)

```json
"shortcuts": [
  { "name": "Table of Contents", "short_name": "TOC",
    "description": "Table of contents of the canon", "url": "/toc",
    "icons": [{ "src": "/assets/img/maniIcon.png", "sizes": "192x192", "type": "image/png" }] },
  { "name": "Favorites & history", "short_name": "Favorites",
    "description": "Favorites and search history", "url": "/4as",
    "icons": [{ "src": "/assets/svg/star.svg", "sizes": "any", "type": "image/svg+xml" }] },
  { "name": "Dictionary", "short_name": "Dictionary",
    "description": "Pali dictionary (DPD)", "url": "/dict",
    "icons": [{ "src": "/assets/svg/book-letter.svg", "sizes": "any", "type": "image/svg+xml" }] },
  { "name": "Memo", "short_name": "Memo",
    "description": "Memorize texts", "url": "/memo",
    "icons": [{ "src": "/assets/svg/memo.svg", "sizes": "any", "type": "image/svg+xml" }] }
]
```

## Иконки: правила и подводные камни

- Наши иконки кладём в **`public/overrides/svg/`** — этот каталог монтируется на `/assets` **раньше**
  легаси-репо, поэтому `/assets/svg/<файл>` отдаётся именно наш.
- Легаси-иконки (`maniIcon.png`, `monkIcon.png`, `nunIcon.png`, `memo.svg`) живут в `siteroot/assets/`
  (симлинк на легаси-репо), их править не нужно.
- **Android может игнорировать SVG** в `icons` шортката (исторически ждёт bitmap). Если шорткат
  пропадает из меню — первым делом заменить SVG на PNG 96×96 или больше (иконки приложения уже есть:
  `/assets/img/pwa-bold-monocolor-192.png`, `/assets/img/pwa-bold-monocolor-512.png`).
- Проверка: `curl -s http://127.0.0.1:3003/manifest.json | python3 -m json.tool | head -40` и
  `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3003/assets/svg/star.svg` (ждём 200).

## Нативное Android-приложение (dg-twa) — ДРУГОЙ источник правды

`dg-twa` (репозиторий TWA-обёртки, отдельный от этого) держит свой список шорткатов не в
`shortcuts.xml`/`strings.xml`, а в захардкоженном массиве `twaManifest.shortcuts` внутри
**`app/build.gradle`**. Таск `generateShorcutsFile` (`preBuild.dependsOn`, т.е. на каждой сборке)
перегенерирует `res/xml/shortcuts.xml` и `resValue`'ы `shortcut_name_N`/`shortcut_short_name_N`
из этого массива — правки прямо в `shortcuts.xml`/`strings.xml` молча затираются на следующей
сборке (проверено на себе: иконки, у которых свой PNG-файл, обновились, а имена/урлы — нет).
Значит для нативного приложения менять нужно **`app/build.gradle`**, `twa-manifest.json` там же —
только справочная метаинформация bubblewrap, сборку не определяет.

## Приложение на Capacitor (dg-app-full) — третий источник правды

Статические шорткаты приложения — **не** `shortcuts` из манифеста: у Capacitor WebView нет TWA-моста
к веб-манифесту, поэтому они лежат в `android/app/src/main/res/xml/shortcuts.xml` и передают путь
extra'ом `route` (MainActivity → `https://localhost/?_nativeRoute=…`, страница переписывает URL до
своего bootstrap — `native-bridge.js`). Список и порядок сверены с таблицей выше, но с двумя
поправками по существу:

Приложение (Capacitor) держит **те же четыре статических шортката и в том же порядке**, что и
манифест — Contents, Favorites & history, Dictionary, Memo (`res/xml/shortcuts.xml`, иконки из dg-twa).
Динамические («недавно прочитанное») добавляются к ним:

| Слот | Что | Как задаётся |
|---|---|---|
| 1 | Table of Contents (`/toc`) | статический |
| 2 | Favorites & history (`/4as`) | статический |
| 3 | Dictionary (`/dict`) | статический, открывается в браузере (серверная страница) |
| 4 | Memo (`/memo`) | статический, теперь внутри приложения |
| далее | «недавно прочитанное» | динамические (`native-bridge.js` → `DgShortcuts`), только реальные тексты, максимум 2 |

Contents и Favorites **нельзя** делать динамическими: первая попытка закрепила их там с рангами
0/1 в расчёте на то, что Android показывает динамические шорткаты выше статических, — на лончере
владельца вышло наоборот, статические (Dictionary, Memo) оказались первыми, а закреплённые уехали
вниз. Порядок задаёт `shortcuts.xml`, а динамика отвечает только за «недавнее».

## Динамические шорткаты (то, чего в манифесте быть не может)
«Последние прочитанные» в пунктах 3–4 — только в нативном приложении (решение: Capacitor):

- **Android:** `ShortcutManager.setDynamicShortcuts()` / `pushDynamicShortcut()` — хранит ~15,
  лончер показывает 4.
- **iOS:** `UIApplication.shared.shortcutItems` — максимум 4, показываются по долгому нажатию на иконку.
- **Источник данных:** история сайта в `localStorage`: `localSearchHistory` (последние запросы),
  `dg_favorites` (избранное), `visitCount`, `dg_deleted_history` (удалённое — не показывать).
- **Важно:** нативная сторона `localStorage` прочитать не может. Страница (наш же билд сайта) читает
  историю и отдаёт список в мост: `DgShortcuts.set({ items: [{ id, label, url }] })`; обновлять при
  старте приложения и при уходе в фон (`appStateChange`).
- В PWA и TWA динамических шорткатов не будет никогда: манифест статический, у TWA нет доступа к
  `ShortcutManager`, а в iOS у веб-приложения на домашнем экране шорткатов нет вообще.
