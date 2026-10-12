// The data of the Uposatha home-screen widgets, in one place for every consumer:
//   - the page (uposatha-calendar.js) hands it to the native apps: window.__upoWidgetData() = build(...) (Android AppWidget, iOS WidgetKit);
//   - the service worker (service-worker.js, importScripts) builds the same data for the Windows 11 Widgets Board (PWA widgets);
//   - test/uposatha-widget.js loads it in Node.
// build(env) -> the contract of uposatha/widget/WIDGET.md in dg-apps (do NOT change its shape: the native apps depend on it).
// card(raw, S, now) -> the same data worked into ready-made strings (ru/en) and what uposatha-widget-svg.js draws the Windows widgets from.
// Nothing here touches the DOM, localStorage or the network: the astronomy library, the core and the settings come in as arguments.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UposathaWidgetData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DAY = 86400000;
  var TWI = { sun: null, civil: -6, nautical: -12, astro: -18 }; // the Sun's depth for dawn and dusk (as on the page)

  // env: { A (Astronomy), C (UposathaCore), tz, loc: {lat, lon}|null, lang: 'ru'|'en', su (by the suttas), lite, showKala, south,
  //        noon: 'sun'|'mid'|'clock', twi: 'sun'|'civil'|'nautical'|'astro', now?: Date }
  // The same calculation as the page's own helpers (edge, aruna, noonFor, endOf in uposatha-calendar.js), written against env.
  function build(env) {
    var A = env.A, C = env.C, tz = env.tz, su = !!env.su, now = env.now || new Date();
    var obs = env.loc ? new A.Observer(env.loc.lat, env.loc.lon, 0) : null;
    var localDay = C.localDay, zonedToUtc = C.zonedToUtc, sunEvent = C.sunEvent, dayNo = C.dayNo, ymdAdd = C.ymdAdd;
    function edge(kind, y, m, d) { // the dawn / dusk of the day by the chosen definition; the sunrise / sunset where the Sun does not reach that depth
      var alt = TWI[env.twi];
      if (obs && alt != null) { var r = A.SearchAltitude('Sun', obs, kind === 'rise' ? 1 : -1, zonedToUtc(y, m, d, 0, tz), 1, alt); if (r) return r.date; }
      return sunEvent(kind, y, m, d, tz, obs);
    }
    function aruna(y, m, d) { // the dawn of the meals: the Sun 6 degrees below the horizon; without a place 05:50
      if (obs) { var r = A.SearchAltitude('Sun', obs, 1, zonedToUtc(y, m, d, 0, tz), 1, -6); if (r) return r.date; var s = sunEvent('rise', y, m, d, tz, obs); if (s) return s; }
      return new Date(zonedToUtc(y, m, d, 6, tz).getTime() - 600000);
    }
    function noonFor(ymd) { // the midday of a civil day by the chosen method (the clock without a place)
      var p = ymd.split('-').map(Number), m = obs ? env.noon : 'clock', noon = null;
      var rise = sun('rise', ymd), set = sun('set', ymd);
      if (m === 'sun') { var h = A.SearchHourAngle('Sun', obs, 0, rise); noon = h && h.time ? h.time.date : null; }
      if (m === 'mid') noon = new Date((rise.getTime() + set.getTime()) / 2);
      return noon || zonedToUtc(p[0], p[1], p[2], 12, tz);
    }
    function endOf(r) { // when the Uposatha ends
      // the modern scheme keeps the calendar day, dawn to dawn (the page: "today" only): it ends where the next day starts
      if (!su) { var nx = rowByYmd[ymdAdd(r.ymd, 1)]; return (nx && nx.at) || sun('rise', ymdAdd(r.ymd, 1)); }
      return (obs && sunEvent('set', r.y, r.m, r.d + 1, tz, obs)) || zonedToUtc(r.y, r.m, r.d + 1, 18, tz); // by the suttas: to the next sunset
    }
    function sun(kind, ymd) { var p = ymd.split('-').map(Number); return edge(kind, p[0], p[1], p[2]) || zonedToUtc(p[0], p[1], p[2], kind === 'rise' ? 6 : 18, tz); }
    var hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    function hm(d) { return d ? hmFmt.format(d) : ''; }
    function ev(d) { return d ? { ms: d.getTime(), ymd: localDay(d, tz), hm: hm(d) } : null; }

    var todayYmd = localDay(now, tz);
    // the Uposathas: from the 1st of this month (the calendar widget marks the whole month; at least 2 days back) through ~11 weeks; the days with the sun: 31 from yesterday (a widget on its own, the app not opened, lives a month)
    var uFrom = ymdAdd(todayYmd.slice(0, 8) + '01', -1); if (uFrom > ymdAdd(todayYmd, -2)) uFrom = ymdAdd(todayYmd, -2);
    var L = C.dataset(uFrom, ymdAdd(todayYmd, 75), { tz: tz, sutta: su, loc: env.loc });
    var rowByYmd = {}; L.rows.forEach(function (r) { rowByYmd[r.ymd] = r; });
    var upos = L.rows.filter(function (r) { return r.uposatha && r.ymd >= uFrom; }).map(function (r) {
      var day = su ? dayNo(r.names[0]) : (r.phase === 0 || r.phase === 2 ? 15 : 8);
      var f = A.MoonPhase(zonedToUtc(r.y, r.m, r.d, 12, tz)) / 360;
      var q = Math.round(f * 4) % 4;
      var phaseName = ['new', 'firstQuarter', 'full', 'lastQuarter'][q];
      return { start: ev(r.at), day: su ? ymdAdd(r.ymd, 1) : r.ymd, end: ev(endOf(r)), lunarDay: day, phaseName: phaseName, phase: +f.toFixed(4) }; // day: the Uposatha's own day (by the suttas it begins the evening before: the page's grid carries it on r.ymd and the date after)
    });
    var days = [];
    function third(a, b, names) { var w = (b - a) / 3; return names.map(function (n, k) { return [n, hm(new Date(a.getTime() + k * w)), hm(new Date(a.getTime() + (k + 1) * w))]; }); }
    for (var i = -1; i < 30; i++) { // from yesterday: the night part that is still running before dawn belongs to yesterday's day (the widgets look it up there)
      var ymd = ymdAdd(todayYmd, i), p = ymd.split('-').map(Number), rise = sun('rise', ymd), set = sun('set', ymd), nextRise = sun('rise', ymdAdd(ymd, 1));
      days.push({ date: ymd, sunrise: ev(rise), noon: ev(noonFor(ymd)), sunset: ev(set), aruna: ev(aruna(p[0], p[1], p[2])),
        parts: third(rise, set, ['pubbanha', 'majjhanhika', 'sayanha']).concat(third(set, nextRise, ['pathama', 'majjhima', 'pacchima'])) });
    }
    // the moon of every day (its phase at midday, 0..1) from the 1st of this month: the calendar widget draws it when asked to
    var m1 = todayYmd.slice(0, 8) + '01', moons = [];
    for (var md = m1; md <= ymdAdd(todayYmd, 75); md = ymdAdd(md, 1)) { var mp = md.split('-').map(Number); moons.push(+(A.MoonPhase(zonedToUtc(mp[0], mp[1], mp[2], 12, tz)) / 360).toFixed(3)); }
    // the lit percent of the moon as the page shows it (A.Illumination: at a new moon the moon passes above or below the sun, so it is
    // not the phase's cosine and not 0), every 3 hours for 30 days: a widget reads "now" between two points
    var LSTEP = 10800000, l0 = Math.floor(now.getTime() / LSTEP) * LSTEP, lit = [];
    for (var li = 0; li <= 240; li++) lit.push(+(A.Illumination('Moon', new Date(l0 + li * LSTEP)).phase_fraction * 100).toFixed(2));
    return { generatedAt: now.toISOString(), tz: tz, settings: { lang: env.lang, bySuttas: su, detail: !env.lite, allMoons: !!env.allMoons, showKala: !!env.showKala, placeSet: !!obs, tzAuto: !!env.tzAuto, south: !!env.south, weekStart: env.firstDay === 0 || env.firstDay === 1 ? env.firstDay : (env.lang === 'ru' ? 1 : 0) },
      today: { ymd: todayYmd, moon: +(A.MoonPhase(now) / 360).toFixed(4) }, uposathas: upos, days: days, moons: { from: m1, phase: moons, lit: { from: l0, step: LSTEP, pct: lit } } };
  }

  // ---------- the Adaptive Card side ----------
  var MOON_N = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  var MOON_S = ['🌑', '🌘', '🌗', '🌖', '🌕', '🌔', '🌓', '🌒'];
  // Words the designer's strings.json does not have (a unit of minutes, "until", "updated", the n-th day).
  var X = {
    ru: { lg1: '● вечер, начало', lg2: '● день упосатхи', min: 'мин', until: 'до', 'in': 'через', upd: 'обновлено', nthDay: function (n) { return n + '-й день'; }, locale: 'ru-RU' },
    en: { lg1: '● evening, begins', lg2: '● Uposatha day', min: 'min', until: 'until', 'in': 'in', upd: 'updated', nthDay: function (n) { return n + 'th day'; }, locale: 'en-GB' },
  };
  function fill(s, o) { return String(s == null ? '' : s).replace(/\{(\w+)\}/g, function (m, k) { return o && k in o ? o[k] : m; }); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // raw: the output of build(); S: strings.json ({ru:{..}, en:{..}}); now: ms. Returns the strings the three templates bind to.
  function card(raw, S, now) {
    now = now == null ? Date.now() : now;
    var lang = raw.settings.lang === 'ru' ? 'ru' : 'en', s = S[lang], x = X[lang], tz = raw.tz, st = raw.settings;
    var hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    function hm(ms) { return hmFmt.format(new Date(ms)); }
    function dayParts(ymd) {
      var o = {};
      new Intl.DateTimeFormat(x.locale, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(Date.parse(ymd)).forEach(function (p) { o[p.type] = p.value.replace(/[.,]/g, ''); });
      return o;
    }
    function dayShort(ymd) { var o = dayParts(ymd); return o.weekday + ' ' + o.day; }
    function dayLong(ymd) { var o = dayParts(ymd); return o.weekday + ' ' + o.day + ' ' + o.month; }
    function span(ms) { // days and hours, no minutes ("1 d 7 h")
      var d = Math.floor(ms / DAY), h = Math.floor(ms % DAY / 3600000);
      return d ? d + ' ' + s['unit.d'] + (h ? ' ' + h + ' ' + s['unit.h'] : '') : h ? h + ' ' + s['unit.h'] : left(ms);
    }
    function left(ms) { var h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000); return h ? h + ' ' + s['unit.h'] + ' ' + m + ' ' + x.min : m + ' ' + x.min; }
    function moon(f) { return (st.south ? MOON_S : MOON_N)[Math.round(f * 8) % 8]; }
    function ymdDiff(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / DAY); }

    var upos = raw.uposathas, days = raw.days;
    var cur = upos.filter(function (u) { return u.start.ms <= now && now < u.end.ms; })[0] || null;
    var ahead = upos.filter(function (u) { return u.start.ms > now; });
    var u0 = cur || ahead[0] || null;

    // kala: from the dawn (aruna) to midday; vikala: from midday to the next dawn
    function kalaOf() {
      var i = -1; days.forEach(function (d, k) { if (d.aruna.ms <= now) i = k; });
      var byClock = st.placeSet ? '' : ' (' + s.byClock + ')';
      if (i >= 0 && now < days[i].noon.ms) return { k: 'kala', short: s['w.kala'] + s['w.untilMid'] + days[i].noon.hm, text: s['w.kala'] + s['w.untilMid'] + days[i].noon.hm + byClock + ' · ' + fill(s.kalaLeft, { left: left(days[i].noon.ms - now) }) };
      var next = i < 0 ? days[0] : days[i + 1];
      return { k: 'vikala', short: s['w.vikala'] + s['w.untilMid'] + (next ? next.aruna.hm : ''), text: s['w.vikala'] + s['w.untilMid'] + (next ? next.aruna.hm : '') };
    }
    var kala = kalaOf();

    // the six parts of the dawn-to-dawn cycle that holds `now` (the cycle before the first day is taken a day back: minutes off at most)
    function cycle() {
      var c = -1; days.forEach(function (d, k) { if (d.sunrise.ms <= now) c = k; });
      var rise, set, rise2;
      if (c < 0) { rise = days[0].sunrise.ms - DAY; set = days[0].sunset.ms - DAY; rise2 = days[0].sunrise.ms; }
      else { rise = days[c].sunrise.ms; set = days[c].sunset.ms; rise2 = days[c + 1] ? days[c + 1].sunrise.ms : rise + DAY; }
      var keys = ['pubbanha', 'majjhanhika', 'sayanha', 'pathama', 'majjhima', 'pacchima'], out = [];
      keys.forEach(function (key, k) {
        var a0 = k < 3 ? rise : set, w = (k < 3 ? set - rise : rise2 - set) / 3, j = k % 3;
        out.push({ key: key, a: Math.round(a0 + j * w), b: Math.round(a0 + (j + 1) * w), night: k > 2 });
      });
      return { parts: out, rise: rise, noon: c < 0 ? days[0].noon.ms - DAY : days[c].noon.ms, set: set };
    }
    var cy = cycle(), part = cy.parts.filter(function (p) { return p.a <= now && now < p.b; })[0] || cy.parts[0];

    // the next Uposathas after the one in focus (six: the large card has the room; the medium one shows the first three)
    function nextLine(u) {
      var ms = u.start.ms - now, when = u === cur ? s.now : ms < DAY ? x['in'] + ' ' + span(ms) : fill(s.inDays, { n: Math.max(1, ymdDiff(raw.today.ymd, u.day)) });
      return { moon: moon(u.phase), ph: u.phase, text: dayShort(u.day) + ' · ' + x.nthDay(u.lunarDay) + ' · ' + when };   // ph: for the drawn mini-moon (uposatha-widget-svg.js)
    }
    var after = ahead.filter(function (u) { return u !== u0; }).slice(0, 6).map(nextLine);
    var focus = u0 ? [nextLine(u0)].concat(after.slice(0, 2)) : [];

    // layer 1: Uposatha + kala
    var u = { title: '', kalaShort: '', moon: u0 ? moon(u0.phase) : moon(raw.today.moon), to: '', count: '', d1: '', d2: '', kala: '', kalaColor: kala.k === 'kala' ? 'Good' : 'Attention', nextTitle: s.next, mode: st.bySuttas ? s['mode.bySuttas'] : s['mode.notBySuttas'], place: st.placeSet ? '' : s['noPlace.assumed'], next: after };
    // The same words as the native widgets (strings w.*): the day is the title ("15th day · coming"), then when, the counter, the moon as it is now, and with
    // details what comes after (the end of this Uposatha, or the next one).
    var mf = raw.today.moon + (now - Date.parse(raw.generatedAt)) / (29.530588853 * DAY); mf = ((mf % 1) + 1) % 1;
    var ph = mf < 0.02 || mf > 0.98 ? 0 : mf < 0.23 ? 1 : mf < 0.27 ? 2 : mf < 0.48 ? 3 : mf < 0.52 ? 4 : mf < 0.73 ? 5 : mf < 0.77 ? 6 : 7;
    u.moon = moon(mf); u.ph = mf;
    if (u0) {
      u.title = fill(s['w.dayN'], { n: u0.lunarDay }) + ' · ' + (cur ? s.now : s['w.coming']);
      u.to = cur ? dayLong(u0.end.ymd) + ' · ' + fill(s['w.until'], { time: u0.end.hm }) : dayLong(u0.start.ymd) + ' · ' + fill(s['w.from'], { time: u0.start.hm });
      u.count = span(cur ? cur.end.ms - now : u0.start.ms - now);
      u.d1 = s['w.ph' + ph] + ' · ' + Math.round((1 - Math.cos(2 * Math.PI * mf)) / 2 * 100) + '%';
      if (st.detail) u.d2 = cur ? (ahead[0] ? fill(s['w.next'], { n: fill(s['w.ord'], { n: ahead[0].lunarDay }), day: dayLong(ahead[0].start.ymd) }) : '') : fill(s['w.ends'], { day: dayLong(u0.end.ymd), time: u0.end.hm });
    } else u.title = s['layer.uposatha'];
    if (st.showKala) { u.kala = kala.text; u.kalaShort = kala.short; }   // kalaShort: beside the drawn moon, where the long line does not fit

    // layer 2: day and night
    var pi = cy.parts.indexOf(part);
    var n = { title: s['layer.daynight'].toUpperCase(), part: s['part.' + part.key], until: s['part.' + part.key] + ' · ' + x.until + ' ' + hm(part.b),
      frac: Math.max(0, Math.min(1, (now - cy.parts[0].a) / (cy.parts[5].b - cy.parts[0].a))),   // where now is on the scale from sunrise to the next sunrise
      kala: kala.text, kalaColor: kalaColorOf(kala), marks: s.sunrise + ' ' + hm(cy.rise) + ' · ' + s.noon + ' ' + hm(cy.noon) + ' · ' + s.sunset + ' ' + hm(cy.set),
      bar: cy.parts.map(function (p, k) { return { w: Math.max(1, Math.round((p.b - p.a) / 60000)), s: k === pi ? 'warning' : p.night ? 'accent' : 'good' }; }),
      list: cy.parts.map(function (p, k) { return { name: s['part.' + p.key], range: hm(p.a) + ' – ' + hm(p.b), cur: k === pi ? s.now : '', w: k === pi ? 'Bolder' : 'Default' }; }) };
    function kalaColorOf(k) { return k.k === 'kala' ? 'Good' : 'Attention'; }

    // layer 3: the month of today; the week starts as in the app (settings.weekStart: 0 Sunday, else Monday)
    var ym = raw.today.ymd.slice(0, 7), first = ym + '-01', dim = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
    var sunFirst = st.weekStart === 0, lead = (new Date(Date.parse(first)).getUTCDay() + (sunFirst ? 0 : 6)) % 7;
    var mark = {}, markPh = {}; // ymd -> 's' (the evening an Uposatha begins) | 'd' (its day); and that Uposatha's moon
    upos.forEach(function (up) {
      var y = up.start.ymd; mark[y] = 's'; markPh[y] = up.phase;
      for (var k = 1; k < 8 && y < up.end.ymd; k++) { y = new Date(Date.parse(y) + DAY).toISOString().slice(0, 10); mark[y] = 'd'; markPh[y] = up.phase; }
    });
    // a cell of the drawn calendar (uposatha-widget-svg.js): the day (0: no day), today, the mark, a day gone by, the moon of its Uposatha
    var blank = { d: 0, today: false, mk: '', past: false, ph: 0 };
    var cells = [], weeks = [];
    for (var k = 0; k < lead; k++) cells.push(blank);
    for (var d = 1; d <= dim; d++) {
      var ymd = ym + '-' + (d < 10 ? '0' : '') + d, isToday = ymd === raw.today.ymd, mk = mark[ymd];
      cells.push({ d: d, today: isToday, mk: mk || '', past: ymd < raw.today.ymd, ph: markPh[ymd] || 0 });
    }
    while (cells.length % 7) cells.push(blank);
    for (var w = 0; w < cells.length; w += 7) weeks.push({ cells: cells.slice(w, w + 7) });
    var mo = cap(new Intl.DateTimeFormat(x.locale, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(Date.parse(first))).replace(/\s*г\.$/, '');
    var m = { title: fill(s['layer.month'], { month: mo }), wd: (sunFirst ? [s.weekdays[6]].concat(s.weekdays.slice(0, 6)) : s.weekdays).map(function (d) { return d.slice(0, 2); }), weeks: weeks, nextTitle: s.next, lg1: x.lg1, lg2: x.lg2, next: focus };

    return { lang: lang, updated: x.upd + ' ' + hm(now), u: u, n: n, m: m };
  }

  return { build: build, card: card, TWI: TWI };
});
