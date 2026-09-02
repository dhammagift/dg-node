// Non-blocking status for the first-run offline DB download (see app.js's fetchDbBytes/
// hasNetworkConsent — this file only renders what those dispatch, no download logic of its
// own). Deliberately NOT a blocking overlay/wizard — owner: "не блокировать, показывать
// строку, чтобы юзер уже мог пользоваться мультитулом или настройками". Reuses the existing
// toast's `.bubble-notification` class (settings.js's showBubbleNotification(), see
// extrastyles.css) rather than inventing new visual style — that class already has
// pointer-events:none, so it never eats clicks meant for the rest of the page.
//
// Loaded on index.html only, next to native-bridge.js — keeps app.js a pure data+events shim
// (no DOM code), same separation of concerns already used for native-bridge.js.
(function () {
    function isRuLang() {
        return (localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en') === 'ru';
    }

    function labelFor(name, ru) {
        if (name === 'core.db') return ru ? 'основные тексты' : 'core texts';
        if (name === 'lang_ru.db') return ru ? 'русский перевод' : 'Russian translations';
        if (name === 'lang_en.db') return ru ? 'английский перевод' : 'English translations';
        return name;
    }

    // Self-colored (like .bubble-notification above), no dark/light variant needed — visible on
    // either theme the same way the existing toast is.
    const style = document.createElement('style');
    style.textContent = `
        #dgApiLoadingDot {
            position: fixed; right: 16px; bottom: 16px; width: 28px; height: 28px;
            border-radius: 50%; background: rgba(0,0,0,0.7); z-index: 10001;
            opacity: 0; transition: opacity 0.15s ease; pointer-events: none;
        }
        #dgApiLoadingDot.show { opacity: 1; }
        #dgApiLoadingDot::after {
            content: ""; position: absolute; inset: 5px; border-radius: 50%;
            border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff;
            animation: dgApiLoadingSpin 0.7s linear infinite;
        }
        @keyframes dgApiLoadingSpin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);

    let bar = null;
    function ensureBar() {
        if (bar) return bar;
        bar = document.createElement('div');
        bar.id = 'dgOfflineStatus';
        bar.className = 'bubble-notification info';
        document.body.appendChild(bar);
        return bar;
    }

    window.addEventListener('dg:dl-progress', function (e) {
        const { name, step, totalSteps, loaded, total } = e.detail;
        const ru = isRuLang();
        const pct = total ? Math.round((loaded / total) * 100) : null;
        const stepLabel = ru ? `Загрузка (${step}/${totalSteps})` : `Downloading (${step}/${totalSteps})`;
        const el = ensureBar();
        el.textContent = pct !== null
            ? `${stepLabel}: ${labelFor(name, ru)} ${pct}%`
            : `${stepLabel}: ${labelFor(name, ru)}`;
        el.classList.add('show');
    });

    // app.js dispatches this (and awaits the resolve it carries) only when a download is
    // actually needed AND the connection isn't Wi-Fi — never on a fully-cached return visit.
    //
    // Owner (round 2): the previous single "~275MB, that's also what gets downloaded" number was
    // wrong — dg-light.js's compression() gzips these responses (see CLAUDE.md/TODO.md), so the
    // ACTUAL network transfer is much smaller than the on-disk/IndexedDB size fetch() ends up
    // storing (measured 2026-09-02 against the live mobile-data endpoint: core+ru+en gzip to
    // ~60MB total vs ~260MB decompressed). Mobile-data cost cares about the wire number, free-
    // space cares about the storage number — showing only one of them is misleading either way.
    // Not computed at runtime (would need an upfront HEAD pass, see fetchDbBytes's own comment on
    // why that's avoided) — re-measure and update these if the corpus is rebuilt and grows.
    const DOWNLOAD_MB = 60;
    const STORAGE_MB = 260;
    window.addEventListener('dg:need-consent', function (e) {
        const ru = isRuLang();
        const msg = ru
            ? `Скачается ~${DOWNLOAD_MB}МБ трафика (сжато), а после распаковки офлайн-библиотека займёт ~${STORAGE_MB}МБ места на телефоне. Сейчас не Wi-Fi — продолжить по мобильному интернету?`
            : `~${DOWNLOAD_MB}MB will be downloaded (compressed); unpacked, the offline library needs ~${STORAGE_MB}MB of storage on your phone. You are not on Wi-Fi — continue on mobile data?`;
        e.detail.resolve(window.confirm(msg));
    });

    // Owner: "добавь спиннер даже на открытие текстов, чтобы юзер понимал что уже нажал" — a
    // small persistent dot in the corner, not a bubble/toast: text opens are usually fast (see
    // app.js's withLoadingEvent + the index fix in build-offline-db.js), so this should read as
    // "working" for a beat, not steal the screen like the download banner does.
    let loadingDot = null;
    let loadingTimer = null;
    window.addEventListener('dg:api-loading', function (e) {
        if (e.detail.active) {
            // Delayed show — after the index/batching fix (build-offline-db.js,
            // buildApiTextResponse) most opens resolve well under this, so the common case is no
            // flash at all; only genuinely slow ones (first run, big sutta) show it.
            loadingTimer = setTimeout(function () {
                if (!loadingDot) {
                    loadingDot = document.createElement('div');
                    loadingDot.id = 'dgApiLoadingDot';
                    document.body.appendChild(loadingDot);
                }
                loadingDot.classList.add('show');
            }, 150);
        } else {
            clearTimeout(loadingTimer);
            if (loadingDot) loadingDot.classList.remove('show');
        }
    });

    if (window.dgOfflineReady && typeof window.dgOfflineReady.then === 'function') {
        window.dgOfflineReady.then(function () {
            // Nothing was ever shown — already fully cached, ready resolved near-instantly.
            // Stay silent, exactly as the owner asked ("полоска не должна даже мелькать").
            if (!bar) return;
            bar.classList.remove('show');
            if (typeof window.showBubbleNotification === 'function') {
                window.showBubbleNotification(
                    isRuLang() ? 'Офлайн-библиотека готова' : 'Offline library ready', 2500, 'success'
                );
            }
        }).catch(function () {
            // Owner: a permanent banner just sits there forever after declining — a few-second
            // heads-up is enough (same toast the success path already uses below); Settings'
            // own "Offline library" row (offline-library-settings.js) is the persistent, always-
            // visible reminder/retry point, this doesn't need to duplicate that by staying up.
            if (typeof window.showBubbleNotification === 'function') {
                window.showBubbleNotification(
                    isRuLang() ? 'Скачивание отложено — повторите в Настройках' : 'Download postponed — retry from Settings',
                    4000, 'info'
                );
            }
        });
    }
})();
