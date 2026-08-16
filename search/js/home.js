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
        bolt: ['fas', 'bolt'],
        magnifier: ['fas', 'magnifying-glass'],
        bars: ['fas', 'bars'],
        moon: ['fas', 'moon'],
        circleHalf: ['fas', 'circle-half-stroke'],
        display: ['fas', 'display'],
        language: ['fas', 'language']
    };

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
        /* Звезда — СЛЕВА от пункта, на месте обычного значка строки: она помечает сам пункт, а
           уехав в конец строки, вставала за описанием и читалась как отдельная кнопка. Значок
           «внешняя ссылка» у помеченных пунктов при этом не рисуется — двух значков в строке не
           нужно, а важность важнее. */
        a.innerHTML = chip
            ? (item.star ? starSvg() : '') + esc(item.label)
            : (item.star ? starSvg() : svg('external', 'dg-row-icon')) +
              '<span class="dg-row-label">' + esc(item.label) +
              (item.desc ? '<small class="dg-row-desc">' + esc(item.desc) + '</small>' : '') +
              '</span>';

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

    /* Шестерёнка с молнией. Молния лежит В ЦЕНТРЕ шестерёнки, а не в углу значка: у fa-gear
       середина пустая, молния туда садится ровно и читается как одна иконка, а не как значок с
       налепленным сбоку вторым. Обе — из того же набора, что и всё меню (fa-gear, fa-bolt). */
    function quickButtonHtml() {
        return faSvg('gear', 'dg-qs-gear') +
            '<span class="dg-qs-bolt">' + faSvg('bolt', '') + '</span>';
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
            label: 'quick.scope.kn', fallback: 'Кхуддака Никая',
            items: [
                { codes: ['iti'], label: 'quick.scope.iti', fallback: 'Итивуттака' },
                { codes: ['ud'], label: 'quick.scope.ud', fallback: 'Удана' },
                { codes: ['snp'], label: 'quick.scope.snp', fallback: 'Сутта Нипата' },
                { codes: ['dhp'], label: 'quick.scope.dhp', fallback: 'Дхаммапада' },
                { codes: ['thag'], label: 'quick.scope.thag', fallback: 'Тхерагатха' },
                { codes: ['thig'], label: 'quick.scope.thig', fallback: 'Тхеригатха' }
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
    }

    function buildQuickBody(host) {
        host.innerHTML = '';
        var state = currentState();

        if (state !== 'reader') {
            host.appendChild(groupTitle(t('quick.where', 'Где искать')));
            host.appendChild(scopePicker());

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

    function openQuick() {
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
            /* Иконка — в кружке из акцентного фона: так плитка читается как значок с подписью,
               а не как строка списка в рамке. */
            el.innerHTML = '<span class="dg-tile-ic">' + svg(tile.icon) + '</span>' +
                '<span class="dg-tile-label">' + esc(tile.label) + '</span>';
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
    /* Значки у пунктов бокового меню и у заголовков в нём. Проставляются один раз, по атрибуту
       data-dg-icon в разметке: держать их в HTML нельзя — FontAwesome на этой странице сама
       <i> не разворачивает (см. faSvg). */
    function paintDrawerIcons() {
        Array.prototype.forEach.call(document.querySelectorAll('[data-dg-icon]'), function (el) {
            if (el.querySelector('.dg-row-ic')) return;
            el.insertAdjacentHTML('afterbegin', faSvg(el.dataset.dgIcon, 'dg-row-ic'));
        });
    }

    /* Подвал: копирайт с ТЕКУЩИМ годом. Год берём из часов, а не из разметки — вписанный руками
       он к каждому январю устаревает, и это замечают. */
    function renderFooter() {
        var host = document.getElementById('dg-copyright');
        if (!host) return;
        host.textContent = '© ' + new Date().getFullYear() + ' dhamma.gift';
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

        paintDrawerIcons();
        renderFooter();
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
