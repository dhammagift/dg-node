// Переиспользуемый рендер результатов поиска (по суттам и по словам).
// Не зависит от конкретной HTML-страницы — только от того, что jQuery/DataTables
// уже загружены и передан контейнер (селектор или jQuery-объект существующей <table>).
// Так задумано, чтобы будущий SPA-этап мог подключить этот же файл без переделки.
window.DgSearchRender = (function () {

    // Переключение между отчётами меняет число колонок (8 у по-суттного, 4 у по-словного).
    // DataTables + Buttons/Responsive/ColReorder оставляют в DOM обвес (colgroup, wrapper-div),
    // который переживает .destroy() и путает следующую инициализацию с другим числом колонок
    // ("Cannot read properties of ... 'mData'/'parentNode'"). Поэтому вместо точечной чистки
    // пересоздаём сам <table>-узел с нуля при каждом переключении — надёжно и просто.
    // Классы, которые DataTables/Responsive/Buttons сами добавляют на <table> при инициализации
    // (dataTable, dtr-inline, collapsed, no-footer, ...). Если перенести их на "новую" таблицу
    // до повторного вызова .DataTable(), плагин думает, что уже инициализирован на этом узле,
    // и не навешивает свои обработчики клика заново — раскрывающиеся строки перестают работать.
    var DT_INTERNAL_CLASSES = /\b(dataTable|dtr-inline|dtr-column|collapsed|no-footer|dt-\S+)\b/g;

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

    function resetContainer(container, headers) {
        var $old = $(container);
        var id = $old.attr('id');
        var className = ($old.attr('class') || '').replace(DT_INTERNAL_CLASSES, '').replace(/\s+/g, ' ').trim();

        // tbody (например id="sutta") — на этот КОНКРЕТНЫЙ узел завязан переключатель языка
        // (langswitch.js захватывает document.getElementById("sutta") один раз при загрузке
        // страницы). Если пересоздать tbody заново, эта ссылка станет мёртвой. Поэтому не
        // создаём новый tbody, а переносим (detach+append, не clone) тот же самый узел —
        // его identity в документе сохраняется, только меняется родительский <table>.
        var $oldTbody = $old.find('tbody').first();
        if ($oldTbody.length) $oldTbody.empty();

        var theadHtml = '<thead class="thead-light"><tr>' +
            headers.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
            '</tr></thead>';

        var $fresh = $('<table></table>').html(theadHtml);
        if (id) $fresh.attr('id', id);
        if (className) $fresh.attr('class', className);

        if ($oldTbody.length) {
            $fresh.append($oldTbody);
        } else {
            $fresh.append('<tbody></tbody>');
        }

        // Ищем по id ("{id}_wrapper") — надёжно во всех версиях DataTables;
        // класс обёртки менялся между версиями (dataTables_wrapper → dt-container).
        var $wrapper = id ? $('#' + id + '_wrapper') : $();
        if (!$wrapper.length) $wrapper = $old.closest('.dataTables_wrapper, .dt-container');
        if ($wrapper.length) {
            $wrapper.replaceWith($fresh);
        } else {
            $old.replaceWith($fresh);
        }
        return $fresh;
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
            destroy: true,
            dom: tableDom,
            buttons: buildButtons(),
            // "Search:" -> "Фильтр:" — на этой странице DataTables-фильтр не должен путаться
            // с будущим SPA-поиском (hero-форма в res/index.html, пока скрыта).
            language: {
                search: t('datatables.search', 'Search:'),
                lengthMenu: t('datatables.lengthMenu', '_MENU_ entries per page'),
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
            lengthMenu: [10, 30, 50, 100, 1000]
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

    // Ссылка на сутту/сегмент. Предпочитаем window.findFdgTextUrl (уже определена в
    // openFdg.js, загружаемом на этой странице) — та же функция, что использует остальной
    // сайт, с тем же baseUrl (/r/ для ru, /read/ для en и т.д., см. computeLegacyBaseUrl).
    // Если по какой-то причине openFdg.js не загружен (например, страница переиспользуется
    // без него) — фолбэк на наш собственный чистый URL /{suttaId}.
    function buildSuttaUrl(suttaId, segmentId, highlightWord) {
        var segmentHash = segmentId ? (segmentId.includes(':') ? segmentId.split(':')[1] : segmentId) : null;

        if (typeof window.findFdgTextUrl === 'function') {
            var slugForLegacy = segmentHash ? (suttaId + '#' + segmentHash) : suttaId;
            return window.findFdgTextUrl(slugForLegacy, highlightWord || '', computeLegacyBaseUrl());
        }

        var url = '/' + suttaId + (segmentHash ? ':' + segmentHash : '');
        if (highlightWord) url += '?s=' + encodeURIComponent(highlightWord);
        return url;
    }

    // Отчёт с группировкой по суттам (текущий, основной вид)
    function buildDataTable(container, dataArray, highlightWord) {
        var $table = resetContainer(container, [
            t('table.suttaCol', 'Sutta'), t('table.titleCol', 'Title'), t('table.wordsCol', 'Words'),
            t('table.countCol', 'Ct'), t('table.mrCol', 'Mr'), t('table.linksCol', 'Links'),
            t('table.typeCol', 'Type'), t('table.quoteCol', 'Quote')
        ]);

        var regexHighlight = new RegExp(highlightWord, 'gi');

        var options = $.extend({}, commonOptions(), {
            data: dataArray,
            stateSave: true,
            stateSaveParams: function (settings, data) {
                data.search.search = '';
            },
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
                    render: function (data) {
                        var textUrl = buildSuttaUrl(data, null, highlightWord);
                        return '<a class="fdgLink mainLink" target="_blank" href="' + textUrl + '" data-slug="' + data + '">' + data + '</a>';
                    }
                },
                // 1: Title
                {
                    data: 'titles',
                    render: function (data, type, row) {
                        if (!data) return '';

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

                        return '<strong class="pli-lang inputscript-ISOPali">' + titlePali + '</strong> <span class="' + langClass + ' text-muted">' + titleText + '</span>';
                    }
                },
                // 2: Words
                {
                    data: 'unique_words',
                    render: function (data) {
                        if (!data || !data.length) return '';
                        var wordsStr = data.join(' ');
                        if (highlightWord) {
                            wordsStr = wordsStr.replace(regexHighlight, function (match) { return '<b class="match finder">' + match + '</b>'; });
                        }
                        return '<span class="pli-lang inputscript-ISOPali">' + wordsStr + '</span>';
                    }
                },
                // 3: Ct
                { data: 'count' },
                // 4: Mr
                { data: 'mr' },
                // 5: Links
                {
                    data: 'sutta_id',
                    orderable: false,
                    render: function (data) {
                        var secondLangLinkHtml = '';
                        if (window.siteLanguage !== 'en') {
                            var langLabel = window.siteLanguage.charAt(0).toUpperCase() + window.siteLanguage.slice(1);
                            secondLangLinkHtml = '<a class=\'' + window.siteLanguage + 'Link\' href=\'javascript:void(0)\' data-slug=\'' + data + '\' onclick="if(typeof openRu === \'function\') openRu(\'' + data + '\'); return false;">' + langLabel + '</a>';
                        }

                        return '<a href=\'javascript:void(0)\' onclick="if(typeof openDpr === \'function\') openDpr(\'' + data + '\'); return false;">Pi</a> ' +
                            '<a class=\'bwLink\' href=\'javascript:void(0)\' data-slug=\'' + data + '\' onclick="if(typeof openBw === \'function\') openBw(\'' + data + '\'); return false;">En</a> ' +
                            secondLangLinkHtml;
                    }
                },
                // 6: Type
                { data: 'category' },
                // 7: Quote
                {
                    data: 'segments',
                    className: 'none',
                    render: function (data, type, row) {
                        if (!data || data.length === 0) return '';
                        var quoteHtml = '';

                        var renderSegment = function (seg, isContext) {
                            var html = '';
                            var paliText = seg.root_text || '';
                            var variantText = seg.variant || '';

                            if (highlightWord && paliText && !isContext) {
                                paliText = paliText.replace(regexHighlight, function (match) { return '<b class="match finder">' + match + '</b>'; });
                            }
                            if (highlightWord && variantText && !isContext) {
                                variantText = variantText.replace(regexHighlight, function (match) { return '<b class="match finder">' + match + '</b>'; });
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
                                var preferredLanguages = [window.siteLanguage, 'en'];
                                var sortedTransKeys = [];

                                preferredLanguages.forEach(function (lang) {
                                    var keysForLang = transKeys.filter(function (k) { return k.startsWith(lang + '_'); });
                                    sortedTransKeys.push.apply(sortedTransKeys, keysForLang);
                                });

                                var remainingKeys = transKeys.filter(function (k) { return sortedTransKeys.indexOf(k) === -1; });
                                sortedTransKeys.push.apply(sortedTransKeys, remainingKeys);

                                sortedTransKeys.forEach(function (key) {
                                    var transText = seg.translations[key];
                                    if (!transText) return;
                                    if (highlightWord && !isContext) {
                                        transText = transText.replace(regexHighlight, function (match) { return '<b class="match finder">' + match + '</b>'; });
                                    }
                                    var langCode = key.split('_')[0];
                                    var htmlclass = (langCode === 'en') ? "eng-lang text-muted font-weight-light" : langCode + "-lang text-muted font-weight-light";
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
            order: [[6, 'asc'], [0, 'asc']],
            initComplete: function () {
                var api = this.api();
                var rootTable = $table;

                $('#btn-show-all-children').off('click').on('click', function () {
                    rootTable.find('tbody tr:not(.parent)').find('td:first-child').trigger('click');
                });

                $('#btn-hide-all-children').off('click').on('click', function () {
                    rootTable.find('tbody tr.parent').find('td:first-child').trigger('click');
                });
            }
        });

        return $table.DataTable(options);
    }

    // Отчёт с группировкой по словам: Word | Texts | Matches | Links
    // Данные приходят из того же ответа /search (json.wordReport) — без повторного запроса.
    function buildWordDataTable(container, wordReport, highlightWord, scope) {
        var $table = resetContainer(container, [
            t('table.wordCol', 'Word'), t('table.textsCol', 'Texts'),
            t('table.matchesCol', 'Matches'), t('table.linksCol', 'Links')
        ]);

        // Переключатель Pāḷi/Рус (hide-pali/hide-english на #sutta) относится к по-суттному
        // отчёту (пали-текст против перевода) и не имеет смысла здесь — Word и так всегда
        // пали. Если оставить класс с прошлого переключения, колонка Word (тоже .pli-lang)
        // пропадает вместе со "скрытым пали", ломая отчёт и словарь (кликать не по чему).
        $table.find('tbody').removeClass('hide-pali hide-english hide-russian');

        var options = $.extend({}, commonOptions(), {
            data: wordReport || [],
            columns: [
                // 0: Word — подсвечиваем искомое слово внутри (как в колонке Words по-суттного
                // отчёта), а не просто выводим голый текст.
                {
                    data: 'word',
                    className: 'pli-lang inputscript-ISOPali',
                    render: function (data) {
                        if (!highlightWord) return data;
                        var regexHighlight = new RegExp(highlightWord, 'gi');
                        return data.replace(regexHighlight, function (match) { return '<b class="match finder">' + match + '</b>'; });
                    }
                },
                // 1: Texts — кликабельно: перезапускает поиск именно по этому слову
                // (как counttexts в легаси new/words.sh)
                {
                    data: 'textCount',
                    render: function (data, type, row) {
                        if (type !== 'display') return data;
                        var url = '/nodejs/res/?q=' + encodeURIComponent(row.word) + (scope ? '&scope=' + encodeURIComponent(scope) : '');
                        return '<a href="' + url + '">' + data + '</a>';
                    }
                },
                // 2: Matches
                { data: 'matchCount' },
                // 3: Links — под responsive-обёрткой (className:'none'), как Quote в по-суттном
                // отчёте: у частых слов список ссылок длинный, не должен растягивать таблицу.
                {
                    data: 'links',
                    orderable: false,
                    className: 'none',
                    render: function (links) {
                        if (!links || !links.length) return '';
                        return links.map(function (l) {
                            var url = buildSuttaUrl(l.sutta_id, l.segment, highlightWord);
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
            order: [[1, 'desc'], [0, 'asc']],
            initComplete: function () {
                // Та же кнопка "Saṁvaṭṭo / Vivaṭṭo", что и в по-суттном отчёте — но там она
                // навешивается на СВОЙ $table через замыкание в initComplete, и после
                // переключения на этот отчёт (новый <table> узел) старая привязка мертва.
                // Нужно перепривязать на актуальный $table каждый раз при (пере)инициализации.
                var rootTable = $table;

                $('#btn-show-all-children').off('click').on('click', function () {
                    rootTable.find('tbody tr:not(.parent)').find('td:first-child').trigger('click');
                });

                $('#btn-hide-all-children').off('click').on('click', function () {
                    rootTable.find('tbody tr.parent').find('td:first-child').trigger('click');
                });
            }
        });

        return $table.DataTable(options);
    }

    return {
        buildDataTable: buildDataTable,
        buildWordDataTable: buildWordDataTable
    };
})();
