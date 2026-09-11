---
title: Офлайн-база
---

# Офлайн-база (offline library)

Офлайн на сайте работает поверх одного артефакта: файл SQLite с корпусом и триграммным FTS-индексом.
Собирается он **в этом репозитории** (`dg-app-full` больше не нужен) и один и тот же файл обслуживает
веб-PWA, TWA и будущие приложения.

## Что где лежит

| Что | Путь | Отдаётся как |
|---|---|---|
| Исходники корпуса (SC Bilara + DhammaGift) | `siteroot/data/suttacentral.net`, `siteroot/data/dhammagift` (симлинки) | — |
| Полный серверный корпус | `dg.db` | использует `dg-fastify.js` / `dg-light.js` |
| **Офлайн-срез (сборка)** | `siteroot/mobile-data/dg-mobile.db` | `/mobile-data/dg-mobile.db` |
| Манифест среза | `siteroot/mobile-data/db-manifest.json` | `/mobile-data/db-manifest.json` |
| Веб-слой офлайна | `public/offline/*` | `/offline/*` |
| Кеш оболочки (SW) | `public/service-worker.js` | `/sw.js` |
| Словарь DPD (~24 МБ) | `assets/js/standalone-dpd/*` | `/assets/js/standalone-dpd/*` |

Артефакты в git не хранятся. На сервере `siteroot/mobile-data/` — настоящий каталог; тест-чекаут
симлинком смотрит в продовый, чтобы не держать вторую копию на 500 МБ.

## Как собрать

```bash
npm run build-search-db   # siteroot/data/* -> dg.db (полный корпус, FTS5 trigram)
npm run build-mobile-db   # dg.db -> siteroot/mobile-data/dg-mobile.db + db-manifest.json
```

Флаги `build-mobile-db.js`: `--langs=ru,en`, `--source=<путь>` (алиас `--from=`), `--out=<каталог>`.
Замер на продовой машине: suttas 7605, texts 1 195 505, html 488 428, chunks 36 204,
`dg-mobile.db` 509.2 МБ, FTS ~60 с, всего ~130 с.

В срез входят: все сутты; `texts` вида `root`/`variant` и переводы только выбранных языков; вся
`html`-разметка; по строке `chunks` на (sutta, kind, lang, translator) с хешем; FTS5
(`tokenize='trigram remove_diacritics 1'`), пересобранный из среза. В `chunks` для root/variant/html
`lang`/`translator` — `''`, а не NULL: PRIMARY KEY у `WITHOUT ROWID` не терпит NULL. В `meta` пишутся
`build_id`, `schema_version`, `langs`, `fts` — клиент сверяет `build_id` с именем файла
`dg-mobile.<build_id>.db` и без этого считает файл недокачанным.

## Как это использует клиент

1. `distBase = window.DG_DIST_BASE || '/mobile-data'` (`public/offline/platform.js`).
2. Читает `db-manifest.json`, качает `dg-mobile.db` (с `Range` для докачки) в OPFS под именем
   `dg-mobile.<build_id>.db`.
3. Дешёвая проверка гейтит установку, полный `PRAGMA quick_check` идёт фоном.
4. Воркер (OPFS SAH-пул + `@sqlite.org/sqlite-wasm`) отвечает на `/search`, `/api/text/:id`,
   `/api/nav/:id`; `fetch` подменяется до любых других скриптов страницы.
5. Оболочку кеширует service worker, словарь — страница сразу после принятия библиотеки (precache
   при установке SW иногда теряет записи, см. ниже).

Пул OPFS — однописательный: библиотекой владеет одна вкладка, вкладка «впереди» забирает её себе, а
вкладка без пула может получать данные от владельца по `BroadcastChannel`.

## Проверка

```bash
npm run test-offline          # e2e: установка, офлайн-поиск/ридер/TOC, паритет с dg.db и dg-fastify
npm run test-offline-parity   # бандл ядра против core/search-core.js
npm run test-offline-resume   # обрезанный ответ -> докачка по Range
```

Для **настоящего** обрыва (а не эмуляции в DevTools) останавливают сервер (`pm2 stop test`) и
проверяют поиск, холодную загрузку сутты, развёрнутый `/toc`, словарь и вторую вкладку: DevTools
только отклоняет запросы, а остановленный сервер отвечает 5xx — именно этот случай ломал оболочку.

## Грабли

- OPFS требует secure context (HTTPS или localhost).
- Браузер может вытеснить хранилище; страница просит persistent storage, а отсутствие библиотеки —
  нормальное состояние, о котором сообщают настройки.
- 5xx должен уходить в кеш, а промах кеша — **бросать** ошибку: `respondWith(undefined)` это TypeError
  в странице («Failed to convert value to 'Response'») и вечный спиннер.
- Precache при установке SW может молча терять записи (в одном замере 127 из ~145, при том что сервер
  отдавал эти файлы 200) — всё, что обязано быть офлайн, кешируется ещё и со страницы.
- Жизненный цикл вкладки: страница в back/forward-кеше держит воркер и хендлы пула, поэтому воркер
  гасится на `pagehide` (никогда во время загрузки) и библиотека открывается заново на
  `focus`/`visibilitychange`/`pageshow`.
