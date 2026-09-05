# Кеш-политика: версионирование статики + дифференцированный Cache-Control

Статус: **внедрено** (2026-09-05) — во всех 4 файлах: `dg-light.js` и
`dg-fastify.js`, в `main` (`/var/www/html/nodejs`) и `indep`
(`/var/www/html/nodejs-indep`). Итоговый план реализации и уточнённые с
владельцем детали — `/root/.claude/plans/merry-crafting-church.md`.

Уточнения, принятые при внедрении (см. план для полного контекста):
- Легаси JS/CSS (не версионируется) — сутки вместо изначальных 60 сек.
- Общий фолбэк (`.html` вне `sendVersionedHtml` + некатегоризированное) —
  600 минут вместо 60 сек.
- `/config/tts-config.json`/`/config/sync-config.json` (есть только в
  indep) — изначально планировался второстепенный тир (10 минут), но при
  внедрении смёржен в общий часовой тир вместе с `/api/toc`/`/openapi.json`/
  `/reader/mode-table.json`/`/manifest.json` (см. `dg-fastify.js` рядом с
  `CACHE_PREFIXES`): все они и так кешируются на сервере в памяти без TTL
  (`tocTreeCache`/`bookTitleCache`/`branchTitleCache`), поэтому короткий
  клиентский тир не давал реальной свежести — только лишние round-trip'ы.
  Owner: "match search's 1h". Ниже по тексту (§4) эта деталь ещё не
  актуализирована — верить этому пункту, не тому.
- **`CACHE_CONFIG_JSON` переведён с гаданого TTL на `no-cache`+ETag**
  (2026-09-05, по прямому запросу владельца: "я за гибкость и скорость —
  чтобы кеш работал"). Уточнение для будущих читателей, раз возник вопрос
  при внедрении: `Cache-Control: no-cache` — это НЕ "не кешировать" и не
  "не дёргать сеть, пока не сменится ETag" — браузер ВСЕГДА делает запрос
  (`If-None-Match`), но пока файл не изменился, сервер отвечает `304 Not
  Modified` без тела — дёшево. Разница с TTL: `no-cache` даёт нулевую
  задержку появления правки ценой одного лёгкого round-trip'а на каждую
  загрузку; TTL даёт ноль round-trip'ов внутри окна ценой возможной
  устаревшести внутри него. Для файлов из этой группы (`announcements.json`,
  `slides.json`, `translator-priority.json`, `lang_*.json`,
  `translators.json` и т.п.) — они фетчатся редко (раз за сессию SPA, не на
  каждой навигации, в отличие от JS/CSS/картинок), поэтому round-trip не
  бьёт по скорости, а свежесть становится точной, а не подобранной на
  глаз. Работает БЕСПЛАТНО там, где файл реально читается с диска на
  каждый запрос (`express.static`/`res.sendFile` в Express, `@fastify/
  static`/`@fastify/send` в Fastify — оба генерируют ETag по умолчанию,
  без доп. кода). Единственное исключение — самодельный `sendFile()` в
  `dg-fastify.js` (использовался для `/assets/js/translators.json`,
  `/manifest.json`, `/config/tts-config.json`, `/config/sync-config.json`):
  он просто читал файл и отправлял, без ETag вообще — `no-cache` без
  валидатора там означал бы "не кешировать вообще". Починено: `sendFile()`
  теперь считает md5 буфера, сравнивает с `If-None-Match`, отвечает `304`
  при совпадении — той же схемой, что и `sendVersionedHtml` выше. Из этой
  группы РЕАЛЬНО получили `no-cache` только файлы, которые сами читаются с
  диска на каждый запрос (см. предыдущий пункт про `/config/*.json` —
  туда `no-cache` осознанно НЕ переносили, они уже в часовом тире по
  другой причине: server-side in-memory кеш без TTL, где `no-cache` ничего
  не даёт по свежести, только лишний round-trip). Проверено живьём (`curl
  -H "If-None-Match: ..."` → настоящий `304` без тела) для
  `/assets/js/translators.json` (Express) и для аналогичного маунта в
  изолированном тесте на `@fastify/static`/самодельном `sendFile()`
  (полный `dg-fastify.js` не поднимается в этом окружении — не хватает
  `dg.db`, который собирается из офлайн-корпуса, недоступного здесь).
- В Fastify `@fastify/static`'s `setHeaders` вызывается с Fastify reply
  (`reply.header(...)`), НЕ с сырым Node `res` — вопреки исходному
  предположению ниже ("byte-identical") оказалось не так (проверено
  эмпирически: `res.setHeader is not a function`, сервер падал). В
  Fastify-файлах `staticCacheHeaders`/`sendVersionedHtml` используют
  `reply.header()`, не `res.setHeader()`.
- **ETag добавлен в `sendVersionedHtml` во всех 4 файлах** (после
  внедрения, по живой проверке владельца через сторонний
  cache-header-чекер на test.dhamma.gift): `max-age=0, must-revalidate`
  без валидатора (`ETag`/`Last-Modified`) означает, что КАЖДАЯ
  ревалидация — это полное скачивание страницы заново, 304 никогда не
  возвращается. ETag = md5 от итогового (уже переписанного, с `?v=`)
  HTML — меняется, когда меняется любой версионированный ассет на
  странице, не только сам HTML-файл. Проверяется `If-None-Match` →
  реальный 304 без тела. `sendVersionedHtml` теперь принимает `req`
  первым параметром (`sendVersionedHtml(req, res, path, status)` в
  Express / `sendVersionedHtml(req, reply, path, status)` в Fastify) —
  все вызовы во всех 4 файлах обновлены.

## Проблема

Сейчас (`dg-light.js`) у ВСЕХ 13 маунтов `express.static(...)` одинаковый
`{ maxAge: 60000 }` (60 секунд) — сознательный компромисс из прошлой сессии
(TODO.md #global п.2): раньше был голый дефолт `max-age=0` (304-запрос на
каждый ассет при каждом переходе), 60с выбрали именно потому что "риск
отдать устаревший файл посреди разработки" — в проекте **нет
версионирования статики** (хэшей в именах файлов, `?v=`), поэтому длинный
TTL напрямую означал бы: поправил файл на проде — часть пользователей видит
старую версию до истечения TTL, без способа сбросить кроме переименования
файла.

Все динамические JSON-роуты (`/search`, `/api/text/:suttaId`, `/api/nav`,
`/api/toc*` и т.д.) сейчас вообще без `Cache-Control`.

60 секунд — не кеш, а просто отложенная проблема. Задача — сделать
нормальный кеш, но не в ущерб "поправил файл — пользователь должен увидеть
новое". Это возможно только через настоящее версионирование: если URL
ассета меняется при изменении содержимого, можно кешировать его сколь
угодно долго и безопасно.

Требования (уточнены с владельцем проекта):
- Для статики (JS/CSS/шрифты/картинки) — нужна реальная версионность, чтобы
  можно было ставить длинный TTL безопасно, а не "60 секунд просто так".
- Для результатов поиска и чтения сутт (`/search*`, `/api/text`,
  `/api/nav`) — кеш около часа устраивает.

Архитектурная привязка к уже существующим паттернам в файле:
- "явный роут перед static-маунтом побеждает по порядку регистрации" —
  уже используется для `/pm.php`, `/bipm.php`, `/reader/mode-table.json`,
  override `/assets` (`public/overrides`) vs `siteroot/assets`. Новый код
  следует тому же паттерну, не изобретает новый.
- CLAUDE.md прямо запрещает хардкодить конкретные имена инструментов
  `siteroot/` в `dg-light.js` (siteroot — это "положил symlink, ничего в
  коде трогать не нужно"). Значит легаси-тулзы (login/memo/help/4nt) и
  Docusaurus-сборка (`dg-docs/build*`) **сознательно не версионируются** в
  первом заходе — это следование архитектурному правилу проекта, не
  недосмотр.

## Дизайн

### 1. Версионирование статики (content-hash, lazy, без новых npm-зависимостей)

```js
const crypto = require('crypto'); // built-in, no new dependency

const assetVersionCache = new Map(); // absPath -> { mtimeMs, hash }
function getAssetVersion(absPath) {
    try {
        const stat = fsSync.statSync(absPath);
        const cached = assetVersionCache.get(absPath);
        if (cached && cached.mtimeMs === stat.mtimeMs) return cached.hash;
        const hash = crypto.createHash('md5').update(fsSync.readFileSync(absPath)).digest('hex').slice(0, 10);
        assetVersionCache.set(absPath, { mtimeMs: stat.mtimeMs, hash });
        return hash;
    } catch { return null; }
}
```

Хэш считается лениво (при первом рендере HTML, который на ассет
ссылается) и пересчитывается автоматически при изменении `mtime` файла —
**рестарт сервера не нужен**, правка файла видна сразу на следующей
загрузке страницы. Это решает исходную проблему TODO.md #global п.2 лучше,
чем 60-секундный компромисс: не "подожди минуту", а "URL меняется сразу
же, и старый URL можно кешировать вечно, потому что он теперь буквально
про старое содержимое".

### 2. HTML entry points — versioned render вместо голого `res.sendFile`

HTML-страница — точка входа, определяющая какую версию JS/CSS подгружать
дальше, поэтому сама она не кешируется агрессивно (`no-cache`), а ссылки
внутри неё на локальные `.js`/`.css`/`.svg`/`.png`/`.ico` переписываются на
лету с добавлением `?v=<hash>`:

```js
const VERSIONED_STATIC_ROOTS = [
    path.join(__dirname, 'public', 'overrides'),
    path.join(__dirname, 'public', 'spa'),
    path.join(__dirname, 'search'),
    path.join(__dirname, 'reader'),
    path.join(__dirname, 'settings'),
];
const HTML_ASSET_URL_ROOTS = {
    '/assets': VERSIONED_STATIC_ROOTS[0],
    '/spa': VERSIONED_STATIC_ROOTS[1],
    '/nodejs/res': VERSIONED_STATIC_ROOTS[2],
    '/reader': VERSIONED_STATIC_ROOTS[3],
    '/settings': VERSIONED_STATIC_ROOTS[4],
};

function sendVersionedHtml(res, absHtmlPath, status = 200) {
    let html;
    try { html = fsSync.readFileSync(absHtmlPath, 'utf8'); }
    catch { return res.status(404).end(); }
    const rewritten = html.replace(
        /((?:src|href)=")(\/(?:assets|spa|nodejs\/res|reader|settings)\/[^"?#]+\.(?:js|css|svg|png|ico))(")/g,
        (m, pre, url, post) => {
            const prefix = Object.keys(HTML_ASSET_URL_ROOTS).find(p => url.startsWith(p + '/'));
            if (!prefix) return m;
            const relPath = url.slice(prefix.length + 1);
            const absAssetPath = path.join(HTML_ASSET_URL_ROOTS[prefix], relPath);
            const v = getAssetVersion(absAssetPath);
            return v ? `${pre}${url}?v=${v}${post}` : m;
        }
    );
    res.status(status).set('Cache-Control', 'public, max-age=0, must-revalidate').type('html').send(rewritten);
}
```

`/assets` резолвится только против `public/overrides` — если файла там нет
(значит он приезжает из `siteroot/assets`-фолбэка), ссылка остаётся
неверсионированной и наследует безопасный дефолт статики (см. §3).

**Места, где `res.sendFile(...)` заменяется на `sendVersionedHtml(res, ...)`**
(проверено на текущем HEAD ветки `indep`):

| URL | Файл:строка сейчас | Отдаёт |
|---|---|---|
| `/` | `dg-light.js:681` | `search/index.html` |
| `/spa/app` | `dg-light.js:668` | `public/spa/index.html` |
| `/spa/*splat` | `dg-light.js:675` | `public/spa/index.html` |
| `/toc/:code` | `dg-light.js:2888` | `search/index.html` |
| `/:slug` (catch-all) | `dg-light.js:2928-2960` | `search/index.html` (несколько веток) |
| 404-хендлер | `dg-light.js:2969` | `public/404.html` (сохранить статус 404) |
| `/pm.php` | `dg-light.js:582` | `reader/bu-pm.html` |
| `/bipm.php` | `dg-light.js:583` | `reader/bi-pm.html` |
| `/api/patimokkha-fragment/:side` | `dg-light.js:595` | `reader/{bu,bi}-pm-fragment.html` |

**Новые явные роуты** (тот же паттерн, что уже используется для
`/pm.php`/`/reader/mode-table.json` — регистрировать ДО соответствующих
static-маунтов, чтобы победить по порядку регистрации):
- `app.get(['/settings', '/settings/'], ...)` → `sendVersionedHtml(res, settings/index.html)`
  (сейчас `/settings` отдаётся голой статикой, `dg-light.js:544`, без
  версионирования JS/CSS внутри страницы).
- `app.get('/reader/reader.html', ...)` и `app.get('/reader/reader-template.html', ...)`
  перед `dg-light.js:569` — та же причина: сейчас голая статика.

**Сознательно вне рамок первого захода** (правило CLAUDE.md про
`siteroot/`): `siteroot/login`, `siteroot/memo`, `siteroot/help`,
`siteroot/4nt`, `dg-docs/build*` — остаются на текущей политике (§3,
фолбэк `max-age=60`). Расширить на них тот же `sendVersionedHtml` можно
позже без изменения дизайна.

### 3. Cache-Control по типу файла для `express.static`-маунтов

Заменить `{ maxAge: 60000 }` на `{ setHeaders: staticCacheHeaders }` во
**всех 15 вызовах `express.static(...)`** в файле. Порядок регистрации и
пути НЕ трогать — на нём завязан весь override-precedence (`/assets`,
`/read`, `siteroot/`-цикл).

```js
const CACHE_IMMUTABLE_YEAR = 'public, max-age=31536000, immutable';
const CACHE_FONT = 'public, max-age=604800';     // 7 days — fonts almost never change
const CACHE_IMAGE = 'public, max-age=86400';      // 1 day — images not covered by versioning (referenced from CSS url())
const CACHE_CONFIG_JSON = 'no-cache';             // see "JSON без версионирования" below — always revalidated, ETag makes repeat fetches cheap anyway
const CACHE_STATIC_SHORT = 'public, max-age=60';  // current default, unchanged — for anything outside the versioned roots

function staticCacheHeaders(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const inVersionedRoot = VERSIONED_STATIC_ROOTS.some(root => filePath.startsWith(root + path.sep));
    if (inVersionedRoot && ['.js', '.css', '.svg', '.png', '.ico'].includes(ext)) {
        res.setHeader('Cache-Control', CACHE_IMMUTABLE_YEAR); // safe: URL is versioned in sendVersionedHtml
    } else if (['.woff', '.woff2', '.ttf', '.eot', '.otf'].includes(ext)) {
        res.setHeader('Cache-Control', CACHE_FONT);
    } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg'].includes(ext)) {
        res.setHeader('Cache-Control', CACHE_IMAGE);
    } else if (ext === '.json') {
        res.setHeader('Cache-Control', CACHE_CONFIG_JSON); // no-cache — see rationale below
    } else {
        res.setHeader('Cache-Control', CACHE_STATIC_SHORT); // .html and everything else — today's behavior
    }
}
```

Важно: `inVersionedRoot` проверяется по **физическому пути** резолвнутого
файла, не по URL-префиксу. Значит `/assets/js/x.js` из `public/overrides`
(наш, версионируется) получает immutable-год, а `/assets/js/y.js` из
`siteroot/assets` (легаси-фолбэк, не версионируется) — безопасный
`max-age=60` как сейчас, хотя URL-префикс у обоих один и тот же `/assets`.
Ради этого разделения дифспатч и должен быть path-aware, а не
extension-only.

#### JSON-конфиги без версионирования — почему `no-cache`, а не подобранный TTL

`mode-table.json`, `translator-priority.json`, `lang_*.json`,
`announcements.json`, `slides.json`, `menu-links.json`, `dict-modes.json`,
`toc-books.json`, `translator-types.json` и т.п. в принципе МОЖНО было бы
версионировать тем же `getAssetVersion` — но, в отличие от JS/CSS, они не
подключаются через `<script src>`/`<link href>` в HTML, а фетчатся
клиентским JS по захардкоженному пути (`fetch('/reader/mode-table.json')`
в `megareader.js`/`settings.js`/`dhamma-i18n.js` и т.д.). Настоящее
версионирование потребовало бы редактировать сами fetch-вызовы (добавлять
`?v=` из манифеста) — заметно больше работы, чем переписывание HTML в
`sendVersionedHtml`, и в этом заходе не делается.

Вместо подбора произвольного TTL (5 минут? час?) — используем то, что эти
файлы фетчатся РЕДКО (один раз за сессию SPA, а не на каждой навигации, как
JS/CSS/картинки), значит 304-такс, из-за которого вообще начался весь
разговор про кеш (TODO.md #global п.2), здесь не проблема: `Cache-Control:
no-cache` (не "не кешировать", а "кешируй, но всегда сверяйся с сервером")
+ ETag, который Express добавляет автоматически для файлов, отданных через
`express.static`/`res.sendFile` — гарантированно свежий ответ, а повторный
запрос дешёвый (304 без тела). Никакого компромисса между "быстро" и
"актуально" не нужно — колонка TTL просто не имеет смысла для
низкочастотных файлов.

Это касается ТОЛЬКО файлов, отданных `express.static`/`res.sendFile`
(бесплатный ETag) — технически применимо и к `/manifest.json`,
`/config/tts-config.json`, `/config/sync-config.json` (тоже `res.sendFile`).
**На деле при внедрении для них выбрали другое** (см. шапку файла) — они
живут в общем часовом тире вместе с `/api/toc`/`/openapi.json`/
`/reader/mode-table.json`, потому что там TTL всё равно не про свежесть
(данные кешируются в памяти сервера без TTL до рестарта) — `no-cache`
туда осознанно не переносили, чтобы не плодить лишний round-trip там, где
он ничего не даёт. Единственный файл, который реально получил `no-cache` +
починенный ETag — `/assets/js/translators.json` (единственный из этой
подгруппы, у которого нет server-side in-memory кеша, читается с диска
на каждый запрос).

### 4. Динамические JSON-роуты — поиск и чтение сутт (~1 час)

Добавить `res.set('Cache-Control', 'public, max-age=3600')` в обработчики
(не персональные данные — публичный контент Палийского канона, одинаковый
для всех запросивших):

| Роут | Файл:строка | Заметка |
|---|---|---|
| `/search` | `dg-light.js:2349` | `app.get('/search', searchHandler)` — общий с `/search/:keyword`, заголовок ставится ОДИН РАЗ внутри `searchHandler`, покрывает оба роута |
| `/search/:keyword` | `dg-light.js:2445` | тот же `searchHandler`, см. выше |
| `/search/enrich` | `dg-light.js:2394` | отдельный inline-хендлер |
| `/api/text/:suttaId` | `dg-light.js:2219` | inline `async` хендлер |
| `/api/nav/:suttaId` | `dg-light.js:2328` | inline хендлер |

**Как реально сделано** (обновлено после внедрения — было предложено выше
второй, более короткий тир `max-age=600`, но это не то, что в итоге в
коде): `/api/toc`, `/api/toc/book/:code`, `/api/transliterate`,
`/openapi.json`, `/openapi.en.json`, `/reader/mode-table.json`,
`/manifest.json`, `/config/tts-config.json`, `/config/sync-config.json` —
ВСЕ смёржены в тот же `public, max-age=3600`, что и `/search*`/`/api/text`/
`/api/nav` в таблице выше, а не в отдельный второстепенный тир. Причина
(владелец, при внедрении): `/api/toc`/`/openapi.json`/`/reader/mode-
table.json` и так кешируются на сервере в памяти без TTL
(`tocTreeCache`/`bookTitleCache`/`branchTitleCache`) — короткий клиентский
TTL не давал реальной свежести, только лишние round-trip'ы, поэтому от
двух тиров отказались в пользу одного. `/manifest.json`/`tts-config.json`/
`sync-config.json` технически МОГЛИ БЫ получить `no-cache`+ETag как
`/assets/js/translators.json` (тоже `res.sendFile`, тоже бесплатный ETag)
— но раз уж их всё равно смёржили с этой группой ради простоты, оставили
как есть; переносить их в `no-cache` отдельно от остальной группы можно,
но не сделано — низкий приоритет (файлы правятся почти никогда).

`/sw.js` (`dg-light.js:62`) — отдельно, явный `no-cache`: устаревший
service-worker подвешивает пользователя на старой версии PWA, этот файл
всегда должен ревалидироваться, даже безопасный дефолт для него не годится.

### 5. no-store — задел на будущее

`/assets/lbl-save.php` (`dg-light.js:522`, POST, write-эндпоинт) —
`res.set('Cache-Control', 'no-store')` для явности. Сейчас персональных
GET-эндпоинтов в `dg-light.js` нет вообще, поэтому третий блок из
классического шаблона ("no-store для персональных данных") пока применить
больше не к чему — достаточно короткого комментария-маркера в коде рядом с
этим роутом на будущее (любой персональный/сессионный GET-эндпоинт, если
появится, берёт `no-store` по этому же паттерну).

## Что делать при переходе на Fastify

Сама политика (TTL-тиры, что версионируется и почему) — решение о
продукте/трафике, не об Express API, поэтому не меняется при миграции.
Меняется только механика:

- `express.static({ setHeaders })` → `@fastify/static` принимает ту же
  опцию `setHeaders` (тот же `send`/`serve-static` под капотом) — блок §3
  переносится почти без изменений.
- `compression` (npm) → `@fastify/compress` (прямой эквивалент).
- Версионирование (§1, `getAssetVersion`) — чистый Node (`crypto` + `fs`),
  фреймворк-независимо, переносится как есть.
- `res.set('Cache-Control', ...)` внутри хендлера (§4) → в Fastify это
  `reply.header('Cache-Control', ...)` в хендлере, либо глобальный
  `onSend`-хук по маске пути — второе даже удобнее для группы `/search*`
  роутов, т.к. не нужно трогать каждый хендлер по отдельности.
- Порядок регистрации static-маунтов (override-precedence: `/assets` из
  `public/overrides` должен побеждать `/assets` из `siteroot/assets`) — в
  Fastify через `prefix` в `fastify.register()` работает по тому же
  принципу "кто раньше зарегистрирован — тот и матчится первым" для
  одинаковых префиксов; сверить с документацией Fastify про route
  conflicts при самой миграции, но сам принцип не меняется.

## TODO

- [x] Внедрить §1-2 (версионирование + `sendVersionedHtml`) в `dg-light.js`
      (main + indep) и `dg-fastify.js` (main + indep)
- [x] Внедрить §3 (`staticCacheHeaders` на всех static-маунтах — 13 в
      `dg-light.js`, 11 в `dg-fastify.js`, где `/assets`/`/read` схлопывают
      override+fallback в один `root`-массив)
- [x] Внедрить §4 (Cache-Control на `/search*`, `/api/text`, `/api/nav`,
      `/sw.js`, второстепенный тир на `/api/toc`, `/openapi.json`,
      `/manifest.json` и т.п.) — в Express per-handler `res.set(...)`, в
      Fastify один `onSend`-хук по префиксам пути (заменил временный
      плоский 60с-хук)
- [x] Внедрить §5 (`no-store` на `/assets/lbl-save.php`)
- [x] Проверено живьём на каждом из 4 файлов (сначала на отдельном
      scratch-порту, прод — `dg-light.js` в main — в последнюю очередь,
      только после подтверждения на indep): `curl -I` по всем категориям,
      правка файла без рестарта сервера (хеш меняется, инвалидация по
      mtime реально работает), override-precedence (`/assets`
      public/overrides всё ещё побеждает siteroot-фолбэк), POST
      `/assets/lbl-save.php` продолжает писать файл с `no-store`,
      визуальная проверка в браузере (`playwright-cli`) — `/kacchapa`,
      `/dn22` — 0 ошибок в консоли, все версионированные ассеты 200.
      Прод (`dhamma.gift`, main `dg-light.js`) дополнительно проверен
      через реальный путь Apache-прокси.

**Отдельно найдено при внедрении, НЕ являлось частью этой задачи**:
`dg-fastify.js` в indep содержит недоделанный SQLite/FTS5 поисковый бэкенд
(`dg.db`, `build-search-db.js`) из более ранней, не связанной с кешем
сессии — `openSearchDb()` определена, но нигде не вызывается, `/search`
падает 500. По просьбе владельца не трогалось ("отдельная задача"). Из-за
этого `dg-fastify.js` (indep) НЕ развёрнут как живой процесс на
test.dhamma.gift — там по-прежнему `dg-light.js` (с уже внедрённым кешем).
`dg-fastify.js` (main) этой проблемы не имеет — `/search` там работает
штатно, но тоже не развёрнут как живой процесс (только `dg-light.js`
обслуживает реальный трафик main).
