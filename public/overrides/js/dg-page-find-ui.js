// === Файл: /assets/js/dg-page-find-ui.js ===
//
// UI layer for dg-page-find.js (the vendored search-on-page ENGINE — see ВНЕДРЕНИЕ.md in the
// design export this was built from, docs/Поиск текста для dhamma.gift.zip). That file is only
// the engine (match collection, normalization, highlighting via Range.surroundContents,
// navigation) — it deliberately draws no UI. This file is the panel the spec describes: mobile
// two-row / desktop floating, settings toggles, a match list with copy-link chips.
//
// Reuses existing visual language exactly as the spec asks (no new colors/fonts): --dg-* tokens,
// .dg-icon-btn, .dg-toggle-row/.dg-tgl (home.js's own settings-sheet toggle), .toc-item (the TOC
// row style), --dg-ease. Falls back to sane literal values where a page (e.g. /settings/) never
// defines the --dg-* custom properties at all.
//
// Containers fed to the engine follow the site's current screen (body.dg-state-*): the reader's
// #sutta + the mini TOC panel, the /toc SPA page's own #toc-pane, or just document.body
// elsewhere (home, /settings/, anywhere without a more specific container) — always plus
// #dg-drawer, since the burger menu is global. Recomputed on every open, not cached, since the
// active screen can change while the panel is closed.
(function () {
    'use strict';

    if (window.DgPageFindUI) return;

    // ---------------------------------------------------------------
    // Brahmic-script transliteration (Devanagari/Thai/Sinhala/Myanmar/Khmer/...) — the engine
    // only knows plain-text normalization, it has no notion of scripts. Same Aksharamukha
    // endpoint paliLookup.js already uses for word-click lookups. Deliberately NOT "any
    // non-Latin": Cyrillic is a normal, first-class search language here (Russian translations).
    // ---------------------------------------------------------------
    var PALI_SCRIPT_RE = /[ऀ-෿฀-࿿က-႟ក-៿]/;
    var transliterateCache = Object.create(null);
    function transliterate(text) {
        if (Object.prototype.hasOwnProperty.call(transliterateCache, text)) {
            return Promise.resolve(transliterateCache[text]);
        }
        return fetch('/api/transliterate?text=' + encodeURIComponent(text))
            .then(function (r) { return r.ok ? r.json() : { text: text, converted: false }; })
            .then(function (data) {
                var result = data && data.converted ? data.text : text;
                transliterateCache[text] = result;
                return result;
            })
            .catch(function () { return text; });
    }

    // ---------------------------------------------------------------
    // Styles
    // ---------------------------------------------------------------
    var style = document.createElement('style');
    style.textContent =
        'mark.dg-find-mark{background:rgba(255,214,0,.55);color:inherit;padding:0;}' +
        'mark.dg-find-mark.is-active{background:rgba(255,122,0,.9);color:#111;}' +
        '.dg-find-panel{position:fixed;z-index:1097;top:8px;left:8px;right:8px;' +
        'background:var(--dg-surface,#fff);color:var(--dg-text,#1b1d19);' +
        'border:1px solid var(--dg-border-strong,#d7d4c9);border-radius:var(--dg-radius,10px);' +
        'box-shadow:0 12px 32px rgba(27,29,25,.14);font-family:var(--dg-font,system-ui,sans-serif);' +
        'padding:8px;}' +
        'body.dark .dg-find-panel,[data-theme="dark"] .dg-find-panel{box-shadow:0 12px 32px rgba(0,0,0,.55);}' +
        '.dg-find-field{display:flex;align-items:center;gap:8px;height:52px;padding:0 12px;' +
        'border-radius:26px;background:var(--dg-surface-hover,#f5f4f1);' +
        'border:1px solid var(--dg-border-strong,#d7d4c9);}' +
        '.dg-find-field input{flex:1;min-width:0;border:0;background:transparent;color:inherit;' +
        'font:inherit;font-size:17px;outline:none;}' +
        // input type="search" ships its OWN native clear-× in WebKit/Blink (::-webkit-search-
        // cancel-button) — right next to our custom clearBtn, reading as two X's for the same
        // job (owner: "все ещё два крестика"). One clear affordance, ours (it also refocuses
        // the field and re-runs the empty-query reset, not just wiping the text).
        '.dg-find-field input::-webkit-search-cancel-button,' +
        '.dg-find-field input::-webkit-search-decoration{-webkit-appearance:none;appearance:none;}' +
        '.dg-find-count{color:var(--dg-text-muted,#6e716a);font-variant-numeric:tabular-nums;' +
        'font-size:.85rem;white-space:nowrap;}' +
        '.dg-find-toolbar{display:flex;align-items:center;gap:6px;margin-top:8px;}' +
        '.dg-find-toolbar .dg-find-spacer{flex:1;}' +
        '.dg-find-panel .dg-icon-btn{width:48px;height:48px;display:flex;align-items:center;' +
        'justify-content:center;border-radius:50%;border:1px solid transparent;background:transparent;' +
        'color:inherit;cursor:pointer;}' +
        '.dg-find-panel .dg-icon-btn:hover{background:var(--dg-surface-hover,#f5f4f1);}' +
        '.dg-find-panel .dg-icon-btn[aria-pressed="true"]{background:var(--dg-accent-bg,#dff3ec);' +
        'color:var(--dg-accent-ink,#0f7c63);}' +
        '.dg-find-panel .dg-icon-btn img{width:18px;height:18px;}' +
        '.dg-find-panel .dg-find-glyph-btn{font-size:18px;line-height:1;}' +
        '.dg-find-panel .dg-icon-btn.dg-find-next img{transform:rotate(180deg);}' +
        'body.dark .dg-find-panel .dg-icon-btn img,[data-theme="dark"] .dg-find-panel .dg-icon-btn img{filter:invert(1);}' +
        '.dg-find-clear{border:0;background:transparent;color:var(--dg-text-muted,#6e716a);' +
        'width:24px;height:24px;cursor:pointer;font-size:16px;line-height:1;flex:none;}' +
        '.dg-find-settings,.dg-find-list{display:none;margin-top:8px;border-top:1px solid var(--dg-border,#e7e5de);' +
        'padding-top:4px;max-height:50vh;overflow-y:auto;}' +
        '.dg-find-settings.show,.dg-find-list.show{display:block;}' +
        '.dg-find-list-head{padding:6px 4px;color:var(--dg-text-muted,#6e716a);font-size:.78rem;}' +
        '.dg-find-list .toc-item{display:flex;align-items:baseline;gap:8px;justify-content:space-between;}' +
        '.dg-find-list .dg-find-row-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;' +
        'white-space:nowrap;}' +
        '.dg-find-list .dg-find-row-text b{font-weight:700;}' +
        '.dg-find-list .dg-find-hidden-tag{font-size:.7rem;color:var(--dg-text-muted,#6e716a);' +
        'border:1px solid var(--dg-border-strong,#d7d4c9);border-radius:8px;padding:0 6px;flex:none;}' +
        '.dg-find-list .dg-find-chip{flex:none;font-size:.72rem;color:var(--dg-text-muted,#6e716a);' +
        'border:1px solid var(--dg-border,#e7e5de);border-radius:8px;padding:1px 6px;cursor:pointer;' +
        'font-variant-numeric:tabular-nums;}' +
        '.dg-find-list .dg-find-chip:hover{background:var(--dg-surface-hover,#f5f4f1);}' +
        '.dg-find-empty{padding:10px 4px;color:var(--dg-text-muted,#6e716a);font-size:.85rem;}' +
        '@media (min-width:768px){' +
        // ВНЕДРЕНИЕ.md specifies position:absolute here ("плавающая" panel near the text column's
        // top edge) — changed to fixed: goTo()/next()/prev() scroll the WHOLE PAGE to bring a
        // match into view (dg-page-find.js's own _applyActive, not something this file controls),
        // and an absolute-positioned panel scrolls away with that content — the panel a find-next
        // tool needs to stay reachable disappears the moment you jump to a match below the fold.
        '.dg-find-panel{position:fixed;top:24px;right:60px;left:auto;width:520px;}' +
        '.dg-find-field{height:44px;}' +
        '.dg-find-panel .dg-icon-btn{width:40px;height:40px;}' +
        '}';
    document.head.appendChild(style);

    // ---------------------------------------------------------------
    // Panel DOM (built once)
    // ---------------------------------------------------------------
    var panel = document.createElement('div');
    panel.className = 'dg-find-panel';
    panel.hidden = true;

    function iconBtn(svgSrc, title, extraClass) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'dg-icon-btn' + (extraClass ? ' ' + extraClass : '');
        b.title = title;
        b.setAttribute('aria-label', title);
        var img = document.createElement('img');
        img.src = svgSrc;
        img.alt = '';
        b.appendChild(img);
        return b;
    }

    // /assets/svg/xmark.svg is hardcoded fill="#fff" (built for use on a dark surface elsewhere
    // on the site) — invisible on this panel's light background, and inverting it back for light
    // mode would then need a second invert to undo in dark mode. A plain glyph sidesteps the
    // color mismatch entirely: color:inherit already matches the panel's text color in both
    // themes, same as every other text in it.
    function glyphBtn(glyph, title, extraClass) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'dg-icon-btn dg-find-glyph-btn' + (extraClass ? ' ' + extraClass : '');
        b.title = title;
        b.setAttribute('aria-label', title);
        b.textContent = glyph;
        return b;
    }

    var field = document.createElement('div');
    field.className = 'dg-find-field';
    var input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Find on page…';
    input.setAttribute('aria-label', 'Find on page');
    var count = document.createElement('span');
    count.className = 'dg-find-count';
    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'dg-find-clear';
    clearBtn.title = 'Clear';
    // Owner: two identical ✕ glyphs (this one clears the text, the toolbar's closes the whole
    // panel) read as a duplicate/glitch even a row apart — lighter "×" (multiplication sign,
    // the conventional inline-clear glyph) instead of the toolbar's heavier "✕" tells them apart
    // regardless of position.
    clearBtn.textContent = '×';
    field.appendChild(input);
    field.appendChild(count);
    field.appendChild(clearBtn);

    var toolbar = document.createElement('div');
    toolbar.className = 'dg-find-toolbar';
    var settingsBtn = iconBtn('/assets/svg/gear.svg', 'Options');
    var listBtn = iconBtn('/assets/svg/list-ul-solid-full.svg', 'Matches');
    var spacer = document.createElement('span');
    spacer.className = 'dg-find-spacer';
    var prevBtn = iconBtn('/assets/svg/arrow-up-dark.svg', 'Previous (Shift+Enter)', 'dg-find-prev');
    var nextBtn = iconBtn('/assets/svg/arrow-up-dark.svg', 'Next (Enter)', 'dg-find-next');
    var closeBtn = glyphBtn('✕', 'Close (Esc)');
    toolbar.appendChild(settingsBtn);
    toolbar.appendChild(listBtn);
    toolbar.appendChild(spacer);
    toolbar.appendChild(prevBtn);
    toolbar.appendChild(nextBtn);
    toolbar.appendChild(closeBtn);

    var settingsPanel = document.createElement('div');
    settingsPanel.className = 'dg-find-settings';
    var listPanel = document.createElement('div');
    listPanel.className = 'dg-find-list';

    panel.appendChild(field);
    panel.appendChild(toolbar);
    panel.appendChild(settingsPanel);
    panel.appendChild(listPanel);
    function mount() { if (!panel.isConnected && document.body) document.body.appendChild(panel); }
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

    // ---------------------------------------------------------------
    // Settings toggles — same DOM shape as home.js's own toggleRow() (not exported from that
    // closure, so replicated here rather than reached into; it is a trivial ~8-line pattern).
    // ---------------------------------------------------------------
    var OPTION_LABELS = window.DGPageFind.OPTION_LABELS;
    var OPTION_KEYS = ['wholeWord', 'ignorePunct', 'ignoreDiacritics', 'ignoreDoubles'];
    // Mirrors dg-page-find.js's own (unexported) DEFAULTS — only used to draw the toggle's
    // initial position before a saved preference exists; the engine itself re-applies its real
    // DEFAULTS internally regardless (Object.assign({}, DEFAULTS, opts.options)).
    var OPTION_DEFAULTS = { wholeWord: false, ignorePunct: true, ignoreDiacritics: true, ignoreDoubles: true };
    var STORE_PREFIX = 'dgPageFind.';
    function loadOptions() {
        var opts = {};
        OPTION_KEYS.forEach(function (k) {
            var raw = localStorage.getItem(STORE_PREFIX + k);
            if (raw !== null) opts[k] = raw === '1';
        });
        return opts;
    }
    function saveOption(key, value) {
        try { localStorage.setItem(STORE_PREFIX + key, value ? '1' : '0'); } catch (e) { /* private mode */ }
    }
    function buildSettingsRow(key, on, onChange) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'dg-toggle-row';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.innerHTML = '<span class="dg-toggle-label">' + (OPTION_LABELS[key] || key) + '</span>' +
            '<span class="dg-tgl" aria-hidden="true"></span>';
        b.addEventListener('click', function () {
            var next = b.getAttribute('aria-pressed') !== 'true';
            b.setAttribute('aria-pressed', next ? 'true' : 'false');
            onChange(next);
        });
        return b;
    }

    // ---------------------------------------------------------------
    // Containers — follows the current screen (body.dg-state-*). #dg-drawer is global (the
    // burger menu exists on every screen); the main-content container is whichever of these
    // actually exists here, falling back to document.body so the panel still works on pages
    // with none of them (owner: "нужно чтобы работало на всем сайте. на любой странице").
    // ---------------------------------------------------------------
    function drawerContainer() {
        var drawer = document.getElementById('dg-drawer');
        if (!drawer) return null;
        return {
            el: drawer,
            label: 'in menu',
            hidden: function () { return !drawer.classList.contains('show'); },
            reveal: function () { if (window.DgHome && window.DgHome.openDrawer) window.DgHome.openDrawer(); }
        };
    }
    function tocMiniContainer() {
        var el = document.getElementById('smart-toc-panel');
        if (!el) return null;
        return {
            el: el,
            label: 'in outline',
            hidden: function () { return !el.classList.contains('show'); },
            reveal: function () {
                var btn = document.getElementById('smart-toc-btn');
                if (btn && !el.classList.contains('show')) btn.click();
            }
        };
    }
    function buildContainers() {
        var list = [];
        var body = document.body;
        if (body.classList.contains('dg-state-reader')) {
            var sutta = document.getElementById('sutta');
            if (sutta) list.push({ el: sutta });
            var mini = tocMiniContainer();
            if (mini) list.push(mini);
        } else if (body.classList.contains('dg-state-toc')) {
            var tocPane = document.getElementById('toc-pane');
            list.push({ el: tocPane || body });
        } else if (body.classList.contains('dg-state-results')) {
            var searchPane = document.getElementById('search-pane');
            list.push({ el: searchPane || body });
        } else {
            list.push({ el: body });
        }
        var drawer = drawerContainer();
        if (drawer) list.push(drawer);
        return list;
    }

    // ---------------------------------------------------------------
    // Engine instance — containers rebuilt on every open (see buildContainers), so a fresh
    // DGPageFind is created per-open rather than long-lived; cheap (no state worth keeping
    // across screens, and the previous instance's marks are already cleared by closePanel()).
    // ---------------------------------------------------------------
    var find = null;

    function renderList() {
        listPanel.innerHTML = '';
        if (!find || !find.matches.length) {
            listPanel.appendChild(Object.assign(document.createElement('p'), {
                className: 'dg-find-empty', textContent: 'No matches'
            }));
            return;
        }
        var head = document.createElement('div');
        head.className = 'dg-find-list-head';
        var hiddenCount = find.matches.filter(function (m) { return m.hidden; }).length;
        head.textContent = find.matches.length + ' matches' + (hiddenCount ? ' · ' + hiddenCount + ' in hidden areas' : '');
        listPanel.appendChild(head);
        var ul = document.createElement('ul');
        ul.style.listStyle = 'none';
        ul.style.margin = '0';
        ul.style.padding = '0';
        find.matches.forEach(function (m, i) {
            var li = document.createElement('li');
            var row = document.createElement('div');
            row.className = 'toc-item' + (i === find.active ? ' active' : '');
            var text = document.createElement('span');
            text.className = 'dg-find-row-text';
            text.innerHTML = escapeHtml(m.before) + '<b>' + escapeHtml(m.hit) + '</b>' + escapeHtml(m.after);
            row.appendChild(text);
            if (m.hidden) {
                var tag = document.createElement('span');
                tag.className = 'dg-find-hidden-tag';
                tag.textContent = m.label || 'hidden';
                row.appendChild(tag);
            }
            if (m.id) {
                var chip = document.createElement('span');
                chip.className = 'dg-find-chip';
                chip.textContent = m.id;
                chip.title = 'Copy link';
                chip.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var url = find.linkTo(i);
                    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () {});
                    var prev = chip.textContent;
                    chip.textContent = 'copied';
                    setTimeout(function () { chip.textContent = prev; }, 1200);
                });
                row.appendChild(chip);
            }
            row.addEventListener('click', function () { find.goTo(i); });
            li.appendChild(row);
            ul.appendChild(li);
        });
        listPanel.appendChild(ul);
    }
    function escapeHtml(s) {
        return String(s || '').replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
    }

    function renderCount() {
        if (!find || !find.matches.length) {
            count.textContent = input.value.trim() ? '0/0' : '';
            return;
        }
        count.textContent = (find.active + 1) + '/' + find.matches.length;
    }

    function runQuery(rawQuery) {
        var q = rawQuery.trim();
        if (!q) { if (find) find.setQuery(''); renderCount(); renderList(); return; }
        var pending = PALI_SCRIPT_RE.test(q) ? transliterate(q) : Promise.resolve(q);
        pending.then(function (term) {
            if (input.value.trim() !== q) return; // superseded by a newer keystroke
            find.setQuery(term);
        });
    }

    var debounceTimer = null;
    input.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () { runQuery(input.value); }, 150);
    });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (find) e.shiftKey ? find.prev() : find.next();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closePanel();
        }
    });
    clearBtn.addEventListener('click', function () {
        input.value = '';
        input.focus();
        runQuery('');
    });
    prevBtn.addEventListener('click', function () { if (find) find.prev(); });
    nextBtn.addEventListener('click', function () { if (find) find.next(); });
    closeBtn.addEventListener('click', closePanel);
    settingsBtn.addEventListener('click', function () {
        var show = !settingsPanel.classList.contains('show');
        settingsPanel.classList.toggle('show', show);
        settingsBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
        listPanel.classList.remove('show');
        listBtn.setAttribute('aria-pressed', 'false');
    });
    listBtn.addEventListener('click', function () {
        var show = !listPanel.classList.contains('show');
        listPanel.classList.toggle('show', show);
        listBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
        settingsPanel.classList.remove('show');
        settingsBtn.setAttribute('aria-pressed', 'false');
    });

    function openPanel() {
        mount();
        if (find) find.destroy();
        settingsPanel.innerHTML = '';
        var saved = loadOptions();
        OPTION_KEYS.forEach(function (key) {
            var row = buildSettingsRow(key, saved[key] !== undefined ? saved[key] : OPTION_DEFAULTS[key], function (next) {
                saveOption(key, next);
                find.setOption(key, next);
            });
            settingsPanel.appendChild(row);
        });
        find = new window.DGPageFind({
            containers: buildContainers(),
            options: saved,
            onUpdate: function () { renderCount(); renderList(); }
        });
        // Owner: seed from the site's own search box (#paliauto) when the find field is
        // otherwise empty — likely the same word they'd have searched for, just on this page
        // instead of site-wide. Never overwrites a query already sitting in the find field
        // (e.g. reopening after Esc mid-search).
        if (!input.value) {
            var siteSearch = document.getElementById('paliauto');
            if (siteSearch && siteSearch.value) input.value = siteSearch.value;
        }
        panel.hidden = false;
        input.focus();
        input.select();
        if (input.value) runQuery(input.value);
    }
    function closePanel() {
        panel.hidden = true;
        settingsPanel.classList.remove('show');
        listPanel.classList.remove('show');
        if (find) { find.destroy(); find = null; }
    }

    // ---------------------------------------------------------------
    // Ctrl/Cmd+Shift+F — NOT plain Ctrl/Cmd+F: real desktop Chrome reserves that one as a
    // browser-chrome shortcut and never lets page JS see/preventDefault it (verified live:
    // opens Chrome's own find bar instead). +Shift is free. Burger-drawer entry ("Найти на
    // странице", search/index.html ".dg-find-open") is the touch-device entry point — no
    // keyboard involved there.
    // Alt+Shift+F — second binding, same action (owner: Ctrl/Cmd+Shift+F didn't register for
    // them at all — likely an external-keyboard-on-Android thing, that combo is exactly the
    // kind OS/IME layers like to eat before it reaches the page; couldn't reproduce it here,
    // desktop Chrome and the served prod file both fire fine). Alt+F is already taken
    // (favorites, settings.js) so this is Alt+SHIFT+F specifically, not a swap.
    // ---------------------------------------------------------------
    document.addEventListener('keydown', function (e) {
        var isCtrlShiftF = (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === 'f' || e.key === 'F');
        var isAltShiftF = e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 'f' || e.key === 'F' || e.code === 'KeyF');
        if (isCtrlShiftF || isAltShiftF) {
            e.preventDefault();
            openPanel();
        }
    });
    document.addEventListener('click', function (e) {
        var link = e.target.closest('.dg-find-open');
        if (!link) return;
        e.preventDefault();
        if (window.DgHome && window.DgHome.closeDrawer) window.DgHome.closeDrawer();
        openPanel();
    });

    window.DgPageFindUI = { open: openPanel, close: closePanel };
})();
