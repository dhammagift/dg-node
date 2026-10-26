// Demo, test only (owner 2026-10-26: "try it apart, on the site, not in the app"): a two-finger pinch steps the site's own
// Text size (uiScale, 70-250 % by 10, home.js dgStepUiScale) instead of the browser's zoom, so the text reflows to the
// screen like Apple Books, with a short "130 %" label. The reading place is kept. Loaded by search/index.html only after
// ?pinch=1 (kept for the tab; ?pinch=0 turns it off).
(function () {
    var STEP = 1.15;           // finger distance ratio per 10 % step
    var start = null;          // { dist, steps } of the pinch in progress
    var label = null, hideTimer = null;

    function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
    function scale() { var v = parseInt(localStorage.getItem('uiScale'), 10); return v >= 70 && v <= 250 ? v : 100; }
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
        if (e.touches.length !== 2 || typeof window.dgStepUiScale !== 'function') return;
        start = { dist: dist(e.touches), steps: 0, anchor: window.captureReadingAnchor ? window.captureReadingAnchor() : null };
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
        if (!start || e.touches.length !== 2) return;
        e.preventDefault(); // not the browser's own page zoom
        var want = Math.round(Math.log(dist(e.touches) / start.dist) / Math.log(STEP));
        if (want === start.steps) return;
        var before = scale();
        window.dgStepUiScale((want - start.steps) * 10);
        start.steps = want;
        if (scale() !== before && start.anchor && window.restoreReadingAnchor) window.restoreReadingAnchor(start.anchor);
        show(scale() + '%');
    }, { passive: false });
    document.addEventListener('touchend', function (e) { if (e.touches.length < 2) start = null; }, { passive: true });
    // One step from a trackpad (a Mac): the same label, the reading place kept from the gesture's start.
    var padAnchor = null, padTimer = null;
    function padStep(delta) {
        if (typeof window.dgStepUiScale !== 'function') return;
        if (!padAnchor) padAnchor = window.captureReadingAnchor ? window.captureReadingAnchor() : null;
        clearTimeout(padTimer); padTimer = setTimeout(function () { padAnchor = null; }, 600);
        var before = scale();
        window.dgStepUiScale(delta);
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
