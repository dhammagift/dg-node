/* Домашний экран страницы поиска: плитки, шторка со ссылками, подсказка под полем и
 * переключение состояний home/results/reader.
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
    var TILE_ORDER = {
        en: ['read', 'external', 'dicts', 'materials', 'tools', 'history'],
        ru: ['read', 'external', 'russian', 'dicts', 'materials', 'tools', 'history']
    };

    /* Иконки плиток и строк — инлайновые SVG, а не FontAwesome: на этой странице fa не
       разворачивает часть иконок (уже наступали с лупой, см. комментарий в index.html). */
    var ICONS = {
        book: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>',
        bookmark: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><path d="M9 7h7M9 11h5"/>',
        globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-6-3.8-9s1.3-6.5 3.8-9z"/>',
        dict: '<rect x="5" y="7" width="14" height="11" rx="2"/><path d="M9 3v4M15 3v4M9 12h.01M15 12h.01M8 16h8"/>',
        clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2" stroke-linecap="round"/>',
        cap: '<path d="M12 4 2.5 9 12 14l9.5-5L12 4z" stroke-linejoin="round"/><path d="M6 11v4.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V11"/>',
        wrench: '<path d="M14.7 6.3a3 3 0 11-4.2 4.2L4 17v3h3l6.5-6.5" stroke-linejoin="round"/>',
        external: '<path d="M14 4h6v6M20 4l-9 9M6 5H4v15h15v-2" stroke-linejoin="round"/>'
    };

    function svg(name, cls) {
        return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="1.6" aria-hidden="true">' + (ICONS[name] || ICONS.external) + '</svg>';
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

    // ======================================================================
    // Состояния страницы: home / results / reader
    // ======================================================================
    var STATES = ['dg-state-home', 'dg-state-results', 'dg-state-reader'];

    function setState(name) {
        var cls = 'dg-state-' + name;
        STATES.forEach(function (s) { document.body.classList.toggle(s, s === cls); });
        if (name !== 'home') closeSheet();
    }

    // ======================================================================
    // Шторка
    // ======================================================================
    function ensureSheet() {
        if (document.getElementById('dg-sheet')) return;
        var backdrop = document.createElement('div');
        backdrop.id = 'dg-sheet-backdrop';
        backdrop.addEventListener('click', closeSheet);

        var sheet = document.createElement('div');
        sheet.id = 'dg-sheet';
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

        document.body.appendChild(backdrop);
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
        if (backdrop) backdrop.classList.remove('show');
        currentSheetKey = null;
        // hidden ставим после анимации ухода, иначе шторка пропадёт рывком
        setTimeout(function () { if (!currentSheetKey) sheet.hidden = true; }, 320);
    }

    /* Недавние запросы — из localStorage.localSearchHistory. Формат записи задаёт
       settings.js/saveToHistory(): [ключ, путь+query+hash, ISO-таймстамп]. */
    function recentGroups(tile) {
        var items = [];
        try {
            var hist = JSON.parse(localStorage.getItem('localSearchHistory')) || [];
            items = hist.slice(0, 12).map(function (entry) {
                return { label: entry[0], href: entry[1] };
            });
        } catch (e) { /* битый JSON в истории не должен ломать шторку */ }

        var groups = [];
        if (items.length) groups.push({ name: t('home.recent', 'Недавнее'), items: items });
        groups.push({ name: t('home.allHistory', 'Вся история'), items: [{ label: tile.label, href: tile.href }] });
        return groups;
    }

    function groupsOf(key, tile) {
        return tile.recent ? recentGroups(tile) : (tile.groups || []);
    }

    function renderItem(item) {
        var a = document.createElement('a');
        a.className = 'dg-sheet-row';
        a.href = item.href || 'javascript:void(0)';
        if (item.title) a.title = item.title;
        if (item.blank) { a.target = '_blank'; a.rel = 'noopener'; }
        a.innerHTML = svg('external', 'dg-row-icon') +
            '<span class="dg-row-label">' + esc(item.label) + '</span>' +
            (item.star ? '<span class="dg-row-star" aria-hidden="true">✦</span>' : '');

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

    function openSheet(key) {
        ensureSheet();
        var data = menuData[menuLang()];
        var tile = data[key];
        if (!tile) return;

        currentSheetKey = key;
        var sheet = document.getElementById('dg-sheet');
        var backdrop = document.getElementById('dg-sheet-backdrop');
        sheet.hidden = false;

        document.getElementById('dg-sheet-title').textContent = tile.label;

        // Вкладки — все плитки-со-шторкой, чтобы переключаться между наборами не закрывая её
        var tabsHost = document.getElementById('dg-sheet-tabs');
        tabsHost.innerHTML = '';
        (TILE_ORDER[menuLang()] || TILE_ORDER.en).forEach(function (k) {
            var td = data[k];
            if (!td || (!td.groups && !td.recent)) return;
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = td.label;
            if (k === key) b.className = 'on';
            b.addEventListener('click', function () { openSheet(k); });
            tabsHost.appendChild(b);
        });

        var body = document.getElementById('dg-sheet-body');
        body.innerHTML = '';
        var groups = groupsOf(key, tile);
        if (!groups.length) {
            body.innerHTML = '<p class="dg-sheet-empty">' + esc(t('home.noItems', 'Пока пусто')) + '</p>';
        }
        groups.forEach(function (g) {
            var h = document.createElement('p');
            h.className = 'dg-group-title';
            h.textContent = g.name;
            body.appendChild(h);
            g.items.forEach(function (item) { body.appendChild(renderItem(item)); });
        });

        // Показ на следующем кадре: у только что показанного (hidden=false) элемента переход
        // не проигрывается, если класс поставить в том же кадре.
        requestAnimationFrame(function () {
            sheet.classList.add('show');
            if (backdrop) backdrop.classList.add('show');
        });
    }

    // ======================================================================
    // Плитки
    // ======================================================================
    function renderTiles() {
        var host = document.getElementById('home-tiles');
        if (!host || !menuData) return;
        var lang = menuLang();
        var data = menuData[lang];
        host.innerHTML = '';

        (TILE_ORDER[lang] || TILE_ORDER.en).forEach(function (key) {
            var tile = data[key];
            if (!tile) return;

            var el;
            if (tile.groups || tile.recent) {
                el = document.createElement('button');
                el.type = 'button';
                el.addEventListener('click', function () { openSheet(key); });
            } else {
                // Плитка-ссылка (сейчас это "Читать Pāḷi" → легаси /read.php). Уход со страницы
                // с перезагрузкой здесь ожидаем и допускаем: бесшовность нужна поиску и чтению,
                // остальные разделы сайта остаются отдельными документами.
                el = document.createElement('a');
                el.href = tile.href;
            }
            el.className = 'dg-tile';
            el.innerHTML = svg(tile.icon) + '<span>' + esc(tile.label) + '</span>';
            host.appendChild(el);
        });
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
        if (currentSheetKey) openSheet(currentSheetKey);
        renderHint();
    }

    function init() {
        document.body.classList.add('dg-skin-minimal');

        var input = document.getElementById('paliauto');
        if (input) input.addEventListener('input', renderHint);

        fetch(MENU_URL)
            .then(function (r) { return r.json(); })
            .then(function (data) { menuData = data; applyMenuLangStrings(); })
            .catch(function (e) { console.warn('menu-links.json не загрузился:', e); });

        // Смена языка интерфейса на лету — перерисовываем набор ссылок и подписи
        document.addEventListener('dhamma:languagechange', function () {
            if (menuData) applyMenuLangStrings();
        });
        if (window.DHAMMA_I18N && window.DHAMMA_I18N.ready) {
            window.DHAMMA_I18N.ready.then(function () { if (menuData) applyMenuLangStrings(); });
        }
    }

    window.DgHome = { setState: setState, closeSheet: closeSheet, renderHint: renderHint };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
