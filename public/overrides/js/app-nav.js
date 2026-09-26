/* The bottom bar's moving pill. Whoever changes aria-current (the page's tab handler) — the pill follows: it glides to the new item and
   grows to its width, the items between shift with it (FLIP), the new label fades in, the old one fades out.
   Frequency: tens of times a day, so it is quick (260 ms) and only the pill's own width and its transform are animated (the pill is one
   absolutely positioned, contained element: no layout of the page); the items move by transform only. */
(function () {
  var nav = document.getElementById('appnav'); if (!nav) return;
  var pill = nav.querySelector('.up-pill'), btns = Array.prototype.slice.call(nav.querySelectorAll('button'));
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MOVE = 'cubic-bezier(0.77, 0, 0.175, 1)', OUT = 'cubic-bezier(0.23, 1, 0.32, 1)', D = 260;
  var last = null; // rects of the previous state: { at: navLeft, b: [left of each button], pill: {x, w}, label: {x, y, w, text} }

  function state() {
    var n = nav.getBoundingClientRect(), cur = nav.querySelector('button[aria-current=true]');
    var st = { b: btns.map(function (b) { return b.getBoundingClientRect().left - n.left; }), cur: cur, pill: null, label: null };
    if (cur) {
      var r = cur.getBoundingClientRect(), lab = cur.querySelector('span'), lr = lab && lab.getBoundingClientRect();
      st.pill = { x: r.left - n.left, w: r.width };
      if (lr && lr.width) st.label = { x: lr.left - n.left, w: lr.width, text: lab.textContent };
    }
    return st;
  }
  function paint(st) { // the final place of the pill
    if (!st.pill) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '1'; pill.style.width = st.pill.w + 'px'; pill.style.transform = 'translateX(' + st.pill.x + 'px)';
  }
  function sync(animate) {
    var now = state();
    if (animate && last && !reduce && now.pill && last.pill && pill.animate) {
      pill.animate([{ transform: 'translateX(' + last.pill.x + 'px)', width: last.pill.w + 'px' }, { transform: 'translateX(' + now.pill.x + 'px)', width: now.pill.w + 'px' }], { duration: D, easing: MOVE });
      btns.forEach(function (b, i) { // FLIP: the items were somewhere else a moment ago
        var dx = last.b[i] - now.b[i];
        if (Math.abs(dx) > 1) b.animate([{ transform: 'translateX(' + dx + 'px)' }, { transform: 'none' }], { duration: D, easing: MOVE });
      });
      var lab = now.cur && now.cur.querySelector('span');
      if (lab) lab.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, delay: 130, easing: OUT, fill: 'backwards' });
      if (last.label) { // the label of the item that has just been left: it does not vanish, it fades where it was
        var g = document.createElement('span'); g.className = 'up-ghost'; g.textContent = last.label.text;
        g.style.left = last.label.x + 'px'; g.style.top = '6px'; nav.appendChild(g);
        g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: OUT }).onfinish = function () { g.remove(); };
      }
    }
    paint(now); last = now;
  }
  new MutationObserver(function () { sync(true); }).observe(nav, { attributes: true, attributeFilter: ['aria-current'], subtree: true });
  window.addEventListener('resize', function () { sync(false); });
  document.addEventListener('dhamma:languagechange', function () { setTimeout(function () { sync(false); }, 50); });
  window.addEventListener('load', function () { setTimeout(function () { sync(false); }, 60); setTimeout(function () { sync(false); }, 600); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { sync(false); });
})();
