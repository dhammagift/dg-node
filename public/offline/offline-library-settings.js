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
//     done below, keeping the same ids (dgOfflineLib*, dgOfflineDocs*) the script looks up.
//   * The .badge text ("скоро"/"soon") is NOT touched here: the page's applyLang() already
//     relabels every .badge, and this script is loaded with `defer`, so it runs after it. Only the
//     plain text node in front of the badge needs setting.
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

    var titleEl = document.getElementById('dgOfflineLibTitle');
    var descEl = document.getElementById('dgOfflineLibDesc');
    var btnEl = document.getElementById('dgOfflineLibBtn');
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
        // First download — the extra key the app copy does not need (the app downloads
        // unconditionally on its home page, the site does not).
        btnEl.onclick = function () { goHomeWith(WANT_DATA_KEY); };
    } else if (update) {
        descEl.textContent = isRu
            ? ('Скачано (сборка ' + (state.build_id || '?') + '). Доступно обновление' +
               (update.bytes ? ', ' + mb(update.bytes) + 'МБ.' : '.'))
            : ('Downloaded (build ' + (state.build_id || '?') + '). An update is available' +
               (update.bytes ? ', ' + mb(update.bytes) + 'MB.' : '.'));
        btnEl.textContent = isRu ? 'Обновить' : 'Update';
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
            note = isRu ? ' Работает офлайн.' : ' Working offline.';
        }
        descEl.textContent = isRu
            ? ('Скачано, сборка ' + (state.build_id || '?') + '.' + note)
            : ('Downloaded, build ' + (state.build_id || '?') + '.' + note);
        btnEl.textContent = isRu ? 'Перескачать' : 'Re-download';
        btnEl.onclick = function () { goHomeWith(WANT_UPDATE_KEY); };
    }

    var docsTitleEl = document.getElementById('dgOfflineDocsTitle');
    var docsDescEl = document.getElementById('dgOfflineDocsDesc');
    // .badge text ("скоро"/"soon") is already relabeled by the page's own applyLang(), which runs
    // before this deferred script — only the plain text node in front of the badge is set here.
    if (docsTitleEl && docsTitleEl.firstChild) docsTitleEl.firstChild.textContent = isRu ? 'Докс офлайн' : 'Offline docs';
    if (docsDescEl) docsDescEl.textContent = isRu
        ? 'Пока справка открывается онлайн — чтобы офлайн-библиотека оставалась компактной.'
        : 'Help currently opens online, to keep the offline library small.';
    // The disabled button too: it has no t-* id (data-swapped states live in this file, not in the
    // page's STR table), so applyLang() leaves it in the markup's language — which is how the
    // English page ended up with a Russian "Скачать" next to an English "Download now".
    var docsBtnEl = document.getElementById('dgOfflineDocsBtn');
    if (docsBtnEl) docsBtnEl.textContent = isRu ? 'Скачать' : 'Download';
})();
