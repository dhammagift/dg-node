/* Chapter reader — "Read by Books or Chapters" (/chapter/<id>), the Node/SQLite replacement of the
   legacy PHP r.php (old.dhamma.gift/r.php?q=sn1). Loaded lazily by search/index.html
   (ensureChapterAssets/openChapterInPlace), same pattern as toc.js and megareader.js; renders
   into #chapter-pane.

   Data: /api/chapter/:id (manifest — what the id is, ordered texts with segment counts) and
   /api/chapter/:id/texts?from=&count= (batches of texts in the exact /api/text shape). Both come
   out of dg.db on the server — no grep, no files.

   Loading model (owner: "нужно чтобы грузилось быстро но потом полностью, для поиска и фильтра"):
   a placeholder <section> per text is laid out immediately from the manifest, a small first
   batch is fetched and painted right away, then the remaining batches stream in one after another
   in the background until the WHOLE chapter/book is in the page — so the filter box and the
   browser's own Ctrl+F see everything. r.php built one giant table server-side and handed it to
   DataTables with paging:false, which is what used to freeze on q=mn / q=an.

   Segment markup is the reader's own (megareader.js: .pli-lang / .right-column / <lang>-lang,
   lang="" attributes), so the reader's CSS, Pāḷi/translation toggles, 1/2-column mode, the
   click-a-word dictionary and the TTS player (voice.js keys off the lang attribute) all work
   here unchanged. */
(function () {
    'use strict';

    var pane = null;
    var run = null;          // current session: { token, id, manifest, langs, script, rp, ... }
    var tokenCounter = 0;
    var normCache = new WeakMap(); // segment element -> normalized text (for the filter)
    var FIRST_BATCH_SEGMENTS = 300;   // tiny first batch = fast first paint
    var BATCH_SEGMENTS = 1200;        // ~100 ms of server time per batch on MN-sized texts
    var BATCH_MAX_TEXTS = 25;         // server-side cap (CHAPTER_MAX_COUNT in dg-fastify.js)

    function uiIsRu() {
        return (localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en') === 'ru';
    }
    // UI strings: configs/search/lang_{ru,en}.json → "chapter" block, via the page's dgT()
    // (search/index.html); the inline fallbacks only matter if that config failed to load.
    var FALLBACK = {
        en: {
            title: 'Read by Books or Chapters', texts: 'texts', segments: 'segments', loading: 'loading',
            loaded: 'loaded', filter: 'Filter…', filterCount: '{k} of {n} segments in {m} texts',
            noMatches: 'No matches', pali: 'Pāḷi', translation: 'Translation', columns: '1/2 columns',
            devanagari: 'Devanagari', roman: 'Roman script', punct: 'Punctuation', toc: 'Table of contents',
            reader: 'Open in reader', kindText: 'Text', kindChapter: 'Chapter', kindBook: 'Book',
            welcome: 'Enter a text, chapter or book id — e.g. <b>sn1</b>, <b>mn10</b>, <b>dn</b>, <b>an3</b>, <b>pj1</b> — into the search box above, or pick a book:',
            notFound: 'Nothing found for “{q}”', searchInstead: 'Search for it instead', examples: 'Examples'
        },
        ru: {
            title: 'Читать книгами и главами', texts: 'текстов', segments: 'сегментов', loading: 'загрузка',
            loaded: 'загружено', filter: 'Фильтр…', filterCount: '{k} из {n} сегментов в {m} текстах',
            noMatches: 'Ничего не найдено', pali: 'Пали', translation: 'Перевод', columns: '1/2 колонки',
            devanagari: 'Деванагари', roman: 'Латиница', punct: 'Пунктуация', toc: 'Оглавление',
            reader: 'Открыть в ридере', kindText: 'Текст', kindChapter: 'Глава', kindBook: 'Книга',
            welcome: 'Введите в поле поиска сверху id текста, главы или книги — например <b>sn1</b>, <b>mn10</b>, <b>dn</b>, <b>an3</b>, <b>pj1</b> — или выберите книгу:',
            notFound: 'Ничего не найдено по «{q}»', searchInstead: 'Искать как слово', examples: 'Примеры'
        }
    };
    function t(key, vars) {
        var fb = (FALLBACK[uiIsRu() ? 'ru' : 'en'] || FALLBACK.en)[key] || key;
        var s = (typeof window.dgT === 'function') ? window.dgT('chapter.' + key, fb) : fb;
        if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
        return s;
    }

    // Same localStorage key the reader/TOC/settings use for "Reading languages" — first entry is
    // the primary language. ?langs= in the URL overrides (explicit link).
    function readReadingLangs() {
        var raw = localStorage.getItem('dhammaReaderLangs');
        if (raw) return raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        return uiIsRu() ? ['ru', 'en'] : ['en'];
    }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function fetchJSON(url) {
        return fetch(url).then(function (r) {
            if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
            return r.json();
        });
    }
    function navigate(href) {
        if (typeof window.dgNavigateInternal === 'function' && window.dgNavigateInternal(href)) return;
        window.location.href = href;
    }

    // ---- URL --------------------------------------------------------------------------------
    function parseLocation() {
        var path = decodeURIComponent(window.location.pathname.replace(/\/+$/, ''));
        var id = path === '/chapter' ? '' : path.replace(/^\/chapter\//, '');
        var params = new URLSearchParams(window.location.search);
        var langsParam = params.get('langs');
        var script = params.get('script');
        if (script === 'dev') script = 'Devanagari'; // legacy r.php alias
        var rp = params.has('rp') ? params.get('rp') !== 'false' && params.get('rp') !== '0'
            : localStorage.getItem('removePunct') === 'true'; // shared with the reader's own setting
        return {
            id: id,
            langs: langsParam ? langsParam.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : readReadingLangs(),
            langsExplicit: !!langsParam,
            script: script || '',
            rp: rp,
            hash: decodeURIComponent((window.location.hash || '').slice(1))
        };
    }
    function buildUrl(patch) {
        var loc = parseLocation();
        var params = new URLSearchParams(window.location.search);
        var script = patch.script !== undefined ? patch.script : loc.script;
        var rp = patch.rp !== undefined ? patch.rp : loc.rp;
        if (script) params.set('script', script); else params.delete('script');
        if (rp) params.set('rp', '1'); else params.delete('rp');
        var qs = params.toString();
        return '/chapter/' + encodeURIComponent(loc.id) + (qs ? '?' + qs : '') + window.location.hash;
    }

    // ---- Pane skeleton ----------------------------------------------------------------------
    function buildShell(manifest, loc) {
        pane.innerHTML = '';
        var root = el('div', 'dg-ch');

        var head = el('header', 'dg-ch-head');
        var kindKey = manifest.kind === 'text' ? 'kindText' : manifest.kind === 'book' ? 'kindBook' : 'kindChapter';
        var titleRow = el('div', 'dg-ch-title-row');
        var h1 = el('h1', 'dg-ch-title', (manifest.title || manifest.id).trim());
        titleRow.appendChild(h1);
        var badge = el('span', 'dg-ch-kind', t(kindKey) + ' · ' + manifest.id);
        titleRow.appendChild(badge);
        head.appendChild(titleRow);

        var meta = el('div', 'dg-ch-meta');
        var counts = el('span', 'dg-ch-counts', manifest.total_suttas + ' ' + t('texts') + ' · ' + manifest.total_segments + ' ' + t('segments'));
        meta.appendChild(counts);
        var progressWrap = el('span', 'dg-ch-progress-wrap');
        var progress = el('span', 'dg-ch-progress');
        var progressBar = el('span', 'dg-ch-progress-bar');
        progress.appendChild(progressBar);
        progressWrap.appendChild(progress);
        var progressText = el('span', 'dg-ch-progress-text', t('loading') + '…');
        progressWrap.appendChild(progressText);
        meta.appendChild(progressWrap);
        head.appendChild(meta);
        root.appendChild(head);

        // Sticky tool row: filter + the reader's own toggles (classes shared with the reader).
        var bar = el('div', 'dg-ch-toolbar');
        var filterWrap = el('div', 'dg-ch-filter-wrap');
        var filter = el('input', 'dg-ch-filter');
        filter.type = 'search';
        filter.placeholder = t('filter');
        filter.setAttribute('aria-label', t('filter'));
        filter.autocomplete = 'off';
        filterWrap.appendChild(filter);
        var filterCount = el('span', 'dg-ch-filter-count');
        filterWrap.appendChild(filterCount);
        bar.appendChild(filterWrap);

        var tools = el('div', 'dg-ch-tools');
        function toolBtn(cls, label, iconSrc, text) {
            var b = el('a', 'dg-ch-tool ' + cls);
            b.href = 'javascript:void(0)';
            b.title = label;
            b.setAttribute('aria-label', label);
            if (iconSrc) { var img = el('img'); img.src = iconSrc; img.alt = label; b.appendChild(img); }
            if (text) b.appendChild(el('span', 'dg-ch-tool-text', text));
            tools.appendChild(b);
            return b;
        }
        var body = el('div', 'sutta dg-ch-body');
        body.id = 'dg-chapter-sutta';

        var paliBtn = toolBtn('dg-ch-tool-pali', t('pali'), null, 'Pāḷi');
        var trnBtn = toolBtn('dg-ch-tool-trn', t('translation'), null, uiIsRu() ? 'Пер.' : 'Trn');
        paliBtn.addEventListener('click', function () {
            body.classList.toggle('hide-pali');
            if (body.classList.contains('hide-pali')) body.classList.remove('hide-english');
            syncToggleState();
        });
        trnBtn.addEventListener('click', function () {
            body.classList.toggle('hide-english');
            if (body.classList.contains('hide-english')) body.classList.remove('hide-pali');
            syncToggleState();
        });
        function syncToggleState() {
            paliBtn.classList.toggle('dg-ch-off', body.classList.contains('hide-pali'));
            trnBtn.classList.toggle('dg-ch-off', body.classList.contains('hide-english'));
        }
        // 1/2 columns — .toggle-mode-btn is settings.js's delegated handler (flips the icon and
        // saves localStorage.viewMode); it only re-classes #sutta/#search-pane, so the chapter
        // body follows the saved value itself (applyColumnMode below).
        var colBtn = toolBtn('toggle-mode-btn dg-ch-tool-cols', t('columns'), '/assets/svg/align-right.svg');
        var isDev = !!loc.script;
        var scriptBtn = toolBtn('dg-ch-tool-script', isDev ? t('roman') : t('devanagari'),
            isDev ? '/assets/svg/devanagari_r.svg' : '/assets/svg/devanagari_d.svg');
        scriptBtn.addEventListener('click', function () {
            history.replaceState(history.state, '', buildUrl({ script: isDev ? '' : 'Devanagari' }));
            window.initChapter();
        });
        var punctBtn = toolBtn('dg-ch-tool-punct' + (loc.rp ? ' dg-ch-off' : ''), t('punct'), null, '.,;');
        punctBtn.addEventListener('click', function () {
            history.replaceState(history.state, '', buildUrl({ rp: !loc.rp }));
            window.initChapter();
        });
        if (manifest.kind !== 'text') {
            var tocBtn = toolBtn('dg-ch-tool-toc', t('toc'), '/assets/svg/list-ul-solid-full.svg');
            tocBtn.addEventListener('click', function () { navigate('/toc/' + encodeURIComponent(manifest.id)); });
        } else {
            var readerBtn = toolBtn('dg-ch-tool-reader', t('reader'), '/assets/svg/open-link.svg');
            readerBtn.addEventListener('click', function () { navigate('/' + encodeURIComponent(manifest.id)); });
        }
        bar.appendChild(tools);
        root.appendChild(bar);
        root.appendChild(body);

        // One placeholder per text, in reading order, sized from its segment count so the page
        // has its final rough height (and anchors deep inside it are reachable) before a single
        // batch arrives.
        var frag = document.createDocumentFragment();
        manifest.suttas.forEach(function (s, i) {
            var sec = el('section', 'dg-ch-sutta dg-ch-pending');
            sec.id = s.id;
            sec.dataset.i = i;
            sec.style.setProperty('--dg-ch-n', s.n);
            var ph = el('div', 'dg-ch-ph');
            ph.appendChild(el('span', 'dg-ch-ph-id', s.id));
            ph.appendChild(el('span', 'dg-ch-ph-title', (s.title || '').trim()));
            sec.appendChild(ph);
            frag.appendChild(sec);
        });
        body.appendChild(frag);

        var status = el('div', 'dg-ch-status');
        root.appendChild(status);
        pane.appendChild(root);

        return { root: root, body: body, filter: filter, filterCount: filterCount, progressBar: progressBar, progressText: progressText, status: status };
    }

    function applyColumnMode() {
        if (!run || !run.ui) return;
        var isColumns = (localStorage.getItem('viewMode') || 'alternate') === 'columns';
        run.ui.body.classList.toggle('column-view', isColumns);
    }

    // ---- Segment rendering (megareader.js's markup, minus the single-sutta chrome) --------
    function renderSutta(section, data, chapterId) {
        var columns = data.columns || [];
        var htmlData = {}, paliData = {};
        var keysByLang = {};
        data.segments.forEach(function (seg) {
            htmlData[seg.segment] = seg.html || '{}';
            paliData[seg.segment] = seg.root_text || undefined;
            Object.keys(seg.translations || {}).forEach(function (key) {
                var lang = key.split('_')[0];
                (keysByLang[lang] = keysByLang[lang] || []);
                if (keysByLang[lang].indexOf(key) === -1) keysByLang[lang].push(key);
            });
        });
        var entries = [];
        columns.forEach(function (lang) {
            (keysByLang[lang] || []).forEach(function (key) {
                entries.push({ lang: lang, key: key, translatorId: key.slice(lang.length + 1), data: {} });
            });
        });
        data.segments.forEach(function (seg) {
            entries.forEach(function (e) { e.data[seg.segment] = seg.translations ? seg.translations[e.key] : undefined; });
        });
        var dataObjects = [paliData].concat(entries.map(function (e) { return e.data; }));
        var segments = (typeof window.mergeGathas === 'function')
            ? window.mergeGathas(htmlData, dataObjects)
            : Object.keys(htmlData);

        var base = window.location.origin + '/chapter/' + encodeURIComponent(chapterId) + '#';
        var html = '<div class="dg-ch-sutta-head"><a class="dg-ch-sutta-link" href="/' + encodeURIComponent(data.sutta_id) + '" title="' + escapeHtml(t('reader')) + '">' +
            escapeHtml(data.sutta_id) + '</a></div>';
        for (var i = 0; i < segments.length; i++) {
            var segment = segments[i];
            var parts = (htmlData[segment] || '{}').split(/{}/);
            var openHtml = parts[0] || '', closeHtml = parts[1] || '';
            var url = base + segment;
            var linkStart = '<a class="text-decoration-none copyLink copyLink-start" onclick="copyToClipboard(\'' + url + '\')"></a>';
            var link = '<a class="text-decoration-none copyLink" onclick="copyToClipboard(\'' + url + '\')"></a>';
            var inner = '';
            if (paliData[segment] !== undefined) {
                inner += '<span class="pli-lang inputscript-ISOPali quote" lang="pi">' + linkStart + String(paliData[segment]).trim() + link + '</span>';
            }
            var right = '';
            var ti = 0;
            entries.forEach(function (e) {
                var val = e.data[segment];
                if (val === undefined) return;
                right += '<span class="' + e.lang + '-lang' + (ti ? ' lang-2nd' : '') + ' quote" lang="' + e.lang + '" data-translator="' + escapeHtml(e.translatorId) + '">' +
                    linkStart + String(val).trim() + link + '</span>';
                ti++;
            });
            if (right) inner += '<span class="right-column">' + right + '</span>';
            html += openHtml + '<span id="' + escapeHtml(segment) + '" class="dg-ch-seg">' + inner + '</span>' + closeHtml + '\n';
        }
        section.innerHTML = html;
        section.classList.remove('dg-ch-pending');
        // --dg-ch-n stays: it feeds contain-intrinsic-size while the section is off-screen.
    }

    // ---- Batch plan --------------------------------------------------------------------------
    // Start at the anchored text (if any), run to the end, then wrap around to the beginning —
    // so a deep link into MN paints ITS text first, not mn1. Consecutive indices are grouped
    // into batches under a segment budget (small first batch, bigger afterwards) and the
    // server-side cap on texts per request.
    function planBatches(manifest, startIndex) {
        var n = manifest.suttas.length;
        var order = [];
        for (var i = startIndex; i < n; i++) order.push(i);
        for (var j = 0; j < startIndex; j++) order.push(j);
        var batches = [];
        var cur = null;
        order.forEach(function (idx) {
            var segs = manifest.suttas[idx].n || 1;
            var budget = batches.length === 0 ? FIRST_BATCH_SEGMENTS : BATCH_SEGMENTS;
            if (cur && cur.from + cur.count === idx && cur.count < BATCH_MAX_TEXTS && cur.segs + segs <= budget) {
                cur.count++;
                cur.segs += segs;
            } else {
                cur = { from: idx, count: 1, segs: segs };
                batches.push(cur);
            }
        });
        return batches;
    }

    function yieldToBrowser() {
        return new Promise(function (resolve) {
            if (window.requestIdleCallback) requestIdleCallback(function () { resolve(); }, { timeout: 200 });
            else setTimeout(resolve, 0);
        });
    }

    // ---- Anchor ----------------------------------------------------------------------------
    // "#sn1.5", "#sn1.5:1.3", legacy "#1.3" (segment only — a single text), legacy Read+
    // "#mn129 sati" (id + the rest of what was typed → becomes the filter term).
    function resolveAnchor(manifest, loc) {
        var raw = (loc.hash || '').trim();
        var result = { index: 0, segment: null, filter: '' };
        if (manifest.anchor) {
            // an1.9 inside an1.1-10: the server told us which text the id lives in.
            result.segment = manifest.anchor;
        }
        if (!raw) return result;
        var parts = raw.split(/\s+/);
        var head = parts[0].toLowerCase();
        if (parts.length > 1) result.filter = parts.slice(1).join(' ');
        var suttaId = head.split(':')[0];
        var idx = -1;
        manifest.suttas.forEach(function (s, i) { if (s.id === suttaId) idx = i; });
        if (idx === -1 && manifest.kind === 'text' && /^\d/.test(head)) {
            // bare segment number on a single text → prefix it
            idx = 0;
            head = manifest.suttas[0].id + ':' + head;
        }
        if (idx === -1) {
            // an1.9 written into the hash of an1.1-10-style ranges: find the range it sits in
            manifest.suttas.forEach(function (s, i) {
                var m = s.id.match(/^([a-z-]+\d*\.?)(\d+)-(\d+)$/);
                var h = suttaId.match(/^([a-z-]+\d*\.?)(\d+)$/);
                if (m && h && m[1] === h[1] && +h[2] >= +m[2] && +h[2] <= +m[3]) idx = i;
            });
        }
        if (idx !== -1) {
            result.index = idx;
            result.segment = head;
        }
        return result;
    }

    function scrollToAnchor(segmentOrId) {
        if (!segmentOrId) return false;
        var target = document.getElementById(segmentOrId);
        if (!target) {
            // "an1.9" → first segment of that nested sutta inside the range text
            target = run.ui.body.querySelector('[id^="' + segmentOrId.replace(/"/g, '') + ':"]');
        }
        if (!target) return false;
        target.scrollIntoView({ block: 'start' });
        target.classList.add('dg-ch-target');
        return true;
    }

    // While batches are still streaming in ABOVE the anchored text, their placeholders get
    // replaced by real content of a different height, so the anchor drifts. Keep it pinned to the
    // top after every batch until the reader touches the page — then it's theirs.
    function pinAnchor() {
        if (!run || !run.pin || !run.anchorTarget) return;
        scrollToAnchor(run.anchorTarget);
    }
    function unpinAnchor() { if (run) run.pin = false; }

    // Real height per segment for THIS page (languages, width, font size), measured on rendered
    // texts and handed to CSS (--dg-ch-seg-h) so pending/off-screen sections are estimated close to
    // their final size — see the .dg-ch-sutta rule in home.css.
    function calibrateSegmentHeight(sections) {
        var px = 0, n = 0;
        sections.forEach(function (sec) {
            var segs = parseInt(sec.style.getPropertyValue('--dg-ch-n'), 10) || 0;
            if (!segs) return;
            px += sec.getBoundingClientRect().height;
            n += segs;
        });
        if (n && px) run.ui.body.style.setProperty('--dg-ch-seg-h', (px / n).toFixed(1) + 'px');
    }

    // After the last batch: re-pin until the anchor stops moving (neighbours get their real layout
    // as they come near the viewport), then hand the scroll over to the reader.
    function settleAnchor(token) {
        var stable = 0, tries = 0;
        (function tick() {
            if (token !== tokenCounter || !run || !run.pin || !run.anchorTarget) return;
            var target = document.getElementById(run.anchorTarget) ||
                run.ui.body.querySelector('[id^="' + run.anchorTarget.replace(/"/g, '') + ':"]');
            if (!target) return;
            var want = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
            var diff = Math.abs(target.getBoundingClientRect().top - want);
            if (diff > 1.5) { target.scrollIntoView({ block: 'start' }); stable = 0; } else stable++;
            if (stable >= 3 || ++tries > 40) { run.pin = false; return; }
            setTimeout(tick, 120);
        })();
    }
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) {
        window.addEventListener(ev, unpinAnchor, { passive: true });
    });

    // Pre-normalize every rendered segment for the filter in idle time, so the first keystroke
    // into the filter box on a 27k-segment book doesn't pay for 27k normalize() calls at once.
    function warmFilterCache(token) {
        var segs = Array.prototype.slice.call(run.ui.body.querySelectorAll('.dg-ch-seg'));
        var i = 0;
        function step(deadline) {
            if (token !== tokenCounter) return;
            var until = Date.now() + 12;
            while (i < segs.length && (deadline && deadline.timeRemaining ? deadline.timeRemaining() > 2 : Date.now() < until)) {
                segText(segs[i++]);
            }
            if (i < segs.length) schedule();
        }
        function schedule() {
            if (window.requestIdleCallback) requestIdleCallback(step, { timeout: 500 });
            else setTimeout(step, 16);
        }
        schedule();
    }

    // ---- Filter ----------------------------------------------------------------------------
    function normalize(s) {
        return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    }
    function segText(seg) {
        var v = normCache.get(seg);
        if (v === undefined) { v = normalize(seg.textContent); normCache.set(seg, v); }
        return v;
    }
    function applyFilter(sections) {
        if (!run || !run.ui) return;
        var term = run.filterTerm || '';
        var words = normalize(term).split(/\s+/).filter(Boolean);
        var active = words.length > 0;
        run.ui.body.classList.toggle('dg-ch-filtering', active);
        (sections || run.ui.body.querySelectorAll('.dg-ch-sutta:not(.dg-ch-pending)')).forEach(function (sec) {
            var any = false;
            sec.querySelectorAll('.dg-ch-seg').forEach(function (seg) {
                var hit = true;
                if (active) {
                    var text = segText(seg);
                    for (var i = 0; i < words.length; i++) if (text.indexOf(words[i]) === -1) { hit = false; break; }
                }
                seg.classList.toggle('dg-ch-hide', !hit);
                if (hit) any = true;
            });
            sec.classList.toggle('dg-ch-hide', active && !any);
        });
        updateFilterCount();
    }
    function updateFilterCount() {
        var ui = run.ui;
        if (!run.filterTerm) { ui.filterCount.textContent = ''; return; }
        var hits = ui.body.querySelectorAll('.dg-ch-seg:not(.dg-ch-hide)').length;
        var texts = ui.body.querySelectorAll('.dg-ch-sutta:not(.dg-ch-pending):not(.dg-ch-hide)').length;
        ui.filterCount.textContent = hits
            ? t('filterCount', { k: hits, n: run.loadedSegments, m: texts })
            : t('noMatches');
    }

    // ---- Progress --------------------------------------------------------------------------
    function updateProgress() {
        var ui = run.ui;
        var total = run.manifest.total_segments || 1;
        var pct = Math.min(100, Math.round(run.loadedSegments / total * 100));
        ui.progressBar.style.width = pct + '%';
        var done = run.loadedTexts >= run.manifest.suttas.length;
        ui.progressText.textContent = done ? t('loaded') : t('loading') + '… ' + pct + '%';
        ui.root.classList.toggle('dg-ch-complete', done);
    }

    // ---- Main ------------------------------------------------------------------------------
    function renderWelcome(loc, notFoundId) {
        pane.innerHTML = '';
        var root = el('div', 'dg-ch dg-ch-welcome');
        root.appendChild(el('h1', 'dg-ch-title', t('title')));
        if (notFoundId) {
            var nf = el('p', 'dg-ch-notfound');
            nf.textContent = t('notFound', { q: notFoundId }) + ' ';
            var a = el('a', null, t('searchInstead'));
            a.href = '/' + encodeURIComponent(notFoundId);
            a.addEventListener('click', function (e) { e.preventDefault(); navigate(a.getAttribute('href')); });
            nf.appendChild(a);
            root.appendChild(nf);
        }
        var p = el('p', 'dg-ch-welcome-text');
        p.innerHTML = t('welcome');
        root.appendChild(p);
        var ex = el('p', 'dg-ch-examples');
        ex.appendChild(el('span', 'dg-ch-examples-label', t('examples') + ': '));
        ['sn1', 'sn12', 'an3', 'an1.1-10', 'mn10', 'dn22', 'pj', 'pm', 'kd1', 'dhp'].forEach(function (id) {
            var a = el('a', 'dg-ch-chip dg-ch-chip-sm', id);
            a.href = '/chapter/' + id;
            ex.appendChild(a);
        });
        root.appendChild(ex);
        var books = el('div', 'dg-ch-books');
        root.appendChild(books);
        pane.appendChild(root);
        document.title = t('title') + ' - Dhamma.gift';

        fetchJSON('/api/toc').then(function (toc) {
            var lang = uiIsRu() ? 'ru' : 'en';
            (toc.categories || []).forEach(function (cat) {
                var group = el('div', 'dg-ch-book-group');
                group.appendChild(el('h2', 'dg-ch-book-cat', (cat.label && (cat.label[lang] || cat.label.en)) || cat.category));
                var row = el('div', 'dg-ch-chip-row');
                function chip(b) {
                    var a = el('a', 'dg-ch-chip');
                    a.href = '/chapter/' + encodeURIComponent(b.code);
                    a.appendChild(el('span', 'dg-ch-chip-label', (b.label && (b.label[lang] || b.label.en)) || b.code));
                    a.appendChild(el('span', 'dg-ch-chip-count', b.count ? String(b.count) : ''));
                    row.appendChild(a);
                }
                (cat.books || []).forEach(chip);
                (cat.groups || []).forEach(function (g) {
                    chip(g);
                    (g.books || []).forEach(chip);
                });
                group.appendChild(row);
                books.appendChild(group);
            });
        }).catch(function () { /* start page still works without the book list */ });
    }

    function cancelRun() {
        tokenCounter++;
        if (run) run.cancelled = true;
    }

    window.initChapter = function () {
        pane = document.getElementById('chapter-pane');
        if (!pane) return;
        var loc = parseLocation();
        // Same chapter, same options, only the #anchor changed (popstate / in-page link): scroll,
        // don't re-stream the whole book.
        if (run && run.ui && run.manifest && !run.cancelled && run.loadedTexts >= run.manifest.suttas.length &&
            (run.id === loc.id || run.manifest.id === loc.id) &&
            run.loc.langs.join(',') === loc.langs.join(',') && run.loc.script === loc.script && run.loc.rp === loc.rp) {
            var a = resolveAnchor(run.manifest, loc);
            run.pin = false;
            if (a.filter && run.ui.filter.value !== a.filter) { run.ui.filter.value = a.filter; run.filterTerm = a.filter; applyFilter(); }
            run.ui.body.querySelectorAll('.dg-ch-target').forEach(function (el) { el.classList.remove('dg-ch-target'); });
            if (a.segment) scrollToAnchor(a.segment);
            else if (a.index > 0) scrollToAnchor(run.manifest.suttas[a.index].id);
            return;
        }
        cancelRun();
        var token = tokenCounter;
        run = { token: token, id: loc.id, loc: loc, loadedSegments: 0, loadedTexts: 0, filterTerm: '', ui: null, manifest: null, pin: false, anchorTarget: null };

        if (!loc.id) { renderWelcome(loc); return; }

        var langParam = uiIsRu() ? 'ru' : 'en';
        fetchJSON('/api/chapter/' + encodeURIComponent(loc.id) + '?lang=' + langParam).then(function (manifest) {
            if (token !== tokenCounter) return;
            run.manifest = manifest;
            if (manifest.id !== loc.id) {
                // normalized on the server ("mn 10" → mn10, "an1.9" → an1.1-10): show the canonical path
                history.replaceState(history.state, '', '/chapter/' + encodeURIComponent(manifest.id) + window.location.search + window.location.hash);
                run.id = manifest.id;
            }
            document.title = (manifest.title || manifest.id).trim() + ' · ' + t('title') + ' - Dhamma.gift';
            run.ui = buildShell(manifest, loc);
            applyColumnMode();

            var anchor = resolveAnchor(manifest, loc);
            if (anchor.filter) { run.ui.filter.value = anchor.filter; run.filterTerm = anchor.filter; }
            var filterTimer = null;
            run.ui.filter.addEventListener('input', function () {
                clearTimeout(filterTimer);
                filterTimer = setTimeout(function () {
                    if (token !== tokenCounter) return;
                    run.filterTerm = run.ui.filter.value.trim();
                    applyFilter();
                }, 180);
            });

            var batches = planBatches(manifest, anchor.index);
            var qs = '&langs=' + encodeURIComponent(loc.langs.join(',')) +
                (loc.script ? '&script=' + encodeURIComponent(loc.script) : '') + (loc.rp ? '&rp=1' : '');
            var scrolled = false;

            function loadNext(k) {
                if (token !== tokenCounter || k >= batches.length) return Promise.resolve();
                var b = batches[k];
                return fetchJSON('/api/chapter/' + encodeURIComponent(manifest.id) + '/texts?from=' + b.from + '&count=' + b.count + qs)
                    .then(function (res) {
                        if (token !== tokenCounter) return;
                        var filled = [];
                        res.suttas.forEach(function (data, j) {
                            var sec = run.ui.body.querySelector('.dg-ch-sutta[data-i="' + (b.from + j) + '"]');
                            if (!sec) return;
                            renderSutta(sec, data, manifest.id);
                            filled.push(sec);
                            run.loadedTexts++;
                            run.loadedSegments += (manifest.suttas[b.from + j].n || data.segments.length);
                        });
                        if (run.filterTerm) applyFilter(filled);
                        // Once, from the first batch: changing the estimate later resizes every
                        // placeholder above the anchor at once and yanks the page mid-stream.
                        if (k === 0 && filled.length) calibrateSegmentHeight(filled);
                        updateProgress();
                        if (!scrolled && k === 0 && (anchor.segment || anchor.index > 0)) {
                            scrolled = true;
                            // First batch is the anchored text: jump there once it exists in the DOM,
                            // then keep it pinned while the rest streams in (see pinAnchor).
                            run.anchorTarget = (anchor.segment && document.getElementById(anchor.segment)) ? anchor.segment
                                : (anchor.segment && run.ui.body.querySelector('[id^="' + anchor.segment.replace(/"/g, '') + ':"]')) ? anchor.segment
                                : manifest.suttas[anchor.index].id;
                            run.pin = true;
                            requestAnimationFrame(pinAnchor);
                        } else if (run.pin) {
                            requestAnimationFrame(pinAnchor);
                        }
                        if (run.loadedTexts >= manifest.suttas.length) {
                            // Settle with a few delayed re-pins (late layout: fonts, images in the
                            // Bilara html) before handing the scroll over to the reader.
                            requestAnimationFrame(function () { pinAnchor(); settleAnchor(token); });
                            warmFilterCache(token);
                        }
                        return yieldToBrowser().then(function () { return loadNext(k + 1); });
                    });
            }
            return loadNext(0).catch(function (err) {
                if (token !== tokenCounter) return;
                console.error('Chapter reader: batch load failed', err);
                run.ui.status.textContent = (uiIsRu() ? 'Не удалось загрузить: ' : 'Failed to load: ') + err.message;
            });
        }).catch(function (err) {
            if (token !== tokenCounter) return;
            if (err.status === 404) { renderWelcome(loc, loc.id); return; }
            console.error('Chapter reader: manifest failed', err);
            pane.innerHTML = '';
            pane.appendChild(el('p', 'dg-ch-notfound', (uiIsRu() ? 'Не удалось загрузить: ' : 'Failed to load: ') + err.message));
        });
    };

    // Column mode follows settings.js (toolbar button / Alt+C / quick settings) via the saved value.
    document.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('.toggle-mode-btn')) setTimeout(applyColumnMode, 0);
    });
    document.addEventListener('keydown', function (e) {
        if (e.altKey && e.code === 'KeyC') setTimeout(applyColumnMode, 0);
    });
    // Leaving the chapter view (SPA state change) stops the background streaming.
    window.addEventListener('dgStateChanged', function (e) {
        if (e.detail && e.detail.name !== 'chapter') cancelRun();
    });
    // Internal links inside the pane (chips, sutta ids) stay in the SPA.
    document.addEventListener('click', function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented) return;
        var a = e.target.closest ? e.target.closest('#chapter-pane a[href^="/"]') : null;
        if (!a || a.classList.contains('copyLink')) return;
        e.preventDefault();
        navigate(a.getAttribute('href'));
    });

    window.initChapter();
})();
