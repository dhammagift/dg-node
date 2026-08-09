// Переиспользуемый рендер результатов поиска (по суттам и по словам).
// Не зависит от конкретной HTML-страницы — только от того, что jQuery/DataTables
// уже загружены и переданы контейнеры (id/селекторы двух СТАБИЛЬНЫХ <table>-элементов,
// см. ниже). Так задумано, чтобы будущий SPA-этап мог подключить этот же файл без переделки.
//
// TODO.md поиск п.5 (фазированная загрузка) добавил третий источник перерисовки — догрузку
// цитат — на каждый /search/enrich-ответ таблица раньше пересобиралась ЦЕЛИКОМ (destroy +
// новый <table>-узел). Для страницы из десятков строк это заметно тормозило (клиентская часть
// того самого "1-2 минуты слишком долго"), а частые переинициализации одного и того же
// table-id путали внутренний реестр DataTables и портили sort order (симптом — order()
// внезапно возвращал лишний столбец сортировки, не заданный ни в одном из вызовов).
//
// Фикс — ровно то, что предлагал пользователь: ДВЕ отдельные, стабильные таблицы (по-суттная
// и по-словная), каждая инициализируется ОДИН РАЗ и живёт до конца сессии страницы. Переключение
// между отчётами — просто show/hide, без destroy. Догрузка данных (фаза 1 → /search/enrich →
// фоновый /search) — обновление данных УЖЕ инициализированной таблицы через
// .clear().rows.add(data).draw(false) — сохраняет текущую страницу/сортировку/фильтр
// автоматически, без единой строчки ручной консервации state.
window.DgSearchRender = (function () {

    // Строки интерфейса тянем из window.DHAMMA_I18N.config (см. public/overrides/js/dhamma-i18n.js
    // + res/lang_{ru,en}.json) — этот файл не завязан на конкретную HTML-страницу, поэтому читает
    // конфиг через глобал (как уже сделано для window.siteLanguage/window.findFdgTextUrl), а не
    // получает строки параметром. Если конфиг ещё не загрузился (или страница вообще не подключила
    // dhamma-i18n.js) — используется fallback, тот же текст, что был жёстко закодирован раньше.
    function t(path, fallback) {
        var cfg = window.DHAMMA_I18N && window.DHAMMA_I18N.config;
        if (!cfg) return fallback;
        var value = path.split('.').reduce(function (v, k) { return (v == null) ? undefined : v[k]; }, cfg);
        return value === undefined ? fallback : value;
    }

    // Таблицы теперь стабильны (инициализируются один раз), но КЛЮЧЕВОЕ СЛОВО поиска между
    // разными вызовами buildDataTable/buildWordDataTable МЕНЯЕТСЯ (переключение отчётов не
    // меняет ключевое слово, а вот повторный поиск через hero-форму — меняет, без перезагрузки
    // страницы). Раньше highlightWord захватывался в замыкание render()-колбэков при каждой
    // пересборке таблицы — теперь таблица не пересобирается, так что render()-колбэки должны
    // читать АКТУАЛЬНОЕ значение из общего изменяемого объекта на каждый вызов (DataTables и
    // так зовёт render() заново на каждой перерисовке — достаточно просто не кэшировать его).
    var activeState = { highlightWord: '', scope: '' };

    var suttaTableApi = null;
    var wordTableApi = null;

    // Порядок переводчиков одного языка в цитате (TODO.md поиск, баг 3: приоритетный "o"
    // должен идти ближе к Пали, даже если совпадение реально нашлось у другого переводчика —
    // тот тоже показывается, просто дальше). Тот же источник истины, что и на сервере
    // (reader/translator-priority.json, filterPreferredTranslators в dg-light.js) — не
    // дублируем список руками, просто читаем тот же файл (маленький, статичный, успевает
    // догрузиться параллельно с самим поиском задолго до первого рендера строки).
    var translatorPriority = {};
    fetch('/reader/translator-priority.json')
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (json) { translatorPriority = json || {}; })
        .catch(function () {});

    function translatorRank(lang, transKey) {
        var order = translatorPriority[lang];
        if (!order) return -1;
        var idx = order.indexOf(transKey);
        return idx === -1 ? order.length : idx;
    }

    // Кнопка "Saṁvaṭṭo / Vivaṭṭo" (развернуть/свернуть все строки) общая для обоих отчётов,
    // должна действовать на ТЕКУЩУЮ видимую таблицу — перепривязывается на каждый build*-вызов
    // (дёшево, идемпотентно через .off().on()), так что всегда указывает на таблицу, которую
    // только что построили/обновили (= ту, что сейчас видна пользователю).
    function bindExpandCollapseButtons($table) {
        $('#btn-show-all-children').off('click').on('click', function () {
            $table.find('tbody tr:not(.parent)').find('td:first-child').trigger('click');
        });
        $('#btn-hide-all-children').off('click').on('click', function () {
            $table.find('tbody tr.parent').find('td:first-child').trigger('click');
        });
    }

    // Заголовки колонок читаются через t() (не из статического <thead>, где лежат {{table.X}}
    // токены движка dhamma-i18n.js) по двум причинам: (1) таблица теперь инициализируется ОДИН
    // раз и DataTables запоминает заголовки только при этом первом вызове — если к тому моменту
    // асинхронный фетч lang_{lang}.json ещё не отработал и не подставил токены в DOM, заголовки
    // навсегда остались бы буквальным текстом "{{table.suttaCol}}"; (2) при живой смене языка
    // таблица тоже не пересобирается — без явного обновления здесь заголовки просто не
    // переведутся. applyHeaderTitles вызывается и при первой инициализации, и при каждом
    // обновлении данных, так что всегда отражает текущий язык независимо от гонки с i18n.
    function applyHeaderTitles(tableApi, titles) {
        titles.forEach(function (title, idx) {
            $(tableApi.column(idx).header()).text(title);
        });
    }

    // Кнопки одинаковые для обоих отчётов (Export/PDF работают по видимым колонкам,
    // не зависят от того, сколько их и что в них — работают одинаково для обоих режимов).
    function buildButtons() {
        return [
            {
                text: t('buttons.main', 'Main'),
                className: 'btn btn-link',
                action: function () {
                    window.location.href = "/";
                }
            },
            {
                text: t('buttons.history', 'History'),
                className: 'btn btn-link',
                action: function () {
                    window.location.href = '/history.php';
                }
            },
            {
                extend: 'collection',
                text: t('buttons.export', 'Export'),
                className: 'btn btn-link',
                buttons: [
                    {
                        extend: 'copyHtml5',
                        exportOptions: {
                            columns: function (idx, data, node) {
                                return $(node).closest('table').DataTable().column(idx).visible();
                            },
                            modifier: { search: 'applied' }
                        }
                    },
                    {
                        extend: 'excelHtml5',
                        exportOptions: {
                            columns: function (idx, data, node) {
                                return $(node).closest('table').DataTable().column(idx).visible();
                            },
                            modifier: { search: 'applied' }
                        }
                    },
                    {
                        extend: 'csvHtml5',
                        exportOptions: {
                            columns: function (idx, data, node) {
                                return $(node).closest('table').DataTable().column(idx).visible();
                            },
                            modifier: { search: 'applied' }
                        }
                    },
                    {
                        text: t('buttons.exportTxt', 'TXT'),
                        action: function (e, dt, node, config) {
                            var data = dt.buttons.exportData({
                                columns: function (idx) {
                                    return dt.column(idx).visible();
                                },
                                modifier: { search: 'applied' }
                            });

                            var textContent = [];
                            textContent.push(data.header.join('\t'));

                            data.body.forEach(function (row) {
                                var cleanRow = row.map(function (cell) {
                                    return typeof cell === 'string' ? cell.replace(/\r?\n|\r/g, ' ') : cell;
                                });
                                textContent.push(cleanRow.join('\t'));
                            });

                            var filename = document.title !== '' ? document.title : 'Export';
                            filename = filename.replace(/[^a-zA-Z0-9_¡-￿\.,\-_ !\(\)]/g, "");

                            var blob = new Blob([textContent.join('\n')], { type: 'text/plain;charset=utf-8' });
                            var url = URL.createObjectURL(blob);

                            var a = document.createElement('a');
                            a.href = url;
                            a.download = filename + '.txt';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        }
                    },
                    {
                        text: t('buttons.exportPdf', 'PDF'),
                        title: '*',
                        filename: '*',
                        exportOptions: {
                            columns: function (idx, data, node) {
                                return $(node).closest('table').DataTable().column(idx).visible();
                            },
                            modifier: { search: 'applied' },
                            format: {
                                body: function (data, row, column, node) {
                                    if (data === null || data === undefined) return '';

                                    var text = String(data);
                                    var temp = document.createElement('div');
                                    temp.innerHTML = text;

                                    var links = temp.querySelectorAll('a');
                                    links.forEach(function (a) {
                                        var url = a.href;
                                        var linkText = a.textContent || a.innerText;
                                        var placeholder = document.createTextNode('LINK_START|' + url + '|' + linkText + '|LINK_END');
                                        a.parentNode.replaceChild(placeholder, a);
                                    });

                                    var strongs = temp.querySelectorAll('strong');
                                    strongs.forEach(function (s) {
                                        var placeholder = document.createTextNode('BOLD_START|' + (s.textContent || s.innerText) + '|BOLD_END');
                                        s.parentNode.replaceChild(placeholder, s);
                                    });

                                    var brs = temp.querySelectorAll('br');
                                    brs.forEach(function (br) {
                                        br.parentNode.replaceChild(document.createTextNode('\n'), br);
                                    });
                                    var ps = temp.querySelectorAll('p');
                                    ps.forEach(function (p) {
                                        p.insertAdjacentText('beforeend', '\n');
                                    });

                                    return (temp.textContent || temp.innerText || '').trim();
                                }
                            }
                        },
                        customize: function (doc) {
                            doc.defaultStyle.font = 'NotoSans';
                            doc.pageOrientation = 'landscape';

                            var body = doc.content[1].table.body;
                            body.forEach(function (row) {
                                row.forEach(function (cell) {
                                    if (typeof cell.text === 'string') {
                                        var hasBold = cell.text.includes('BOLD_START|');
                                        var lines = cell.text.split('\n');
                                        var formattedCell = [];

                                        lines.forEach(function (line, lineIdx) {
                                            if (line === '') {
                                                if (lineIdx < lines.length - 1) formattedCell.push({ text: '\n' });
                                                return;
                                            }

                                            var parts = line.split(/(BOLD_START\|.*?\|BOLD_END|LINK_START\|.*?\|.*?\|LINK_END)/g);

                                            parts.forEach(function (part) {
                                                if (!part) return;

                                                if (part.startsWith('LINK_START|')) {
                                                    var match = part.split('|');
                                                    formattedCell.push({
                                                        text: match[2],
                                                        link: match[1],
                                                        color: '#0d6efd',
                                                        decoration: 'underline'
                                                    });
                                                } else if (part.startsWith('BOLD_START|')) {
                                                    var match = part.split('|');
                                                    formattedCell.push({
                                                        text: match[1],
                                                        bold: true,
                                                        color: '#000000'
                                                    });
                                                } else {
                                                    var isDim = hasBold ? true : (lineIdx > 0);
                                                    formattedCell.push({
                                                        text: part,
                                                        color: isDim ? '#666666' : '#000000'
                                                    });
                                                }
                                            });

                                            if (lineIdx < lines.length - 1) {
                                                formattedCell.push({ text: '\n' });
                                            }
                                        });

                                        cell.text = formattedCell;
                                    }
                                });
                            });
                        },
                        action: function (e, dt, node, config) {
                            var buttonContext = this;

                            var triggerPdfExport = function () {
                                pdfMake.fonts = {
                                    NotoSans: {
                                        normal: 'NotoSans-Regular.ttf',
                                        bold: 'NotoSans-Bold.ttf',
                                        italics: 'NotoSans-Italic.ttf',
                                        bolditalics: 'NotoSans-BoldItalic.ttf'
                                    }
                                };

                                var pdfConfig = $.extend(true, {}, $.fn.dataTable.ext.buttons.pdfHtml5, config);
                                $.fn.dataTable.ext.buttons.pdfHtml5.action.call(buttonContext, e, dt, node, pdfConfig);
                            };

                            if (typeof pdfMake === 'undefined') {
                                var originalText = node.text();
                                node.text(t('buttons.loading', 'Loading...'));

                                var loadScript = function (url, callback) {
                                    var script = document.createElement('script');
                                    script.type = 'text/javascript';
                                    script.src = url;
                                    script.onload = callback;
                                    document.head.appendChild(script);
                                };

                                loadScript('/assets/js/pdfmake.min.js', function () {
                                    loadScript('/assets/js/vfs_fonts.js', function () {
                                        node.text(originalText);
                                        triggerPdfExport();
                                    });
                                });
                            } else {
                                triggerPdfExport();
                            }
                        }
                    }
                ]
            },
            {
                text: t('buttons.read', 'Read'),
                className: 'btn btn-link',
                action: function () {
                    window.location.href = "/read.php";
                }
            },
            {
                text: t('buttons.makeList', 'Make List'),
                className: 'btn btn-link',
                action: function () {
                    window.location.href = '/assets/makelist.html';
                }
            },
            {
                text: t('buttons.listDiff', 'List Diff'),
                className: 'btn btn-link',
                action: function () {
                    window.location.href = '/assets/listdiff.html';
                }
            },
            {
                text: t('buttons.suttaDiff', 'Sutta Diff'),
                className: 'btn btn-link',
                action: function () {
                    window.location.href = '/assets/diff';
                }
            },
            {
                extend: 'colvis',
                className: 'btn btn-link',
                text: t('buttons.visibility', 'Visibility')
            }
        ];
    }

    function commonOptions() {
        var desktopDom = '<"row"<"col-sm-12 col-md-4"l><"col-sm-12 col-md-5"p><"col-sm-12 col-md-3"f>>rt<"row"<"col-sm-12 col-md-4"i><"col-sm-12 col-md-8"p>><""Q><"footerlike"B>';
        var mobileDom = '<"row"<"col-sm-6"l><"col-sm-6"f>><"row"<"col-sm-12"p>>rt<"row"<"col-sm-12"i><"col-sm-12"p>><""Q><"footerlike"B>';
        var tableDom = $(window).width() > 768 ? desktopDom : mobileDom;

        return {
            dom: tableDom,
            buttons: buildButtons(),
            // "Search:" -> "Фильтр:" — на этой странице DataTables-фильтр не должен путаться
            // с будущим SPA-поиском (hero-форма в res/index.html, пока скрыта).
            language: {
                search: t('datatables.search', 'Search:'),
                lengthMenu: t('datatables.lengthMenu', '_MENU_ per page'),
                info: t('datatables.info', 'Showing _START_ to _END_ of _TOTAL_ entries'),
                infoEmpty: t('datatables.infoEmpty', 'Showing 0 to 0 of 0 entries'),
                infoFiltered: t('datatables.infoFiltered', '(filtered from _MAX_ total entries)'),
                zeroRecords: t('datatables.zeroRecords', 'No matching records found'),
                // Компактные символы вместо слов — не переводятся (одинаковые для всех языков),
                // экономят место в тулбаре пагинации.
                paginate: {
                    first: '«',
                    previous: '‹',
                    next: '›',
                    last: '»'
                }
            },
            search: {
                caseInsensitive: true,
                diacritics: false,
                smart: true
            },
            paging: true,
            colReorder: true,
            orderMulti: true,
            pageLength: 10,
            lengthMenu: [10, 30, 50, 100, 1000],
            // Responsive's встроенный dtr-title (подпись колонки перед развёрнутым значением,
            // напр. "Ссылки"/"Цитата" у className:'none' колонок) кеширует заголовок при
            // инициализации и иногда отдаёт "undefined" вместо реального текста — сам DataTables
            // column.title при этом уже верный (проверено через settings().aoColumns), это баг
            // именно кеша Responsive, не наших данных. Содержимое колонки (ссылки/цитата) само по
            // себе понятно без подписи — рендерим только данные, без dtr-title вообще.
            responsive: {
                details: {
                    renderer: function (api, rowIdx, columns) {
                        var data = columns.reduce(function (html, col) {
                            return col.hidden ? html + '<li data-dtr-index="' + col.columnIndex + '">' + col.data + '</li>' : html;
                        }, '');
                        return data ? $('<ul data-dtr-index="' + rowIdx + '" class="dtr-details"/>').append(data) : false;
                    }
                }
            }
        };
    }

    // Тот же выбор ридера (/r/, /read/, /ml/, /rv/, ...), что делает openFdg.js в своём
    // DOMContentLoaded — язык/режим ридера пока идут через легаси-прод-ридер (наш /dn22
    // ещё не покрывает все режимы), поэтому ссылки должны вести именно туда, не на чистый
    // clean-URL /{suttaId} этого репозитория.
    function computeLegacyBaseUrl() {
        var lang = localStorage.siteLanguage;
        var baseUrl;
        if (window.location.href.includes('/ru') || lang === 'ru') {
            baseUrl = window.location.origin + "/r/";
        } else if (window.location.href.includes('/th') || lang === 'th') {
            baseUrl = window.location.origin + "/th/read/";
        } else {
            baseUrl = window.location.origin + "/read/";
        }
        if (localStorage.defaultReader === 'ml') baseUrl = window.location.origin + "/ml/";
        else if (localStorage.defaultReader === 'rv') baseUrl = window.location.origin + "/rv/";
        else if (localStorage.defaultReader === 'd') baseUrl = window.location.origin + "/d/";
        else if (localStorage.defaultReader === 'mem') baseUrl = window.location.origin + "/memorize/";
        else if (localStorage.defaultReader === 'fr') baseUrl = window.location.origin + "/frev/";
        return baseUrl;
    }

    // Ссылка на сутту/сегмент — ведёт на чистый /{suttaId} route этого репозитория (ридер уже
    // умеет: подсветку по s=, переход к сегменту по :segment/#segment, язык по lang=). Два
    // случая, где всё ещё нужен легаси-путь через window.findFdgTextUrl/computeLegacyBaseUrl:
    // (1) slug вообще не про ридер (bv/ja/mil/vb* и т.п., exceptions внутри findFdgTextUrl —
    // ведут на /4nt/?q=...), (2) режим чтения, которого MODE_CONFIGS ридера ещё не покрывает
    // (rv/d/mem/fr, Thai) — ридер не трогаем, поэтому для них оставляем как было.
    function buildSuttaUrl(suttaId, segmentId, highlightWord) {
        // For a merged range file (e.g. sutta_id "an1.21-30"), megareader.js keeps the FULL
        // segment id ("an1.21:3.1") as the DOM anchor instead of stripping it to the local part
        // ("3.1") — see the `anchor = segment` branch in its render loop, same condition here.
        // Bare "3.1" would collide across the sub-suttas merged into that one file, so
        // stripping it here (like the non-range case does) produced a URL whose segment never
        // matches any element id, silently breaking scroll+active-word for every range file.
        var isRangeSlug = suttaId.includes('-') && (suttaId.includes('an') || suttaId.includes('sn') || suttaId.includes('dhp'));
        var segmentHash = segmentId
            ? (isRangeSlug ? segmentId : (segmentId.includes(':') ? segmentId.split(':')[1] : segmentId))
            : null;
        var slugForLegacy = segmentHash ? (suttaId + '#' + segmentHash) : suttaId;

        if (typeof window.findFdgTextUrl === 'function') {
            var legacyResult = window.findFdgTextUrl(slugForLegacy, highlightWord || '', computeLegacyBaseUrl());
            if (legacyResult.indexOf('/4nt/?q=') === 0) return legacyResult;

            var unsupportedMode = ['rv', 'd', 'mem', 'fr'].indexOf(localStorage.defaultReader) !== -1;
            var isThai = window.location.href.includes('/th') || localStorage.siteLanguage === 'th';
            if (unsupportedMode || isThai) return legacyResult;
        }

        var lang = (localStorage.dhammaLanguage || localStorage.siteLanguage || 'ru') === 'ru' ? 'ru' : 'en';
        var url = '/' + suttaId + (segmentHash ? ':' + segmentHash : '');
        var params = [];
        if (highlightWord) params.push('s=' + encodeURIComponent(highlightWord));
        params.push('lang=' + lang);
        return url + '?' + params.join('&');
    }

    function highlightText(text, highlightWord) {
        if (!highlightWord || !text) return text;
        var regexHighlight = new RegExp(highlightWord, 'gi');
        return text.replace(regexHighlight, function (match) { return '<b class="match finder">' + match + '</b>'; });
    }

    // Отчёт с группировкой по суттам (текущий, основной вид). container — стабильный
    // <table id="pali">, инициализируется ОДИН раз; повторные вызовы (переключение отчётов,
    // догрузка цитат, новый поиск через hero-форму) просто обновляют данные на месте —
    // .draw(false) сохраняет текущую страницу/сортировку/фильтр автоматически, без ручной
    // консервации state.
    function suttaTableHeaderTitles() {
        return [
            t('table.suttaCol', 'Sutta'), t('table.titleCol', 'Title'), t('table.wordsCol', 'Words'),
            t('table.countCol', 'Ct'), t('table.mrCol', 'Mr'), t('table.linksCol', 'Links'),
            t('table.typeCol', 'Type'), t('table.quoteCol', 'Quote')
        ];
    }

    // TODO.md поиск/старый баг 2: DataTables bakes language.search / language.lengthMenu into
    // static DOM at construction time (unlike info/paginate/zeroRecords, which it re-reads from
    // oLanguage on every draw()) — the .clear().rows.add().draw(false) fast path above can't
    // pick up a live UI-language change. destroy() + reinit is the one clean way to also refresh
    // those. This is NOT the same hazard as the old per-enrich-chunk full-rebuild bug (see file
    // header comment) — that corrupted DataTables' internal registry from doing this on EVERY
    // chunk response, many times per search; a language switch is a rare, deliberate one-off
    // action, and .destroy() (unlike silently re-calling .DataTable() on a live table) is the
    // officially documented safe teardown DataTables itself expects before reinitialising.
    function resetTablesForLanguageChange() {
        if (suttaTableApi) { suttaTableApi.destroy(); suttaTableApi = null; }
        if (wordTableApi) { wordTableApi.destroy(); wordTableApi = null; }
    }

    function buildDataTable(container, dataArray, highlightWord) {
        activeState.highlightWord = highlightWord;

        if (suttaTableApi) {
            suttaTableApi.clear();
            suttaTableApi.rows.add(dataArray);
            applyHeaderTitles(suttaTableApi, suttaTableHeaderTitles());
            suttaTableApi.draw(false);
            bindExpandCollapseButtons($(container));
            return suttaTableApi;
        }

        var $table = $(container);
        var headerTitles = suttaTableHeaderTitles();

        var options = $.extend({}, commonOptions(), {
            data: dataArray,
            searchBuilder: {
                preDefined: {
                    criteria: [
                        { condition: '!contains', data: 'Quote', value: ['ExcludeMe'] }
                    ],
                    logic: 'AND'
                }
            },
            columns: [
                // 0: Sutta
                {
                    data: 'sutta_id',
                    title: headerTitles[0],
                    render: function (data, type, row) {
                        // Link to the first MATCHED segment, not the start of the text — segments[0]
                        // is already the earliest match (assembleFromGrepMap in dg-light.js pushes
                        // them in ascending grep line order), present from the fast=1 response, no
                        // need to wait for /search/enrich.
                        var firstSegment = row && row.segments && row.segments.length ? row.segments[0].segment : null;
                        var textUrl = buildSuttaUrl(data, firstSegment, activeState.highlightWord);
                        return '<a class="fdgLink mainLink" target="_blank" href="' + textUrl + '" data-slug="' + data + '">' + data + '</a>';
                    }
                },
                // 1: Title
                {
                    title: headerTitles[1],
                    data: 'titles',
                    render: function (data, type, row) {
                        if (!data) return '';

                        // titles.root already arrives with fast=1 (skeletonDB has it up front —
                        // see dblight.js) — only the TRANSLATED title is enrichment-only. While
                        // it's missing, show a placeholder bar instead of a blank gap, so it's
                        // visually obvious more is coming rather than looking like there's simply
                        // no translation.
                        var titlePali = data.root || row.sutta_id;
                        var titleText = '';
                        var langClass = 'eng-lang';

                        var transKeys = Object.keys(data).filter(function (k) { return k !== 'root'; });

                        var secondLangKey = transKeys.find(function (k) { return k.startsWith(window.siteLanguage + '_'); });
                        var enKey = transKeys.find(function (k) { return k.startsWith('en_'); });

                        if (window.siteLanguage !== 'en' && secondLangKey) {
                            titleText = data[secondLangKey];
                            langClass = window.siteLanguage + '-lang';
                        } else if (enKey) {
                            titleText = data[enKey];
                            langClass = 'eng-lang';
                        } else if (transKeys.length > 0) {
                            var fallbackKey = transKeys[0];
                            titleText = data[fallbackKey];
                            langClass = fallbackKey.split('_')[0] + '-lang';
                        }

                        var titleHtml = titleText
                            ? '<span class="' + langClass + ' text-muted">' + titleText + '</span>'
                            : (row.__enriched === false ? '<span class="dg-skeleton-bar" aria-hidden="true"></span>' : '');

                        return '<strong class="pli-lang inputscript-ISOPali">' + titlePali + '</strong> ' + titleHtml;
                    }
                },
                // 2: Words
                {
                    title: headerTitles[2],
                    data: 'unique_words',
                    render: function (data, type, row) {
                        if (data && data.length) {
                            var wordsStr = data.join(' ');
                            return '<span class="pli-lang inputscript-ISOPali">' + highlightText(wordsStr, activeState.highlightWord) + '</span>';
                        }
                        // Not enriched yet — the real unique_words are, at most, the searched
                        // word plus declension endings/prefixes (Pali is agglutinative), so the
                        // search term itself is a reasonable stand-in instead of a blank cell.
                        // Styled with the same "match finder" class the real highlightText()
                        // output uses (not text-muted) — coloring it only after the real data
                        // lands was a visible re-color flicker on every row for no reason.
                        if (row.__enriched === false && activeState.highlightWord) {
                            return '<span class="pli-lang inputscript-ISOPali"><b class="match finder">' + activeState.highlightWord + '</b></span>';
                        }
                        return '';
                    }
                },
                // 3: Ct
                { title: headerTitles[3], data: 'count' },
                // 4: Mr
                { title: headerTitles[4], data: 'mr' },
                // 5: Links
                {
                    title: headerTitles[5],
                    data: 'sutta_id',
                    orderable: false,
                    render: function (data) {
                        // openRu/findRuTextUrl (openRu.js) всегда резолвят русские ссылки (theravada.ru
                        // и т.п.) независимо от того, что подставлено в подпись — показываем "Ru" только
                        // когда интерфейс реально русский, иначе ссылка не имеет смысла для читателя.
                        var ruLinkHtml = window.siteLanguage === 'ru'
                            ? '<a class=\'ruLink\' href=\'javascript:void(0)\' data-slug=\'' + data + '\' onclick="if(typeof openRu === \'function\') openRu(\'' + data + '\'); return false;">Ru</a>'
                            : '';
                        return '<a class=\'dprLink\' href=\'javascript:void(0)\' data-slug=\'' + data + '\' onclick="if(typeof openDpr === \'function\') openDpr(\'' + data + '\'); return false;">Pi</a> ' +
                            '<a class=\'bwLink\' href=\'javascript:void(0)\' data-slug=\'' + data + '\' onclick="if(typeof openBw === \'function\') openBw(\'' + data + '\'); return false;">En</a> ' +
                            ruLinkHtml;
                    }
                },
                // 6: Type
                { title: headerTitles[6], data: 'category' },
                // 7: Quote
                {
                    title: headerTitles[7],
                    data: 'segments',
                    className: 'none',
                    render: function (data, type, row) {
                        // TODO.md поиск п.5: phase-1 (?fast=1) rows have placeholder segments —
                        // quotes/context arrive via a follow-up /search/enrich call, at which
                        // point res/index.html re-renders with row.__enriched set to true.
                        if (row.__enriched === false) {
                            return '<span class="text-muted small">' + t('buttons.loading', 'Loading...') + '</span>';
                        }
                        if (!data || data.length === 0) return '';
                        var quoteHtml = '';
                        var highlightWord = activeState.highlightWord;

                        var renderSegment = function (seg, isContext) {
                            var html = '';
                            var paliText = seg.root_text || '';
                            var variantText = seg.variant || '';

                            if (!isContext) {
                                paliText = highlightText(paliText, highlightWord);
                                variantText = highlightText(variantText, highlightWord);
                            }

                            var urlwithanchor = row.sutta_id + (seg.segment.includes(':') ? ':' + seg.segment.split(':')[1] : '');
                            var textUrl = buildSuttaUrl(row.sutta_id, seg.segment, highlightWord);

                            var unhiddenlink = '<a target="_blank" class="fdgLink quoteLink-start text-reset text-decoration-none" href="' + textUrl + '" data-slug="' + urlwithanchor + '"></a>';
                            var hiddenlink = '<a target="_blank" class="fdgLink quoteLink text-white text-decoration-none" href="' + textUrl + '" data-slug="' + urlwithanchor + '"></a>';

                            if (paliText) {
                                var contextClass = isContext ? "opacity-90" : "";
                                html += '<span class="pli-lang quote ' + contextClass + '" lang="pi">' + unhiddenlink + ' ' + paliText + ' ' + hiddenlink + '</span><br class="styled pli-lang quote" lang="pi">';
                            }

                            if (variantText) {
                                var contextClass2 = isContext ? "opacity-90" : "";
                                html += '<span class="pli-lang variant quote ' + contextClass2 + '" lang="pi">' + unhiddenlink + ' ' + variantText + ' ' + hiddenlink + '</span><br class="styled pli-lang variant quote" lang="pi">';
                            }

                            if (seg.translations) {
                                var transKeys = Object.keys(seg.translations);
                                // Английский интерфейс — только английский перевод (раньше здесь ещё и
                                // молча показывался русский, ru читателю в en-режиме не нужен). Русский
                                // интерфейс — русский первым, английский вторым. Раньше preferredLanguages
                                // = [siteLanguage, 'en'] превращался в ['en','en'] в en-режиме — один и тот
                                // же ключ добавлялся дважды без дедупликации, отсюда задвоенный перевод.
                                var orderedLangs = window.siteLanguage === 'en' ? ['en'] : [window.siteLanguage, 'en'];
                                var sortedTransKeys = [];

                                orderedLangs.forEach(function (lang) {
                                    // TODO.md поиск, баг 3: keep the priority translator (e.g. "o")
                                    // closest to the Pali text even when a matched non-priority
                                    // translator is ALSO shown — sort by translator-priority.json
                                    // rank instead of raw seg.translations insertion order.
                                    transKeys.filter(function (k) { return k.startsWith(lang + '_'); })
                                        .sort(function (a, b) { return translatorRank(lang, a) - translatorRank(lang, b); })
                                        .forEach(function (k) {
                                            if (sortedTransKeys.indexOf(k) === -1) sortedTransKeys.push(k);
                                        });
                                });

                                sortedTransKeys.forEach(function (key) {
                                    var transText = seg.translations[key];
                                    if (!transText) return;
                                    if (!isContext) transText = highlightText(transText, highlightWord);
                                    var langCode = key.split('_')[0];
                                    // langswitch.css задаёт display:block только для span.pli-lang/span.eng-lang —
                                    // трёхбуквенное сокращение (eng/rus), не ISO-код. Без этого же сокращения для
                                    // ru класс ru-lang не попадает ни под одно правило, остаётся inline по
                                    // умолчанию — из-за этого русская и английская цитаты визуально слипались.
                                    var langClassName = (langCode === 'en') ? 'eng-lang' : (langCode === 'ru') ? 'rus-lang' : langCode + '-lang';
                                    var htmlclass = langClassName + " text-muted font-weight-light";
                                    if (isContext) htmlclass += " opacity-75";

                                    html += '<span class="' + htmlclass + ' quote" lang="' + langCode + '">' + unhiddenlink + ' ' + transText + ' ' + hiddenlink + '</span><br class="styled ' + htmlclass + ' quote" lang="' + langCode + '">';
                                });
                            }
                            return html + (isContext ? '' : '<br>');
                        };

                        data.forEach(function (seg) {
                            if (seg.lb_context && seg.lb_context.length > 0) {
                                seg.lb_context.forEach(function (ctxSeg) {
                                    quoteHtml += renderSegment(ctxSeg, true);
                                });
                            }

                            quoteHtml += renderSegment(seg, false);

                            if (seg.la_context && seg.la_context.length > 0) {
                                seg.la_context.forEach(function (ctxSeg) {
                                    quoteHtml += renderSegment(ctxSeg, true);
                                });
                            }
                        });

                        return quoteHtml;
                    }
                }
            ],
            columnDefs: [
                { type: 'natural', targets: 0, className: 'text-nowrap' },
                { targets: 1, width: '40%' },
                { targets: 2, width: '30%' },
                { targets: [3, 4, 5, 6], className: 'text-nowrap' },
                { type: 'category', targets: 6, visible: false },
                { type: "html", targets: [0, 1, 2, 7] },
                { targets: [3], orderData: [3, 4], orderSequence: ['desc', 'asc'] },
                { targets: [4], orderData: [4, 3], orderSequence: ['desc', 'asc'] }
            ],
            // category first (dhamma = the 4 nikayas), then id — server already sorts this way
            // (sortSuttaResults in dg-light.js), DataTables re-applies its own `order` on init
            // regardless of JSON key order, so it's repeated here as the single source of truth
            // for the default sort (see the file-level comment re: TODO.md поиск п.5's sort bug).
            order: [[6, 'asc'], [0, 'asc']]
        });

        suttaTableApi = $table.DataTable(options);
        bindExpandCollapseButtons($table);
        return suttaTableApi;
    }

    // Отчёт с группировкой по словам: Word | Texts | Matches | Links
    // Данные приходят из того же ответа /search (json.wordReport) — без повторного запроса.
    // container — свой стабильный <table>, отдельный от по-суттного (см. файловый комментарий
    // наверху — раньше обе таблицы делили один <table id="pali">, пересоздаваемый на каждое
    // переключение, что и создавало основной риск порчи state).
    function wordTableHeaderTitles() {
        return [
            t('table.wordCol', 'Word'), t('table.textsCol', 'Texts'),
            t('table.matchesCol', 'Matches'), t('table.linksCol', 'Links')
        ];
    }

    function buildWordDataTable(container, wordReport, highlightWord, scope) {
        activeState.highlightWord = highlightWord;
        activeState.scope = scope;
        var data = wordReport || [];

        if (wordTableApi) {
            wordTableApi.clear();
            wordTableApi.rows.add(data);
            applyHeaderTitles(wordTableApi, wordTableHeaderTitles());
            wordTableApi.draw(false);
            bindExpandCollapseButtons($(container));
            return wordTableApi;
        }

        var $table = $(container);
        var headerTitles = wordTableHeaderTitles();

        var options = $.extend({}, commonOptions(), {
            data: data,
            columns: [
                // 0: Word — подсвечиваем искомое слово внутри (как в колонке Words по-суттного
                // отчёта), а не просто выводим голый текст.
                {
                    title: headerTitles[0],
                    data: 'word',
                    className: 'pli-lang inputscript-ISOPali',
                    render: function (data) {
                        return highlightText(data, activeState.highlightWord);
                    }
                },
                // 1: Texts — кликабельно: перезапускает поиск именно по этому слову
                // (как counttexts в легаси new/words.sh)
                {
                    title: headerTitles[1],
                    data: 'textCount',
                    render: function (data, type, row) {
                        if (type !== 'display') return data;
                        var url = '/?q=' + encodeURIComponent(row.word) + (activeState.scope ? '&scope=' + encodeURIComponent(activeState.scope) : '');
                        return '<a href="' + url + '">' + data + '</a>';
                    }
                },
                // 2: Matches
                { title: headerTitles[2], data: 'matchCount' },
                // 3: Links — под responsive-обёрткой (className:'none'), как Quote в по-суттном
                // отчёте: у частых слов список ссылок длинный, не должен растягивать таблицу.
                {
                    title: headerTitles[3],
                    data: 'links',
                    orderable: false,
                    className: 'none',
                    render: function (links) {
                        if (!links || !links.length) return '';
                        return links.map(function (l) {
                            var url = buildSuttaUrl(l.sutta_id, l.segment, activeState.highlightWord);
                            return '<a class="fdgLink quote" target="_blank" href="' + url + '" data-slug="' + l.sutta_id + '">' + l.sutta_id + '</a>';
                        }).join(' ');
                    }
                }
            ],
            columnDefs: [
                { type: 'natural', targets: 0 },
                { targets: [1, 2], className: 'text-nowrap' },
                { type: 'html', targets: [0, 1, 3] }
            ],
            order: [[1, 'desc'], [0, 'asc']]
        });

        wordTableApi = $table.DataTable(options);
        bindExpandCollapseButtons($table);
        return wordTableApi;
    }

    // "Variants for {keyword}" — секция под отчётом по словам (легаси new/words.sh). Текст
    // каждого сегмента (со стрелкой "→"/"(mr)"/"(?)") — редакторская нотация SuttaCentral,
    // УЖЕ буквально хранящаяся в самом variant-файле (не наш diff, см. комментарий у
    // findVariantSegments в dg-light.js) — просто подсвечиваем искомое слово и даём ссылку на
    // сутту тем же способом (.fdgLink/data-slug), что и колонка Quote основной таблицы —
    // openFdg.js сам донастраивает href на клиенте.
    function buildVariantsReport(container, variantSegments, keyword) {
        var $container = $(container);
        if (!variantSegments || !variantSegments.length) {
            $container.addClass('d-none');
            return;
        }
        var capitalizedKeyword = keyword ? keyword.charAt(0).toUpperCase() + keyword.slice(1) : '';
        var listHtml = variantSegments.map(function (seg) {
            var url = buildSuttaUrl(seg.sutta_id, seg.segment, keyword);
            var urlwithanchor = seg.sutta_id + (seg.segment.indexOf(':') !== -1 ? ':' + seg.segment.split(':')[1] : '');
            var text = highlightText(seg.text, keyword);
            return '<strong><a class="fdgLink quote" target="_blank" href="' + url + '" data-slug="' + urlwithanchor + '">' + seg.sutta_id + '</a></strong> ' + text + '<br>';
        }).join('\n');

        $container.removeClass('d-none');
        $container.find('.variants-report-keyword').text(capitalizedKeyword);
        $container.find('.variants-report-list').html(listHtml);
    }

    return {
        buildDataTable: buildDataTable,
        buildWordDataTable: buildWordDataTable,
        buildVariantsReport: buildVariantsReport,
        resetTablesForLanguageChange: resetTablesForLanguageChange
    };
})();
