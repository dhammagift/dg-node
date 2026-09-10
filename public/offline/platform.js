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

        // Is the reader OK with the download?
        //
        // On the site the answer is already yes, and asking again would be theatre: a download
        // here only ever starts because the reader pressed "Download now" in Settings with the
        // size written next to it. The native build is different and asks for real — there the
        // download can be started by the app itself (see dg-app-full's Network plugin check for
        // Wi-Fi vs cellular).
        askConsent: function () { return Promise.resolve(true); },
    };
})();
