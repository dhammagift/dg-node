/* Слой «приложение»: иконки вкладок, переходы, рябь, заставка. Навешивается после прод-скрипта
   (на load — к этому моменту uposatha-calendar.js уже раздал onclick вкладкам) и оборачивает его обработчики,
   ничего не заменяя по сути. Параметры для макета: ?embed=1 (без заставки), ?tab=, ?theme=dark|light, ?splash=loop. */
(function () {
  var P = new URLSearchParams(location.search), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EMPH_DEC = 'cubic-bezier(.05,.7,.1,1)', EMPH_ACC = 'cubic-bezier(.3,0,.8,.15)';
  var ORDER = ['home', 'list', 'cal', 'parts', 'keys']; // the settings are the gear of the app bar, not a tab
  // Пары «контур / заливка»: активная вкладка заливает .up-fill, как filled-иконки Material
  var S = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
  var ICONS = {
    home: '<svg class="ic" ' + S + '><path class="up-fill" d="M19.5 14.6A8 8 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1z"/></svg>',
    list: '<svg class="ic" ' + S + '><circle class="up-fill" cx="4.6" cy="6" r="1.9"/><circle class="up-fill" cx="4.6" cy="12" r="1.9"/><circle class="up-fill" cx="4.6" cy="18" r="1.9"/><path d="M9.5 6h11M9.5 12h11M9.5 18h7"/></svg>',
    cal: '<svg class="ic" ' + S + '><rect x="3" y="4.5" width="18" height="16.5" rx="3.5"/><path class="up-fill" d="M3 8a3.5 3.5 0 0 1 3.5-3.5h11A3.5 3.5 0 0 1 21 8v2H3z"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/><circle cx="12" cy="15.5" r="1.7" fill="currentColor" stroke="none"/></svg>',
    parts: '<svg class="ic" ' + S + '><path class="up-fill" d="M5 17a7 7 0 0 1 14 0z"/><path d="M2.5 17h19M12 4.5v2.5M5 9l1.8 1.8M19 9l-1.8 1.8M8 21h8"/></svg>',
    keys: '<svg class="ic" ' + S + '><path class="up-fill" d="M12 6.6C10 5 7 4.4 3.5 4.9v13.2c3.5-.5 6.5.1 8.5 1.7 2-1.6 5-2.2 8.5-1.7V4.9C17 4.4 14 5 12 6.6z"/><path class="up-cut" d="M12 6.6v13"/></svg>'
  };
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function visible(el) { return el && el.getClientRects().length > 0; }

  // The splash is the app's own launch mark (the native one, 890 ms): the whole mark stands still, the clouds part with their cuts
  // and fade, the clean moon pulses once. The clouds cut the moon through a mask; the cuts travel and fade with the clouds.
  function splash(loop) {
    var d = document.createElement('div'); d.id = 'up-splash';
    var K = 'stroke-width="7" stroke-linecap="round" fill="none"', C = 'stroke-width="13" stroke-linecap="round" fill="none" stroke="#000"';
    d.innerHTML = '<svg viewBox="2 7.5 54.5 43.5" aria-hidden="true"><mask id="up-sp-cut" maskUnits="userSpaceOnUse" x="-20" y="0" width="100" height="64"><rect x="-20" width="100" height="64" fill="#fff"/>' +
      '<g class="mvl"><path d="M6,37 H31" ' + C + '/></g><g class="mvr"><path d="M15,47 H43" ' + C + '/></g></mask>' +
      '<g mask="url(#up-sp-cut)"><circle class="mn" cx="39" cy="25" r="17" fill="var(--dg-navy-ink)"/></g>' +
      '<g stroke="var(--dg-text-muted)"><g class="mvl"><path d="M6,37 H31" ' + K + '/></g><g class="mvr"><path d="M15,47 H43" ' + K + '/></g><g class="mvd"><path d="M50,47 H53" ' + K + '/></g></g></svg><b>Uposatha</b>';
    document.body.appendChild(d);
    setTimeout(function () {
      d.classList.add('out');
      setTimeout(function () { d.remove(); if (loop) setTimeout(function () { splash(true); }, 700); }, 340);
    }, 1500);
  }

  function ripple(e) {
    var el = e.target.closest('body.app :is(.pillbtn,.td,.more button,.rb,.grid .c,.segrow button,.appnav button)');
    if (!el || reduce) return;
    if (el.matches('.appnav button')) el = el.querySelector('i');
    var z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1; // the size setting zooms the page: a rect is in screen pixels, the ripple in local ones
    var r = el.getBoundingClientRect(), s = Math.max(r.width, r.height) / z * 2.2, sp = document.createElement('span');
    sp.className = 'up-rip'; sp.style.cssText = 'width:' + s + 'px;height:' + s + 'px;left:' + ((e.clientX - r.left) / z - s / 2) + 'px;top:' + ((e.clientY - r.top) / z - s / 2) + 'px';
    el.appendChild(sp); setTimeout(function () { sp.remove(); }, 520);
  }

  // Что каскадом въезжает на каждой вкладке (в пределах экрана — дальше смысла нет)
  var ENTER = {
    home: ['.intro', '#up-hero .hk', '#up-hero .cd > span', '#up-hero .hn', '#s-summary', '.ctx', '#slides'],
    list: ['#list > *', '#s-list .more'],
    cal: ['.calh', '#grid', '#legend', '#detail'],
    parts: ['.parts-h', '#pgrid > *', '#pnote'],
    keys: ['#keys > h2', '#keys > .sub', '#keylist > li', '#reader']
  };
  function enter(tab, dir) {
    var els = [];
    (ENTER[tab] || []).forEach(function (s) { $$(s).forEach(function (el) { if (visible(el) && el.getBoundingClientRect().top < innerHeight) els.push(el); }); });
    els.forEach(function (el, i) {
      el.animate([{ opacity: 0, transform: 'translateX(' + dir * 32 + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 400, delay: Math.min(i, 7) * 38, easing: EMPH_DEC, fill: 'backwards' });
    });
    var moon = document.querySelector('#up-hero .hm');
    if (tab === 'home' && moon) moon.animate([{ transform: 'translateY(24px) rotate(-24deg) scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 900, easing: EMPH_DEC, fill: 'backwards' });
  }

  // Герой сводки: крупная луна + обратный отсчёт до начала ближайшей упосатхи.
  // Данные не считаем заново — берём из уже отрисованного списка (#list li.row: data-ymd + «(18:00)» в строке «Начало»).
  var RU = function () { var l = P.get('lang') || localStorage.getItem('dhammaLanguage') || document.documentElement.lang || ''; return /^ru/.test(l); };
  function nextStart() {
    var now = Date.now(), rows = $$('#list li.row');
    for (var i = 0; i < rows.length; i++) {
      var ymd = rows[i].getAttribute('data-ymd'), m = /\((\d{1,2}):(\d{2})\)/.exec(rows[i].textContent || '');
      if (!ymd) continue;
      var d = new Date(ymd + 'T00:00:00'); d.setHours(m ? +m[1] : 18, m ? +m[2] : 0);
      if (d.getTime() > now) return { at: d, name: (rows[i].querySelector('.t b') || {}).textContent || '', now: !!document.querySelector('#list li.row[data-now=true]') };
    }
    return null;
  }
  function hero() {
    var sum = document.getElementById('s-summary'); if (!sum) return;
    var h = document.getElementById('up-hero');
    if (!h) {
      h = document.createElement('section'); h.id = 'up-hero';
      h.innerHTML = '<div class="hm"><span class="halo"></span><span class="mv"></span></div><p class="hk"></p><div class="ht"></div><p class="hn"></p><p class="hc"></p><div class="cd"><span data-u="d"><b></b><i></i></span><span data-u="h"><b></b><i></i></span><span data-u="m"><b></b><i></i></span></div>';
      sum.parentNode.insertBefore(h, sum);
    }
    var src = document.getElementById('t-moon'), mv = h.querySelector('.mv');
    if (src && mv.innerHTML !== src.innerHTML) mv.innerHTML = src.innerHTML;
    var dd = document.getElementById('t-date'), ph = document.getElementById('t-phase');
    if (dd && ph) { var ht = '<p class="hd">' + dd.textContent + '</p><p class="hp">' + ph.innerHTML.replace(/ id="[^"]*"/g, '') + '</p>'; var hEl = h.querySelector('.ht'); if (hEl.innerHTML !== ht) hEl.innerHTML = ht; }
    var ru = RU(), H = window.__upoHero, n = H ? (H.next && { at: new Date(H.next.at), name: H.next.name, cur: H.cur }) : nextStart(), U = ru ? ['дн', 'ч', 'мин'] : ['d', 'h', 'min'];
    // the page knows which Uposatha runs now and which is next (the list is not parsed when it says so)
    var curName = H && H.cur ? H.cur.split(' · ')[0].split(' of the ')[0] : '';
    h.querySelector('.hk').textContent = curName ? (ru ? 'Сегодня упосатха · ' : 'Uposatha today · ') + curName : '';
    h.querySelector('.hc').textContent = ru ? (curName ? 'До следующей' : 'До начала') : (curName ? 'Until the next one' : 'Until it begins');
    var left = n ? Math.max(0, n.at - Date.now()) : 0, v = [Math.floor(left / 864e5), Math.floor(left / 36e5) % 24, Math.floor(left / 6e4) % 60];
    $$('.cd > span', h).forEach(function (s, i) {
      var b = s.querySelector('b'), val = String(v[i]).padStart(i ? 2 : 1, '0');
      s.querySelector('i').textContent = U[i];
      if (b.textContent !== val) { var first = !b.textContent; b.textContent = val; if (!first && !reduce) b.animate([{ transform: 'translateY(-60%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: EMPH_DEC }); }
    });
    h.querySelector('.hn').textContent = n ? ((ru ? (curName ? 'Следующая: ' : 'Ближайшая: ') : 'Next: ') + n.name + ' · ' + n.at.toLocaleString(ru ? 'ru-RU' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })) : '';
  }

  // The logo in the corner of the bar plays the launch mark again every 3-4 minutes: the clouds part and come back, the moon pulses once
  function logoLoop() {
    var old = document.querySelector('.tbar .wordmark .up-mark'); if (!old || reduce) return;
    var K = 'stroke-width="7" stroke-linecap="round" fill="none"', C = 'stroke-width="13" stroke-linecap="round" fill="none" stroke="#000"';
    var lg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    lg.setAttribute('class', 'up-mark up-lg'); lg.setAttribute('viewBox', '2 7.5 54.5 43.5'); lg.setAttribute('aria-hidden', 'true');
    lg.innerHTML = '<mask id="up-lg-cut" maskUnits="userSpaceOnUse" x="-20" y="0" width="100" height="64"><rect x="-20" width="100" height="64" fill="#fff"/><g class="mvl"><path d="M6,37 H31" ' + C + '/></g><g class="mvr"><path d="M15,47 H43" ' + C + '/></g></mask>' +
      '<g mask="url(#up-lg-cut)"><circle class="mn" cx="39" cy="25" r="17" fill="var(--dg-navy-ink)"/></g>' +
      '<g stroke="var(--dg-text-muted)"><g class="mvl"><path d="M6,37 H31" ' + K + '/></g><g class="mvr"><path d="M15,47 H43" ' + K + '/></g><g class="mvd"><path d="M50,47 H53" ' + K + '/></g></g>';
    old.replaceWith(lg);
    (function next() {
      setTimeout(function () {
        if (!document.hidden && !document.body.classList.contains('dg-drawer-open')) { lg.classList.add('play'); setTimeout(function () { lg.classList.remove('play'); }, 1900); }
        next();
      }, 180000 + Math.random() * 60000);
    })();
    var wm = lg.closest('.wordmark'); if (wm) wm.addEventListener('click', function (e) { e.preventDefault(); window.__upoLogoPlay(); }); // a tap on the logo plays it too: the page is already open, the link would only reload it
    window.__upoLogoPlay = function () { lg.classList.remove('play'); void lg.getBoundingClientRect(); lg.classList.add('play'); setTimeout(function () { lg.classList.remove('play'); }, 1900); }; // for a check by hand
  }

  function init() {
    var body = document.body, nav = document.getElementById('appnav');
    if (!body.classList.contains('app') || !nav) return;
    body.setAttribute('data-look', P.get('look') || localStorage.getItem('upLook') || 'm3');
    hero(); setInterval(hero, 15000);
    logoLoop();
    new MutationObserver(function () { hero(); }).observe(document.getElementById('list'), { childList: true });
    var tm = document.getElementById('t-moon'); if (tm) new MutationObserver(function () { hero(); }).observe(tm, { childList: true, subtree: true });
    var main = document.querySelector('main.page'), busy = false;
    $$('button', nav).forEach(function (b) {
      var k = b.getAttribute('data-tab'), i = b.querySelector('i');
      if (k === 'settings') return; // opens the drawer, keeps its own handler and never becomes the current tab
      if (ICONS[k] && i) i.innerHTML = ICONS[k];
      var orig = b.onclick;
      b.onclick = function () {
        var from = body.getAttribute('data-app-tab'), ic = b.querySelector('.ic');
        if (ic) { ic.classList.remove('pop'); void ic.offsetWidth; ic.classList.add('pop'); }
        if (from === k) { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); return; }
        if (!reduce && !busy) $$('button', nav).forEach(function (x) { x.setAttribute('aria-current', String(x === b)); }); // the pill leaves at the tap, not after the page has slid out
        if (reduce || busy) { orig.call(b); return; }
        var dir = ORDER.indexOf(k) > ORDER.indexOf(from) ? 1 : -1; busy = true;
        // Выход короче входа (animations.md): 150 мс против 400
        var out = main.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(' + -dir * 24 + 'px)' }], { duration: 150, easing: EMPH_ACC, fill: 'forwards' });
        out.onfinish = function () { orig.call(b); out.cancel(); enter(k, dir); busy = false; };
      };
    });
    // Месяц календаря листается в сторону нажатой стрелки
    [['cal-prev', -1], ['cal-next', 1], ['cal-today', 0]].forEach(function (p) {
      var el = document.getElementById(p[0]); if (!el || !el.onclick) return; var orig = el.onclick;
      el.onclick = function (e) {
        orig.call(el, e); if (reduce) return;
        var d = p[1] || 0, g = document.getElementById('grid'), t = document.getElementById('cal-title');
        [g, t].forEach(function (x) { if (x) x.animate([{ opacity: 0, transform: 'translateX(' + d * 40 + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EMPH_DEC }); });
      };
    });
    document.addEventListener('pointerdown', ripple, true);
    var tab = P.get('tab'), btn = tab && nav.querySelector('[data-tab="' + tab + '"]');
    if (btn) { reduce = true; btn.onclick(); reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; }
    enter(body.getAttribute('data-app-tab') || 'home', 1);
  }

  function theme() {
    if (!inApp()) return;
    document.body.setAttribute('data-look', P.get('look') || localStorage.getItem('upLook') || 'm3');
    var th = P.get('theme'); if (!th) return;
    document.documentElement.setAttribute('data-bs-theme', th); document.documentElement.setAttribute('data-theme', th);
    document.body.classList.toggle('dark', th === 'dark');
  }

  document.addEventListener('DOMContentLoaded', theme);
  var inApp = function () { return document.body.classList.contains('app'); }; // set by uposatha-calendar.js: ?app=1 or the Capacitor app
  if (P.get('splash') === 'loop') document.addEventListener('DOMContentLoaded', function () { if (inApp()) splash(true); });
  else if (!P.get('embed')) document.addEventListener('DOMContentLoaded', function () { if (inApp() && !sessionStorage.getItem('upSplash')) { sessionStorage.setItem('upSplash', '1'); splash(false); } });

  window.addEventListener('load', function () {
    theme(); init(); setTimeout(theme, 400);
    // the page was hidden while it built itself (see the head): show it when the fonts are in and the bar has taken its place
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { setTimeout(function () { requestAnimationFrame(function () { if (window.__upoReveal) window.__upoReveal(); }); }, 130); });
  });
})();
