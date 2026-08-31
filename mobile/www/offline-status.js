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
    // Owner: "указывай разархивированный объём и заархивированный, человек должен понимать
    // хватит ли места на телефоне" — this app has no separate unpack step (what fetchDbBytes
    // downloads is byte-for-byte what's stored in IndexedDB), so download size and on-device
    // size are the same number; stated explicitly as "storage" (the number that answers "will
    // it fit") rather than left ambiguous as if it were only a network transfer size.
    window.addEventListener('dg:need-consent', function (e) {
        const ru = isRuLang();
        const msg = ru
            ? 'Офлайн-библиотека займёт ~275МБ места на телефоне (столько же будет скачано). Сейчас не Wi-Fi — продолжить по мобильному интернету?'
            : 'The offline library needs ~275MB of storage on your phone (that is also how much will be downloaded). You are not on Wi-Fi — continue on mobile data?';
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
            // Declining consent rejects before any 'dg:dl-progress' ever fires, so `bar` can
            // still be null here — unlike the success path, this message must always show.
            const el = ensureBar();
            el.classList.add('show');
            el.textContent = isRuLang()
                ? 'Скачивание отложено — повторите в Настройках'
                : 'Download postponed — retry from Settings';
            // Stays visible (no auto-hide) — search/reading are degraded until the user retries,
            // this is the one persistent reminder that something still needs attention.
        });
    }
})();
