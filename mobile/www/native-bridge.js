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

    // memo (/memo/, /ru/memo/) and login (/login, /ru/login) are real, separate legacy site
    // sections that were never part of the SPA this app copies (see TODO.md) — there's no local
    // version to even attempt, unlike mirror-link.js's targets, so these always go straight to
    // the live site.
    var ONLINE_ORIGIN = 'https://dhamma.gift';
    document.addEventListener('click', function (e) {
        var a = e.target.closest('a[href]');
        if (a) {
            var href = a.getAttribute('href');
            if (/^\/(ru\/)?(memo|login)(\/|$)/.test(href)) {
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
})();
