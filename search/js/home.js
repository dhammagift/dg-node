/* Домашний экран страницы поиска: верхняя панель, плитки, шторка со ссылками, быстрые настройки
 * (шестерёнка-молния в поле) и боковое меню.
 *
 * URL: /nodejs/res/js/home.js (маунт search/ уже есть в dg-light.js).
 *
 * Ссылки НЕ хардкожены здесь — они лежат в configs/search/menu-links.json (/nodejs/res/
 * menu-links.json) и перенесены один-в-один из боевого горизонтального меню легаси-сайта
 * (assets/common/horizontalMenu{En,Ru}.php). Этот файл только рисует их.
 *
 * Шаблонные ссылки ({{q}}/{{theme}}) отдаём легаси-функциям openWithQuery/openWithQueryMulti из
 * /assets/js/openDicts.js — они же копируют запрос в буфер обмена и показывают уведомление, ровно
 * как в старом меню. openWithQuery читает event.currentTarget, поэтому обработчик вешается на
 * КАЖДУЮ ссылку отдельно: делегирование на контейнер сломало бы его (currentTarget был бы
 * контейнером, и href проставился бы не туда).
 */
(function () {
    'use strict';

    var MENU_URL = '/nodejs/res/menu-links.json';
    var DICT_MODES_URL = '/nodejs/res/dict-modes.json';
    // Same endpoint settings/index.html's "Система письма пали" picker already reads — one
    // list of ~165 Aksharamukha scripts, not a second hardcoded array.
    var SCRIPTS_URL = '/settings/scripts.json';

    /* Порядок плиток ПО УМОЛЧАНИЮ. Пользовательский порядок (перетаскивание) хранится в
       localStorage.dgTileOrder и этот список только дополняет: ключи, которых в сохранённом
       порядке нет (новая плитка в menu-links.json), дописываются в конец, а исчезнувшие
       отбрасываются. Поэтому добавление плитки не ломает уже настроенный порядок. */
    var DEFAULT_TILE_ORDER = {
        en: ['read', 'external', 'dicts', 'materials', 'tools', 'history', 'help'],
        ru: ['read', 'external', 'russian', 'dicts', 'materials', 'tools', 'history', 'help']
    };
    var TILE_ORDER_KEY = 'dgTileOrder';

    /* Иконки — НАСТОЯЩИЕ Font Awesome, те же самые, что в боевом горизонтальном меню
       (assets/common/horizontalMenu{En,Ru}.php): fa-book-bookmark у «Читать Pāḷi», fa-book у
       наборов ссылок, fa-book-atlas у словарей, fa-graduation-cap у обучения,
       fa-screwdriver-wrench у инструментов, fa-clock-rotate-left у истории. Раньше здесь лежали
       нарисованные вручную контуры — они не совпадали ни с меню, ни друг с другом по толщине.
       Ключи оставлены прежними: на них ссылается menu-links.json. */
    var ICONS = {
        book: ['fas', 'book-bookmark'],
        bookmark: ['fas', 'book'],
        globe: ['fas', 'book'],
        dict: ['fas', 'book-atlas'],
        clock: ['fas', 'clock-rotate-left'],
        cap: ['fas', 'graduation-cap'],
        wrench: ['fas', 'screwdriver-wrench'],
        help: ['fas', 'circle-question'],
        external: ['fas', 'arrow-up-right-from-square'],
        home: ['fas', 'house'],
        gear: ['fas', 'gear'],
        sun: ['fas', 'sun'],
        star: ['fas', 'star'],
        login: ['fas', 'right-to-bracket'],
        /* Именно bolt-lightning, а не bolt: у первой верхний конец срезан ровно, и в круглом
           отверстии шестерёнки она сидит как прорезь. У обычной fa-bolt оба конца острые, и
           внутри диска она читается угловатой кляксой. */
        bolt: ['fas', 'bolt-lightning'],
        magnifier: ['fas', 'magnifying-glass'],
        bars: ['fas', 'bars'],
        moon: ['fas', 'moon'],
        circleHalf: ['fas', 'circle-half-stroke'],
        display: ['fas', 'display'],
        language: ['fas', 'language'],
        plus: ['fas', 'plus'],
        compass: ['fas', 'compass'],
        info: ['fas', 'circle-info'],
        at: ['fas', 'at'],
        sliders: ['fas', 'sliders']
    };

    /* Режимы словаря — раньше были ДВЕ вручную поддерживаемые копии этого списка (тут и
       settings/index.html), с risk'ом разъехаться при добавлении нового режима (см. историю в
       git) — теперь один файл, configs/search/dict-modes.json, обе страницы читают его.
       Фетчится там же и тогда же, что menu-links.json (см. ниже) — к моменту, когда пользователь
       реально откроет быстрые настройки и дойдёт до dictModePicker(), уже почти наверняка
       загружен; null-fallback на этот случай — просто пустой список, а не ошибка. */
    var dictModeGroups = null;
    // Same fetch-once/null-fallback pattern as dictModeGroups above, for the devanagari-mode
    // script picker (buildQuickBody).
    var scriptKeysList = null;

    /* FontAwesome на этой странице подключён скриптом (assets/js/fontawesome.6.1.all.js), но его
       наблюдатель за DOM здесь не срабатывает: <i class="fa-solid …">, созданный после загрузки,
       так и остаётся пустым элементом 0×0 (замерено). Поэтому SVG просим у библиотеки САМИ —
       FontAwesome.icon() отдаёт готовую разметку. Если библиотека почему-то не поднялась, отдаём
       обычный <i>: тогда сработает штатная замена, а в худшем случае просто не будет значка —
       но подпись рядом останется, и плитка не превратится в пустой прямоугольник. */
    function faSvg(name, cls) {
        var spec = ICONS[name] || ICONS.external;
        var FA = window.FontAwesome;
        if (FA && FA.icon) {
            var made = FA.icon({ prefix: spec[0], iconName: spec[1] });
            if (made && made.html && made.html[0]) {
                return made.html[0].replace('<svg ', '<svg class="' + (cls || '') + '" ');
            }
        }
        return '<i class="fa-solid fa-' + spec[1] + ' ' + (cls || '') + '" aria-hidden="true"></i>';
    }

    function svg(name, cls) {
        return faSvg(name, cls);
    }

    /* Звезда у важных пунктов. Раньше рисовался знак ✦ — но ромбик на этом сайте уже занят:
       им помечены скрытые ссылки-якоря на цитаты (.quoteLink-start в выдаче и ридере), и два
       разных смысла у одного значка сбивали с толку. */
    function starSvg() {
        return faSvg('star', 'dg-row-star');
    }

    /* Текст, в котором может встретиться «{{» — например, адрес со вставкой {{q}}. Кладём его
       НЕ одним текстовым узлом: dhamma-i18n.js обходит текстовые узлы страницы и всё, где есть
       «{{», считает своим ключом перевода и падает с «Missing localization key». Разрезаем строку
       так, чтобы двойная скобка никогда не оказалась целиком в одном узле — на вид разницы нет. */
    function safeText(str) {
        var frag = document.createDocumentFragment();
        String(str == null ? '' : str).split('{{').forEach(function (part, i) {
            if (i) {
                frag.appendChild(document.createTextNode('{'));
                frag.appendChild(document.createTextNode('{'));
            }
            frag.appendChild(document.createTextNode(part));
        });
        return frag;
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function t(path, fallback) {
        var cfg = window.DHAMMA_I18N && window.DHAMMA_I18N.config;
        if (!cfg) return fallback;
        var v = path.split('.').reduce(function (acc, k) { return acc == null ? undefined : acc[k]; }, cfg);
        return v === undefined ? fallback : v;
    }

    /* Язык набора ссылок — только ru/en: в горизонтальном меню легаси ровно два файла
       (horizontalMenuEn.php / horizontalMenuRu.php), тайская версия отдельной группы ссылок не
       имеет и всегда шла по английскому набору. */
    function menuLang() {
        var lang = (window.DHAMMA_I18N && window.DHAMMA_I18N.language) ||
            localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en';
        if (lang === 'ru') return 'ru';
        // Any further language (th, ...) counts once menu-links.json carries a section for it —
        // a PARTIAL one is enough, mergeMenuLang() below fills it out from en at load time.
        if (lang !== 'en' && menuData && menuData[lang]) return lang;
        return 'en';
    }

    /* menu-links.json holds full link trees only for en/ru. A new UI language (th) adds just the
       tiles' own label/desc; everything else (groups, items, icons, actions) is the English tree.
       Merged once here, right after the fetch, so the rest of this file can keep treating
       menuData[lang][key] as a complete tile. */
    function mergeMenuLang(data) {
        Object.keys(data).forEach(function (lang) {
            if (lang === 'en' || lang === 'ru' || lang.charAt(0) === '_' || !data.en) return;
            var partial = data[lang];
            var full = {};
            Object.keys(data.en).forEach(function (key) {
                full[key] = Object.assign({}, data.en[key], partial[key] || {});
            });
            data[lang] = full;
        });
        return data;
    }

    var menuData = null;
    var currentSheetKey = null;
    // Mega-menu (External tile pilot) — anchored dropdown, not the bottom sheet. Own tracking
    // vars (not currentSheetKey) since it can be open at the same time nothing else is, and a
    // star toggle inside it needs to know which tile/button to redraw against.
    var currentMegaKey = null;
    var currentMegaBtn = null;

    // Full settings page, embedded as a mobile-only slide-in sheet (owner: "настройки должны
    // выезжать как меню тайлов в мобильном, а не как отдельная страница"). Own tracking flag
    // (not currentSheetKey) — it's not a tile-menu list, it hosts the real /settings/ page in
    // an iframe, so there's exactly one settings implementation instead of two.
    var settingsSheetOpen = false;
    // True between closeSettingsSheet()'s own history.back() and the popstate it triggers.
    var settingsBackPending = false;
    var settingsPrevScrollRestoration = 'auto';
    // Something was saved from inside the settings sheet since it opened (storage events below).
    var settingsChanged = false;

    // ======================================================================
    // Состояния страницы: home / results / reader
    // ======================================================================
    var STATES = ['dg-state-home', 'dg-state-results', 'dg-state-reader'];

    function setState(name) {
        var cls = 'dg-state-' + name;
        STATES.forEach(function (s) { document.body.classList.toggle(s, s === cls); });
        if (name !== 'home') closeSheet();
        // Случайная подсказка и «зов» в заголовке — только на главной, см. applyRandomPlaceholder.
        applyRandomPlaceholder();
    }

    function currentState() {
        if (document.body.classList.contains('dg-state-reader')) return 'reader';
        if (document.body.classList.contains('dg-state-results')) return 'results';
        if (document.body.classList.contains('dg-state-toc')) return 'toc';
        return 'home';
    }

    /* Случайная подсказка в поле и «зов» в заголовке вкладки — поведение боевой главной
       (assets/js/randPlaceholder.js, там же и списки фраз). Зовём ТОЛЬКО на главной: в выдаче
       заголовок вкладки занят числом находок, а подсказка в поле не видна за введённым запросом.

       randCallToAction() запоминает текущий document.title в момент вызова и возвращает его по
       фокусу. В SPA заголовок меняется вместе с состоянием, поэтому перевызываем при каждом
       заходе на главную, а уходя — снимаем обработчики: иначе после поиска заголовок «возвращался
       бы» к домашнему.

       Порядок важен: i18n проставляет placeholder из data-i18n-placeholder, и звать это надо
       ПОСЛЕ него — иначе перевод затрёт случайную фразу. */
    function applyRandomPlaceholder() {
        if (currentState() !== 'home') {
            window.onblur = null;
            window.onfocus = null;
            return;
        }
        try {
            if (typeof window.randPlaceholderOnMain === 'function') window.randPlaceholderOnMain();
            if (typeof window.randCallToAction === 'function') window.randCallToAction();
        } catch (e) { /* нет файла или неизвестный язык — остаётся обычный placeholder */ }
    }

    // ======================================================================
    // Порядок плиток
    // ======================================================================
    function readOrderStore() {
        try { return JSON.parse(localStorage.getItem(TILE_ORDER_KEY)) || {}; }
        catch (e) { return {}; }
    }

    /* Итоговый порядок для языка: сохранённый, отфильтрованный по реально существующим плиткам,
       плюс новые в хвост. Один и тот же список задаёт и порядок кнопок, и порядок вкладок в
       шторке — по просьбе владельца они должны совпадать всегда. */
    function tileOrder() {
        var lang = menuLang();
        var known = (DEFAULT_TILE_ORDER[lang] || DEFAULT_TILE_ORDER.en).filter(function (k) {
            return !menuData || (menuData[lang] && menuData[lang][k]);
        });
        // Свои кнопки — такие же участники порядка, просто их список хранится отдельно.
        customTiles().forEach(function (c) { known.push(c.id); });
        var saved = readOrderStore()[lang];
        if (!Array.isArray(saved)) return known;
        var kept = saved.filter(function (k) { return known.indexOf(k) !== -1; });
        known.forEach(function (k) { if (kept.indexOf(k) === -1) kept.push(k); });
        return kept;
    }

    /* Данные плитки по ключу: сначала встроенные из menu-links.json, потом свои. Поверх и тех и
       других ложатся правки пользователя (подпись, значок) — см. tileOverrides(). */
    function tileData(key) {
        var lang = menuLang();
        var base = null;
        if (menuData && menuData[lang] && menuData[lang][key]) {
            // Копия, а не сам объект: правка не должна портить загруженный конфиг.
            base = Object.assign({}, menuData[lang][key]);
        } else {
            var own = customTiles().filter(function (c) { return c.id === key; })[0];
            if (own) base = { label: own.label, icon: own.icon, href: own.href, custom: true };
        }
        if (!base) return null;
        var patch = tileOverrides()[key];
        if (patch) {
            if (patch.label) base.label = patch.label;
            if (patch.icon) base.icon = patch.icon;
            if (patch.href) base.href = patch.href;
            if (patch.desc) base.desc = patch.desc;
        }
        return base;
    }

    function saveTileOrder(keys) {
        var store = readOrderStore();
        store[menuLang()] = keys;
        try { localStorage.setItem(TILE_ORDER_KEY, JSON.stringify(store)); } catch (e) { /* приватный режим */ }
    }

    /* Сброс порядка — УДАЛЕНИЕМ записи, а не записью списка по умолчанию: тогда плитки снова
       следуют за DEFAULT_TILE_ORDER, и добавленная позже кнопка встанет на своё место, а не в
       хвост зафиксированного когда-то списка. Порядок другого языка не трогаем — он настраивается
       отдельно. */
    function resetTileOrder() {
        var store = readOrderStore();
        delete store[menuLang()];
        try {
            if (Object.keys(store).length) localStorage.setItem(TILE_ORDER_KEY, JSON.stringify(store));
            else localStorage.removeItem(TILE_ORDER_KEY);
        } catch (e) { /* приватный режим */ }
    }

    /* Убранные кнопки. Отдельный ключ, а не удаление из порядка: порядок и состав — разные вещи,
       и вернуть убранное («Показать все кнопки» в боковом меню) должно быть можно, не сбивая
       расстановку. Формат намеренно простой — см. docs/HOME_TILES_PLAN.md, там же описано, во что
       он вырастет, когда появятся закреплённые ссылки и свои кнопки. */
    var TILE_HIDDEN_KEY = 'dgTilesHidden';

    function hiddenTiles() {
        try {
            var v = JSON.parse(localStorage.getItem(TILE_HIDDEN_KEY));
            return Array.isArray(v) ? v : [];
        } catch (e) { return []; }
    }

    function setHiddenTiles(list) {
        try { localStorage.setItem(TILE_HIDDEN_KEY, JSON.stringify(list)); } catch (e) { /* приватный режим */ }
        syncRestoreLink();
    }

    // ======================================================================
    // Свои кнопки
    // ======================================================================
    /* Кнопка на любой свой адрес. Хранится отдельно от порядка и от списка убранных: те работают
       с ключами встроенных плиток, а здесь нужны сами данные — подпись, адрес, значок.
       Ключ плитки — 'custom:<время создания>', он же id записи; так своя кнопка участвует в
       перетаскивании и в «убрать» наравне со встроенными, ничего не переучивая. */
    var CUSTOM_TILES_KEY = 'dgCustomTiles';

    function customTiles() {
        try {
            var list = JSON.parse(localStorage.getItem(CUSTOM_TILES_KEY));
            return Array.isArray(list) ? list : [];
        } catch (e) { return []; }
    }

    function setCustomTiles(list) {
        try {
            if (list.length) localStorage.setItem(CUSTOM_TILES_KEY, JSON.stringify(list));
            else localStorage.removeItem(CUSTOM_TILES_KEY);
        } catch (e) { /* приватный режим */ }
    }

    /* Правки встроенных кнопок: подпись и значок. Сами данные плиток приходят из menu-links.json
       и обновляются вместе с сайтом, поэтому меняем не их, а накладываем поверх — так правка
       переживёт обновление конфига, а неотредактированные поля продолжат приходить из него. */
    var TILE_OVERRIDES_KEY = 'dgTileOverrides';

    function tileOverrides() {
        try { return JSON.parse(localStorage.getItem(TILE_OVERRIDES_KEY)) || {}; }
        catch (e) { return {}; }
    }

    function setTileOverride(key, patch) {
        var all = tileOverrides();
        if (patch) all[key] = patch; else delete all[key];
        try {
            if (Object.keys(all).length) localStorage.setItem(TILE_OVERRIDES_KEY, JSON.stringify(all));
            else localStorage.removeItem(TILE_OVERRIDES_KEY);
        } catch (e) { /* приватный режим */ }
    }

    /* Значок может быть ЭМОДЗИ, а не только из набора. Рисуем его одним цветом с остальными
       значками: цветная картинка среди одноцветных контуров выбивается из ряда, а плитки должны
       читаться как один набор. Приём — grayscale + текущий цвет фоном через background-clip.
       Отличаем эмодзи от имени значка по отсутствию в ICONS. */
    function isEmojiIcon(name) {
        return !!name && !ICONS[name];
    }

    function iconHtml(name, cls) {
        if (isEmojiIcon(name)) {
            return '<span class="dg-emoji-ic ' + (cls || '') + '" aria-hidden="true">' + esc(name) + '</span>';
        }
        return faSvg(name, cls);
    }

    /* Адрес своей кнопки. Пускаем только http(s) и внутренние пути с «/». javascript: не пускаем
       никогда — это чужой код в нашей странице; data: и blob: тоже мимо. Адрес без схемы считаем
       внешним и дописываем https://, иначе «example.com» браузер понял бы как относительный путь
       и увёл на /example.com. */
    function normalizeUrl(raw) {
        var s = String(raw || '').trim();
        if (!s) return null;
        if (s.charAt(0) === '/') return s;
        if (/^https?:\/\//i.test(s)) return s;
        if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; // любая другая схема — отказ
        return 'https://' + s;
    }

    /* Порядок отличается от исходного? Сравниваем ПОСЛЕДОВАТЕЛЬНОСТЬ, а не состав: набор ключей
       после фильтрации в tileOrder() совпадает всегда, разойтись может только порядок. */
    function orderChanged() {
        var saved = readOrderStore()[menuLang()];
        if (!Array.isArray(saved)) return false;
        var def = DEFAULT_TILE_ORDER[menuLang()] || DEFAULT_TILE_ORDER.en;
        var now = tileOrder();
        return now.length !== def.length || now.some(function (k, i) { return k !== def[i]; });
    }

    /* Ссылка «вернуть как было» показывается, если сбивать есть что: убрана хоть одна кнопка ИЛИ
       переставлен порядок. Раньше она следила только за убранными, и переставленный порядок
       вернуть было нечем — приходилось перетаскивать всё обратно руками. */
    function syncRestoreLink() {
        var link = document.getElementById('dg-restore-tiles');
        if (link) {
            link.hidden = hiddenTiles().length === 0 && !orderChanged() && customTiles().length === 0;
        }
        // «Изменить кнопки» показываем всегда: переименовать можно и встроенную.
        var edit = document.getElementById('dg-edit-tiles');
        if (edit) edit.hidden = false;
    }

    // ======================================================================
    // Шторка со ссылками
    // ======================================================================
    /* Показ шторки со следующего кадра: у только что показанного (hidden=false) элемента переход
       не проигрывается, если класс поставить в том же кадре. Таймер — не подстраховка, а рабочая
       ветка: в фоновой (не отрисовываемой) вкладке requestAnimationFrame не вызывается вообще, и
       шторка не открылась бы совсем. Те же грабли уже ловили с dg-no-anim в index.html. */
    /* transparent: the quick-settings/mega popovers keep the page visible under them. Decided
       HERE, by whoever opens, never by the closers: dropping dg-transparent on close made the
       backdrop turn dark for the 0.22s of its own fade-out (owner: "экран моргает чёрным"). */
    function showLater(el, backdrop, transparent) {
        var done = false;
        var show = function () {
            if (done) return;
            done = true;
            el.classList.add('show');
            if (backdrop) {
                backdrop.classList.toggle('dg-transparent', !!transparent);
                backdrop.classList.add('show');
            }
        };
        requestAnimationFrame(show);
        setTimeout(show, 60);
    }

    function ensureBackdrop() {
        var backdrop = document.getElementById('dg-sheet-backdrop');
        if (backdrop) return backdrop;
        backdrop = document.createElement('div');
        backdrop.id = 'dg-sheet-backdrop';
        // Подложка общая для всех трёх шторок — закрываем ту, что открыта.
        backdrop.addEventListener('click', function () { closeSheet(); closeQuick(); closeMega(); closeSettingsSheet(false); });
        document.body.appendChild(backdrop);
        return backdrop;
    }

    function ensureSheet() {
        if (document.getElementById('dg-sheet')) return;
        ensureBackdrop();

        var sheet = document.createElement('div');
        sheet.id = 'dg-sheet';
        sheet.className = 'dg-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.hidden = true;
        sheet.innerHTML =
            '<div class="dg-sheet-handle"></div>' +
            '<div class="dg-sheet-head"><h2 id="dg-sheet-title"></h2>' +
            '<button type="button" class="dg-sheet-close" aria-label="' + esc(t('global.common.close', 'Close')) + '">&times;</button></div>' +
            '<div class="dg-sheet-tabs" id="dg-sheet-tabs"></div>' +
            '<div class="dg-sheet-body" id="dg-sheet-body"></div>';
        sheet.querySelector('.dg-sheet-close').addEventListener('click', closeSheet);

        document.body.appendChild(sheet);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && currentSheetKey) closeSheet();
        });
    }

    function closeSheet() {
        var sheet = document.getElementById('dg-sheet');
        var backdrop = document.getElementById('dg-sheet-backdrop');
        if (!sheet) return;
        sheet.classList.remove('show');
        if (backdrop && !isQuickOpen()) backdrop.classList.remove('show');
        currentSheetKey = null;
        document.body.classList.remove('dg-mega-compact');
        // hidden ставим после анимации ухода, иначе шторка пропадёт рывком
        setTimeout(function () { if (!currentSheetKey) sheet.hidden = true; }, 320);
    }

    function ensureSettingsSheet() {
        if (document.getElementById('dg-settings-sheet')) return;
        ensureBackdrop();
        var sheet = document.createElement('div');
        sheet.id = 'dg-settings-sheet';
        // Right-hand side panel at every width (owner: live page stays visible beside it; on a
        // narrow screen the panel simply takes the whole width) — layout lives in home.css.
        sheet.className = 'dg-sheet dg-settings-embed';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.hidden = true;
        // No header bar of its own (owner: "без двойных сеттингс") — the settings page's own header
        // row carries the close button when embedded (settings/index.html #sheetClose).
        sheet.innerHTML =
            '<div class="dg-sheet-handle"></div>' +
            '<div class="dg-sheet-body"><iframe title="' + esc(t('global.common.settings', 'Settings')) + '"></iframe></div>';
        document.body.appendChild(sheet);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && settingsSheetOpen) closeSettingsSheet(false);
        });
        // The embedded page's own back arrow (settings/index.html #backLink/#backLinkPreview,
        // both href="/") posts this instead of navigating itself when it detects it's inside a
        // parent frame — see settings/index.html. Closes the sheet exactly like our own X.
        window.addEventListener('message', function (e) {
            if (e.origin !== location.origin || !e.data) return;
            if (e.data.dgSettingsSheetClose) { closeSettingsSheet(false); return; }
            // "Download now" inside the embedded settings page. It does not navigate its own frame
            // (that would load the home page, and a second downloader, INSIDE this sheet), so it
            // asks us to collapse the sheet here: the progress card belongs to this page, and
            // public/offline/app.js listens for the same message to start the transfer.
            if (e.data.dgOfflineDownloadRequest) closeSettingsSheet(false);
        });
    }

    /* Back-button support: opening pushes a no-op history entry (same URL) so the phone's back
       gesture / browser back button collapses the sheet instead of leaving whatever page was
       open underneath it (owner: "кнопка назад должна сворачивать меню, а не вести себя как
       текущая навигация"). The shared popstate listener (routeFromUrl(), index.html) checks
       settingsSheetOpen first and calls closeSettingsSheet(true) instead of re-routing. */
    function openSettingsSheet() {
        if (settingsSheetOpen) return;
        closeMega();
        closeSheet();
        closeQuick();
        ensureSettingsSheet();
        var sheet = document.getElementById('dg-settings-sheet');
        var backdrop = document.getElementById('dg-sheet-backdrop');
        // Fresh load every time: settings can change from another tab, and a stale form (e.g.
        // mid-drag script order) should never greet the user on reopen.
        // NOT a hardcoded '/settings/': the app build rewrites the settings URL to
        // /settings/index.html (Capacitor has no directory resolution), and in the app the
        // hardcoded path made this iframe load the root index.html — the search page — inside the
        // settings sheet, where the SPA then read "settings" as a keyword and searched for it
        // ("ничего не найдено по запросу Settings", owner). The page's own settings link is the
        // one place that knows the right URL in every build (see DgTextRouter.settingsUrl).
        sheet.querySelector('iframe').src = (window.DgTextRouter && window.DgTextRouter.settingsUrl)
            ? window.DgTextRouter.settingsUrl()
            : '/settings/';
        sheet.hidden = false;
        settingsSheetOpen = true;
        settingsChanged = false;
        // While the panel is open, any back step (ours on close, or the phone's back button) must
        // not restore the scroll the browser saves with the history entry right now: the page may
        // be scrolled or re-rendered meanwhile (owner: reading place lost on close).
        settingsPrevScrollRestoration = history.scrollRestoration;
        history.scrollRestoration = 'manual';
        history.pushState({ dgSettingsSheet: true }, '', location.href);
        // Wide screens: no dimming, the page beside the panel shows setting changes live; a click
        // on it still closes the panel (shared backdrop handler). Below 768px the panel is centered
        // over a dimmed page (home.css).
        showLater(sheet, backdrop, window.matchMedia('(min-width: 768px)').matches);
    }

    /* The settings sheet is an iframe of /settings/ that saves every change to localStorage at
       once; this page hears it as a `storage` event. Text settings re-render the open reader
       right away (the page stays visible beside the side panel), keeping the reading place. */
    var READER_SETTING_KEYS = ['selectedScript', 'devanagariModeScript', 'removePunct', 'dhammaReaderLangs',
        'dhammaLanguage', 'siteLanguage', 'variantVisibility', 'mergeGathas', 'viewMode'];
    var readerRebuildTimer = null;
    window.addEventListener('storage', function (e) {
        if (!settingsSheetOpen || e.key === null) return;
        settingsChanged = true;
        if (READER_SETTING_KEYS.indexOf(e.key) === -1) return;
        if (typeof window.buildSutta !== 'function' || !window.currentReaderSlug) return;
        if (!document.body.classList.contains('dg-state-reader')) return;
        clearTimeout(readerRebuildTimer);
        readerRebuildTimer = setTimeout(rebuildReaderKeepingPlace, 250);
    });
    function rebuildReaderKeepingPlace() {
        // Remember the segment on screen, re-render the text only (same as a reader mode switch,
        // megareader.js), put the segment back. inPlace: not a new open of the text, so
        // smoothScroll.js neither scrolls nor offers "Continue reading".
        var anchor = window.captureReadingAnchor ? window.captureReadingAnchor() : null;
        Promise.resolve(window.buildSutta(window.currentReaderSlug, { inPlace: true })).then(function () {
            if (window.restoreReadingAnchor) window.restoreReadingAnchor(anchor);
        });
    }

    function closeSettingsSheet(fromPopstate) {
        // The popstate caused by our own history.back() below: swallow it. Otherwise the shared
        // popstate listener (search/index.html) saw the sheet as already closed and ran
        // routeFromUrl(), re-rendering the reader and jumping the sutta back to its top (owner).
        if (fromPopstate && settingsBackPending) {
            settingsBackPending = false;
            history.scrollRestoration = settingsPrevScrollRestoration;
            return;
        }
        if (!settingsSheetOpen) return;
        settingsSheetOpen = false;
        var sheet = document.getElementById('dg-settings-sheet');
        var backdrop = document.getElementById('dg-sheet-backdrop');
        sheet.classList.remove('show');
        if (backdrop && !isQuickOpen()) backdrop.classList.remove('show');
        setTimeout(function () { if (!settingsSheetOpen) sheet.hidden = true; }, 320);
        // Reader already re-rendered live (see the storage listener above). Results/home still
        // need one re-route to pick up changed defaults — only when something actually changed,
        // otherwise closing made the results blink for nothing (owner).
        if (settingsChanged && !document.body.classList.contains('dg-state-reader') && window.dgRouteFromUrl) window.dgRouteFromUrl();
        settingsChanged = false;
        // Consume the pushState from openSettingsSheet() so a later back-press doesn't land on
        // a phantom step — skipped when THIS close was itself caused by that back-press.
        if (!fromPopstate && history.state && history.state.dgSettingsSheet) {
            settingsBackPending = true;
            history.back(); // scrollRestoration is put back once its popstate arrives (see top)
        } else {
            history.scrollRestoration = settingsPrevScrollRestoration;
        }
    }

    /* Личные отметки пунктов мультитула (шторки Read Pāḷi/External/AI & Dicts/…) — поверх
       редакционной звезды из menu-links.json (item.star), не вместо неё: true — пользователь
       отметил сам пункт БЕЗ редакционной звезды, false — снял редакционную звезду, которая ему
       не нравится, отсутствие ключа — редакционная звезда как есть. Только localStorage, в
       облако не улетает (как и своя эмодзи-иконка кнопок — те же правила по просьбе владельца). */
    var USER_STARS_KEY = 'dgUserStars';

    function userStars() {
        try { return JSON.parse(localStorage.getItem(USER_STARS_KEY)) || {}; }
        catch (e) { return {}; }
    }

    // Идентичность пункта — сам JSON не даёт устойчивого id, поэтому берём первое, что у него
    // реально есть и не меняется между рендерами: обычный href, либо адрес-шаблон, либо подпись.
    function itemKey(item) {
        return item.href || item.tpl || item.tplMulti || item.label;
    }

    function isStarred(item) {
        var override = userStars()[itemKey(item)];
        return override === undefined ? !!item.star : override;
    }

    function toggleUserStar(item) {
        var key = itemKey(item);
        var stars = userStars();
        var next = !isStarred(item);
        // Совпало с редакционным умолчанием — запись можно убрать, а не копить лишние true/false.
        if (next === !!item.star) delete stars[key]; else stars[key] = next;
        try {
            if (Object.keys(stars).length) localStorage.setItem(USER_STARS_KEY, JSON.stringify(stars));
            else localStorage.removeItem(USER_STARS_KEY);
        } catch (e) { /* приватный режим */ }
    }

    function renderItem(item, chip) {
        var a = document.createElement('a');
        a.className = chip ? 'dg-chip' : 'dg-sheet-row';
        a.href = item.href || 'javascript:void(0)';
        if (item.title) a.title = item.title;
        if (item.blank) { a.target = '_blank'; a.rel = 'noopener'; }
        /* desc — короткое «что это такое». Проставлено пока не всем пунктам, а первым в наборе:
           по ним и видно, чем набор занимается (просьба владельца — «чтобы было нагляднее»). */
        /* Звезда — СЛЕВА от пункта, на месте обычного значка строки: она помечает сам пункт, а
           уехав в конец строки, вставала за описанием и читалась как отдельная кнопка. Значок
           «внешняя ссылка» у помеченных пунктов при этом не рисуется — двух значков в строке не
           нужно, а важность важнее. Звезда того же роста, что и обычный значок (.dg-row-star в
           home.css), и золотая — как и остальные "избранное" в проекте. */
        var starred = isStarred(item);
        a.innerHTML = chip
            ? (starred ? starSvg() : '') + esc(item.label)
            : (starred ? starSvg() : svg('external', 'dg-row-icon')) +
              '<span class="dg-row-label">' + esc(item.label) +
              (item.desc ? '<small class="dg-row-desc">' + esc(item.desc) + '</small>' : '') +
              '</span>';

        /* Долгое нажатие на пункт (звезду или саму ссылку) — свой личный тоггл звезды, поверх
           редакционной. contextmenu — тот же приём, что и у долгого нажатия в компасе (мобильный
           браузер сам шлёт это событие после долгого тапа, на десктопе это правый клик — второго
           таймера/pointerdown не требуется). Пункт при этом может вести НА ЛЮБОЕ действие
           (обычная ссылка, tpl-шаблон, action) — long-press его не заменяет, а только добавляется. */
        a.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            toggleUserStar(item);
            if (currentSheetKey) openSheet(currentSheetKey);
            else if (currentMegaKey) openMega(currentMegaKey, currentMegaBtn);
        });

        if (item.tpl) {
            // openWithQuery подставляет {{q}}/{{theme}}, ПРОПИСЫВАЕТ href в currentTarget и
            // возвращает true — дальше отрабатывает обычный переход по ссылке.
            a.addEventListener('click', function (e) {
                if (typeof window.openWithQuery === 'function') {
                    window.openWithQuery(e, item.tpl);
                } else {
                    e.preventDefault();
                    var q = (document.getElementById('paliauto') || {}).value || '';
                    var localUrl = item.tpl.replace(/{{q}}/g, encodeURIComponent(q.trim()));
                    // onlineTpl (menu-links.json, e.g. S.4nt.org → s.dhamma.gift): same local-vs-
                    // online resolution as item.localHref below, template substitution first.
                    if (item.onlineTpl && typeof window.openMirrorLink === 'function') {
                        var onlineUrl = item.onlineTpl.replace(/{{q}}/g, encodeURIComponent(q.trim()));
                        window.openMirrorLink(localUrl, onlineUrl, item.blank);
                    } else {
                        window.open(localUrl, item.blank ? '_blank' : '_self');
                    }
                }
            });
        } else if (item.tplMulti) {
            a.addEventListener('click', function (e) {
                if (typeof window.openWithQueryMulti === 'function') window.openWithQueryMulti(e, item.tplMulti);
                else e.preventDefault();
            });
        } else if (item.action === 'readPlus') {
            /* "Read+" в легаси-меню: берёт из поля первый "книга+номер" (mn129 из "mn129 sati"),
               открывает /r.php?q=<книга+номер>#<весь запрос>. Повторено как было. */
            a.addEventListener('click', function (e) {
                var raw = ((document.getElementById('paliauto') || {}).value || '').trim().toLowerCase();
                var m = raw.match(/^([a-z]+[0-9]+)/i);
                var base = m ? m[1] : raw;
                var url = item.base + '?q=' + encodeURIComponent(base) + '#' + encodeURIComponent(raw);
                if (typeof window.openWithQuery === 'function') window.openWithQuery(e, url);
                else { e.preventDefault(); window.open(url, '_blank'); }
            });
        } else if (item.setsLang) {
            // Легаси-пункт "DG (th)" ставил siteLanguage перед переходом — сохраняем поведение.
            a.addEventListener('click', function () { localStorage.setItem('siteLanguage', item.setsLang); });
        } else if (item.localHref && item.forceLocalGate) {
            // TBW specifically (item 9, owner): must follow the explicit ?force_local flag, like
            // the legacy site — not mirror-link.js's live-reachability probe just below (that's
            // for mirrors that are simply THERE-or-not; TBW is an explicit mode switch, not a
            // "happens to be reachable" check). The flag only: the app's origin is
            // https://localhost, so treating the hostname as "local mirror is here" sent app users
            // to /bw/... which the app does not bundle.
            a.addEventListener('click', function (e) {
                e.preventDefault();
                var isLocal = localStorage.getItem('forceLocal') === 'true';
                window.open(isLocal ? item.localHref : item.href, item.blank ? '_blank' : '_self');
            });
        } else if (item.localHref) {
            // Sites we also keep an offline mirror of (menu-links.json's localHref — bw/
            // theravada.ru/theravada.su, see CLAUDE.md "Публикация от корня сайта" /
            // OFFLINE_MIRRORS_ROOT): prefer the local copy when THIS server is actually serving
            // it, fall back to item.href (the real internet address) otherwise. Checked live via
            // mirror-link.js, not guessed from hostname — the packaged mobile app's WebView is
            // also "localhost" but never bundles these (too heavy).
            a.addEventListener('click', function (e) {
                e.preventDefault();
                if (typeof window.openMirrorLink === 'function') window.openMirrorLink(item.localHref, item.href);
                else window.open(item.href, item.blank ? '_blank' : '_self');
            });
        } else if (item.hideIfUnavailable) {
            // Archived/legacy content with no online equivalent to fall back to (e.g. "Legacy"
            // suttacentral.net — a snapshot of SC's old UI that isn't live anywhere anymore): if
            // this server isn't actually serving item.href, hide the link instead of offering a
            // dead one. Live check, not a hostname guess — same reasoning as mirror-link.js.
            if (typeof window.checkMirrorReachable === 'function') {
                window.checkMirrorReachable(item.href).then(function (ok) { if (!ok) a.style.display = 'none'; });
            }
        }
        return a;
    }

    /* Действие плитки: у одних свой список (шторка), у других — прямое действие. Одна функция на
       оба места, где плитка встречается: сама кнопка и вкладка в шапке шторки. */
    function runTile(key, anchorEl) {
        var tile = tileData(key);
        if (!tile) return;

        // Toggle: clicking the tile whose own mega/sheet is ALREADY open closes it (with the
        // normal closing animation) instead of re-opening the same content — owner: "при
        // повторном нажатии на иконку мегаменю должно закрываться с обратной анимацией, а то
        // сейчас нужно кликать в пустоту". closeMega()/closeSheet() are the existing close paths
        // (CSS transition, then hidden after it finishes) — reused as-is, not reimplemented.
        if (tile.groups) {
            if (isMegaOpen() && currentMegaKey === key) { closeMega(); return; }
            if (currentSheetKey === key) { closeSheet(); return; }
        }

        // Owner (live bug, screenshot): clicking "Помощь" while a mega-menu (e.g. "Обучение")
        // was still open showed the bootstrap Help modal ON TOP of it without closing it first —
        // this was ALWAYS true (tile.modal==='help' below never closed anything), just masked
        // before by the shared backdrop needing a first click to close whatever was open before
        // a second click could even reach a different tile (see .dg-tile's z-index comment,
        // home.css). Now that a tile click reaches its handler directly, this latent gap
        // surfaced immediately. Close mega/sheet before any branch below opens something new.
        // Quick settings excluded on purpose — toggleQuickModal() below is its own toggle;
        // closing it here first would make it always open, never close, from this tile.
        closeMega();
        closeSheet();

        if (tile.groups) {
            // "mega": true (menu-links.json) opts a tile into the anchored multi-column
            // dropdown (External pilot) instead of the full-screen bottom sheet — desktop only
            // (owner: "на мобильной версии... мега меню выглядит очень плохо" — the multi-column
            // layout has nowhere to go on a narrow screen; mobile keeps the plain sheet exactly
            // as it worked before the mega menu existed). 768px matches .dg-sheet's own
            // desktop breakpoint (home.css). Also needs an anchor button — clicked from the tab
            // strip inside another tile's open sheet, there's no anchor point, so it falls back
            // to the plain sheet there too.
            if (tile.mega && anchorEl && window.innerWidth >= 768) openMega(key, anchorEl);
            else openSheet(key);
            return;
        }
        if (tile.modal === 'quick') {
            /* История своей шторки не имеет: она и так есть в quickModal (компас,
               Cattāri Ariyasaccāni) — там же живут недавние запросы. */
            if (typeof window.toggleQuickModal === 'function') { window.toggleQuickModal(); return; }
        }
        if (tile.modal === 'help') {
            // Помощь мультитула (эта плитка сама и есть мультитул) — ведёт на его собственную
            // страницу в доках, не на общую bootstrap-модалку выдачи (#SearchResultHelp, для
            // неё уже есть свой Help-путь в тулбаре/дровере — см. dgDrawerHelpHref() в index.html,
            // у него для главной страницы отдельная цель — Key Features).
            var ru = menuLang() === 'ru';
            window.open((ru ? '/ru/docs/' : '/docs/') + 'multitool', '_blank');
            return;
        }
        if (tile.href) {
            var finalHref = tile.custom ? fillTemplate(tile.href) : tile.href;
            // Internal routes (e.g. "Read Pāḷi" → /toc) go through the SPA router in place —
            // dgNavigateInternal (search/index.html) already checks same-origin and no-ops
            // (returns false) for anything it can't handle, so external/legacy tiles still fall
            // through to a normal full navigation exactly as before (owner: "почему это работает
            // не в спа режиме, а с перезагрузкой" — a full reload for an in-app route).
            if (typeof window.dgNavigateInternal === 'function' && window.dgNavigateInternal(finalHref)) return;
            window.location.href = finalHref;
        }
    }

    /* Подстановка в адрес своей кнопки — те же {{q}} и {{theme}}, что у ссылок меню: именно они
       превращают чужой сайт в продолжение поиска, а не в простую закладку. Своя реализация, а не
       openWithQuery из /assets/js/openDicts.js: та работает от события и правит href элемента, а
       здесь ни события, ни ссылки нет — плитка это <button>. */
    function fillTemplate(tpl) {
        var q = (document.getElementById('paliauto') || {}).value || '';
        return String(tpl)
            .replace(/\{\{\s*q\s*\}\}/g, encodeURIComponent(q))
            .replace(/\{\{\s*theme\s*\}\}/g, localStorage.getItem('theme') || 'light');
    }

    /* One tile group (name + its items/blocks/chips) into any container — the bottom sheet
       (openSheet) and the burger's multitool section (renderDrawerTiles) share it. */
    function renderGroupInto(container, g) {
            var h = document.createElement('p');
            h.className = 'dg-group-title';
            h.textContent = g.name;
            container.appendChild(h);

            /* "blocks" — same shape openMega() reads (menu-links.json's External "Collections":
               several real prod clusters under one header, e.g. SC/Vinaya/Voice/Legacy with no
               header of their own — just a quiet rule above them via block.divider). Groups
               without "blocks" fall through to the plain items/chips rendering below, unchanged. */
            if (g.blocks) {
                g.blocks.forEach(function (block) {
                    var blockWrap = document.createElement('div');
                    blockWrap.className = block.divider ? 'dg-mega-block dg-mega-block-divider' : 'dg-mega-block';
                    if (block.inline) {
                        var line = document.createElement('div');
                        line.className = 'dg-chip-group';
                        block.inline.forEach(function (item) { line.appendChild(renderItem(item, true)); });
                        blockWrap.appendChild(line);
                    } else {
                        (block.rows || []).forEach(function (item) { blockWrap.appendChild(renderItem(item)); });
                    }
                    container.appendChild(blockWrap);
                });
                return;
            }

            /* "layout": "chips" — группа рисуется вплотную, в одну-две строки, а не столбцом
               полноразмерных строк. Так помечены наборы с короткими самоочевидными подписями
               (ИИ, переводчики, коды изданий): четыре имени вроде Gemini или DeepSeek не стоят
               четырёх строк на весь экран. */
            if (g.layout === 'chips') {
                var wrap = document.createElement('div');
                wrap.className = 'dg-chip-group';
                g.items.forEach(function (item) { wrap.appendChild(renderItem(item, true)); });
                container.appendChild(wrap);
                return;
            }
            g.items.forEach(function (item) { container.appendChild(renderItem(item)); });
    }

    function openSheet(key) {
        closeMega();
        ensureSheet();
        var data = menuData[menuLang()];
        var tile = data[key];
        if (!tile) return;

        currentSheetKey = key;
        var sheet = document.getElementById('dg-sheet');
        var backdrop = document.getElementById('dg-sheet-backdrop');
        sheet.hidden = false;
        sheet.classList.remove('dg-wide');
        sheet.classList.remove('dg-about-sheet');

        document.getElementById('dg-sheet-title').textContent = tile.label;

        /* Вкладки — ВСЕ плитки и в том же порядке, что кнопки на главной. Раньше здесь были
           только те, у кого есть список, и шторка выглядела произвольным подмножеством кнопок:
           она ведь и задумана как замена кнопкам, а не как отдельный набор. Плитки без списка
           (Читать Pāḷi, История) — это ссылка/действие, а не набор: их вкладка помечена стрелкой
           (.dg-tab-link) и сразу выполняет действие, а не переключает список. */
        var tabsHost = document.getElementById('dg-sheet-tabs');
        tabsHost.innerHTML = '';
        tileOrder().forEach(function (k) {
            var td = data[k];
            if (!td) return;
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = td.label;
            if (!td.groups) b.className = 'dg-tab-link';
            else if (k === key) b.className = 'on';
            b.addEventListener('click', function () { runTile(k); });
            tabsHost.appendChild(b);
        });

        var body = document.getElementById('dg-sheet-body');
        body.innerHTML = '';
        body.className = 'dg-sheet-body';
        var groups = tile.groups || [];
        if (!groups.length) {
            body.innerHTML = '<p class="dg-sheet-empty">' + esc(t('home.noItems', 'Пока пусто')) + '</p>';
        }
        groups.forEach(function (g) { renderGroupInto(body, g); });

        // Owner: "на мобильной так же, как на десктопе — при открытии тайла инпут наверх, плитки
        // прижимаются". Тот же приём, что openMega() уже делает (dg-mega-compact сжимает зазоры
        // над рядом плиток, scrollForMega() подкручивает страницу до поля ввода) — CSS не завязан
        // на ширину экрана, только JS-вызов раньше был только в openMega().
        document.body.classList.add('dg-mega-compact');
        showLater(sheet, backdrop);
        scrollForMega();
    }

    // ======================================================================
    // Быстрые настройки (шестерёнка-молния в поле)
    // ======================================================================

    /* Кнопка собирается кодом, а не разметкой: она должна быть одинаковой на КАЖДОЙ странице с
       полем ввода (поиск, чтение — и всё, что появится дальше). Шестерёнка = настройки, молния =
       «быстрые»: она отличает их от ПОЛНЫХ настроек (/settings/, шестерёнка без молнии) и она же
       держит на виду idaṁ dukkhaṁ — поэтому кнопка и живёт в поле, а не прячется в меню.
       Контуры — gear и bolt (FontAwesome-подобные), инлайном: иконочный шрифт на этой странице
       часть значков не разворачивает (см. историю с лупой в index.html). */
    var GEAR_PATH = 'M12 15.4a3.4 3.4 0 100-6.8 3.4 3.4 0 000 6.8z' +
        'M19.3 13.4a7.4 7.4 0 000-2.8l1.9-1.5-1.9-3.3-2.3 1a7.4 7.4 0 00-2.4-1.4L14.2 3h-3.8l-.4 2.4' +
        'a7.4 7.4 0 00-2.4 1.4l-2.3-1-1.9 3.3 1.9 1.5a7.4 7.4 0 000 2.8l-1.9 1.5 1.9 3.3 2.3-1' +
        'a7.4 7.4 0 002.4 1.4l.4 2.4h3.8l.4-2.4a7.4 7.4 0 002.4-1.4l2.3 1 1.9-3.3z';
    var BOLT_PATH = 'M13 2 4 14h6l-1 8 9-12h-6l1-8z';

    /* Шестерёнка с молнией. Молния лежит В ЦЕНТРЕ шестерёнки, а не в углу значка: у fa-gear
       середина пустая, молния туда садится ровно и читается как одна иконка, а не как значок с
       налепленным сбоку вторым. Обе — из того же набора, что и всё меню (fa-gear, fa-bolt). */
    /* Слайдеры, не шестерёнка — рядом с полем уже есть настоящая шестерёнка (/settings/, полные
       настройки) и ещё одна в шапке компаса (словарь). Три шестерёнки подряд путали, какая для
       чего (просьба владельца). Прежний вариант — шестерёнка с молнией-прорезью — тоже была
       шестерёнкой, просто с накладкой; sliders однозначно читается как "быстрые настройки", без
       накладного диска-молнии (.dg-qs-bolt), он был частью именно гексагонной композиции. */
    // Hardcoded, not faSvg('sliders', ...): the FontAwesome KIT (kit.fontawesome.com, loaded on
    // any real hostname — faSvg()'s offline branch only ever fires on localhost/LAN IPs, so this
    // was never caught testing locally) is configured for the CSS/webfont method, not SVG+JS —
    // window.FontAwesome.icon() doesn't exist there, so faSvg() silently fell back to a plain
    // <i class="fa-solid fa-sliders"> text glyph. Rotating a FONT GLYPH 90deg via CSS transform
    // doesn't center the way an SVG viewBox does — glyphs carry asymmetric left/right bearing
    // baked into the font design, which is exactly the visible off-center icon the owner
    // screenshotted on the live site. Embedding the real fa-sliders SVG path directly guarantees
    // the same properly-centered <svg> everywhere, independent of which FontAwesome loading
    // method happens to be configured. Path copied verbatim from FA 6's solid "sliders" glyph.
    function quickButtonHtml() {
        return '<svg class="dg-qs-gear" aria-hidden="true" focusable="false" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">' +
            '<path fill="currentColor" d="M0 416C0 398.3 14.33 384 32 384H86.66C99 355.7 127.2 336 160 336C192.8 336 220.1 355.7 233.3 384H480C497.7 384 512 398.3 512 416C512 433.7 497.7 448 480 448H233.3C220.1 476.3 192.8 496 160 496C127.2 496 99 476.3 86.66 448H32C14.33 448 0 433.7 0 416V416zM192 416C192 398.3 177.7 384 160 384C142.3 384 128 398.3 128 416C128 433.7 142.3 448 160 448C177.7 448 192 433.7 192 416zM352 176C384.8 176 412.1 195.7 425.3 224H480C497.7 224 512 238.3 512 256C512 273.7 497.7 288 480 288H425.3C412.1 316.3 384.8 336 352 336C319.2 336 291 316.3 278.7 288H32C14.33 288 0 273.7 0 256C0 238.3 14.33 224 32 224H278.7C291 195.7 319.2 176 352 176zM384 256C384 238.3 369.7 224 352 224C334.3 224 320 238.3 320 256C320 273.7 334.3 288 352 288C369.7 288 384 273.7 384 256zM480 64C497.7 64 512 78.33 512 96C512 113.7 497.7 128 480 128H265.3C252.1 156.3 224.8 176 192 176C159.2 176 131 156.3 118.7 128H32C14.33 128 0 113.7 0 96C0 78.33 14.33 64 32 64H118.7C131 35.75 159.2 16 192 16C224.8 16 252.1 35.75 265.3 64H480zM160 96C160 113.7 174.3 128 192 128C209.7 128 224 113.7 224 96C224 78.33 209.7 64 192 64C174.3 64 160 78.33 160 96z"></path>' +
            '</svg>';
    }

    /* Область поиска. Ключ и формат — те же, что у полных настроек (/settings/): список
       id-префиксов через запятую, отсутствие ключа = набор по умолчанию. Здесь только крупные
       наборы: быстрые настройки отвечают на «где искать вот это», подробный разбор по книгам
       живёт в полных. Коды и их состав не выдуманы — скопированы из settings/index.html. */
    /* Никаи — по одной: «где искать» чаще всего означает именно «в DN или в MN», а не «во всех
       четырёх сразу». Остальное — крупными наборами, подробный разбор по книгам живёт в полных
       настройках. */
    /* Область поиска. Названия и разбиение — ТЕ ЖЕ, что в полных настройках (settings/index.html,
       SCOPE_BOOKS / KN_DEFAULT_BOOKS / SCOPE_GROUPS): один и тот же набор, названный в двух местах
       по-разному, читается как два разных набора. Поэтому здесь «Дигха Никая», а не «DN · Дигха»,
       а Кхуддака и Виная — группы с раскрывающимся списком, а не плоские пункты.

       Группа = родительская галка + под-пункты. Родительская включает и выключает все коды группы
       разом; если отмечена только часть, она в промежуточном состоянии (indeterminate) — так же,
       как в полных настройках.

       Абхидхамма сюда НЕ входит намеренно: её включают один раз и надолго, место такой галочки —
       в полных настройках. Уже включённую там мы не трогаем: writeScope() правит только свои коды.
       «Вся Кхуддака» одной галкой (код 'khudakka') тоже убрана: рядом с шестью книгами той же
       Кхуддаки она сбивала счёт — непонятно, что включено, книги или категория целиком. */
    var SCOPE_GROUPS = [
        {
            label: 'quick.scope.nikayas', fallback: '4 Никаи',
            items: [
                { codes: ['dn'], label: 'quick.scope.dn', fallback: 'Дигха Никая' },
                { codes: ['mn'], label: 'quick.scope.mn', fallback: 'Маджхима Никая' },
                { codes: ['sn'], label: 'quick.scope.sn', fallback: 'Саньютта Никая' },
                { codes: ['an'], label: 'quick.scope.an', fallback: 'Ангуттара Никая' }
            ]
        },
        {
            /* Кхуддака ЦЕЛИКОМ, все двадцать книг, как в полных настройках. Первыми — шесть,
               включённых по умолчанию, следом остальные. Родительская галка поэтому стоит
               полуотмеченной: сразу видно, что часть Кхуддаки уже в поиске, а остальное можно
               добрать. Оставить в списке только эти шесть было ошибкой — тогда группа выглядела
               включённой целиком, и добрать Джатаки или Милиндапаньху было негде. */
            label: 'quick.scope.kn', fallback: 'Кхуддака Никая',
            items: [
                { codes: ['iti'], label: 'quick.scope.iti', fallback: 'Итивуттака' },
                { codes: ['ud'], label: 'quick.scope.ud', fallback: 'Удана' },
                { codes: ['snp'], label: 'quick.scope.snp', fallback: 'Сутта Нипата' },
                { codes: ['dhp'], label: 'quick.scope.dhp', fallback: 'Дхаммапада' },
                { codes: ['thag'], label: 'quick.scope.thag', fallback: 'Тхерагатха' },
                { codes: ['thig'], label: 'quick.scope.thig', fallback: 'Тхеригатха' },
                { codes: ['ja'], label: 'quick.scope.ja', fallback: 'Джатаки' },
                { codes: ['tha-ap'], label: 'quick.scope.thaAp', fallback: 'Тхера-ападана' },
                { codes: ['mil'], label: 'quick.scope.mil', fallback: 'Милиндапаньха' },
                { codes: ['thi-ap'], label: 'quick.scope.thiAp', fallback: 'Тхери-ападана' },
                { codes: ['vv'], label: 'quick.scope.vv', fallback: 'Виманаваттху' },
                { codes: ['pv'], label: 'quick.scope.pv', fallback: 'Петаваттху' },
                { codes: ['cp'], label: 'quick.scope.cp', fallback: 'Чарьяпитака' },
                { codes: ['bv'], label: 'quick.scope.bv', fallback: 'Буддхавамса' },
                { codes: ['ps'], label: 'quick.scope.ps', fallback: 'Патисамбхидамагга' },
                { codes: ['ne'], label: 'quick.scope.ne', fallback: 'Неттипакарана' },
                { codes: ['cnd'], label: 'quick.scope.cnd', fallback: 'Чуланиддеса' },
                { codes: ['mnd'], label: 'quick.scope.mnd', fallback: 'Маханиддеса' },
                { codes: ['kp'], label: 'quick.scope.kp', fallback: 'Кхуддакапатха' },
                { codes: ['pe'], label: 'quick.scope.pe', fallback: 'Петакопадеса' }
            ]
        },
        {
            label: 'quick.scope.vinaya', fallback: 'Виная',
            items: [
                { codes: ['pli-tv-bi', 'pli-tv-bu'], label: 'quick.scope.vibhanga', fallback: 'Вибханга' },
                { codes: ['pli-tv-kd'], label: 'quick.scope.khandhaka', fallback: 'Кхандхака' },
                { codes: ['pli-tv-pvr'], label: 'quick.scope.parivara', fallback: 'Паривара' }
            ]
        }
    ];
    // Все коды группы — для родительской галки. Считается один раз, а не на каждую перерисовку.
    SCOPE_GROUPS.forEach(function (g) {
        g.codes = g.items.reduce(function (all, it) { return all.concat(it.codes); }, []);
    });
    var DEFAULT_SCOPE = ['dn', 'mn', 'sn', 'an', 'iti', 'ud', 'snp', 'dhp', 'thag', 'thig'];

    function readScope() {
        var raw = localStorage.getItem('dhammaSearchScope');
        if (!raw) return DEFAULT_SCOPE.slice();
        return raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }

    function writeScope(list) {
        var isDefault = list.length === DEFAULT_SCOPE.length &&
            DEFAULT_SCOPE.every(function (c) { return list.indexOf(c) !== -1; });
        if (isDefault) localStorage.removeItem('dhammaSearchScope');
        else localStorage.setItem('dhammaSearchScope', list.join(','));
    }

    function toggleRow(label, on, onChange, hotkey) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'dg-toggle-row';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        // Owner: "нужно чтобы это было видимо пользователю что есть горячие клавиши" — the
        // actual Alt+key each of these three already responds to (megareader.js's Alt+V for
        // variants, settings.js's Alt+C for columns and Alt+. for punctuation), just never shown.
        b.innerHTML = '<span class="dg-toggle-label">' + esc(label) +
            (hotkey ? ' <span class="dg-toggle-hotkey">' + esc(hotkey) + '</span>' : '') + '</span>' +
            '<span class="dg-tgl" aria-hidden="true"></span>';
        b.addEventListener('click', function () {
            var next = b.getAttribute('aria-pressed') !== 'true';
            b.setAttribute('aria-pressed', next ? 'true' : 'false');
            onChange(next);
        });
        return b;
    }

    function groupTitle(text) {
        var p = document.createElement('p');
        p.className = 'dg-group-title';
        p.textContent = text;
        return p;
    }

    // Пояснение под настройкой: что она делает, если из подписи это не очевидно.
    function note(text) {
        var p = document.createElement('p');
        p.className = 'dg-qs-note';
        p.textContent = text;
        return p;
    }

    function segmented(options, activeValue, onPick) {
        var wrap = document.createElement('div');
        wrap.className = 'dg-segmented';
        options.forEach(function (opt) {
            var b = document.createElement('button');
            b.type = 'button';
            // Значок перед подписью — если он у варианта задан (сейчас это темы).
            b.innerHTML = (opt.icon ? faSvg(opt.icon, 'dg-seg-ic') : '') +
                '<span>' + esc(opt.label) + '</span>';
            b.setAttribute('aria-pressed', String(opt.value === activeValue));
            b.addEventListener('click', function () {
                Array.prototype.forEach.call(wrap.querySelectorAll('button'), function (x) {
                    x.setAttribute('aria-pressed', String(x === b));
                });
                onPick(opt.value);
            });
            wrap.appendChild(b);
        });
        return wrap;
    }

    // issue #4: dict-modes.json groups no longer duplicate every DPD mode per dictionary
    // language (dictGroupEn/dictGroupRu merged into dictGroupDpd, hasLangToggle:true) — the
    // mode+lang <-> localStorage.selectedDict string conversion lives in
    // /assets/js/dict-mode-shared.js (window.DictModeShared), shared with settings/index.html's
    // renderDictMode() (used to be a hand-copied pair of implementations).

    /* Тот же список режимов, что и на /settings/ (dict-modes.json) — переиспользуем select, не
       делаем свою версию. Выбор пишется в тот же localStorage.selectedDict, что читает
       settings/index.html и paliLookup.js — общий ключ, значит смена в любом месте видна везде. */
    function dictModePicker() {
        var wrap = document.createElement('div');

        var select = document.createElement('select');
        select.className = 'dg-field-input dg-dict-select';
        var current = localStorage.getItem('selectedDict') || 'standalone';
        var split = DictModeShared.splitValue(dictModeGroups, current);
        var ru = menuLang() === 'ru';
        var dictLang = split.lang || (ru ? 'ru' : 'en');
        (dictModeGroups || []).forEach(function (g) {
            var group = document.createElement('optgroup');
            group.label = ru ? g.labelRu : g.labelEn;
            g.options.forEach(function (o) {
                var opt = document.createElement('option');
                opt.value = o.value;
                opt.textContent = ru ? o.ru : o.en;
                if (o.value === split.mode) opt.selected = true;
                group.appendChild(opt);
            });
            select.appendChild(group);
        });
        wrap.appendChild(select);

        function saveAndApply() {
            var value = DictModeShared.composeValue(dictModeGroups, select.value, dictLang);
            localStorage.setItem('selectedDict', value);
            // paliLookup.js грузится лениво (по первому клику по слову) — если он уже загружен,
            // применяем смену немедленно через тот же applyDictConfig, что и /settings/; если
            // ещё нет, dg_loadDictionaryScripts() сам его подтянет и применит текущий localStorage
            // при инициализации, отдельно звать applyDictConfig не нужно.
            if (typeof window.applyDictConfig === 'function') {
                window.applyDictConfig(value);
            } else if (typeof window.dg_loadDictionaryScripts === 'function') {
                window.dg_loadDictionaryScripts();
            }
            notifySaved();
        }

        var langSeg = segmented([
            { value: 'en', label: 'En' },
            { value: 'ru', label: 'Ru' }
        ], dictLang, function (lang) {
            dictLang = lang;
            saveAndApply();
        });
        var initialGroup = DictModeShared.groupFor(dictModeGroups, select.value);
        langSeg.hidden = !(initialGroup && initialGroup.hasLangToggle);
        wrap.appendChild(langSeg);

        select.addEventListener('change', function () {
            var g = DictModeShared.groupFor(dictModeGroups, select.value);
            langSeg.hidden = !(g && g.hasLangToggle);
            saveAndApply();
        });

        return wrap;
    }

    function ensureQuick() {
        if (document.getElementById('dg-quick')) return;
        ensureBackdrop();
        var sheet = document.createElement('div');
        sheet.id = 'dg-quick';
        sheet.className = 'dg-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.hidden = true;
        sheet.innerHTML =
            '<div class="dg-sheet-handle"></div>' +
            '<div class="dg-sheet-head"><h2 id="dg-quick-title"></h2>' +
            '<button type="button" class="dg-sheet-close" aria-label="' + esc(t('global.common.close', 'Close')) + '">&times;</button></div>' +
            '<div class="dg-sheet-body" id="dg-quick-body"></div>';
        sheet.querySelector('.dg-sheet-close').addEventListener('click', closeQuick);
        document.body.appendChild(sheet);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isQuickOpen()) closeQuick();
        });
    }

    function isQuickOpen() {
        var q = document.getElementById('dg-quick');
        return !!(q && q.classList.contains('show'));
    }

    function closeQuick() {
        var sheet = document.getElementById('dg-quick');
        var backdrop = document.getElementById('dg-sheet-backdrop');
        var btn = document.getElementById('dg-quick-btn');
        if (!sheet) return;
        sheet.classList.remove('show');
        if (backdrop && !currentSheetKey) backdrop.classList.remove('show');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        setTimeout(function () { if (!isQuickOpen()) sheet.hidden = true; }, 320);
    }

    /* Наполнение зависит от состояния страницы — в этом и смысл «быстрых» настроек: на главной
       спрашивают «где и как искать», в выдаче добавляется вид уже показанного, в чтении речь
       пойдёт о самом тексте. Поэтому тело перерисовывается при каждом открытии, а не один раз. */
    /* Область поиска — список галок, устроенный так же, как в полных настройках: три группы, у
       каждой родительская галка и раскрывающийся список под-пунктов. Переключателей здесь нет:
       переключатель означает «включить режим», а тут выбирают из набора, где обычно отмечено
       почти всё. Свёрнутые группы показывают, что именно выбрано, — чаще всего этого достаточно
       и разворачивать не приходится. */
    function scopePicker() {
        var wrap = document.createElement('div');
        wrap.className = 'dg-scope';

        SCOPE_GROUPS.forEach(function (g) {
            var group = document.createElement('div');
            group.className = 'dg-scope-group';

            var head = document.createElement('div');
            head.className = 'dg-scope-head';

            /* Родительская галка. Её состояние считается по под-пунктам: все отмечены — стоит,
               часть — промежуточное (indeterminate), ни одного — снята. Клик по ней ставит или
               снимает всю группу разом. */
            var parent = document.createElement('input');
            parent.type = 'checkbox';
            parent.className = 'dg-check';

            var label = document.createElement('label');
            label.className = 'dg-scope-label';
            label.textContent = t(g.label, g.fallback);
            // Клик по подписи бьёт по родительской галке, а не разворачивает список.
            label.addEventListener('click', function () { parent.click(); });

            var count = document.createElement('span');
            count.className = 'dg-scope-count';

            var toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'dg-scope-toggle';
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', t('quick.scopeExpand', 'Показать состав'));
            toggle.innerHTML = '<svg class="dg-scope-chev" viewBox="0 0 24 24" width="14" height="14" ' +
                'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
                'stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

            var list = document.createElement('div');
            list.className = 'dg-scope-list';
            list.hidden = true;

            var boxes = [];

            function syncParent() {
                var on = boxes.filter(function (b) { return b.checked; }).length;
                parent.checked = on === boxes.length;
                parent.indeterminate = on > 0 && on < boxes.length;
                count.textContent = on + '/' + boxes.length;
                group.classList.toggle('dg-some', on > 0);
            }

            g.items.forEach(function (item) {
                var row = document.createElement('label');
                row.className = 'dg-check-row';

                var box = document.createElement('input');
                box.type = 'checkbox';
                box.className = 'dg-check';
                box.checked = item.codes.every(function (c) { return readScope().indexOf(c) !== -1; });
                box.addEventListener('change', function () {
                    applyCodes(item.codes, box.checked);
                    syncParent();
                });

                var text = document.createElement('span');
                text.textContent = t(item.label, item.fallback);

                row.appendChild(box);
                row.appendChild(text);
                list.appendChild(row);
                boxes.push(box);
            });

            parent.addEventListener('change', function () {
                var next = parent.checked;
                boxes.forEach(function (b) { b.checked = next; });
                applyCodes(g.codes, next);
                syncParent();
            });

            toggle.addEventListener('click', function () {
                var open = list.hidden;
                list.hidden = !open;
                toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
                group.classList.toggle('dg-open', open);
            });

            head.appendChild(parent);
            head.appendChild(label);
            head.appendChild(count);
            head.appendChild(toggle);
            group.appendChild(head);
            group.appendChild(list);
            wrap.appendChild(group);

            syncParent();
        });

        return wrap;
    }

    // Включить или выключить набор кодов в сохранённой области поиска.
    function applyCodes(codes, on) {
        var list = readScope();
        codes.forEach(function (c) {
            var i = list.indexOf(c);
            if (on && i === -1) list.push(c);
            if (!on && i !== -1) list.splice(i, 1);
        });
        writeScope(list);
        notifySaved();
        renderScopeSummary();
    }

    /* Строка "N Никаи · M КН" под полем поиска (production-v4 redesign,
       docs/Home-standalone.html) — те же SCOPE_GROUPS/readScope(), что у scopePicker() выше,
       просто счётчик вместо чекбоксов: сколько пунктов группы сейчас включено в поиск. Группа
       без единого включённого пункта (Виная по умолчанию) в строке не показывается — нулю
       незачем занимать место. "Изменить" открывает ту же шторку, что и обычная шестерёнка
       быстрых настроек (#dg-quick-btn) — свою логику открытия не заводим. */
    var SCOPE_SUMMARY_SHORT = {
        'quick.scope.nikayas': ['home.scopeNikayas', 'Никаи'],
        'quick.scope.kn': ['home.scopeKn', 'КН'],
        'quick.scope.vinaya': ['home.scopeVinaya', 'Виная']
    };
    /* Corner language pill of the reader (owner, production-v4 mock): "Pāḷi | <main language>"
       as two independent toggles instead of the old single button that cycled pli→pli+2nd→2nd,
       plus a six-dot "more" button that appears only when the text carries more than one
       translation language (it opens the burger's reading modes, where the extra languages
       live). Drives the SAME state as before — localStorage paliToggle + window.setLanguage()
       (megareader.js showPali/showEnglish/showPaliAndTranslation) — so Alt+Z and the hidden
       #language-button keep working; the pill just re-reads the state after them. At least one
       text stays on: switching off the last lit segment lights the other one (reference). */
    var LANG_LABEL = { ru: 'Рус', en: 'En', th: 'ไทย', de: 'De', fr: 'Fr', es: 'Es', it: 'It', pt: 'Pt', pl: 'Pl', cs: 'Cs', si: 'Si', my: 'My', vi: 'Vi', id: 'Id', jp: 'Jp', zh: 'Zh', hi: 'Hi', bn: 'Bn', lt: 'Lt', nl: 'Nl', sv: 'Sv', fi: 'Fi', no: 'No', hu: 'Hu', ro: 'Ro', sr: 'Sr', sl: 'Sl', uk: 'Uk', kn: 'Kn', ta: 'Ta' };
    // Memorize/devanagari: the second line isn't a translation (it's Pali too — the full
    // untransformed reference text for memorize, the ISO/Latin line for devanagari), so an
    // "Ru"/"En" language label there is just wrong, not merely mistranslated. Owner: show one
    // button, no language label at all.
    var SECOND_LINE_LABEL = {
        memorize: { ru: 'Полн.', en: 'Hint' },
        devanagari: { ru: 'Лат.', en: 'Lat.' }
    };
    var LANG_FULL_NAME = { ru: 'Русский', en: 'English', th: 'ไทย', de: 'Deutsch', fr: 'Français', es: 'Español', it: 'Italiano', pt: 'Português', pl: 'Polski', cs: 'Čeština', si: 'Sinhala', my: 'Myanmar', vi: 'Tiếng Việt', id: 'Indonesia', jp: '日本語', zh: '中文', hi: 'हिन्दी', bn: 'বাংলা', lt: 'Lietuvių', nl: 'Nederlands', sv: 'Svenska', fi: 'Suomi', no: 'Norsk', hu: 'Magyar', ro: 'Română', sr: 'Српски', sl: 'Slovenščina', uk: 'Українська', kn: 'ಕನ್ನಡ', ta: 'தமிழ்' };

    /* "ЯЗЫКИ ПЕРЕВОДА" popover (production-v4 mock, docs/Fresults-standalone.html) — the
       six-dot "more" button's target. STAGE 2 (owner: "нужно чтобы можно было отключить язык",
       "в том числе основной с помощью галочки") — the checkbox and "сделать основным" pin now
       both drive the real reader: dgApplyLangSelection() below persists the checked set to
       dgReadingLangOrder and either refetches (multi: adding/removing a column is a real
       content change) or calls switchReadingLanguage() (single-column modes: unchecking the
       language on screen switches to the next checked one) — see its comment for the split.
       Inline ru/en dictionaries, same pattern as MODE_TITLES/MODE_DESCRIPTIONS above. */
    var LANGMENU_STR = {
        title: { ru: 'Языки перевода', en: 'Translation Languages' },
        main: { ru: 'основной', en: 'main' },
        setMain: { ru: 'сделать основным', en: 'set as main' },
        missing: { ru: 'нет перевода', en: 'no translation' }
    };
    function langMenuStr(key) { return LANGMENU_STR[key][menuLang() === 'ru' ? 'ru' : 'en']; }
    var pillLangs = [];
    var pillLiveLangs = []; // what's actually rendered right now (reader: DOM; results: the UI language)
    var resultsHiddenLangs = []; // results-page per-language toggle state (dgSetResultsLangVisibility) — the popover's checkboxes read this back, see dgToggleLangMenu
    // Owner: in memorize (mnemonic first-letters) and devanagari (dualScript) reader modes, the
    // main line IS the mode — hiding it makes the mode pointless — so the pill's "pli" segment
    // must be inert there; the pill only ever toggles the second (reference Pali / ISO-Latin)
    // line on/off. window.MODE_TABLE flags (mnemonic/dualScript, reader/mode-table.json) are the
    // same ones megareader.js's isMnemonicMode()/isDualScriptMode() read.
    function dgPaliLockedReaderMode() {
        var rm = window.READER_MODE;
        var cfg = rm && window.MODE_TABLE && window.MODE_TABLE[rm.modeKey];
        return currentState() === 'reader' && !!(cfg && (cfg.mnemonic || cfg.dualScript));
    }
    // Byline "*" (megareader.js translatorByline): unfolds the other translators under it.
    document.addEventListener('click', function (e) {
        var star = e.target.closest('.dg-trn-star');
        if (!star) return;
        var rest = star.nextElementSibling;
        if (!rest) return;
        rest.hidden = !rest.hidden;
        star.setAttribute('aria-expanded', String(!rest.hidden));
    });
    // Site/reading language changed (burger EN/RU, Alt+1, or megareader's switchReadingLanguage —
    // all go through dhamma-i18n.js setSiteLanguage, which dispatches this on document). Owner:
    // the language you just left stays "activated" — EN→RU turns [en] into [ru, en], so the
    // "···" button appears right away, in results and reader alike. Same prepend semantics as
    // megareader.js setLangOrderFirst (new first, rest kept). Outside the reader we repaint the
    // pill here; inside it buildSutta() repaints at the end of its own re-render (painting here
    // too would flash the old DOM's language for a moment).
    document.addEventListener('dhamma:languagechange', function (e) {
        var lang = e.detail && e.detail.language;
        if (!lang) return;
        try {
            var order = JSON.parse(localStorage.getItem('dgReadingLangOrder')) || [];
            if (!Array.isArray(order)) order = [];
            localStorage.setItem('dgReadingLangOrder', JSON.stringify([lang].concat(order.filter(function (l) { return l !== lang; }))));
        } catch (err) { /* приватный режим */ }
        if (currentState() !== 'reader') dgRenderLangPill();
    });
    function dgLangMenuHost() {
        var menu = document.getElementById('dg-lpmenu');
        if (menu) return menu;
        menu = document.createElement('div');
        menu.id = 'dg-lpmenu';
        menu.className = 'dg-lpmenu';
        menu.hidden = true;
        document.body.appendChild(menu);
        menu.addEventListener('click', function (e) {
            var pin = e.target.closest('.dg-lpmenu-pin');
            if (pin) { dgApplyLangSelection(menu, pin.closest('.dg-lpmenu-row').dataset.lang); return; }
            // Row click outside the checkbox itself still toggles it (bigger hit target) — except
            // on the MAIN row: owner tapped its "основной" badge and lost the language (and with
            // it the "···" button, the set being down to one). Dropping the main language is a
            // deliberate act — its own checkbox only.
            var row = e.target.closest('.dg-lpmenu-row');
            if (row && !row.classList.contains('is-missing') && !row.classList.contains('is-main') && e.target.tagName !== 'INPUT') {
                var box = row.querySelector('.dg-check');
                if (box) { box.checked = !box.checked; dgApplyLangSelection(menu); }
            }
        });
        // Clicking the checkbox itself fires its own native 'change' — the row-click branch
        // above skips INPUT targets so this is the only path for a direct checkbox click.
        menu.addEventListener('change', function (e) {
            if (e.target.classList.contains('dg-check')) dgApplyLangSelection(menu);
        });
        document.addEventListener('click', function (e) {
            if (menu.hidden || e.target.closest('#dg-lpmenu') || e.target.closest('.dg-lpill-more')) return;
            menu.hidden = true;
        });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') menu.hidden = true; });
        return menu;
    }
    /* ——— Translators inside the same popover (issue #6 этап 2) ———————————————————————————
       Owner: "переводчики в попапе", pill untouched — every non-main language AND every
       translator lives behind the dots. One sub-line per language ("кто его сейчас переводит"),
       tapping it unfolds that language's translators as CHECKBOXES: any number can be on at
       once (each checked one is a separate translation in the text), the first is main. The AI
       draft never appears — the server already keeps it out of availableTranslators. */
    // Display names come from /assets/js/translators.json (window.siteTranslators, fetched by
    // megareader.js) and carry <a href> links for the project's own translators — plain text here.
    function trnName(key) {
        var lang = key.split('_')[0], id = key.slice(lang.length + 1);
        var raw = (window.siteTranslators && window.siteTranslators[lang] && window.siteTranslators[lang][id]) || '';
        var name = String(raw)
            // An EXTERNAL link is a "source" pointer appended to the name ("Thanissaro Bhikkhu
            // <a href=https://dhammatalks.org/…>source</a>") — drop it whole. Internal ones ARE
            // the name ("<a href=/assets/texts/syrkin.html>А.Я. Сыркин</a> с Пали, ред. <a>o</a>")
            // — keep their text.
            .replace(/<a[^>]*href=["']?https?:[^>]*>[\s\S]*?<\/a>/gi, '')
            .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        return name || (id.charAt(0).toUpperCase() + id.slice(1));
    }
    function dgSetLangMenuMain(menu, lang) {
        menu.querySelectorAll('.dg-lpmenu-row').forEach(function (row) {
            row.classList.toggle('is-main', row.dataset.lang === lang);
        });
        var btn = document.querySelector('#dg-langpill button[data-k="2nd"]');
        if (btn) btn.textContent = LANG_LABEL[lang] || (lang.charAt(0).toUpperCase() + lang.slice(1));
    }
    /* Reads the popover's checkboxes, persists the result, and makes it real:
       - forceMainLang (pin click, "сделать основным"): that language wins main even if it was
         unchecked — promoting a language also turns it on.
       - Unchecking every row is refused (same "at least one text stays on" rule the pli/2nd pill
         toggle already follows) — the row just clicked is put back on instead.
       - multi mode can show several columns at once, so ANY change to the checked set (not
         just which one is main) is a real content change — refetch. Other modes only ever show
         ONE language on screen, so there's nothing to refetch UNLESS the language that changed
         was the one actually showing — switchReadingLanguage() covers that (and no-ops via its
         own guard when it wasn't). */
    // One <style> rule per hidden language, targeting the `lang="xx"` attribute search-render.js
    // already puts on every translation <span class="quote">, PLUS the title's own translated
    // line (search-render.js: `<span class="${lang}-lang dg-title-lang">`) — that one has no
    // `lang=` attribute (only ever one language's title renders per row, whichever won the
    // priority pick), so it needs its own class-based selector. Owner: "галочка русс должна быть
    // тоже самое что кнопка рус — кнопка рус отключает и название на русском тоже, а галочка нет"
    // — was quote-only, title kept showing its translated line regardless of the checkbox.
    // A stylesheet rule (not per-element inline style) so it keeps applying to rows DataTables
    // redraws later (sort/page/search) without needing a redraw hook.
    function dgSetResultsLangVisibility(allLangs, checkedLangs) {
        var style = document.getElementById('dg-results-lang-hide');
        if (!style) {
            style = document.createElement('style');
            style.id = 'dg-results-lang-hide';
            document.head.appendChild(style);
        }
        resultsHiddenLangs = allLangs.filter(function (l) { return /^[a-z]{2,3}$/.test(l) && checkedLangs.indexOf(l) === -1; }); // guard: only plain ISO codes reach the stylesheet
        style.textContent = resultsHiddenLangs
            // !important: langswitch.css unconditionally forces `.dg-title-lang { display: inline
            // !important }` (keeps the Pali+translation title on one line) — a plain rule here
            // would lose to that regardless of this rule's own specificity.
            .map(function (l) { return '#search-pane [lang="' + l + '"].quote{display:none}\n#search-pane .' + l + '-lang.dg-title-lang{display:none !important}'; })
            .join('\n');
    }
    function dgApplyLangSelection(menu, forceMainLang) {
        var st = currentState();
        var rm = window.READER_MODE;
        // Owner: two presets over one mechanism. multi = "my saved set" (persisted). Every
        // other reader mode = "just the main language", where the checkboxes are a per-TEXT
        // trial: applied at once, never saved, allowed to go all the way down to Pāḷi only.
        // issue #6: было 'multiLang' — ключ переименован при слиянии с multiTran, смысл тот же.
        var trial = st === 'reader' && !!rm && rm.modeKey !== 'multi';
        // Results may ALSO drop to zero (Pāḷi only) — owner: "у нас есть даже более рекомендуемый
        // режим, только пали" — it's the same Pāḷi-only view the pill's own left segment already
        // reaches (dgSetResultsLangVisibility hides every language when nothing's checked), not a
        // dead end that needs a language forced back on. Only multi's saved set still floors
        // at 1 (its own "Pāḷi only" is the separate pli/2nd pill toggle, not this popover).
        var allowZero = trial || st === 'results';
        if (forceMainLang) {
            menu.querySelectorAll('.dg-lpmenu-row').forEach(function (row) {
                if (row.dataset.lang === forceMainLang) row.querySelector('.dg-check').checked = true;
            });
        }
        var rows = Array.prototype.slice.call(menu.querySelectorAll('.dg-lpmenu-row'));
        var checked = rows.filter(function (r) { return r.querySelector('.dg-check').checked; })
            .map(function (r) { return r.dataset.lang; });
        if (!checked.length && rows.length && !allowZero) { // saved sets (multi) keep ≥1; trial/results may drop to Pāḷi only
            rows[0].querySelector('.dg-check').checked = true;
            checked = [rows[0].dataset.lang];
        }
        // Owner: "галочка не влияет на язык по умолчанию — галочка влияет на видимость языка,
        // основной — это который открывается первым, их не нужно смешивать". Results: main only
        // ever changes via the pin (forceMainLang) — unchecking/rechecking any row, including the
        // current main's own row, never moves it. Was tied together (unchecking main silently
        // promoted whichever row was still checked and switched the SITE language to it) — reader
        // trial modes keep that promotion-on-uncheck behavior on purpose (memory: "unchecking the
        // currently-main language... promotes the next checked one"), only results decouples.
        var mainLang = st === 'results'
            ? (forceMainLang || pillLangs[0])
            : (forceMainLang || (checked.indexOf(pillLangs[0]) !== -1 ? pillLangs[0] : (checked[0] || pillLangs[0])));
        var ordered = [mainLang].concat(checked.filter(function (l) { return l !== mainLang; }));
        pillLangs = ordered;
        if (!trial) { try { localStorage.setItem('dgReadingLangOrder', JSON.stringify(ordered)); } catch (e) { /* приватный режим */ } }
        dgSetLangMenuMain(menu, mainLang);

        // Results listing: its "reading language" IS the site UI language (search-render.js
        // reads window.siteLanguage per row; search/index.html rebuilds the table on
        // dhamma:languagechange) — so making a language main there = switching the site.
        if (st === 'results') {
            // Owner: "одна кнопка ru отключает все переводы, нужно разделять чтобы каждый
            // перевод отключался своей частью". Was: unchecking a non-main row here did nothing
            // visible — the only real toggle on results was the legacy #language-button (single
            // hide-english class hiding EVERY [class*="-lang"] row at once, see langswitch.js).
            // Each row's checkbox now hides just that language's <span lang="xx" class="quote">
            // (search-render.js already renders one such span per language shown per segment).
            var allLangs = rows.map(function (r) { return r.dataset.lang; });
            dgSetResultsLangVisibility(allLangs, checked);
            var i18n = window.DHAMMA_I18N;
            if (i18n && i18n.setLanguage && mainLang !== (i18n.language || localStorage.getItem('dhammaLanguage'))) {
                i18n.setLanguage(mainLang); // switches the whole site — table rebuilds anyway, closing the popover is fine here
            } else {
                dgRenderLangPill(); // repaint "···" pill wording/visibility
                // dgRenderLangPill() just closed the popover (see its own comment on openMenu2) —
                // reopen it right away, rebuilt from the fresh hidden set above, so a) the row the
                // user just clicked shows its real new state instead of always "checked" (see
                // dgToggleLangMenu) and b) they can flip more than one language without reopening
                // the menu after every single click.
                dgToggleLangMenu();
            }
            return;
        }
        /* Ветки ридера отсюда убраны: в ридере этот попап больше не открывается — «···» ведёт
           в окно «Переводы» (tsToggle), а в memorize/devanagari у плашки одна кнопка вкл/выкл и
           точек нет вовсе. Остаётся страница результатов, она возвращается выше. */
    }
    // The pill's pli/2nd segments and the trial above share this: megareader's setLanguage()
    // (hide-pali/hide-english/... classes) + the same localStorage/cloud bookkeeping as before.
    function dgSetPaliToggle(next) {
        try { localStorage.setItem('paliToggle', next); localStorage.setItem('dg_localSettingsTimestamp', String(Date.now())); } catch (err) { /* приватный режим */ }
        window.language = next;
        if (typeof window.setLanguage === 'function') window.setLanguage(next);
        if (typeof window.syncSettingsToCloud === 'function') window.syncSettingsToCloud();
        dgSyncLangPill();
    }
    function dgToggleLangMenu() {
        var menu = dgLangMenuHost();
        if (!menu.hidden) { menu.hidden = true; return; }
        var main = pillLangs[0];
        var inReader = currentState() === 'reader';
        var avail = inReader && window.READER_MODE && Array.isArray(window.READER_MODE.availableLangs) ? window.READER_MODE.availableLangs : null;
        menu.innerHTML = '<div class="dg-lpmenu-title">' + esc(langMenuStr('title')) + '</div>' +
            pillLangs.map(function (lang) {
                var name = LANG_FULL_NAME[lang] || (lang.charAt(0).toUpperCase() + lang.slice(1));
                var missing = !!(avail && avail.indexOf(lang) === -1); // this text has no translation in it
                // Reader: checked = on screen right now (single-column modes list the activated-
                // but-hidden languages unchecked). Results: checked = not in the hidden set left by
                // dgSetResultsLangVisibility — was unconditionally true here, so a row the user had
                // just unchecked (hiding that language's column) came back checked the next time the
                // popover opened, with no way to tell it was already off (owner: "галочка англ...
                // остаётся вкл... больше англ вкл нельзя" — looked stuck, because visually it never
                // showed as off in the first place).
                var on = !missing && (inReader ? pillLiveLangs.indexOf(lang) !== -1 : resultsHiddenLangs.indexOf(lang) === -1);
                return '<div class="dg-lpmenu-row' + (lang === main ? ' is-main' : '') + (missing ? ' is-missing' : '') + '" data-lang="' + esc(lang) + '">' +
                    '<input type="checkbox" class="dg-check"' + (on ? ' checked' : '') + (missing ? ' disabled' : '') + '>' +
                    '<span class="dg-lpmenu-name">' + esc(name) + '</span>' +
                    '<span class="dg-lpmenu-tag">' + esc(langMenuStr('main')) + '</span>' +
                    '<span class="dg-lpmenu-missing">' + esc(langMenuStr('missing')) + '</span>' +
                    '<button type="button" class="dg-lpmenu-pin">' + esc(langMenuStr('setMain')) + '</button>' +
                    '</div>';
            }).join('');
        // Was a static CSS right/bottom (right:20px), independent of the pill's own position —
        // drifted away from the dots button once .dg-lpill started hugging the text column on
        // wide screens instead of sitting flush at the viewport edge (owner: "уехало меню, должно
        // быть связано с третьей кнопкой"). Anchor it to the pill's REAL rect instead, same
        // technique placeScrollTopButton()/repositionTtsButton() already use for the neighboring
        // corner buttons — right edge flush with the pill's right edge, sitting just above it.
        var pillHost = document.getElementById('dg-langpill');
        if (pillHost) {
            var hostRect = pillHost.getBoundingClientRect();
            menu.style.right = Math.round(window.innerWidth - hostRect.right) + 'px';
            menu.style.bottom = Math.round(window.innerHeight - hostRect.top + 8) + 'px';
        }
        menu.hidden = false;
    }
    /* ——— issue #6 этап 3: окно «Переводы» — плоский упорядоченный список ————————————————
       Один список строк вместо дерева «язык → его переводчики»: строка = один перевод
       (переводчик + язык), порядок строк = порядок переводов под каждой строкой пали, включая
       чередование языков ("о·рус, Sujato·англ, SV·рус"), которое старым хранилищем выразить
       было нельзя. Источник истины — dgReadingStack (megareader.js), всё остальное из него
       выводится. Применяется сразу; клик мимо окна просто закрывает его. */
    var TRANS_STR = {
        title:  { ru: 'Переводы', en: 'Translations' },
        onNow:  { ru: 'на экране', en: 'on screen' },
        pali:   { ru: 'только пали', en: 'Pāḷi only' },
        manual: { ru: 'Мой порядок', en: 'My order' },
        byLang: { ru: 'По языку', en: 'By language' },
        byName: { ru: 'По переводчику', en: 'By translator' },
        setMain:{ ru: 'сделать основным', en: 'set as main' },
        applied:{ ru: 'Применяется сразу · клик мимо — ', en: 'Applied instantly · click away to ' },
        close:  { ru: 'закрыть и читать', en: 'close and read' },
        sorting:{ ru: 'Сортировка временная — ваш порядок цел', en: 'Sorting is temporary — your order is kept' },
        addLang:{ ru: '+ язык', en: '+ language' },
        addHint:{ ru: 'Только на эту сессию. Насовсем — в настройках',
                  en: 'For this session only. For good — in settings' },
        addLink:{ ru: 'Мои языки', en: 'My languages' },
        localOnly:{ ru: 'до конца сессии', en: 'until you close the tab' },
        modeRead: { ru: 'Читать', en: 'Reading' },
        modeMulti:{ ru: 'Мульти', en: 'Multi' },
        readNote: { ru: 'правки до конца сессии', en: 'changes last for this session' },
        multiNote:{ ru: 'сохранится для всех текстов', en: 'saved for every text' },
        keepIt:   { ru: 'Оставить себе', en: 'Keep this' }
    };
    function tsStr(k) { return TRANS_STR[k][menuLang() === 'ru' ? 'ru' : 'en']; }
    var tsSort = 'manual';
    var tsAddOpen = false;     // открыт список "какие ещё языки есть у этого текста"
    var TS_ROW = 44;

    // Окно заменяет старый попап только там, где стек вообще имеет смысл: обычное чтение и
    // мульти. В memorize/devanagari вторая строка — не перевод, там остаётся прежний попап.
    // Owner: results use the very same window — one reading set for the whole site, not a second
    // language-only popover. search-render.js orders each row's translations by that set.
    function tsActive() {
        if (currentState() === 'results') return true;
        var rm = window.READER_MODE;
        return currentState() === 'reader' && rm && (rm.modeKey === 'single' || rm.modeKey === 'multi');
    }
    function tsStack() {
        // Results: the saved set (like multi); a one-off "Читать" trial belongs to the reader only.
        var saved = (window.getReadingStack && window.getReadingStack(currentState() === 'results' ? { ignoreTrial: true } : undefined)) || [];
        if (saved.length) return saved;
        // Сохранённого набора ещё нет (обычное «Читать»: там набор и не сохраняется) — берём то,
        // что сервер реально показал, иначе окно открывалось бы пустым при видимом переводе, и
        // первый же клик не добавлял бы строку, а подменял весь набор.
        if (currentState() === 'results') {
            // Nothing saved yet: the priority translator of each language already on screen.
            return pillLiveLangs.map(tsPriorityKey).filter(Boolean);
        }
        var rm = window.READER_MODE;
        return (rm && Array.isArray(rm.stack)) ? rm.stack.slice() : [];
    }
    // «Читать» — одноразовый режим: пришёл в него, поигрался с набором, ушёл на другой текст и
    // он снова твой обычный. Флаг живёт отдельно от modeKey, потому что tsApply переводит
    // ридер в multi, чтобы показать больше одной строки — но это не делает правку постоянной.
    function tsTrialMode() {
        if (currentState() === 'results') return false;   // results always use the saved set
        var rm = window.READER_MODE;
        if (rm && rm.modeKey === 'single') return true;
        // Примерка уже идёт: ридер временно в multi, но набор записан как временный (на
        // сессию, megareader.js). Состояние читается из записи, а не кэшируется в переменную —
        // иначе после явного переключения режима бейдж врал бы до перезагрузки страницы.
        try {
            var v = JSON.parse(sessionStorage.getItem('dgReadingStackLocal'));
            return !!(v && v.trial);
        } catch (e) { return false; }
    }
    function tsAvailable() {
        if (currentState() === 'results') {
            var sr = window.DgSearchRender;
            return (sr && sr.availableTranslators) ? sr.availableTranslators() : [];
        }
        var rm = window.READER_MODE;
        return (rm && Array.isArray(rm.availableTranslators)) ? rm.availableTranslators.slice() : [];
    }
    function tsLangOf(key) { return key.slice(0, key.indexOf('_')); }
    // Языки чтения — ОБЩАЯ настройка (dhammaReaderLangs, та же, что на /settings/), не свой
    // список окна: включил здесь — включено и там.
    function tsEnabledLangs() {
        return (window.getEnabledLangs && window.getEnabledLangs()) || ['en'];
    }
    // Глобальный список языков принадлежит /settings/ — окно его НЕ трогает. Язык, которого там
    // нет, включается здесь как локальный: он живёт на этом тексте (megareader.js setStack кладёт
    // такой набор в sessionStorage по id сутты) и уходит вместе с ним.
    function tsIsMine(lang) { return tsEnabledLangs().indexOf(lang) !== -1; }
    /* Порядок переводчиков внутри языка — один на всё окно: и как идут строки в списке, и кого
       подставлять, когда язык включают. Правило владельца: сначала «о» (перевод проекта с пали),
       затем «ред. о» (проектная редактура чужого перевода), дальше — приоритет из
       configs/reader/translator-priority.json, а кого и там нет — по имени. Для английского это
       даёт «o», затем Thanissaro (он второй в том же файле), потом остальные. */
    function tsRank(key) {
        var lang = tsLangOf(key);
        if (key === lang + '_o') return 0;
        if (/\+edited\+o$/.test(key)) return 1;
        var prio = (window.translatorPriority && window.translatorPriority[lang]) || [];
        var i = prio.indexOf(key);
        return i === -1 ? 1e6 : 2 + i;
    }
    function tsByRank(a, b) {
        var d = tsRank(a) - tsRank(b);
        return d || trnName(a).localeCompare(trnName(b));
    }
    function tsPriorityKey(lang) {
        return tsAvailable().filter(function (k) { return tsLangOf(k) === lang; }).sort(tsByRank)[0] || null;
    }

    // Строки ездят между слотами фиксированной высоты — этого хватает CSS-перехода
    // (.dg-ts-row, home.css). Перетаскиваемая строка позиционируется вручную и на время
    // перетаскивания переход выключен (.is-lift), так что палец ведёт её 1:1, без сглаживания.
    function tsSetY(row, y) {
        row.dataset.tsY = y;
        row.style.transform = 'translate3d(0,' + y + 'px,0)';
    }

    function tsHost() {
        var host = document.getElementById('dg-ts');
        if (host) return host;
        host = document.createElement('div');
        host.id = 'dg-ts';
        host.className = 'dg-ts';
        host.hidden = true;
        host.setAttribute('role', 'dialog');
        host.innerHTML =
            '<div class="dg-ts-head"><b class="dg-ts-title"></b><span class="dg-ts-count"></span>' +
            '<span class="dg-ts-mode"></span>' +
            '<button type="button" class="dg-ts-x" aria-label="✕">✕</button></div>' +
            '<div class="dg-ts-seg"></div><div class="dg-ts-chips"></div><div class="dg-ts-add-list" hidden></div>' +
            '<div class="dg-ts-body"><div class="dg-ts-rows"></div></div><div class="dg-ts-foot"></div>';
        document.body.appendChild(host);
        host.addEventListener('click', tsClick);
        host.querySelector('.dg-ts-x').addEventListener('click', function () { tsClose(); });
        // Клик мимо = «всё, читаю дальше»: применять нечего, всё уже применено.
        document.addEventListener('pointerdown', function (e) {
            if (host.hidden) return;
            if (e.target.closest('#dg-ts') || e.target.closest('.dg-lpill-more')) return;
            tsClose();
        }, true);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') tsClose(); });
        return host;
    }

    function tsVisibleKeys() {
        var stack = tsStack(), avail = tsAvailable();
        // стек первым (в своём порядке), затем всё остальное, что есть у этого текста
        // Выбранные — в своём порядке (его задаёт пользователь), остальные — по правилу выше.
        var keys = stack.filter(function (k) { return avail.indexOf(k) !== -1; });
        avail.filter(function (k) { return keys.indexOf(k) === -1; }).sort(tsByRank)
            .forEach(function (k) { keys.push(k); });
        var pool = tsEnabledLangs().concat(stack.map(tsLangOf));
        keys = keys.filter(function (k) { return pool.indexOf(tsLangOf(k)) !== -1; });
        // Список переводчиков не прячем НИКОГДА: он и есть содержимое окна. Раньше он гасился,
        // пока открыт список языков, — и когда добавлять становилось нечего, кнопка "+ язык"
        // исчезала вместе с единственным способом его вернуть: окно оставалось с одними чипами.
        if (tsSort === 'name') keys.sort(tsByRank);
        if (tsSort === 'lang') keys.sort(function (a, b) {
            var la = tsLangOf(a), lb = tsLangOf(b);
            return la === lb ? tsByRank(a, b) : la.localeCompare(lb);
        });
        return keys;
    }

    function tsRender() {
        var host = tsHost();
        if (host.hidden) return;
        var stack = tsStack(), keys = tsVisibleKeys(), rows = host.querySelector('.dg-ts-rows');
        host.querySelector('.dg-ts-title').textContent = tsStr('title');
        host.querySelector('.dg-ts-count').textContent = stack.length
            ? '· ' + stack.length + ' ' + tsStr('onNow') : '· ' + tsStr('pali');
        // Какой это режим — видно сразу, потому что от него зависит судьба правок: в «Читать»
        // они живут до следующего текста, в «Мульти» остаются насовсем.
        var trial = tsTrialMode();
        var modeEl = host.querySelector('.dg-ts-mode');
        modeEl.className = 'dg-ts-mode' + (trial ? ' is-trial' : '');
        modeEl.textContent = trial ? tsStr('modeRead') : tsStr('modeMulti');
        modeEl.title = trial ? tsStr('readNote') : tsStr('multiNote');
        modeEl.hidden = currentState() !== 'reader';   // results have no reading mode
        host.querySelector('.dg-ts-seg').innerHTML = ['manual', 'lang', 'name'].map(function (m) {
            return '<button type="button" data-ts-sort="' + m + '" aria-pressed="' + (tsSort === m) + '">' +
                esc(tsStr(m === 'manual' ? 'manual' : m === 'lang' ? 'byLang' : 'byName')) + '</button>';
        }).join('');
        // Чипы — это языки чтения (общая настройка), а не фильтр списка: нажал — язык появился
        // в тексте своим приоритетным переводчиком, нажал ещё раз — ушёл. "+ язык" открывает
        // остальные языки, в которых этот текст вообще есть.
        var enabled = tsEnabledLangs();
        var stackLangs = stack.map(tsLangOf);
        // Each language once: two translators of a language outside "my languages" used to add its chip twice.
        enabled = enabled.concat(stackLangs.filter(function (l, i) { return enabled.indexOf(l) === -1 && stackLangs.indexOf(l) === i; }));
        var textLangs = [];
        tsAvailable().forEach(function (k) { if (textLangs.indexOf(tsLangOf(k)) === -1) textLangs.push(tsLangOf(k)); });
        host.querySelector('.dg-ts-chips').innerHTML = enabled.map(function (l) {
            var on = stackLangs.indexOf(l) !== -1;
            var missing = textLangs.indexOf(l) === -1;   // этот текст в этот язык не переведён
            var local = !tsIsMine(l);
            return '<button type="button" class="dg-ts-chip' + (missing ? ' is-missing' : '') + (local ? ' is-local' : '') +
                '" data-ts-lang="' + esc(l) + '"' + (missing ? ' disabled' : '') +
                (local ? ' title="' + esc(tsStr('localOnly')) + '"' : '') +
                ' aria-pressed="' + on + '">' + esc(LANG_LABEL[l] || l) + (local ? ' •' : '') + '</button>';
        }).join('') +
            (textLangs.some(function (l) { return enabled.indexOf(l) === -1; })
                ? '<button type="button" class="dg-ts-chip dg-ts-add" data-ts-add aria-expanded="' + tsAddOpen + '">' + esc(tsStr('addLang')) + '</button>'
                : '');
        var addHost = host.querySelector('.dg-ts-add-list');
        // Нечего добавлять — список закрывается сам, иначе он висел бы открытым и пустым.
        if (tsAddOpen && !textLangs.some(function (l) { return enabled.indexOf(l) === -1; })) tsAddOpen = false;
        addHost.hidden = !tsAddOpen;
        addHost.innerHTML = !tsAddOpen ? '' :
            '<p class="dg-ts-add-hint">' + esc(tsStr('addHint')) +
            ' · <a href="/settings/#langs">' + esc(tsStr('addLink')) + '</a></p>' +
            textLangs.filter(function (l) { return enabled.indexOf(l) === -1; }).map(function (l) {
                var n = tsAvailable().filter(function (k) { return tsLangOf(k) === l; }).length;
                return '<button type="button" class="dg-ts-add-row" data-ts-newlang="' + esc(l) + '">' +
                    '<span>' + esc(LANG_FULL_NAME[l] || l) + '</span><span class="dg-ts-add-n">' + n + '</span></button>';
            }).join('');

        rows.innerHTML = keys.map(function (key) {
            var lang = tsLangOf(key), i = stack.indexOf(key), on = i !== -1;
            return '<div class="dg-ts-row' + (on ? ' is-on' : '') + '" data-ts-key="' + esc(key) + '">' +
                '<span class="dg-ts-hnd" data-ts-drag><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
                '<span class="dg-ts-ord">' + (on ? i + 1 : '') + '</span>' +
                '<button type="button" class="dg-ts-tick" role="checkbox" aria-checked="' + on + '"></button>' +
                '<span class="dg-ts-name">' + esc(trnName(key)) + '</span>' +
                '<span class="dg-ts-tag' + (tsIsMine(lang) ? '' : ' is-local') + '" title="' +
                (tsIsMine(lang) ? '' : esc(tsStr('localOnly'))) + '">' + esc(LANG_LABEL[lang] || lang) +
                (tsIsMine(lang) ? '' : ' •') + '</span>' +
                '<button type="button" class="dg-ts-star' + (stack[0] === key ? ' is-main' : '') + '" title="' +
                esc(tsStr('setMain')) + '">' + (stack[0] === key ? '★' : '☆') + '</button>' +
                '</div>';
        }).join('');
        rows.classList.toggle('is-sorted', tsSort !== 'manual');
        var y = 0;
        rows.querySelectorAll('.dg-ts-row').forEach(function (row) {
            tsSetY(row, y);
            y += TS_ROW;
        });
        rows.style.height = y + 'px';
        host.querySelector('.dg-ts-foot').innerHTML = tsSort !== 'manual'
            ? esc(tsStr('sorting'))
            : (trial
                // В «Читать» важнее не «клик мимо», а то, что набор одноразовый — и как его
                // всё-таки оставить себе, если понравилось.
                ? esc(tsStr('modeRead')) + ' — ' + esc(tsStr('readNote')) +
                  ' · <button type="button" class="dg-ts-keep" data-ts-keep>' + esc(tsStr('keepIt')) + '</button>'
                : esc(tsStr('applied')) + '<b>' + esc(tsStr('close')) + '</b>');
        tsPlace();
    }

    // Десктоп: окно висит над «···», как и старый попап. Мобильный: шторка снизу во всю ширину
    // (позиция задана в CSS), считать нечего.
    function tsPlace() {
        var host = document.getElementById('dg-ts');
        var pillHost = document.getElementById('dg-langpill');
        if (!host) return;
        if (window.innerWidth < 768) {
            // Снять посадку у кнопки: инлайновые right/bottom с десктопа переживают смену
            // ширины и побеждают CSS шторки (left:0;right:0) — окно оставалось узким слева.
            host.style.right = host.style.bottom = '';
            return;
        }
        if (!pillHost) return;
        var r = pillHost.getBoundingClientRect();
        host.style.right = Math.round(window.innerWidth - r.right) + 'px';
        host.style.bottom = Math.round(window.innerHeight - r.top + 8) + 'px';
    }

    function tsOpen() {
        var host = tsHost();
        host.hidden = false;
        document.body.classList.add('dg-ts-open');
        tsRender();
    }
    function tsClose() {
        var host = document.getElementById('dg-ts');
        if (!host || host.hidden) return;
        host.hidden = true;
        document.body.classList.remove('dg-ts-open');
    }
    function tsToggle() {
        var host = document.getElementById('dg-ts');
        if (host && !host.hidden) { tsClose(); return; }
        tsOpen();
    }

    /* Применить: записать стек и перестроить текст, не сдвинув читаемую строку. Перезагрузки
       нет — это тот же buildSutta(), что и у переключения режимов. */
    var tsBusy = false, tsPending = null;
    function tsApply(next) {
        if (currentState() === 'results') {
            window.setReadingStack(next);
            // The old popover's per-language hiding would fight the set — the set decides now.
            dgSetResultsLangVisibility([], []);
            tsRender();
            // Main translation in another language = switch the site to it, as the old popover's
            // pin did (the table rebuilds on that change anyway); otherwise just redraw the rows.
            var first = next.length ? tsLangOf(next[0]) : null, i18n = window.DHAMMA_I18N;
            if (first && i18n && i18n.setLanguage && first !== (i18n.language || localStorage.getItem('dhammaLanguage'))) {
                i18n.setLanguage(first);
            } else {
                document.dispatchEvent(new CustomEvent('dg:readingstackchange'));
            }
            return;
        }
        var rm = window.READER_MODE, slug = window._currentSlug;
        if (!rm || !slug || typeof window.buildSutta !== 'function') return;
        window.setReadingStack(next, tsTrialMode() ? { local: true } : undefined);
        tsRender();
        // Быстрые клики не теряются: пока идёт перестроение, последний выбор ждёт своей очереди,
        // иначе текст остался бы на предпоследнем состоянии галочек.
        if (tsBusy) { tsPending = next; return; }
        tsBusy = true;
        var wantMode = next.length > 1 ? 'multi' : 'single';
        var firstLang = next.length ? tsLangOf(next[0]) : rm.lang;
        var params = new URLSearchParams(document.location.search);
        params.delete('translators');   // стек главнее ссылки, из которой пришли
        params.delete('langs');
        params.set('mode', wantMode);
        rm.modeKey = wantMode;
        var done;
        if (firstLang && firstLang !== rm.lang && typeof window.switchReadingLanguage === 'function') {
            // основной язык сменился — это же и язык интерфейса, switchReadingLanguage сам
            // сохранит его, перестроит текст и вернёт якорь чтения
            history.replaceState(history.state, '', document.location.pathname + '?' + params.toString());
            done = window.switchReadingLanguage(firstLang);
        } else {
            params.set('lang', rm.lang);
            history.replaceState(history.state, '', document.location.pathname + '?' + params.toString());
            var anchor = window.captureReadingAnchor && window.captureReadingAnchor();
            done = window.buildSutta(slug).then(function () {
                if (anchor && window.restoreReadingAnchor) window.restoreReadingAnchor(anchor);
            });
        }
        Promise.resolve(done).then(function () {
            tsBusy = false;
            tsRender();
            if (tsPending) { var again = tsPending; tsPending = null; tsApply(again); }
        });
    }

    function tsClick(e) {
        var row = e.target.closest('.dg-ts-row');
        var sortBtn = e.target.closest('[data-ts-sort]');
        if (sortBtn) { tsSort = sortBtn.dataset.tsSort; tsRender(); return; }
        if (e.target.closest('[data-ts-keep]')) {
            window.setReadingStack(tsStack());     // с этого момента набор обычный, сохраняемый
            tsRender();
            return;
        }
        if (e.target.closest('[data-ts-add]')) { tsAddOpen = !tsAddOpen; tsRender(); return; }
        var newLang = e.target.closest('[data-ts-newlang]');
        if (newLang) {
            tsAddOpen = false;
            var addKey = tsPriorityKey(newLang.dataset.tsNewlang);
            addKey ? tsApply(tsStack().concat([addKey])) : tsRender();
            return;
        }
        var chip = e.target.closest('[data-ts-lang]');
        if (chip) {
            var l = chip.dataset.tsLang;
            var cur = tsStack();
            var has = cur.some(function (k) { return tsLangOf(k) === l; });
            if (has) {
                var left = cur.filter(function (k) { return tsLangOf(k) !== l; });
                if (left.length) tsApply(left);          // последний язык не выключаем
            } else {
                var key = tsPriorityKey(l);
                if (key) tsApply(cur.concat([key]));
            }
            return;
        }
        if (!row) return;
        var key = row.dataset.tsKey, stack = tsStack().slice();
        if (e.target.closest('.dg-ts-star')) {                       // основной = первый в списке
            stack = [key].concat(stack.filter(function (k) { return k !== key; }));
            tsApply(stack);
            return;
        }
        if (e.target.closest('.dg-ts-tick') || e.target.closest('.dg-ts-name')) {
            var i = stack.indexOf(key);
            if (i === -1) stack.push(key); else stack.splice(i, 1);
            if (!stack.length) stack = [key];                        // хотя бы один перевод остаётся
            tsApply(stack);
        }
    }

    /* Перетаскивание строк: палец ведёт строку 1:1, соседи разъезжаются пружинами, на отпускании
       слот выбирается по спроецированной инерции, а не по точке отпускания. */
    var tsDrag = null;
    document.addEventListener('pointerdown', function (e) {
        var handle = e.target.closest('[data-ts-drag]');
        if (!handle || tsSort !== 'manual') return;
        var row = handle.closest('.dg-ts-row');
        var rows = [].slice.call(row.parentNode.querySelectorAll('.dg-ts-row'));
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        row.classList.add('is-lift');   // сначала класс, потом замер: он снимает переход
        var startY = parseFloat(row.dataset.tsY) || 0;
        tsDrag = {
            row: row, rows: rows, keys: rows.map(function (r) { return r.dataset.tsKey; }),
            index: rows.indexOf(row), grabY: e.clientY, startY: startY, y: startY
        };
    });
    document.addEventListener('pointermove', function (e) {
        if (!tsDrag) return;
        var max = (tsDrag.keys.length - 1) * TS_ROW;
        var y = tsDrag.startY + (e.clientY - tsDrag.grabY);
        if (y < 0) y = (y * TS_ROW * 0.55) / (TS_ROW + 0.55 * Math.abs(y));           // резина у краёв
        if (y > max) { var o = y - max; y = max + (o * TS_ROW * 0.55) / (TS_ROW + 0.55 * o); }
        tsDrag.y = y;
        tsDrag.row.style.transform = 'translate3d(0,' + y + 'px,0)';
        var want = Math.max(0, Math.min(tsDrag.keys.length - 1, Math.round(y / TS_ROW)));
        if (want !== tsDrag.index) {
            tsDrag.keys.splice(tsDrag.index, 1);
            tsDrag.keys.splice(want, 0, tsDrag.row.dataset.tsKey);
            tsDrag.index = want;
            tsDrag.keys.forEach(function (k, i) {
                var r = tsDrag.rows.find(function (x) { return x.dataset.tsKey === k; });
                if (r && r !== tsDrag.row) tsSetY(r, i * TS_ROW);
            });
        }
    });
    function tsEndDrag() {
        if (!tsDrag) return;
        var d = tsDrag; tsDrag = null;
        d.row.classList.remove('is-lift');   // вернуть переход: строка доедет до своего слота
        tsSetY(d.row, d.index * TS_ROW);     // соседей pointermove уже расставил
        // порядок в тексте = порядок включённых строк; выключенные в стек не попадают
        var stack = tsStack();
        var next = d.keys.filter(function (k) { return stack.indexOf(k) !== -1; });
        if (next.length && next.join() !== stack.join()) tsApply(next);
    }
    document.addEventListener('pointerup', tsEndDrag);
    document.addEventListener('pointercancel', tsEndDrag);
    window.addEventListener('resize', tsPlace);

    function dgRenderLangPill() {
        var host = document.getElementById('dg-langpill');
        var sutta = document.getElementById('sutta');
        var st = currentState();
        // Results too (owner: "в результатах старая кнопка"): there the pill drives langswitch.js
        // (the hidden legacy #language-button) instead of megareader's setLanguage().
        // Owner: "на ошибках типа ничего не найдено и недоступен — не надо" — a Pāli/translation
        // TOGGLE is meaningless with no quotes on screen to toggle (0 exact matches, AI-search
        // "unavailable"/genuinely-empty states — all call dgSetState('results') with #pali hidden,
        // see ai-search.js). Checking classList.contains('d-none') rather than just querying for
        // .quote[lang] elements: #pali is a DataTables singleton (buildDataTable never destroys/
        // rebuilds it, only shows/hides it, see search-render.js) — a PREVIOUS real search's rows
        // can still be sitting in the DOM, just hidden, so their mere existence doesn't mean
        // THIS screen has anything to show.
        // Owner: "предложение слов - кнопка языка" — the AI-search "did you mean" word-chips-only
        // outcome (#ai-words, ai-search.js) counts as real content too, same as a sutta table —
        // only the two truly-empty/error outcomes should hide the pill.
        var paliEl = document.getElementById('pali');
        var aiWordsEl = document.getElementById('ai-words');
        var hasResultsContent = st === 'results' && (
            (!!paliEl && !paliEl.classList.contains('d-none') && !!paliEl.querySelector('.quote[lang]'))
            || (!!aiWordsEl && !aiWordsEl.classList.contains('d-none') && aiWordsEl.children.length > 0)
        );
        if (!((st === 'reader' && sutta) || hasResultsContent)) {
            if (host) host.hidden = true;
            var openMenu = document.getElementById('dg-lpmenu');
            if (openMenu) openMenu.hidden = true;
            return;
        }
        var langs = [];
        if (st === 'reader') {
            sutta.querySelectorAll('.right-column .quote[lang]').forEach(function (q) {
                var l = q.getAttribute('lang');
                if (l && l !== 'pi' && langs.indexOf(l) === -1) langs.push(l);
            });
        } else {
            // Was: always just the UI language, on the assumption the listing only ever shows
            // one translation. Not true any more — search-render.js renders one <span lang="xx">
            // per language actually present (?langs=ru,en, or ru+en for a non-en interface). The
            // UI language goes first — it's what "main" means on results (dgApplyLangSelection
            // switches the SITE language when the main row changes) — the rest of what's actually
            // on screen (found via the DOM, same as the reader branch above) is appended after it.
            // Getting this order wrong once flipped the site to Russian just from unchecking a
            // non-main row: langs[0] (someone else's DOM order, e.g. ?langs=ru,en) ≠ the real site
            // language, so dgApplyLangSelection's mainLang-changed check misfired.
            var uiLang = (localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en') === 'ru' ? 'ru' : 'en';
            langs.push(uiLang);
            document.querySelectorAll('#pali .quote[lang]').forEach(function (q) {
                var l = q.getAttribute('lang');
                if (l && l !== 'pi' && langs.indexOf(l) === -1) langs.push(l);
            });
        }
        pillLiveLangs = langs.slice();
        // Owner: "доп кнопку показывать во всех режимах чтения и в результатах, если уже есть
        // больше одного активированного языка" — a mode like single/memorize/devanagari (or the
        // results listing) only ever renders ONE language at a time, so `langs` above stays
        // length 1 there even for a user who already turned on several languages via multi.
        // dgReadingLangOrder (megareader.js LANG_ORDER_KEY) is that persisted set — read directly
        // here (not via megareader.js's getLangOrder(), which isn't guaranteed loaded outside the
        // reader) so the dots button reflects "already activated", not just "on screen right now".
        // langs[0] (what THIS view actually shows) stays first; the rest only append.
        try {
            var activated = JSON.parse(localStorage.getItem('dgReadingLangOrder'));
            if (Array.isArray(activated)) {
                activated.forEach(function (l) { if (l && l !== 'pi' && langs.indexOf(l) === -1) langs.push(l); });
            }
        } catch (e) { /* приватный режим / битый JSON */ }
        if (!host) {
            host = document.createElement('div');
            host.id = 'dg-langpill';
            host.className = 'dg-lpill';
            host.setAttribute('role', 'group');
            document.body.appendChild(host);
            host.addEventListener('click', function (e) {
                var b = e.target.closest('button');
                if (!b) return;
                if (b.classList.contains('dg-lpill-more')) { tsActive() ? tsToggle() : dgToggleLangMenu(); return; }
                // Memorize/devanagari: only the "2nd" button is rendered at all (see
                // dgRenderLangPill above) — a plain on/off, main line always stays on.
                if (dgPaliLockedReaderMode()) {
                    dgSetPaliToggle(dgPillMode().trn ? 'pli' : 'pli-2nd');
                    return;
                }
                var cur = dgPillMode();
                var pli = cur.pli, trn = cur.trn;
                if (b.dataset.k === 'pli') pli = !pli; else trn = !trn;
                if (!pli && !trn) { if (b.dataset.k === 'pli') trn = true; else pli = true; }
                if (currentState() === 'results') {
                    // Owner: "нажали кнопку — нажали галочку, это одно и то же" — this segment
                    // must drive the exact same state the main row's popover checkbox does, not
                    // langswitch.js's own separate paliToggleSearch (which blanket-hides EVERY
                    // language at once — reintroducing the "one button kills all translations"
                    // bug this whole feature exists to fix, the moment 2+ languages are active).
                    var searchPane = document.getElementById('search-pane');
                    if (searchPane) searchPane.classList.toggle('hide-pali', !pli);
                    var mainLang = pillLangs[0];
                    if (mainLang) {
                        var allLangs = pillLangs.slice();
                        var checkedNow = allLangs.filter(function (l) { return resultsHiddenLangs.indexOf(l) === -1; });
                        var idx = checkedNow.indexOf(mainLang);
                        if (trn && idx === -1) checkedNow.push(mainLang);
                        else if (!trn && idx !== -1) checkedNow.splice(idx, 1);
                        dgSetResultsLangVisibility(allLangs, checkedNow);
                    }
                    dgSyncLangPill();
                    return;
                }
                dgSetPaliToggle(pli && trn ? 'pli-2nd' : (pli ? 'pli' : '2nd'));
            });
            // Alt+Z / hidden #language-button still cycle the mode — mirror it here afterwards.
            document.addEventListener('keydown', function () { setTimeout(dgSyncLangPill, 60); });
            var legacyBtn = document.getElementById('language-button');
            if (legacyBtn) legacyBtn.addEventListener('click', function () { setTimeout(dgSyncLangPill, 60); });
        }
        pillLangs = langs;
        var openMenu2 = document.getElementById('dg-lpmenu');
        if (openMenu2) openMenu2.hidden = true; // stale rows would outlive a mode/language change
        // Fallback before real content is in the DOM (e.g. body.dg-state-reader flips just
        // before buildSutta() fills #sutta — MutationObserver above fires a repaint on that class
        // change): was hardcoded 'ru', so an English-site load flashed "Pāḷi Рус" for a moment
        // before the real repaint corrected it to "Pāḷi En". Use the same site-language resolver
        // as the results branch above instead of guessing ru.
        var main = langs[0] || (localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en');
        var label = LANG_LABEL[main] || (main.charAt(0).toUpperCase() + main.slice(1));
        host.hidden = false;
        var paliLocked = dgPaliLockedReaderMode();
        if (paliLocked) {
            // Owner: just one button here, no "Pāḷi" segment (that line can't be turned off, see
            // dgPaliLockedReaderMode above) and no ru/en label (the second line isn't a
            // translation in either mode) — a plain on/off for the second line only.
            var modeKey = window.READER_MODE && window.READER_MODE.modeKey;
            var secondLabels = SECOND_LINE_LABEL[modeKey] || SECOND_LINE_LABEL.memorize;
            var secondLabel = secondLabels[menuLang() === 'ru' ? 'ru' : 'en'];
            host.innerHTML = '<button type="button" data-k="2nd" aria-pressed="true">' + esc(secondLabel) + '</button>';
        } else {
            host.innerHTML =
                '<button type="button" data-k="pli" aria-pressed="true">Pāḷi</button>' +
                '<button type="button" data-k="2nd" aria-pressed="true">' + esc(label) + '</button>' +
                // "···" is the only door to the translations window now — it has to be there even
                // when the text is showing a single language, or there is no way to add a second.
                (langs.length > 1 || tsActive()
                    ? '<button type="button" class="dg-lpill-more" title="' + esc(langMenuStr('title')) + '" aria-label="' + esc(langMenuStr('title')) + '"><span class="dg-dots" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span></button>'
                    : '');
        }
        dgSyncLangPill();
        window.dispatchEvent(new Event('resize')); // #scrollToTopBtn re-measures its right offset
    }
    /* Current {pli, trn} of the screen: reader — localStorage.paliToggle (pli-2nd/pli/2nd),
       results — #search-pane.hide-pali + resultsHiddenLangs (dgSetResultsLangVisibility; trn
       tracks the MAIN language specifically, same flag its own popover checkbox reads/writes —
       not the legacy langswitch.js paliToggleSearch, see the pill's click handler above). */
    function dgPillMode() {
        if (currentState() === 'results') {
            var searchPane = document.getElementById('search-pane');
            var pli = !(searchPane && searchPane.classList.contains('hide-pali'));
            var trn = resultsHiddenLangs.indexOf(pillLangs[0]) === -1;
            return { pli: pli, trn: trn };
        }
        var mode = localStorage.getItem('paliToggle') || 'pli-2nd';
        // Locked modes never actually reach '2nd' any more (click handler above blocks it), but
        // this also guards a stored value left over from before that mode existed — pli always
        // reads as on here regardless of what's in localStorage.
        if (dgPaliLockedReaderMode()) return { pli: true, trn: mode !== 'pli' };
        return { pli: mode !== '2nd', trn: mode !== 'pli' };
    }
    function dgSyncLangPill() {
        var host = document.getElementById('dg-langpill');
        if (!host) return;
        var cur = dgPillMode();
        var pli = host.querySelector('[data-k="pli"]'), trn = host.querySelector('[data-k="2nd"]');
        if (pli) pli.setAttribute('aria-pressed', cur.pli ? 'true' : 'false');
        if (trn) trn.setAttribute('aria-pressed', cur.trn ? 'true' : 'false');
    }
    window.dgRenderLangPill = dgRenderLangPill;
    // Screen changes (and dg-busy dropping once results are in) re-render the pill; the reader
    // additionally calls it itself after every buildSutta().
    new MutationObserver(function () { dgRenderLangPill(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    function renderScopeSummary() {
        var host = document.getElementById('home-scope-summary');
        if (!host) return;
        var scope = readScope();
        var parts = [];
        SCOPE_GROUPS.forEach(function (g) {
            var on = g.items.filter(function (it) {
                return it.codes.every(function (c) { return scope.indexOf(c) !== -1; });
            }).length;
            var short = SCOPE_SUMMARY_SHORT[g.label];
            if (on > 0 && short) parts.push(on + ' ' + t(short[0], short[1]));
        });
        var textEl = host.querySelector('.dg-scope-summary-text');
        if (textEl) textEl.textContent = parts.join(' · ');
        var changeEl = host.querySelector('.dg-scope-change');
        if (changeEl) {
            // Sliders glyph before the word (reference: fa-sliders + "изменить") — same SVG as
            // the field's own quick-settings button, inserted once; the label is re-set on
            // every language switch.
            if (!changeEl.querySelector('svg')) changeEl.insertAdjacentHTML('afterbegin', quickButtonHtml());
            var label = changeEl.querySelector('.dg-scope-change-label');
            if (label) label.textContent = t('home.scopeChange', 'изменить');
        }
    }

    /* Подтверждение «Сохранено» — всё в быстрых настройках и так пишется в localStorage сразу по
       клику, отдельной кнопки «Сохранить» нет и не нужна (это создало бы иллюзию, что без неё
       правки потеряются). showBubbleNotification — уже готовый, везде загруженный тост
       (public/overrides/js/settings.js), используем его, а не заводим свой второй. */
    function notifySaved() {
        if (typeof window.showBubbleNotification === 'function') {
            window.showBubbleNotification(t('quick.saved', 'Сохранено'));
        }
    }

    function buildQuickBody(host) {
        host.innerHTML = '';
        var state = currentState();

        // "Где искать" (выбор никай/раздела) — раньше пряталось в ридере (тогда предполагалось,
        // что там нечего искать). Владелец: поле поиска общее для всех трёх состояний (та же
        // .dg-hero-inner), и из ридера можно ввести новый запрос не уходя со страницы — область
        // поиска должна быть настраиваема отовсюду, где есть это поле, а не только на
        // главной/выдаче. Показываем всегда.
        host.appendChild(groupTitle(t('quick.where', 'Где искать')));
        host.appendChild(scopePicker());

        // Словарь — глобальная настройка (главная/поиск/ридер), поэтому не внутри блока выше.
        // Порядок по просьбе владельца: где искать -> словарь -> контекст.
        host.appendChild(groupTitle(t('quick.dictMode', 'Словарь')));
        host.appendChild(dictModePicker());

        if (state !== 'reader' && state !== 'toc') {
            host.appendChild(groupTitle(t('quick.context', 'Контекст в цитатах')));
            var ctx = String(localStorage.getItem('dhammaSearchContextBefore') || 0);
            host.appendChild(segmented([
                { value: '0', label: t('quick.ctx0', 'Только строка') },
                { value: '1', label: t('quick.ctx1', '+1 строка') },
                { value: '2', label: t('quick.ctx2', '+2 строки') }
            ], ctx, function (v) {
                localStorage.setItem('dhammaSearchContextBefore', v);
                localStorage.setItem('dhammaSearchContextAfter', v);
                notifySaved();
            }));
            /* Пояснение обязательно: «+1 строка» само по себе не говорит, куда эта строка —
               сверху, снизу или в обе стороны. А берутся они с ОБЕИХ сторон: обработчик выше
               пишет одно и то же значение и в ...ContextBefore, и в ...ContextAfter. */
            host.appendChild(note(t('quick.contextNote',
                'Сколько строк показывать до и после найденной — с каждой стороны.')));
        }

        if (state === 'results') {
            host.appendChild(groupTitle(t('quick.view', 'Вид выдачи')));
            /* Переключатель «Тексты/Слова» уже есть в ряду кнопок выдачи (.forshellscript) и
               живёт в index.html вместе со всей отрисовкой отчётов. Здесь именно ЖМЁМ его, а не
               заводим вторую копию логики: иначе два переключателя разошлись бы. */
            var words = new URLSearchParams(window.location.search).get('report') === 'words';
            host.appendChild(segmented([
                { value: 'suttas', label: t('quick.viewTexts', 'Тексты') },
                { value: 'words', label: t('quick.viewWords', 'Слова') }
            ], words ? 'words' : 'suttas', function (v) {
                if ((v === 'words') === words) return;
                var link = document.querySelector('.forshellscript a');
                if (link) link.click();
                closeQuick();
            }));
        }

        if (state === 'reader' || state === 'results' || state === 'toc') {
            /* Варианты чтения и режим колонок уже переключаются настоящими кнопками тулбара
               (#toggle-variants/#toggle-mode в ридере, #toggle-mode-results в выдаче,
               reader-template.html + megareader.js/switchView.js) — здесь просто ЖМЁМ их, как
               «Вид выдачи» выше жмёт .forshellscript, а не заводим вторую копию их логики
               (localStorage-ключи и подписи разошлись бы). Кнопок может не быть в DOM, если
               разметка ещё не смонтирована — тогда просто не показываем переключатель, а не
               мёртвый тумблер. Режим колонок и раньше был общесайтовым (dgApplyColumnMode в
               settings.js применяет .column-view и к #sutta, и к #search-pane) — здесь просто
               появилась видимая ручка для выдачи, поведение не менялось. */
            var readerLike = state === 'reader' || state === 'toc';
            var variantsBtn = readerLike ? document.getElementById('toggle-variants') : null;
            var columnsBtn = document.getElementById(readerLike ? 'toggle-mode' : 'toggle-mode-results');
            if (variantsBtn || columnsBtn) host.appendChild(groupTitle(t('quick.reading', 'Чтение')));
            if (variantsBtn) {
                var variantsOn = localStorage.getItem('variantVisibility') !== 'hidden';
                host.appendChild(toggleRow(t('quick.variants', 'Варианты чтения'), variantsOn, function () {
                    variantsBtn.click();
                }, 'Alt+V'));
            }
            if (columnsBtn) {
                var columnsOn = (localStorage.getItem('viewMode') || 'alternate') === 'columns';
                host.appendChild(toggleRow(t('quick.columnMode', 'Режим колонок'), columnsOn, function () {
                    columnsBtn.click();
                }, 'Alt+C'));
            }
            // Same localStorage key everywhere; live-reapply differs by state — reader re-fetches
            // via buildSutta, results just re-runs the DataTables render() on already-loaded rows
            // (window.DgSearchRender.redraw, search-render.js) since removePunct only affects display.
            var punctOn = localStorage.getItem('removePunct') === 'true';
            host.appendChild(toggleRow(t('quick.hidePunct', 'Скрыть пунктуацию Pāḷi'), punctOn, function (next) {
                localStorage.setItem('removePunct', String(next));
                if (state === 'reader') {
                    if (typeof window.buildSutta === 'function' && window.currentReaderSlug) {
                        window.buildSutta(window.currentReaderSlug);
                    }
                } else if (window.DgSearchRender && typeof window.DgSearchRender.redraw === 'function') {
                    window.DgSearchRender.redraw();
                }
            }, 'Alt+.'));
        }

        // Devanagari mode's script — body.dg-mode-dev is set by megareader.js only while that
        // mode (mode-table.json "devanagari", dualScript) is actually active, so this row only
        // shows up there. One <select> (same /settings/scripts.json list "Система письма пали"
        // already uses, not a second hardcoded list) + one toggle deciding whether the pick is
        // saved globally (selectedScript, same key /settings/ uses) or only for this mode
        // (devanagariModeScript, read by megareader.js only while dualScript is active) — not
        // two separate script dropdowns.
        if (state === 'reader' && document.body.classList.contains('dg-mode-dev')) {
            host.appendChild(groupTitle(t('quick.devScript', 'Скрипт для Деванагари')));

            var SCRIPT_MAIN = ['ISOPali', 'Brahmi', 'Devanagari', 'Sinhala', 'Thai', 'BurmeseMyanmar'];
            var SCRIPT_MAIN_LABELS = {
                ISOPali: t('quick.scriptLatin', 'Латиница (IAST)'),
                Brahmi: t('quick.scriptBrahmi', 'Брахми'),
                Devanagari: t('quick.scriptDevanagari', 'Деванагари'),
                Sinhala: t('quick.scriptSinhala', 'Сингальская'),
                Thai: t('quick.scriptThai', 'Тайская'),
                BurmeseMyanmar: t('quick.scriptBurmese', 'Бирманская (Мьянма)')
            };
            var scriptSelect = document.createElement('select');
            scriptSelect.className = 'dg-field-input dg-devscript-select';
            SCRIPT_MAIN.forEach(function (key) {
                var opt = document.createElement('option');
                opt.value = key;
                opt.textContent = SCRIPT_MAIN_LABELS[key];
                scriptSelect.appendChild(opt);
            });
            var otherGroup = document.createElement('optgroup');
            otherGroup.label = t('quick.scriptOther', 'Остальные');
            (scriptKeysList || [])
                .filter(function (k) { return SCRIPT_MAIN.indexOf(k) === -1 && k !== 'RomanIAST' && k !== 'RomanISO15919PI'; })
                .sort(function (a, b) { return a.localeCompare(b); })
                .forEach(function (k) {
                    var opt = document.createElement('option');
                    opt.value = k;
                    opt.textContent = k.replace(/([a-z])([A-Z])/g, '$1 $2');
                    otherGroup.appendChild(opt);
                });
            scriptSelect.appendChild(otherGroup);

            var effectiveDevScript = function () {
                var urlScript = new URLSearchParams(window.location.search).get('script');
                return urlScript || localStorage.getItem('devanagariModeScript') ||
                    localStorage.getItem('selectedScript') || 'Devanagari';
            };
            var syncScriptSelect = function () {
                var eff = effectiveDevScript().toLowerCase();
                var match = null;
                for (var i = 0; i < scriptSelect.options.length; i++) {
                    if (scriptSelect.options[i].value.toLowerCase() === eff) { match = scriptSelect.options[i]; break; }
                }
                scriptSelect.value = match ? match.value : 'Devanagari';
            };
            syncScriptSelect();
            host.appendChild(scriptSelect);

            // localOnlyOn tracks scope for BOTH controls below. Three real states live in the
            // one devanagariModeScript key: absent = never touched (default varies by surface —
            // ON here, since this panel only ever shows up already inside devanagari mode; OFF
            // on /settings/, see settings/index.html), '' = explicitly turned off (falsy, so
            // megareader.js's fallback chain already skips it — NOT removeItem, which would be
            // indistinguishable from "never touched" and silently revert to the ON default the
            // next time this panel opens), a real script key = override active.
            var storedDevScript = localStorage.getItem('devanagariModeScript');
            var localOnlyOn = storedDevScript === null ? true : storedDevScript !== '';
            var reapplyDevScript = function () {
                if (typeof window.buildSutta === 'function' && window.currentReaderSlug) {
                    window.buildSutta(window.currentReaderSlug);
                }
            };
            scriptSelect.addEventListener('change', function () {
                if (localOnlyOn) localStorage.setItem('devanagariModeScript', scriptSelect.value);
                else localStorage.setItem('selectedScript', scriptSelect.value);
                reapplyDevScript();
            });

            host.appendChild(toggleRow(t('quick.devScriptLocalOnly', 'Только в этом режиме'), localOnlyOn, function (next) {
                localOnlyOn = next;
                if (next) localStorage.setItem('devanagariModeScript', scriptSelect.value);
                else localStorage.setItem('devanagariModeScript', '');
                syncScriptSelect();
                reapplyDevScript();
            }));
        }

        host.appendChild(groupTitle(t('quick.diacritics', 'Диакритика Pāḷi')));
        var diac = document.createElement('div');
        diac.className = 'dg-diac';
        ['ā', 'ī', 'ū', 'ṁ', 'ñ', 'ṅ', 'ṭ', 'ḍ', 'ṇ', 'ḷ'].forEach(function (ch) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = ch;
            b.addEventListener('click', function () { insertIntoInput(ch); });
            diac.appendChild(b);
        });
        host.appendChild(diac);

        /* Имя переменной НЕ note: var поднимается на всю функцию и перекрывал бы одноимённый
           помощник note() выше по файлу — вызов в блоке про контекст падал с «note is not a
           function», и шторка обрывалась на середине (поймано в консоли). */
        var footNote = document.createElement('p');
        footNote.className = 'dg-qs-note';
        footNote.textContent = t('quick.note', 'Значения по умолчанию и подробный разбор по книгам — в полных настройках.');
        host.appendChild(footNote);
    }

    /* Подстановка символа в позицию курсора. Поле после этого не теряет фокус: продолжать набор
       нужно с того же места, а не с конца строки. */
    function insertIntoInput(ch) {
        var input = document.getElementById('paliauto');
        if (!input) return;
        var start = input.selectionStart == null ? input.value.length : input.selectionStart;
        var end = input.selectionEnd == null ? start : input.selectionEnd;
        input.value = input.value.slice(0, start) + ch + input.value.slice(end);
        var pos = start + ch.length;
        input.focus();
        try { input.setSelectionRange(pos, pos); } catch (e) { /* type=search в старых браузерах */ }
        syncInputChrome();
        renderHint();
    }

    /* Быстрые настройки — ВЫПАДАШКА под самой шестерёнкой, на любой ширине. Нижняя шторка на
       узком экране выглядела как отдельный раздел и уводила взгляд от поля, к которому эти
       настройки относятся; выпадашка остаётся рядом с кнопкой. Ширину и положение считаем по
       фактическому месту кнопки — она переезжает вместе с полем при смене состояния. */
    function placeAnchored(sheet, btn) {
        var r = btn.getBoundingClientRect();
        var margin = 8;
        // На узком экране выпадашка занимает всю доступную ширину, на широком — фиксированные 340.
        var width = Math.min(340, window.innerWidth - margin * 2);
        var left = Math.min(Math.max(margin, r.right - width), window.innerWidth - width - margin);
        sheet.style.width = width + 'px';
        sheet.style.left = left + 'px';
        // Owner: "должны открываться вниз без прокрутки по максимуму... сейчас багово на главной"
        // — strictly "below the button" left too little room when the anchor (the sliders button,
        // OR the home screen's ".dg-scope-change" — "change" — link under the search field when
        // that button is hidden there, see openQuick() above) sits high on a short page: measured
        // live on the home screen, 427px available below vs 733px of real content, forcing heavy
        // internal scroll even though the viewport itself had spare height ABOVE that point too.
        // Pull the top up (never above `margin` from the viewport edge) just enough to fit the
        // sheet's own natural height, so it only falls back to internal scrolling once the
        // content is genuinely taller than the whole viewport, not just the slice below the
        // anchor. sheet.scrollHeight reads the natural full height regardless of the max-height
        // clamp set below — the sheet is already visible (openQuick sets hidden=false) and
        // populated (buildQuickBody already ran) by the time this runs.
        var naturalHeight = sheet.scrollHeight;
        var maxTop = window.innerHeight - margin - naturalHeight;
        var top = Math.min(r.bottom + 8, Math.max(margin, maxTop));
        sheet.style.top = top + 'px';
        sheet.style.maxHeight = Math.max(220, window.innerHeight - top - margin) + 'px';
    }

    /* External hotkeys (Alt+V/Alt+C/Alt+. in megareader.js/settings.js) change the underlying
       localStorage/button state directly, outside this panel — if the panel happens to be open
       when that fires, its toggle rows would otherwise show stale state until next open/close.
       Called from those hotkey handlers after they apply the change. */
    window.refreshQuickSettings = function () {
        if (isQuickOpen()) buildQuickBody(document.getElementById('dg-quick-body'));
    };

    function openQuick() {
        closeMega();
        ensureQuick();
        var sheet = document.getElementById('dg-quick');
        var backdrop = document.getElementById('dg-sheet-backdrop');
        var btn = document.getElementById('dg-quick-btn');
        // Home screen hides the sliders button inside the field (production-v4 redesign) and
        // opens this sheet from the "изменить" link under it instead — a display:none button has
        // no box to anchor to, so anchor to the link in that case.
        if (btn && !btn.offsetParent) btn = document.querySelector('.dg-scope-change') || btn;
        sheet.hidden = false;
        document.getElementById('dg-quick-title').textContent = t('quick.title', 'Быстрые настройки');
        buildQuickBody(document.getElementById('dg-quick-body'));

        var anchored = !!btn;
        sheet.classList.toggle('dg-anchored', anchored);
        if (anchored) placeAnchored(sheet, btn);
        else sheet.removeAttribute('style');

        if (btn) btn.setAttribute('aria-expanded', 'true');
        showLater(sheet, backdrop, anchored);
    }

    // ======================================================================
    // Мега-меню (пилот на плитке External) — тот же анкоренный попап, что у быстрых настроек
    // (#dg-quick), но шире и в несколько колонок вместо списка + вкладок. Опция плитки
    // "mega": true (menu-links.json); группы внутри неё несут "column" (1/2/3) — сами данные и
    // renderItem()/isStarred()/toggleUserStar() те же, что у обычной шторки, меняется только
    // раскладка и то, что вкладок-переключателей на других плитках здесь нет (владелец: "на
    // мобильных делай дропдаун на всю ширину экрана").
    // ======================================================================
    function ensureMega() {
        if (document.getElementById('dg-mega')) return;
        ensureBackdrop();
        var sheet = document.createElement('div');
        sheet.id = 'dg-mega';
        sheet.className = 'dg-sheet dg-anchored dg-mega';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.hidden = true;
        sheet.innerHTML =
            '<div class="dg-sheet-head"><h2 id="dg-mega-title"></h2>' +
            '<button type="button" class="dg-sheet-close" aria-label="' + esc(t('global.common.close', 'Close')) + '">&times;</button></div>' +
            '<div class="dg-sheet-body" id="dg-mega-body"></div>';
        sheet.querySelector('.dg-sheet-close').addEventListener('click', closeMega);
        document.body.appendChild(sheet);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isMegaOpen()) closeMega();
        });
    }

    function isMegaOpen() {
        var m = document.getElementById('dg-mega');
        return !!(m && m.classList.contains('show'));
    }

    function closeMega() {
        var sheet = document.getElementById('dg-mega');
        var backdrop = document.getElementById('dg-sheet-backdrop');
        if (!sheet) return;
        sheet.classList.remove('show');
        if (backdrop && !currentSheetKey && !isQuickOpen()) backdrop.classList.remove('show');
        currentMegaKey = null;
        document.body.classList.remove('dg-mega-compact');
        setTimeout(function () { if (!isMegaOpen()) sheet.hidden = true; }, 320);
    }

    /* Позиционирование мега-меню: mega-панель теперь desktop-only (runTile(), window.innerWidth
       >= 768), так что ей больше не нужно сжиматься до ширины поля поиска (владелец, прошлый
       раунд) — та ширина (~600-720px) как раз и не давала места под колонки без скролла.
       Владелец: "чтобы ширина десктопа использовалась... 5 колонок" — берём щедрую ширину под
       5 колонок (auto-fit/minmax(190px) в CSS), а не привязываемся к узкому полю. Центровка —
       по горизонтальному центру поля (визуально остаётся под поиском), не по его краям.
       Вертикально — под РЯДОМ плиток (btn), не под полем: иначе перекрывало бы сами плитки.
       Отдельно от placeAnchored() у быстрых настроек — той нужна ширина 340 и прижатие к
       ПРАВОМУ краю кнопки. */
    function placeMegaAnchored(sheet, btn) {
        var margin = 8;
        var input = document.getElementById('paliauto');
        var fr = input ? input.getBoundingClientRect() : btn.getBoundingClientRect();
        var centerX = fr.left + fr.width / 2;
        // 5 columns × 190px minmax + 4×28px gaps + 36px body padding ≈ 1098px minimum
        // (owner: "5 колонок"), rounded up a bit for breathing room.
        var width = Math.min(1120, window.innerWidth - margin * 2);
        var left = Math.min(Math.max(margin, centerX - width / 2), window.innerWidth - width - margin);
        // .dg-mega is position:absolute (document-relative), not fixed — see home.css. getBoundingClientRect()
        // returns VIEWPORT-relative coordinates, so scrollX/scrollY are added to land in document coordinates.
        // Owner: "не должно быть скролла... за счёт общего сдвига экрана его нужно прокручивать, а не за счёт
        // какого-то своего отдельного скроллбара" — no maxHeight/overflow here on purpose: if the panel is
        // taller than the viewport, the PAGE scrolls to reveal the rest (scrollForMega() below gives it room
        // first), instead of a nested scrollbar.
        sheet.style.left = (left + window.scrollX) + 'px';
        sheet.style.width = width + 'px';

        var r = btn.getBoundingClientRect();
        sheet.style.top = (r.bottom + window.scrollY + 10) + 'px';

        // "мегаменю расширяется/растягивается из соответствующей кнопки" — scale-in anchored at the
        // button's X (home.css .dg-mega.show scales from transform-origin instead of just fading).
        // transform-origin is relative to the SHEET's own box, so btn's viewport X minus the sheet's
        // own (pre-scroll-offset) left edge, clamped inside the sheet's width.
        var originX = Math.min(Math.max(0, (r.left + r.width / 2) - left), width);
        sheet.style.transformOrigin = originX + 'px -6px';
    }

    /* Подтягивает страницу так, чтобы ПОЛЕ ПОИСКА (не плитка) оказалось у верха экрана с небольшим
       отступом — освобождает максимум места под мега-меню без внутреннего скролла. Сжатие зазоров
       над рядом плиток (body.dg-mega-compact, home.css) делает вызывающий openMega() ДО этой
       функции (порядок важен: позиция поля должна читаться уже после сжатия). Owner: "инпут — самый
       важный элемент сайта, крутить нужно до него"; "можешь сжимать расстояние между инпутом и
       кнопками мультитула — это даст ещё места". home.css уже нёс готовые правила под
       dg-mega-compact (комментарий "toggled by scrollForMega()") — самой функции не было, только
       сейчас дописана. */
    function scrollForMega() {
        var margin = 16;
        var input = document.getElementById('paliauto');
        if (!input) return;
        var r = input.getBoundingClientRect();
        if (Math.abs(r.top - margin) < 4) return; // already close enough, skip a no-op scroll
        var targetY = window.scrollY + r.top - margin;
        window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    }

    function openMega(key, btn) {
        closeSheet();
        closeQuick();
        ensureMega();
        var data = menuData[menuLang()];
        var tile = data[key];
        if (!tile) return;

        currentMegaKey = key;
        currentMegaBtn = btn;
        var sheet = document.getElementById('dg-mega');
        var backdrop = document.getElementById('dg-sheet-backdrop');
        sheet.hidden = false;
        document.getElementById('dg-mega-title').textContent = tile.label;

        // Группы раскладываются по колонкам ("column" в menu-links.json), порядок внутри
        // колонки — как в файле. Группа без "column" считается первой колонкой.
        var body = document.getElementById('dg-mega-body');
        body.innerHTML = '';
        var cols = {};
        var colNums = [];
        (tile.groups || []).forEach(function (g) {
            var c = g.column || 1;
            if (!cols[c]) {
                cols[c] = document.createElement('div');
                cols[c].className = 'dg-mega-col';
                colNums.push(c);
            }
            var h = document.createElement('p');
            h.className = 'dg-group-title';
            h.textContent = g.name;
            cols[c].appendChild(h);

            if (g.blocks) {
                // "blocks" — a group that bundles several real prod clusters under ONE header
                // (owner: "не выделяй suttacentral в отдельный" — SC/Vinaya/Voice/Legacy get no
                // header of their own, just a quiet rule above them, same "Collections" umbrella
                // as everything else in this column). block.divider adds that rule; block.inline
                // renders as a dense one-line chip row (no per-item description), block.rows as
                // normal full rows — same renderItem() either way, just grouped differently from
                // the plain g.items case below.
                g.blocks.forEach(function (block) {
                    var wrap = document.createElement('div');
                    wrap.className = block.divider ? 'dg-mega-block dg-mega-block-divider' : 'dg-mega-block';
                    if (block.inline) {
                        var line = document.createElement('div');
                        line.className = 'dg-chip-group';
                        block.inline.forEach(function (item) { line.appendChild(renderItem(item, true)); });
                        wrap.appendChild(line);
                    } else {
                        (block.rows || []).forEach(function (item) { wrap.appendChild(renderItem(item)); });
                    }
                    cols[c].appendChild(wrap);
                });
            } else if (g.layout === 'chips') {
                var chipWrap = document.createElement('div');
                chipWrap.className = 'dg-chip-group';
                g.items.forEach(function (item) { chipWrap.appendChild(renderItem(item, true)); });
                cols[c].appendChild(chipWrap);
            } else {
                g.items.forEach(function (item) { cols[c].appendChild(renderItem(item)); });
            }
        });
        colNums.sort(function (a, b) { return a - b; }).forEach(function (c) { body.appendChild(cols[c]); });

        if (backdrop) backdrop.classList.add('dg-transparent');
        // Compact the gaps above the tile row FIRST — placeMegaAnchored() below reads the row's
        // post-compact position, otherwise it'd anchor to where the row sat before the shrink.
        document.body.classList.add('dg-mega-compact');
        placeMegaAnchored(sheet, btn);
        showLater(sheet, backdrop, true);
        scrollForMega();
    }

    // ======================================================================
    // Боковое меню (выезжает шторкой; сторону задаёт #dg-drawer в home.css)
    // ======================================================================
    // Owner: "не нужны ru en r+r ee и т.п." — modeTable[key].label (Ru/En/R+R/E+E/Mem) is a
    // presentational short code meant for the tight in-text mode-switch panel (scLink,
    // megareader.js), not a real name. Proper title + description per row here instead,
    // matching prod's actual settings-gear wording (Standard/Multi Trn/For Memorization/Multi
    // Lang) — same deal as MODE_DESCRIPTIONS below, only here not in configs/search/lang_*.json:
    // helper text local to this one list, not a general interface string.
    // Owner: "стандарт не понятно... стандарт должно быть один перевод" + "на названия теперь
    // много места так и пиши нормально, мульти перевод, мульти язык" — now that this list lives
    // in the burger drawer (not a cramped floating modal), full clear words beat vague/short
    // ones: "Standard" didn't say WHAT was standard, and "Multi Trn"/"Multi Lang" were only
    // abbreviated because the old modal had no room.
    // Owner: режимы — язык-независимые типы (single/multi/memorize/devanagari),
    // язык — отдельная ось (?lang=/?langs=, см. megareader.js). Поэтому описания больше не могут
    // называть конкретный язык ("+ русский"/"+ английский") — они универсальны для любого языка.
    var MODE_TITLES = {
        single: { ru: 'Читать', en: 'Reading' },
        multi: { ru: 'Мульти', en: 'Multi' },
        memorize: { ru: 'Для запоминания', en: 'For Memorization' },
        // Owner: this one row's name stays quoted — "Devanagari" is used loosely for the whole
        // mode (any non-Latin script, not literally the Devanagari script), quotes flag that.
        devanagari: { ru: '"Деванагари"', en: '"Devanagari"' }
    };
    // issue #6: multiTran и multiLang слились в «Мульти» — набор языков и переводчиков теперь
    // один, а разница между пунктами не в том, ЧТО можно включить, а в том, запоминается ли это:
    // «Читать» всегда открывается на основном языке (включённое сверх — до конца текста),
    // «Мульти» открывается на сохранённом наборе.
    var MODE_DESCRIPTIONS = {
        single: { ru: 'Всегда на основном языке', en: 'Always in your main language' },
        multi: { ru: 'Сохранённый набор языков и переводчиков', en: 'Your saved set of languages and translators' },
        memorize: { ru: 'Мнемоника по первой букве', en: 'First-letter mnemonic' },
        devanagari: { ru: 'Pāḷi в другом письме + Pāḷi латиницей', en: 'Pāḷi in another script + Pāḷi in Roman' }
    };

    /* Список режимов чтения в бургере — owner: "выводи первым делом режимы ридера", чтобы
       можно было переключать/тестировать их без ручного ?mode= в адресе. Источник данных —
       window.MODE_TABLE (reader/mode-table.json, тот же файл, что уже питает scLink в самом
       тексте, megareader.js) — перерисовывается при КАЖДОМ открытии шторки, а не один раз, тем
       же принципом, что buildQuickBody(): активный режим меняется без перезагрузки страницы. */
    function makeModeRow(title, hotkey, desc, isActive, onClick) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'dg-mode-row' + (isActive ? ' active' : '');
        var top = document.createElement('span');
        top.className = 'dg-mode-row-top';
        var titleEl = document.createElement('span');
        titleEl.textContent = title;
        top.appendChild(titleEl);
        // Owner: "нужно чтобы это было видимо пользователю что есть горячие клавиши" — same
        // digit window.MODE_HOTKEY_DIGITS (settings.js) actually listens for, not decoration.
        if (hotkey) {
            var hk = document.createElement('span');
            hk.className = 'dg-mode-row-hotkey';
            hk.textContent = 'Alt+' + hotkey;
            top.appendChild(hk);
        }
        row.appendChild(top);
        if (desc) {
            var descEl = document.createElement('span');
            descEl.className = 'dg-mode-row-desc';
            descEl.textContent = desc;
            row.appendChild(descEl);
        }
        row.addEventListener('click', function () {
            onClick();
            closeDrawer();
        });
        return row;
    }

    // owner: "сделай режимы чтения сворачиваемыми... и запомнить что свёрнуто" — same "read only
    // when shown, persist on the native <details> 'toggle' event" pattern public/spa/toc.js
    // already uses for its translator-filter aside (dhammaTocAsideOpen). Default OPEN (unlike
    // that aside's responsive default): this list already existed open-by-default, collapsing is
    // an opt-in for someone who doesn't need it, not a new default to discover.
    function readerModesOpenPref() {
        var raw = localStorage.getItem('dgReaderModesOpen');
        return raw === null ? true : raw === '1';
    }

    // Same pattern for #dg-drawer-multitool itself, everywhere EXCEPT reader/TOC — owner:
    // "мультитул нужно сворачивать не сохраняя состояние только там где есть режимы для чтения
    // [reader/TOC]... в остальных местах нужно запоминать в каком состоянии был мультитул и
    // сохранять его". Reader/TOC keep the old unconditional force-closed (openDrawer() below,
    // unchanged) — the reading-modes list sits right under it there and must never get buried by
    // a remembered "was open" from some other page. Default true: home's own behavior used to be
    // "always force open" outright; defaulting the remembered pref to open preserves that as the
    // first-time experience, after which the user's own last choice takes over.
    function multitoolOpenPref() {
        var raw = localStorage.getItem('dgMultitoolOpen');
        return raw === null ? true : raw === '1';
    }

    function paintReaderModes() {
        var section = document.getElementById('dg-drawer-modes');
        var list = document.getElementById('dg-drawer-modes-list');
        if (!section || !list) return;

        // Wired once (not on every repaint, which runs on every drawer open) — the element
        // itself is static in the HTML, only #dg-drawer-modes-list's contents get rebuilt below.
        if (!section.dataset.toggleWired) {
            section.dataset.toggleWired = '1';
            section.addEventListener('toggle', function () {
                localStorage.setItem('dgReaderModesOpen', section.open ? '1' : '0');
            });
        }

        // TOC shares the reader's modes (owner: same modes, same burger/quick settings there).
        var isReader = document.body.classList.contains('dg-state-reader') || document.body.classList.contains('dg-state-toc');
        var modeTable = window.MODE_TABLE;
        var readerMode = window.READER_MODE;
        if (!isReader || !modeTable || !readerMode) { section.hidden = true; return; }

        section.hidden = false;
        section.open = readerModesOpenPref();
        list.innerHTML = '';
        var lang = menuLang() === 'ru' ? 'ru' : 'en';

        // Owner: mode-table.json keys are language-independent types now (single/multi/
        // memorize/devanagari) — no more per-language duplicate keys (was st/mt/ml vs
        // read/ee), so the "задублировались, пункты по два раза" family-filter this list used to
        // need doesn't apply anymore: exactly one row per type, always. Switching the reading
        // language is a separate, existing control (the language toggle), not this list's job.
        // Owner: "в меню бургере вне зависимости от русского и английского языка должны быть в
        // одинаковом порядке режимы... они должны быть расположены в том же порядке в котором
        // идут их горячие клавиши" — sort by hotkey digit (settings.js — one source of truth for
        // both), same order in every language.
        // Показываем только режимы, которые знает ЭТА сборка (у каждого есть цифра-хоткей,
        // settings.js MODE_HOTKEY_DIGITS — тот же источник, по которому список и сортируется).
        // issue #6: mode-table.json отдаётся с max-age=3600, поэтому после выката ключей
        // (multiTran/multiLang уехали в multi) браузер до часа отдаёт старую таблицу из HTTP-кеша
        // — без этого фильтра в меню висели два мёртвых пункта, которые ничего не переключают.
        var hotkeyDigits = window.MODE_HOTKEY_DIGITS || {};
        var types = Object.keys(modeTable).filter(function (k) { return !!hotkeyDigits[k]; })
            .sort(function (a, b) { return hotkeyDigits[a] - hotkeyDigits[b]; });
        types.forEach(function (type) {
            var isActive = readerMode.modeKey === type;
            var titleInfo = MODE_TITLES[type];
            var title = titleInfo ? titleInfo[lang] : (modeTable[type].label || type);
            var desc = MODE_DESCRIPTIONS[type];
            list.appendChild(makeModeRow(title, hotkeyDigits[type], desc && desc[lang], isActive, function () {
                if (!isActive && typeof window.switchReaderMode === 'function') {
                    window.switchReaderMode(type);
                }
            }));
        });

        // Owner: "navigation если есть доп кнопки должен быть свернут" — the modes list above
        // takes priority whenever it's showing (reader context); collapse Navigation so it
        // doesn't visually compete with it every time the drawer opens.
        var navDetails = document.querySelector('.dg-drawer-group');
        if (navDetails) navDetails.open = false;
    }

    function openDrawer() {
        var d = document.getElementById('dg-drawer');
        var b = document.getElementById('dg-drawer-backdrop');
        if (!d) return;
        paintReaderModes();
        var multitool = document.getElementById('dg-drawer-multitool');
        if (multitool) {
            // Wired once — the element is static in the HTML, this listener just needs to exist.
            if (!multitool.dataset.toggleWired) {
                multitool.dataset.toggleWired = '1';
                multitool.addEventListener('toggle', function () {
                    var st = currentState();
                    // Reader/TOC force it closed every time (branch below) — a toggle event CAN
                    // still fire there (paintReaderModes' own "навигация... должен быть свёрнут"
                    // collapse, or the user clicking it right before navigating away), and saving
                    // that would leak into every OTHER page's remembered state. Only persist where
                    // the memory is actually meant to apply.
                    if (st !== 'reader' && st !== 'toc') {
                        localStorage.setItem('dgMultitoolOpen', multitool.open ? '1' : '0');
                    }
                });
            }
            // Reader/TOC: always folded, never remembered (owner: "чтобы юзер не потерял режимы
            // чтения" — the reading-modes list sits right under it). Everywhere else (home,
            // results, ...): whatever the user last left it as (owner: "если открыто — открытым
            // было, если свёрнутым — свёрнутым") — replaces the old hardcoded "home always forces
            // it open".
            if (currentState() === 'reader' || currentState() === 'toc') multitool.open = false;
            else multitool.open = multitoolOpenPref();
        }
        d.hidden = false;
        if (b) b.hidden = false;
        // Locks body scroll (home.css: body.dg-drawer-open { overflow: hidden }) — mobile
        // "white edge" fix: with body unable to rubber-band while the drawer is open, the
        // page behind it can't visually shift and reveal itself at an edge during a drag.
        document.body.classList.add('dg-drawer-open');
        showLater(d, b);
    }

    function closeDrawer() {
        var d = document.getElementById('dg-drawer');
        var b = document.getElementById('dg-drawer-backdrop');
        if (!d || d.hidden) return;
        d.classList.remove('show');
        if (b) b.classList.remove('show');
        document.body.classList.remove('dg-drawer-open');
        setTimeout(function () {
            if (!d.classList.contains('show')) { d.hidden = true; if (b) b.hidden = true; }
        }, 320);
    }

    /* #home-extra/#home-howto свёрнуты по умолчанию на узком экране (home.css,
       .dg-anchor-revealed) — если хеш адреса указывает на что-то внутри одного из них, значит
       сюда именно навигировали (бургер, список "Show all"), и блок надо раскрыть и докрутить.
       Один обработчик и на переход по хешу без перезагрузки, и на прямой заход с хешем в адресе. */
    function revealAnchorSection() {
        var id = (window.location.hash || '').slice(1);
        if (!id) return;
        // «Как искать» / «Приложения» / «Контакты» больше не блоки главной, а разделы шторки
        // «О проекте» — старые якоря (/#contacts из бургера и из «Показать все») ведут в неё.
        if (id === 'howto' || id === 'links' || id === 'contacts') { openAbout(id); return; }
        var el = document.getElementById(id);
        if (!el) return;
        var section = el.closest('#home-extra, #home-howto');
        if (section) section.classList.add('dg-anchor-revealed');
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    window.addEventListener('hashchange', revealAnchorSection);

    function wireDrawer() {
        // Бургеров два — в шапке главной и рядом с полем в выдаче/чтении; меню у них одно.
        Array.prototype.forEach.call(document.querySelectorAll('.dg-menu-btn'), function (btn) {
            btn.addEventListener('click', openDrawer);
        });
        // Пункты «Приложения и расширения» / «Контакты» — якоря на блоки #home-extra (видны
        // только на широком экране, см. .dg-drawer-row[data-dg-anchor] в home.css). Ставим
        // location.hash вместо ручного scrollIntoView — браузер сам скроллит И подсвечивает
        // (hashchange -> applyHashHighlights, settings.js), одним нативным действием вместо двух
        // рукописных. closeDrawer раньше: пока шторка открыта, она перекрывает низ страницы.
        Array.prototype.forEach.call(document.querySelectorAll('[data-dg-anchor]'), function (row) {
            row.addEventListener('click', function () {
                closeDrawer();
                setTimeout(function () { window.location.hash = row.dataset.dgAnchor; }, 200);
            });
        });
        var back = document.getElementById('dg-drawer-backdrop');
        if (back) back.addEventListener('click', closeDrawer);
        var close = document.querySelector('#dg-drawer .dg-drawer-close');
        if (close) close.addEventListener('click', closeDrawer);
        // issue #5: navigator.share() opens the native OS sheet (Android/iOS/most mobile
        // browsers); desktop browsers that lack it fall back to copying the current URL, same
        // idea as copyToClipboard.js's "Copy Link" elsewhere on the page (kept independent here —
        // that one is scoped to a specific quote's citation link, this is just "this page").
        var shareBtn = document.querySelector('#dg-drawer .dg-drawer-share');
        if (shareBtn) {
            shareBtn.addEventListener('click', function () {
                var url = window.location.href;
                var title = document.title;
                if (navigator.share) {
                    navigator.share({ title: title, url: url }).catch(function () { /* user cancelled — not an error */ });
                    return;
                }
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url).then(function () {
                        if (typeof window.showBubbleNotification === 'function') {
                            window.showBubbleNotification(t('menu.linkCopied', 'Ссылка скопирована'));
                        }
                    });
                }
            });
        }
        var drawer = document.getElementById('dg-drawer');
        if (drawer) {
            // Пункт «помощь» открывает bootstrap-модалку — меню при этом должно уйти само.
            drawer.addEventListener('click', function (e) {
                if (e.target.closest && e.target.closest('.dg-drawer-row')) closeDrawer();
            });
        }
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeDrawer();
            // Alt+M opens/closes the burger menu (owner). By code, not key: Option+M on macOS
            // produces "µ", and a non-Latin layout another letter. Punctuation stays on Alt+. / Alt+,.
            if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyM') {
                e.preventDefault();
                var d = document.getElementById('dg-drawer');
                if (d && !d.hidden && d.classList.contains('show')) closeDrawer(); else openDrawer();
            }
        });
    }

    // ======================================================================
    // Плитки
    // ======================================================================
    function renderTiles() {
        var host = document.getElementById('home-tiles');
        // Pages without the tile grid (public/404.html) still have the burger's multitool
        // list — it was only ever rendered from the tail of this function, so it stayed empty
        // there (owner screenshot, 2026-09-06).
        if (!host && menuData) renderDrawerTiles();
        if (!host || !menuData) return;
        var data = menuData[menuLang()];
        host.innerHTML = '';

        var hidden = hiddenTiles();
        tileOrder().forEach(function (key) {
            var tile = tileData(key);
            if (!tile || hidden.indexOf(key) !== -1) return;

            /* Все плитки — <button>, даже те, что просто ведут по ссылке: у <a> браузер
               начинает СВОЁ перетаскивание (ссылки и картинки перетаскиваемы по умолчанию), и
               наш порядок с ним конфликтовал бы. Переход по href делает runTile(). */
            var el = document.createElement('button');
            el.type = 'button';
            el.className = 'dg-tile';
            el.dataset.tile = key;
            /* Описание (menu-links.json desc у плитки, либо своё из формы правки). Owner: "мини
               описания под названиями тайлов... текущую версию не убирай, может не зайдет" —
               поэтому две формы: строкой под названием, когда включено в шторке «Настройки»
               (tileDescEnabled, по умолчанию да), иначе — как раньше, нативный tooltip. */
            var showDesc = tile.desc && tileDescEnabled();
            if (tile.desc && !showDesc) el.title = tile.desc;
            /* Иконка — в кружке из акцентного фона: так плитка читается как значок с подписью,
               а не как строка списка в рамке. */
            el.innerHTML = '<span class="dg-tile-ic">' + iconHtml(tile.icon) + '</span>' +
                '<span class="dg-tile-label">' + esc(tile.label) + '</span>' +
                (showDesc ? '<span class="dg-tile-desc">' + esc(tile.desc) + '</span>' : '');
            el.addEventListener('click', function () {
                // Клик, приходящий сразу за перетаскиванием, — не выбор плитки.
                if (el.dataset.dragged === '1') { el.dataset.dragged = ''; return; }
                runTile(key, el);
            });

            host.appendChild(el);
        });

        wireTileDrag(host);
        syncRestoreLink();
        renderDrawerTiles();
    }

    /* Мультитул в бургере (search/index.html #dg-drawer-tiles) — просто список плиток, в том же
       порядке и с теми же скрытиями, что на главной (owner: «меню компактнее, только из тайлов»).
       Клик делает ровно то же, что клик по плитке на главной — runTile(): на десктопе мегаменю
       (у плиток с mega:true) или нижняя шторка, на телефоне — шторка; плитки-действия (Читать
       Pāḷi, История, Помощь) — своё действие. Якорь для мегаменю — сама плитка главной, если она
       на экране, иначе кнопка бургера (мегаменю встаёт под ней и центрируется по полю поиска). */
    function renderDrawerTiles() {
        var host = document.getElementById('dg-drawer-tiles');
        if (!host || !menuData) return;
        host.innerHTML = '';
        var hidden = hiddenTiles();
        tileOrder().forEach(function (key) {
            var tile = tileData(key);
            if (!tile || hidden.indexOf(key) !== -1) return;
            var a = document.createElement('a');
            a.className = 'dg-drawer-row';
            a.href = tile.href || 'javascript:void(0)';
            // drawerLabel/drawerIcon (menu-links.json, optional): burger-only override, home tile
            // untouched — owner: "History" reads as covering just history, but the row (and the
            // quickModal it opens) is really Favorites+History+4NT together; wanted that spelled
            // out with a star in the drawer specifically, NOT as a second row and NOT on the home
            // tile grid ("на главной плитки не трогай").
            a.innerHTML = '<span class="dg-row-ic dg-drawer-tile-ic">' + iconHtml(tile.drawerIcon || tile.icon) + '</span>' +
                '<span class="dg-row-label">' + esc(tile.drawerLabel || tile.label) + '</span>';
            a.addEventListener('click', function (e) {
                e.preventDefault();
                closeDrawer();
                // After the drawer has slid away — the mega/sheet backdrop is the same element the
                // drawer uses, and its open/close transitions would otherwise fight each other.
                setTimeout(function () {
                    var homeTile = document.querySelector('.dg-tile[data-tile="' + key + '"]');
                    var anchor = (homeTile && homeTile.offsetParent) ? homeTile
                        : Array.prototype.find.call(document.querySelectorAll('.dg-menu-btn'), function (b) { return b.offsetParent; }) || null;
                    runTile(key, anchor);
                }, 250);
            });
            host.appendChild(a);
        });
    }

    /* Перетаскивание плиток.
       Не HTML5 drag-and-drop: он не работает в мобильных браузерах, а плитки нужны прежде всего
       там. Реализация на pointer-событиях: мышью тащим после 5 px сдвига (чтобы не мешать
       обычному клику), пальцем — после удержания в 250 мс, иначе отобрали бы у человека
       прокрутку страницы. Порядок сохраняется сразу по отпусканию, в localStorage.dgTileOrder. */
    var tileDragWired = false;

    function wireTileDrag(host) {
        /* Обработчики делегированы на сам контейнер, а он между перерисовками один и тот же
           (renderTiles чистит только его содержимое) — вешаем ровно один раз, иначе после
           каждой перерисовки они бы накапливались и одно нажатие запускало бы несколько
           перетаскиваний сразу. */
        if (tileDragWired) return;
        tileDragWired = true;

        var drag = null;

        function tileUnder(x, y) {
            var list = document.elementsFromPoint(x, y) || [];
            for (var i = 0; i < list.length; i++) {
                var el = list[i];
                if (el.classList && el.classList.contains('dg-tile') && el !== drag.el) return el;
            }
            return null;
        }

        function start(e) {
            var el = drag.el;
            var r = el.getBoundingClientRect();
            var ph = document.createElement('div');
            ph.className = 'dg-tile-placeholder';
            ph.style.height = r.height + 'px';
            el.parentNode.insertBefore(ph, el);

            drag.placeholder = ph;
            drag.offX = drag.startX - r.left;
            drag.offY = drag.startY - r.top;
            drag.active = true;
            el.dataset.dragged = '1';

            document.body.classList.add('dg-tiles-dragging');
            el.classList.add('dg-dragging');
            el.style.width = r.width + 'px';
            el.style.height = r.height + 'px';
            move(e);
        }

        function move(e) {
            var el = drag.el;
            el.style.left = (e.clientX - drag.offX) + 'px';
            el.style.top = (e.clientY - drag.offY) + 'px';

            var over = tileUnder(e.clientX, e.clientY);
            if (!over) return;
            var r = over.getBoundingClientRect();
            // Ниже/правее середины соседа — встаём за ним, иначе перед.
            var after = (e.clientY - r.top) > r.height / 2 ||
                ((e.clientX - r.left) > r.width / 2 && Math.abs(e.clientY - (r.top + r.height / 2)) < r.height / 2);
            over.parentNode.insertBefore(drag.placeholder, after ? over.nextSibling : over);
        }

        function finish() {
            if (!drag) return;
            var el = drag.el;
            if (drag.timer) clearTimeout(drag.timer);
            if (drag.active) {
                drag.placeholder.parentNode.insertBefore(el, drag.placeholder);
                drag.placeholder.remove();
                el.classList.remove('dg-dragging');
                el.removeAttribute('style');
                document.body.classList.remove('dg-tiles-dragging');
                saveTileOrder(Array.prototype.map.call(host.querySelectorAll('.dg-tile'), function (x) {
                    return x.dataset.tile;
                }));
                // Порядок только что мог разойтись с исходным — «вернуть как было» должно
                // появиться сразу, не дожидаясь следующей перерисовки плиток.
                syncRestoreLink();
                // Флаг снимает сам обработчик клика, который придёт следом; если клика не будет
                // (палец), снимаем сами на следующем тике.
                setTimeout(function () { el.dataset.dragged = ''; }, 300);
            }
            drag = null;
        }

        host.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            var el = e.target.closest ? e.target.closest('.dg-tile') : null;
            if (!el) return;
            drag = { el: el, startX: e.clientX, startY: e.clientY, active: false, timer: null, pointerId: e.pointerId };
            // Захват указателя — иначе при быстром движении события уходят элементу под курсором.
            try { el.setPointerCapture(e.pointerId); } catch (err) { /* не поддержано */ }
            if (e.pointerType !== 'mouse') {
                drag.timer = setTimeout(function () { if (drag && !drag.active) start(e); }, 250);
            }
        });

        host.addEventListener('pointermove', function (e) {
            if (!drag || e.pointerId !== drag.pointerId) return;
            if (!drag.active) {
                // Owner: "тайлы всё время срываются" при перетаскивании пальцем — 5px было впору
                // мыши (точный курсор), но палец во время 250ms удержания (setTimeout выше)
                // естественно дрожит на 5-10px и больше, отменяя ещё не начавшееся перетаскивание
                // почти каждый раз. Мышь стартует сразу по движению (5px там и остаётся —
                // курсор точный, дрожать нечему), у пальца порог для «это скролл, а не тряска
                // руки» — заметно шире, типичный touch-slop (~24px и меньше уже даёт ложные
                // отмены на реальном устройстве, судя по жалобе).
                var slop = e.pointerType === 'mouse' ? 5 : 24;
                var far = Math.abs(e.clientX - drag.startX) > slop || Math.abs(e.clientY - drag.startY) > slop;
                if (!far) return;
                if (e.pointerType === 'mouse') { drag.startX = e.clientX; drag.startY = e.clientY; start(e); }
                // Палец сдвинулся до срабатывания удержания — это прокрутка, а не перетаскивание.
                else { clearTimeout(drag.timer); drag = null; }
                return;
            }
            e.preventDefault();
            move(e);
        });

        /* Owner: "тайлы не драгабл в моб версии, только мышкой, пальцем не работает". Причина:
           браузер решает "этот жест — прокрутка" по СВОИМ touch-событиям, и preventDefault на
           pointermove выше на это не влияет — как только нативная прокрутка началась, указатель
           отбирается (pointercancel) и перетаскивание умирает, ещё не начавшись. Гасить нужно
           именно нативный touchmove, и слушатель обязан быть passive:false (по умолчанию для
           touchmove он passive, preventDefault там молча игнорируется).
           Гасим ТОЛЬКО когда перетаскивание уже началось (после 250 мс удержания) — до этого
           палец должен листать страницу как обычно. По той же причине у .dg-tile НЕ стоит
           touch-action:none (тоже чинит перетаскивание, но ценой прокрутки: с плитки, а они
           занимают почти весь первый экран, страница вообще перестала бы листаться). */
        host.addEventListener('touchmove', function (e) {
            if (drag && drag.active) e.preventDefault();
        }, { passive: false });

        host.addEventListener('pointerup', finish);
        host.addEventListener('pointercancel', finish);
    }

    // ======================================================================
    // «Интересные запросы» — слайд-шоу с боевой главной
    // ======================================================================
    /* Набор перенесён один-в-один из легаси-главной: config/translate.php, массив $slides (свой
       для ru/en/th), который index.php тасовал и крутил bootstrap-каруселью, а «показать все»
       открывало модалку со списком. Здесь то же самое: порядок случайный при каждой загрузке,
       автопрокрутка, стрелки и полный список — но своей разметкой, без bootstrap-карусели.
       Данные лежат в configs/search/slides.json (/nodejs/res/slides.json), извлечены из PHP. */
    var SLIDES_URL = '/nodejs/res/slides.json';
    var slidesData = null;
    var slidesShown = [];

    // ======================================================================
    // Объявления над полем поиска
    // ======================================================================
    /* Короткая плашка с анонсом (новая версия, работы на сервере и т.п.). Всё, что определяет
       поведение, лежит в configs/search/announcements.json — здесь только показ:
         flag    — своя метка объявления, ИМЕННО ПО НЕЙ ведётся учёт «закрыто» в localStorage
                   (если не задана — берётся id). Сменил метку — объявление снова увидят ВСЕ,
                   даже те, кто закрыл прошлое; оставил ту же и поправил текст — увидят только
                   те, кто ещё не закрывал.
         delayMs — своя задержка показа у объявления (по умолчанию — общий delayMs из файла).
       Показывается первое незакрытое из списка, так что новый анонс достаточно дописать в файл,
       код трогать не нужно. Разметки в потоке страницы плашка не занимает (position:absolute,
       см. #dg-announce в home.css). */
    var ANNOUNCE_URL = '/nodejs/res/announcements.json';
    var ANNOUNCE_KEY = 'dgAnnounceDismissed';
    var ANNOUNCE_DEFAULT_DELAY_MS = 2000;
    var announceData = null;   // { items: [...], delayMs }

    function dismissedAnnounces() {
        try {
            var raw = JSON.parse(localStorage.getItem(ANNOUNCE_KEY) || '[]');
            return Array.isArray(raw) ? raw : [];
        } catch (e) {
            return [];
        }
    }

    // Метка, под которой объявление помнится закрытым. Отдельно от id, чтобы можно было
    // «переоткрыть» объявление всем сразу, не выдумывая новый id.
    function announceFlag(item) {
        return item.flag || item.id;
    }

    // Первое незакрытое объявление — общая точка и для показа, и для расчёта задержки.
    // Запись с "enabled": false пропускается: в JSON нет комментариев, а объявление, которое
    // «полежит и потом включим», удобнее держать готовым в этом же файле и включать одной
    // строкой (enabled: true или просто убрать поле — по умолчанию запись включена).
    function pendingAnnounce() {
        if (!announceData || !announceData.items) return null;
        var done = dismissedAnnounces();
        for (var i = 0; i < announceData.items.length; i++) {
            var item = announceData.items[i];
            if (item.enabled === false) continue;
            var flag = announceFlag(item);
            if (flag && done.indexOf(flag) === -1) return item;
        }
        return null;
    }

    /* Плашка лежит в уже существующем пустом отступе над полем и НИЧЕГО не двигает — пока в этот
       отступ помещается. На узком экране текст переносится в 2-3 строки и начинает наезжать на
       шапку; только в этом случае (owner: "только на супер узких экранах воды не нарезать на
       инпут, если будет хватать места никак не двигать") опускаем поле ровно на нехватку.
       Считаем ПОСЛЕ сброса своей прошлой добавки — иначе при каждом пересчёте она копилась бы. */
    function renderAnnounce() {
        var host = document.getElementById('dg-announce');
        if (!host || !announceData) return;
        var item = pendingAnnounce();
        if (!item) { host.hidden = true; host.innerHTML = ''; return; }

        var text = item[menuLang()] || item.en || item.ru || '';
        // Optional short badge before the text ("Beta"), see announcements.json.
        var tag = item.tag ? '<span class="dg-announce-tag">' + esc(item.tag) + '</span>' : '';
        host.innerHTML = '<div class="dg-announce-box" role="status">' + tag +
            '<span>' + text + '</span>' +
            '<button type="button" class="dg-announce-close" aria-label="' +
            (menuLang() === 'ru' ? 'Закрыть' : 'Dismiss') + '">' +
            '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
            '</button></div>';
        host.hidden = false;
        // Появление плавное — класс вешаем следующим кадром, чтобы переход отработал (в кадре
        // вставки элемент только что получил начальное состояние, transition с него не стартует).
        // display:none → flex тоже переключает этот класс (home.css), поэтому два кадра: в
        // первом элемент получает display, во втором — стартует transition.
        host.style.display = 'flex';
        requestAnimationFrame(function () { host.classList.add('dg-announce-in'); host.style.display = ''; });
        function dismissAnnounce() {
            var list = dismissedAnnounces();
            var flag = announceFlag(item);
            if (list.indexOf(flag) === -1) list.push(flag);
            try { localStorage.setItem(ANNOUNCE_KEY, JSON.stringify(list)); } catch (e) { /* приватный режим */ }
            host.classList.remove('dg-announce-in');
            renderAnnounce(); // следующее незакрытое, если оно есть
        }
        host.querySelector('.dg-announce-close').addEventListener('click', dismissAnnounce);
        // An announcement may carry the offline download as a link
        // (<a href="#offline-download">…</a>, see announcements.json). The click itself is handled
        // by public/offline/app.js; here it only means the announcement has done its job and should
        // not keep nagging someone who has just acted on it.
        host.querySelector('.dg-announce-box').addEventListener('click', function (event) {
            var link = event.target && event.target.closest
                ? event.target.closest('a[href="#offline-download"], [data-dg-offline-download]') : null;
            if (link) dismissAnnounce();
        });
    }

    /* Показ — не сразу, а через пару секунд после ПОЛНОЙ загрузки (owner): на первом экране
       человек сначала видит страницу, а объявление приходит потом, само собой обратив на себя
       внимание, и не участвует в гонке за первую отрисовку. Сколько ждать — из файла (общий
       delayMs или свой у объявления). */
    function announceDelay() {
        var item = pendingAnnounce();
        var ms = (item && item.delayMs) || (announceData && announceData.delayMs);
        return typeof ms === 'number' ? ms : ANNOUNCE_DEFAULT_DELAY_MS;
    }

    function scheduleAnnounce() {
        var start = function () { setTimeout(renderAnnounce, announceDelay()); };
        if (document.readyState === 'complete') start();
        else window.addEventListener('load', start, { once: true });
    }

    function slidesLang() {
        var lang = (window.DHAMMA_I18N && window.DHAMMA_I18N.language) ||
            localStorage.getItem('dhammaLanguage') || 'en';
        return (slidesData && slidesData[lang]) ? lang : 'en';
    }

    function shuffled(list) {
        var a = list.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    function openSlidesList() {
        ensureSheet();
        currentSheetKey = null;
        var sheet = document.getElementById('dg-sheet');
        var backdrop = document.getElementById('dg-sheet-backdrop');
        sheet.hidden = false;
        document.getElementById('dg-sheet-title').textContent = t('slides.allTitle', 'Все интересные запросы');
        document.getElementById('dg-sheet-tabs').innerHTML = '';
        var body = document.getElementById('dg-sheet-body');
        body.innerHTML = '';
        (slidesData[slidesLang()] || []).forEach(function (s) {
            var a = document.createElement('a');
            a.className = 'dg-sheet-row dg-slide-row';
            a.href = s.link;
            /* Стрелка справа — знак того, что строку МОЖНО ОТКРЫТЬ. Без неё список читался как
               справочник с описаниями: заголовок, под ним пояснение, и ничего, что намекало бы
               на переход. */
            a.innerHTML = '<span class="dg-slide-row-body">' +
                '<span class="dg-slide-title">' + s.title + '</span>' +
                '<span class="dg-slide-desc">' + s.desc + '</span>' +
                '</span>' +
                '<svg class="dg-slide-go-ic" viewBox="0 0 24 24" width="15" height="15" fill="none" ' +
                'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ' +
                'aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
            body.appendChild(a);
        });
        // Подсказка внизу списка — перенос "* Missing something?..." с multiTool.html (боевой
        // справочник по мультитулу). Ссылка ведёт на #contacts (реальный якорь секции
        // "Контакты" на главной) — обычная <a href>, не JS-скролл: если открыли список не с
        // главной, браузер САМ перейдёт на / и проскроллит после загрузки; applyHashHighlights()
        // (settings.js) подсветит секцию, когда до неё дойдёт (тот же приём, что и для якорей
        // из бургера, см. пункт 11 в TODO).
        var note = document.createElement('p');
        note.className = 'dg-slides-contacts-note';
        var parts = String(t('slides.contactsNote', 'Чего-то не хватает? Нужно что-то добавить? %s.')).split('%s');
        note.appendChild(document.createTextNode(parts[0]));
        var link = document.createElement('a');
        link.href = '/#contacts';
        link.textContent = t('slides.contactsNoteLink', 'Сообщите нам');
        // Иначе шторка остаётся открытой ПОВЕРХ страницы, а скроллится фон под ней — человек видит
        // тот же список, просто прокрученный, и не понимает, что вообще произошло.
        link.addEventListener('click', closeSheet);
        note.appendChild(link);
        note.appendChild(document.createTextNode(parts[1] || ''));
        body.appendChild(note);
        // currentSheetKey остаётся пустым (это не набор ссылок), поэтому закрытие ведём вручную.
        currentSheetKey = '__slides__';
        showLater(sheet, backdrop);
    }

    function renderSlides() {
        var host = document.getElementById('home-slides');
        if (!host || !slidesData) return;
        var list = slidesData[slidesLang()] || [];
        if (!list.length) { host.hidden = true; return; }

        slidesShown = shuffled(list);
        host.hidden = false;

        /* Разметка — ОДИН-В-ОДИН с боевой главной: index.php, блок #carouselWithCaptions внутри
           <div class="max-w-450 container-lg my-5">. Там это чистая бутстраповская карусель, без
           единого своего правила в CSS: заголовок <h5>, описание <span>, перенос, ссылка «Читать»,
           и две штатные боковые кнопки .carousel-control-prev/next со значками
           .carousel-control-*-icon. Своей рамки, своей подложки и своих стрелок в шапке у неё нет —
           именно от них наш вариант и выглядел хуже. Снизу справа — «показать все».
           Bootstrap на странице уже есть, так что листание, автопрокрутка, пауза при наведении и
           свайп на телефоне достаются готовыми. */
        var read = esc(t('slides.read', 'Читать'));
        var items = slidesShown.map(function (s, i) {
            return '<div class="carousel-item' + (i === 0 ? ' active' : '') + '">' +
                /* title/desc — HTML: в исходных данных есть разметка (например <span title="dn15">
                   с пояснением по наведению), и на боевой главной она выводится как есть. Файл
                   наш, из репозитория, пользовательского ввода здесь нет. */
                '<h5>' + s.title + '</h5>' +
                '<span>' + s.desc + '</span>' +
                '<br>' +
                '<a href="' + esc(s.link) + '" class="text-start">' + read +
                // Small angle-right after "Читать" (reference .read); FontAwesome 6 solid path.
                '<svg class="dg-slides-chev" viewBox="0 0 320 512" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"/></svg>' +
                '</a>' +
                '</div>';
        }).join('');
        // Dots — Bootstrap's own indicators (data-bs-slide-to), just placed under the card by CSS.
        var dots = slidesShown.map(function (s, i) {
            return '<button type="button" data-bs-target="#dg-carousel" data-bs-slide-to="' + i + '"' +
                (i === 0 ? ' class="active" aria-current="true"' : '') + ' aria-label="' + (i + 1) + '"></button>';
        }).join('');

        /* Production-v4 redesign (docs/Home-standalone.html): eyebrow + "показать все" row above,
           the carousel in a bordered card (.dg-slides-box, holds the arrows), dots below the
           card. The slide markup itself is still the legacy one. */
        host.innerHTML =
            '<div class="dg-slides">' +
            '<div class="dg-slides-head"><h2 class="dg-eyebrow dg-slides-title"></h2>' +
            '<button type="button" class="dg-slides-all"></button></div>' +
            '<div id="dg-carousel" class="carousel slide" data-bs-ride="carousel" data-bs-interval="7000">' +
            '<div class="dg-slides-box">' +
            '<div class="carousel-inner">' + items + '</div>' +
            '<button class="carousel-control-prev" type="button" data-bs-target="#dg-carousel" data-bs-slide="prev">' +
            '<svg class="dg-slides-arw" viewBox="0 0 320 512" fill="currentColor" aria-hidden="true"><path d="M41.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 256 246.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/></svg>' +
            '<span class="visually-hidden">Previous</span></button>' +
            '<button class="carousel-control-next" type="button" data-bs-target="#dg-carousel" data-bs-slide="next">' +
            '<svg class="dg-slides-arw" viewBox="0 0 320 512" fill="currentColor" aria-hidden="true"><path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"/></svg>' +
            '<span class="visually-hidden">Next</span></button>' +
            '</div>' +
            '<div class="carousel-indicators">' + dots + '</div>' +
            '</div>' +
            '</div>';

        host.querySelector('.dg-slides-title').textContent = t('home.picks', 'Подборки');
        host.querySelector('.dg-slides-all').textContent = t('slides.showAll', 'Показать все');
        host.querySelector('.dg-slides-all').addEventListener('click', openSlidesList);

        /* data-bs-ride поднимает карусель только при разборе страницы; наша появляется позже,
           поэтому заводим её вручную. */
        var carousel = document.getElementById('dg-carousel');
        if (window.bootstrap && window.bootstrap.Carousel) {
            window.bootstrap.Carousel.getOrCreateInstance(carousel);
        }
        // Dots taper with distance from the active slide (see .carousel-indicators [data-d] in
        // home.css): Bootstrap only toggles .active, the distance is ours to keep up to date.
        var dotEls = carousel.querySelectorAll('.carousel-indicators [data-bs-slide-to]');
        function paintSlideDots(active) {
            Array.prototype.forEach.call(dotEls, function (d, i) {
                d.setAttribute('data-d', Math.min(4, Math.abs(i - active)));
            });
        }
        paintSlideDots(0);
        // On slide START (not slid/END): Bootstrap moves .active to the new dot at start, so the
        // distances must move in the same frame — repainting at the end left the dots stepping
        // twice, 0.32s apart (owner: "дёргается"). The reference repaints everything at once.
        carousel.addEventListener('slide.bs.carousel', function (e) { paintSlideDots(e.to); });
        lockCarouselHeight();
    }

    /* Высота карусели по САМОМУ ВЫСОКОМУ слайду. Слайды разной длины, и страница на каждом
       переключении то вырастала, то оседала — всё, что ниже, прыгало. Фиксируем минимальную
       высоту контейнера один раз, по факту замера: жёстко заданное число подошло бы одному языку
       и одной ширине экрана, а тут и перевод длиннее, и колонка уже.
       Мерим, временно показывая каждый слайд: у неактивных display:none, и высота у них нулевая. */
    function lockCarouselHeight() {
        var inner = document.querySelector('#dg-carousel .carousel-inner');
        if (!inner) return;
        inner.style.minHeight = '';
        var items = inner.querySelectorAll('.carousel-item');
        var tallest = 0;
        Array.prototype.forEach.call(items, function (item) {
            var wasActive = item.classList.contains('active');
            if (!wasActive) { item.style.display = 'block'; item.style.position = 'absolute'; item.style.visibility = 'hidden'; }
            tallest = Math.max(tallest, item.getBoundingClientRect().height);
            if (!wasActive) { item.style.display = ''; item.style.position = ''; item.style.visibility = ''; }
        });
        // Capped at the reference card's stage height (~108px inside its 144px card at 1280):
        // a couple of outlier slides with three-line blurbs used to stretch every slide into a
        // half-empty card. Those still grow the card by a line when shown; the rest don't jump.
        if (tallest) inner.style.minHeight = Math.ceil(Math.min(tallest, 110)) + 'px';
    }

    // ======================================================================
    // Поле ввода: «очистить» и спиннер
    // ======================================================================
    /* Кнопка «очистить» показывается только когда в поле что-то есть — как в строке поиска у
       поисковиков. Спиннер ожидания живёт там же, внутри поля (см. .dg-shell-spinner в home.css):
       раньше он был блоком под полем и, появляясь, сдвигал всё, что ниже. */
    function syncInputChrome() {
        var input = document.getElementById('paliauto');
        var clear = document.getElementById('dg-clear-btn');
        if (!input || !clear) return;
        clear.hidden = !input.value;
    }

    /* Событие input браузер шлёт только на ввод С КЛАВИАТУРЫ. Когда поле заполняют из кода —
       подсказкой автодополнения, историей в компасе, чем угодно через .value или jQuery .val() —
       события нет, и крестик «очистить» не появлялся: набранное руками он замечал, подставленное
       из истории нет.
       Поэтому подменяем сам аксессор value у ЭТОГО одного элемента: под ним остаётся родной
       сеттер из HTMLInputElement.prototype, мы лишь дописываем к нему вызов синхронизации. Так
       ловится любой способ записи, и не нужно знать наперёд, кто именно её сделает. */
    function watchInputValue() {
        var input = document.getElementById('paliauto');
        if (!input) return;
        var native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (!native || !native.set) return;
        Object.defineProperty(input, 'value', {
            configurable: true,
            enumerable: native.enumerable,
            get: function () { return native.get.call(this); },
            set: function (v) {
                native.set.call(this, v);
                syncInputChrome();
                // Same reasoning as syncInputChrome above (this setter override exists
                // specifically because programmatic .value writes fire no 'input' event) —
                // renderHint() was missing here, so the "↵ search for X" hint went stale
                // whenever the field was cleared/filled by code instead of typing (owner: back
                // navigation left the previous word's hint showing even with an empty field).
                renderHint();
            }
        });
    }

    /* Подсказки автодополнения после отправки запроса не нужны — выдача уже показана, а меню
       продолжало висеть поверх неё. Виджет jQuery UI поднимается лениво (autopali.js вешает
       инициализацию на фокус), поэтому проверяем, что он вообще есть. */
    function closeAutocomplete() {
        var $ = window.jQuery;
        var input = document.getElementById('paliauto');
        if (!$ || !input || !$.fn || !$.fn.autocomplete) return;
        if ($(input).data('ui-autocomplete')) $(input).autocomplete('close');
    }

    // ======================================================================
    // Язык и тема в боковом меню
    // ======================================================================
    /* Значки у пунктов бокового меню и у заголовков в нём. Проставляются один раз, по атрибуту
       data-dg-icon в разметке: держать их в HTML нельзя — FontAwesome на этой странице сама
       <i> не разворачивает (см. faSvg). */
    function paintDrawerIcons() {
        Array.prototype.forEach.call(document.querySelectorAll('[data-dg-icon]'), function (el) {
            if (el.querySelector('.dg-row-ic')) return;
            el.insertAdjacentHTML('afterbegin', faSvg(el.dataset.dgIcon, 'dg-row-ic'));
        });
    }

    /* Any element whose TARGET (not just label) depends on UI language — "About the project"
       (siteroot/assets/common/keyFeatures.html vs keyFeaturesRu.html, same naming convention as
       o.html/o-en.html etc. in menu-links.json) plus the Help/Docs portal links (search/reader
       toolbars — /docs/... vs /ru/docs/..., separate baseUrl builds, see dg-docs/docusaurus.config.js).
       menuLang() is the same ru/en source of truth
       menu-links.json's per-language sections already key off of — not a new hardcoded default.
       Selected by the data-href-en/data-href-ru pair itself, not a shared class — a class name
       containing "-lang" would silently lose .dg-drawer-row's flex layout, see
       reader/css/uiextra.css's `[class*="-lang"]{display:block}` (search/css/home.css's
       .toc-filter-hdr comment has the same landmine already hit once). */
    function paintDrawerLangHrefs() {
        var ru = menuLang() === 'ru';
        Array.prototype.forEach.call(document.querySelectorAll('[data-href-en][data-href-ru]'), function (el) {
            el.href = ru ? el.dataset.hrefRu : el.dataset.hrefEn;
        });
    }

    /* Список кнопок для правки. Открывается пунктом «Изменить кнопки» в меню: выбирать, что
       менять, надо ДО формы — на самой плитке крестик уже занят удалением, а второй значок
       превратил бы её в панель управления. */
    function openEditList() {
        closeDrawer();
        ensureSheet();
        var sheet = document.getElementById('dg-sheet');
        var backdrop = document.getElementById('dg-sheet-backdrop');
        sheet.hidden = false;
        document.getElementById('dg-sheet-title').textContent = t('menu.editTiles', 'Изменить кнопки');
        document.getElementById('dg-sheet-tabs').innerHTML = '';

        var body = document.getElementById('dg-sheet-body');
        body.innerHTML = '';

        // Owner: "уберём случайное удаление по хуверу... добавь чекбоксы, по умолчанию
        // включенные, чтобы можно было скрыть" — show/hide теперь только отсюда, явным
        // чекбоксом, а не крестиком, всплывающим на плитке. Список больше не пропускает скрытые
        // (раньше пропускал: `if (hidden.indexOf(key) !== -1) return`) — иначе скрытую кнопку
        // было бы неоткуда вернуть обратно, кроме полного "Вернуть исходное" для всех разом.
        var hidden = hiddenTiles();
        tileOrder().forEach(function (key) {
            var tile = tileData(key);
            if (!tile) return;
            var isHidden = hidden.indexOf(key) !== -1;

            var row = document.createElement('div');
            row.className = 'dg-sheet-row dg-edit-row';

            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'dg-edit-visible-cb';
            cb.checked = !isHidden;
            cb.setAttribute('aria-label', tile.custom
                ? t('menu.deleteTile', 'Удалить кнопку')
                : t('menu.removeTile', 'Убрать с главной'));
            cb.addEventListener('click', function (e) {
                // Иначе клик дойдёт и до .dg-edit-row-main — заодно откроет форму правки.
                e.stopPropagation();
                var list = hiddenTiles();
                var idx = list.indexOf(key);
                if (cb.checked) { if (idx !== -1) list.splice(idx, 1); }
                else if (idx === -1) { list.push(key); }
                setHiddenTiles(list);
                renderTiles();
            });
            row.appendChild(cb);

            var main = document.createElement('button');
            main.type = 'button';
            main.className = 'dg-edit-row-main';
            main.innerHTML = '<span class="dg-row-icon dg-edit-ic">' + iconHtml(tile.icon) + '</span>' +
                '<span class="dg-row-label">' + esc(tile.label) + '</span>' +
                '<svg class="dg-slide-go-ic" viewBox="0 0 24 24" width="15" height="15" fill="none" ' +
                'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ' +
                'aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
            /* Описание — приоритетнее адреса, если задано (короче и понятнее строкой списка);
               адрес своей кнопки — через safeText: в нём может стоять {{q}}, а целиком записанная
               двойная скобка валит i18n (см. safeText). */
            if (tile.desc || (tile.custom && tile.href)) {
                var addr = document.createElement('small');
                addr.className = 'dg-row-desc';
                addr.appendChild(tile.desc ? document.createTextNode(tile.desc) : safeText(tile.href));
                main.querySelector('.dg-row-label').appendChild(addr);
            }
            main.addEventListener('click', function () { openTileForm(key); });
            row.appendChild(main);

            body.appendChild(row);
        });

        var add = document.createElement('button');
        add.type = 'button';
        add.className = 'dg-add-submit';
        add.textContent = t('menu.addTile', 'Добавить свою кнопку');
        add.addEventListener('click', function () { openTileForm(null); });
        body.appendChild(add);

        currentSheetKey = '__edit__';
        showLater(sheet, backdrop);
    }

    /* Одна форма и на создание, и на правку: поля те же, разница лишь в том, что подставлено и
       куда сохраняем. key === null — новая кнопка.
       Адрес редактируется у ЛЮБОЙ кнопки, включая встроенные: раньше их href жёстко приходил из
       menu-links.json, теперь патч (tileOverrides) может его переопределить — правка переживает
       обновление конфига, а «Вернуть исходное» снимает её и возвращает автослежение за сайтом. */
    function openTileForm(key) {
        closeDrawer();
        ensureSheet();
        var sheet = document.getElementById('dg-sheet');
        var backdrop = document.getElementById('dg-sheet-backdrop');
        var body = document.getElementById('dg-sheet-body');
        var tabs = document.getElementById('dg-sheet-tabs');

        var existing = key ? tileData(key) : null;
        var isCustom = !key || !!(existing && existing.custom);

        sheet.hidden = false;
        document.getElementById('dg-sheet-title').textContent = key
            ? t('menu.editTile', 'Изменить кнопку')
            : t('menu.addTile', 'Добавить свою кнопку');
        if (tabs) tabs.innerHTML = '';
        body.innerHTML = '';

        var form = document.createElement('form');
        form.className = 'dg-add-form';

        function field(labelText, el) {
            var wrap = document.createElement('label');
            wrap.className = 'dg-field';
            var cap = document.createElement('span');
            cap.className = 'dg-field-label';
            cap.textContent = labelText;
            wrap.appendChild(cap);
            wrap.appendChild(el);
            return wrap;
        }

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'dg-field-input';
        nameInput.required = true;
        nameInput.maxLength = 24;
        nameInput.value = existing ? existing.label : '';
        nameInput.placeholder = t('menu.addTileNamePh', 'например, Мой словарь');
        form.appendChild(field(t('menu.addTileName', 'Подпись'), nameInput));

        /* Адрес — теперь редактируется у ЛЮБОЙ кнопки, не только своей: раньше у встроенной ссылка
           бралась только из menu-links.json и не переопределялась, теперь патч может нести и её
           (см. tileData()/setTileOverride ниже). */
        var urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.className = 'dg-field-input';
        urlInput.required = true;
        urlInput.value = existing ? (existing.href || '') : '';
        urlInput.placeholder = 'https://…';
        form.appendChild(field(t('menu.addTileUrl', 'Адрес'), urlInput));

        if (isCustom) {
            var hint = document.createElement('p');
            hint.className = 'dg-field-hint';
            var parts = String(t('menu.addTileHint',
                'В адрес можно вставить %s — вместо него подставится запрос из поля поиска.')).split('%s');
            hint.appendChild(document.createTextNode(parts[0]));
            /* Образец {{q}} — ДВА текстовых узла: dhamma-i18n.js обходит текстовые узлы и всё,
               где встречается «{{», считает своим ключом перевода. */
            var code = document.createElement('code');
            code.appendChild(document.createTextNode('{'));
            code.appendChild(document.createTextNode('{q}}'));
            hint.appendChild(code);
            hint.appendChild(document.createTextNode(parts[1] || ''));
            form.appendChild(hint);
        } else {
            var builtinNote = document.createElement('p');
            builtinNote.className = 'dg-field-hint';
            builtinNote.textContent = t('menu.editBuiltinNote',
                'Если поменять адрес здесь, кнопка перестанет обновляться вместе с сайтом — «Вернуть исходное» снимает эту правку.');
            form.appendChild(builtinNote);
        }

        var descInput = document.createElement('textarea');
        descInput.className = 'dg-field-input dg-field-textarea';
        descInput.rows = 2;
        descInput.maxLength = 140;
        descInput.value = existing ? (existing.desc || '') : '';
        descInput.placeholder = t('menu.addTileDescPh', 'необязательно — подсказка при наведении');
        form.appendChild(field(t('menu.addTileDesc', 'Описание'), descInput));

        var iconCap = document.createElement('span');
        iconCap.className = 'dg-field-label';
        iconCap.textContent = t('menu.addTileIcon', 'Значок');
        form.appendChild(iconCap);

        var chosen = existing ? existing.icon : 'external';
        var icons = document.createElement('div');
        icons.className = 'dg-icon-pick';

        var emojiInput = document.createElement('input');
        emojiInput.type = 'text';
        emojiInput.className = 'dg-field-input dg-emoji-input';
        emojiInput.maxLength = 4;
        emojiInput.placeholder = t('menu.addTileEmojiPh', 'свой знак, например 🪷');

        function markChosen() {
            Array.prototype.forEach.call(icons.children, function (x) {
                x.classList.toggle('on', x.dataset.icon === chosen);
            });
            emojiInput.value = isEmojiIcon(chosen) ? chosen : '';
        }

        ['external', 'book', 'bookmark', 'dict', 'cap', 'wrench', 'clock', 'star', 'home'].forEach(function (name) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'dg-icon-opt';
            b.dataset.icon = name;
            b.innerHTML = faSvg(name);
            b.addEventListener('click', function () { chosen = name; markChosen(); });
            icons.appendChild(b);
        });
        form.appendChild(icons);

        /* Свой значок — эмодзи. Рисуется одним цветом с остальными (см. .dg-emoji-ic в home.css):
           цветная картинка среди одноцветных контуров выбивается из ряда, а плитки должны
           читаться как один набор. */
        emojiInput.addEventListener('input', function () {
            var v = emojiInput.value.trim();
            if (v) {
                chosen = v;
                Array.prototype.forEach.call(icons.children, function (x) { x.classList.remove('on'); });
            }
        });
        form.appendChild(field(t('menu.addTileEmoji', 'Или свой значок'), emojiInput));
        markChosen();

        var error = document.createElement('p');
        error.className = 'dg-field-error';
        error.hidden = true;
        form.appendChild(error);

        var submit = document.createElement('button');
        submit.type = 'submit';
        submit.className = 'dg-add-submit';
        submit.textContent = key ? t('menu.editTileSave', 'Сохранить') : t('menu.addTileSave', 'Добавить');
        form.appendChild(submit);

        // У встроенной кнопки — «вернуть исходное»: снять правку, а не вспоминать прежнее название.
        if (key && !isCustom && tileOverrides()[key]) {
            var reset = document.createElement('button');
            reset.type = 'button';
            reset.className = 'dg-add-reset';
            reset.textContent = t('menu.editTileReset', 'Вернуть исходное');
            reset.addEventListener('click', function () {
                setTileOverride(key, null);
                renderTiles();
                openEditList();
            });
            form.appendChild(reset);
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var label = nameInput.value.trim();
            if (!label) { error.textContent = t('menu.addTileNoName', 'Впишите подпись'); error.hidden = false; return; }

            // Адрес теперь обязателен и проверяется одинаково для своих и встроенных кнопок.
            var href = normalizeUrl(urlInput.value);
            if (!href) {
                error.textContent = t('menu.addTileBadUrl', 'Адрес должен начинаться с http://, https:// или /');
                error.hidden = false;
                return;
            }
            var desc = descInput.value.trim();

            if (isCustom) {
                var list = customTiles();
                if (key) {
                    list.forEach(function (c) {
                        if (c.id === key) { c.label = label; c.href = href; c.icon = chosen; c.desc = desc; }
                    });
                } else {
                    list.push({ id: 'custom:' + Date.now(), label: label, href: href, icon: chosen, desc: desc });
                }
                setCustomTiles(list);
            } else {
                // Ссылка теперь тоже часть патча (поле всегда редактируемое и всегда предзаполнено
                // текущим значением) — храним её всегда, а не только когда реально поменяли:
                // иначе повторное сохранение без правки адреса тихо потеряло бы прошлую правку
                // ссылки (setTileOverride ЗАМЕНЯЕТ весь патч целиком, не сливает с прежним).
                setTileOverride(key, { label: label, icon: chosen, href: href, desc: desc || undefined });
            }
            renderTiles();
            closeSheet();
        });

        body.appendChild(form);
        showLater(sheet, backdrop);
    }

    // Пункт меню «Добавить свою кнопку» — та же форма, без выбранной плитки.
    function openAddTile() { openTileForm(null); }

    /* Подвал: годы работы проекта и ссылка на условия. Полную оговорку про лицензию держим НЕ на
       странице — она длинная и на главной ни к чему; открывается шторкой по ссылке (как на проде
       она отдельным абзацем внизу, но там для неё есть целая страница). */
    function renderFooter() {
        var host = document.getElementById('dg-copyright');
        if (!host) return;
        buildCopyright(host, true);
    }

    // short — the one-line page footer ("Условия · Политика"); the About sheet gets full labels.
    function buildCopyright(host, short) {
        host.innerHTML = '';
        // 2022 — год начала проекта, второй год всегда текущий (на проде date("Y")).
        host.appendChild(document.createTextNode('© 2022–' + new Date().getFullYear() + ' dhamma.gift · '));

        var terms = document.createElement('a');
        terms.href = 'javascript:void(0)';
        terms.className = 'dg-footer-link';
        terms.textContent = short ? t('footer.termsShort', 'Условия') : t('footer.terms', 'Условия использования');
        terms.addEventListener('click', openTerms);
        host.appendChild(terms);

        host.appendChild(document.createTextNode(' · '));

        var privacy = document.createElement('a');
        privacy.className = 'dg-footer-link';
        privacy.target = '_blank';
        privacy.rel = 'noopener';
        // Owner (2026-09-06): the live policy page is /docs/policies (dg-docs), the old
        // /assets/common/privacy*.html copies are stale.
        privacy.href = menuLang() === 'ru' ? '/ru/docs/policies' : '/docs/policies';
        privacy.textContent = short ? t('footer.privacyShort', 'Политика') : t('footer.privacy', 'Политика конфиденциальности');
        host.appendChild(privacy);
    }

    /* Приложения/расширения и контакты — перенос двух нижних блоков боевой главной. Данные
       перенесены как есть из config/translate.php ($ctaButtons) и index.php (#contacts);
       картинки кнопок берём оттуда же — /assets/img/buttons/*.png лежат на месте. */
    var CTA_BUTTONS = [
        { img: 'pwa-cta.png', href: null, id: 'installPWA', title: 'Install Dhamma.gift as progressive web app' },
        { img: 'telegram-cta.png', href: 'https://t.me/dgift_bot', title: 'Open DGift_bot' },
        { img: 'google-play-cta.png', href: 'https://play.google.com/store/apps/details?id=gift.dhamma.twa', title: 'Download from Google Play' },
        { img: 'apk-cta.png', href: 'https://github.com/dhammagift/dg-twa/releases', title: 'Download APK' },
        { img: 'chrome-cta.png', href: 'https://chromewebstore.google.com/detail/dhammagift-search-and-wor/dnnogjdcmhbiobpnkhdbfnfjnjlikabd', title: 'Chrome Web Store' },
        { img: 'firefox-cta.png', href: 'https://addons.mozilla.org/en-US/firefox/addon/dhamma-gift/', title: 'Firefox Add-ons' },
        { img: 'edge-cta.png', href: 'https://microsoftedge.microsoft.com/addons/detail/dhammagift-search-and-wo/aokegkhdaijkikbdocanadeghllhfmhj', title: 'Microsoft Edge Add-ons' },
        { img: 'opera-cta.png', href: 'https://addons.opera.com/en/extensions/details/dhammagift/', title: 'Opera Add-ons' }
    ];

    var CONTACTS = [
        { icon: ['fab', 'github'], href: 'https://github.com/dhammagift/dg#readme', title: 'GitHub' },
        { icon: ['fas', 'at'], href: 'mailto:agiftofdhamma@gmail.com', title: 'E-mail' },
        { icon: ['fab', 'youtube'], href: 'https://m.youtube.com/channel/UCoyL5T0wMubqrj4OnKVOlMw', title: 'YouTube' },
        { icon: ['fab', 'whatsapp'], href: 'https://chat.whatsapp.com/ExExFBcvyhr33PdKJbsUXs', title: 'WhatsApp' },
        { icon: ['fab', 'telegram'], href: 'https://t.me/dhamma_gift', title: 'Telegram' }
    ];

    function faSpec(spec, cls) {
        var FA = window.FontAwesome;
        if (FA && FA.icon) {
            var made = FA.icon({ prefix: spec[0], iconName: spec[1] });
            if (made && made.html && made.html[0]) {
                return made.html[0].replace('<svg ', '<svg class="' + (cls || '') + '" ');
            }
        }
        return '';
    }

    /* «Как искать» + памятка — статический перенос двух блоков боевой главной
       (config/translate.php: $howtosearchquote/$howtoheader, $transwarning). Текст не меняется
       рантаймом ни от чего, кроме языка интерфейса, поэтому просто читаем строки из lang_*.json
       (ключи howto.*) — как renderExtra() читает footer.*. */
    function renderHowTo() {
        var host = document.getElementById('home-howto');
        if (!host) return;
        host.hidden = false;
        // Short form on the page (intro.* in lang_*.json); the full quote/warning (howto.*)
        // moved into the "About" sheet — see openAbout().
        document.getElementById('dg-intro-eyebrow').textContent = t('home.howtoEyebrow', 'Как искать?');
        document.getElementById('dg-intro-pali').textContent = t('intro.pali', '');
        document.getElementById('dg-intro-body').textContent = t('intro.body', '');
        document.getElementById('dg-intro-warn-title').textContent = t('intro.warnTitle', '');
        document.getElementById('dg-intro-warn-body').textContent = t('intro.warnBody', '');
    }

    function renderExtra() {
        // Footer: "How to search · Apps · Contacts" open the About sheet at that section.
        var nav = document.getElementById('dg-footer-nav');
        if (nav) {
            nav.innerHTML = '';
            nav.insertAdjacentHTML('afterbegin', '<svg class="dg-footer-nav-ic" viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM232 344V280H168c-13.3 0-24-10.7-24-24s10.7-24 24-24h64V168c0-13.3 10.7-24 24-24s24 10.7 24 24v64h64c13.3 0 24 10.7 24 24s-10.7 24-24 24H280v64c0 13.3-10.7 24-24 24s-24-10.7-24-24z"/></svg> ');
            [['howto', t('footer.howto', 'Как искать')], ['links', t('footer.linksShort', 'Приложения')], ['contacts', t('footer.contacts', 'Контакты')]]
                .forEach(function (pair, i) {
                    if (i) nav.appendChild(document.createTextNode(' · '));
                    var a = document.createElement('a');
                    a.href = '#' + pair[0];
                    a.textContent = pair[1];
                    a.addEventListener('click', function (ev) { ev.preventDefault(); openAbout(pair[0]); });
                    nav.appendChild(a);
                });
        }
        var footContacts = document.getElementById('dg-footer-contacts');
        if (footContacts) buildContacts(footContacts);
    }

    function buildCta(cta) {
        cta.innerHTML = '';
        CTA_BUTTONS.forEach(function (b) {
            /* Кнопка установки PWA — единственная без готовой ссылки: её показывает и включает
               перехват window.beforeinstallprompt (см. <head> index.html), который создаёт
               плейсхолдер #installPWA и сохраняет отложенное событие в window.__dgInstallPrompt.
               Если событие не пришло (браузер не предлагает установку, уже установлено и т.п.) —
               плейсхолдера нет, тайл просто не рисуется: нерабочая «Установить» хуже отсутствующей. */
            if (b.id && !document.getElementById(b.id)) return;
            var el = document.createElement('a');
            el.className = 'dg-cta-btn';
            el.title = b.title;
            el.innerHTML = '<img src="/assets/img/buttons/' + b.img + '" alt="' + esc(b.title) + '" loading="lazy">';
            if (b.id === 'installPWA') {
                el.href = 'javascript:void(0)';
                el.addEventListener('click', function (ev) {
                    ev.preventDefault();
                    var prompt = window.__dgInstallPrompt;
                    if (!prompt) return;
                    prompt.prompt();
                    prompt.userChoice.finally(function () { window.__dgInstallPrompt = null; });
                });
            } else {
                el.href = b.href;
                el.target = '_blank';
                el.rel = 'noopener';
            }
            cta.appendChild(el);
        });
    }

    function buildContacts(contacts) {
        contacts.innerHTML = '';
        CONTACTS.forEach(function (c) {
            var a = document.createElement('a');
            a.className = 'dg-contact-btn';
            a.href = c.href;
            a.title = c.title;
            a.setAttribute('aria-label', c.title);
            if (c.href.indexOf('mailto:') !== 0) { a.target = '_blank'; a.rel = 'noopener'; }
            a.innerHTML = faSpec(c.icon);
            contacts.appendChild(a);
        });
    }

    // Ported from legacy config/translate.php ($poweredby/$tooltippoweredby) — "Powered by
    // DI"/"Powered by NI" signature with a tooltip explaining the pun (Dhamma/Natural
    // Intelligence), same text per language as prod. Lives in the footer (and repeats at the
    // bottom of the About sheet) — owner: must stay exactly as it is.
    function buildPoweredBy(poweredBy) {
        {
            poweredBy.innerHTML = '';
            poweredBy.appendChild(document.createTextNode(t('footer.poweredby', 'Powered by DI')));
            var poweredTip = document.createElement('a');
            poweredTip.href = 'javascript:void(0)';
            poweredTip.className = 'dg-footer-link';
            poweredTip.textContent = ' *';
            poweredTip.setAttribute('data-bs-toggle', 'tooltip');
            poweredTip.setAttribute('data-bs-placement', 'top');
            poweredTip.setAttribute('data-bs-title', t('footer.poweredbyTooltip',
                'Дхамма Интеллект, Dhamma Intelligence, Естественный Интеллект, Natural Intelligence'));
            poweredBy.appendChild(poweredTip);
            if (window.bootstrap && bootstrap.Tooltip) {
                new bootstrap.Tooltip(poweredTip);
            }
        }
    }

    /* Шторка «О проекте» — всё, что раньше лежало развёрнутым на главной: полная цитата «Tāni ce
       sutte…» с переводом и ссылками, полная памятка о переводах, кнопки приложений/расширений,
       контакты, копирайт и «Powered by». section — 'howto' | 'links' | 'contacts': к какому
       разделу прокрутить после открытия (те же id, что были у якорей на странице — /#contacts
       из шторки-бургера и «Показать все» продолжают работать через revealAnchorSection). */
    function openAbout(section) {
        closeMega();
        ensureSheet();
        var sheet = document.getElementById('dg-sheet');
        var backdrop = document.getElementById('dg-sheet-backdrop');
        sheet.hidden = false;
        // Owner: on desktop this sheet spans the text column (as wide as the mega menu), not the
        // 560px list width the tile sheets use. openSheet()/openTerms() clear the class again.
        sheet.classList.add('dg-wide');
        // Bottom-sheet chrome for this one (production-v4 redesign, docs/Home-standalone.html
        // .sheet): full-width from the bottom edge, drag handle, no title bar — see
        // .dg-sheet.dg-about-sheet in home.css. openSheet()/openTerms() clear it with dg-wide.
        sheet.classList.add('dg-about-sheet');
        document.getElementById('dg-sheet-title').textContent = t('menu.about', 'О проекте');
        document.getElementById('dg-sheet-tabs').innerHTML = '';

        var body = document.getElementById('dg-sheet-body');
        body.innerHTML = '';
        body.className = 'dg-sheet-body dg-about';

        // Owner: formatting from the design mockup (left-aligned, small-caps section labels, a
        // quiet grey card for the warning, round contact buttons), CONTENT from prod (the full
        // "Tāni ce sutte…" quote with translation and refs, the full "Please remember" text, all
        // app/extension buttons, all contacts, "Powered by NI *", the copyright line).
        function title(id, text) {
            var h = document.createElement('p');
            h.className = 'dg-group-title';
            h.id = id;
            h.textContent = text;
            body.appendChild(h);
        }
        function el(tag, cls, text) {
            var e = document.createElement(tag);
            if (cls) e.className = cls;
            if (text !== undefined) e.textContent = text;
            return e;
        }

        title('howto', t('howto.title', 'Как искать?'));
        body.appendChild(el('p', 'dg-about-pali pli-lang', t('howto.pali', '')));
        body.appendChild(el('p', 'dg-about-body', t('howto.body', '')));
        var refs = el('p', 'dg-about-refs');
        [['dn16', '/dn16?s=T%C4%81ni'], ['an4.180', '/an4.180?s=T%C4%81ni']].forEach(function (r, i) {
            if (i) refs.appendChild(document.createTextNode(' · '));
            var a = el('a', null, r[0]);
            a.href = r[1]; a.target = '_blank'; a.rel = 'noopener';
            refs.appendChild(a);
        });
        body.appendChild(refs);
        var warn = el('div', 'dg-howto-warn');
        warn.innerHTML = '<svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336h24V272H216c-13.3 0-24-10.7-24-24s10.7-24 24-24h48c13.3 0 24 10.7 24 24v88h8c13.3 0 24 10.7 24 24s-10.7 24-24 24H216c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/></svg>';
        var warnText = el('div');
        warnText.appendChild(el('strong', null, t('howto.warnTitle', 'Пожалуйста, обратите внимание!')));
        warnText.appendChild(el('p', null, t('howto.warnBody', '')));
        warn.appendChild(warnText);
        body.appendChild(warn);

        title('links', t('footer.links', 'Приложения и расширения'));
        var cta = el('div', 'dg-cta');
        buildCta(cta);
        body.appendChild(cta);

        title('contacts', t('footer.contacts', 'Контакты'));
        body.appendChild(el('p', 'dg-about-note', t('footer.contactsNote', 'Пишите — о находках, ошибках и переводах. Будем вам рады.')));
        var contacts = el('div', 'dg-contacts');
        buildContacts(contacts);
        body.appendChild(contacts);
        var powered = el('p', 'dg-powered-by dg-about-powered');
        buildPoweredBy(powered);
        body.appendChild(powered);

        var foot = el('div', 'dg-about-foot');
        buildCopyright(foot, false);
        body.appendChild(foot);

        currentSheetKey = '__about__';
        showLater(sheet, backdrop);
        if (section && section !== 'howto') {
            var target = document.getElementById(section);
            // After the slide-in: scrolling the sheet body while it is still translating off-screen
            // is a no-op in some browsers.
            setTimeout(function () { if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 350);
        }
    }

    // Полный текст условий — в шторке. Ссылка на саму лицензию внутри остаётся кликабельной.
    function openTerms() {
        ensureSheet();
        var sheet = document.getElementById('dg-sheet');
        var backdrop = document.getElementById('dg-sheet-backdrop');
        sheet.hidden = false;
        sheet.classList.remove('dg-wide');
        sheet.classList.remove('dg-about-sheet');
        document.getElementById('dg-sheet-title').textContent = t('footer.terms', 'Условия использования');
        document.getElementById('dg-sheet-tabs').innerHTML = '';

        var body = document.getElementById('dg-sheet-body');
        body.innerHTML = '';

        var ru = menuLang() === 'ru';
        var ccLink = ru
            ? 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.ru'
            : 'https://creativecommons.org/licenses/by-nc-sa/4.0';

        var p = document.createElement('p');
        p.className = 'dg-terms-text';
        // Текст перенесён из config/translate.php ($copyrightnote), название лицензии — ссылкой.
        var parts = String(t('footer.copyright',
            'Материалы сайта распространяются по модели %s, но Пали тексты и Английские переводы SuttaCentral.net и работы А. Я. Сыркина и TheBuddhasWords.net подчиняются другим условиям. Для их использования уточняйте условия у правообладателей.'
        )).split('%s');
        p.appendChild(document.createTextNode(parts[0]));
        var cc = document.createElement('a');
        cc.href = ccLink;
        cc.target = '_blank';
        cc.rel = 'noopener';
        cc.textContent = 'CC BY-NC-SA 4.0';
        p.appendChild(cc);
        p.appendChild(document.createTextNode(parts[1] || ''));
        body.appendChild(p);

        currentSheetKey = '__terms__';
        showLater(sheet, backdrop);
    }

    function renderLangSwitch() {
        var host = document.getElementById('dg-lang-seg');
        if (!host) return;
        var active = (window.DHAMMA_I18N && window.DHAMMA_I18N.language) ||
            localStorage.getItem('dhammaLanguage') || 'en';
        host.innerHTML = '';
        /* Только RU и EN: конфигов интерфейса для этой страницы ровно два
           (configs/search/lang_{ru,en}.json), тайского среди них нет — предлагать язык, который
           не подгрузится, нельзя. Порядок: EN → RU. */
        host.appendChild(segmented(
            [{ value: 'en', label: 'EN' }, { value: 'ru', label: 'RU' }],
            active === 'ru' ? 'ru' : 'en',
            function (v) {
                // Тот же путь, что у переключателя языка в остальном интерфейсе.
                if (window.DHAMMA_I18N && window.DHAMMA_I18N.setLanguage) window.DHAMMA_I18N.setLanguage(v);
                else localStorage.setItem('dhammaLanguage', v);
                // Owner: "язык в бургере... интерфейс + 1ый язык перевода, чтобы он менял и
                // язык чтения" — этот переключатель теперь не только язык интерфейса, но и
                // "какой перевод читать первым" (megareader.js решает умно — переставляет
                // колонки для многоязычных режимов, переключает режим для одноязычных).
                if (currentState() === 'reader' && typeof window.switchReadingLanguage === 'function') {
                    window.switchReadingLanguage(v);
                }
            }
        ));
    }

    /* Тему переключаем, НАЖИМАЯ существующую кнопку темы (#theme-button в ряду кнопок выдачи):
       вся логика — в общесайтовом themeswitch.js, и своя копия setTheme() разошлась бы с ней
       (там пишутся сразу четыре ключа: theme, themeButtonAction, lightMode, darkSwitch). Кнопка
       перебирает light → dark → auto по кругу, поэтому жмём её, пока не встанет нужное значение;
       больше трёх нажатий не потребуется. На главной кнопка скрыта, но click() это не мешает. */
    function applyTheme(target) {
        var btn = document.getElementById('theme-button');
        if (!btn) return;
        for (var i = 0; i < 3 && localStorage.getItem('theme') !== target; i++) btn.click();
        renderThemeSwitch();
    }

    /* «Описания кнопок» — показывать ли строку под названием плитки. localStorage.dgTileDesc:
       'off' прячет (возвращает прежний вид, описание остаётся tooltip'ом), всё остальное — 'on'.
       Сам переключатель живёт в /settings/ (owner: "очень неважная настройка" — не место в
       быстром бургер-меню рядом с языком/темой); здесь только чтение флага при отрисовке плиток. */
    var TILE_DESC_KEY = 'dgTileDesc';
    function tileDescEnabled() {
        try { return localStorage.getItem(TILE_DESC_KEY) !== 'off'; } catch (e) { return true; }
    }

    function renderThemeSwitch() {
        var host = document.getElementById('dg-theme-seg');
        if (!host) return;
        var active = localStorage.getItem('theme') || 'auto';
        host.innerHTML = '';
        /* Порядок и значки — как у кнопки темы в ряду выдачи (assets/js/themeswitch.js,
           switchIcon): полумесяц у тёмной, солнце у светлой, наполовину закрашенный круг у
           системной. Один и тот же значок обязан означать одно и то же в обоих местах. */
        host.appendChild(segmented([
            { value: 'dark', label: t('menu.themeDark', 'Тёмная'), icon: 'moon' },
            { value: 'light', label: t('menu.themeLight', 'Светлая'), icon: 'sun' },
            /* «Авто», а не «Системная»: длинное слово на телефоне не влезало в треть переключателя
               и обрезалось многоточием (замерено на 375px). Владелец и сам зовёт режим «авто». */
            { value: 'auto', label: t('menu.themeAuto', 'Авто'), icon: 'circleHalf' }
        ], active, applyTheme));
    }

    /* issue #5: same localStorage.uiScale key and 70-150/step-10 range as /settings/'s own
       "Text size" row (settings/index.html #sizeMinus/#sizePlus) — a second, independent
       implementation because that page is a separate small vanilla-JS document, same as
       renderThemeSwitch() above duplicates themeswitch.js's own step logic rather than sharing
       it. Unlike the theme switch, there is no reader/document.documentElement.style.fontSize
       applied WITHOUT this: settings.js's older #fontDec/#fontInc apply-on-click handler targets
       ids that only ever existed in the legacy reader-template.html, never on this page — so the
       saved scale silently never took effect here or in the reader before this. Applying it here
       on every render (not just on click) is what actually fixes that, whether or not the drawer
       itself was ever opened this session. */
    var FONT_SCALE_KEY = 'uiScale';
    function currentFontScale() {
        var v = parseInt(localStorage.getItem(FONT_SCALE_KEY), 10);
        return (v >= 70 && v <= 150) ? v : 100;
    }
    /* issue #13 ("непредсказуемо увеличиваются шрифты"): раньше размер применялся как
       html { font-size: N% }. Это двигает ТОЛЬКО то, что задано в rem — а в этом файле 131
       размер задан в px против 73 в rem, и ни одно поле/иконка/отступ не задан в rem вовсе.
       Получалось ровно то, на что жалоба: подпись плитки (rem) росла в полтора раза, её
       описание (px) не менялось, коробка плитки не менялась тоже — текст вылезал из рамки.
       Зум масштабирует ВСЁ одинаково: и текст, и рамки, и иконки, и отступы, — то есть ровно
       "все шрифты и все элементы интерфейса пропорционально". Переписывать 131 объявление в rem
       не нужно, и отступы это всё равно бы не починило.
       --dg-zoom рядом — для правил с vw (полосы во всю ширину окна): vw зумом не масштабируются,
       без деления на него полоса вылезала бы за экран (см. home.css, #dg-hero-band). */
    // zoom есть везде, кроме Safari до 17 и Firefox до 126 — там свойство просто игнорируется, и
    // без запасного пути контрол размера на старом iPhone не делал бы РОВНО ничего (хуже, чем
    // было). Фолбэк — прежний html{font-size}: двигает только rem, но это лучше пустой кнопки.
    var CAN_ZOOM = !!(window.CSS && CSS.supports && CSS.supports('zoom', '1.5'));
    function applyUiScale(scale) {
        var root = document.documentElement;
        if (!CAN_ZOOM) { root.style.fontSize = scale + '%'; return; }
        root.style.fontSize = '';
        root.style.setProperty('--dg-zoom', scale / 100);
        root.style.zoom = scale / 100;
    }
    // Size changed in the settings sheet (an iframe, same tab) — apply it to this page right away.
    window.addEventListener('storage', function (e) { if (e.key === FONT_SCALE_KEY) renderFontSizeControl(); });
    function renderFontSizeControl() {
        var scale = currentFontScale();
        applyUiScale(scale);
        var host = document.getElementById('dg-fontsize-ctrl');
        if (!host) return;
        host.innerHTML = '';
        var dec = document.createElement('button');
        dec.type = 'button';
        dec.className = 'dg-fontsize-btn';
        dec.textContent = '−';
        dec.setAttribute('aria-label', t('menu.fontSizeDec', 'Уменьшить шрифт'));
        var val = document.createElement('span');
        val.className = 'dg-fontsize-val';
        var inc = document.createElement('button');
        inc.type = 'button';
        inc.className = 'dg-fontsize-btn';
        inc.textContent = '+';
        inc.setAttribute('aria-label', t('menu.fontSizeInc', 'Увеличить шрифт'));
        function paint() {
            val.textContent = scale + '%';
            dec.disabled = scale <= 70;
            inc.disabled = scale >= 150;
        }
        function set(v) {
            scale = Math.min(150, Math.max(70, v));
            localStorage.setItem(FONT_SCALE_KEY, scale);
            applyUiScale(scale);
            paint();
        }
        dec.addEventListener('click', function () { set(scale - 10); });
        inc.addEventListener('click', function () { set(scale + 10); });
        paint();
        host.appendChild(dec);
        host.appendChild(val);
        host.appendChild(inc);
    }

    // ======================================================================
    // Подсказка под полем
    // ======================================================================
    function renderHint() {
        var input = document.getElementById('paliauto');
        var host = document.getElementById('home-hint');
        if (!input || !host) return;
        var q = input.value.trim();
        if (!q) { host.innerHTML = ''; return; }
        var route = window.DgTextRouter ? window.DgTextRouter.classify(q) : { type: 'search' };
        var text = route.type === 'search'
            ? t('home.hintSearch', 'искать «{q}»').replace('{q}', q)
            : t('home.hintText', 'похоже на ссылку на текст');
        host.innerHTML = '<span class="dg-hint">↵ ' + esc(text) + '</span>';
    }

    // ======================================================================
    // Init
    // ======================================================================
    function applyMenuLangStrings() {
        // Подписи плиток приходят из menu-links.json (они же подписи разделов легаси-меню),
        // а девиз и подсказки — из lang_{lang}.json через DHAMMA_I18N.
        var motto = document.getElementById('home-motto');
        if (motto) motto.textContent = t('home.motto', 'Найдите Истину');
        var subtitle = document.getElementById('home-subtitle');
        if (subtitle) subtitle.textContent = t('home.subtitle', 'В Палийских Суттах и Винае');
        var goLabel = document.querySelector('.dg-shell-go-label');
        if (goLabel) goLabel.textContent = t('home.searchBtn', 'Искать');
        renderScopeSummary();
        renderTiles();
        renderSlides();
        paintDrawerIcons();
        paintDrawerLangHrefs();
        renderFooter();
        renderExtra();
        renderHowTo();
        renderLangSwitch();
        renderThemeSwitch();
        renderFontSizeControl();
        // Owner screenshot: mode titles ("Standard"/"Multi Trn") stayed in the OLD language
        // after clicking EN/RU inside an already-open drawer — paintReaderModes() only ran from
        // openDrawer(), never on a live language switch while the drawer was already showing.
        paintReaderModes();
        // Именно здесь, а не раньше: i18n только что проставил placeholder из перевода, и
        // случайная фраза должна лечь поверх него.
        applyRandomPlaceholder();
        // '__slides__' — не набор ссылок, перерисовывать его через openSheet() нечем.
        if (currentSheetKey && currentSheetKey !== '__slides__') openSheet(currentSheetKey);
        renderHint();
    }

    function init() {
        document.body.classList.add('dg-skin-minimal');

        var input = document.getElementById('paliauto');
        if (input) {
            watchInputValue();
            input.addEventListener('input', function () { renderHint(); syncInputChrome(); });
            syncInputChrome();
        }

        var clearBtn = document.getElementById('dg-clear-btn');
        if (clearBtn && input) {
            clearBtn.addEventListener('click', function () {
                input.value = '';
                input.focus();
                syncInputChrome();
                renderHint();
            });
        }

        var addTile = document.getElementById('dg-add-tile');
        if (addTile) addTile.addEventListener('click', openAddTile);

        var editTiles = document.getElementById('dg-edit-tiles');
        if (editTiles) editTiles.addEventListener('click', openEditList);

        var restore = document.getElementById('dg-restore-tiles');
        if (restore) {
            restore.addEventListener('click', function () {
                /* «Как было» — значит ровно как было с самого начала: и состав, и порядок, и свои
                   кнопки. Свои спрашиваем отдельно: порядок и убранные восстанавливаются из
                   исходных данных, а созданная вручную кнопка исчезает насовсем — её неоткуда
                   взять обратно. */
                var own = customTiles();
                if (own.length) {
                    var ask = t('menu.resetConfirm', 'Свои кнопки (%s) будут удалены. Продолжить?')
                        .replace('%s', own.length);
                    if (!window.confirm(ask)) return;
                    setCustomTiles([]);
                }
                setHiddenTiles([]);
                resetTileOrder();
                renderTiles();
            });
        }

        var quickBtn = document.getElementById('dg-quick-btn');
        if (quickBtn) {
            quickBtn.innerHTML = quickButtonHtml();
            quickBtn.addEventListener('click', function () {
                if (isQuickOpen()) closeQuick(); else openQuick();
            });
        }

        wireDrawer();

        paintDrawerIcons();
        paintDrawerLangHrefs();
        renderFooter();
        renderExtra();
        renderHowTo();
        revealAnchorSection(); // прямой заход с хешем в адресе (/#contacts и т.п.)
        renderLangSwitch();
        renderThemeSwitch();
        renderFontSizeControl();
        syncRestoreLink();

        fetch(MENU_URL)
            .then(function (r) { return r.json(); })
            .then(function (data) { menuData = mergeMenuLang(data); applyMenuLangStrings(); })
            .catch(function (e) { console.warn('menu-links.json не загрузился:', e); });

        fetch(SLIDES_URL)
            .then(function (r) { return r.json(); })
            .then(function (data) { slidesData = data; renderSlides(); })
            .catch(function (e) { console.warn('slides.json не загрузился:', e); });

        fetch(ANNOUNCE_URL)
            .then(function (r) { return r.json(); })
            .then(function (data) { announceData = data; scheduleAnnounce(); })
            .catch(function (e) { console.warn('announcements.json не загрузился:', e); });

        fetch(DICT_MODES_URL)
            .then(function (r) { return r.json(); })
            .then(function (data) { dictModeGroups = data.groups || []; })
            .catch(function (e) { console.warn('dict-modes.json не загрузился:', e); });

        fetch(SCRIPTS_URL)
            .then(function (r) { return r.json(); })
            .then(function (data) { scriptKeysList = Array.isArray(data) ? data : []; })
            .catch(function (e) { console.warn('scripts.json не загрузился:', e); });

        /* Смена языка интерфейса на лету — перерисовываем набор ссылок и подписи.
           applyRandomPlaceholder() зовём ОТДЕЛЬНО и без условия на menuData: событие приходит уже
           после того, как i18n проставил placeholder из перевода, и случайная фраза должна лечь
           поверх него. Если ждать загрузки menu-links.json, перевод так и останется — замерено:
           в поле стояло «например, Kāyagat или sn56.11» вместо «пр. …». */
        document.addEventListener('dhamma:languagechange', function () {
            if (menuData) applyMenuLangStrings();
            paintDrawerLangHrefs(); // не зависит от menuData — красим и до его загрузки (гонка при ?lang=ru)
            applyRandomPlaceholder();
            renderAnnounce(); // у объявления свой текст на каждый язык
        });
        if (window.DHAMMA_I18N && window.DHAMMA_I18N.ready) {
            window.DHAMMA_I18N.ready.then(function () {
                if (menuData) applyMenuLangStrings();
                paintDrawerLangHrefs();
                applyRandomPlaceholder();
            });
        }
    }

    window.DgHome = {
        setState: setState,
        closeSheet: closeSheet,
        renderHint: renderHint,
        // Значение поля выставляют и снаружи (initSearchApp пишет туда запрос из адреса), а
        // jQuery .val() событие input не шлёт — крестик «очистить» иначе бы не появился.
        syncInput: syncInputChrome,
        // Зовётся из dgSetState() в index.html: классы состояния переключаются там.
        onStateChanged: applyRandomPlaceholder,
        closeAutocomplete: closeAutocomplete,
        openQuick: openQuick,
        closeQuick: closeQuick,
        quickButtonHtml: quickButtonHtml,
        // Зовётся из перехватчика beforeinstallprompt/appinstalled в index.html — перерисовать
        // тайл «Установить» в #dg-cta, когда событие пришло уже после первого рендера.
        renderExtra: renderExtra,
        // Зовётся с public/404.html: тот рисует свою компактную строку иконок мультитула (не
        // домашние карточки), но клики должны открывать РЕАЛЬНЫЕ шторку/мега-меню, а не
        // хардкоженные href на странице ошибки — тут ровно та же логика, что у настоящих плиток.
        runTile: runTile,
        // Открыть/закрыть бургер — нужно public/overrides/js/dg-page-find-ui.js: пункт «Найти на
        // странице» сам закрывает шторку после клика (как остальные пункты, см. makeModeRow), а
        // движок поиска зовёт openDrawer() как reveal() для контейнера #dg-drawer, если найденное
        // совпадение сидит внутри закрытой шторки.
        openDrawer: openDrawer,
        closeDrawer: closeDrawer,
        // Mobile slide-in settings sheet (index.html intercepts the /settings/ link on narrow
        // screens instead of navigating away — see the dg-drawer-row/settingsButton handler).
        openSettingsSheet: openSettingsSheet,
        closeSettingsSheet: closeSettingsSheet,
        isSettingsSheetOpen: function () { return settingsSheetOpen || settingsBackPending; }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
