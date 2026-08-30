---
slug: /dictionary
sidebar_position: 4
---

import AppFrame from '@site/src/components/AppFrame';
import DictPlatformDropdown from '@site/static/img/help/dict-platform-dropdown.png';

# Словарь

[Dict.Dhamma.Gift](https://dict.dhamma.gift) — не один словарь, а платформа:
собственная страница так и называется «Пали Мультисловарь», а её манифест
описывает её как «Pāḷi multi-dictionary combining DPD, Gandhari, PTS,
Sanskrit and Sutta-Vinaya definitions in one place». Кнопка 📘 рядом с полем
поиска открывает доступ сразу ко всем источникам — см. ниже.

Именно **DPD** (Digital Pāḷi Dictionary) — это то, что встроено во
всплывающий словарь при чтении (Alt+A, клик по слову) и в [Быстрое
окно](/quickmodal) (вкладка «Словарь»): он один, без остальной платформы,
потому что для клика по слову внутри текста нужен мгновенный ответ, а не
меню выбора источника.

<AppFrame src="/dict/ru" title="Dict.Dhamma.Gift" height={550} />

## Горячие клавиши словаря

| Клавиша | Действие |
|---|---|
| `/` | Активировать поле поиска |
| Ctrl/Alt+1 | Переключить язык интерфейса (En/Ru) |
| Ctrl/Alt+2 | Открыть Dhamma.Gift (без текущего слова) |
| Ctrl/Alt+3 | Открыть Dhamma.Gift с текущим запросом |
| Alt+T | Переключить тему |

Двойной клик по любому слову в статье — тоже поиск.

## Вся платформа сразу — кнопка 📘

<img src={DictPlatformDropdown} alt="Меню Dict.Dhamma.Gift со всеми подключёнными словарями" style={{maxWidth: 320, display: 'block', margin: '0 auto 1.5rem'}} />

- **Быстрые ссылки** — поиск через Dhamma.Gift, DharmaMitra.org.
- **Палийские словари** — PTS Dictionary, Cone (Gandhari.org), DPR Analysis,
  Critical Pali Dictionary (CPD).
- **Санскритские словари** — Monier-Williams и ещё три словаря с
  sanskrit-lexicon.uni-koeln.de (Śabda-sāgara, Apte, Macdonell), Glosbe
  Pāḷi-Sanskrit, Sanskrit Dictionary, LearnSanskrit.
- **Другие ресурсы** — WisdomLib, Google Custom Search, Aksharamukha
  (конвертер письма).

## Настройки отображения

В панели справа — размер шрифта, тёмная/светлая тема, засечки шрифта,
написание нигга̄хиты (ṃ/ṁ), сворачивание разделов грамматики/примеров/сводки
по умолчанию, режим «по одному разделу за раз» (аккордеон вместо всего
сразу), символ сандхи (’), озвучка мужским/женским голосом и показ/скрытие
ссылок на источники.

## Режим словаря при чтении

Какой именно словарь открывается по клику на слово во время чтения (Alt+A)
— настраивается отдельно, в «Быстрых настройках» приложения (значок с
ползунками рядом с полем поиска), раздел **«Словарь»**: встроенный DPD,
всплывающее окно или новое окно Dict.DG (компактное или полное), а также
DharmaMitra.org, только поиск по суттам, либо внешние приложения (DictTango,
Mdict, GoldenDict-NG).
