# Dhamma.gift — Node.js SPA Project

## Два проекта

Когда даешь обнолвения для тестов давай ссылку на скачивание апк или ссылки для тестов


**Оригинальный проект (PHP):**
- https://github.com/dhammagift/dg
- PHP приложение (index.php)
- Поиск + Ридер + История + Help + About на одной странице
- Традиционная архитектура (страницы, редиректы)

**Новый проект (Node.js SPA):**
- https://github.com/dhammagift/dg-node
- Single-Page Application (Express.js + JavaScript)
- Поиск и ридер в одном окне (SPA)
- Умная URL маршрутизация (`/keyword`, `/dn22:2.2`, `/dn22:2.2/kacchapa`)
- Единое модальное окно с вкладками (Settings + Compass + Help)
- Конечная цель: нативное Android приложение через Capacitor + SQLite

---

## Прод: пути и symlinks

На проде старый (PHP) репо лежит в `/var/www/html`, новый (dg-node) — в `/var/www/html/nodejs`
(т.е. `nodejs/` — просто подпапка внутри старого репо, не рядом с ним). Всё, что нужно
dg-node из старого репо (ассеты, `read/js/*` и т.п.), связано через **symlinks** — единый
источник правды, без дублирования файлов между репо.

**На этой Windows-машине эти symlinks могут не работать.** Локальный checkout (`core.symlinks=false`)
хранит их как обычные файлы с текстом пути вместо реальной ссылки (см. также аналогичный workaround
в легаси-репо `C:\soft\dg`), либо содержимое просто отсутствует на диске (например,
`siteroot/assets` в этом репо, symlink на `../../assets` в проде). Если что-то 404-ит локально
под `/assets/...` — это не обязательно баг: проверь `C:\soft\dg\assets\...` (легаси-репо) и,
если файл там есть, скопируй его в `siteroot/assets/...` (или `public/overrides/...`, если файл
переопределён локально) для паритета в dev — в проде оно и так резолвится через реальный symlink.
Уже так чинили: `svg/open-link.svg`, `svg/rotate-solid-full.svg`, `svg/trash-can-regular-full.svg`,
`common/history.html`, `img/read/favicon-black.png`, `js/jquery-ui.min.js`, `css/jquery-ui.min.css`.

---

Если ты пишешь код, то комментарии обязательно делай на англйском.

по текущим задачам проверяй TODO и там отмечай сделанное перед пунктов добавляй done. в конец можешь дописывать нюансы и комменты через --- туду ведем по русски.



## Что это
Поиск и ридер текстов Пали-канона (SuttaCentral Bilara + переводы проекта DhammaGift).  
Конечная цель — нативное Android-приложение через **Capacitor + SQLite**.  
**Не PWA, не TWA** — полноценный APK.  
Веб-версия остаётся параллельно и навсегда.

---

## С чего начинать сессию

1. Этот файл (`CLAUDE.md`) — архитектура и правила
2. `dg-light.js` — сервер поиска (главный файл)
3. `search/index.html` — UI поиска (DataTables)
4. `dg_db_light.json` — скелет БД (генерируется `dblight.js`)
5. `reader/reader-template.html` — шаблон ридера

---

## Архитектура

### Целевая (финальная)
```
┌─────────────────────────────────────────┐
│  UI (один для web + Android)            │
│  ├── search/index.html — поиск           │
│  └── reader/         — ридер            │
├─────────────────────────────────────────┤
│  Data layer (зависит от платформы)      │
│  ├── Web:     Express + grep + JSON     │
│  └── Android: Capacitor SQLite (FTS5)   │
└─────────────────────────────────────────┘
```

### Текущая (веб)
```
Запрос → grep по файлам → suttaId → читаем файлы по id → JSON-ответ
```

Никакого предварительного индекса файлов. Маппинг делается по id:
- `dir_path` из скелета → детерминированный путь к root/variant
- `find {langDir} -name "{suttaId}_*.json"` → переводы на лету

---

## Источники данных

### SC Bilara (SuttaCentral)
```
BASE/suttacentral.net/sc-data/sc_bilara_data/
├── root/pli/ms/          ← пали MS-издание (основной для поиска)
├── variant/pli/ms/       ← варианты MS
├── html/pli/ms/          ← HTML-разметка (хранится в скелете)
└── translation/
    ├── ru/               ← переводы по языкам
    ├── en/
    ├── de/ ...           ← SC поддерживает много языков
```

### DhammaGift offline
```
HOME/offline-data/dhammagift/
├── root/pli/
│   ├── bjt/             ← BJT-издание пали (для ридера, не для grep)
│   ├── vri/             ← VRI-издание
│   └── siam/            ← Siam-издание
├── ru/                  ← лучший рус. перевод (один на язык)
├── ru_other/            ← второй рус. перевод
├── en/                  ← лучший англ. перевод
├── en_other/
├── ai/                  ← AI-перевод
├── svEtc/               ← ПРОПУСКАТЬ при индексации
└── backups/             ← ПРОПУСКАТЬ при индексации
```

**Важно**: DhammaGift — проект по Дхамме, не переводоведческий.  
Один лучший перевод на язык, без множества авторов. Переводчик известен из имени файла.  
Формат имён файлов одинаковый с SC: `dn22_translation-ru-o.json`

### Издания пали (bjt/vri/siam)
- Используются только в **ридере** для сравнения изданий
- В grep **не включаются** (основной для поиска — ms из SC)
- Будут в `filePathsIndex.editions` когда потребуется ридеру

### Ридер: приоритет переводчиков и режимы (`reader/translator-priority.json`, `reader/mode-table.json`)

Физически оба файла лежат в `configs/reader/` (см. "Структура проекта" выше) — здесь и
далее по тексту они упоминаются по URL/логическому имени (`reader/...`), под которым их
фетчит клиент и который не менялся при переносе конфигов в `configs/`.

Для каждого языка `findTranslationFiles()` (`dg-light.js`) собирает кандидатов
из трёх мест:

- **SC** — `sc_bilara_data/translation/{lang}/*` (все переводчики SC).
- **DG-main** — `assets/texts/{lang}/` — "лучший перевод проекта"; сейчас
  пуст везде (нет контента ни локально, ни в offline-data репо) — появится,
  когда обновят offline-data, код уже готов его подхватить без правок.
- **DG-other** — `assets/texts/{lang}_other/` — "второе мнение" проекта.

Если один и тот же переводчик физически лежит в нескольких местах сразу
(бывает — `ru_sv`/`ru_khantibalo`/`ru_narinyanievmenenko` есть и в SC-зеркале,
и в DG-other), приоритет источника задан ПО ЯЗЫКУ (`SOURCE_PRIORITY` в
`dg-light.js`, от самого приоритетного к наименее):
```js
{ ru: ['dgmain', 'dgother', 'sc'], en: ['dgmain', 'sc', 'dgother'] }
```
Для `ru` — DG-other (кураторская подборка) важнее сырого SC-зеркала. Для
`en` — наоборот: SC хостит десятки признанных переводчиков, важнее
единственного DG-other (thanissaro). Раньше был race — SC и DG-other
читались параллельно (`Promise.all`) в общий объект, порядок записи не
гарантирован; теперь группы одного языка читаются последовательно в этом
порядке (разные языки — параллельно, их ключи не пересекаются).

Из найденных кандидатов один (или два, для `multiFor`) выбирается по
`reader/translator-priority.json`:
```json
{ "ru": ["ru_o", "ru_sv+edited+o", "ru_sv"], "en": ["en_o", "en_thanissaro"] }
```
Языки без записи в этом файле (пока только ru/en описаны) — берут первого
попавшегося кандидата; хвост-фолбэк "не sujato" для `en` применяется, если
никто из списка не найден. Для новых языков в будущем: раз приоритетов нет,
`keys[0]` уже работает без правок кода — groundwork под много языков заложен
(колонки/поиск не завязаны на ровно ru+en). English-фолбэк для языков без
СВОЕГО перевода вообще (например будущий `th` без тайского переводчика) —
запланирован, но не реализован: текущий рендер на клиенте группирует
переводы по префиксу ключа языка (`th_*`), просто подставить `en_*` под
колонку `th` без явной пометки "это на самом деле английский" будет вводить
в заблуждение — нужна доработка рендера, не только сервера.

**Режимы ридера** — `reader/mode-table.json`, единственный источник истины
(и сервер, и клиент читают ЕГО, а не дублируют логику):
```json
{
  "st":   { "columns": ["ru"],       "family": "ru", "label": "Ru" },
  "mt":   { "columns": ["ru"],       "family": "ru", "label": "R+R", "multiFor": ["ru"] },
  "ml":   { "columns": ["ru","en"],  "family": "ru", "label": "R+E" },
  "read": { "columns": ["en"],       "family": "en", "label": "En" },
  "ee":   { "columns": ["en"],       "family": "en", "label": "E+E", "multiFor": ["en"] }
}
```
Клиент шлёт только `?mode=<key>` в `/api/text/:suttaId` — сервер сам
резолвит `columns`/`multiFor` и возвращает `columns` в ответе (клиент их
больше не хранит и не решает сам). `?langs=`/`?multiFor=`/`?translators=`
остаются рабочими напрямую (ручной доступ/`/api-docs`), но ридер ими не
пользуется — `mode=` единственный путь.

`multiFor` — сервер подбирает ВТОРОГО переводчика автоматически: первый как
обычно по приоритету, второй — специально из `{lang}_other`, кто бы там ни
оказался для конкретной сутты (не хардкод конкретного имени). Если второго
нет — режим тихо схлопывается в одну колонку.

**Панель переключения режимов** (`scLink` в `megareader.js`) — показывает
все режимы той же языковой `family`, кроме текущего, плюс один переход на
плейн-режим ДРУГОЙ семьи:

| Текущий режим | Показывает ссылки на |
|---|---|
| ru (`st`) | R+R (`mt`), R+E (`ml`), En (`read`) |
| en (`read`) | E+E (`ee`), Ru (`st`) |
| r+r (`mt`) | Ru (`st`), R+E (`ml`), En (`read`) |
| r+e (`ml`) | Ru (`st`), R+R (`mt`), En (`read`) |
| e+e (`ee`) | En (`read`), Ru (`st`) |

Порядок ключей в `mode-table.json` (`st, mt, ml, read, ee`) задаёт порядок
ссылок в панели — при добавлении нового режима той же семьи вставлять его
в нужную позицию в файле, а не в конец.

---

## Структура проекта

Карта репозитория — где что лежит и за что отвечает. Конфиги проекта (JSON, не
исполняемый код) собраны в одном месте — `configs/` — а не разбросаны по `search/`/`reader/`/
корню; документация не для разработки на каждый день — в `docs/`; всё подтверждённо
неиспользуемое — в `unused/` (см. примечание под деревом, почему `unused/` здесь почти
пустой и это не баг).

```
nodejs/
├── dg-light.js              — Express сервер поиска, порт 3000 (главный файл, точка входа)
├── dblight.js                — билд-скрипт → dg_db_light.json (npm run build-db)
├── dg_db_light.json          — скелет БД (генерируется, в git не попадает, см. .gitignore)
├── cat_server.js              — CAT-сервер для переводов (production, отдельный процесс, не трогать)
├── package.json               — зависимости: express, cors, swagger-ui-express
│
├── configs/                   — ВСЕ json-конфиги проекта в одном месте (не легаси-config/, см. ниже)
│   ├── openapi.json, openapi.en.json   — спека /api-docs (require в dg-light.js; URL /openapi*.json без /configs)
│   ├── reader/
│   │   ├── mode-table.json             — режимы ридера (st/mt/ml/read/ee), единственный источник истины
│   │   ├── translator-priority.json    — приоритет переводчиков по языку ("ru": ["ru_o", ...])
│   │   ├── translators.json            — подписи переводчиков ("sv+edited+o" → "SV theravada.ru
│   │   │                                 с Англ, ред. o"); клиент фетчит по СТАРОМУ URL
│   │   │                                 /assets/js/translators.json (явный роут перед маунтом
│   │   │                                 /assets в обоих серверах). Авторский текст, поэтому
│   │   │                                 НЕ таблица в dg.db: та пересобирается из корпуса и
│   │   │                                 стёрла бы всё написанное руками
│   │   └── lang_ru.json, lang_en.json  — локализация UI ридера
│   └── search/
│       └── lang_ru.json, lang_en.json  — локализация UI поиска (datatables/results/buttons и т.п.)
│   (URL этих файлов НЕ поменялся при переносе — /reader/*.json и /nodejs/res/lang_*.json
│   по-прежнему работают, dg-light.js отдаёт их вторым static-маунтом на тот же префикс;
│   поменялся только физический путь на диске/в require())
│
├── docs/                      — документация по проекту (не код), читать по необходимости, не при каждой сессии
│   ├── BACKWARD_COMPAT.md     — требования обратной совместимости URL при миграции на SPA
│   ├── SPA_INTEGRATION.md     — план интеграции SPA-фреймворка
│   └── SPA_PLAN.md            — план разработки SPA поэтапно
│
├── search/                    — UI поиска (папка называется search/, публичный URL — по-прежнему
│   │                             /nodejs/res/... — обратная совместимость, см. dg-light.js)
│   └── index.html            — главная страница поиска (DataTables, Bootstrap 5)
│
├── reader/                   — UI ридера
│   ├── reader-template.html  — шаблон ридера (i18n система)
│   ├── reader.html           — рабочий вариант ридера
│   ├── common.js             — общие утилиты ридера
│   └── megareader.js         — логика мегаридера
│
├── public/                   — статические файлы, которые мы реально правим
│   ├── overrides/js/         — search-render.js, settings.js, dg-text-router.js, dhamma-i18n.js —
│   │                            отдаются раньше легаси-assets (см. siteroot/assets/ ниже)
│   ├── overrides/read/js/voice.js — патч поверх легаси TTS-плеера (siteroot/read/), тот же
│   │                            override-приоритет паттерн под /read (см. dg-light.js)
│   └── spa/                   — SPA фреймворк (Phase 1+)
│       ├── router.js          — умная маршрутизация URL (dn22, keyword распознавание)
│       ├── state.js           — глобальное состояние (search + reader + UI)
│       ├── app.js              — инициализация SPA и обработка навигации
│       ├── views.js            — рендеринг представлений (landing, search, reader)
│       └── modal.js            — единое модальное окно с вкладками (Settings, Compass, Help)
│
├── unused/                    — подтверждённо неиспользуемые файлы (не удалять без проверки)
│   ├── script.js, demo.html, result.json  — прототипы страницы поиска до search-render.js
│   └── translators_config.js               — не используется продовым кодом (реальные имена
│                                                переводчиков берутся из /assets/js/translators.json,
│                                                см. комментарий в reader/megareader.js)
│
└── siteroot/                   — публикация от корня сайта, см. отдельный раздел ниже
    ├── assets/                    — symlink на легаси-репо целиком (единый источник ассетов) —
    │                                 второй маунт под /assets, ПОСЛЕ public/overrides/ (см. выше)
    ├── 4nt, config, login, memo   — symlink'и на легаси-репо (были раньше прямо в корне nodejs/,
    │                                 см. "Прод: пути и symlinks" выше) — НЕ путать с configs/
    │                                 (множественное число) выше, это разные папки: config/ (легаси,
    │                                 чужой) живёт ВНУТРИ siteroot/, configs/ — наши json-конфиги.
    ├── read/                       — legacy TTS voice-player (symlink на легаси-репо, НЕ путать с
    │                                 reader/ выше — разные фичи с похожими именами, см. TODO.md)
    └── (новые тулзы/зеркала/учебники добавляются сюда же — см. раздел ниже)
```

**Про `unused/` в этом чекауте**: CLAUDE.md исторически описывал более полный `unused/`
(`dg-heavy.js`, `cat_server_heavy_db.js`, `dbmake.js`, `dg_db.json`/`dg_dbNEW.json` — 117 МБ ×
2, "под удаление") — но по факту эти файлы никогда не коммитились в этот git-репозиторий,
они существуют только на реальной дев/прод-машине вне git. Подтверждено (grep по всему
коду): ничего из них не используется, но физически перенести/удалить их отсюда нельзя — это
нужно делать на той машине, где они реально лежат.

---

## Публикация от корня сайта (`siteroot/`)

Отвечает на вопрос из TODO.md (общие п.3): как публиковать легаси-тулзы, зеркала сторонних
сайтов, учебники и прочий контент от корня (`dhamma.gift/{имя}/...`), не хардкодя каждую
новую единицу в `dg-light.js` и не превращая корень репозитория в свалку, как в легаси. Не
`mirrors/` — там не только зеркала: это ещё и активно используемые легаси-тулзы (4nt, TTS
voice-player) и их конфиги, а в будущем — учебники и другой контент, никак не "зеркала" по
смыслу. `siteroot/` описывает МЕХАНИЗМ (публикуется от корня сайта), а не тип содержимого.

**Как работает**: `dg-light.js` при старте сканирует `siteroot/` (`fsSync.readdirSync`) и для
КАЖДОЙ найденной записи — папки или symlink'а — автоматически регистрирует
`app.use('/{имя}', express.static(...))`. Значит, чтобы опубликовать новую тулзу/зеркало/учебник:

1. Положить в `siteroot/` symlink на реальные файлы (где бы они ни лежали — рядом с проектом,
   как `4nt`/`config`/`login`/`memo`/`read`/`assets` сейчас: `siteroot/4nt -> ../../4nt`) ИЛИ
   прямо реальные файлы/папку, если контент небольшой и должен жить прямо в git-репозитории.
2. Перезапустить сервер.
3. Готово — `dhamma.gift/{имя}/...` работает, в `dg-light.js` ничего править не нужно.

**Важные нюансы**:
- Список папок сканируется ОДИН РАЗ при старте процесса, не на каждый запрос — новое имя в
  `siteroot/` требует рестарта сервера. Правки ВНУТРИ уже примонтированной записи (файлы
  изменились, но имя папки то же) видны сразу, рестарт не нужен — `express.static` читает с
  диска на лету.
- Имя папки в `siteroot/` = URL-префикс один в один (`siteroot/dict` → `/dict/...`). Не
  занимайте для НОВОЙ тулзы имена, уже жёстко замаунченные явно ВЫШЕ по файлу до цикла
  сканирования `siteroot/`: `spa`, `search` (алиас `/nodejs/res`), `nodejs`, `reader`. Если
  совпадёт — явный маунт (он регистрируется раньше) победит, запись в `siteroot/` будет
  молча проигнорирована. `assets` — единственное НАМЕРЕННОЕ исключение: `/assets` явно
  замаунчен на `public/overrides/` (файлы, которые мы реально правим) РАНЬШЕ цикла
  сканирования, а `siteroot/assets` (легаси-репо целиком) подхватывается тем же циклом как
  обычная запись и становится ВТОРЫМ, запасным маунтом на тот же префикс — override побеждает
  автоматически чисто порядком регистрации, ничего специально синхронизировать не нужно.
- `/ru/login`, `/ru/memo` — единственное исключение из правила "никакого хардкода": это не
  отдельные тулзы, а второй URL-алиас для уже смонтированных `login`/`memo` (легаси-наследие),
  прописаны явно двумя строчками сразу после цикла сканирования `siteroot/`.
- `read/` (TTS voice-player) переехал сюда же (`siteroot/read/`) — раньше был отдельной
  явно замаунченной папкой в корне nodejs/, теперь просто ещё одна запись в `siteroot/`,
  ничем не отличается от 4nt/config/login/memo. Вложенные symlink'и `siteroot/read/css/
  voice.css`, `siteroot/read/js/voice.js`, `siteroot/read/js/voice-mem.js` смотрят на
  легаси-репо на один уровень глубже, чем раньше (`../../../../read/...`, было `../../../
  read/...`) — пересчитано при переносе.
- Технический нюанс, который стоит знать при отладке (если новая запись вдруг "не находится"):
  `fs.Dirent.isDirectory()` для SYMLINK'а на директорию возвращает `false` (тип записи — сама
  ссылка, не её цель) — проверено эмпирически. Поэтому фильтр в коде — `d.isDirectory() ||
  d.isSymbolicLink()`, а не только `isDirectory()`. Тот же баг был и в независимом, отдельном
  механизме `OFFLINE_MIRRORS_ROOT` (см. ниже) — тоже исправлен заодно.

**Не то же самое, что `OFFLINE_MIRRORS_ROOT`** (`dg-light.js`, платформо-зависимый путь —
`~/offline-data` на Linux/Termux, `C:/soft/offline-data` на Windows) — тот механизм для
ТЯЖЁЛЫХ офлайн-зеркал сторонних сайтов (accesstoinsight.org, buddhadust.net и т.п. из TODO.md),
которые сознательно живут ВНЕ git-репозитория (не наши, большие, не нужно их коммитить) —
работает по тому же принципу (скан папки → авто-маунт), но `siteroot/` — специально ВНУТРИ
репозитория, для того, что должно быть частью проекта хотя бы как symlink (даже если сама
цель — легаси-код снаружи).

---

## SPA Фреймворк (Single-Page Application)

### Архитектура

```
URL in → Router parses → State updates → Views re-render
                ↓
         (dn22/keyword recognition)
                ↓
         /keyword → search view
         /dn22:2.2 → reader view
         /dn22:2.2/kacchapa → reader + highlight
```

### Файлы SPA (public/spa/)

**router.js** — Умная маршрутизация
- Распознает sutta IDs: `dn22`, `mn1`, `sn56:11`, `sn56.11` по шаблону
- Обрабатывает оба формата: `/sutta/keyword` и `/keyword/sutta`
- Редиректит legacy `/?q=...` на чистые URLs
- Управляет History API (browser back/forward)

**state.js** — Глобальное состояние (изолировано)
- `search`: query, scope, langs, lb, la, results
- `reader`: suttaId, currentSegment, highlightKeyword, editions, translations
- `ui`: currentView, modalOpen, modalTab, language
- Паттерн listener для реагирования на изменения

**app.js** — Инициализация и управление
- Инициализирует router + state
- Обнаруживает и редиректит legacy URLs
- Слушает изменения маршрута (popstate)
- Публичный API: goToSearch(), goToReader(), goToLanding()

**views.js** — Рендеринг представлений
- landing: показывает search input + help/about разделы
- search: выполняет API запрос, показывает результаты в DataTable
- reader: загружает текст сутты, применяет highlight
- Интегрируется с существующим search API и megareader.js

**modal.js** — Единое модальное окно
- 3 вкладки: Settings (🔧), Compass (☸), Help (❓)
- Settings: скрипт система, размер шрифта, тема, режим отображения
- Compass: навигация по Four Noble Truths
- Help: сочетания клавиш, форматы URL

### Управление состоянием

**Изоляция**: Состояние поиска и ридера полностью отделены.
- При переходе на search: reader.suttaId = null
- При открытии reader: search.query может остаться (для highlight)
- UI изменения (modal, язык) не влияют на search/reader состояние

**Жизненный цикл представления**:
1. URL меняется → Router парсит
2. State обновляется → Listeners уведомляются
3. Views перестраивают DOM
4. Пользователь видит новое представление

---

## Скелет (dg_db_light.json)

Хранит полезную metadata — не пути к файлам, а данные для UI:
```json
{
  "dn22": {
    "category": "dhamma",
    "dir_path": "pli/ms/sutta/dn",
    "title": "Mahāsatipaṭṭhānasutta",
    "mr": 12,
    "html": { "dn22:1.1": "<p>", ... }
  }
}
```

`dir_path` → детерминированный путь к файлам:
- root:    `SC_BILARA/root/{dir_path}/{id}_root-pli-ms.json`
- variant: `SC_BILARA/variant/{dir_path}/{id}_variant-pli-ms.json`

---

## Express API

**GET /search**
```
?q=kacchapa       обязателен
&scope=default    default|all|dhamma|vinaya|abhi|khudakka|dn,mn,...
&langs=ru,en      языки переводов (all = все доступные)
&lb=0             строк контекста до совпадения
&la=0             строк контекста после
&exact=false      точное слово (-w у grep)
```

Формат ответа:
```json
{
  "metadata": { "query", "scope", "langs", "lb", "la", "totalFiles", "totalMatches", "hasVariantMatch" },
  "data": {
    "dn22": {
      "sutta_id": "dn22",
      "category": "dhamma",
      "dir_path": "pli/ms/sutta/dn",
      "titles": { "root": "Mahāsati...", "ru_o": "Великое...", "en_sujato": "The Great..." },
      "mr": 12,
      "count": 3,
      "unique_words": ["kacchapa", "kacchapānaṁ"],
      "segments": [
        {
          "segment": "dn22:1.1",
          "root_text": "...",
          "variant": "...",
          "html": "<p>",
          "translations": { "ru_o": "...", "en_sujato": "..." },
          "lb_context": [...],
          "la_context": [...]
        }
      ]
    }
  }
}
```

Ключ перевода: `{langCode}_{author}` → `ru_o`, `en_sujato`, `ru_ai`

---

## Текущие баги в search/index.html (приоритет)

1. **lb/la контекст** — данные приходят с сервера, но не рендерятся
2. **Сортировка категорий** — `category-pre` зарегистрирован, но не применяется в `order`
3. **Переключение языков в Title** — классы `.eng-lang`/`.ru-lang` есть, toggle не работает
4. **Якорные ссылки** — нужно `sn56.11#1.1` (segmentId уже есть в данных)
5. **`s=` параметр** — добавлять `&s={keyword}` ко всем ссылкам на ридер

---

## Путь к Android (Capacitor)

Когда поиск + ридер стабилизируются:
```
npm install @capacitor/core @capacitor/android @capacitor-community/sqlite
npx cap init && npx cap add android
```

Конвертировать `dg_db_light.json` + тексты → `dhamma.db` (SQLite с FTS5):
```sql
CREATE TABLE suttas (id TEXT PRIMARY KEY, category TEXT, dir_path TEXT, title TEXT, mr INTEGER);
CREATE TABLE segments (sutta_id TEXT, segment_id TEXT, root TEXT, html TEXT);
CREATE VIRTUAL TABLE fts USING fts5(root, segment_id UNINDEXED, sutta_id UNINDEXED);
```

API-ответ `/search` должен быть **идентичным** независимо от источника (grep или SQLite).  
Это позволит не переписывать UI при переходе на Android.

---

## Правила

- Бекап перед изменением: `~/claudeBak/filename.ext`
- Тест API: `http://localhost:3000/search?q=kacchapa&scope=dhamma&langs=ru,en`
- Тест UI:  `http://localhost:8080/nodejs/res/?q=kacchapa&lb=1&la=2&scope=dhamma`
- Не трогать: `dg-heavy.js`, `cat_server*.js` — устаревшие
- Не трогать: `dg_db.json`, `dg_dbNEW.json` — тяжёлые версии под удаление
- `svEtc/` и `backups/` в offline-data — исключать из обхода
