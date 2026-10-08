/* Wide mode of the one interface: body.wide on a desktop (1024px+ with a mouse) or the app on a wide screen (body.wide-app), the screen in the address (#list, #cal, #parts, #keys),
   keys 1-5 for the screens, the name in the bar leads to the summary. Loaded after app-nav.js. */
(function () {
  // Wide: the desktop web page (a wide screen with a mouse), or the app on a wide screen (the native app, an installed PWA,
  // ?app=1: a tablet in landscape), which keeps the app's bar, bottom capsule and drawer (body.wide-app, app-wide.css).
  // A tablet's browser page has a touch screen as its main pointer and keeps the phone layout in both orientations.
  var desk = matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)'), mq = matchMedia('(min-width: 1024px)'), ORDER = ['home', 'list', 'cal', 'parts', 'keys'];
  var C = window.Capacitor, appLike = !!(C && C.isNativePlatform && C.isNativePlatform()) || new URLSearchParams(location.search).get('app') === '1'
    || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function wide() {
    var w = mq.matches && (appLike || desk.matches);
    document.body.classList.toggle('wide', w);
    document.body.classList.toggle('wide-app', w && appLike);
  }
  wide();
  [mq, desk].forEach(function (m) { m.addEventListener('change', function () { wide(); window.dispatchEvent(new Event('resize')); }); });
  function go(k) { var b = document.querySelector('#appnav [data-tab="' + k + '"]'); if (b && document.body.getAttribute('data-app-tab') !== k) b.click(); }
  window.addEventListener('load', function () {
    var nav = document.getElementById('appnav'); if (!nav) return;
    // the mirror, bowl and brush art goes under the questions, so on a wide screen it stays in their column beside the reader
    var art = document.querySelector('main.page > .keys-art'), kl = document.getElementById('keylist'); if (art && kl) kl.after(art);
    var h = location.hash.slice(1); if (ORDER.indexOf(h) > 0) go(h);
    // support can send a link straight to a screen; the summary keeps the bare address
    // the reader beside the questions: the prod observer was bound while it was hidden, so the first passage is loaded here
    function reader() {
      if (!document.body.classList.contains('wide') || document.body.classList.contains('wide-app') || document.body.getAttribute('data-app-tab') !== 'keys') return;
      var f = document.getElementById('rd-frame'), s = document.getElementById('rd-sel');
      if (f && !f.getAttribute('src') && s && s.onchange && s.options.length) { s.value = '0'; s.onchange({ target: s }); }
    }
    function sync() {
      var k = document.body.getAttribute('data-app-tab'); if (!k) return;
      var want = k === 'home' ? '' : '#' + k;
      if (location.hash !== want) history.replaceState(null, '', location.pathname + location.search + want);
      reader();
    }
    // The reader in the frame focuses its own search field when a text loads, and the keys 1-5 then went to the frame.
    // Focus that moves into the frame while the mouse is not over it was not the reader's doing: it is taken back.
    var frame = document.getElementById('rd-frame'), overFrame = false;
    if (frame) {
      frame.addEventListener('mouseenter', function () { overFrame = true; });
      frame.addEventListener('mouseleave', function () { overFrame = false; });
      window.addEventListener('blur', function () {
        setTimeout(function () {
          if (document.body.classList.contains('wide') && document.activeElement === frame && !overFrame) { frame.blur(); window.focus(); }
        }, 0);
      });
    }
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-app-tab'] });
    sync();
    mq.addEventListener('change', reader);
    window.addEventListener('hashchange', function () { var k = location.hash.slice(1) || 'home'; if (ORDER.indexOf(k) >= 0) go(k); });
    document.addEventListener('keydown', function (e) {
      if (!document.body.classList.contains('wide') || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target.closest && e.target.closest('input,select,textarea,[contenteditable]')) return;
      var i = '12345'.indexOf(e.key); if (i >= 0) go(ORDER[i]);
    });
    nav.addEventListener('mouseover', function (e) { var b = e.target.closest('button'); if (!b) return; var i = ORDER.indexOf(b.getAttribute('data-tab')); if (i >= 0) b.title = b.textContent.trim() + ' (' + (i + 1) + ')'; });
    var wm = document.getElementById('wordmark'); if (wm) wm.addEventListener('click', function () { if (document.body.classList.contains('wide')) go('home'); });
  });
})();
