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
    // + configs/search/lang_{ru,en}.json) — этот файл не завязан на конкретную HTML-страницу, поэтому читает
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
    // langsFromUrl — пришли ли языки из ?langs= в адресе (тогда они распространяются и на ссылки
    // в ридер), или это сохранённая настройка "Языки для поиска" (тогда они только про показ
    // результатов, см. buildSuttaUrl).
    var activeState = { highlightWord: '', scope: '', requestedLangs: [], langsFromUrl: false };

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
        // dt-hasChild/dtr-expanded — реальные классы DataTables 2.x Responsive; .parent — от
        // старой (1.x) версии, никогда не проставляется здесь, поэтому "Свернуть все" раньше
        // молча не находил ни одной строки (tr.parent всегда пусто).
        //
        // #btn-show-all-children — единственная физическая кнопка в разметке (никакого
        // #btn-hide-all-children в HTML нет, второй обработчик ниже был мёртвым кодом). Раньше
        // клик ВСЕГДА разворачивал (":not(.dtr-expanded)") — сработав один раз, все строки уже
        // .dtr-expanded, и повторный клик/Shift+Space (langswitch.js — тот же .click() по этому
        // же id) просто не находил, что разворачивать, и выглядел одноразовым.
        //
        // Замкнутый по closure $table (аргумент этой функции) оказался НЕНАДЁЖНЫМ источником:
        // после первого клика он расходится с тем, что реально видно на экране (проверено
        // напрямую — $table.find(...) возвращал не то же самое, что видно в живом DOM) — то ли
        // DataTables Responsive где-то внутри пересобирает узлы без замены самой переменной, то
        // ли одна из веток build*/enrich путей передаёт сюда более раннюю ссылку. Вместо
        // выяснения, которая из веток виновата — не полагаемся на closure вообще, каждый клик
        // заново берёт ЖИВУЮ, реально видимую таблицу (#pali или #pali-words, ровно одна видна
        // за раз — см. renderCurrentReport в search/index.html, d-none переключается на обе сразу).
        //
        // ВТОРОЙ, отдельный баг в том же месте: "tr:not(.dtr-expanded)" матчит не только
        // ЕЩЁ НЕ развёрнутые родительские строки, но и САМИ child-строки (<tr class="child">) —
        // у них класса dtr-expanded в принципе не бывает, так что они ВСЕГДА проходили под
        // ":not", и набор получался непустым, даже когда все родительские строки уже
        // развёрнуты — это и было истинной причиной "работает только один раз": код решал, что
        // есть что разворачивать, даже когда разворачивать было нечего, и просто кликал по
        // бесполезным child-ячейкам.
        //
        // Скоуп нужен именно по "есть ли у строки control-ячейка" (td.dtr-control — она
        // проставляется Responsive сразу при отрисовке для ЛЮБОЙ потенциально разворачиваемой
        // строки), а НЕ по dt-hasChild — этот класс DataTables добавляет только ПОСЛЕ первого
        // реального клика по строке (лениво), так что до самого первого взаимодействия за всю
        // сессию ни одна строка его не имеет вообще — фильтр по dt-hasChild на нетронутой
        // странице находил бы 0 разворачиваемых строк и молчал бы уже на первом клике.
        function visibleTable() {
            var $pali = $('#pali');
            return ($pali.length && !$pali.hasClass('d-none')) ? $pali : $('#pali-words');
        }
        $('#btn-show-all-children').off('click').on('click', function () {
            var $expandable = visibleTable().find('tbody tr').has('td.dtr-control');
            var $collapsed = $expandable.not('.dtr-expanded');
            if ($collapsed.length) {
                $collapsed.find('td:first-child').trigger('click');
            } else {
                $expandable.filter('.dtr-expanded').find('td:first-child').trigger('click');
            }
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
            // с будущим SPA-поиском (hero-форма в search/index.html, пока скрыта).
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
            // Owner: only show pagination controls (first/prev/next/last) when there's actually
            // more than one page — a single-page result set (the common case, e.g. 4 texts) has
            // nothing for them to do, just visual noise. The "Showing X to Y of Z" info text
            // stays either way, that's not what was asked to hide. The "N per page" length
            // selector (.dt-length) is the same story — a page-size picker makes no sense when
            // there's no pagination to affect, so it hides alongside .dt-paging.
            drawCallback: function () {
                // DataTables 2.x class naming (.dt-paging, not the old 1.x .dataTables_paginate).
                var pages = this.api().page.info().pages;
                var container = $(this.api().table().container());
                container.find('.dt-paging').toggle(pages > 1);
                container.find('.dt-length').toggle(pages > 1);
            },
            // Responsive's own dtr-title caches the column heading at init time and sometimes
            // hands back "undefined" instead of the real text — DataTables' own column.title is
            // correct at that moment (verified via settings().aoColumns), so this is a Responsive
            // cache bug, not bad data. The previous fix dropped every label, which threw out the
            // useful ones with it: only the quote column is self-explanatory, "Ссылки"/"Mr" and
            // the rest need their heading. Labels are therefore read from DataTables directly,
            // and skipped only for columns marked data-dtr-notitle in the markup.
            responsive: {
                details: {
                    renderer: function (api, rowIdx, columns) {
                        var data = columns.reduce(function (html, col) {
                            if (!col.hidden) return html;
                            var th = api.column(col.columnIndex).header();
                            var title = '';
                            if (!th || !th.hasAttribute('data-dtr-notitle')) {
                                // aoColumns[].sTitle, not api.column().title(): the public title()
                                // getter returns undefined in this DataTables build (checked live),
                                // and Responsive's own col.title is the stale cache this renderer
                                // exists to bypass. The <th> text is the last-resort fallback.
                                var settings = api.settings()[0];
                                var column = settings && settings.aoColumns && settings.aoColumns[col.columnIndex];
                                var text = (column && column.sTitle) || (th && th.textContent.trim()) || '';
                                if (text && text !== 'undefined') {
                                    title = '<span class="dtr-title">' + text + '</span> ';
                                }
                            }
                            return html + '<li data-dtr-index="' + col.columnIndex + '">' +
                                title + '<span class="dtr-data">' + col.data + '</span></li>';
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

        var lang = (localStorage.dhammaLanguage || localStorage.siteLanguage || 'en') === 'ru' ? 'ru' : 'en';
        var url = '/' + suttaId + (segmentHash ? ':' + segmentHash : '');
        var params = [];
        if (highlightWord) params.push('s=' + encodeURIComponent(highlightWord));
        params.push('lang=' + lang);
        // langs= (набор/порядок языков ПЕРЕВОДА — не путать с lang=, языком интерфейса выше).
        // Это ссылка В РИДЕР, поэтому языки берутся читательские, а не те, которыми показана
        // выдача. Важно с тех пор, как requestedLangs заполняется и из настройки "Языки для
        // поиска": она про то, как показать РЕЗУЛЬТАТЫ, и тащить её в ридер неправильно —
        // человек может искать по немецкому, а читать по-русски. Явный ?langs= в адресе поиска
        // остаётся сильнее всего: там пользователь задал языки вручную для всего сразу.
        // Дальше: "языки для чтения" → "языки для поиска" (если отдельного значения для чтения
        // нет — включён переключатель "так же, как для чтения") → без параметра, дефолт ридера.
        var readerLangs = (activeState.langsFromUrl && activeState.requestedLangs.length)
            ? activeState.requestedLangs.join(',')
            : (localStorage.getItem('dhammaReaderLangs') || localStorage.getItem('dhammaSearchLangs') || '');
        if (readerLangs) {
            params.push('langs=' + encodeURIComponent(readerLangs));
        }
        return url + '?' + params.join('&');
    }

    function highlightText(text, highlightWord) {
        if (!highlightWord || !text) return text;
        var regexHighlight = new RegExp(highlightWord, 'gi');
        return text.replace(regexHighlight, function (match) { return '<b class="match finder">' + match + '</b>'; });
    }

    function textHasMatch(text, highlightWord) {
        if (!highlightWord || !text) return false;
        return new RegExp(highlightWord, 'i').test(text);
    }

    // Отчёт с группировкой по суттам (текущий, основной вид). container — стабильный
    // <table id="pali">, инициализируется ОДИН раз; повторные вызовы (переключение отчётов,
    // догрузка цитат, новый поиск через hero-форму) просто обновляют данные на месте —
    // .draw(false) сохраняет текущую страницу/сортировку/фильтр автоматически, без ручной
    // консервации state.
    function suttaTableHeaderTitles() {
        return [
            t('table.suttaCol', 'Sutta'), t('table.readCol', '✓'), t('table.titleCol', 'Title'),
            t('table.wordsCol', 'Words'), t('table.countCol', 'Ct'), t('table.mrCol', 'Mr'),
            t('table.linksCol', 'Links'), t('table.typeCol', 'Type'), t('table.quoteCol', 'Quote')
        ];
    }

    /* Отметки "прочитано" — вторая колонка с чекбоксами. Состояние хранится ОТДЕЛЬНО ДЛЯ КАЖДОГО
       ПОИСКА (ключ = запрос + область), а не одним общим списком: одна и та же сутта может быть
       разобрана в одном поиске и не тронута в другом, а колонка нужна именно чтобы отслеживать
       проход по конкретной выдаче. Колонка по умолчанию скрыта и включается кнопкой на панели;
       если по этому поиску отметки уже есть, она показывается сама. */
    var READ_MARKS_PREFIX = 'dgReadMarks:';

    function readMarksKey() {
        var params = new URLSearchParams(window.location.search);
        var q = (activeState && activeState.query) || params.get('q') || '';
        var scope = params.get('scope') || 'default';
        return READ_MARKS_PREFIX + q.toLowerCase() + '|' + scope;
    }

    function loadReadMarks() {
        try {
            var raw = localStorage.getItem(readMarksKey());
            var arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    }

    function isRead(suttaId) { return loadReadMarks().indexOf(suttaId) !== -1; }

    function setRead(suttaId, on) {
        var marks = loadReadMarks();
        var i = marks.indexOf(suttaId);
        if (on && i === -1) marks.push(suttaId);
        else if (!on && i !== -1) marks.splice(i, 1);
        var key = readMarksKey();
        if (marks.length) localStorage.setItem(key, JSON.stringify(marks));
        else localStorage.removeItem(key);
    }

    window.DgReadMarks = { has: function () { return loadReadMarks().length > 0; } };

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

    function buildDataTable(container, dataArray, highlightWord, requestedLangs, langsFromUrl) {
        activeState.highlightWord = highlightWord;
        activeState.langsFromUrl = !!langsFromUrl;
        // ?langs= — явный список языков, которые пользователь ПОПРОСИЛ увидеть (не только
        // ru/en-дефолт). Раз он попросил конкретный язык через langs=, показывать его
        // безусловно, а не только "если совпадение реально есть в нём" (см. alwaysShown ниже) —
        // иначе langs=de почти всегда выглядит как "немецкого нет", хотя перевод есть, просто
        // ключевое слово (обычно пали-термин) не встречается буквально в немецком тексте.
        activeState.requestedLangs = requestedLangs ? requestedLangs.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];

        if (suttaTableApi) {
            // Разворачивание ещё не догруженной (/search/enrich) строки, а потом её сворачивание
            // само по себе, как только цитата подъедет — известная особенность DataTables
            // Responsive: .clear()+.rows.add() каждый раз пересоздаёт DOM child-строк, а
            // раскрытое/свёрнутое состояние живёт именно на этих узлах, не на данных. Запоминаем
            // раскрытые sutta_id ДО пересборки (по данным, не по индексу строки — состав/порядок
            // строк между отрисовками может меняться) и раскрываем те же самые после.
            var expandedIds = {};
            suttaTableApi.rows('tr.dtr-expanded').every(function () {
                var d = this.data();
                if (d && d.sutta_id) expandedIds[d.sutta_id] = true;
            });

            suttaTableApi.clear();
            suttaTableApi.rows.add(dataArray);
            applyHeaderTitles(suttaTableApi, suttaTableHeaderTitles());
            suttaTableApi.draw(false);
            bindExpandCollapseButtons($(container));

            if (Object.keys(expandedIds).length) {
                suttaTableApi.rows().every(function () {
                    var d = this.data();
                    if (d && expandedIds[d.sutta_id]) {
                        $(this.node()).find('td.dtr-control, td:first-child').trigger('click');
                    }
                });
            }
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
                // 1: отметка "прочитано" (см. readMarksKey/setRead выше). Колонка скрыта по
                // умолчанию — включается кнопкой на панели инструментов.
                {
                    title: headerTitles[1],
                    data: 'sutta_id',
                    orderable: false,
                    searchable: false,
                    className: 'dg-read-cell text-center',
                    visible: false,
                    render: function (data) {
                        return '<input type="checkbox" class="dg-read-mark" data-sutta="' + data + '"' +
                            (isRead(data) ? ' checked' : '') + ' aria-label="' + t('table.readColAria', 'Read') + '">';
                    }
                },
                // 2: Title
                {
                    title: headerTitles[2],
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
                        var langClass = 'en-lang';

                        var transKeys = Object.keys(data).filter(function (k) { return k !== 'root'; });

                        // Which language shows as the title's second line: follows the actual
                        // configured search-language ORDER (activeState.requestedLangs — same
                        // list/priority the quote columns already use, see buildDataTable),
                        // not window.siteLanguage. Was tied to the UI language regardless of
                        // what languages the search itself was set to (owner: set search langs
                        // to de/ru/en, title still picked by interface language, unrelated to
                        // that list or to the separate "reading languages" setting). Only
                        // applies when the user has actually configured/requested a language
                        // list — falls through to the old UI-language heuristic otherwise, to
                        // keep default (untouched-settings) behavior unchanged.
                        var priorityLangKey = activeState.requestedLangs.length
                            ? activeState.requestedLangs.map(function (l) {
                                return transKeys.find(function (k) { return k.startsWith(l + '_'); });
                            }).find(Boolean)
                            : null;
                        var secondLangKey = priorityLangKey || transKeys.find(function (k) { return k.startsWith(window.siteLanguage + '_'); });
                        var enKey = transKeys.find(function (k) { return k.startsWith('en_'); });

                        if (priorityLangKey) {
                            titleText = data[priorityLangKey];
                            langClass = priorityLangKey.split('_')[0] + '-lang';
                        } else if (window.siteLanguage !== 'en' && secondLangKey) {
                            titleText = data[secondLangKey];
                            langClass = window.siteLanguage + '-lang';
                        } else if (enKey) {
                            titleText = data[enKey];
                            langClass = 'en-lang';
                        } else if (transKeys.length > 0) {
                            var fallbackKey = transKeys[0];
                            titleText = data[fallbackKey];
                            langClass = fallbackKey.split('_')[0] + '-lang';
                        }

                        // "dg-title-lang" wires the title into the existing Pāḷi/Eng toggle
                        // (#language-button → langswitch.js → #sutta.hide-pali/.hide-english,
                        // see public/overrides/css/langswitch.css). No visible text tag — the
                        // toggle itself is the indicator. Only mark the Pali side hideable when a
                        // translation actually exists: on a sutta with no translation at all,
                        // toggling to "English only" must not blank out its only title text.
                        var paliClass = 'pli-lang inputscript-ISOPali';
                        var titleHtml;
                        if (titleText) {
                            paliClass += ' dg-title-lang';
                            titleHtml = '<span class="' + langClass + ' dg-title-lang text-muted">' + titleText + '</span>';
                        } else if (row.__enriched === false) {
                            titleHtml = '<span class="dg-skeleton-bar" aria-hidden="true"></span>';
                        } else {
                            titleHtml = '';
                        }

                        return '<strong class="' + paliClass + '">' + titlePali + '</strong> ' + titleHtml;
                    }
                },
                // 3: Words
                {
                    title: headerTitles[3],
                    data: 'unique_words',
                    render: function (data, type, row) {
                        if (data && data.length) {
                            var wordsStr = data.join(' ');
                            return '<span class="pli-lang inputscript-ISOPali text-muted">' + highlightText(wordsStr, activeState.highlightWord) + '</span>';
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
                // 4: Ct
                { title: headerTitles[4], data: 'count' },
                // 5: Mr
                { title: headerTitles[5], data: 'mr' },
                // 6: Links
                {
                    title: headerTitles[6],
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
                // 7: Type
                { title: headerTitles[7], data: 'category' },
                // 8: Quote
                {
                    title: headerTitles[8],
                    data: 'segments',
                    className: 'none',
                    render: function (data, type, row) {
                        // TODO.md поиск п.5: phase-1 (?fast=1) rows have placeholder segments —
                        // quotes/context arrive via a follow-up /search/enrich call, at which
                        // point search/index.html re-renders with row.__enriched set to true.
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

                            // Same regex as megareader.js's window.applyRemovePunct — search
                            // results didn't apply it at all before (owner: quick.hidePunct
                            // should also work here, not just in the reader).
                            if (localStorage.getItem('removePunct') === 'true') {
                                var stripPunct = function (s) {
                                    return s ? s.replace(/[-—–]/g, ' ').replace(/[:;“”‘’,"']/g, '').replace(/[.?!]/g, ' | ') : s;
                                };
                                paliText = stripPunct(paliText);
                                variantText = stripPunct(variantText);
                            }

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
                                // Collected separately and wrapped in .right-column below (not
                                // appended straight into `html`) — matches megareader.js's own
                                // segment markup (<span class="right-column">...</span> around
                                // all translations), which is what the shared column-mode CSS
                                // (reader/css/uiextra.css: .column-view .right-column) keys off.
                                var transHtml = '';
                                var transKeys = Object.keys(seg.translations);
                                // Язык интерфейса и язык поиска НЕ связаны (TODO.md поиск: "русский
                                // может искать по англ, без проблем, и наоборот") — но это НЕ значит
                                // "показывать перевод на любом языке всегда, раз он есть". Безусловно
                                // (контекст, даже без совпадения — так было исторически всегда, это НЕ
                                // менялось и не обсуждалось) показываются: язык UI, и en как постоянный
                                // второй язык для НЕ-en интерфейса (было `[uiLang, 'en']` до этого
                                // раунда — регрессия: первая правка ошибочно применила фильтр
                                // "по совпадению" и к en тоже, из-за чего en пропадал из ru-интерфейса
                                // без прямого совпадения). ЛЮБОЙ ДРУГОЙ язык (третий — de и т.п., или
                                // ru при en-интерфейсе) — только если совпадение реально есть в нём.
                                //
                                // ИСКЛЮЧЕНИЕ: если пользователь явно передал ?langs= — порядок и состав
                                // безусловно показываемых языков задаётся РОВНО этим списком, в РОВНО
                                // этом порядке (langs=de,ru,en → нем/рус/англ; langs=ru,en,de → рус/англ/нем),
                                // без всякого match-гейтинга — раз он сам их перечислил, это не "third
                                // language", а именно то, что он попросил увидеть.
                                var uiLang = window.siteLanguage || 'en';
                                var alwaysShown = (activeState.requestedLangs && activeState.requestedLangs.length)
                                    ? activeState.requestedLangs.slice()
                                    : (uiLang === 'en' ? ['en'] : [uiLang, 'en']);
                                var otherLangs = [];
                                transKeys.forEach(function (k) {
                                    var l = k.split('_')[0];
                                    if (alwaysShown.indexOf(l) === -1 && otherLangs.indexOf(l) === -1) otherLangs.push(l);
                                });
                                var orderedLangs = alwaysShown.concat(otherLangs);
                                var sortedTransKeys = [];

                                orderedLangs.forEach(function (lang) {
                                    // TODO.md поиск, баг 3: keep the priority translator (e.g. "o")
                                    // closest to the Pali text even when a matched non-priority
                                    // translator is ALSO shown — sort by translator-priority.json
                                    // rank instead of raw seg.translations insertion order.
                                    transKeys.filter(function (k) {
                                        if (!k.startsWith(lang + '_')) return false;
                                        // uiLang/en — всегда. Любой ДРУГОЙ язык — только если совпадение
                                        // реально есть именно в этом переводе, не "раз он есть вообще".
                                        return alwaysShown.indexOf(lang) !== -1 || textHasMatch(seg.translations[k], highlightWord);
                                    })
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
                                    // Единый короткий ISO-класс для любого языка (ru-lang, en-lang, de-lang, ...) —
                                    // тот же паттерн, что уже используется в megareader.js/voice.js, без легаси
                                    // 3-буквенных исключений (eng-lang/rus-lang). langswitch.css теперь тоже общий
                                    // ([class*="-lang"], не allowlist конкретных языков) — см. нюансы в TODO.md.
                                    var langClassName = langCode + '-lang';
                                    var htmlclass = langClassName + " text-muted font-weight-light";
                                    if (isContext) htmlclass += " opacity-75";

                                    transHtml += '<span class="' + htmlclass + ' quote" lang="' + langCode + '">' + unhiddenlink + ' ' + transText + ' ' + hiddenlink + '</span><br class="styled ' + htmlclass + ' quote" lang="' + langCode + '">';
                                });

                                if (transHtml) html += '<span class="right-column">' + transHtml + '</span>';
                            }
                            // Wrap in an id'd span matching the reader's own segment markup
                            // (megareader.js: <span id="segment">...</span>) — voice.js's TTS
                            // engine groups Pali+translation lines into one playlist entry by
                            // walking up to closest([id]); without this wrapper these sibling
                            // <span class="pli-lang quote">/<span class="ru-lang quote"> lines
                            // had no id anywhere, so the engine never paired them and picked
                            // essentially arbitrary text/voice per line — reading mixed content
                            // in one language's voice. urlwithanchor is already sutta_id+segment,
                            // globally unique across all rows on the results page (unlike the
                            // reader's own bare segment id, which only needs to be unique within
                            // one sutta's page).
                            return '<span id="' + urlwithanchor + '">' + html + '</span>' + (isContext ? '' : '<br>');
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
                // Индексы сдвинуты на +1 начиная со второго столбца — между Sutta и Title
                // вставлена колонка отметок "прочитано" (см. columns выше).
                { type: 'natural', targets: 0, className: 'text-nowrap' },
                { targets: 2, width: '40%' },
                { targets: 3, width: '30%' },
                { targets: [4, 5, 6, 7], className: 'text-nowrap' },
                { type: 'category', targets: 7, visible: false },
                { type: "html", targets: [0, 2, 3, 8] },
                { targets: [4], orderData: [4, 5], orderSequence: ['desc', 'asc'] },
                { targets: [5], orderData: [5, 4], orderSequence: ['desc', 'asc'] }
            ],
            // category first (dhamma = the 4 nikayas), then id — server already sorts this way
            // (sortSuttaResults in dg-light.js), DataTables re-applies its own `order` on init
            // regardless of JSON key order, so it's repeated here as the single source of truth
            // for the default sort (see the file-level comment re: TODO.md поиск п.5's sort bug).
            order: [[7, 'asc'], [0, 'asc']]
        });

        suttaTableApi = $table.DataTable(options);
        bindExpandCollapseButtons($table);
        bindReadMarks($table);
        attachFilterPlusButton($table);
        return suttaTableApi;
    }

    /* Filter+ живёт рядом с обычным DataTables-фильтром ("Фильтр:"), а не отдельной строкой в
       #results-toolbar — визуально это одно действие "искать/фильтровать", а не два разных.
       Кнопка — реальная статичная разметка в search/index.html (перед <table id="pali">, скрыта
       там классом d-none), .dt-search же создаётся ЗАНОВО при каждом полном (re)init таблицы
       (destroy() при смене языка — см. resetTablesForLanguageChange), поэтому просто переносим
       существующий узел, а не создаём новый — обработчик клика и aria-pressed на нём переживают
       перенос как есть. Класс контейнера — ".dt-search" (DataTables 2.x), не легаси
       ".dataTables_filter" из документации/старых версий — проверено в живой разметке. */
    function attachFilterPlusButton($table) {
        var btn = document.getElementById('btn-filter-builder');
        var filterWrap = $table.closest('.dt-container').find('.dt-search').get(0);
        if (!btn || !filterWrap) return;
        // Owner: icon was easy to miss tucked away after the input, on the far right — moved to
        // the front of the row (before the "Filter:" label) so it reads as part of the same
        // control, not a stray button at the edge of the toolbar.
        if (filterWrap.firstChild !== btn) {
            filterWrap.insertBefore(btn, filterWrap.firstChild);
            btn.classList.remove('d-none');
        }
    }

    /* Колонка отметок: кнопка на панели показывает/прячет её, чекбоксы пишут состояние по ключу
       текущего поиска. Если по этому поиску отметки уже стоят — колонка открывается сама, иначе
       пользователю пришлось бы каждый раз вспоминать, что он её включал. */
    function bindReadMarks($table) {
        var col = suttaTableApi.column(1);
        var $btn = $('#btn-read-marks');

        function sync(visible) {
            col.visible(visible, false);
            suttaTableApi.columns.adjust();
            $btn.attr('aria-pressed', visible ? 'true' : 'false');
            $btn.toggleClass('active', visible);
        }

        sync(loadReadMarks().length > 0);

        $btn.off('click.dgread').on('click.dgread', function () {
            sync(!col.visible());
        });

        // Делегирование: строки перерисовываются на каждой догрузке цитат, вешать обработчик на
        // сами чекбоксы бессмысленно — их узлы живут только до следующей перерисовки.
        $table.off('change.dgread').on('change.dgread', 'input.dg-read-mark', function () {
            setRead(this.dataset.sutta, this.checked);
        });
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
            // Same "Q" dom slot as the sutta table (commonOptions()) — without this option
            // SearchBuilder never activates for this table instance, so the slot stays empty
            // (owner-reported: button missing on the Words report). No preDefined criteria
            // here — the sutta table's ("Quote" doesn't-contain "ExcludeMe") is specific to a
            // column this table doesn't have.
            searchBuilder: {},
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
        // Same relocated static button as the sutta table (attachFilterPlusButton's own
        // comment explains why it moves one node rather than creating a second) — without this
        // call the button stays wherever the sutta table last put it (or d-none, if the words
        // report is what's showing on first load), and #btn-filter-builder's own click handler
        // (search/index.html) already looks for THIS table's .dtsb-searchBuilder panel, which
        // only exists now that searchBuilder: {} above is set.
        attachFilterPlusButton($table);
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

    // Re-run render() on already-loaded rows without a re-fetch — for settings that only affect
    // display (removePunct) toggled live from quick settings (search/js/home.js).
    function redraw() {
        if (suttaTableApi) suttaTableApi.draw(false);
        if (wordTableApi) wordTableApi.draw(false);
    }

    return {
        buildDataTable: buildDataTable,
        buildWordDataTable: buildWordDataTable,
        buildVariantsReport: buildVariantsReport,
        resetTablesForLanguageChange: resetTablesForLanguageChange,
        redraw: redraw
    };
})();
