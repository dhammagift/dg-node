// Fills in the "Offline library" / "Offline docs" rows that settings/index.html (this site's own
// settings page, "Данные"/"Data" section) carries — the same two rows the Android app's
// build-assets.js injectOfflineLibraryRow() stamps into its generated copy of that page. Adapted
// from dg-app-full/src/offline-library-settings.js.
//
// This is a separate page from the main search/reader page, so the download worker and the SQLite
// database are not loaded here at all — and the database cannot be inspected from this realm
// either: it lives in OPFS behind the SAH pool, which is single-writer, so installing the VFS a
// second time to count files would fight the page that actually uses it. The main page therefore
// leaves what these rows need in localStorage, which both pages share, and this script only reads
// that state and writes back a small "intent" flag. Nothing is downloaded from here.
//
// What differs from the app copy, and why:
//   * The app has no separate "first download" intent: app.js runs loadData() on every load of its
//     home page and downloads whatever is missing, so navigating to '/' is enough. The site's main
//     page starts nothing on a plain visit, so a first download must be requested explicitly —
//     that is what the new `dg.offline.wantData` = '1' key is for. Without it, "Download now"
//     would just show the site and never fetch anything.
//   * `dg.offline.wantUpdate` = '1' keeps its app meaning: update / re-download of an already
//     present library.
//   * `dg.offline.state` is written by the main page and only ever read here.
//   * The app's markup hardcodes English row text and this script relabels it. This page's own
//     convention (see the neighbouring rows) is Russian defaults in the markup with applyLang()
//     translating them, so the defaults in settings/index.html are Russian and the relabeling is
//     done below, keeping the same ids (dgOfflineLib*) the script looks up.
(function () {
    var isRu = (localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en') === 'ru';
    var STATE_KEY = 'dg.offline.state';            // read-only here, written by the main page
    var WANT_DATA_KEY = 'dg.offline.wantData';     // '1' -> a FIRST download was requested
    var WANT_UPDATE_KEY = 'dg.offline.wantUpdate'; // '1' -> an update / re-download was requested

    function readState() {
        try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); }
        catch (e) { return null; }
    }
    function mb(bytes) { return Math.round(bytes / 1048576); }

    // "Build d0789015510b324e" told a reader nothing (owner). What they want to know is how fresh
    // the data is: the day the database was BUILT, not the day it was downloaded. The hash stays as
    // the fallback for a library opened before built_at was remembered.
    function fmtDate(iso) {
        var d = iso ? new Date(iso) : null;
        if (!d || isNaN(d)) return '';
        // dd-mm-yyyy: the day is only approximate (the build date may be a rebuild's), so a numeric form fits.
        return ('0' + d.getDate()).slice(-2) + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + d.getFullYear();
    }
    function baseLabel(st) {
        var day = fmtDate(st.built_at);
        if (day) return (isRu ? 'база от ' : 'database of ') + day;
        return (isRu ? 'сборка ' : 'build ') + (st.build_id || '?');
    }

    // The installed library's size, for the row. The database itself cannot be measured from here
    // (single-writer OPFS pool — see the header), but the published manifest states it, and asking
    // for it costs a few hundred bytes on a page the reader had to open on purpose. TODO.js listed
    // "размер базы в строке настроек" as the missing half of this row.
    function withManifestSize(callback) {
        var base = (window.dgPlatform && window.dgPlatform.distBase) || window.DG_DIST_BASE || '/mobile-data';
        fetch(String(base).replace(/\/$/, '') + '/db-manifest.json', { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (m) { callback(m && m.bytes ? m.bytes : null, (m && m.bytes_gz) || null); })
            .catch(function () { callback(null); });   // offline: the row still says what it knows
    }

    var titleEl = document.getElementById('dgOfflineLibTitle');
    var descEl = document.getElementById('dgOfflineLibDesc');
    var btnEl = document.getElementById('dgOfflineLibBtn');
    var deleteEl = document.getElementById('dgOfflineLibDelete');
    if (!titleEl || !descEl || !btnEl) return; // rows weren't added — fail soft, not fatal

    titleEl.textContent = isRu ? 'Офлайн-библиотека' : 'Offline library';

    var state = readState();
    var update = state && state.update;

    // OPFS — and the service worker with it — exist only in a SECURE CONTEXT. Served over plain
    // HTTP (how the test host is reachable today) the button looks perfectly fine, writes the
    // intent, navigates, and then dies inside the worker with "Missing required OPFS APIs": the
    // exact dead end this row exists to prevent, and one nobody can diagnose from the interface.
    // So the row says what is actually wrong, before anything is clicked.
    var secure = !!window.isSecureContext && !!navigator.storage &&
                 typeof navigator.storage.getDirectory === 'function';

    // Every button below only records the intent and then navigates to the main page: that page
    // owns the worker, the SQLite database and the consent dialog, so the download itself belongs
    // there — this page cannot touch any of it (see the header).
    function goHomeWith(key) {
        try { localStorage.setItem(key, '1'); } catch (e) { /* ignore */ }
        // Inside the settings SHEET (search/js/home.js's #dg-settings-sheet iframe) navigating this
        // frame to "/" loads the whole home page INSIDE the sheet: a second app.js, a second
        // downloader, a second progress card — with the sheet still covering the first one. The page
        // that owns the sheet is asked instead (same idea as the back arrow's dgSettingsSheetClose):
        // it collapses the sheet, and public/offline/app.js — which is already running up there —
        // starts the download.
        if (window.self !== window.top) {
            try {
                window.parent.postMessage(
                    { dgOfflineDownloadRequest: key === WANT_UPDATE_KEY ? 'update' : 'open' },
                    location.origin);
                return;
            } catch (e) { /* cross-origin parent — fall back to navigating this frame */ }
        }
        location.href = '/';
    }

    if (!secure) {
        descEl.textContent = isRu
            ? 'Недоступно по HTTP: браузер даёт офлайн-хранилище только на HTTPS (или localhost).'
            : 'Not available over HTTP: browsers expose offline storage only on HTTPS (or localhost).';
        btnEl.textContent = isRu ? 'Нужен HTTPS' : 'HTTPS required';
        btnEl.disabled = true;
    } else if (!state || !state.present) {
        descEl.textContent = isRu ? 'Не скачано.' : 'Not downloaded.';
        btnEl.textContent = isRu ? 'Скачать сейчас' : 'Download now';
        if (deleteEl) deleteEl.style.display = 'none';
        // First download — the extra key the app copy does not need (the app downloads
        // unconditionally on its home page, the site does not).
        btnEl.onclick = function () { goHomeWith(WANT_DATA_KEY); };
    } else if (update) {
        descEl.textContent = isRu
            ? ('Скачано (' + baseLabel(state) + '). Доступно обновление' +
               (fmtDate(update.built_at) ? ' от ' + fmtDate(update.built_at) : '') +
               (update.bytes ? ', ' + mb(update.bytes) + ' МБ.' : '.'))
            : ('Downloaded (' + baseLabel(state) + '). An update is available' +
               (fmtDate(update.built_at) ? ' from ' + fmtDate(update.built_at) : '') +
               (update.bytes ? ', ' + mb(update.bytes) + ' MB.' : '.'));
        btnEl.textContent = isRu ? 'Обновить' : 'Update';
        // Deleting must not require installing the update first (owner): the library is on disk here too.
        if (deleteEl) deleteEl.style.display = '';
        btnEl.onclick = function () { goHomeWith(WANT_UPDATE_KEY); };
    } else {
        // "Downloaded" on its own hid a real failure mode: a library that is on disk but which THIS
        // tab cannot use (another tab/app holds the single-writer OPFS pool) reads exactly like a
        // healthy one — until the reader goes offline and everything fails. Say which it is.
        var reason = state.reason;
        var note = '';
        if (reason === 'not-owner') {
            note = isRu ? ' Использует другая вкладка или приложение — закройте их и обновите страницу.'
                        : ' Another tab or the installed app is using it — close them and reload.';
        } else if (reason === 'unusable') {
            note = isRu ? ' Файл не открылся — нажмите «Перескачать».'
                        : ' The file could not be opened — press Re-download.';
        } else if (reason === 'insecure') {
            note = isRu ? ' Нужен HTTPS.' : ' HTTPS required.';
        } else if (reason === 'local') {
            // Not "working offline" — that reads as a claim about the CONNECTION ("I'm online, this is
            // not true", owner). It is about the library being usable without one.
            note = isRu ? ' Готова к работе без интернета.' : ' Ready to work without a connection.';
        }
        function showDownloaded(bytes, bytesGz) {
            var size = !bytes ? ''
                : bytesGz ? (isRu ? ' Архив ' + mb(bytesGz) + ' МБ, на устройстве ' + mb(bytes) + ' МБ.'
                                  : ' Archive ' + mb(bytesGz) + ' MB, on device ' + mb(bytes) + ' MB.')
                : ' ' + mb(bytes) + (isRu ? ' МБ.' : ' MB.');
            var build = isRu ? ('Скачано, ' + baseLabel(state) + '.')
                             : ('Downloaded, ' + baseLabel(state) + '.');
            descEl.textContent = build + size + note;
        }
        showDownloaded(state.bytes || null);
        // Filled in a moment later (and never allowed to fail the row): the sizes come from the
        // published manifest, not from the reader's storage.
        withManifestSize(function (bytes, bytesGz) {
            if (bytes && !packsRow) { showDownloaded(bytes, bytesGz); }   // the packs row says its own sizes
        });
        btnEl.textContent = isRu ? 'Перескачать' : 'Re-download';
        // Freeing the space has to be possible from here: without this the only way to get ~500MB back
        // was clearing the whole site's data — "Reset all" does not touch the library.
        if (deleteEl) deleteEl.style.display = '';
        btnEl.onclick = function () { goHomeWith(WANT_UPDATE_KEY); };
    }

    // The delete itself happens in the page around this iframe, which then records present:false in
    // localStorage. This frame kept showing "Downloaded … Re-download / Delete" until the sheet was
    // reopened; the storage event reaches it, so it redraws as soon as the library is gone.
    window.addEventListener('storage', function (event) {
        if (event.key !== 'dg.offline.state') return;
        var next = null;
        try { next = JSON.parse(event.newValue || 'null'); } catch (e) { /* ignore */ }
        if (!(next && next.present) && deleteEl && deleteEl.style.display !== 'none') location.reload();
    });

    // Selectable packs (owner 2026-10-29, mockup /assets/offline-packs-mockup.html): where the server publishes
    // packs-manifest.json, the row's button opens a dialog to pick root editions and translations. The choice goes to
    // localStorage (dg.offline.packs, read by app.js) and the download itself runs on the main page as before.
    var PACKS_KEY = 'dg.offline.packs';
    var packsRow = false;
    var packsBase = window.DG_PACKS_BASE || (window.dgPlatform && window.dgPlatform.distBase) || window.DG_DIST_BASE || '/mobile-data';
    // On the site, off in the apps for now — the same switch as app.js (PACKS_ON). The settings sheet is a frame of the
    // app's page, which may be where window.Capacitor lives.
    var inApp = /^(https?|capacitor):\/\/localhost$/.test(location.origin) && !!(window.Capacitor || (window.parent && window.parent.Capacitor));
    if (secure && (window.DG_OFFLINE_PACKS === true || window.DG_PACKS_BASE || !inApp)) {
        fetch(String(packsBase).replace(/\/$/, '') + '/packs-manifest.json', { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (m) { if (m && Array.isArray(m.packs) && m.packs.some(function (p) { return p.main; })) setUpPacks(m); })
            .catch(function () { /* offline or not published: the row stays as above */ });
    }

    function setUpPacks(manifest) {
        packsRow = true;
        var L = isRu
            ? { h: 'Что скачать', sub: 'Офлайн-библиотека: выберите корни и переводы. Остальное откроется онлайн. Размер — место на устройстве; скачивается сжатый архив, он примерно втрое меньше.', roots: 'Корневые тексты (пали)', tr: 'Переводы', total: 'На устройстве', get: 'Скачать', getHint: 'сжатый архив', upd: 'Применить', refresh: 'Обновить', cancel: 'Отмена', mb: 'МБ', have: 'скачано', del: 'будет удалено', isNew: 'будет скачано', changed: 'есть обновление', free: 'Освободится', rm: 'Удалить', delAll: 'Удалить всё', nothing: 'Нет изменений', required: 'обязательно', core: 'основа библиотеки: оглавление, поиск, подсказки', choose: 'Выбрать…', change: 'Изменить…', old: 'вся база (прежний формат)', texts: ' текстов', more: function (n) { return 'Ещё ' + n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'язык' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'языка' : 'языков'); }, row: function (names, size) { return 'Скачано: ' + names.join(', ') + ' · ' + size + ' МБ.'; } }
            : { h: 'What to download', sub: 'Offline library: pick root texts and translations. Everything else opens online. Size is space on the device; the download is a compressed archive, about a third of that.', roots: 'Root texts (Pali)', tr: 'Translations', total: 'On device', get: 'Download', getHint: 'compressed archive', upd: 'Apply', refresh: 'Update', cancel: 'Cancel', mb: 'MB', have: 'downloaded', del: 'will be removed', isNew: 'will be downloaded', changed: 'update available', free: 'Frees', rm: 'Remove', delAll: 'Remove all', nothing: 'No changes', required: 'required', core: 'library core: contents, search, suggestions', choose: 'Choose…', change: 'Change…', old: 'whole database (earlier format)', texts: ' texts', more: function (n) { return n + ' more languages'; }, row: function (names, size) { return 'Downloaded: ' + names.join(', ') + ' · ' + size + ' MB.'; } };
        var EDITIONS = { ms: 'Mahāsaṅgīti', th: isRu ? 'Сиам Рат (Таиланд)' : 'Siam Rath (Thailand)', bjt: isRu ? 'BJT (Шри-Ланка)' : 'BJT (Sri Lanka)', vri: isRu ? 'VRI (Мьянма)' : 'VRI (Myanmar)' };
        var packs = manifest.packs;
        var main = packs.filter(function (p) { return p.main; })[0];
        // The other Pali editions (ed-bjt, …, kind 'edition') are listed with the root texts, under the Mahāsaṅgīti.
        var isRoot = function (p) { return p.kind === 'root' || p.kind === 'edition'; };
        var langOf = function (p) { return p.lang || (/^tr-([a-z]{2,3})$/.exec(p.id) || [])[1] || null; };
        // Fixed self-names, as in the mockup: a browser's own data may lack some (Pablo's phone showed "Gsw", headless
        // Chromium "Lao", "Georgian"). Intl only for a language not listed here.
        var LANG_NAMES = { en: 'English', de: 'Deutsch', ru: 'Русский', th: 'ไทย', sr: 'Српски', fr: 'Français', lt: 'Lietuvių',
            it: 'Italiano', pt: 'Português', tr: 'Türkçe', pl: 'Polski', jpn: '日本語', ja: '日本語', es: 'Español', et: 'Eesti',
            vi: 'Tiếng Việt', ka: 'ქართული', id: 'Bahasa Indonesia', gu: 'ગુજરાતી', hi: 'हिन्दी', ta: 'தமிழ்', my: 'မြန်မာ', lo: 'ລາວ',
            gsw: 'Schwiizertüütsch', cs: 'Čeština', fi: 'Suomi' };
        function nativeName(lang) {
            if (LANG_NAMES[lang]) return LANG_NAMES[lang];
            try { var n = new Intl.DisplayNames([lang], { type: 'language' }).of(lang); return n.charAt(0).toUpperCase() + n.slice(1); }
            catch (e) { return lang; }
        }
        function name(p) {
            if (p.langs && p.langs.length > 1) return L.more(p.langs.length);   // counted here: the plural is ours to get right
            if (p.title) return p.title[isRu ? 'ru' : 'en'] || p.title.en || p.id;
            if (isRoot(p)) return EDITIONS[p.edition || p.id.replace(/^root-/, '')] || p.id;
            var lang = langOf(p);
            return lang ? nativeName(lang) : (p.id === 'tr-small' ? (isRu ? 'Другие языки' : 'Other languages') : p.id);
        }
        // HTML: each language name kept on one line ("Tiếng / Việt" broke in the middle).
        function desc(p) {
            var bits = [];
            if (p === main) bits.push(esc(L.core));
            if (p.langs && p.langs.length > 1) bits.push(p.langs.map(function (l) { return '<span style="white-space:nowrap">' + esc(nativeName(l)) + '</span>'; }).join(' · '));
            // "6 991 текст", "7 284 текста", "7 605 текстов": the Russian plural by the last digits, not one suffix for all.
            var tw = function (n) { var d = n % 10, h = n % 100; return d === 1 && h !== 11 ? ' текст' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? ' текста' : ' текстов'; };
            if (p.texts) bits.push(esc(p.texts.toLocaleString(isRu ? 'ru' : 'en') + (isRu ? tw(p.texts) : L.texts)));
            return bits.join(' · ');
        }
        var mbOf = function (b) { return Math.max(1, Math.round((b || 0) / 1048576)); };

        // What the device holds: the packs the main page last opened. An older whole database counts as "nothing
        // picked yet" (its row names it), and the first apply replaces it with packs.
        var installed = (state && state.present && Array.isArray(state.packs)) ? state.packs : [];
        var oldWhole = !!(state && state.present && !Array.isArray(state.packs));
        var outdated = (state && state.update && Array.isArray(state.update.packs)) ? state.update.packs : [];
        var saved = null;
        try { saved = JSON.parse(localStorage.getItem(PACKS_KEY) || 'null'); } catch (e) { /* none */ }
        var on = {};
        function resetSelection() {
            on = {};
            packs.forEach(function (p) {
                on[p.id] = p === main || p.required || (installed.length ? installed.indexOf(p.id) !== -1
                    : Array.isArray(saved) ? saved.indexOf(p.id) !== -1 : !!p.default);
            });
        }
        resetSelection();
        var has = function (p) { return installed.indexOf(p.id) !== -1; };
        var sum = function (fn) { return packs.reduce(function (a, p) { return a + (fn(p) || 0); }, 0); };
        function plan() {
            return {
                add: packs.filter(function (p) { return on[p.id] && (!has(p) || outdated.indexOf(p.id) !== -1); }),
                del: packs.filter(function (p) { return !on[p.id] && has(p); }),
            };
        }

        if (!document.getElementById('pkStyle')) {
            var st = document.createElement('style');
            st.id = 'pkStyle';
            st.textContent = '.pk-sec{margin:0;padding:10px 18px 6px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-3)}'
                + '.pk-name{flex:1;min-width:0}.pk-name b{display:block;font-weight:400}.pk-size{white-space:nowrap;margin:0!important;text-align:right}'
                + '.pk-tag-have{color:var(--accent)}.pk-tag-del{color:#c0392b}.pk-tag-new{font-style:italic}'
                + '.pk-delall{background:none;border:0;padding:0;font:inherit;font-size:13px;color:#c0392b;cursor:pointer;text-decoration:underline}'
                + '#pkDlg li.pk-del b{text-decoration:line-through;opacity:.7}#pkGo{min-width:132px;justify-content:center}#pkGo[disabled]{opacity:.5;cursor:default}'
                + '@media (max-width:480px){#pkDlg .dlg-foot{flex-wrap:wrap}#pkTotal{flex:1 0 100%;margin-bottom:6px!important}}';
            document.head.appendChild(st);
        }
        var dlg = document.createElement('dialog');
        dlg.id = 'pkDlg';
        document.body.appendChild(dlg);
        var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

        function item(p) {
            var tag = '';
            if (has(p)) tag = !on[p.id] ? '<span class="pk-tag-del">' + L.del + '</span>' : outdated.indexOf(p.id) !== -1 ? '<span class="pk-tag-new">' + L.changed + '</span>' : '<span class="pk-tag-have">✓ ' + L.have + '</span>';
            else if (on[p.id] && (installed.length || oldWhole)) tag = '<span class="pk-tag-new">' + L.isNew + '</span>';
            var d = [desc(p), p === main || p.required ? L.required : '', tag].filter(Boolean).join(' · ');
            return '<li' + (has(p) && !on[p.id] ? ' class="pk-del"' : '') + '><label><input type="checkbox" data-id="' + esc(p.id) + '"'
                + (on[p.id] ? ' checked' : '') + (p === main || p.required ? ' disabled' : '') + '>'
                + '<span class="pk-name"><b>' + esc(name(p)) + '</b>' + (d ? '<span class="row-desc" style="margin:0">' + d + '</span>' : '') + '</span>'
                + '<span class="row-desc pk-size">' + mbOf(p.bytes) + ' ' + L.mb
                + (has(p) && outdated.indexOf(p.id) === -1 ? '' : '<br><small style="opacity:.75">↓ ' + mbOf(p.bytes_gz || p.bytes) + ' ' + L.mb + '</small>')
                + '</span></label></li>';
        }
        function totalHtml(pl) {
            var out = L.total + ': <b>' + sum(function (p) { return on[p.id] && mbOf(p.bytes); }) + ' ' + L.mb + '</b>';
            if (pl.add.length) out += '<br>' + L.get + ': <b>≈ ' + pl.add.reduce(function (a, p) { return a + mbOf(p.bytes_gz || p.bytes); }, 0) + ' ' + L.mb + '</b> <span style="opacity:.75">(' + L.getHint + ')</span>';
            if (pl.del.length) out += '<br><span class="pk-tag-del">' + L.free + ': <b>' + pl.del.reduce(function (a, p) { return a + mbOf(p.bytes); }, 0) + ' ' + L.mb + '</b></span>';
            return out;
        }
        function render() {
            var pl = plan(), changes = pl.add.length || pl.del.length || oldWhole;
            var size = sum(function (p) { return has(p) && mbOf(p.bytes); });
            var list = function (f) { return '<ul class="dlg-list">' + packs.filter(f).map(item).join('') + '</ul>'; };
            dlg.innerHTML = '<div class="dlg-head"><h3>' + (installed.length ? (isRu ? 'Офлайн-библиотека' : 'Offline library') : L.h) + '</h3>'
                + '<p class="row-desc" style="margin:0">' + L.sub + '</p>'
                + (installed.length ? '<p style="margin:8px 0 0"><button type="button" class="pk-delall" id="pkDelAll">' + L.delAll + ' (' + size + ' ' + L.mb + ')</button></p>' : '') + '</div>'
                + '<div class="dlg-body"><p class="pk-sec">' + L.roots + '</p>' + list(isRoot)
                + '<p class="pk-sec">' + L.tr + '</p>' + list(function (p) { return !isRoot(p); }) + '</div>'
                + '<div class="dlg-foot" style="align-items:center"><span class="row-desc" id="pkTotal" style="margin:0 auto 0 0">' + totalHtml(pl) + '</span>'
                + '<button class="btn" type="button" id="pkCancel">' + L.cancel + '</button><button type="button" id="pkGo"></button></div>';
            var go = document.getElementById('pkGo');
            go.disabled = !changes;
            go.className = 'btn ' + (pl.del.length && !pl.add.length ? 'btn-danger' : 'btn-primary');
            // The button names what will happen.
            go.textContent = !changes ? L.nothing
                : pl.add.length && pl.add.every(has) && !pl.del.length ? L.refresh
                : pl.add.length && pl.del.length ? L.upd : pl.add.length || oldWhole ? L.get : L.rm;
            dlg.querySelectorAll('input[data-id]').forEach(function (cb) {
                cb.onchange = function () {
                    on[cb.getAttribute('data-id')] = cb.checked;
                    var top = dlg.querySelector('.dlg-body').scrollTop;
                    render();
                    dlg.querySelector('.dlg-body').scrollTop = top;
                };
            });
            document.getElementById('pkCancel').onclick = function () { resetSelection(); dlg.close(); };
            go.onclick = function () {
                var choice = packs.filter(function (p) { return on[p.id] && p !== main; }).map(function (p) { return p.id; });
                try { localStorage.setItem(PACKS_KEY, JSON.stringify(choice)); } catch (e) { /* private mode: defaults */ }
                dlg.close();
                goHomeWith(state && state.present ? WANT_UPDATE_KEY : WANT_DATA_KEY);
            };
            var da = document.getElementById('pkDelAll');
            if (da) da.onclick = function () { dlg.close(); if (deleteEl) deleteEl.click(); };
        }

        // The row: what is on the device, and one button that opens the dialog.
        var names = packs.filter(has).map(name);
        if (names.length) {
            descEl.textContent = L.row(names, sum(function (p) { return has(p) && mbOf(p.bytes); })) + (outdated.length ? ' ' + (isRu ? 'Есть обновление.' : 'An update is available.') : '');
        } else if (oldWhole) {
            descEl.textContent = (isRu ? 'Скачано: ' : 'Downloaded: ') + L.old + '.';
        }
        btnEl.textContent = names.length || oldWhole ? L.change : L.choose;
        btnEl.disabled = false;
        btnEl.onclick = function () { resetSelection(); render(); dlg.showModal(); };
        // Opened from the page's "Download the offline library" link (app.js): straight to the dialog.
        var openNow = false;
        try { openNow = localStorage.getItem('dg.offline.openPacks') === '1'; localStorage.removeItem('dg.offline.openPacks'); } catch (e) { /* none */ }
        if (openNow) { document.getElementById('dgOfflineLibRow').scrollIntoView({ block: 'center' }); btnEl.click(); }
    }

    // Delete asks the SPA (this page runs in the settings sheet's iframe, where the offline layer —
    // and its worker — live) to drop the library; the worker's own delete op unlinks the OPFS files.
    if (deleteEl) {
        // Same as the docs button above: no t-* id, so applyLang() left it Russian on the English page.
        deleteEl.textContent = isRu ? 'Удалить' : 'Delete';
        deleteEl.addEventListener('click', function () {
            var question = isRu
                ? 'Удалить офлайн-библиотеку? Её можно будет скачать заново.'
                : 'Delete the offline library? It can be downloaded again.';
            if (!window.confirm(question)) return;
            try {
                window.parent.postMessage({ dgOfflineDeleteRequest: true }, window.location.origin);
            } catch (e) { /* cross-origin or no parent: nothing to do */ }
        });
    }
})();
