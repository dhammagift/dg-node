// Bridges "leave the app" links to the device's real browser via @capacitor/browser (Chrome
// Custom Tabs on Android) instead of the app's own WebView. Two reasons this can't just be a
// plain navigation/window.open like on the real site:
//
// 1. Capacitor's WebView only navigates within its own local origin (https://localhost, this
//    app's static asset server) by default — a plain `location.href`/`<a href>` to an external
//    https:// URL is silently swallowed (no server.allowNavigation configured, and adding one
//    would still leave the user "trapped" in the app's WebView with no obvious way back).
// 2. /login specifically is Firebase/Google auth — Google actively rejects OAuth sign-in
//    attempted inside an embedded WebView ("disallowed_useragent"), it must run in a real browser
//    context. Custom Tabs count as a real browser to Google; this app's WebView does not.
//
// Loaded on both index.html and settings/index.html (the only two pages this app has with links
// of this kind) — NOT part of app.js, which is the data-shim only (see its own header comment)
// and isn't loaded on the settings page at all.
(function () {
    function openExternal(url) {
        var Browser = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
        if (Browser) Browser.open({ url: url });
        else window.location.href = url; // plain-browser fallback (local dev/testing, no Capacitor runtime)
    }

    function isExternal(url) {
        try { return new URL(url, location.href).origin !== location.origin; }
        catch (e) { return false; }
    }

    // mirror-link.js (public/overrides/js/mirror-link.js) already resolves 4nt/TBW/Th.ru/Th.su
    // etc. to the right URL (local mirror vs. online fallback — this app never bundles the local
    // mirrors, so it always resolves online, see TODO.md) — it just does the actual opening via
    // window.open()/location.href, which hits problem #1 above. Patching window.open here, rather
    // than editing mirror-link.js, keeps that file identical to the one the live site uses.
    var realOpen = window.open.bind(window);
    window.open = function (url, target, features) {
        if (!url) {
            // mirror-link.js's openMirrorLink() opens a blank window SYNCHRONOUSLY first (so the
            // eventual navigation still counts as a direct response to the click, not a popup),
            // then sets its .location once the async local-vs-online check resolves — emulate
            // just enough of that shape for its own code to work unmodified.
            return { closed: false, set location(url) { openExternal(url); } };
        }
        if (isExternal(url)) { openExternal(url); return null; }
        return realOpen(url, target, features);
    };

    // memo (/memo/, /ru/memo/), login (/login, /ru/login) and the Help/Docs portal
    // (/docs/..., /ru/docs/...) are real site sections this app doesn't bundle — memo/login
    // never were part of the SPA this app copies (see TODO.md); docs (dg-docs, Docusaurus)
    // deliberately stays online-only too (owner: "докс — отдельная опция, скачивать/онлайн при
    // онбординге, чтобы АПК был меньше" — baking the ~23MB build into the APK for content that's
    // read occasionally, not offline-critical like search/reader, was the wrong tradeoff; a real
    // downloadable-docs option is a bigger separate feature — packaging+extracting a whole static
    // site at runtime, not a simple asset-list addition like everything else in build-assets.js —
    // left for later if actually wanted). All three have no local version to even attempt, unlike
    // mirror-link.js's targets, so they always go straight to the live site via a real browser
    // (target="_blank" on these same-origin-relative links would otherwise just try to navigate
    // the WebView to a path that doesn't exist locally — see build-assets.js/app.js's "/toc/..."
    // 404 comments).
    var ONLINE_ORIGIN = 'https://dhamma.gift';
    document.addEventListener('click', function (e) {
        var a = e.target.closest('a[href]');
        if (a) {
            var href = a.getAttribute('href');
            if (/^\/(ru\/)?(memo|login|docs)(\/|$)/.test(href)) {
                e.preventDefault();
                openExternal(ONLINE_ORIGIN + href);
            }
            return;
        }
        // settings/index.html's "Log in" button navigates via `location.href = ...` from its own
        // .onclick, set after this listener runs (capture phase) — same target, same problem as
        // the anchors above, just not an <a>. isRu mirrors that page's own `const isRu = ...`
        // check (settings/index.html:580) since this file has no access to that local variable.
        if (e.target.closest('#cloudBtn')) {
            e.preventDefault();
            e.stopPropagation();
            var isRu = (localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en') === 'ru';
            openExternal(ONLINE_ORIGIN + (isRu ? '/ru/login' : '/login'));
        }
    }, true);

    // Owner (real usage): "не работают переходы назад — кнопка Android назад или свайп назад".
    // Capacitor 6 moved hardware-back handling out of the core Bridge and into the optional
    // @capacitor/app plugin — with it absent (as it was), Android's back dispatcher has nothing
    // registered at all, so both the back button and the edge-swipe-back gesture (same dispatch
    // path) just fall through to the default Activity behavior and exit/background the app
    // instead of going back within the SPA's own pushState history. @capacitor/app's `canGoBack`
    // is computed from the native WebView's own back/forward list, which faithfully tracks every
    // pushState navigation the SPA already does (search → reader → TOC, etc.) — so this is
    // exactly "go back one step in the app", not a full page reload.
    var CapApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (CapApp) {
        CapApp.addListener('backButton', function (ev) {
            // Closing an open overlay first is the expected mobile pattern — otherwise "back"
            // while the Quick Modal (Favorites/History/compass) is open exits the app instead of
            // just closing the modal.
            if (window.quickModalIsOpen && typeof window.toggleQuickModal === 'function') {
                window.toggleQuickModal();
                return;
            }
            if (ev.canGoBack) window.history.back();
            else CapApp.exitApp();
        });
    }
})();
