// Demo, test only (owner 2026-10-26: "try it apart, on the site, not in the app"): a two-finger pinch steps the site's own
// Text size (uiScale, 20-250 % by 10, home.js dgStepUiScale) instead of the browser's zoom, so the text reflows to the
// screen like Apple Books, with a short "130 %" label. The reading place is kept. Loaded by search/index.html only after
// ?pinch=1 (kept for the tab; ?pinch=0 turns it off).
(function () {
    var STEP = 1.15;           // finger distance ratio per 10 % step
    var start = null;          // { dist, steps } of the pinch in progress
    var label = null, hideTimer = null;

    // The page's own size control, or the app page's when this is the Settings frame inside it (settings/index.html loads
    // this too): the text size is one setting for the whole app.
    // A page with no size control of its own (Memorize & Meditate, sign-in, the tools: the app build adds this script to
    // every page, build-assets.js injectPinchEverywhere) zooms itself: the same uiScale, 20-250 %, as a CSS zoom of <html>.
    function ownStep(delta) {
        var v = Math.min(250, Math.max(20, scale() + delta));
        // Settings (page or the app's sheet): its own setter keeps its figure and the next +/- in step
        if (typeof window.applyUiScale === 'function' && typeof window.setScale === 'function' && document.getElementById('sizeVal')) { window.setScale(v); return; }
        try { localStorage.setItem('uiScale', String(v)); } catch (e) { /* private mode: this page only */ }
        if (typeof window.applyUiScale === 'function') window.applyUiScale(v);
        else document.documentElement.style.zoom = String(v / 100);
    }
    function stepper() {
        if (typeof window.dgStepUiScale === 'function') return window.dgStepUiScale;
        // Settings step themselves; the app page under the sheet follows by its storage event. Stepping the page under it
        // left the sheet at the old size - only its text sample changed (owner 2026-11-07).
        if (typeof window.applyUiScale === 'function') return ownStep;
        try { if (window.parent !== window && typeof window.parent.dgStepUiScale === 'function') return window.parent.dgStepUiScale; } catch (e) { /* another origin */ }
        return ownStep;
    }
    // such a page opens at the size chosen elsewhere in the app
    try {
        var own = typeof window.dgStepUiScale !== 'function' && typeof window.applyUiScale !== 'function' &&
            !(window.parent !== window && typeof window.parent.dgStepUiScale === 'function');
        if (own && scale() !== 100) document.documentElement.style.zoom = String(scale() / 100);
    } catch (e) { /* another origin above */ }
    function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
    function scale() { var v = parseInt(localStorage.getItem('uiScale'), 10); return v >= 20 && v <= 250 ? v : 100; }
    function show(text) {
        if (!label) {
            label = document.createElement('div');
            label.style.cssText = 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);z-index:99999;padding:.5em 1em;' +
                'border-radius:12px;background:rgba(0,0,0,.72);color:#fff;font:600 22px/1.2 system-ui,sans-serif;pointer-events:none;transition:opacity .25s';
            document.body.appendChild(label);
        }
        label.textContent = text; label.style.opacity = '1';
        clearTimeout(hideTimer); hideTimer = setTimeout(function () { label.style.opacity = '0'; }, 900);
    }

    document.addEventListener('touchstart', function (e) {
        // everywhere there is text - the home page, the contents, Settings, menus (owner 2026-11-07: «везде, где есть текст,
        // надо мочь увеличить»; it was the results and the reader only, 2026-11-05)
        if (e.touches.length !== 2) return;
        start = { dist: dist(e.touches), steps: 0, anchor: window.captureReadingAnchor ? window.captureReadingAnchor() : null };
        // The non-passive touchmove only while two fingers are down: kept on the page all the time it made the app's WebView
        // keep every touch for the page, and the app's pull to refresh stopped working (owner 2026-11-05, build 588)
        document.addEventListener('touchmove', onPinchMove, { passive: false });
    }, { passive: true });
    function onPinchMove(e) {
        if (!start || e.touches.length !== 2) return;
        e.preventDefault(); // not the browser's own page zoom
        var want = Math.round(Math.log(dist(e.touches) / start.dist) / Math.log(STEP));
        if (want === start.steps) return;
        var before = scale();
        stepper()((want - start.steps) * 10);
        start.steps = want;
        if (scale() !== before && start.anchor && window.restoreReadingAnchor) window.restoreReadingAnchor(start.anchor);
        show(scale() + '%');
    }
    document.addEventListener('touchend', function (e) {
        if (e.touches.length < 2) { start = null; document.removeEventListener('touchmove', onPinchMove, { passive: false }); }
    }, { passive: true });
    // One step from a trackpad (a Mac): the same label, the reading place kept from the gesture's start.
    var padAnchor = null, padTimer = null;
    function padStep(delta) {
        if (!padAnchor) padAnchor = window.captureReadingAnchor ? window.captureReadingAnchor() : null;
        clearTimeout(padTimer); padTimer = setTimeout(function () { padAnchor = null; }, 600);
        var before = scale();
        stepper()(delta);
        if (scale() !== before && padAnchor && window.restoreReadingAnchor) window.restoreReadingAnchor(padAnchor);
        show(scale() + '%');
    }
    // Chrome and Firefox give a trackpad pinch as a wheel with ctrlKey (their page zoom otherwise)
    var wheel = 0;
    document.addEventListener('wheel', function (e) {
        if (!e.ctrlKey) return;
        e.preventDefault();
        wheel -= e.deltaY;
        if (Math.abs(wheel) >= 40) { padStep(wheel > 0 ? 10 : -10); wheel = 0; }
    }, { passive: false });
    // Safari gives a pinch as gesture events (on a Mac only these; on an iPhone the touches above do the steps): they
    // are cancelled so Safari's own zoom stays out, and on a Mac they step the size.
    var gestureSteps = 0;
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); gestureSteps = 0; }, { passive: false });
    document.addEventListener('gesturechange', function (e) {
        e.preventDefault();
        if (start) return;
        var want = Math.round(Math.log(e.scale) / Math.log(STEP));
        if (want !== gestureSteps) { padStep((want - gestureSteps) * 10); gestureSteps = want; }
    }, { passive: false });
})();
