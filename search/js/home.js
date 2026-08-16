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

    /* Порядок плиток ПО УМОЛЧАНИЮ. Пользовательский порядок (перетаскивание) хранится в
       localStorage.dgTileOrder и этот список только дополняет: ключи, которых в сохранённом
       порядке нет (новая плитка в menu-links.json), дописываются в конец, а исчезнувшие
       отбрасываются. Поэтому добавление плитки не ломает уже настроенный порядок. */
    var DEFAULT_TILE_ORDER = {
        en: ['read', 'external', 'dicts', 'materials', 'tools', 'history', 'help'],
        ru: ['read', 'external', 'russian', 'dicts', 'materials', 'tools', 'history', 'help']
    };
    var TILE_ORDER_KEY = 'dgTileOrder';

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
        help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 114 2.2c-.9.6-1.6 1.1-1.6 2.1M12 17h.01" stroke-linecap="round"/>',
        external: '<path d="M14 4h6v6M20 4l-9 9M6 5H4v15h15v-2" stroke-linejoin="round"/>'
    };

    function svg(name, cls) {
        return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="1.6" aria-hidden="true">' + (ICONS[name] || ICONS.external) + '</svg>';
    }

    /* Звезда у важных пунктов. Раньше рисовался знак ✦ — но ромбик на этом сайте уже занят:
       им помечены скрытые ссылки-якоря на цитаты (.quoteLink-start в выдаче и ридере), и два
       разных смысла у одного значка сбивали с толку. Это контур fa-star (FontAwesome Free),
       инлайном — иконочный шрифт на этой странице часть значков не разворачивает. */
    var STAR_PATH = 'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9z';
    function starSvg() {
        return '<svg class="dg-row-star" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="' + STAR_PATH + '"/></svg>';
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

    function currentState() {
        if (document.body.classList.contains('dg-state-reader')) return 'reader';
        if (document.body.classList.contains('dg-state-results')) return 'results';
        return 'home';
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
        var saved = readOrderStore()[lang];
        if (!Array.isArray(saved)) return known;
        var kept = saved.filter(function (k) { return known.indexOf(k) !== -1; });
        known.forEach(function (k) { if (kept.indexOf(k) === -1) kept.push(k); });
        return kept;
    }

    function saveTileOrder(keys) {
        var store = readOrderStore();
        store[menuLang()] = keys;
        try { localStorage.setItem(TILE_ORDER_KEY, JSON.stringify(store)); } catch (e) { /* приватный режим */ }
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

    function syncRestoreLink() {
        var link = document.getElementById('dg-restore-tiles');
        if (link) link.hidden = hiddenTiles().length === 0;
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
        // Подложка общая для обеих шторок — закрываем ту, что открыта.
        backdrop.addEventListener('click', function () { closeSheet(); closeQuick(); });
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

    function renderItem(item, chip) {
        var a = document.createElement('a');
        a.className = chip ? 'dg-chip' : 'dg-sheet-row';
        a.href = item.href || 'javascript:void(0)';
        if (item.title) a.title = item.title;
        if (item.blank) { a.target = '_blank'; a.rel = 'noopener'; }
        /* desc — короткое «что это такое». Проставлено пока не всем пунктам, а первым в наборе:
           по ним и видно, чем набор занимается (просьба владельца — «чтобы было нагляднее»). */
        a.innerHTML = chip
            ? esc(item.label) + (item.star ? starSvg() : '')
            : svg('external', 'dg-row-icon') +
              '<span class="dg-row-label">' + esc(item.label) +
              (item.desc ? '<small class="dg-row-desc">' + esc(item.desc) + '</small>' : '') +
              '</span>' +
              (item.star ? starSvg() : '');

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
    function runTile(key) {
        var tile = (menuData[menuLang()] || {})[key];
        if (!tile) return;
        if (tile.groups) { openSheet(key); return; }
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
        if (tile.href) window.location.href = tile.href;
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

    function quickButtonHtml() {
        return '<svg class="dg-qs-gear" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="' + GEAR_PATH + '"/></svg>' +
            '<svg class="dg-qs-bolt" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="' + BOLT_PATH + '"/></svg>';
    }

    /* Область поиска. Ключ и формат — те же, что у полных настроек (/settings/): список
       id-префиксов через запятую, отсутствие ключа = набор по умолчанию. Здесь только крупные
       наборы: быстрые настройки отвечают на «где искать вот это», подробный разбор по книгам
       живёт в полных. Коды и их состав не выдуманы — скопированы из settings/index.html. */
    /* Никаи — по одной: «где искать» чаще всего означает именно «в DN или в MN», а не «во всех
       четырёх сразу». Остальное — крупными наборами, подробный разбор по книгам живёт в полных
       настройках. */
    var SCOPE_GROUPS = [
        { codes: ['dn'], label: 'quick.scope.dn', fallback: 'DN · Дигха' },
        { codes: ['mn'], label: 'quick.scope.mn', fallback: 'MN · Маджхима' },
        { codes: ['sn'], label: 'quick.scope.sn', fallback: 'SN · Саньютта' },
        { codes: ['an'], label: 'quick.scope.an', fallback: 'AN · Ангуттара' },
        { codes: ['iti', 'ud', 'snp', 'dhp', 'thag', 'thig'], label: 'quick.scope.knBasic', fallback: 'KN · основные книги' },
        { codes: ['khudakka'], label: 'quick.scope.knAll', fallback: 'KN · вся Кхуддака' },
        { codes: ['pli-tv-bi', 'pli-tv-bu'], label: 'quick.scope.vinaya', fallback: 'Виная (Вибханга)' },
        { codes: ['pli-tv-kd', 'pli-tv-pvr'], label: 'quick.scope.kdPvr', fallback: 'Кхандхака и Паривара' },
        { codes: ['abhi'], label: 'quick.scope.abhi', fallback: 'Абхидхамма' }
    ];
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

    function toggleRow(label, on, onChange) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'dg-toggle-row';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.innerHTML = '<span class="dg-toggle-label">' + esc(label) + '</span>' +
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

    function segmented(options, activeValue, onPick) {
        var wrap = document.createElement('div');
        wrap.className = 'dg-segmented';
        options.forEach(function (opt) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = opt.label;
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
    function buildQuickBody(host) {
        host.innerHTML = '';
        var state = currentState();

        if (state !== 'reader') {
            host.appendChild(groupTitle(t('quick.where', 'Где искать')));
            var scope = readScope();
            SCOPE_GROUPS.forEach(function (g) {
                var on = g.codes.every(function (c) { return scope.indexOf(c) !== -1; });
                host.appendChild(toggleRow(t(g.label, g.fallback), on, function (next) {
                    var list = readScope();
                    g.codes.forEach(function (c) {
                        var i = list.indexOf(c);
                        if (next && i === -1) list.push(c);
                        if (!next && i !== -1) list.splice(i, 1);
                    });
                    writeScope(list);
                }));
            });

            host.appendChild(groupTitle(t('quick.context', 'Контекст в цитатах')));
            var ctx = String(localStorage.getItem('dhammaSearchContextBefore') || 0);
            host.appendChild(segmented([
                { value: '0', label: t('quick.ctx0', 'Только строка') },
                { value: '1', label: t('quick.ctx1', '+1 строка') },
                { value: '2', label: t('quick.ctx2', '+2 строки') }
            ], ctx, function (v) {
                localStorage.setItem('dhammaSearchContextBefore', v);
                localStorage.setItem('dhammaSearchContextAfter', v);
            }));
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

        var note = document.createElement('p');
        note.className = 'dg-qs-note';
        note.textContent = t('quick.note', 'Значения по умолчанию и подробный разбор по книгам — в полных настройках.');
        host.appendChild(note);
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

    /* На широком экране быстрые настройки — выпадашка под самой шестерёнкой (они относятся к
       этому полю, уводить взгляд на середину экрана незачем). На узком остаётся нижняя шторка:
       выпадашке там негде развернуться. Координаты ставим инлайном, по фактическому положению
       кнопки — она переезжает вместе с полем при смене состояния. */
    var ANCHOR_MIN_WIDTH = 768;

    function placeAnchored(sheet, btn) {
        var r = btn.getBoundingClientRect();
        var width = 340;
        var left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
        sheet.style.left = left + 'px';
        sheet.style.top = (r.bottom + 8) + 'px';
        sheet.style.maxHeight = Math.max(220, window.innerHeight - r.bottom - 24) + 'px';
    }

    function openQuick() {
        ensureQuick();
        var sheet = document.getElementById('dg-quick');
        var backdrop = document.getElementById('dg-sheet-backdrop');
        var btn = document.getElementById('dg-quick-btn');
        sheet.hidden = false;
        document.getElementById('dg-quick-title').textContent = t('quick.title', 'Быстрые настройки');
        buildQuickBody(document.getElementById('dg-quick-body'));

        var anchored = !!btn && window.innerWidth >= ANCHOR_MIN_WIDTH;
        sheet.classList.toggle('dg-anchored', anchored);
        if (backdrop) backdrop.classList.toggle('dg-transparent', anchored);
        if (anchored) placeAnchored(sheet, btn);
        else sheet.removeAttribute('style');

        if (btn) btn.setAttribute('aria-expanded', 'true');
        showLater(sheet, backdrop);
    }

    // ======================================================================
    // Боковое меню (выезжает слева)
    // ======================================================================
    function openDrawer() {
        var d = document.getElementById('dg-drawer');
        var b = document.getElementById('dg-drawer-backdrop');
        if (!d) return;
        d.hidden = false;
        if (b) b.hidden = false;
        showLater(d, b);
    }

    function closeDrawer() {
        var d = document.getElementById('dg-drawer');
        var b = document.getElementById('dg-drawer-backdrop');
        if (!d || d.hidden) return;
        d.classList.remove('show');
        if (b) b.classList.remove('show');
        setTimeout(function () {
            if (!d.classList.contains('show')) { d.hidden = true; if (b) b.hidden = true; }
        }, 320);
    }

    function wireDrawer() {
        // Бургеров два — в шапке главной и рядом с полем в выдаче/чтении; меню у них одно.
        Array.prototype.forEach.call(document.querySelectorAll('.dg-menu-btn'), function (btn) {
            btn.addEventListener('click', openDrawer);
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
            var tile = data[key];
            if (!tile || hidden.indexOf(key) !== -1) return;

            /* Все плитки — <button>, даже те, что просто ведут по ссылке: у <a> браузер
               начинает СВОЁ перетаскивание (ссылки и картинки перетаскиваемы по умолчанию), и
               наш порядок с ним конфликтовал бы. Переход по href делает runTile(). */
            var el = document.createElement('button');
            el.type = 'button';
            el.className = 'dg-tile';
            el.dataset.tile = key;
            el.innerHTML = svg(tile.icon) + '<span>' + esc(tile.label) + '</span>';
            el.addEventListener('click', function () {
                // Клик, приходящий сразу за перетаскиванием, — не выбор плитки.
                if (el.dataset.dragged === '1') { el.dataset.dragged = ''; return; }
                runTile(key);
            });

            var rm = document.createElement('span');
            rm.className = 'dg-tile-remove';
            rm.setAttribute('role', 'button');
            rm.setAttribute('title', t('menu.removeTile', 'Убрать с главной'));
            rm.textContent = '✕';
            rm.addEventListener('click', function (e) {
                // Иначе клик дойдёт до самой плитки и заодно откроет её шторку.
                e.stopPropagation();
                var list = hiddenTiles();
                if (list.indexOf(key) === -1) list.push(key);
                setHiddenTiles(list);
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
    var slideIndex = 0;
    var slideTimer = null;

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

    function paintSlide() {
        var host = document.getElementById('home-slides');
        if (!host || !slidesShown.length) return;
        var s = slidesShown[slideIndex % slidesShown.length];
        var title = host.querySelector('.dg-slide-title');
        var desc = host.querySelector('.dg-slide-desc');
        if (!title || !desc) return;
        /* title/desc — HTML: в исходных данных есть разметка (например <span title="dn15">10</span>
           с пояснением по наведению), и на боевой главной она echo-ится как есть. Файл наш
           собственный, из репозитория, пользовательского ввода здесь нет. */
        title.innerHTML = s.title;
        title.href = s.link;
        desc.innerHTML = s.desc;
    }

    function stepSlide(delta) {
        if (!slidesShown.length) return;
        slideIndex = (slideIndex + delta + slidesShown.length) % slidesShown.length;
        paintSlide();
        restartSlideTimer();
    }

    function restartSlideTimer() {
        if (slideTimer) clearInterval(slideTimer);
        // Как на боевой главной: слайды сменяются сами, но реже, чем bootstrap по умолчанию.
        slideTimer = setInterval(function () {
            if (document.hidden) return;
            slideIndex = (slideIndex + 1) % slidesShown.length;
            paintSlide();
        }, 8000);
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
            a.innerHTML = '<span class="dg-slide-title">' + s.title + '</span>' +
                '<span class="dg-slide-desc">' + s.desc + '</span>';
            body.appendChild(a);
        });
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
        slideIndex = 0;
        host.hidden = false;
        host.innerHTML =
            '<div class="dg-slides">' +
            '<p class="dg-slides-eyebrow"></p>' +
            '<a class="dg-slide-title" href="#"></a>' +
            '<p class="dg-slide-desc"></p>' +
            '<div class="dg-slides-foot">' +
            '<div class="dg-slides-nav">' +
            '<button type="button" class="dg-slide-prev" aria-label="Previous">‹</button>' +
            '<button type="button" class="dg-slide-next" aria-label="Next">›</button>' +
            '</div>' +
            '<button type="button" class="dg-slides-all"></button>' +
            '</div></div>';
        host.querySelector('.dg-slides-eyebrow').textContent = t('slides.title', 'Интересные запросы');
        host.querySelector('.dg-slides-all').textContent = t('slides.showAll', 'Показать все');
        host.querySelector('.dg-slide-prev').addEventListener('click', function () { stepSlide(-1); });
        host.querySelector('.dg-slide-next').addEventListener('click', function () { stepSlide(1); });
        host.querySelector('.dg-slides-all').addEventListener('click', openSlidesList);
        paintSlide();
        restartSlideTimer();
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

    // ======================================================================
    // Язык и тема в боковом меню
    // ======================================================================
    function renderLangSwitch() {
        var host = document.getElementById('dg-lang-seg');
        if (!host) return;
        var active = (window.DHAMMA_I18N && window.DHAMMA_I18N.language) ||
            localStorage.getItem('dhammaLanguage') || 'en';
        host.innerHTML = '';
        /* Только RU и EN: конфигов интерфейса для этой страницы ровно два
           (configs/search/lang_{ru,en}.json), тайского среди них нет — предлагать язык, который
           не подгрузится, нельзя. */
        host.appendChild(segmented(
            [{ value: 'ru', label: 'RU' }, { value: 'en', label: 'EN' }],
            active === 'ru' ? 'ru' : 'en',
            function (v) {
                // Тот же путь, что у переключателя языка в остальном интерфейсе.
                if (window.DHAMMA_I18N && window.DHAMMA_I18N.setLanguage) window.DHAMMA_I18N.setLanguage(v);
                else localStorage.setItem('dhammaLanguage', v);
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
        host.appendChild(segmented([
            { value: 'light', label: t('menu.themeLight', 'Светлая') },
            { value: 'dark', label: t('menu.themeDark', 'Тёмная') },
            { value: 'auto', label: t('menu.themeAuto', 'Системная') }
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
        renderLangSwitch();
        renderThemeSwitch();
        // '__slides__' — не набор ссылок, перерисовывать его через openSheet() нечем.
        if (currentSheetKey && currentSheetKey !== '__slides__') openSheet(currentSheetKey);
        renderHint();
    }

    function init() {
        document.body.classList.add('dg-skin-minimal');

        var input = document.getElementById('paliauto');
        if (input) {
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

        var restore = document.getElementById('dg-restore-tiles');
        if (restore) {
            restore.addEventListener('click', function () {
                setHiddenTiles([]);
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

        // Смена языка интерфейса на лету — перерисовываем набор ссылок и подписи
        document.addEventListener('dhamma:languagechange', function () {
            if (menuData) applyMenuLangStrings();
        });
        if (window.DHAMMA_I18N && window.DHAMMA_I18N.ready) {
            window.DHAMMA_I18N.ready.then(function () { if (menuData) applyMenuLangStrings(); });
        }
    }

    window.DgHome = {
        setState: setState,
        closeSheet: closeSheet,
        renderHint: renderHint,
        // Значение поля выставляют и снаружи (initSearchApp пишет туда запрос из адреса), а
        // jQuery .val() событие input не шлёт — крестик «очистить» иначе бы не появился.
        syncInput: syncInputChrome,
        openQuick: openQuick,
        closeQuick: closeQuick,
        quickButtonHtml: quickButtonHtml
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
