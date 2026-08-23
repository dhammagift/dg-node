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
        return lang === 'ru' ? 'ru' : 'en';
    }

    var menuData = null;
    var currentSheetKey = null;
    // Mega-menu (External tile pilot) — anchored dropdown, not the bottom sheet. Own tracking
    // vars (not currentSheetKey) since it can be open at the same time nothing else is, and a
    // star toggle inside it needs to know which tile/button to redraw against.
    var currentMegaKey = null;
    var currentMegaBtn = null;

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
    function showLater(el, backdrop) {
        var done = false;
        var show = function () {
            if (done) return;
            done = true;
            el.classList.add('show');
            if (backdrop) backdrop.classList.add('show');
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
        backdrop.addEventListener('click', function () { closeSheet(); closeQuick(); closeMega(); });
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
        // hidden ставим после анимации ухода, иначе шторка пропадёт рывком
        setTimeout(function () { if (!currentSheetKey) sheet.hidden = true; }, 320);
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
                    window.open(item.tpl.replace(/{{q}}/g, encodeURIComponent(q.trim())), item.blank ? '_blank' : '_self');
                }
            });
        } else if (item.tplMulti) {
            a.addEventListener('click', function (e) {
                if (typeof window.openWithQueryMulti === 'function') window.openWithQueryMulti(e, item.tplMulti);
                else e.preventDefault();
            });
        } else if (item.action === 'openDictionaries') {
            a.addEventListener('click', function (e) {
                if (typeof window.openDictionaries === 'function') window.openDictionaries(e);
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
        }
        return a;
    }

    /* Действие плитки: у одних свой список (шторка), у других — прямое действие. Одна функция на
       оба места, где плитка встречается: сама кнопка и вкладка в шапке шторки. */
    function runTile(key, anchorEl) {
        var tile = tileData(key);
        if (!tile) return;
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
            // Помощь — уже существующая bootstrap-модалка выдачи, второй копии не заводим.
            var help = document.getElementById('SearchResultHelp');
            if (help && window.bootstrap && window.bootstrap.Modal) {
                window.bootstrap.Modal.getOrCreateInstance(help).show();
                return;
            }
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
        var groups = tile.groups || [];
        if (!groups.length) {
            body.innerHTML = '<p class="dg-sheet-empty">' + esc(t('home.noItems', 'Пока пусто')) + '</p>';
        }
        groups.forEach(function (g) {
            var h = document.createElement('p');
            h.className = 'dg-group-title';
            h.textContent = g.name;
            body.appendChild(h);

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
                    body.appendChild(blockWrap);
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
                body.appendChild(wrap);
                return;
            }
            g.items.forEach(function (item) { body.appendChild(renderItem(item)); });
        });

        showLater(sheet, backdrop);
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

    /* Тот же список режимов, что и на /settings/ (dict-modes.json) — переиспользуем select, не
       делаем свою версию. Выбор пишется в тот же localStorage.selectedDict, что читает
       settings/index.html и paliLookup.js — общий ключ, значит смена в любом месте видна везде. */
    function dictModePicker() {
        var select = document.createElement('select');
        select.className = 'dg-field-input dg-dict-select';
        var current = localStorage.getItem('selectedDict') || 'standalone';
        var ru = menuLang() === 'ru';
        (dictModeGroups || []).forEach(function (g) {
            var group = document.createElement('optgroup');
            group.label = ru ? g.labelRu : g.labelEn;
            g.options.forEach(function (o) {
                var opt = document.createElement('option');
                opt.value = o.value;
                opt.textContent = ru ? o.ru : o.en;
                if (o.value === current) opt.selected = true;
                group.appendChild(opt);
            });
            select.appendChild(group);
        });
        select.addEventListener('change', function () {
            var value = select.value;
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
        });
        return select;
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
        if (backdrop && !currentSheetKey) {
            backdrop.classList.remove('show');
            backdrop.classList.remove('dg-transparent');
        }
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

        if (state !== 'reader') {
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

        if (state === 'reader' || state === 'results') {
            /* Варианты чтения и режим колонок уже переключаются настоящими кнопками тулбара
               (#toggle-variants/#toggle-mode в ридере, #toggle-mode-results в выдаче,
               reader-template.html + megareader.js/switchView.js) — здесь просто ЖМЁМ их, как
               «Вид выдачи» выше жмёт .forshellscript, а не заводим вторую копию их логики
               (localStorage-ключи и подписи разошлись бы). Кнопок может не быть в DOM, если
               разметка ещё не смонтирована — тогда просто не показываем переключатель, а не
               мёртвый тумблер. Режим колонок и раньше был общесайтовым (dgApplyColumnMode в
               settings.js применяет .column-view и к #sutta, и к #search-pane) — здесь просто
               появилась видимая ручка для выдачи, поведение не менялось. */
            var variantsBtn = state === 'reader' ? document.getElementById('toggle-variants') : null;
            var columnsBtn = document.getElementById(state === 'reader' ? 'toggle-mode' : 'toggle-mode-results');
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
        sheet.style.top = (r.bottom + 8) + 'px';
        sheet.style.maxHeight = Math.max(220, window.innerHeight - r.bottom - 24) + 'px';
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
        sheet.hidden = false;
        document.getElementById('dg-quick-title').textContent = t('quick.title', 'Быстрые настройки');
        buildQuickBody(document.getElementById('dg-quick-body'));

        var anchored = !!btn;
        sheet.classList.toggle('dg-anchored', anchored);
        if (backdrop) backdrop.classList.toggle('dg-transparent', anchored);
        if (anchored) placeAnchored(sheet, btn);
        else sheet.removeAttribute('style');

        if (btn) btn.setAttribute('aria-expanded', 'true');
        showLater(sheet, backdrop);
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
        if (backdrop && !currentSheetKey && !isQuickOpen()) {
            backdrop.classList.remove('show');
            backdrop.classList.remove('dg-transparent');
        }
        currentMegaKey = null;
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
        sheet.style.left = left + 'px';
        sheet.style.width = width + 'px';

        var r = btn.getBoundingClientRect();
        sheet.style.top = (r.bottom + 10) + 'px';
        sheet.style.maxHeight = Math.max(220, window.innerHeight - r.bottom - 24) + 'px';
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
        placeMegaAnchored(sheet, btn);
        showLater(sheet, backdrop);
    }

    // ======================================================================
    // Боковое меню (выезжает слева)
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
    // Owner: режимы — язык-независимые типы (single/multiTran/multiLang/memorize/devanagari),
    // язык — отдельная ось (?lang=/?langs=, см. megareader.js). Поэтому описания больше не могут
    // называть конкретный язык ("+ русский"/"+ английский") — они универсальны для любого языка.
    var MODE_TITLES = {
        single: { ru: 'Один перевод', en: 'One Translation' },
        multiTran: { ru: 'Мульти перевод', en: 'Multi Translation' },
        multiLang: { ru: 'Мульти язык', en: 'Multi Language' },
        memorize: { ru: 'Для запоминания', en: 'For Memorization' },
        devanagari: { ru: 'Деванагари', en: 'Devanagari' }
    };
    var MODE_DESCRIPTIONS = {
        single: { ru: 'Pāḷi + перевод', en: 'Pāḷi + translation' },
        multiTran: { ru: 'Pāḷi + перевод (2 переводчика)', en: 'Pāḷi + translation (2 translators)' },
        multiLang: { ru: 'Pāḷi на нескольких языках перевода', en: 'Pāḷi in multiple translation languages' },
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

    function paintReaderModes() {
        var section = document.getElementById('dg-drawer-modes');
        var list = document.getElementById('dg-drawer-modes-list');
        if (!section || !list) return;

        var isReader = document.body.classList.contains('dg-state-reader');
        var modeTable = window.MODE_TABLE;
        var readerMode = window.READER_MODE;
        if (!isReader || !modeTable || !readerMode) { section.hidden = true; return; }

        section.hidden = false;
        list.innerHTML = '';
        var lang = menuLang() === 'ru' ? 'ru' : 'en';

        // Owner: mode-table.json keys are language-independent types now (single/multiTran/
        // multiLang/memorize/devanagari) — no more per-language duplicate keys (was st/mt/ml vs
        // read/ee), so the "задублировались, пункты по два раза" family-filter this list used to
        // need doesn't apply anymore: exactly one row per type, always. Switching the reading
        // language is a separate, existing control (the language toggle), not this list's job.
        // Owner: "в меню бургере вне зависимости от русского и английского языка должны быть в
        // одинаковом порядке режимы... они должны быть расположены в том же порядке в котором
        // идут их горячие клавиши" — sort by hotkey digit (settings.js — one source of truth for
        // both), same order in every language.
        var hotkeyDigits = window.MODE_HOTKEY_DIGITS || {};
        var types = Object.keys(modeTable).filter(function (k) { return k !== 'availableLangs'; })
            .sort(function (a, b) { return (hotkeyDigits[a] || 0) - (hotkeyDigits[b] || 0); });
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
        var drawer = document.getElementById('dg-drawer');
        if (drawer) {
            // Пункт «помощь» открывает bootstrap-модалку — меню при этом должно уйти само.
            drawer.addEventListener('click', function (e) {
                if (e.target.closest && e.target.closest('.dg-drawer-row')) closeDrawer();
            });
        }
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeDrawer();
        });
    }

    // ======================================================================
    // Плитки
    // ======================================================================
    function renderTiles() {
        var host = document.getElementById('home-tiles');
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
            // Описание — необязательное поле формы правки, на плитке места под него нет, поэтому
            // просто нативный tooltip, без изменений в сетке/CSS.
            if (tile.desc) el.title = tile.desc;
            /* Иконка — в кружке из акцентного фона: так плитка читается как значок с подписью,
               а не как строка списка в рамке. */
            el.innerHTML = '<span class="dg-tile-ic">' + iconHtml(tile.icon) + '</span>' +
                '<span class="dg-tile-label">' + esc(tile.label) + '</span>';
            el.addEventListener('click', function () {
                // Клик, приходящий сразу за перетаскиванием, — не выбор плитки.
                if (el.dataset.dragged === '1') { el.dataset.dragged = ''; return; }
                runTile(key, el);
            });

            var rm = document.createElement('span');
            rm.className = 'dg-tile-remove';
            rm.setAttribute('role', 'button');
            rm.setAttribute('title', tile.custom
                ? t('menu.deleteTile', 'Удалить кнопку')
                : t('menu.removeTile', 'Убрать с главной'));
            rm.textContent = '✕';
            rm.addEventListener('click', function (e) {
                // Иначе клик дойдёт до самой плитки и заодно откроет её шторку.
                e.stopPropagation();
                if (tile.custom) {
                    /* Свою кнопку УДАЛЯЕМ, а не прячем: прятать её незачем — «вернуть как было»
                       восстанавливает встроенные, а своя после возврата появилась бы снова, хотя
                       от неё явно отказались. */
                    setCustomTiles(customTiles().filter(function (c) { return c.id !== key; }));
                } else {
                    var list = hiddenTiles();
                    if (list.indexOf(key) === -1) list.push(key);
                    setHiddenTiles(list);
                }
                renderTiles();
            });
            el.appendChild(rm);

            host.appendChild(el);
        });

        wireTileDrag(host);
        syncRestoreLink();
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
            /* Раз человек взялся перекладывать кнопки — показываем и крестики «убрать»: на
               сенсорном экране навести курсор нельзя, и иначе до них не добраться. Режим
               снимается по клику мимо плиток (обработчик ниже). */
            document.body.classList.add('dg-tiles-editing');
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
            // Крестик «убрать» — не ручка для перетаскивания.
            if (e.target.closest && e.target.closest('.dg-tile-remove')) return;
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
                var far = Math.abs(e.clientX - drag.startX) > 5 || Math.abs(e.clientY - drag.startY) > 5;
                if (!far) return;
                if (e.pointerType === 'mouse') { drag.startX = e.clientX; drag.startY = e.clientY; start(e); }
                // Палец сдвинулся до срабатывания удержания — это прокрутка, а не перетаскивание.
                else { clearTimeout(drag.timer); drag = null; }
                return;
            }
            e.preventDefault();
            move(e);
        });

        host.addEventListener('pointerup', finish);
        host.addEventListener('pointercancel', finish);

        // Клик мимо плиток выключает режим правки (крестики «убрать»).
        document.addEventListener('pointerdown', function (e) {
            if (!document.body.classList.contains('dg-tiles-editing')) return;
            if (e.target.closest && e.target.closest('#home-tiles')) return;
            document.body.classList.remove('dg-tiles-editing');
        });
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
                '<a href="' + esc(s.link) + '" class="text-start">' + read + '</a>' +
                '</div>';
        }).join('');

        host.innerHTML =
            '<div class="dg-slides">' +
            '<div id="dg-carousel" class="carousel slide" data-bs-ride="carousel" data-bs-interval="7000">' +
            '<div class="carousel-inner">' + items + '</div>' +
            '<button class="carousel-control-prev" type="button" data-bs-target="#dg-carousel" data-bs-slide="prev">' +
            '<span class="carousel-control-prev-icon" aria-hidden="true"></span>' +
            '<span class="visually-hidden">Previous</span></button>' +
            '<button class="carousel-control-next" type="button" data-bs-target="#dg-carousel" data-bs-slide="next">' +
            '<span class="carousel-control-next-icon" aria-hidden="true"></span>' +
            '<span class="visually-hidden">Next</span></button>' +
            '</div>' +
            '<div class="dg-slides-foot"><button type="button" class="dg-slides-all"></button></div>' +
            '</div>';

        host.querySelector('.dg-slides-all').textContent = t('slides.showAll', 'Показать все');
        host.querySelector('.dg-slides-all').addEventListener('click', openSlidesList);

        /* data-bs-ride поднимает карусель только при разборе страницы; наша появляется позже,
           поэтому заводим её вручную. */
        if (window.bootstrap && window.bootstrap.Carousel) {
            window.bootstrap.Carousel.getOrCreateInstance(document.getElementById('dg-carousel'));
        }
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
        if (tallest) inner.style.minHeight = Math.ceil(tallest) + 'px';
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

        var hidden = hiddenTiles();
        tileOrder().forEach(function (key) {
            var tile = tileData(key);
            if (!tile || hidden.indexOf(key) !== -1) return;

            var row = document.createElement('button');
            row.type = 'button';
            row.className = 'dg-sheet-row dg-edit-row';
            row.innerHTML = '<span class="dg-row-icon dg-edit-ic">' + iconHtml(tile.icon) + '</span>' +
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
                row.querySelector('.dg-row-label').appendChild(addr);
            }
            row.addEventListener('click', function () { openTileForm(key); });
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
        host.innerHTML = '';
        // 2022 — год начала проекта, второй год всегда текущий (на проде date("Y")).
        host.appendChild(document.createTextNode('© 2022–' + new Date().getFullYear() + ' dhamma.gift · '));

        var terms = document.createElement('a');
        terms.href = 'javascript:void(0)';
        terms.className = 'dg-footer-link';
        terms.textContent = t('footer.terms', 'Условия использования');
        terms.addEventListener('click', openTerms);
        host.appendChild(terms);

        host.appendChild(document.createTextNode(' · '));

        var privacy = document.createElement('a');
        privacy.className = 'dg-footer-link';
        privacy.target = '_blank';
        privacy.rel = 'noopener';
        privacy.href = menuLang() === 'ru'
            ? '/assets/common/privacy-ru.html'
            : '/assets/common/privacy.html';
        privacy.textContent = t('footer.privacy', 'Политика конфиденциальности');
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
        document.getElementById('dg-howto-title').textContent = t('howto.title', 'Как Искать?');
        document.getElementById('dg-howto-pali').textContent = t('howto.pali', '');
        document.getElementById('dg-howto-body').textContent = t('howto.body', '');
        document.getElementById('dg-warn-title').textContent = t('howto.warnTitle', 'Пожалуйста, обратите внимание!');
        document.getElementById('dg-warn-body').textContent = t('howto.warnBody', '');
    }

    function renderExtra() {
        var host = document.getElementById('home-extra');
        if (!host) return;
        host.hidden = false;

        document.getElementById('links').textContent = t('footer.links', 'Приложения и расширения');
        document.getElementById('contacts').textContent = t('footer.contacts', 'Контакты');
        document.getElementById('dg-contacts-motto').textContent = t('home.motto', 'Найдите Истину');

        var cta = document.getElementById('dg-cta');
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

        var contacts = document.getElementById('dg-contacts');
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

        // Ported from legacy config/translate.php ($poweredby/$tooltippoweredby) — "Powered by
        // DI"/"Powered by NI" signature with a tooltip explaining the pun (Dhamma/Natural
        // Intelligence), same text per language as prod. Owner: was previously buried inline in
        // the tiny copyright footer line at the very bottom of the page (easy to miss) — prod
        // shows it as its OWN line right under the contact icons, matching that here.
        var poweredBy = document.getElementById('dg-powered-by');
        if (poweredBy) {
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

    // Полный текст условий — в шторке. Ссылка на саму лицензию внутри остаётся кликабельной.
    function openTerms() {
        ensureSheet();
        var sheet = document.getElementById('dg-sheet');
        var backdrop = document.getElementById('dg-sheet-backdrop');
        sheet.hidden = false;
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
        renderTiles();
        renderSlides();
        paintDrawerIcons();
        renderFooter();
        renderExtra();
        renderHowTo();
        renderLangSwitch();
        renderThemeSwitch();
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
        renderFooter();
        renderExtra();
        renderHowTo();
        revealAnchorSection(); // прямой заход с хешем в адресе (/#contacts и т.п.)
        renderLangSwitch();
        renderThemeSwitch();
        syncRestoreLink();

        fetch(MENU_URL)
            .then(function (r) { return r.json(); })
            .then(function (data) { menuData = data; applyMenuLangStrings(); })
            .catch(function (e) { console.warn('menu-links.json не загрузился:', e); });

        fetch(SLIDES_URL)
            .then(function (r) { return r.json(); })
            .then(function (data) { slidesData = data; renderSlides(); })
            .catch(function (e) { console.warn('slides.json не загрузился:', e); });

        fetch(DICT_MODES_URL)
            .then(function (r) { return r.json(); })
            .then(function (data) { dictModeGroups = data.groups || []; })
            .catch(function (e) { console.warn('dict-modes.json не загрузился:', e); });

        /* Смена языка интерфейса на лету — перерисовываем набор ссылок и подписи.
           applyRandomPlaceholder() зовём ОТДЕЛЬНО и без условия на menuData: событие приходит уже
           после того, как i18n проставил placeholder из перевода, и случайная фраза должна лечь
           поверх него. Если ждать загрузки menu-links.json, перевод так и останется — замерено:
           в поле стояло «например, Kāyagat или sn56.11» вместо «пр. …». */
        document.addEventListener('dhamma:languagechange', function () {
            if (menuData) applyMenuLangStrings();
            applyRandomPlaceholder();
        });
        if (window.DHAMMA_I18N && window.DHAMMA_I18N.ready) {
            window.DHAMMA_I18N.ready.then(function () {
                if (menuData) applyMenuLangStrings();
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
        renderExtra: renderExtra
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
