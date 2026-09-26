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

  // Everything is measured in the bar's own layout pixels (offset*), not by getBoundingClientRect: the site scales the whole page with CSS zoom
  // ("Font size" of the settings, 70-150%), and a rect is in zoomed screen pixels while a transform or a width set on the pill is in local ones.
  function state() {
    var cur = nav.querySelector('button[aria-current=true]');
    var st = { b: btns.map(function (b) { return b.offsetLeft; }), cur: cur, pill: null, label: null };
    if (cur) {
      var lab = cur.querySelector('span');
      st.pill = { x: cur.offsetLeft, w: cur.offsetWidth };
      if (lab && lab.offsetWidth) st.label = { x: cur.offsetLeft + lab.offsetLeft, w: lab.offsetWidth, text: lab.textContent };
    }
    return st;
  }
  function paint(st) { // the final place of the pill
    if (!st.pill) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '1'; pill.style.width = st.pill.w + 'px'; pill.style.transform = 'translateX(' + st.pill.x + 'px)';
  }
  function cancelAll() { // running animations off: the layout is measured as it is, not as it looks in the middle of a move
    pill.getAnimations().forEach(function (a) { a.cancel(); });
    btns.forEach(function (b) { b.getAnimations().forEach(function (a) { a.cancel(); }); var l = b.querySelector('span'); if (l) l.getAnimations().forEach(function (a) { a.cancel(); }); });
  }
  // A narrow screen or a big size setting (the page is zoomed): the bar loses its air step by step, then the label, until the five items fit.
  function fit() {
    nav.classList.remove('tight', 'tighter');
    if (nav.scrollWidth <= nav.clientWidth + 1) return;
    nav.classList.add('tight');
    if (nav.scrollWidth <= nav.clientWidth + 1) return;
    nav.classList.add('tighter');
  }
  function sync(animate) {
    // where everything looks NOW (possibly in the middle of the previous move): that is where the next move starts from, so a quick
    // second tap (settings <-> night-day) continues from the visible place instead of jumping
    var wasTight = nav.className; if (!nav.getAnimations({ subtree: true }).length) fit(); // not in the middle of a glide
    var from = state(), prevLabel = last && last.label;
    // the pill starts from where it is (it is not the new item: its layout has already changed by now); the items from where they were before the change
    var cs = getComputedStyle(pill), moving = pill.getAnimations().length > 0; // where the pill is now, in local pixels (a running glide is included)
    if (parseFloat(cs.width)) from.pill = { x: new DOMMatrix(cs.transform).m41, w: parseFloat(cs.width) };
    if (!moving && last) from.b = last.b;
    cancelAll();
    var now = state();
    if (animate && !reduce && now.pill && from.pill && pill.animate) {
      pill.animate([{ transform: 'translateX(' + from.pill.x + 'px)', width: from.pill.w + 'px' }, { transform: 'translateX(' + now.pill.x + 'px)', width: now.pill.w + 'px' }], { duration: D, easing: MOVE });
      btns.forEach(function (b, i) { // FLIP: the items were somewhere else a moment ago
        var dx = from.b[i] - now.b[i];
        if (Math.abs(dx) > 1) b.animate([{ transform: 'translateX(' + dx + 'px)' }, { transform: 'none' }], { duration: D, easing: MOVE });
      });
      var lab = now.cur && now.cur.querySelector('span');
      if (lab) lab.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 130, delay: 170, easing: OUT, fill: 'backwards' });
      if (prevLabel && prevLabel.text !== (now.label && now.label.text)) { // the label of the item that has just been left: it does not vanish, it fades where it was
        var g = document.createElement('span'); g.className = 'up-ghost'; g.textContent = prevLabel.text;
        g.style.left = prevLabel.x + 'px'; g.style.top = '6px'; nav.appendChild(g);
        g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: OUT }).onfinish = function () { g.remove(); };
      }
    }
    paint(now); last = now;
  }
  new MutationObserver(function () { sync(true); }).observe(nav, { attributes: true, attributeFilter: ['aria-current'], subtree: true });
  var lastW = window.innerWidth; // a phone fires resize when its bars slide in and out on a scroll: only a change of the width moves the items, or a running glide would be cut to a jump
  window.addEventListener('resize', function () { if (window.innerWidth === lastW) return; lastW = window.innerWidth; sync(false); });
  document.addEventListener('dhamma:languagechange', function () { setTimeout(function () { sync(false); }, 50); });
  window.addEventListener('load', function () { setTimeout(function () { sync(false); }, 60); setTimeout(function () { sync(false); }, 600); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { sync(false); });
})();
