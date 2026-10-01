// Error reports from the site itself. The mobile apps already have this channel in
// native-bridge.js (console.error + JS errors beaconed to POST /api/app-log), but the plain
// website had none: a sign-in that failed in Safari on an Apple device left no trace anywhere,
// which is exactly the "is it a rate limit or a real bug?" question the logs could not answer.
// Same endpoint and payload shape, so site and app reports land in one logs/app-errors.log.
//
// Skipped inside the apps: native-bridge.js reports there already, and two reporters on one page
// would duplicate every message.
(function () {
    if (window.__dgErrorReports) return;
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return;
    window.__dgErrorReports = true;

    var seen = {};
    var seenCount = 0;
    var queue = [];
    var timer = null;

    function report(kind, msg, where) {
        msg = String(msg == null ? '' : msg).slice(0, 800);
        var key = kind + '|' + msg;
        // One page load sends at most 20 distinct reports, so a broken loop cannot spam the log.
        if (!msg || seen[key] || seenCount >= 20) return;
        seen[key] = true;
        seenCount++;
        queue.push({
            kind: kind,
            msg: msg,
            where: where || '',
            page: location.pathname + location.search,
            app: '',
            ua: navigator.userAgent,
            t: Date.now()
        });
        if (!timer) timer = setTimeout(flush, 5000);
    }

    function flush() {
        timer = null;
        if (!queue.length) return;
        if (navigator.onLine === false || !navigator.sendBeacon) return;
        var batch = queue.splice(0, 20);
        var sent = navigator.sendBeacon('/api/app-log', new Blob([JSON.stringify(batch)], { type: 'text/plain' }));
        if (!sent) queue = batch.concat(queue);
    }

    // Explicit events, for the case the generic hooks cannot see: a sign-in that is clicked and
    // then does nothing at all (settings.js syncLoginGoogle/syncLoginApple) used to be silent.
    window.dgReport = function (msg, kind) { report(kind || 'console', msg); };

    window.addEventListener('error', function (e) {
        var el = e.target;
        if (el && el !== window && (el.src || el.href)) return report('resource', el.src || el.href);
        report('error', e.message, (e.filename || '') + ':' + (e.lineno || 0) + ':' + (e.colno || 0));
    }, true);
    window.addEventListener('unhandledrejection', function (e) {
        var r = e.reason;
        report('rejection', (r && (r.stack || r.message)) || r);
    });

    var consoleError = console.error;
    console.error = function () {
        try {
            report('console', Array.prototype.map.call(arguments, function (a) {
                if (a && a.stack) return a.stack;
                try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch (e) { return String(a); }
            }).join(' '));
        } catch (e) { /* never let reporting break logging */ }
        return consoleError.apply(console, arguments);
    };

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') flush();
    });
})();
