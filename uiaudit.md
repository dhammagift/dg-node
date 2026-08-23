# UX/UI аудит (apple-design), 2026-08-23

Проверено вживую через playwright-cli: лендинг/поиск, drawer-меню, ридер (dn22),
таблица результатов поиска (kacchapa) — desktop 1440×900 и mobile 390×844,
light + dark. Скриншоты: `docs/uiaudit-screenshots/`.

## 1. [Критично] Плавающие кнопки перекрывают контент на мобильном
`Play`/`Pali Eng` в ридере и `Pāli / Eng` в таблице результатов — `position:fixed`
без учёта содержимого под ними, текст/строки таблицы уезжают под кнопку и
становятся нечитаемыми/некликабельными.
- Скрин: `05-reader-mobile-dark.png` (кнопки перекрывают абзац),
  `06-results-mobile-dark.png` (кнопка перекрывает строку `thig16.1`).
- Правка — держать над кнопкой safe-зону снизу страницы:
```css
@media (max-width: 480px) {
  body, .dg-reader-content, table.dataTable { padding-bottom: 72px; }
}
```

## 2. [Критично] Фокус клавиатурой невидим
`#paliauto:focus { outline: none; }` без замены — `reader/css/index.css:108-112`
(то же в `rus-multi.css:103-109`, `uiextra.css:582-588`). Кнопка после Tab
выглядит идентично неактивной.
- Скрин: `08-focus-no-outline.png` (кнопка "Pali Eng" здесь программно
  сфокусирована — визуально никакой разницы).
- Правка:
```css
#paliauto:focus-visible {
  outline: 2px solid var(--dg-accent, #2a9d8f);
  outline-offset: 2px;
}
```

## 3. [Средне] Таблица результатов не адаптируется под мобильный
Ширины колонок фиксированные — слова переносятся посередине
(`Brahmajā / lasutta`, `Sāmañña / phalasutta`), колонка Title становится
нечитаемой узкой полосой.
- Скрин: `06-results-mobile-dark.png`.
- Правка — на мобильном схлопывать в карточки вместо таблицы, минимум —
  убрать перенос по буквам и дать колонке title больше воздуха:
```css
@media (max-width: 480px) {
  table.dataTable td { word-break: normal; overflow-wrap: anywhere; }
  table.dataTable th:nth-child(2), table.dataTable td:nth-child(2) { min-width: 55vw; }
}
```

## 4. [Средне] Тач-таргеты меньше 44px
Иконки тулбара ридера (глаз/список/чат/кроп/компас/`?`) и ссылки `Pi En` в
таблице — `home.css:302-303,519-520,550-551,586-587` (иконки 32-34px), ссылки
без padding вообще: `search/index.html:404-413`. Ряд ссылок
`DPR BJT Voice 4nt SC BB TBW` слеплен в одну строку без зазоров.
- Скрин: `05-reader-mobile-dark.png` (верхний ряд иконок и ссылка-строка).
- Правка:
```css
.dg-reader-toolbar a, .dg-icon-btn, .dg-shell-btn, .dg-qs-btn, .dg-shell-go {
  min-width: 44px; min-height: 44px;
  display: inline-flex; align-items: center; justify-content: center;
}
.dg-edition-links a { padding: 6px 8px; } /* DPR BJT Voice ... */
```

## 5. [Средне] Низкий контраст серого текста
`#999`/`#666`/`--light-gray:#8f8f8f` на светлом фоне — `public/spa/style.css:173,
180,227,239,274`, `reader/css/index.css:232`, `uiextra.css:432,1395,1418`.
Заметно на "Show all" (лендинг) и вторичном тексте в drawer-меню.
- Скрин: `01-search-desktop-light.png` ("Show all" внизу блока цитаты),
  `02-modal-desktop-light.png` (подписи `LANGUAGE`/`THEME`).
- Правка:
```css
:root { --dg-text-secondary: #6b6b6b; } /* было #999/#8f8f8f, ratio 2.8:1 → 5.4:1 */
```

## 6. [Мелочь] Модалка/drawer — плоская панель без material
Ни в одном из 5 CSS-файлов нет `backdrop-filter` — drawer заходит как чистая
непрозрачная заливка, только `box-shadow`, без ощущения "материала" поверх
контента (см. §12 apple-design).
- Скрин: `02-modal-desktop-light.png`.
- Правка:
```css
.dg-drawer, .dg-sheet {
  background: rgba(255,255,255,.82);
  backdrop-filter: blur(20px) saturate(180%);
}
:root:not([data-theme="light"]) .dg-drawer,
[data-bs-theme="dark"] .dg-drawer { background: rgba(20,20,20,.75); }
```

## 7. [Мелочь] Типографика без единой шкалы
В `home.css` ~60+ разных значений `font-size` (0.66rem…1.3rem вперемешку с px),
`letter-spacing` задан точечно в 4 местах вместо системного правила по размеру.
Заметно по разнобою заголовков/подписей на одном экране.
- Скрин: `04-reader-desktop-light.png` (три разных по кеглю подписи подряд:
  H1/подзаголовок/H2 без видимой логики шага).
- Правка — завести шкалу и использовать её везде вместо литералов:
```css
:root {
  --fs-xs: .75rem; --fs-sm: .875rem; --fs-base: 1rem;
  --fs-lg: 1.125rem; --fs-xl: 1.375rem; --fs-2xl: 1.75rem;
}
```

---
Не вошло в CSS-правки, но стоит знать: тема переключается тремя независимыми
механизмами (`body.dark`, `body.dg-skin-minimal.dark` + CSS-переменные,
`@media (prefers-color-scheme)` в `public/spa/style.css`), плюс четвёртый
`[data-theme]` в `assets/css/extrastyles.css` на проде — не одна точка
правды, любая правка контраста должна быть продублирована во все.
