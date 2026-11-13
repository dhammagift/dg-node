// A recording played on the page (the Pātimokkha's sections, any <audio> in the document) gets the system's player: in the
// browser the media notification with its title, in the Android app the same tray player as the voice (dg-apps src/tts.js
// puts the native one behind navigator.mediaSession) - with it the app is a foreground media app and Android does not stop
// the sound in the background. Before, only the voice had it; a recording played with nothing in the tray (owner
// 2026-11-13: «если я запускаю аудио из приложения, то в трее ничего нет»).
// The voice (voice.js) plays through Audio objects outside the document, so their events never reach this listener and it
// keeps its own session.
(function () {
    'use strict';
    if (!('mediaSession' in navigator)) return;
    var cur = null, lastPos = 0;

    function text(el) { return el ? el.textContent.trim().replace(/\s+/g, ' ') : ''; }
    // the section the player sits in (its heading button names it), and the book it belongs to
    function titleOf(a) {
        var sec = a.closest('.collapse[id]'), head = sec && document.querySelector('[data-bs-target="#' + sec.id + '"]:not(span)');
        var book = a.closest('.toc-book'), bookHead = book && book.querySelector('.toc-book-header');
        return {
            title: text(head) || text(bookHead) || document.title,
            artist: (bookHead ? text(bookHead).replace(/\s*\(\d+\)\s*$/, '') + ' · ' : '') + 'Dhamma.Gift',
        };
    }
    function position(a) {
        if (!navigator.mediaSession.setPositionState || !isFinite(a.duration) || !a.duration) return;
        try { navigator.mediaSession.setPositionState({ duration: a.duration, position: Math.min(a.currentTime, a.duration), playbackRate: a.playbackRate || 1 }); } catch (e) { /* bad numbers mid-load */ }
    }
    function take(a) {
        cur = a;
        var t = titleOf(a), ms = navigator.mediaSession;
        try {
            ms.metadata = new window.MediaMetadata({ title: t.title, artist: t.artist, artwork: [{ src: '/assets/img/pwa-bold-monocolor-192.png', sizes: '192x192', type: 'image/png' }] });
        } catch (e) { /* no MediaMetadata */ }
        var on = function (action, fn) { try { ms.setActionHandler(action, fn); } catch (e) { /* unsupported action */ } };
        on('play', function () { if (cur) cur.play(); });
        on('pause', function () { if (cur) cur.pause(); });
        on('stop', function () { if (cur) { cur.pause(); cur.currentTime = 0; } });
        on('seekto', function (d) { if (cur && d && isFinite(d.seekTime)) cur.currentTime = d.seekTime; });
        on('seekbackward', function () { if (cur) cur.currentTime = Math.max(0, cur.currentTime - 10); });
        on('seekforward', function () { if (cur) cur.currentTime = Math.min(cur.duration || Infinity, cur.currentTime + 10); });
        on('previoustrack', null);
        on('nexttrack', null);
    }
    function isOurs(e) { return e.target instanceof HTMLMediaElement && e.target.isConnected; }

    document.addEventListener('play', function (e) {
        if (!isOurs(e)) return;
        // one recording at a time, as the system player shows one
        document.querySelectorAll('audio, video').forEach(function (m) { if (m !== e.target && !m.paused) m.pause(); });
        take(e.target);
        navigator.mediaSession.playbackState = 'playing';
        position(e.target);
    }, true);
    document.addEventListener('pause', function (e) {
        if (!isOurs(e) || e.target !== cur || e.target.ended) return;
        navigator.mediaSession.playbackState = 'paused';
        position(e.target);
    }, true);
    document.addEventListener('ended', function (e) {
        if (!isOurs(e) || e.target !== cur) return;
        cur = null;
        navigator.mediaSession.playbackState = 'none';   // the app takes 'none' as: take the player down
    }, true);
    document.addEventListener('timeupdate', function (e) {
        if (e.target !== cur || Date.now() - lastPos < 1000) return;
        lastPos = Date.now();
        position(cur);
    }, true);
})();
