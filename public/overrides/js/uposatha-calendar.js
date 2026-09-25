// The Uposatha calendar as a page of its own (/uposatha-calendar), also embedded in the docs page.
//
// Uposatha days as the suttas count them (MN 83, AN 3.37): the 14th, 15th and 8th lunar days of each
// half-month, six a month; a month has 30 lunar days (AN 3.70), 15 to a half, the 15th of the waning half
// being the new moon day. A lunar day is the tithi: the Moon gains 12 degrees on the Sun per lunar day. It
// begins and ends at the exact moment the angle crosses a multiple of 12 - not at midnight - and lasts
// 19-26 hours, so against the calendar dates the number sometimes jumps (a lunar day begins and ends
// between two mornings: it is skipped) or stays (it spans two mornings: it repeats). Which lunar day a
// date is, is therefore read from the real Moon at a fixed moment, never assumed. In the suttas a day is
// counted from the night ("nights and days", AN 3.70), so by default the moment is 18:00 on the evening
// BEFORE the date: the Uposatha of a date begins the evening before and runs through that date. The moments come from astronomy-engine (a real ephemeris, minute accuracy, vendored in
// vendor/astronomy.browser.min.js) and are shown in the reader's own time zone: only the zone matters for
// a date, not the place, so there is no geolocation prompt. The old lunar.html counted from one
// remembered new moon with a mean month and was off by up to ~17 hours.
//
// Two schemes, one switch ("By the suttas", on by default). By the suttas: six days a month, the 14th, 15th and
// 8th lunar days of each half, the day counted from the evening (the night first, through the day to the
// next evening). Modern scheme: four days a month, the calendar dates of the new moon, first quarter, full
// moon and last quarter, the date counted from the morning.
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

  var EN_ORD = { 1: '1st', 2: '2nd', 3: '3rd' };
  var TEXT = {
    en: {
      title: 'Uposatha days',
      sub: 'The 14th, 15th and 8th lunar days of each half-month, as the suttas count them — six a month.',
      tz: 'Time zone', hemisphere: 'Hemisphere', hemispheres: ['Northern', 'Southern'],
      ref: 'Day counted from', refNight: 'the evening before (18:00)', sutta: 'By the suttas', hintSutta: 'Six days a month: the 14th, 15th and 8th lunar days of each half. The day is counted from the evening — the night first, then the day, until the next evening.', hintModern: 'Modern scheme: four days a month — new moon, first quarter, full moon, last quarter — by calendar dates, the date counted from the morning.', events: ['New moon', 'First quarter', 'Full moon', 'Last quarter'], legendModern: 'Moon phase day (new moon, first quarter, full moon, last quarter). The grey figure is the lunar day at 06:00; tap a date for details.', night: 'begins the evening of', tonight: 'The Uposatha begins this evening', today: 'Today', illuminated: 'illuminated', lunarDay: 'Lunar day', of15: 'of 15',
      halves: ['waxing half', 'waning half'], until: 'until', uposatha: 'Uposatha day',
      viewUposatha: 'Uposatha days', viewAll: 'Calendar',
      nth: function (n) { return EN_ORD[n] || n + 'th'; },
      and: ' & ',
      dayOf: function (nth, half) { return nth + ' day of the ' + half; },
      actual: function (n, half, ref) { return 'lunar day ' + n + ', ' + half + ', counted from ' + ref; },
      legend: 'Uposatha day (the 8th, 14th, 15th). The grey figure is the lunar day in force at the chosen time; tap a date for details.',
      pickDate: 'Tap a date',
      fullMoon: 'full moon', newMoon: 'new moon', now: 'today',
      skipped: function (nth) { return nth + ' lunar day is skipped — it begins and ends between two mornings'; },
      repeats: 'the same lunar day as the day before',
      keptWith: function (nth) { return 'the ' + nth + ' day is skipped and kept with this date'; },
      phases: ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'],
      foot: 'Which lunar day a date is, is read from the real Moon at the chosen time of that date. A lunar day lasts 19–26 hours and changes when the Moon has gained another 12° on the Sun, not at midnight, so a day number sometimes jumps or repeats. The Uposatha is kept on the date when the 8th, 14th or 15th lunar day is in force; if such a day begins and ends between two of those moments, it is kept with the following date. A day in the suttas is counted from the evening, so the observance begins on the evening before. Thai, Sri Lankan and Burmese communities calculate their calendars by tradition and can differ by a day — follow your community\'s calendar. To cross-check: <a href="https://www.timeanddate.com/moon/phases/" target="_blank" rel="noopener">Time and Date: Moon Phases</a>.',
      city: 'or a city', cityHint: 'Almaty…',
      locate: 'Use my location', locating: 'Locating…', located: 'Location', forget: 'forget', denied: 'The location was not shared — the fixed times are used.',
      sunrise: 'sunrise', sunset: 'sunset', sunriseFrom: 'sunrise', sunsetBefore: 'sunset the evening before',
      remind: 'Reminders', remindOn: 'Remind me', remindLead: 'in advance', leads: [[1, '1 hour'], [3, '3 hours'], [12, '12 hours'], [24, '1 day'], [48, '2 days']],
      remindDays: 'Days', remindNext: function (when, what) { return 'Next reminder: ' + when + ' — ' + what; }, remindNone: 'No reminder is due in the coming weeks.',
      remindDenied: 'Notifications are blocked for this site — allow them in the browser settings.', remindUnsupported: 'This browser cannot show notifications.',
      remindNote: 'Notifications appear while this app is open or running in the background on your device. For reminders that arrive when it is fully closed, add the days to your phone\'s calendar.',
      ics: 'Add to my calendar (.ics)', remindBody: function (when) { return 'begins ' + when; },
      remindTwo: function (when) { return 'Two Uposatha days: the 14th and the 15th. The first begins ' + when; },
      remindAppNote: 'Reminders are scheduled on this device and arrive even when the app is closed.',
      docs: 'The suttas on Uposatha', docsUrl: '/docs/uposatha',
    },
    ru: {
      title: 'Дни упосатхи',
      sub: '14-й, 15-й и 8-й лунные дни каждой половины месяца, как их считают сутты, — шесть в месяц.',
      tz: 'Часовой пояс', hemisphere: 'Полушарие', hemispheres: ['Северное', 'Южное'],
      ref: 'День считается с', refNight: 'вечера накануне (18:00)', sutta: 'По суттам', hintSutta: 'Шесть дней в месяц: 14-й, 15-й и 8-й лунные дни каждой половины. День считается с вечера — сначала ночь, потом день, до следующего вечера.', hintModern: 'Современная схема: четыре дня в месяц — новолуние, первая четверть, полнолуние, последняя четверть — по календарным датам, дата считается с утра.', events: ['Новолуние', 'Первая четверть', 'Полнолуние', 'Последняя четверть'], legendModern: 'День лунной фазы (новолуние, первая четверть, полнолуние, последняя четверть). Серая цифра — лунный день в 06:00; нажмите на дату, чтобы увидеть подробности.', night: 'начинается вечером', tonight: 'Упосатха начинается сегодня вечером', today: 'Сегодня', illuminated: 'освещено', lunarDay: 'Лунный день', of15: 'из 15',
      halves: ['растущая половина', 'убывающая половина'], until: 'до', uposatha: 'День упосатхи',
      viewUposatha: 'Дни упосатхи', viewAll: 'Календарь',
      nth: function (n) { return n + '-й'; },
      and: ' и ',
      dayOf: function (nth, half) { return nth + ' день · ' + half; },
      actual: function (n, half, ref) { return 'лунный день ' + n + ', ' + half + ', счёт с ' + ref; },
      legend: 'День упосатхи (8-й, 14-й, 15-й). Серая цифра — лунный день, действующий в выбранное время; нажмите на дату, чтобы увидеть подробности.',
      pickDate: 'Нажмите на дату',
      fullMoon: 'полнолуние', newMoon: 'новолуние', now: 'сегодня',
      skipped: function (nth) { return nth + ' лунный день пропущен — он начинается и кончается между двумя утрами'; },
      repeats: 'тот же лунный день, что и накануне',
      keptWith: function (nth) { return nth + ' день пропущен и соблюдается в эту дату'; },
      phases: ['Новолуние', 'Растущий серп', 'Первая четверть', 'Растущая Луна', 'Полнолуние', 'Убывающая Луна', 'Последняя четверть', 'Убывающий серп'],
      foot: 'Какой лунный день у даты, определяется по реальной Луне в выбранное время этой даты. Лунный день длится 19–26 часов и меняется, когда Луна уходит от Солнца ещё на 12°, а не в полночь, поэтому номер дня иногда перескакивает или повторяется. Упосатха соблюдается в дату, когда действует 8-й, 14-й или 15-й лунный день; если такой день начинается и кончается между двумя такими моментами, он соблюдается в следующую дату. День в суттах считается с вечера, поэтому соблюдение начинается вечером накануне. Тайские, шри-ланкийские и бирманские общины считают календари по традиции и могут отличаться на день — ориентируйтесь на календарь своей общины. Для сверки: <a href="https://www.timeanddate.com/moon/phases/" target="_blank" rel="noopener">Time and Date: Moon Phases</a>.',
      city: 'или город', cityHint: 'Almaty…',
      locate: 'Определить моё место', locating: 'Определяю…', located: 'Место', forget: 'забыть', denied: 'Место не передано — используется фиксированное время.',
      sunrise: 'восход', sunset: 'закат', sunriseFrom: 'восхода', sunsetBefore: 'заката накануне вечером',
      remind: 'Напоминания', remindOn: 'Напоминать', remindLead: 'заранее', leads: [[1, 'за 1 час'], [3, 'за 3 часа'], [12, 'за 12 часов'], [24, 'за сутки'], [48, 'за 2 суток']],
      remindDays: 'Дни', remindNext: function (when, what) { return 'Ближайшее напоминание: ' + when + ' — ' + what; }, remindNone: 'В ближайшие недели напоминаний нет.',
      remindDenied: 'Уведомления для сайта запрещены — разрешите их в настройках браузера.', remindUnsupported: 'Этот браузер не умеет показывать уведомления.',
      remindNote: 'Уведомления приходят, пока приложение открыто или работает в фоне на вашем устройстве. Чтобы напоминание пришло и при полностью закрытом приложении, добавьте дни в календарь телефона.',
      ics: 'Добавить в мой календарь (.ics)', remindBody: function (when) { return 'начинается ' + when; },
      remindTwo: function (when) { return 'Две упосатхи: 14-й и 15-й дни. Первая начинается ' + when; },
      remindAppNote: 'Напоминания ставятся на этом устройстве и приходят даже при закрытом приложении.',
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
    ref: store('dgUposathaSutta') === '0' ? 6 : -6, // by the suttas (on by default): 18:00 on the evening before the date; the modern scheme: 06:00
    view: params.get('view') === 'all' ? 'all' : (store('dgUposathaView') || 'uposatha'),
    selected: null,
    loc: (function () { try { return JSON.parse(store('dgUposathaLoc')); } catch (e) { return null; } })(), // {lat, lon} or null
    locMsg: '',
    // reminders: kept on the device; by default a day ahead of the 8th and the 14th day
    rem: (function () { var d = { on: false, lead: 24, d8: true, d14: true }; try { var v = JSON.parse(store('dgUposathaRemind')); if (v) for (var k in d) if (k in v) d[k] = v[k]; } catch (e) { /* defaults */ } return d; })(),
    remMsg: '',
  };
  var hemi = store('dgUposathaHemisphere');
  state.south = hemi ? hemi === 'south' : SOUTHERN_ZONE.test(state.tz);
  var zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  if (zones.indexOf(detected) === -1) zones = [detected].concat(zones);
  if (zones.indexOf(state.tz) === -1) zones = [state.tz].concat(zones);

  var ZONE_COORDS = window.DG_ZONE_COORDS || {};
  function cityName(zone) { return zone.split('/').pop().replace(/_/g, ' '); }
  function cityOptions() { return Object.keys(ZONE_COORDS).sort(function (a, b) { return cityName(a) < cityName(b) ? -1 : 1; }).map(function (z) { return '<option value="' + esc(cityName(z) + ' · ' + z) + '">'; }).join(''); }
  function setPlace(lat, lon) { // the place fixes the Sun; south of the equator flips the moon's shape
    state.loc = { lat: lat, lon: lon }; store('dgUposathaLoc', JSON.stringify(state.loc));
    state.south = lat < 0; store('dgUposathaHemisphere', state.south ? 'south' : 'north');
  }
  function localDay(date, tz) { return date.toLocaleDateString('en-CA', { timeZone: tz }); } // yyyy-mm-dd, sortable

  // The UTC moment of hour `h` on the calendar date y-m-d in `tz`.
  function offsetMs(utcMs, tz) {
    var v = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(utcMs)).forEach(function (p) { v[p.type] = +p.value; });
    return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - utcMs;
  }
  function zonedToUtc(y, m, d, h, tz) {
    var wall = Date.UTC(y, m - 1, d, h, 0, 0), utc = wall;
    for (var i = 0; i < 2; i++) utc = wall - offsetMs(utc, tz);
    return new Date(utc);
  }
  // The Sun's rise / set on the calendar date y-m-d at the observer's place, or null (no place, or the polar day/night).
  function sunEvent(kind, y, m, d, tz, obs) {
    if (!obs) return null;
    var found = A.SearchRiseSet('Sun', obs, kind === 'rise' ? 1 : -1, zonedToUtc(y, m, d, 0, tz), 1);
    return found ? found.date : null;
  }
  function tithiAt(date) { return Math.floor(A.MoonPhase(date) / 12) + 1; } // 1..30

  // One row per calendar date from `from` to `to` (y-m-d, inclusive), with the lunar day in force at `ref` o'clock
  // of that date: what it is, until when it lasts, whether days before it were skipped or it repeats the day
  // before, and the full / new moon falling within the 24 hours from that moment.
  function civilDays(from, to, tz, ref, obs) {
    var f = from.split('-').map(Number), rows = [], prev = null;
    for (var i = -1; ; i++) { // i = -1: the day before, only to tell whether the first date's number jumped
      var c = new Date(Date.UTC(f[0], f[1] - 1, f[2] + i));
      var y = c.getUTCFullYear(), m = c.getUTCMonth() + 1, d = c.getUTCDate();
      var ymd = y + '-' + pad(m) + '-' + pad(d);
      if (ymd > to) break;
      // the moment the lunar day of this date is read at: the real sunset the evening before (by the suttas, ref < 0)
      // or the real sunrise (the modern scheme) where the place is known, the fixed 18:00 / 06:00 otherwise
      var refKind = ref < 0 ? 'evening' : 'morning', at = null;
      if (obs) {
        if (ref < 0) { var pd = new Date(Date.UTC(y, m - 1, d - 1)); at = sunEvent('set', pd.getUTCFullYear(), pd.getUTCMonth() + 1, pd.getUTCDate(), tz, obs); refKind = 'sunset'; }
        else { at = sunEvent('rise', y, m, d, tz, obs); refKind = 'sunrise'; }
      }
      if (!at) { at = zonedToUtc(y, m, d, ref, tz); refKind = ref < 0 ? 'evening' : 'morning'; }
      var tithi = tithiAt(at), waxing = tithi <= 15;
      var row = { ymd: ymd, y: y, m: m, d: d, dow: c.getUTCDay(), at: at, refKind: refKind, tithi: tithi, waxing: waxing, day: waxing ? tithi : tithi - 15,
        ends: A.SearchMoonPhase((tithi * 12) % 360, at, 3), skipped: [], repeats: false };
      if (prev) {
        var gap = (tithi - prev.tithi + 30) % 30;
        row.repeats = gap === 0;
        for (var k = 1; k < gap; k++) row.skipped.push((prev.tithi + k - 1) % 30 + 1);
      }
      var next = new Date(at.getTime() + DAY);
      var fm = A.SearchMoonPhase(180, at, 1.1), nm = A.SearchMoonPhase(0, at, 1.1);
      row.fullMoon = fm && fm.date < next ? fm.date : null;
      row.newMoon = nm && nm.date < next ? nm.date : null;
      // the Uposatha is kept on the date its lunar day is in force; a skipped one is kept with this date
      row.keptWith = row.skipped.filter(function (x) { return UPOSATHA.indexOf(x) !== -1; });
      row.names = row.keptWith.concat(UPOSATHA.indexOf(tithi) !== -1 ? [tithi] : []); // tithi numbers of the Uposatha days kept on this date
      row.uposatha = row.names.length > 0;
      if (i >= 0) rows.push(row);
      prev = row;
    }
    return rows;
  }

  function pad(n) { return ('0' + n).slice(-2); }
  // The modern scheme: the calendar date on which each of the four principal phases falls (in `tz`).
  function markPhases(rows, byYmd, tz, from, to) {
    rows.forEach(function (r) { r.uposatha = false; r.names = []; r.keptWith = []; r.skipped = []; r.repeats = false; });
    var q = A.SearchMoonQuarter(new Date(Date.parse(from) - 2 * DAY));
    for (;;) {
      var at = q.time.date, ymd = localDay(at, tz);
      if (ymd > to) break;
      var r = byYmd[ymd];
      if (r) { r.phase = q.quarter; r.phaseAt = at; r.uposatha = true; }
      q = A.NextMoonQuarter(q);
    }
  }

  // ---- reminders ----
  var timer = null;
  function wantDay(r) { // by the suttas the days are chosen; in the modern scheme every listed day counts
    if (state.ref >= 0) return true;
    return r.names.some(function (x) { var n = dayNo(x); return (n === 8 && state.rem.d8) || (n === 14 && state.rem.d14); });
  }
  // The 14th day is followed by the 15th: its reminder says that there are two Uposathas (the 15th has none of its own).
  function twoUposathas(r, byYmd) {
    if (state.ref >= 0 || !r.names.some(function (x) { return dayNo(x) === 14; })) return false;
    if (r.names.some(function (x) { return dayNo(x) === 15; })) return true;
    var next = byYmd[new Date(Date.parse(r.ymd) + DAY).toISOString().slice(0, 10)];
    return !!(next && next.names.some(function (x) { return dayNo(x) === 15; }));
  }
  function dueList(rows, nameOf, byYmd) {
    var now = Date.now(), lead = state.rem.lead * 3600000;
    return rows.filter(function (r) { return r.uposatha && r.at.getTime() > now && wantDay(r); }).map(function (r) {
      return { key: r.ymd + (state.ref < 0 ? 's' : 'm'), when: r.at.getTime() - lead, start: r.at, title: nameOf(r), two: twoUposathas(r, byYmd) };
    });
  }
  function notify(item) {
    var timeFmt = new Intl.DateTimeFormat(lang, { timeZone: state.tz, weekday: 'short', hour: '2-digit', minute: '2-digit' });
    var opts = { body: (item.two ? t.remindTwo : t.remindBody)(timeFmt.format(item.start)), tag: 'uposatha-' + item.key, icon: '/assets/img/pwa-bold-monocolor-192.png', data: { url: '/uposatha-calendar' } };
    var seen = []; try { seen = JSON.parse(store('dgUposathaNotified') || '[]'); } catch (e) { seen = []; }
    if (seen.indexOf(item.key) !== -1) return;
    seen.push(item.key); store('dgUposathaNotified', JSON.stringify(seen.slice(-40)));
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration('/').then(function (reg) {
      if (reg && reg.showNotification) reg.showNotification(item.title, opts); else new Notification(item.title, opts);
    }).catch(function () { new Notification(item.title, opts); });
    else new Notification(item.title, opts);
  }
  // Show what is due now (a reminder time that passed while the app was closed, before the day begins) and set a
  // timer for the next one; a timer can hold only ~24 days, so the schedule is rebuilt on every render and on focus.
  // In the Android / iOS app the reminders are local notifications scheduled on the device itself: they arrive with the
  // app closed and nothing is kept on our side. (iOS holds 64 pending notifications, hence at most 60 here.)
  var NATIVE_ID_BASE = 7000, nativeSig = '';
  function nativePlugin() {
    var C = window.Capacitor;
    return C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.LocalNotifications ? C.Plugins.LocalNotifications : null;
  }
  function scheduleNative(LN, rows, nameOf, byYmd) {
    var now = Date.now();
    var list = state.rem.on ? dueList(rows, nameOf, byYmd).sort(function (a, b) { return a.when - b.when; }).slice(0, 60) : [];
    var timeFmt = new Intl.DateTimeFormat(lang, { timeZone: state.tz, weekday: 'short', hour: '2-digit', minute: '2-digit' });
    var items = list.map(function (item, i) {
      return { id: NATIVE_ID_BASE + i, title: item.title, body: (item.two ? t.remindTwo : t.remindBody)(timeFmt.format(item.start)),
        schedule: { at: new Date(Math.max(item.when, now + 3000)), allowWhileIdle: true }, extra: { url: '/uposatha-calendar' } };
    });
    var sig = JSON.stringify(items.map(function (i) { return [i.id, i.title, i.schedule.at.getTime() > now + 10000 ? i.schedule.at.getTime() : 0]; }));
    if (sig !== nativeSig) { // only when something changed: render() runs on every touch
      nativeSig = sig;
      LN.getPending().then(function (p) {
        var ours = ((p && p.notifications) || []).filter(function (n) { return n.id >= NATIVE_ID_BASE && n.id < NATIVE_ID_BASE + 100; }).map(function (n) { return { id: n.id }; });
        return ours.length ? LN.cancel({ notifications: ours }) : null;
      }).then(function () { return items.length ? LN.schedule({ notifications: items }) : null; }).catch(function () { nativeSig = ''; });
    }
    return list.filter(function (i) { return i.when > now; })[0] || null;
  }
  function scheduleReminders(rows, nameOf, byYmd) {
    var LN = nativePlugin();
    if (LN) return scheduleNative(LN, rows, nameOf, byYmd);
    clearTimeout(timer);
    if (!state.rem.on || !('Notification' in window) || Notification.permission !== 'granted') return null;
    var now = Date.now(), list = dueList(rows, nameOf, byYmd), next = null;
    list.forEach(function (i) { if (i.when <= now) notify(i); else if (!next || i.when < next.when) next = i; });
    if (next) timer = setTimeout(function () { notify(next); render(); }, Math.min(next.when - now, 2147000000));
    return next;
  }
  function icsEscape(x) { return String(x).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  function icsStamp(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); }
  // A calendar file: one event per Uposatha day, from the start of the observance for a day, with an alarm `lead` ahead.
  function downloadIcs(rows, nameOf) {
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dhamma.gift//Uposatha//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + icsEscape(t.title)];
    rows.filter(function (r) { return r.uposatha && r.at.getTime() > Date.now(); }).forEach(function (r) {
      lines.push('BEGIN:VEVENT', 'UID:uposatha-' + r.ymd + (state.ref < 0 ? '-s' : '-m') + '@dhamma.gift', 'DTSTAMP:' + icsStamp(new Date()),
        'DTSTART:' + icsStamp(r.at), 'DTEND:' + icsStamp(new Date(r.at.getTime() + DAY)), 'SUMMARY:' + icsEscape(t.uposatha + ' — ' + nameOf(r)),
        'DESCRIPTION:' + icsEscape('https://dhamma.gift/uposatha-calendar'));
      if (wantDay(r)) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(nameOf(r)), 'TRIGGER:-PT' + state.rem.lead + 'H', 'END:VALARM');
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
    a.download = 'uposatha.ics';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var FIRST_DAY = lang === 'ru' ? 1 : 0; // weeks start on Monday for ru, Sunday for en
  function halfName(tithi) { return t.halves[tithi <= 15 ? 0 : 1]; }
  function dayNo(tithi) { return tithi <= 15 ? tithi : tithi - 15; }

  function render() {
    var now = new Date();
    var tz = state.tz;
    var emoji = state.south ? PHASES_SOUTH : PHASES_NORTH;
    var angle = A.MoonPhase(now);
    var phaseIndex = Math.floor(((angle + 22.5) % 360) / 45);
    var tithi = tithiAt(now);
    var lunarDay = dayNo(tithi);
    var dayEnds = A.SearchMoonPhase((tithi * 12) % 360, now, 3);
    var percent = Math.round(A.Illumination('Moon', now).phase_fraction * 100);
    var todayYmd = localDay(now, tz);

    var dateFmt = new Intl.DateTimeFormat(lang, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var longUtc = new Intl.DateTimeFormat(lang, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var rowDateFmt = new Intl.DateTimeFormat(lang, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'long' });
    var eveFmt = new Intl.DateTimeFormat(lang, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'long' });
    var weekFmt = new Intl.DateTimeFormat(lang, { timeZone: 'UTC', day: 'numeric', month: 'short' });
    var wdFmt = new Intl.DateTimeFormat(lang, { timeZone: 'UTC', weekday: 'short' });
    var timeFmt = new Intl.DateTimeFormat(lang, { timeZone: tz, hour: '2-digit', minute: '2-digit' });
    var endFmt = new Intl.DateTimeFormat(lang, { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
    var monthFmt = new Intl.DateTimeFormat(lang, { timeZone: 'UTC', month: 'long', year: 'numeric' });
    function monthName(ms) { var n = monthFmt.format(ms); return n.charAt(0).toUpperCase() + n.slice(1); }
    var relFmt = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    var todayMs = Date.parse(todayYmd);

    // this month and the next two, whole months, so the calendar can show its past days too
    var tp = todayYmd.split('-').map(Number);
    var from = tp[0] + '-' + pad(tp[1]) + '-01';
    var last = new Date(Date.UTC(tp[0], tp[1] + 2, 0)); // day 0 of the month after the third = its last day
    var to = last.getUTCFullYear() + '-' + pad(last.getUTCMonth() + 1) + '-' + pad(last.getUTCDate());
    var sutta = state.ref < 0;
    var obs = state.loc ? new A.Observer(state.loc.lat, state.loc.lon, 0) : null;
    var rows = civilDays(from, to, tz, state.ref, obs);
    var byYmd = {};
    rows.forEach(function (r) { byYmd[r.ymd] = r; });
    if (!sutta) markPhases(rows, byYmd, tz, from, to);
    var isUposatha = !!(byYmd[todayYmd] && byYmd[todayYmd].uposatha);
    var tomorrowRow = byYmd[new Date(Date.parse(todayYmd) + DAY).toISOString().slice(0, 10)];
    var tonight = sutta && tomorrowRow && tomorrowRow.uposatha;
    var sunLine = '';
    if (obs) {
      var tp2 = todayYmd.split('-').map(Number);
      var sr = sunEvent('rise', tp2[0], tp2[1], tp2[2], tz, obs), ss = sunEvent('set', tp2[0], tp2[1], tp2[2], tz, obs);
      sunLine = (sr ? t.sunrise + ' ' + timeFmt.format(sr) : '') + (sr && ss ? ' · ' : '') + (ss ? t.sunset + ' ' + timeFmt.format(ss) : '');
    }
    var refLabel = state.ref < 0 ? t.refNight : pad(state.ref) + ':00';

    function notesOf(r) {
      var n = [];
      if (!sutta) { if (r.phaseAt) n.push(t.events[r.phase].toLowerCase() + ' ' + timeFmt.format(r.phaseAt)); return n; }
      if (r.fullMoon) n.push(t.fullMoon + ' ' + timeFmt.format(r.fullMoon));
      if (r.newMoon) n.push(t.newMoon + ' ' + timeFmt.format(r.newMoon));
      r.keptWith.forEach(function (x) { n.push(t.keptWith(t.nth(dayNo(x)))); });
      r.skipped.forEach(function (x) { if (r.keptWith.indexOf(x) === -1) n.push(t.skipped(t.nth(dayNo(x)))); });
      if (r.repeats) n.push(t.repeats);
      return n;
    }
    // the grey line: the lunar day that is really in force, for information and checking
    function refText(r) { // what the lunar day was read at
      if (r.refKind === 'sunset') return t.sunsetBefore + ' ' + timeFmt.format(r.at);
      if (r.refKind === 'sunrise') return t.sunriseFrom + ' ' + timeFmt.format(r.at);
      return refLabel;
    }
    function actualLine(r) {
      var line = t.actual(r.day, halfName(r.tithi), refText(r)) + ' · ' + t.until + ' ' + endFmt.format(r.ends.date);
      if (state.ref < 0) line = t.night + ' ' + eveFmt.format(Date.parse(r.ymd) - DAY) + ' · ' + line;
      return line;
    }
    function nameOf(r) { // "the 8th day of the waning half", "the 14th & 15th day of the waxing half"; the modern scheme: the phase
      if (!sutta) return t.events[r.phase];
      return t.dayOf(r.names.map(function (x) { return t.nth(dayNo(x)); }).join(t.and), halfName(r.names[0]));
    }

    var all = state.view === 'all';
    var nextReminder = scheduleReminders(rows, nameOf, byYmd);
    var inApp = !!nativePlugin();
    var permission = inApp ? 'granted' : 'Notification' in window ? Notification.permission : 'unsupported';
    var html = '';
    html += '<div class="today"><span class="moon" aria-hidden="true">' + emoji[phaseIndex] + '</span><div>' +
      '<strong>' + t.today + ':</strong> ' + esc(dateFmt.format(now)) + '<br>' +
      '<span class="muted">' + t.phases[phaseIndex] + ', ' + percent + '% ' + t.illuminated + '</span><br>' +
      '<strong>' + t.lunarDay + ' ' + lunarDay + '</strong> ' + t.of15 + ', ' + halfName(tithi) +
      (dayEnds ? ' <span class="muted">· ' + t.until + ' ' + esc(endFmt.format(dayEnds.date)) + '</span>' : '') +
      (isUposatha ? '<span class="badge">' + t.uposatha + '</span>' : '') +
      (sunLine ? '<br><span class="muted">' + esc(sunLine) + '</span>' : '') +
      (tonight ? '<br><strong class="accent">' + t.tonight + '</strong>' : '') + '</div></div>';
    html += '<div class="controls"><label>' + t.tz + ': <select id="tz">' +
      zones.map(function (z) { return '<option' + (z === tz ? ' selected' : '') + '>' + esc(z) + '</option>'; }).join('') +
      '</select></label><label>' + t.hemisphere + ': <select id="hemi"><option value="north"' + (state.south ? '' : ' selected') + '>' + t.hemispheres[0] +
      '</option><option value="south"' + (state.south ? ' selected' : '') + '>' + t.hemispheres[1] + '</option></select></label>' +
      '<span class="loc">' + (state.loc ? esc(t.located + ': ' + state.loc.lat + ', ' + state.loc.lon) + ' <a href="#" id="unloc">' + t.forget + '</a>' : '<button type="button" id="loc">📍 ' + t.locate + '</button> ' + t.city + ' <input id="city" list="cities" placeholder="' + t.cityHint + '" size="16"><datalist id="cities">' + cityOptions() + '</datalist>') + '</span>' +
      '<label class="sw"><input type="checkbox" id="sutta"' + (sutta ? ' checked' : '') + '> <strong>' + esc(t.sutta) + '</strong></label></div>' +
      '<p class="legend">' + esc(sutta ? t.hintSutta : t.hintModern) + '</p>' + (state.locMsg ? '<p class="legend">' + esc(state.locMsg) + '</p>' : '');
    var leadOpts = t.leads.map(function (l) { return '<option value="' + l[0] + '"' + (l[0] === state.rem.lead ? ' selected' : '') + '>' + esc(l[1]) + '</option>'; }).join('');
    var dayChecks = sutta ? '<span class="remdays">' + t.remindDays + ': ' + [8, 14].map(function (n) { return '<label class="sw"><input type="checkbox" class="remday" data-day="' + n + '"' + (state.rem['d' + n] ? ' checked' : '') + '> ' + t.nth(n) + '</label>'; }).join(' ') + '</span>' : '';
    html += '<details class="rem"' + (state.rem.on ? ' open' : '') + '><summary>🔔 ' + t.remind + '</summary>' +
      '<div class="controls"><label class="sw"><input type="checkbox" id="remOn"' + (state.rem.on ? ' checked' : '') + '> <strong>' + t.remindOn + '</strong></label>' +
      '<label>' + t.remindLead + ': <select id="remLead">' + leadOpts + '</select></label>' + dayChecks + '</div>' +
      '<p class="legend">' + esc(state.remMsg || (permission === 'denied' ? t.remindDenied : permission === 'unsupported' ? t.remindUnsupported : (state.rem.on && nextReminder ? t.remindNext(new Intl.DateTimeFormat(lang, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(nextReminder.when), nextReminder.title) : (state.rem.on ? t.remindNone : '')))) + '</p>' +
      '<p class="legend">' + esc(inApp ? t.remindAppNote : t.remindNote) + '</p>' + (inApp ? '' : '<button type="button" id="ics" class="pill">📅 ' + t.ics + '</button>') + '</details>';
    html += '<div class="tabs"><button data-view="uposatha" aria-pressed="' + (!all) + '">' + t.viewUposatha + '</button>' +
      '<button data-view="all" aria-pressed="' + all + '">' + t.viewAll + '</button></div>';

    if (!all) {
      // Uposatha days only: month, then week, then the days
      var list = rows.filter(function (r) { return r.uposatha && r.ymd >= todayYmd; });
      var lastMonth = '', lastWeek = '';
      list.forEach(function (r) {
        var month = r.ymd.slice(0, 7);
        var startOffset = (r.dow - FIRST_DAY + 7) % 7;
        var weekStart = new Date(Date.UTC(r.y, r.m - 1, r.d - startOffset));
        var weekKey = weekStart.toISOString().slice(0, 10);
        if (month !== lastMonth) {
          if (lastMonth) html += '</ul>';
          html += '<h2>' + esc(monthName(Date.parse(r.ymd))) + '</h2>';
          lastMonth = month; lastWeek = '';
        }
        if (weekKey !== lastWeek) {
          if (lastWeek) html += '</ul>';
          html += '<h3 class="week">' + esc(weekFmt.format(weekStart) + ' – ' + weekFmt.format(new Date(weekStart.getTime() + 6 * DAY))) + '</h3><ul>';
          lastWeek = weekKey;
        }
        var isToday = r.ymd === todayYmd;
        var away = Math.round((Date.parse(r.ymd) - todayMs) / DAY);
        var first = r.names[0]; // undefined in the modern scheme, which has no lunar-day names
        html += '<li class="row upo' + (isToday ? ' now' : '') + '"><span class="e" aria-hidden="true">' + emoji[sutta ? dayPhase(first <= 15, dayNo(first)) : [0, 2, 4, 6][r.phase]] + '</span>' +
          '<span class="t"><span class="ttl"><strong>' + esc(rowDateFmt.format(Date.parse(r.ymd))) + '</strong><span>' + esc(nameOf(r)) + '</span></span>' +
          '<span class="when">' + esc([actualLine(r)].concat(notesOf(r)).join(' · ')) + '</span></span>' +
          '<span class="away">' + (isToday ? t.now : esc(relFmt.format(away, 'day'))) + '</span></li>';
      });
      if (lastWeek) html += '</ul>';
    } else {
      // the ordinary calendar: whole months, uneven lengths and all, with the Uposatha days marked
      html += '<p class="legend"><span class="key"></span>' + esc(sutta ? t.legend : t.legendModern) + '</p><div class="detail" id="detail"></div>';
      var months = [];
      rows.forEach(function (r) {
        var key = r.ymd.slice(0, 7);
        if (!months.length || months[months.length - 1].key !== key) months.push({ key: key, rows: [] });
        months[months.length - 1].rows.push(r);
      });
      months.forEach(function (mo) {
        html += '<h2>' + esc(monthName(Date.parse(mo.rows[0].ymd))) + '</h2><div class="cal">';
        for (var w = 0; w < 7; w++) html += '<div class="wd">' + esc(wdFmt.format(Date.UTC(2024, 0, 7 + FIRST_DAY + w))) + '</div>'; // 2024-01-07 is a Sunday
        for (var blank = (mo.rows[0].dow - FIRST_DAY + 7) % 7; blank > 0; blank--) html += '<div></div>';
        mo.rows.forEach(function (r) {
          html += '<button type="button" class="cell' + (r.uposatha ? ' upo' : '') + (r.ymd === todayYmd ? ' today' : '') + (r.ymd < todayYmd ? ' past' : '') + '" data-ymd="' + r.ymd + '">' +
            '<span class="n">' + r.d + '</span><span class="l">' + r.day + '</span>' +
            (r.uposatha ? '<span class="ce" aria-hidden="true">' + emoji[sutta ? dayPhase(r.names[0] <= 15, dayNo(r.names[0])) : [0, 2, 4, 6][r.phase]] + '</span>' : '') + '</button>';
        });
        html += '</div>';
      });
    }
    el('app').innerHTML = html;

    function showDetail(ymd) {
      var r = byYmd[ymd], box = el('detail');
      if (!r || !box) return;
      Array.prototype.forEach.call(document.querySelectorAll('.cell'), function (c) { c.classList.toggle('sel', c.getAttribute('data-ymd') === ymd); });
      box.innerHTML = '<strong>' + esc(longUtc.format(Date.parse(ymd))) + '</strong>' +
        (r.uposatha ? '<span class="badge">' + t.uposatha + '</span><br><strong class="accent">' + esc(nameOf(r)) + '</strong>' : '') +
        '<br><span class="when">' + esc([actualLine(r)].concat(notesOf(r)).join(' · ')) + '</span>';
    }
    if (all) {
      Array.prototype.forEach.call(document.querySelectorAll('.cell'), function (c) { c.onclick = function () { showDetail(c.getAttribute('data-ymd')); reportHeight(); }; });
      showDetail(byYmd[state.selected] ? state.selected : todayYmd);
    }

    el('tz').onchange = function (e) { state.tz = e.target.value; store('dgUposathaTz', state.tz); render(); };
    el('hemi').onchange = function (e) { state.south = e.target.value === 'south'; store('dgUposathaHemisphere', e.target.value); render(); };
    if (el('loc')) el('loc').onclick = function () {
      if (!navigator.geolocation) { state.locMsg = t.denied; render(); return; }
      el('loc').textContent = t.locating;
      navigator.geolocation.getCurrentPosition(function (pos) {
        // about a kilometre is plenty for a sunrise, and less to keep
        setPlace(Math.round(pos.coords.latitude * 100) / 100, Math.round(pos.coords.longitude * 100) / 100);
        state.locMsg = ''; render();
      }, function () { state.locMsg = t.denied; render(); }, { timeout: 15000, maximumAge: 3600000 });
    };
    if (el('city')) el('city').onchange = function (e) {
      var zone = String(e.target.value).split('·').pop().trim(), c = ZONE_COORDS[zone];
      if (!c) return;
      state.tz = zone; store('dgUposathaTz', zone); setPlace(c[0], c[1]); state.locMsg = ''; render();
    };
    if (el('unloc')) el('unloc').onclick = function (e) { e.preventDefault(); state.loc = null; state.locMsg = ''; store('dgUposathaLoc', ''); render(); };
    function saveRem() { store('dgUposathaRemind', JSON.stringify(state.rem)); }
    el('remOn').onchange = function (e) {
      state.remMsg = '';
      if (!e.target.checked) { state.rem.on = false; saveRem(); render(); return; }
      var LN = nativePlugin();
      if (LN) {
        LN.requestPermissions().then(function (r) {
          state.rem.on = r && r.display === 'granted';
          if (!state.rem.on) state.remMsg = t.remindDenied;
          saveRem(); render();
        }).catch(function () { state.remMsg = t.remindUnsupported; render(); });
        return;
      }
      if (!('Notification' in window)) { state.remMsg = t.remindUnsupported; e.target.checked = false; render(); return; }
      Notification.requestPermission().then(function (perm) {
        state.rem.on = perm === 'granted';
        if (perm !== 'granted') state.remMsg = t.remindDenied;
        saveRem(); render();
      });
    };
    el('remLead').onchange = function (e) { state.rem.lead = parseInt(e.target.value, 10); saveRem(); render(); };
    Array.prototype.forEach.call(document.querySelectorAll('.remday'), function (c) {
      c.onchange = function () { state.rem['d' + c.getAttribute('data-day')] = c.checked; saveRem(); render(); };
    });
    if (el('ics')) el('ics').onclick = function () { downloadIcs(rows, nameOf); };
    el('sutta').onchange = function (e) { state.ref = e.target.checked ? -6 : 6; store('dgUposathaSutta', e.target.checked ? '1' : '0'); render(); };
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
      b.onclick = function () { state.view = b.getAttribute('data-view'); store('dgUposathaView', state.view); render(); };
    });
    reportHeight();
  }

  function reportHeight() {
    if (embed && parent !== window) parent.postMessage({ dgFrameHeight: document.documentElement.scrollHeight, dgUposathaHeight: document.documentElement.scrollHeight }, '*');
  }

  el('title').textContent = t.title;
  document.title = t.title + ' — Dhamma.gift';
  el('sub').innerHTML = esc(t.sub) + ' <a href="' + t.docsUrl + '">' + t.docs + ' →</a>';
  el('foot').innerHTML = t.foot;
  if (embed) { el('head').style.display = 'none'; el('foot').style.display = 'none'; }
  render();
  window.addEventListener('resize', reportHeight);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });
})();

// Installable as an app of its own (its own manifest, start_url and scope). The site's service worker at
// /sw.js controls the page; it is registered here too, so visiting the calendar first is enough to install it.
if (new URLSearchParams(location.search).get('embed') !== '1' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(function () { /* not fatal: the page works without it */ });
}
