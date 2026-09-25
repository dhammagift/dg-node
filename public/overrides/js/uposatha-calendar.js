// The Uposatha calendar as a page of its own (/uposatha-calendar), also embedded in the docs page.
//
// Uposatha days as the suttas count them (MN 83, AN 3.37): the 14th, 15th and 8th lunar days of each
// half-month, six a month. A lunar day is the tithi: the Moon gains 12 degrees on the Sun per lunar
// day, 30 to a month; days 1-15 are the waxing half, 1-15 again the waning half (the 15th of the
// waning half is the new moon day). A lunar day begins and ends at the exact moment the angle crosses
// a multiple of 12 - not at midnight - so it usually spans two civil dates and lasts 19-26 hours.
// The moments come from astronomy-engine (a real ephemeris, minute accuracy, vendored in
// vendor/astronomy.browser.min.js) and are shown in the reader's own time zone: only the zone matters
// for a date, not the place, so there is no geolocation prompt. The old lunar.html counted from one
// remembered new moon with a mean month and was off by up to ~17 hours.
//
// URL: ?lang=ru|en  ?theme=dark|light  ?view=all  ?embed=1 (no header, reports its height to the parent)
(function () {
  'use strict';
  var A = window.Astronomy;
  var DAY = 86400000;
  var params = new URLSearchParams(location.search);
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  var lang = (params.get('lang') || store('dhammaLanguage') || (navigator.language || 'en')).slice(0, 2) === 'ru' ? 'ru' : 'en';
  var embed = params.get('embed') === '1';
  var themeName = params.get('theme') || store('theme') || 'auto';
  if (themeName === 'auto') themeName = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', themeName === 'dark' ? 'dark' : 'light');
  document.documentElement.lang = lang;
  if (embed) document.body.classList.add('embed');

  var TEXT = {
    en: {
      title: 'Uposatha days',
      sub: 'The 14th, 15th and 8th lunar days of each half-month, as the suttas count them — six a month.',
      tz: 'Time zone', hemisphere: 'Hemisphere', hemispheres: ['Northern', 'Southern'],
      today: 'Today', illuminated: 'illuminated', lunarDay: 'Lunar day', of15: 'of 15',
      halves: ['waxing half', 'waning half'], until: 'until', uposatha: 'Uposatha day',
      viewUposatha: 'Uposatha days', viewAll: 'All lunar days',
      dayOf: function (n, half) { return n + 'th day of the ' + half; },
      dayAll: function (n, half) { return 'Day ' + n + ' · ' + half; },
      fullMoon: 'full moon', newMoon: 'new moon', now: 'now',
      phases: ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'],
      foot: 'Moments are computed astronomically, accurate to about a minute. A lunar day changes when the Moon has gained another 12° on the Sun, not at midnight. A day in the suttas is counted from the evening, so the observance begins on the evening before. Thai, Sri Lankan and Burmese communities calculate their calendars by tradition and can differ by a day — follow your community\'s calendar. To cross-check: <a href="https://www.timeanddate.com/moon/phases/" target="_blank" rel="noopener">Time and Date: Moon Phases</a>.',
      docs: 'The suttas on Uposatha', docsUrl: '/docs/uposatha',
    },
    ru: {
      title: 'Дни упосатхи',
      sub: '14-й, 15-й и 8-й лунные дни каждой половины месяца, как их считают сутты, — шесть в месяц.',
      tz: 'Часовой пояс', hemisphere: 'Полушарие', hemispheres: ['Северное', 'Южное'],
      today: 'Сегодня', illuminated: 'освещено', lunarDay: 'Лунный день', of15: 'из 15',
      halves: ['растущая половина', 'убывающая половина'], until: 'до', uposatha: 'День упосатхи',
      viewUposatha: 'Дни упосатхи', viewAll: 'Все лунные дни',
      dayOf: function (n, half) { return n + '-й день · ' + half; },
      dayAll: function (n, half) { return n + '-й день · ' + half; },
      fullMoon: 'полнолуние', newMoon: 'новолуние', now: 'сейчас',
      phases: ['Новолуние', 'Растущий серп', 'Первая четверть', 'Растущая Луна', 'Полнолуние', 'Убывающая Луна', 'Последняя четверть', 'Убывающий серп'],
      foot: 'Моменты рассчитаны астрономически, с точностью около минуты. Лунный день меняется, когда Луна уходит от Солнца ещё на 12°, а не в полночь. День в суттах считается с вечера, поэтому соблюдение начинается вечером накануне. Тайские, шри-ланкийские и бирманские общины считают календари по традиции и могут отличаться на день — ориентируйтесь на календарь своей общины. Для сверки: <a href="https://www.timeanddate.com/moon/phases/" target="_blank" rel="noopener">Time and Date: Moon Phases</a>.',
      docs: 'Сутты об упосатхе', docsUrl: '/ru/docs/uposatha',
    },
  };
  var t = TEXT[lang];

  // Moon emoji as in lunarphase-js (the reference): eight phases, and the lit side flips in the
  // Southern Hemisphere (a waxing crescent in the north looks like a waning one in the south).
  var PHASES_NORTH = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  var PHASES_SOUTH = ['🌑', '🌘', '🌗', '🌖', '🌕', '🌔', '🌓', '🌒'];
  // Which of the eight phases each lunar day shows: 1 new-ish, 2-7 crescent, 8 quarter, 9-14 gibbous (the
  // 14th the last not-yet-full shape), 15 full (waxing half) / new (waning half).
  function dayPhase(waxing, n) {
    if (waxing) return n === 1 ? 0 : n <= 7 ? 1 : n === 8 ? 2 : n <= 14 ? 3 : 4;
    return n <= 7 ? 5 : n === 8 ? 6 : n <= 14 ? 7 : 0;
  }
  var SOUTHERN_ZONE = /^(Australia|Antarctica)\/|^Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Noumea|Tahiti|Port_Moresby)|^Africa\/(Johannesburg|Maseru|Mbabane|Windhoek|Harare|Lusaka|Maputo)|^America\/(Sao_Paulo|Argentina|Buenos_Aires|Santiago|Lima|La_Paz|Asuncion|Montevideo)/;
  var UPOSATHA = [8, 14, 15, 23, 29, 30]; // tithi numbers of the 8th, 14th, 15th of the waxing half, then of the waning half

  var detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  var state = {
    tz: store('dgUposathaTz') || detected,
    south: null,
    view: params.get('view') === 'all' ? 'all' : (store('dgUposathaView') || 'uposatha'),
  };
  var hemi = store('dgUposathaHemisphere');
  state.south = hemi ? hemi === 'south' : SOUTHERN_ZONE.test(state.tz);
  var zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  if (zones.indexOf(detected) === -1) zones = [detected].concat(zones);
  if (zones.indexOf(state.tz) === -1) zones = [state.tz].concat(zones);

  function localDay(date, tz) { return date.toLocaleDateString('en-CA', { timeZone: tz }); } // yyyy-mm-dd, sortable

  // The lunar days that have not ended yet, up to the end of the shown months, with the exact moments each
  // starts and ends. One pass over the boundaries: lunar day n runs from crossing (n-1)*12 to n*12 degrees.
  function lunarDays(now, tz, all) {
    var out = [], months = {}, monthCount = 0, limit = all ? 2 : 3;
    var boundary = A.SearchMoonPhase(0, new Date(now.getTime() - 32 * DAY), 34).date; // a new moon, before now
    for (var guard = 0; guard < 8; guard++) {
      for (var tithi = 1; tithi <= 30; tithi++) {
        var start = boundary;
        var end = A.SearchMoonPhase((tithi * 12) % 360, start, 3).date;
        boundary = end;
        if (end < now) continue;
        if (!all && UPOSATHA.indexOf(tithi) === -1) continue;
        var month = localDay(start < now ? now : start, tz).slice(0, 7);
        if (!months[month]) { months[month] = true; monthCount++; }
        if (monthCount > limit) return out;
        var waxing = tithi <= 15;
        out.push({ day: waxing ? tithi : tithi - 15, waxing: waxing, start: start, end: end, month: month, uposatha: UPOSATHA.indexOf(tithi) !== -1 });
      }
    }
    return out;
  }

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function render() {
    var now = new Date();
    var tz = state.tz;
    var emoji = state.south ? PHASES_SOUTH : PHASES_NORTH;
    var angle = A.MoonPhase(now);
    var phaseIndex = Math.floor(((angle + 22.5) % 360) / 45);
    var tithi = Math.floor(angle / 12) + 1;
    var waxingNow = tithi <= 15;
    var lunarDay = waxingNow ? tithi : tithi - 15;
    var dayEnds = A.SearchMoonPhase((tithi * 12) % 360, now, 3);
    var isUposatha = lunarDay === 8 || lunarDay === 14 || lunarDay === 15;
    var percent = Math.round(A.Illumination('Moon', now).phase_fraction * 100);

    var dateFmt = new Intl.DateTimeFormat(lang, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var stampFmt = new Intl.DateTimeFormat(lang, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    var endFmt = new Intl.DateTimeFormat(lang, { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
    var zoneParts = new Intl.DateTimeFormat(lang, { timeZone: tz, timeZoneName: 'short' }).formatToParts(now);
    var zoneName = (zoneParts.filter(function (p) { return p.type === 'timeZoneName'; })[0] || {}).value || '';
    var monthFmt = new Intl.DateTimeFormat(lang, { timeZone: tz, month: 'long', year: 'numeric' });
    var relFmt = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    var todayMs = Date.parse(localDay(now, tz));

    var all = state.view === 'all';
    var days = lunarDays(now, tz, all);
    var html = '';
    html += '<div class="today"><span class="moon" aria-hidden="true">' + emoji[phaseIndex] + '</span><div>' +
      '<strong>' + t.today + ':</strong> ' + esc(dateFmt.format(now)) + '<br>' +
      '<span class="muted">' + t.phases[phaseIndex] + ', ' + percent + '% ' + t.illuminated + '</span><br>' +
      '<strong>' + t.lunarDay + ' ' + lunarDay + '</strong> ' + t.of15 + ', ' + t.halves[waxingNow ? 0 : 1] +
      (dayEnds ? ' <span class="muted">· ' + t.until + ' ' + esc(endFmt.format(dayEnds.date)) + '</span>' : '') +
      (isUposatha ? '<span class="badge">' + t.uposatha + '</span>' : '') + '</div></div>';
    html += '<div class="controls"><label>' + t.tz + ': <select id="tz">' +
      zones.map(function (z) { return '<option' + (z === tz ? ' selected' : '') + '>' + esc(z) + '</option>'; }).join('') +
      '</select></label><label>' + t.hemisphere + ': <select id="hemi"><option value="north"' + (state.south ? '' : ' selected') + '>' + t.hemispheres[0] +
      '</option><option value="south"' + (state.south ? ' selected' : '') + '>' + t.hemispheres[1] + '</option></select></label></div>';
    html += '<div class="tabs"><button data-view="uposatha" aria-pressed="' + (!all) + '">' + t.viewUposatha + '</button>' +
      '<button data-view="all" aria-pressed="' + all + '">' + t.viewAll + '</button></div>';

    var lastMonth = '';
    days.forEach(function (d, i) {
      if (d.month !== lastMonth) {
        if (lastMonth) html += '</ul>';
        html += '<h2>' + esc(monthFmt.format(d.start < now ? now : d.start)) + '</h2><ul class="' + (all ? 'all' : '') + '">';
        lastMonth = d.month;
      }
      var ongoing = d.start <= now;
      var away = Math.round((Date.parse(localDay(d.start, tz)) - todayMs) / DAY);
      var note = d.day === 15 ? (d.waxing ? t.fullMoon : t.newMoon) : '';
      var title = (all ? t.dayAll : t.dayOf)(d.day, t.halves[d.waxing ? 0 : 1]);
      html += '<li class="row' + (d.uposatha ? ' upo' : '') + (ongoing ? ' now' : '') + '"><span class="e" aria-hidden="true">' + emoji[dayPhase(d.waxing, d.day)] + '</span>' +
        '<span class="t"><span class="ttl"><strong>' + esc(title) + '</strong>' + (note ? '<span class="muted">· ' + note + '</span>' : '') +
        (all && d.uposatha ? '<span class="badge">' + t.uposatha + '</span>' : '') + '</span>' +
        '<span class="when">' + esc(stampFmt.format(d.start)) + ' – ' + esc(stampFmt.format(d.end)) + ' ' + esc(zoneName) + '</span></span>' +
        '<span class="away">' + (ongoing ? t.now : esc(relFmt.format(away, 'day'))) + '</span></li>';
    });
    if (lastMonth) html += '</ul>';
    el('app').innerHTML = html;

    el('tz').onchange = function (e) { state.tz = e.target.value; store('dgUposathaTz', state.tz); render(); };
    el('hemi').onchange = function (e) { state.south = e.target.value === 'south'; store('dgUposathaHemisphere', e.target.value); render(); };
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
      b.onclick = function () { state.view = b.getAttribute('data-view'); store('dgUposathaView', state.view); render(); };
    });
    reportHeight();
  }

  function reportHeight() {
    if (embed && parent !== window) parent.postMessage({ dgUposathaHeight: document.documentElement.scrollHeight }, '*');
  }

  el('title').textContent = t.title;
  document.title = t.title + ' — Dhamma.gift';
  el('sub').innerHTML = esc(t.sub) + ' <a href="' + t.docsUrl + '">' + t.docs + ' →</a>';
  el('foot').innerHTML = t.foot;
  if (embed) { el('head').style.display = 'none'; el('foot').style.display = 'none'; }
  render();
  window.addEventListener('resize', reportHeight);
})();
