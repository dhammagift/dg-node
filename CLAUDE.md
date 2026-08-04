# Dhamma.gift — Node.js Project


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
3. `res/index.html` — UI поиска (DataTables)
4. `dg_db_light.json` — скелет БД (генерируется `dblight.js`)
5. `reader/reader-template.html` — шаблон ридера

---

## Архитектура

### Целевая (финальная)
```
┌─────────────────────────────────────────┐
│  UI (один для web + Android)            │
│  ├── res/index.html  — поиск            │
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

---

## Структура проекта

```
nodejs/
├── dg-light.js              — Express сервер поиска, порт 3000 (главный файл)
├── dblight.js               — билд-скрипт → dg_db_light.json
├── dg_db_light.json         — скелет БД (18 МБ, id→{category,dir_path,title,mr,html})
├── cat_server.js            — CAT-сервер для переводов (production, не трогать)
├── translators_config.js    — имена переводчиков по lang-коду
├── package.json             — зависимости: express, cors
│
├── res/                     — UI поиска
│   ├── index.html           — главная страница поиска (DataTables, Bootstrap 5)
│   ├── script.js            — вспомогательный JS (устаревший?)
│   ├── demo.html            — демо-страница
│   └── result.json          — пример ответа API
│
├── reader/                  — UI ридера
│   ├── reader-template.html — шаблон ридера (i18n система)
│   ├── reader.html          — рабочий вариант ридера
│   ├── common.js            — общие утилиты ридера
│   ├── megareader.js        — логика мегаридера
│   └── lang_ru.json         — локализация (русский)
│
├── unused/                  — неиспользуемые файлы (не удалять без проверки)
│   ├── dg-heavy.js          — старый сервер с 117МБ JSON (заменён dg-light.js)
│   ├── cat_server_heavy_db.js, cat_server_work_no_percent.js — старые CAT-версии
│   ├── dbmake.js            — старый билд-скрипт (заменён dblight.js)
│   └── ...
│
└── dg_db.json, dg_dbNEW.json  — тяжёлые версии БД (117 МБ × 2, под удаление)
```

**Примечание**: `dg_db.json` и `dg_dbNEW.json` — 117 МБ каждый, можно удалить когда убедимся что `dg_db_light.json` покрывает все нужды.

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

## Текущие баги в res/index.html (приоритет)

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
