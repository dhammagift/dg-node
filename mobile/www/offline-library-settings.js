// Fills in the "Offline library" / "Offline docs" rows build-assets.js's
// injectOfflineLibraryRow() adds to the Data section of settings/index.html (a live-site page
// copied verbatim otherwise — see that function's header). Separate page from index.html
// (app.js/native-bridge.js aren't loaded here at all), so this duplicates the tiny bits it
// needs (isRu check, IndexedDB open/get) rather than reaching across pages for them.
(function () {
    var isRu = (localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en') === 'ru';
    var DB_FILES = ['core.db', 'lang_ru.db', 'lang_en.db'];

    function openStore() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open('dg-offline-v1', 1);
            req.onupgradeneeded = function () { req.result.createObjectStore('dbs'); };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }
    function idbGet(db, key) {
        return new Promise(function (resolve, reject) {
            var req = db.transaction('dbs', 'readonly').objectStore('dbs').get(key);
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { reject(req.error); };
        });
    }

    var titleEl = document.getElementById('dgOfflineLibTitle');
    var descEl = document.getElementById('dgOfflineLibDesc');
    var btnEl = document.getElementById('dgOfflineLibBtn');
    if (!titleEl || !descEl || !btnEl) return; // row wasn't injected — fail soft, not fatal

    titleEl.textContent = isRu ? 'Офлайн-библиотека' : 'Offline library';
    btnEl.textContent = isRu ? 'Скачать сейчас' : 'Download now';
    // Settings is a separate page/JS realm from index.html (where app.js's actual download
    // logic lives) — a plain navigation home is enough: app.js's own top-level `ready =
    // loadData()` runs unconditionally on every load of that page and already short-circuits
    // whatever's cached via idbGet, so this "retries" naturally without any extra signaling.
    btnEl.onclick = function () { location.href = '/'; };

    openStore().then(function (idb) {
        return Promise.all(DB_FILES.map(function (name) { return idbGet(idb, name); }));
    }).then(function (results) {
        var have = results.filter(Boolean).length;
        if (have === DB_FILES.length) {
            var totalBytes = results.reduce(function (sum, buf) { return sum + (buf ? buf.byteLength : 0); }, 0);
            var mb = Math.round(totalBytes / (1024 * 1024));
            descEl.textContent = isRu ? ('Скачано, ~' + mb + 'МБ.') : ('Downloaded, ~' + mb + 'MB.');
            btnEl.textContent = isRu ? 'Перескачать' : 'Re-download';
        } else if (have > 0) {
            descEl.textContent = isRu ? 'Скачано частично.' : 'Partially downloaded.';
        } else {
            descEl.textContent = isRu ? 'Не скачано.' : 'Not downloaded.';
        }
    }).catch(function () {
        descEl.textContent = isRu ? 'Не скачано.' : 'Not downloaded.';
    });

    var docsTitleEl = document.getElementById('dgOfflineDocsTitle');
    var docsDescEl = document.getElementById('dgOfflineDocsDesc');
    // .badge text ("soon"/"скоро") is already relabeled by the page's own applyLang() — this
    // script runs after it (script tag placed right before </body>), only the plain text node
    // in front of the badge needs setting here, not the badge itself.
    if (docsTitleEl && docsTitleEl.firstChild) docsTitleEl.firstChild.textContent = isRu ? 'Докс офлайн' : 'Offline docs';
    if (docsDescEl) docsDescEl.textContent = isRu
        ? 'Пока справка открывается онлайн — чтобы приложение оставалось компактным.'
        : 'Help currently opens online, to keep the app small.';
})();
