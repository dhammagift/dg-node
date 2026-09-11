# Офлайн PWA как единая база для web / TWA / iOS

Статус: план, к реализации не приступали (2026-09-09).

## Зачем это

Задача: сайт и максимум платформ минимальными усилиями, обязательно офлайн на Android и iOS,
без нативного кода кроме шорткатов и Share API.

Аудит показал, что исходная постановка описывает работу, которая **уже сделана** в `dg-app-full`:

1. Приложение работает **не** на нативном Capacitor SQLite, а на `@sqlite.org/sqlite-wasm` 3.53
   (`package.json:24`) в module-worker'е (`src/db-worker.js`), база в OPFS через
   `installOpfsSAHPoolVfs` (`db-worker.js:101-109`, SAH-pool выбран именно потому, что COOP/COEP
   на сайте нет). То есть "перевести адаптер с Capacitor-плагина на Wasm" стоит 0 дней.
2. Прослойка это не реимплементация API: `src/app.js` подменяет `window.fetch` и зовёт
   **тот же** `dg-node/core/search-core.js`, собранный `build-core-bundle.js`. Совместимость
   `/search` по построению, плюс `test/core-parity.mjs` и `test/e2e-browser.js` диффят 24 ответа
   против снимков живого сайта.
3. Кастомных C-расширений и токенизаторов нет. Единственная нестандартная вещь это JS-функция
   `regexp_test` (`core/search-core.js:290-295`), уже проброшенная в Wasm через `nodeSqliteShim`
   (`db-worker.js:57-70`). FTS5 `trigram remove_diacritics 1` требует SQLite >= 3.45, в
   wasm-сборке 3.53 есть. `bm25/snippet/highlight/ICU/collations` не используются, `dbstat`
   только на этапе сборки базы.
4. **Сжатие бесполезно и не нужно.** 600 МБ это все языки SC; 170 МБ это языковой срез ru+en
   (`build-app-db.js`), а не результат компрессии. Триграммный индекс высокоэнтропийный:
   замерено `gzip 168MB -> 177MB` (`src/offline-status.js:280-287`), то есть больше исходного.
   Никакого `DecompressionStream` не требуется. Стриминг уже правильный:
   `pool.importDb(name, callback)` пишет базу в OPFS чанками из `response.body.getReader()`
   (`db-worker.js:72-97`), в память 170 МБ не попадают.
5. Ничего на сайте не обходит fetch-шим: DataTables client-side, autocomplete из localStorage,
   единственная `<form>` с `preventDefault()`. XHR/`$.ajax`/EventSource нет.

Значит настоящая работа не "перенести поиск на клиент", а **вернуть уже готовый офлайн-слой из
приложения обратно в сайт**, чтобы PWA был автономен сам по себе, а обёртки стали тонкими.

## Решения (согласованы)

- Офлайн-слой переезжает в `dg-node`. Сайт становится самодостаточным офлайн-PWA "под ключ".
  `dg-app-full` и `dg-twa` остаются маленькими репозиториями-обёртками и не содержат
  копии офлайн-логики (иначе она разъедется, ровно как разъезжался `mobile/www` до выноса).
- Скачивание базы: **opt-in кнопкой** в настройках. До нажатия сайт работает как сейчас,
  через сервер; шим не перехватывает ничего.
- iOS: сначала PWA (нативного кода ноль), Capacitor iOS отдельным этапом позже.

## План

### Этап 1. Офлайн-слой в dg-node (основная работа)

Новое в `dg-node`:

- `public/offline/` : `app.js` (fetch-шим), `db-worker.js`, `offline-status.js`,
  `offline-library-settings.js`, `vendor/sqlite-wasm/*` (переезжают из `dg-app-full/src/`).
- `public/offline/platform.js` : всё платформенное, что сейчас вкраплено в `app.js`, вынести
  за один интерфейс `{ askConsent, download }`:
  - браузерная реализация по умолчанию (стрим прямо в OPFS, согласие обычным диалогом);
  - Capacitor-реализация (`Network`, `DgDownloader`, `convertFileSrc`) остаётся в `dg-app-full`
    и подставляется через `window.dgPlatform` до загрузки `app.js`.
  Затрагиваемые места: `app.js:100-116` (Network), `:125-208` (DgDownloader), `db-worker.js:77`
  (`_capacitor_file_` sniff).
- `build-core-bundle.js` переезжает в `dg-node` (`npm run build-core-bundle`), выдаёт
  `public/offline/core-bundle.js`. `dg-app-full` забирает готовый файл вместо своей сборки.
- Активация шима: только если база реально есть в OPFS (`op: 'status'`) или пользователь нажал
  "скачать". Иначе `window.fetch` не трогаем вообще.

Правки в `dg-node`:

- `search/index.html` : добавить маркер `<!-- dg:app-scripts -->` в `<head>` и грузить
  `/offline/app.js` первым скриптом. Это же снимает хрупкость `build-page.js`
  (`dropServiceWorker`/`injectAppScripts` больше не должны угадывать структуру `<head>`).
- `public/service-worker.js` : сейчас network-first без precache, офлайн держится на случайно
  закешированном. Нужно: precache оболочки (index.html, `settings-bundle.js`/`home-bundle.js`,
  css, шрифты, `core-bundle.js`, `db-worker.js`, sqlite wasm), **navigation fallback на
  index.html** (без него pushState-URL вида `/dn22:2.2` офлайн отдаёт 404), сохранить
  network-first для остального, имя кеша по build-хешу. Комментарий про легаси cache-first
  оставить, ловушку не воспроизводить.
- `configs/manifest.json` : уже содержит `share_target` и 6 шорткатов, менять нечего.
- `dg-fastify.js` : сделать раздачу `/mobile-data` штатной (сейчас это только прод-симлинк,
  в чекауте отсутствует), проверить `Accept-Ranges` на `.db` (нужен для докачки; у
  `@fastify/static` включён по умолчанию, у самодельного `sendFile` нет), не сжимать `.db`
  (сейчас и так не сжимается: octet-stream не в compressible-наборе).
- Докачка по Range в браузерном пути: сейчас обрыв сети означает рестарт 170 МБ. В APK это
  закрывает Android DownloadManager, в вебе и TWA закрывать нечем, поэтому это часть MVP,
  а не улучшение.

### Этап 2. dg-app-full худеет

- `build-assets.js`/`build-page.js` перестают копировать офлайн-слой из `src/`, берут его из
  чекаута dg-node вместе с остальным UI. В `src/` остаются `native-bridge.js` и
  Capacitor-реализация `platform.js`.
- Вырезание регистрации SW в WebView оставить как есть.
- `DG_NODE_REF` продолжает пинить версию сайта.

### Этап 3. TWA

- Кода не требуется: TWA открывает тот же origin, шим и SW приезжают с сайта.
- Проверить на устройстве: `navigator.storage.persist()`, что Chrome не вымывает 170 МБ,
  и что сворачивание приложения во время скачивания не убивает загрузку (страховка это Range-докачка
  из этапа 1).
- Шорткаты и Share Target в `twa-manifest.json` и `configs/manifest.json` уже есть.

### Этап 4. iOS PWA

- Проверка на живом устройстве (Safari 17+): OPFS SAH-pool, квота под 170 МБ, поведение
  установленного на Home Screen PWA при нехватке диска.
- UI-ветка "библиотека пропала, скачать заново" (`offline-status.js` уже умеет сообщать об
  ошибке, нужен явный сценарий потери базы).
- Осознанные ограничения WebKit: нет Web Share Target и App Shortcuts. Это и есть причина
  будущего этапа 5.

### Этап 5 (позже, отдельным решением). iOS native

`npx cap add ios` поверх того же `www`, Share Extension и шорткаты, фоновая загрузка на
`URLSession` вместо Android DownloadManager.

## Проверка

- `npm run test-parity` и `npm run test-e2e` из `dg-app-full` переиспользовать для веб-сборки:
  второй уже поднимает обычный HTTP-сервер, грузит страницу в Chromium, ждёт
  `window.dgOfflineReady` (реальное скачивание в OPFS) и диффит 24 ответа против снимков сайта.
  Для веба добавить кейс "SW офлайн": DevTools offline + перезагрузка pushState-URL.
- Ручной чеклист: opt-in скачивание с прогрессом, обрыв сети и докачка, поиск и ридер в
  авиарежиме, обновление базы по `db-manifest.json`, TWA и iOS на живых устройствах.

## Оценка

| Этап | Дней |
|---|---|
| 1. Офлайн-слой в dg-node (перенос, platform.js, SW, Range-докачка, UI) | 4-6 |
| 2. Похудение dg-app-full и зелёный CI | 1-2 |
| 3. TWA: проверка на устройстве | 0.5-1 |
| 4. iOS PWA: проверка и сценарий потери базы | 1-2 |
| **MVP (web + PWA + TWA + iOS PWA)** | **7-11** |
| 5. iOS native (Capacitor + Share Extension), позже | 5-8 |
