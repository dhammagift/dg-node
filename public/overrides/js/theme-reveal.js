/* The theme switch as in Telegram: the new theme opens as a circle from the button that was tapped. The same as the Uposatha
   app (dg-apps uposatha-bridge.js animateThemeSwitch, dg-apps#55), for the site. The theme itself changes synchronously
   (themeswitch.js / the drawer's switch), so the same click is replayed inside a View Transition and the new page is revealed
   through a growing circle. No View Transitions (older browsers) or reduced motion: the plain instant switch, as before.
   The native apps have their own (the Uposatha bridge); two of them would replay the same click twice. */
(function () {
  if (typeof document.startViewTransition !== 'function') return;
  var C = window.Capacitor;
  if (C && C.isNativePlatform && C.isNativePlatform()) return;
  var BUTTONS = '#app-theme, #dg-theme-seg button, .dg-theme-btn-home, #theme-button';
  var replaying = false, running = false;
  // in order: the logos, then the reader's contents button, which stands in the field where the logo is elsewhere
  var LOGOS = '.dg-brand-logo, .dg-shell-logo img, .wordmark .up-mark, .up-shell-logo .up-mark, .dg-shell-toc';
  function origin() {
    var list = document.querySelectorAll(LOGOS);
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (r.width && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) return r;
    }
    return { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  }
  var st = document.createElement('style');
  // the new theme is clipped in over the old one; the page's own colour transitions would show mid-way in the circle
  st.textContent = '::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}'
    + 'html.dg-theme-vt *{transition:none!important}';
  document.head.appendChild(st);
  document.addEventListener('click', function (e) {
    if (replaying || running) return;
    var btn = e.target && e.target.closest && e.target.closest(BUTTONS);
    if (!btn) return;
    if (btn.id === 'app-theme' && document.body.classList.contains('dg-drawer-open')) return; // the share button there
    if (btn.getAttribute('aria-pressed') === 'true') return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // From the button's centre, in fractions of the screen: the font size zooms <html>, and a probe spanning the viewport is
    // read the same way as the button, so the zoom cancels out. 150% of the layer's reference radius passes the farthest corner.
    // Alt+T clicks the hidden #theme-button, which has no place on the screen: the circle then comes from the logo in view
    // (the header's on the home page, the one in the search field elsewhere, the Uposatha mark; in the reader the contents
    // button in its place), else from the middle.
    var r = btn.getBoundingClientRect();
    if (!r.width) r = origin();
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    var v = probe.getBoundingClientRect();
    probe.remove();
    var fx = ((r.left + r.width / 2 - v.left) / (v.width || 1) * 100).toFixed(2), fy = ((r.top + r.height / 2 - v.top) / (v.height || 1) * 100).toFixed(2);
    running = true;
    document.documentElement.classList.add('dg-theme-vt');
    var vt = document.startViewTransition(function () {
      replaying = true;
      try { btn.click(); } finally { replaying = false; }
    });
    vt.ready.then(function () {
      document.documentElement.animate(
        { clipPath: ['circle(0% at ' + fx + '% ' + fy + '%)', 'circle(150% at ' + fx + '% ' + fy + '%)'] },
        { duration: 450, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'both', pseudoElement: '::view-transition-new(root)' });
    }).catch(function () {});
    function done() { running = false; document.documentElement.classList.remove('dg-theme-vt'); }
    vt.finished.then(done, done);
  }, true);
})();
