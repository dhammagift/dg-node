# dg-node

Поиск и ридер текстов Пали-канона (SuttaCentral Bilara + переводы проекта DhammaGift). Node.js/Express, самодостаточный — все статические ассеты (jQuery, Bootstrap, DataTables, стили) лежат в `public/assets/`, ничего не берётся с соседних репозиториев в рантайме.

Архитектура и правила разработки — см. [CLAUDE.md](CLAUDE.md).

## Установка и запуск

```bash
git pull
npm install
npm run build-db   # пересобрать dg_db_light.json из свежих Bilara-данных (dblight.js)
npm start          # запустить сервер (dg-light.js), порт 3000
```

`build-db` нужно перезапускать при изменении исходных текстов/переводов на диске — сервер каждый раз читает только уже собранный `dg_db_light.json`, не сканирует диск заново.

Пути к данным (`SC_BILARA`, `DG_OFFLINE`, офлайн-зеркала) определяются автоматически по окружению (Termux / Windows-разработка / Linux-прод) в начале `dg-light.js` и `dblight.js`.

## Проверка после деплоя/обновления

```bash
curl "http://localhost:3000/search?q=kacchapa&scope=dhamma&langs=ru,en"
curl -I "http://localhost:3000/assets/js/datatables/datatables.js"   # 200 из public/assets, не из соседнего репо
curl -I "http://localhost:3000/dn22"                                  # ридер по чистому URL
curl -I "http://localhost:3000/dn22:10.5"                             # сегментная ссылка (скролл к 10.5)
```

Глазами в браузере:
- `/nodejs/res/?q=kacchapa&scope=dhamma` — поиск, DataTables, экспорт.
- `/dn22` — ридер, полный текст.
- Переключатель Pāḷi/Рус (три режима: пали+перевод → только пали → только перевод) — должен реально прятать текст (проверять `getComputedStyle(el).display`), а не только менять CSS-класс.
- `/?q=dn22#12.1` (старый формат) — должен продолжать работать наравне с `/dn22:12.1`.

## Важно при деплое за Apache/PHP

Если публичный dhamma.gift сейчас обслуживается Apache/PHP, а Node — отдельный бэкенд, проксируемый только на `/search`, то новые роуты (`/`, `/dn22`, `/assets/*`, `/api/text/*`) снаружи видны не будут, пока правила проксирования не расширят на эти пути тоже. Легаси-репозиторий (`/c/soft/dg` в деве, соответствующий путь в проде) при этом не трогаем — правим только конфиг проксирования.

## Структура

```
dg-light.js          — единый Express-сервер: /search, /api/text/:suttaId,
                        статика (res/, reader/, public/assets/), офлайн-зеркала,
                        чистые URL (/dn22, /dn22:12.1)
dblight.js            — билд-скрипт → dg_db_light.json (скелет БД)
res/                  — страница поиска (DataTables)
reader/               — ридер (reader-template.html + megareader.js)
public/assets/        — все статические ассеты (перенесены из легаси-репо)
```
