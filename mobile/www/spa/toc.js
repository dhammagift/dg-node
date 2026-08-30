/* TOC / navigator — lazy tree browsing, replaces the legacy read.php static tree (see TODO.md).
   Loaded lazily by search/index.html (ensureTocAssets/openTocInPlace), same pattern as
   megareader.js for the reader. Renders into #toc-pane.
   Data: /api/toc (light top-level book list) + /api/toc/book/:code (one book's whole tree,
   small — see dg-light.js TOC_TREE_ROOT comment). */
(function () {
    'use strict';

    var container = null;
    var topLevelPromise = null;
    var bookCache = {}; // code -> parsed /api/toc/book/:code response
    var translatorNames = null; // window.siteTranslators, fetched once

    function uiIsRu() {
        return (localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en') === 'ru';
    }

    // Same localStorage key settings/index.html already uses for "Reading languages" — the TOC
    // only READS it (editing stays in Settings), first entry is the primary language. Not
    // hardcoded to ru/en: whatever languages the user configured there, in that order.
    function readReadingLangs() {
        var raw = localStorage.getItem('dhammaReaderLangs');
        if (raw) return raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        return uiIsRu() ? ['ru', 'en'] : ['en'];
    }

    // Same localStorage key settings/index.html's search-scope picker uses — TOC reuses it (not a
    // new setting) to decide whether the full Khuddaka Nikāya / Abhidhamma should be shown at all,
    // per owner: "только если в настройках включена вся кн". null = never customized -> defaults
    // (4 Nikayas + 6 core Khuddaka books only, no Abhidhamma), matching settings/index.html's
    // DEFAULT_SCOPE — the "extra" groups are additive-only in that UI, never in the default set.
    function readSearchScope() {
        var raw = localStorage.getItem('dhammaSearchScope');
        return raw ? raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : null;
    }
    function extraTierUnlocked(extraScopeCodes) {
        if (!extraScopeCodes || !extraScopeCodes.length) return true;
        var scope = readSearchScope();
        if (!scope) return false;
        return extraScopeCodes.some(function (code) { return scope.indexOf(code) !== -1; });
    }

    // null = no filter set yet (show every translator). Once the user touches the panel, this
    // becomes an explicit array of allowed transKeys, same "don't write until touched" pattern
    // settings/index.html uses for dhammaReaderLangs/dhammaSearchLangs.
    function readTranslatorFilter() {
        var raw = localStorage.getItem('dhammaTranslatorFilter');
        if (!raw) return null;
        try { return new Set(JSON.parse(raw)); } catch (e) { return null; }
    }
    function saveTranslatorFilter(set) {
        localStorage.setItem('dhammaTranslatorFilter', JSON.stringify(Array.from(set)));
    }

    // Whether the Translators panel starts open. No stored choice yet -> responsive default
    // (closed on phones, so arriving at the TOC lands you in the Pali contents, not a translator
    // checklist; open on tablet/desktop, same 640px breakpoint as the column layout). Once the
    // user actually toggles it, that explicit choice is remembered and wins over the responsive
    // default from then on (owner: "если человек оставит его развёрнутым пусть будет развёрнутым").
    function readAsideOpenPref() {
        var raw = localStorage.getItem('dhammaTocAsideOpen');
        if (raw === '1') return true;
        if (raw === '0') return false;
        return !window.matchMedia('(max-width: 640px)').matches;
    }
    function saveAsideOpenPref(open) {
        localStorage.setItem('dhammaTocAsideOpen', open ? '1' : '0');
    }

    function fetchJSON(url) {
        return fetch(url).then(function (r) {
            if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
            return r.json();
        });
    }

    function fetchTopLevel() {
        if (!topLevelPromise) topLevelPromise = fetchJSON('/api/toc');
        return topLevelPromise;
    }

    function fetchBook(code, langs) {
        var cacheKey = code + '|' + langs.join(',');
        if (bookCache[cacheKey]) return bookCache[cacheKey];
        var url = '/api/toc/book/' + encodeURIComponent(code) + '?langs=' + encodeURIComponent(langs.join(','));
        bookCache[cacheKey] = fetchJSON(url);
        return bookCache[cacheKey];
    }

    // Bhikkhu/Bhikkhuni Pātimokkha (pli-tv-bu-pm/pli-tv-bi-pm) — same content prod's read.php
    // shows inline (not a reader page): full rule text right under the toc entry, with links
    // per rule to its Vibhaṅga/self-anchor already pointing at real dg-node routes (see
    // convert-patimokkha.js/dg-light.js). Fetched once per side, only when the entry is first
    // expanded, not preloaded with the rest of the toc.
    var patimokkhaFragmentCache = {};
    function fetchPatimokkhaFragment(side) {
        if (patimokkhaFragmentCache[side]) return patimokkhaFragmentCache[side];
        patimokkhaFragmentCache[side] = fetch('/api/patimokkha-fragment/' + side)
            .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.text(); });
        return patimokkhaFragmentCache[side];
    }

    function ensureTranslatorNames() {
        if (translatorNames) return Promise.resolve(translatorNames);
        return fetch('/assets/js/translators.json')
            .then(function (r) { return r.ok ? r.json() : {}; })
            .then(function (data) { translatorNames = data || {}; return translatorNames; })
            .catch(function () { translatorNames = {}; return translatorNames; });
    }

    // The SAME priority config the reader uses to pick its preferred translator(s)
    // (configs/reader/translator-priority.json, served at /reader/translator-priority.json —
    // see dg-light.js/CLAUDE.md) — not a second, TOC-only ranking. A language with no entry there
    // (anything beyond today's ru/en) falls through to the generic "+edited+o" heuristic below,
    // so a future language works without touching this file OR this code (owner: "не хардкодь
    // ничего под рус и англ отдельно... логика приоритетов переводчиков — это настройка... она
    // должна быть глобальной, ридер её тоже должен переиспользовать").
    var translatorPriority = null;
    function ensureTranslatorPriority() {
        if (translatorPriority) return Promise.resolve(translatorPriority);
        return fetch('/reader/translator-priority.json')
            .then(function (r) { return r.ok ? r.json() : {}; })
            .then(function (data) { translatorPriority = data || {}; return translatorPriority; })
            .catch(function () { translatorPriority = {}; return translatorPriority; });
    }
    // Lower = shown/sorted first. Explicit position in the shared priority list wins; otherwise a
    // translation edited/reviewed by "o" (corpus-wide "+edited+o" naming convention, not tied to
    // any one language) floats above plain ones, then alphabetical.
    function priorityRank(transKey) {
        var lang = transKey.slice(0, transKey.indexOf('_'));
        var list = translatorPriority && translatorPriority[lang];
        if (list) {
            var idx = list.indexOf(transKey);
            if (idx !== -1) return idx;
        }
        // Owner: "o, edited o должен иметь приоритет" — applies for ANY language, not just the
        // ones with an explicit list above: plain "o" (interlinear) first, "+edited+o" next.
        var key = transKey.slice(transKey.indexOf('_') + 1);
        if (key === 'o') return 500;
        if (key.indexOf('+edited+o') !== -1) return 1000;
        return 2000;
    }

    // Full language name via the browser's own Intl.DisplayNames — not a ru/en lookup table:
    // works the same for any language the reading-langs setting ever grows to (owner: "зачем
    // оставлять ру en... выписывай прямо русский и английский").
    var langDisplayNames = null;
    function langName(lang) {
        try {
            if (!langDisplayNames || langDisplayNames._locale !== (uiIsRu() ? 'ru' : 'en')) {
                langDisplayNames = new Intl.DisplayNames([uiIsRu() ? 'ru' : 'en'], { type: 'language' });
                langDisplayNames._locale = uiIsRu() ? 'ru' : 'en';
            }
            var name = langDisplayNames.of(lang);
            return name.charAt(0).toUpperCase() + name.slice(1);
        } catch (e) { return lang.toUpperCase(); }
    }

    function translatorLabel(transKey) {
        var idx = transKey.indexOf('_');
        var lang = transKey.slice(0, idx), key = transKey.slice(idx + 1);
        var byLang = translatorNames && translatorNames[lang];
        var raw = byLang && byLang[key];
        if (!raw) return transKey;
        // translators.json values may carry an inline <a href=...> — strip markup for a plain label.
        var tmp = document.createElement('div');
        tmp.innerHTML = raw;
        return tmp.textContent || transKey;
    }

    // Sort order for the non-interlinear ("literary") translators of one leaf/language — see
    // priorityRank above for the shared, reader-reused ranking.
    function sortRest(keys) {
        return keys.slice().sort(function (a, b) {
            var ra = priorityRank(a), rb = priorityRank(b);
            if (ra !== rb) return ra - rb;
            return translatorLabel(a).localeCompare(translatorLabel(b));
        });
    }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    // --- tree rendering ---
    // Every render* function below returns null when there is nothing to show under the current
    // filter, so an empty branch/book collapses out of the tree entirely instead of showing a
    // header with no matching children (owner: filter should really hide non-matching texts, not
    // just grey out badges).

    function leafTranslatorLinks(id, transKeys, interlinearSet, filter) {
        var interlinear = transKeys.filter(function (k) { return interlinearSet.has(k); });
        var rest = sortRest(transKeys.filter(function (k) { return !interlinearSet.has(k); }));
        var filteredRest = filter ? rest.filter(function (k) { return filter.has(k); }) : rest;
        if (!interlinear.length && !filteredRest.length) return null;

        // Plain small marks, like prod's muted "TB"/"BS" initials next to a leaf — not filled
        // chip/badge boxes (owner: side-by-side with prod, the chip look reads as an admin panel,
        // not a canon listing).
        var frag = document.createDocumentFragment();
        interlinear.forEach(function (k) {
            var a = el('a', 'toc-mark toc-mark-primary', translatorLabel(k));
            a.href = '/' + encodeURIComponent(id) + '?translators=' + encodeURIComponent(k);
            frag.appendChild(a);
        });
        if (filteredRest.length) {
            var first = el('a', 'toc-mark', translatorLabel(filteredRest[0]));
            first.href = '/' + encodeURIComponent(id) + '?translators=' + encodeURIComponent(filteredRest[0]);
            frag.appendChild(first);
            if (filteredRest.length > 1) {
                var details = document.createElement('details');
                details.className = 'toc-more';
                var summary = document.createElement('summary');
                summary.textContent = '+' + (filteredRest.length - 1);
                details.appendChild(summary);
                filteredRest.slice(1).forEach(function (k) {
                    var a = el('a', 'toc-mark', translatorLabel(k));
                    a.href = '/' + encodeURIComponent(id) + '?translators=' + encodeURIComponent(k);
                    details.appendChild(a);
                });
                frag.appendChild(details);
            }
        }
        return frag;
    }

    // Cosmetic-only shortening for the visible Vinaya id label — the real id (used for the link's
    // href and every API call) is untouched. "pli-tv-" is redundant on every single Vinaya id;
    // "vb-" is redundant once bi-/bu- already says which Vibhaṅga it is (owner: "pli-tv-bi-vb-
    // pj1-4... нужно будет убирать vb- чтобы было просто bi-pj1-4").
    function displayId(id) {
        return id.replace(/^pli-tv-/, '').replace(/^(bu|bi)-vb-/, '$1-');
    }

    function renderLeaf(node, bookData, filter, langs) {
        var transKeys = (bookData.translations && bookData.translations[node.id]) || [];
        var interlinearSet = new Set(bookData.interlinearKeys || []);

        var li = el('li', 'toc-leaf');
        // Node id in the DOM — the only thing revealTarget() needs to find and open a node from
        // the address ("/toc/sn25"); leaves and branches share one attribute, so it looks up both
        // kinds with a single selector.
        li.dataset.tocNode = node.id;
        var heading = el('span', 'toc-leaf-heading');
        var link = el('a', 'toc-leaf-link');
        link.href = '/' + encodeURIComponent(node.id);
        link.textContent = displayId(node.id);
        heading.appendChild(link);
        // Title as plain text, not part of the link — prod shows the id as the only colored/
        // underlined element on the row, the title itself is plain body text. A leading "N. " on a
        // LEAF's own title (Vinaya Khandhaka chapters carry one, e.g. "1. Mahākhandhaka") is just
        // corpus numbering clutter here, not part of the name — strip it (a branch/vagga heading's
        // own "N. Name" is left alone, that numbering is prod's own convention there).
        var title = (node.title || '').trim().replace(/^\d+\.\s*/, '');
        heading.appendChild(document.createTextNode(' ' + title));
        li.appendChild(heading);

        var anyLangShown = false;
        langs.forEach(function (lang) {
            var langKeys = transKeys.filter(function (k) { return k.indexOf(lang + '_') === 0; });
            if (!langKeys.length) return;
            var linksFrag = leafTranslatorLinks(node.id, langKeys, interlinearSet, filter);
            if (!linksFrag) return;
            anyLangShown = true;
            // One language's tag + its own translator marks travel together as a single group —
            // otherwise wrapping split the tag from its marks onto different lines, landing the
            // language label wherever the wrap happened to fall (owner: "переводы... что-то куда
            // сюда переносится на разные строчки").
            // NOT "toc-lang-group" — reader/css/uiextra.css has `[class*="-lang"]{display:block}`
            // (a legacy substring rule that already bit toc-filter-lang-row/toc-lang-tag earlier
            // this session) which would silently turn this flex row back into a block and kill
            // the gap between the tag and its translators. "-src-" sidesteps the collision.
            var group = el('span', 'toc-src-group');
            if (langs.length > 1) group.appendChild(el('span', 'toc-src-tag', lang));
            group.appendChild(linksFrag);
            li.appendChild(group);
        });

        // Under an active filter, a leaf with translations that simply don't match anyone
        // selected disappears entirely rather than showing as a bare, translation-less row.
        if (filter && transKeys.length && !anyLangShown) return null;
        return li;
    }

    // code/depth: which book ("sn","an","mn","dn",...) and how many branch levels below the book
    // root we are — only used to decide autoExpand in renderBranch below. Both optional/undefined
    // for callers that don't care (filter re-renders, KN sub-books forced open a different way).
    function buildTreeChildren(nodes, bookData, filter, langs, code, depth) {
        var ul = el('ul', 'toc-tree');
        var any = false;
        nodes.forEach(function (node) {
            var li = node.type === 'leaf'
                ? renderLeaf(node, bookData, filter, langs)
                : renderBranch(node, bookData, filter, langs, code, depth);
            if (li) { ul.appendChild(li); any = true; }
        });
        return any ? ul : null;
    }

    function renderBranch(node, bookData, filter, langs, code, depth) {
        var childList = buildTreeChildren(node.children, bookData, filter, langs, code, (depth || 0) + 1);
        if (!childList) return null;
        childList.classList.add('toc-children');
        childList.classList.add('d-none');

        var li = el('li', 'toc-branch');
        li.dataset.tocNode = node.slug; // see renderLeaf
        var header = el('div', 'toc-branch-header');
        var toggle = el('button', 'toc-toggle', '+');
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', 'false');
        header.appendChild(toggle);
        header.appendChild(el('span', 'toc-branch-title', node.title));
        li.appendChild(header);
        li.appendChild(childList);

        // Owner: clicking a saṁyutta's "+" should open every vagga inside it at once, not one
        // vagga at a time — same for AN's nipātas, and for MN/DN's own first branch level
        // (paññāsa/vagga). SN's outer vagga-samyutta grouping (depth 0) is just structural, not a
        // real "chapter" — stays a plain single-level toggle; its samyuttas (depth 1) get the
        // full expand instead.
        var autoExpand = (code === 'sn' && depth === 1) || (['an', 'mn', 'dn'].indexOf(code) !== -1 && !depth);

        header.addEventListener('click', function () {
            var willShow = childList.classList.contains('d-none');
            childList.classList.toggle('d-none', !willShow);
            toggle.textContent = willShow ? '−' : '+';
            toggle.setAttribute('aria-expanded', String(willShow));
            if (willShow && autoExpand) expandAll(li);
        });
        return li;
    }

    function expandAll(rootEl) {
        rootEl.querySelectorAll('.toc-children').forEach(function (ul) { ul.classList.remove('d-none'); });
        rootEl.querySelectorAll('.toc-toggle').forEach(function (btn) {
            btn.textContent = '−';
            btn.setAttribute('aria-expanded', 'true');
        });
    }

    function bookHasMatch(bookData, filter) {
        if (!filter) return true;
        return matchedLeafCount(bookData, filter) > 0;
    }

    // How many texts in this book actually match the current filter (interlinear always counts,
    // same rule as the per-leaf badges) — used to replace a book's static total ("34") with the
    // real filtered count while a filter is active (owner: "количество текстов вообще не
    // поменялось... хотя в дигха никае только два перевода, а написано 34").
    function matchedLeafCount(bookData, filter) {
        var interlinearSet = new Set(bookData.interlinearKeys || []);
        var translations = bookData.translations || {};
        var count = 0;
        Object.keys(translations).forEach(function (id) {
            if (translations[id].some(function (k) { return interlinearSet.has(k) || filter.has(k); })) count++;
        });
        return count;
    }

    // Returns the fetch promise so a caller that needs the rendered tree (revealTarget) can wait
    // for it; the plain click path just ignores the return value as before.
    function renderBookTree(bodyEl, code, langs, filter) {
        bodyEl.innerHTML = '';
        bodyEl.appendChild(el('div', 'toc-loading', uiIsRu() ? 'Загрузка…' : 'Loading…'));
        return fetchBook(code, langs).then(function (bookData) {
            bodyEl.innerHTML = '';
            var ul = buildTreeChildren(bookData.tree, bookData, filter, langs, code, 0);
            if (ul) {
                bodyEl.appendChild(ul);
            } else {
                bodyEl.appendChild(el('div', 'toc-empty', uiIsRu() ? 'Нет текстов у выбранных переводчиков.' : 'No texts for the selected translators.'));
            }
        }).catch(function (e) {
            bodyEl.innerHTML = '';
            bodyEl.appendChild(el('div', 'toc-error', (uiIsRu() ? 'Не удалось загрузить: ' : 'Failed to load: ') + e.message));
        });
    }

    // --- translator filter panel ---
    // Compact by design (owner: the old panel ate the whole first screen): per language, only the
    // top few translators by text count show directly, the rest sit behind a native <details>
    // "ещё" disclosure — no custom dropdown JS needed for that.
    var TOP_N_VISIBLE = 5;

    function renderFilterPanel(panelEl, langs, onChange) {
        panelEl.innerHTML = '';
        var filter = readTranslatorFilter();

        // Seeds the filter set from "everyone currently checked" (== everyone, while filter is
        // still null) the first time ANYTHING here gets toggled — individual item or a language's
        // master checkbox alike.
        function seedFilterIfNull() {
            if (filter) return;
            filter = new Set();
            panelEl.querySelectorAll('.toc-filter-checkbox[data-trans-key]').forEach(function (other) {
                if (other.checked) filter.add(other.dataset.transKey);
            });
        }

        var searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'toc-filter-search';
        searchInput.placeholder = uiIsRu() ? 'Найти переводчика…' : 'Find a translator…';
        panelEl.appendChild(searchInput);
        var groupsWrap = el('div', 'toc-filter-groups');
        panelEl.appendChild(groupsWrap);

        // Live name search across every language at once (owner: "напечатать часть его имени...
        // сюжета в английском есть, или сабо в немецком") — filters the rows already in the DOM,
        // no server round-trip. Opens each language's "Ещё" disclosure while searching (a match
        // could be hiding in there) and hides a language entirely if nothing in it matches.
        searchInput.addEventListener('input', function () {
            var q = searchInput.value.trim().toLowerCase();
            groupsWrap.querySelectorAll('.toc-filter-group').forEach(function (groupEl) {
                var anyInGroup = false;
                groupEl.querySelectorAll('.toc-filter-item').forEach(function (item) {
                    var match = !q || item.textContent.toLowerCase().indexOf(q) !== -1;
                    item.classList.toggle('d-none', !match);
                    if (match) anyInGroup = true;
                });
                groupEl.classList.toggle('d-none', !anyInGroup);
                var details = groupEl.querySelector('.toc-filter-more');
                if (details) details.open = !!q;
            });
        });

        Promise.all([fetchJSON('/settings/translator-catalog.json'), ensureTranslatorNames(), ensureTranslatorPriority()]).then(function (results) {
            var catalog = results[0];
            groupsWrap.innerHTML = '';
            langs.forEach(function (lang) {
                // Same shared priority as the per-leaf badges (priorityRank) — not a second,
                // locally-invented ranking (owner: "приоритеты переводчиков... это настройка, она
                // должна быть глобальной").
                var keys = Object.keys(catalog[lang] || {}).sort(function (a, b) {
                    var ra = priorityRank(lang + '_' + a), rb = priorityRank(lang + '_' + b);
                    if (ra !== rb) return ra - rb;
                    return catalog[lang][b] - catalog[lang][a];
                });
                if (!keys.length) return;
                var langTransKeys = keys.map(function (k) { return lang + '_' + k; });
                var group = el('div', 'toc-filter-group');

                // Language row: name (level 2 heading) + a master checkbox to turn the whole
                // language on/off in one click (owner: "вместе с языком видимо надо оставлять
                // галочку чтобы можно было отключить всех одновременно или включить всех").
                var langRow = el('div', 'toc-filter-hdr');
                var masterCb = document.createElement('input');
                masterCb.type = 'checkbox';
                masterCb.className = 'toc-filter-checkbox toc-filter-master';
                function syncMaster() {
                    var checkedCount = langTransKeys.filter(function (tk) { return !filter || filter.has(tk); }).length;
                    masterCb.checked = checkedCount === langTransKeys.length;
                    masterCb.indeterminate = checkedCount > 0 && checkedCount < langTransKeys.length;
                }
                masterCb.addEventListener('change', function () {
                    seedFilterIfNull();
                    langTransKeys.forEach(function (tk) {
                        if (masterCb.checked) filter.add(tk); else filter.delete(tk);
                    });
                    saveTranslatorFilter(filter);
                    group.querySelectorAll('.toc-filter-checkbox[data-trans-key]').forEach(function (cb) {
                        cb.checked = masterCb.checked;
                    });
                    onChange(filter);
                });
                langRow.appendChild(masterCb);
                langRow.appendChild(el('span', 'toc-filter-title', langName(lang)));
                group.appendChild(langRow);

                function makeItem(key) {
                    var transKey = lang + '_' + key;
                    var label = el('label', 'toc-filter-item');
                    var cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.className = 'toc-filter-checkbox';
                    cb.checked = !filter || filter.has(transKey);
                    cb.dataset.transKey = transKey;
                    cb.addEventListener('change', function () {
                        seedFilterIfNull();
                        if (cb.checked) filter.add(transKey); else filter.delete(transKey);
                        saveTranslatorFilter(filter);
                        syncMaster();
                        onChange(filter);
                    });
                    label.appendChild(cb);
                    label.appendChild(document.createTextNode(' ' + translatorLabel(transKey) + ' (' + catalog[lang][key] + ')'));
                    return label;
                }

                keys.slice(0, TOP_N_VISIBLE).forEach(function (key) { group.appendChild(makeItem(key)); });
                if (keys.length > TOP_N_VISIBLE) {
                    var details = document.createElement('details');
                    details.className = 'toc-filter-more';
                    var summary = document.createElement('summary');
                    summary.textContent = uiIsRu() ? 'Ещё' : 'More';
                    details.appendChild(summary);
                    keys.slice(TOP_N_VISIBLE).forEach(function (key) { details.appendChild(makeItem(key)); });
                    group.appendChild(details);
                }
                syncMaster();
                groupsWrap.appendChild(group);
            });
        });
    }

    // --- top level ---

    // The "(N)" count is a separate, muted span — not part of the bold name text (owner: "отдели
    // счётчик от названия чтобы он был серым, отдельным... это к имени не относится"). Kept as a
    // stable node (not rebuilt from a string) so refreshFilterEffects can just update its
    // textContent later without touching the name or, for groups, the tooltip star.

    /* "/toc/mn", "/toc/sn25" — какой узел оглавления открыть. Читается из СОБСТВЕННОГО адреса,
       а не передаётся параметром: initToc() зовут из двух мест (авто-запуск при загрузке файла и
       повторный вызов из search/index.html), и адрес — то единственное, что в обоих случаях уже
       верное. Сюда же приходят бывшие заглушки /mn, /sn25 и т.п. — dg-light.js редиректит их на
       /toc/<id>. */
    // Short spellings people actually type/link for the two Pātimokkha entries (pli-tv-bu-pm /
    // pli-tv-bi-pm) — "pm"/"bipm" match the existing /pm.php and /bipm.php legacy routes
    // (dg-light.js), the rest are the variants owner asked to accept on top of those two.
    var TOC_ALIASES = {
        'pm': 'pli-tv-bu-pm', 'bu-pm': 'pli-tv-bu-pm', 'bupm': 'pli-tv-bu-pm',
        'bi-pm': 'pli-tv-bi-pm', 'bipm': 'pli-tv-bi-pm'
    };

    function targetFromPath() {
        var m = window.location.pathname.match(/^\/toc\/(.+?)\/?$/);
        if (!m) return null;
        var raw = decodeURIComponent(m[1]).toLowerCase();
        return TOC_ALIASES[raw] || raw;
    }

    // Open every collapsed branch on the way down to `node` (including its own children when it is
    // itself a branch) by clicking the SAME headers a person would — no second copy of the
    // toggle's open/close state logic (the "+/−" glyph, aria-expanded) living here.
    function openAncestors(bodyEl, node) {
        var chain = [];
        for (var p = node; p && p !== bodyEl; p = p.parentNode) {
            if (p.classList && p.classList.contains('toc-branch')) chain.push(p);
        }
        chain.reverse().forEach(function (li) {
            var kids = li.querySelector('.toc-children'); // its own child list — first in doc order
            if (kids && kids.classList.contains('d-none')) li.querySelector('.toc-branch-header').click();
        });
    }

    // Book that owns `target`: the LONGEST matching code, so "snp1.1" resolves to snp, not sn, and
    // "pli-tv-bu-vb-pj1" to pli-tv-bu-vb, not pli-tv-bu-pm. After the code, the rest must start
    // with a digit or "-" — otherwise "sn" would swallow "snp" all the same.
    function bookEntryFor(bookEntries, target) {
        var best = null;
        bookEntries.forEach(function (b) {
            var rest = target.indexOf(b.code) === 0 ? target.slice(b.code.length) : null;
            if (rest === null || (rest !== '' && !/^[\d-]/.test(rest))) return;
            if (!best || b.code.length > best.code.length) best = b;
        });
        return best;
    }

    // Twice, ~half a second apart: the page is still settling when a target opens (the home hero
    // collapses into TOC state on its own transition, ~140px above the tree), so a single scroll
    // lands that much too far down. The repeat is a no-op once nothing moved.
    function scrollTo(elem) {
        elem.scrollIntoView({ block: 'start', behavior: 'smooth' });
        setTimeout(function () { elem.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 500);
    }

    function revealTarget(target, bookEntries, groupEntries, langs, filter) {
        // A whole category ("dhamma", "vinaya", "abhi") — /toc/dhamma, /toc/vinaya replace legacy
        // read.php#dhamma/#vinaya (menu-links.json, "Dhamma.gift Сутты"/"Патимоккха"): just scroll
        // to the section header, everything under it is already rendered (categories aren't lazy).
        var catEl = document.getElementById('toc-category-' + target);
        if (catEl) { scrollTo(catEl); return; }
        // A whole collection ("kn") — its row holds book headers only, nothing to fetch.
        var group = groupEntries.filter(function (g) { return g.group.code === target; })[0];
        if (group) {
            group.bodyEl.classList.remove('d-none');
            scrollTo(group.groupEl);
            return;
        }
        var entry = bookEntryFor(bookEntries, target);
        if (!entry) return;
        // A book INSIDE a collection ("dhp" under "kn") sits in that collection's collapsed body —
        // open it first, or the row we are about to scroll to is display:none.
        groupEntries.forEach(function (g) {
            if (g.codes.indexOf(entry.code) !== -1) g.bodyEl.classList.remove('d-none');
        });
        if (!entry.bodyEl) { scrollTo(entry.bookEl); return; } // single-page book — the row IS the link
        if (entry.singlePage) { entry.headerEl.click(); scrollTo(entry.bookEl); return; } // patimokkha
        entry.bodyEl.classList.remove('d-none');
        var loaded = entry.bodyEl.dataset.loaded
            ? Promise.resolve()
            : renderBookTree(entry.bodyEl, entry.code, langs, filter);
        entry.bodyEl.dataset.loaded = 'tree';
        // Scrolling waits for the tree: the fetched subtree is taller than the whole viewport, so
        // scrolling to the header first and inserting the tree after it leaves the header far above.
        loaded.then(function () {
            var node = target === entry.code
                ? null
                : entry.bodyEl.querySelector('[data-toc-node="' + target.replace(/"/g, '\\"') + '"]');
            if (node) openAncestors(entry.bodyEl, node);
            // Всё, что НИЖЕ цели, раскрываем целиком (owner: "MN — значит развернуть всю никаю,
            // sn56 — значит все вагги"): пришли по прямому адресу раздела, а не листаем дерево
            // руками, так что промежуточные "+" здесь только мешают. Дерево книги уже отрисовано
            // целиком (buildTreeChildren), expandAll лишь снимает d-none — лишних запросов нет.
            expandAll(node || entry.bodyEl);
            scrollTo(node || entry.bookEl);
        });
    }

    function renderTopLevel() {
        container.innerHTML = '';
        container.appendChild(el('div', 'toc-loading', uiIsRu() ? 'Загрузка…' : 'Loading…'));

        var langs = readReadingLangs();
        var filter = readTranslatorFilter();
        var target = targetFromPath();
        ensureTranslatorPriority(); // warm the cache — leaf badges (sortRest) need it too, not just the filter panel

        fetchTopLevel().then(function (data) {
            container.innerHTML = '';

            var layout = el('div', 'toc-layout');
            var main = el('div', 'toc-main');
            var aside = el('div', 'toc-aside');
            layout.appendChild(main);
            layout.appendChild(aside);
            container.appendChild(layout);

            var asideOpen = readAsideOpenPref();
            var asideToggle = el('button', 'toc-aside-title toc-aside-toggle');
            asideToggle.type = 'button';
            var asideToggleIcon = el('span', 'toc-toggle', asideOpen ? '−' : '+');
            asideToggle.appendChild(asideToggleIcon);
            asideToggle.appendChild(document.createTextNode(' ' + (uiIsRu() ? 'Фильтр переводчиков' : 'Translator filter')));
            aside.appendChild(asideToggle);
            var asideBody = el('div', 'toc-aside-body');
            asideBody.classList.toggle('d-none', !asideOpen);
            aside.appendChild(asideBody);
            asideToggle.addEventListener('click', function () {
                asideOpen = !asideOpen;
                saveAsideOpenPref(asideOpen);
                asideBody.classList.toggle('d-none', !asideOpen);
                asideToggleIcon.textContent = asideOpen ? '−' : '+';
            });

            // Filter is a silent, persistent localStorage setting — without this, unchecking a
            // few boxes while exploring quietly narrows the WHOLE tree on every future visit with
            // no visible cause (owner: got confused when Sujato/Russian just stopped appearing).
            var resetRow = el('div', 'toc-filter-reset d-none');
            var resetLink = el('a', null, uiIsRu() ? 'Фильтр активен — сбросить' : 'Filter active — reset');
            resetLink.href = '#';
            resetRow.appendChild(resetLink);
            asideBody.appendChild(resetRow);
            var filterPanel = el('div', 'toc-filter-panel');
            asideBody.appendChild(filterPanel);

            var bookEntries = []; // { bookEl, bodyEl, headerEl, book, code, singlePage }
            var groupEntries = []; // { headerEl, group, codes }
            var matchedCounts = {}; // code -> matched leaf count under the current filter

            function refreshFilterEffects() {
                resetRow.classList.toggle('d-none', !filter);
                container.querySelectorAll('[data-toc-book-body]').forEach(function (bodyEl) {
                    var code = bodyEl.getAttribute('data-toc-book-body');
                    if (bodyEl.dataset.loaded === 'tree') renderBookTree(bodyEl, code, langs, filter);
                });
                // Real filtering also hides collapsed, not-yet-opened books/categories that have
                // no matching text at all — not just badges inside an already-open book (owner:
                // "нужно чтобы все остальные тексты никаи и тк скрылись"). Coverage is derived
                // from the same per-book endpoint "expand all" already uses, just without
                // building the DOM tree.
                if (!filter) {
                    bookEntries.forEach(function (b) {
                        b.bookEl.classList.remove('d-none');
                        if (b.countEl) b.countEl.textContent = '(' + b.book.count + ')';
                    });
                    groupEntries.forEach(function (g) {
                        g.countEl.textContent = '(' + g.group.count + ')';
                        g.headerEl.closest('.toc-book').classList.remove('d-none');
                    });
                    updateCategoryVisibility();
                    return;
                }
                // Every book's "(N)" switches from its static total to how many of ITS texts
                // actually match — the static number never moved with the filter before (owner:
                // "количество текстов вообще не поменялось... хотя в дигха никае только два
                // перевода, а написано 34"). Group totals (Khuddaka) wait for every member book's
                // count via Promise.all, then sum once, instead of flickering per-book.
                // Only count + existence change here — NOT expand state. A book the user never
                // opened stays closed (just its header count updates, and it disappears if
                // nothing in it matches); a book already open was already re-rendered in place by
                // the loop above, so it keeps whatever the user had expanded inside it too. Owner:
                // "что пользователь развернул, то и остаётся развёрнутым... а то очень
                // непредсказуемое поведение" — auto-opening everything on every filter tweak was
                // exactly that unpredictability, even though it came from an earlier, well-meant
                // request to make the filter's effect obviously visible.
                var pending = bookEntries.map(function (b) {
                    if (b.singlePage) return Promise.resolve();
                    return fetchBook(b.code, langs).then(function (bookData) {
                        var count = matchedLeafCount(bookData, filter);
                        matchedCounts[b.code] = count;
                        b.bookEl.classList.toggle('d-none', count === 0);
                        b.countEl.textContent = '(' + count + ')';
                        updateCategoryVisibility();
                    });
                });
                Promise.all(pending).then(function () {
                    groupEntries.forEach(function (g) {
                        var total = g.codes.reduce(function (sum, code) { return sum + (matchedCounts[code] || 0); }, 0);
                        g.countEl.textContent = '(' + total + ')';
                        g.headerEl.closest('.toc-book').classList.toggle('d-none', total === 0);
                    });
                    updateCategoryVisibility();
                });
            }
            function updateCategoryVisibility() {
                container.querySelectorAll('.toc-category').forEach(function (catEl) {
                    var anyVisible = Array.from(catEl.querySelectorAll('.toc-book')).some(function (b) {
                        return !b.classList.contains('d-none');
                    });
                    catEl.classList.toggle('d-none', !anyVisible);
                });
            }

            function onFilterChange(newFilter) {
                filter = newFilter;
                refreshFilterEffects();
            }
            renderFilterPanel(filterPanel, langs, onFilterChange);
            resetLink.addEventListener('click', function (e) {
                e.preventDefault();
                localStorage.removeItem('dhammaTranslatorFilter');
                filter = null;
                renderFilterPanel(filterPanel, langs, onFilterChange);
                refreshFilterEffects();
            });

            // One book row — used both directly under a category and nested inside a group
            // (Khuddaka Nikāya's own books). Pushes into the shared bookEntries so filter/expand-
            // all logic (which queries by [data-toc-book-body] under the whole container) reaches
            // it regardless of nesting depth.
            // autoExpandFull: KN's sub-books ("для кн по книгам разворачивать сразу", owner) show
            // their whole tree open the moment the book itself is opened — no per-vagga clicking.
            // Only passed true by renderGroupRow below; plain top-level books keep the normal
            // click-through-each-level behavior.
            function renderBookRow(book, parentEl, autoExpandFull) {
                var bookEl = el('div', 'toc-book');
                // Patimokkha (pli-tv-bu-pm/pli-tv-bi-pm) — no per-rule tree to fetch (it's one
                // combined recitation document), but unlike a plain singlePage link it expands
                // INLINE right here (matches prod's read.php, which shows the rule text on the
                // page itself, not the reader) instead of navigating away. Rule links inside the
                // fetched fragment (Vibhaṅga / self pm-anchor) still legitimately open the reader —
                // only this top-level entry point stays in place. See fetchPatimokkhaFragment above.
                var patimokkhaMatch = book.singlePage && book.singlePage.match(/^pli-tv-(bu|bi)-pm$/);
                var patimokkhaSide = patimokkhaMatch ? patimokkhaMatch[1] : null;
                if (book.singlePage && !patimokkhaSide) {
                    var directLink = el('a', 'toc-book-header toc-book-link');
                    directLink.href = '/' + encodeURIComponent(book.singlePage);
                    directLink.appendChild(document.createTextNode(book.label[uiIsRu() ? 'ru' : 'en']));
                    bookEl.appendChild(directLink);
                    parentEl.appendChild(bookEl);
                    bookEntries.push({ bookEl: bookEl, bodyEl: null, headerEl: directLink, countEl: null, book: book, code: book.code, singlePage: book.singlePage });
                    return;
                }
                var bookHeader = el('button', 'toc-book-header');
                bookHeader.type = 'button';
                bookHeader.appendChild(document.createTextNode(book.label[uiIsRu() ? 'ru' : 'en']));
                var countEl = null;
                if (!patimokkhaSide) {
                    bookHeader.appendChild(document.createTextNode(' '));
                    countEl = el('span', 'toc-count', '(' + book.count + ')');
                    bookHeader.appendChild(countEl);
                }
                var bodyEl = el('div', patimokkhaSide ? 'toc-book-body toc-patimokkha-body d-none' : 'toc-book-body d-none');
                bodyEl.setAttribute('data-toc-book-body', book.code);
                bookHeader.addEventListener('click', function () {
                    var willShow = bodyEl.classList.contains('d-none');
                    bodyEl.classList.toggle('d-none', !willShow);
                    if (!willShow || bodyEl.dataset.loaded) return;
                    if (patimokkhaSide) {
                        bodyEl.dataset.loaded = 'fragment';
                        fetchPatimokkhaFragment(patimokkhaSide).then(function (html) {
                            bodyEl.innerHTML = html;
                        }).catch(function () {
                            delete bodyEl.dataset.loaded;
                            bodyEl.textContent = uiIsRu() ? 'Не удалось загрузить текст.' : 'Failed to load text.';
                        });
                    } else {
                        bodyEl.dataset.loaded = 'tree';
                        var loaded = renderBookTree(bodyEl, book.code, langs, filter);
                        if (autoExpandFull) loaded.then(function () { expandAll(bodyEl); });
                    }
                });
                bookEl.appendChild(bookHeader);
                bookEl.appendChild(bodyEl);
                parentEl.appendChild(bookEl);
                // singlePage stays set (not nulled) for patimokkha rows too, even though they now
                // render inline here: the filter-count pass below (bookEntries.map -> if
                // (b.singlePage) skip) still can't fetch a per-rule tree for these, same as before.
                bookEntries.push({ bookEl: bookEl, bodyEl: bodyEl, headerEl: bookHeader, countEl: countEl, book: book, code: book.code, singlePage: book.singlePage || null });
            }

            // One expand-per-book step, shared by every "Expand all" trigger (category-level and,
            // in principle, reusable for a future per-group one) — fetch if not loaded yet, then
            // force every branch open.
            function expandBookRow(book) {
                var patimokkhaSide = book.singlePage && book.singlePage.match(/^pli-tv-(bu|bi)-pm$/);
                if (book.singlePage && !patimokkhaSide) return;
                var bodyEl = container.querySelector('[data-toc-book-body="' + book.code + '"]');
                if (!bodyEl) return;
                bodyEl.classList.remove('d-none');
                if (bodyEl.dataset.loaded) {
                    if (!patimokkhaSide) expandAll(bodyEl);
                    return;
                }
                if (patimokkhaSide) {
                    bodyEl.dataset.loaded = 'fragment';
                    fetchPatimokkhaFragment(patimokkhaSide[1]).then(function (html) {
                        bodyEl.innerHTML = html;
                    }).catch(function () { delete bodyEl.dataset.loaded; });
                    return;
                }
                bodyEl.dataset.loaded = 'tree';
                fetchBook(book.code, langs).then(function (bookData) {
                    bodyEl.innerHTML = '';
                    var ul = buildTreeChildren(bookData.tree, bookData, filter, langs);
                    if (ul) bodyEl.appendChild(ul);
                    expandAll(bodyEl);
                });
            }

            // Khuddaka Nikāya (and any future Nikāya-level group) — a peer of DN/MN/SN/AN, not a
            // flattened list of its member books (owner: "кн это отдельное собрание как дн мн сн
            // ан", matches prod's read.php where Khuddaka is its own collapsible heading). Same
            // big/bold/underlined heading as a book row; its body holds its OWN nested book list,
            // built eagerly (cheap — just headers, no tree fetch) so filter/expand-all reach it
            // even before the user opens it.
            function renderGroupRow(group, parentEl) {
                var visibleSubBooks = group.books.filter(function (b) {
                    return b.tier === 'default' || extraTierUnlocked(group.extraScopeCodes);
                });
                if (!visibleSubBooks.length) return [];

                var groupEl = el('div', 'toc-book toc-group');
                var groupHeader = el('button', 'toc-book-header');
                groupHeader.type = 'button';
                groupHeader.appendChild(document.createTextNode(group.label[uiIsRu() ? 'ru' : 'en']));
                groupHeader.appendChild(document.createTextNode(' '));
                var countEl = el('span', 'toc-count', '(' + group.count + ')');
                groupHeader.appendChild(countEl);
                // Asterisk (prod's own convention for "not the complete collection", settings/
                // index.html ABHI_MARK) — grouped with the count, same muted gray, not part of the
                // name. Tooltip lists exactly which books are currently included, read live off the
                // same visibleSubBooks the row itself renders (i.e. off the search-scope setting),
                // not a hardcoded description — a real Bootstrap tooltip (same pattern as the scope
                // asterisk in search/index.html), not a bare title attribute (owner: "какие
                // включены те и показывает... сделай её bootstrap тултипом а не тайтлом").
                if (group.hasExtra && !extraTierUnlocked(group.extraScopeCodes)) {
                    groupHeader.appendChild(document.createTextNode(' '));
                    var star = document.createElement('span');
                    star.className = 'toc-count toc-count-star';
                    star.textContent = '*';
                    // No "Shown:"/"Показаны:" label — the list speaks for itself (owner: "это же и
                    // так понятно, что это такое"). data-bs-custom-class reuses the SAME themed
                    // tooltip class the scope-info asterisk already defines (search/index.html,
                    // .dg-scope-tooltip — it overrides bootstrap's always-black tooltip vars for
                    // both themes), so this one follows light/dark too instead of bootstrap's
                    // hardcoded black (owner: "покажи на скриншоте тёмная тема, хотя светлая").
                    var names = visibleSubBooks.map(function (b) { return b.label[uiIsRu() ? 'ru' : 'en']; }).join(', ');
                    star.setAttribute('data-bs-toggle', 'tooltip');
                    star.setAttribute('data-bs-placement', 'bottom');
                    star.setAttribute('data-bs-custom-class', 'dg-scope-tooltip');
                    star.setAttribute('data-bs-title', names +
                        (uiIsRu() ? '. Остальные книги Кхуддака-никаи включаются в настройках поиска.' : '. The rest of Khuddaka Nikāya can be enabled in search settings.'));
                    groupHeader.appendChild(star);
                    if (window.bootstrap && window.bootstrap.Tooltip) new window.bootstrap.Tooltip(star);
                }
                var bodyEl = el('div', 'toc-book-body d-none');
                groupHeader.addEventListener('click', function () {
                    bodyEl.classList.toggle('d-none');
                });
                var subBooksEl = el('div', 'toc-books');
                visibleSubBooks.forEach(function (b) { renderBookRow(b, subBooksEl, true); });
                bodyEl.appendChild(subBooksEl);
                groupEl.appendChild(groupHeader);
                groupEl.appendChild(bodyEl);
                parentEl.appendChild(groupEl);
                groupEntries.push({ groupEl: groupEl, bodyEl: bodyEl, headerEl: groupHeader, countEl: countEl, group: group, codes: visibleSubBooks.map(function (b) { return b.code; }) });
                return visibleSubBooks;
            }

            data.categories.forEach(function (cat) {
                var visibleBooks = cat.books.filter(function (book) {
                    return book.tier === 'default' || extraTierUnlocked(cat.extraScopeCodes);
                });
                var groups = cat.groups || [];
                if (!visibleBooks.length && !groups.length) return;

                var catEl = el('div', 'toc-category');
                // "toc-category-" prefix, not the bare code — defensive against a future book/
                // group code ever colliding with "dhamma"/"vinaya"/"abhi" (see revealTarget below,
                // the /toc/dhamma, /toc/vinaya legacy read.php#dhamma/#vinaya replacement).
                catEl.id = 'toc-category-' + cat.category;
                var catHeader = el('div', 'toc-category-header');
                // Chunky square toggle — same affordance prod uses for its one top-level
                // "Dhamma"/collapse-all control (id="collapseAll" in read.php); individual
                // nikāya/vagga headings below stay icon-free, same as prod (the underlined
                // heading text itself is the click target there).
                var expandBtn = el('button', 'toc-expand-all-btn', '+');
                expandBtn.type = 'button';
                expandBtn.title = uiIsRu() ? 'Развернуть всё' : 'Expand all';
                catHeader.appendChild(expandBtn);
                catHeader.appendChild(el('h3', null, cat.label[uiIsRu() ? 'ru' : 'en']));
                catEl.appendChild(catHeader);

                var booksEl = el('div', 'toc-books');
                visibleBooks.forEach(function (book) { renderBookRow(book, booksEl); });
                var expandable = visibleBooks.slice();
                groups.forEach(function (group) {
                    expandable = expandable.concat(renderGroupRow(group, booksEl));
                });
                catEl.appendChild(booksEl);

                // "Expand all" for a category — one parallel fetch per book (each tree file is
                // small, see dg-light.js), not one heavy batch endpoint: see plan's rationale.
                // Reaches into group sub-books too (expandable includes them). Toggles back to a
                // "Collapse all" on a second click — it only ever expanded before (owner: "сейчас
                // можно только развернуть").
                var categoryExpanded = false;
                expandBtn.addEventListener('click', function () {
                    categoryExpanded = !categoryExpanded;
                    expandBtn.textContent = categoryExpanded ? '−' : '+';
                    expandBtn.title = categoryExpanded
                        ? (uiIsRu() ? 'Свернуть всё' : 'Collapse all')
                        : (uiIsRu() ? 'Развернуть всё' : 'Expand all');
                    if (categoryExpanded) {
                        // Scoped to THIS category's booksEl, not the whole container — otherwise
                        // expanding e.g. Vinaya also un-hides Khuddaka's group body (it lives
                        // under Dhamma) since the old selector matched any .toc-group on the page.
                        booksEl.querySelectorAll('.toc-group .toc-book-body').forEach(function (b) { b.classList.remove('d-none'); });
                        expandable.forEach(expandBookRow);
                    } else {
                        booksEl.querySelectorAll('.toc-book-body').forEach(function (b) { b.classList.add('d-none'); });
                    }
                });

                main.appendChild(catEl);
            });

            if (filter) refreshFilterEffects();
            if (target) revealTarget(target, bookEntries, groupEntries, langs, filter);
        }).catch(function (e) {
            container.innerHTML = '';
            container.appendChild(el('div', 'toc-error', (uiIsRu() ? 'Не удалось загрузить оглавление: ' : 'Failed to load TOC: ') + e.message));
        });
    }

    // Every leaf/translator link in the tree is a plain same-origin <a href="/sn1.1?...">, so a
    // single delegated listener on the (persistent) container catches them all, even ones
    // rendered lazily later — reuses the SPA's own dgNavigateInternal (search/index.html) instead
    // of a full page reload (owner: "нужно чтобы ссылки открывались без перезагрузки"). Reset-
    // filter link ("#") and the tooltip's own trigger aren't real navigation, skip those.
    // Same-origin check duplicated from dgNavigateInternal (not just calling it and checking the
    // return value) — we need to know BEFORE deciding whether to animate/delay, not after.
    function onContainerClick(e) {
        var a = e.target.closest('a');
        if (!a) return;
        var href = a.getAttribute('href');
        if (!href || href.charAt(0) === '#') return;
        if (typeof window.dgNavigateInternal !== 'function') return;
        var u;
        try { u = new URL(href, window.location.origin); } catch (err) { return; }
        if (u.origin !== window.location.origin) return;
        e.preventDefault();

        // Owner: "toc и фильтр переводчиков разлетались в свои стороны, в центре — сутта в
        // ридер-режиме". #reader-pane's own "grow from center" entrance lives in home.css
        // (dg-reader-enter) — triggered automatically once dgSetState('reader') below actually
        // flips the state. Play the exit first: dgSetState('reader') sets #toc-pane to
        // display:none immediately, which would otherwise cut this transition off mid-flight.
        var layout = container.querySelector('.toc-layout');
        if (layout && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
            layout.classList.add('dg-toc-leaving');
            setTimeout(function () { window.dgNavigateInternal(href); }, 280);
        } else {
            window.dgNavigateInternal(href);
        }
    }

    window.initToc = function () {
        container = document.getElementById('toc-pane');
        if (!container) return;
        container.addEventListener('click', onContainerClick);
        renderTopLevel();
    };

    if (!window.TOC_MANUAL_INIT) window.initToc();
})();
