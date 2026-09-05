---
slug: /installation
sidebar_position: 1
---

# Установка и запуск

Экосистема Dhamma.gift — это несколько независимых git-репозиториев,
которые вместе образуют один продукт:

| Репозиторий | Что это |
|---|---|
| [`dg-node`](https://github.com/dhammagift/dg-node) | Основной сайт (Express + SPA) — поиск, ридер, этот docs-портал (`dg-docs/`), офлайн-приложение (`mobile/`) |
| [`dg`](https://github.com/dhammagift/dg) | Легаси PHP-сайт — источник ассетов (`assets/`), 4nt, TTS-плеера (`read/`) и старых страниц (`config/`, `login/`, `memo/`), на которые `dg-node` ссылается симлинками |
| [`offline-data`](https://github.com/dhammagift/offline-data) | Собственные переводы проекта (лучший ru/en перевод, второе мнение, AI-перевод) |
| [`suttacentral/sc-data`](https://github.com/suttacentral/sc-data) | Внешний репозиторий SuttaCentral — пали-тексты и переводы в формате Bilara (не наш, публичный) |
| [`dgift_bot`](https://github.com/dhammagift/dgift_bot) | Telegram-бот (Python) |
| [`dg-twa`](https://github.com/dhammagift/dg-twa) | Android-приложение **Dhamma.Gift online** (Bubblewrap/TWA) |
| [`dictPlugin`](https://github.com/dhammagift/dictPlugin) | Браузерное расширение (Chrome/Firefox) + userscript |

Только сам сайт (`dg-node`) можно поднять полностью автоматически одним
скриптом — остальное (легаси-репо, тексты) он использует как внешние
данные, подключаемые симлинками (см. `CLAUDE.md` → "Прод: пути и
symlinks"), а не как npm-зависимости.

## Сайт (`dg-node`) — автоматическая установка

Требуется: **Node.js** (в CI используется 24.20.0, жёсткого ограничения
версии в `package.json` нет — актуальный LTS должен подойти), **npm**,
**git**.

```bash
git clone https://github.com/dhammagift/dg-node.git
cd dg-node
./scripts/setup.sh
./scripts/start.sh
```

`scripts/setup.sh` делает всё за один проход:

1. Клонирует (sparse-checkout, только нужные подпапки) три внешних
   репозитория рядом с `dg-node` — по умолчанию в `../dg-data/`:
   - `suttacentral/sc-data` (`sc_bilara_data/`, `structure/`) — пали-тексты
   - `dhammagift/offline-data` (`dhammagift/`) — переводы проекта
   - `dhammagift/dg` (`assets/`, `4nt/`, `config/`, `login/`, `memo/`,
     `read/`) — легаси-ассеты
2. Пересобирает симлинки `siteroot/{assets,4nt,config,login,memo,read}` и
   `siteroot/data/{suttacentral.net,dhammagift}` так, чтобы они указывали
   прямо на свежие клоны (то же самое, что делает
   `.github/workflows/build-mobile.yml` в CI, только без `sudo` и системных
   путей — эта версия предназначена для обычной разработческой машины).
3. `npm install` — и в корне `dg-node`, и в `dg-docs/` (этот docs-портал).
4. `npm run build-db` — строит скелет поиска `dg_db_light.json` из уже
   подключённых текстов.

Скрипт безопасно перезапускать: уже склонированные репозитории не трогает
(если явно не передать `--force`), симлинки просто пересоздаёт заново.

`DATA_DIR=/другой/путь ./scripts/setup.sh` — если не хочется клонировать
рядом с `dg-node`.

Дальше сервер слушает `http://localhost:3000`. Тест API:
`http://localhost:3000/search?q=kacchapa&scope=dhamma&langs=ru,en`.

Сам docs-портал (то, что вы сейчас читаете) собирается отдельно, двумя
локалями:

```bash
cd dg-docs
npm run build      # английская версия → build/
npm run build:ru   # русская версия → build-ru/
```

## Telegram-бот (`dgift_bot`)

Требуется: Python 3.9+.

```bash
git clone https://github.com/dhammagift/dgift_bot.git
cd dgift_bot
./setup.sh
```

Скрипт создаёт venv (`telegram/`), ставит зависимости
(`python-telegram-bot>=20`, `watchdog`) и заготавливает два конфига —
`config.dgift_bot.json` и `config.dhammagift_bot.json` (это один и тот же
код, две учётные записи бота под разными именами — см.
[страницу Telegram-бота](/telegram-bot)). В каждый нужно вписать настоящий
`TOKEN`. Дальше:

```bash
telegram/bin/python main.py config.dgift_bot.json
```

Для прод-варианта (systemd-сервисы, автозапуск обоих ботов) — готовый
`install_sysctl_bots.sh` в том же репозитории.

Автодополнение слов и уведомления `watcher.py` рассчитаны на соседний
запущенный `dg-node` (читают `assets/texts/...`) — при их отсутствии бот
не падает, просто эти функции молча отключаются.

## Android-приложение (`dg-twa`)

Требуется: JDK 17, Android SDK (API 36, build-tools 36.0.0).

```bash
git clone https://github.com/dhammagift/dg-twa.git
cd dg-twa
./scripts/build.sh
```

Собирает APK/AAB той же командой, что и CI
(`./gradlew app:assembleRelease`/`bundleRelease`). Результат **не
подписан** — в CI подпись накладывается отдельным шагом из секретов
(`KEYSTORE_BASE64` и т.п.), локально нужно подписать самостоятельно
(`apksigner`) перед установкой на устройство.

## Браузерное расширение (`dictPlugin`)

Сборки для Chrome и Firefox уже лежат готовыми папками в репозитории
(`browser-extention/dictLookup-extention-*-{chrome,firefox}/`) — сборочный
шаг не нужен. Для локальной проверки: `chrome://extensions` → «Режим
разработчика» → «Загрузить распакованное расширение» → выбрать нужную
папку.

## См. также

Справочник по всем эндпоинтам сайта — Swagger/OpenAPI, живёт по соседству
в этом же разделе.
