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
    window.addEventListener('dg:need-consent', function (e) {
        const ru = isRuLang();
        const msg = ru
            ? 'Для полного офлайн поиска и чтения нужно скачать ~255МБ. Сейчас не Wi-Fi — продолжить по мобильному интернету?'
            : 'Full offline search & reading needs ~255MB. You are not on Wi-Fi — continue on mobile data?';
        e.detail.resolve(window.confirm(msg));
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
