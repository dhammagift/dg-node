// platform.js — the one place the offline layer is allowed to know what it is running on.
//
// This is the browser implementation, and it is the default: public/offline/app.js reads
// window.dgPlatform and never asks where it came from. A native build (dg-app-full) sets its own
// window.dgPlatform BEFORE app.js is loaded — that copy keeps the Capacitor-only parts (the
// Network plugin's connection type, the native downloader, convertFileSrc) out of the site, the
// same split docs/OFFLINE_PWA_PLAN.md describes under "platform.js".
//
// Keep this file tiny and dependency-free: it is the first script on the page, and app.js must be
// able to install its fetch shim before anything else issues a request.
(function () {
    'use strict';

    if (window.dgPlatform) return; // native build already provided one — do not override it

    window.dgPlatform = {
        name: 'browser',

        // Where dg-mobile.db and db-manifest.json are published. Same origin by default: the
        // reader is on the site that serves the file. DG_DIST_BASE stays supported as an override
        // (the end-to-end test serves a small database from a local server this way).
        distBase: window.DG_DIST_BASE || '/mobile-data',

        // Native-only seams, defined here as no-ops so app.js can call them unconditionally
        // (dg-app-full's src/platform.js is the implementation — it loads FIRST and this file
        // returns early, so these defaults only ever run on the site):
        //  - onlineBase: prefix for "this needs the internet" requests when the page's own origin
        //    has no server behind it (the app's https://localhost). The site IS the server.
        //  - mapStatic(p): rewrite an API URL the native build ships as a bundled file (TOC
        //    snapshots, Patimokkha fragments). The site computes both at request time.
        onlineBase: '',
        mapStatic: null,

        // Is the reader OK with the download?
        //
        // Wi-Fi: the answer is already yes — the transfer only ever starts from "Download now" in
        // Settings, with the size written next to it, and asking again would be theatre.
        //
        // Metered (cellular, or Data Saver on): ask for real. Owner started a download on mobile
        // data in the browser and it went straight through — a 509MB transfer is exactly what a
        // confirmation is for, and the site has the same sheet the native build uses
        // (offline-status.js renders it on `dg:need-consent`, with the size from the published
        // manifest). Where the Network Information API is missing (iOS Safari), nothing is asked:
        // guessing "you are probably on cellular" would train the reader to dismiss dialogs.
        askConsent: function (info) {
            if (!onMeteredConnection()) return Promise.resolve(true);
            return manifestBytes(info).then(function (bytes) {
                return new Promise(function (resolve) {
                    window.dispatchEvent(new CustomEvent('dg:need-consent', {
                        detail: { resolve: resolve, bytes: bytes, langs: info && info.langs },
                    }));
                });
            });
        },
    };

    // navigator.connection (Network Information API): Chrome/Android implement `type`, which is the
    // only honest signal here — `effectiveType: '4g'` is true of Wi-Fi as well, so keying on it
    // would ask the wrong readers. saveData is a direct request from the reader, so it always asks.
    function onMeteredConnection() {
        var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!c) return false;
        if (c.saveData) return true;
        return c.type === 'cellular';
    }

    // The real size of the file that is about to cross the connection, from the published
    // manifest (a few hundred bytes). app.js calls askConsent({}) — its own consent is a Settings
    // button with the number next to it — so without this the sheet could only guess.
    function manifestBytes(info) {
        if (info && info.bytes) return Promise.resolve(info.bytes);
        var base = (window.dgPlatform && window.dgPlatform.distBase) || '/mobile-data';
        return fetch(base.replace(/\/$/, '') + '/db-manifest.json')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (m) { return m && m.bytes ? m.bytes : null; })
            .catch(function () { return null; });
    }
})();
