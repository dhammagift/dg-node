// The Uposatha calendar as a page of its own (/uposatha-calendar), also embedded (?embed=1) in the docs page.
//
// Two schemes, kept apart, one switch ("By the suttas", on by default).
// By the suttas: six days a month, the 14th, 15th and 8th lunar days of each half. A day begins in the evening, so an
// Uposatha is dated by the EVENING it begins - the night of that date, then the day after - and its lunar day is read at
// that evening's sunset (18:00 without a place).
// Modern scheme: four days a month, the calendar dates of the new moon, first quarter, full moon and last quarter, each
// dated by the day it falls on; the lunar day is only a note, read at sunrise (06:00 without a place).
//
// A lunar day is the tithi: the Moon gains 12 degrees on the Sun per lunar day, 30 to a month; days 1-15 are the waxing
// half, 1-15 again the waning half (the 15th of the waning half is the new moon day). It begins and ends at the exact
// moment the angle crosses a multiple of 12 - not at midnight - and lasts 19-26 hours, so against the calendar dates the
// number sometimes jumps (a lunar day begins and ends between two readings: it is skipped) or stays (it repeats). Which
// lunar day a date is, is therefore read from the real Moon, never assumed. The moments come from astronomy-engine (a real
// ephemeris, minute accuracy, vendored in vendor/astronomy.browser.min.js) and are shown in the reader's own time zone; the
// place only fixes the sunrise and sunset, and is kept on the device, rounded to about a kilometre.
//
// URL: ?lang=ru|en  ?theme=dark|light  ?view=all  ?embed=1 (only the calendar; reports its height to the parent)
(function () {
  'use strict';
  var A = window.Astronomy;
  var DAY = 86400000;
  var params = new URLSearchParams(location.search);
  var embed = params.get('embed') === '1';
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return ('0' + n).slice(-2); }
  function icon(id) { return '<svg class="ic"><use href="#i-' + id + '"/></svg>'; }

  // ---------- words ----------
  var EN_ORD = { 1: '1st', 2: '2nd', 3: '3rd' };
  var T = {
    en: {
      tag: 'observance days', menu: 'Menu', theme: 'Theme', prev: 'Previous', next: 'Next', close: 'Close',
      h1: 'Uposatha days', lead: 'The 14th, 15th and 8th lunar days of each half-month, as the suttas count them — six a month.', suttas: 'The suttas on Uposatha →',
      today: 'Today', change: 'change', tList: 'Uposatha days', tCal: 'Calendar', more: 'Three more months', todayBtn: 'Today',
      kH: 'Key suttas to start with', kSub: 'Each “Read →” opens the sutta at the passage in question and highlights it.', kNow: 'Now open', kNew: 'Open in a new window',
      lic: 'Licences', mt: 'Dhamma.gift', lHome: 'Home', lToc: 'Contents', lDict: 'Dictionary', lMemo: 'Memorizer', lang: 'Language', themeH: 'Theme', dark: 'Dark', light: 'Light', auto: 'Auto',
      ics: 'Add to my calendar (.ics)', suttasL: 'The suttas on Uposatha', help: 'Help', share: 'Share', settingsL: 'Uposatha settings', settings: 'Settings',
      gPlace: 'Place & time', tz: 'Time zone', hemi: 'Hemisphere', hemiD: 'how the moon is drawn', north: 'Northern', south: 'Southern',
      loc: 'Location', locD: 'for the real sunrise and sunset; otherwise 18:00 and 06:00', myLoc: 'Use my location', city: 'or a city: Almaty…',
      locNone: 'The location is not shared — the fixed times are used.', locFinding: 'Locating…', locOk: 'Location', locForget: 'forget', locDenied: 'The location was not shared — the fixed times are used.',
      gCount: 'Counting', bySuttas: 'By the suttas', bySuttasD: 'The 14th, 15th and 8th lunar days of each half — six a month, the day counted from the evening. Off — the modern scheme: the four moon-phase days.',
      detail: 'Details', detailD: 'When it begins, the lunar day, exact moments. Off — the short form.',
      gRem: 'Reminders', remind: 'Remind me', adv: 'In advance', leads: [[1, '1 hour'], [3, '3 hours'], [12, '12 hours'], [24, '1 day'], [48, '2 days']], days: 'Days',
      remNote: 'Notifications appear while this app is open or running in the background on your device. For reminders that arrive when it is fully closed, add the days to your phone\'s calendar.',
      remAppNote: 'Reminders are scheduled on this device and arrive even when the app is closed.',
      remNext: function (when, what) { return 'Next reminder: ' + when + ' — ' + what; }, remNone: 'No reminder is due in the coming weeks.',
      remDenied: 'Notifications are blocked for this site — allow them in the browser settings.', remUnsupported: 'This browser cannot show notifications.',
      remBody: function (when) { return 'begins ' + when; }, remTwo: function (when) { return 'Two Uposatha days: the 14th and the 15th. The first begins ' + when; },
      full: 'Full moon', newm: 'New moon', fullL: 'full moon', newL: 'new moon', illum: 'illuminated', ld: 'lunar day', of15: 'of 15', until: 'until',
      halves: ['waxing half', 'waning half'], events: ['New moon', 'First quarter', 'Full moon', 'Last quarter'],
      phases: ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'],
      uday: 'Uposatha day', tonight: 'The Uposatha begins this evening', next2: 'Next', inN: function (n) { return 'in ' + n + ' day' + (n > 1 ? 's' : ''); }, tomorrow: 'tomorrow', isToday: 'today',
      nth: function (n) { return EN_ORD[n] || n + 'th'; }, and: ' & ', dayOf: function (nth, half) { return nth + ' day of the ' + half; },
      kBegins: 'Begins', kSpan: 'Observed', kLunar: 'Lunar day', kTime: 'Exact time',
      beginsVal: function (eve, sun) { return 'evening ' + eve + (sun ? ' (' + sun + ')' : ''); }, spanVal: function (night, day) { return 'night of ' + night + ' → day of ' + day; },
      atSunset: 'at sunset', atSunrise: 'at sunrise', atFixed: function (hm) { return 'at ' + hm; }, sunrise: 'sunrise', sunset: 'sunset',
      lunarVal: function (n, half, at, change) { return n + ', ' + half + ' · ' + at + ' · changes ' + change; },
      keptWith: function (nth) { return 'the ' + nth + ' day is skipped and kept with this date'; }, skipped: function (nth) { return nth + ' lunar day is skipped — it begins and ends between two readings'; },
      repeats: 'the same lunar day as the day before',
      modeS: 'by the suttas · 6 a month', modeM: 'modern · 4 a month', lgS: 'the evening an Uposatha begins', lgS15: '15th — full / new moon', lgS814: '8th and 14th', lgM15: 'new / full moon', lgM8: 'quarters', lgT: 'today',
      cellHint: 'Tap a date for details.', pickDate: 'Tap a date',
      wds: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], docs: '/docs/uposatha', linkCopied: 'Link copied', shareTitle: 'Uposatha days', locale: 'en-GB',
    },
    ru: {
      tag: 'дни соблюдения', menu: 'Меню', theme: 'Тема', prev: 'Назад', next: 'Вперёд', close: 'Закрыть',
      h1: 'Дни упосатхи', lead: '14-й, 15-й и 8-й лунные дни каждой половины месяца, как их считают сутты, — шесть в месяц.', suttas: 'Сутты об упосатхе →',
      today: 'Сегодня', change: 'изменить', tList: 'Упосатхи', tCal: 'Календарь', more: 'Ещё три месяца', todayBtn: 'Сегодня',
      kH: 'Ключевые сутты для начала', kSub: 'Каждое «Читать →» открывает сутту на нужном месте и подсвечивает его.', kNow: 'Сейчас открыта', kNew: 'Открыть в новом окне',
      lic: 'Лицензии', mt: 'Dhamma.gift', lHome: 'Главная', lToc: 'Оглавление', lDict: 'Словарь', lMemo: 'Меморайзер', lang: 'Язык', themeH: 'Тема', dark: 'Тёмная', light: 'Светлая', auto: 'Авто',
      ics: 'Добавить в мой календарь (.ics)', suttasL: 'Сутты об упосатхе', help: 'Помощь', share: 'Поделиться', settingsL: 'Настройки упосатхи', settings: 'Настройки',
      gPlace: 'Место и время', tz: 'Часовой пояс', hemi: 'Полушарие', hemiD: 'как рисовать луну', north: 'Северное', south: 'Южное',
      loc: 'Место', locD: 'для настоящих восхода и заката; без него — 18:00 и 06:00', myLoc: 'Определить моё место', city: 'или город: Алматы…',
      locNone: 'Место не передано — используется фиксированное время.', locFinding: 'Определяю…', locOk: 'Место', locForget: 'забыть', locDenied: 'Место не передано — используется фиксированное время.',
      gCount: 'Счёт', bySuttas: 'По суттам', bySuttasD: '14-й, 15-й и 8-й лунные дни каждой половины — шесть в месяц, день считается с вечера. Выкл — современная схема: четыре дня лунных фаз.',
      detail: 'Подробно', detailD: 'Когда начинается, лунный день, точные моменты. Выкл — короткая форма.',
      gRem: 'Напоминания', remind: 'Напоминать', adv: 'Заранее', leads: [[1, 'за 1 час'], [3, 'за 3 часа'], [12, 'за 12 часов'], [24, 'за сутки'], [48, 'за 2 суток']], days: 'Дни',
      remNote: 'Уведомления приходят, пока приложение открыто или работает в фоне на вашем устройстве. Чтобы напоминание пришло и при полностью закрытом приложении, добавьте дни в календарь телефона.',
      remAppNote: 'Напоминания ставятся на этом устройстве и приходят даже при закрытом приложении.',
      remNext: function (when, what) { return 'Ближайшее напоминание: ' + when + ' — ' + what; }, remNone: 'В ближайшие недели напоминаний нет.',
      remDenied: 'Уведомления для сайта запрещены — разрешите их в настройках браузера.', remUnsupported: 'Этот браузер не умеет показывать уведомления.',
      remBody: function (when) { return 'начинается ' + when; }, remTwo: function (when) { return 'Две упосатхи: 14-й и 15-й дни. Первая начинается ' + when; },
      full: 'Полнолуние', newm: 'Новолуние', fullL: 'полнолуние', newL: 'новолуние', illum: 'освещено', ld: 'лунный день', of15: 'из 15', until: 'до',
      halves: ['растущая половина', 'убывающая половина'], events: ['Новолуние', 'Первая четверть', 'Полнолуние', 'Последняя четверть'],
      phases: ['Новолуние', 'Растущий серп', 'Первая четверть', 'Растущая Луна', 'Полнолуние', 'Убывающая Луна', 'Последняя четверть', 'Убывающий серп'],
      uday: 'День упосатхи', tonight: 'Упосатха начинается сегодня вечером', next2: 'Следующая', inN: function (n) { var m = n % 10, h = n % 100; return 'через ' + n + ' ' + (m === 1 && h !== 11 ? 'день' : m >= 2 && m <= 4 && (h < 12 || h > 14) ? 'дня' : 'дней'); }, tomorrow: 'завтра', isToday: 'сегодня',
      nth: function (n) { return n + '-й'; }, and: ' и ', dayOf: function (nth, half) { return nth + ' день · ' + half; },
      kBegins: 'Начало', kSpan: 'Упосатха', kLunar: 'Лунный день', kTime: 'Точное время',
      beginsVal: function (eve, sun) { return 'вечер ' + eve + (sun ? ' (' + sun + ')' : ''); }, spanVal: function (night, day) { return 'ночь ' + night + ' → день ' + day; },
      atSunset: 'на закате', atSunrise: 'на восходе', atFixed: function (hm) { return 'в ' + hm; }, sunrise: 'восход', sunset: 'закат',
      lunarVal: function (n, half, at, change) { return n + ', ' + half + ' · ' + at + ' · сменится ' + change; },
      keptWith: function (nth) { return nth + ' день пропущен и соблюдается в эту дату'; }, skipped: function (nth) { return nth + ' лунный день пропущен — он начинается и кончается между двумя замерами'; },
      repeats: 'тот же лунный день, что и накануне',
      modeS: 'по суттам · 6 в месяц', modeM: 'современная · 4 в месяц', lgS: 'вечер, с которого начинается упосатха', lgS15: '15-й — полнолуние / новолуние', lgS814: '8-й и 14-й', lgM15: 'новолуние / полнолуние', lgM8: 'четверти', lgT: 'сегодня',
      cellHint: 'Нажмите на дату, чтобы увидеть подробности.', pickDate: 'Нажмите на дату',
      wds: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'], docs: '/ru/docs/uposatha', linkCopied: 'Ссылка скопирована', shareTitle: 'Дни упосатхи', locale: 'ru-RU',
    },
  };
  var lang = (params.get('lang') || store('dhammaLanguage') || (navigator.language || 'en')).slice(0, 2) === 'ru' ? 'ru' : 'en';
  var t = T[lang];

  // Key suttas: {n} in the text is a "Read →" button for the n-th passage; every passage opens at its own segment.
  var PASSAGES = [
    ['an10.46:1.5', 'AN 10.46'], ['mn83:3.3', 'MN 83'], ['mn146:15.2', 'MN 146 · 14th|14-й'], ['mn146:27.2', 'MN 146 · 15th|15-й'],
    ['an3.37:1.3', 'AN 3.37 · 14th|14-й'], ['an3.37:1.5', 'AN 3.37 · 15th|15-й'], ['an3.37:1.1', 'AN 3.37 · 8th|8-й'],
    ['an3.70:2.3', 'AN 3.70 · three kinds|три вида'], ['an3.70:2.4', 'AN 3.70 · cowherd|пастух'], ['an3.70:3.1', 'AN 3.70 · Nigaṇṭha|ниганты'],
    ['an3.70:4.1', 'AN 3.70 · Noble One|Благородный'], ['an3.70:19.3', 'AN 3.70 · nights and days|ночь и день'],
  ];
  var KEYS = {
    en: [['AN 10.46', 'skipping the uposathas is not allowed (“it is your loss and failure”). {0}'], ['MN 83', 'one should observe the 14th, 15th, and 8th days. {1}'],
      ['MN 146', 'the 14th of the waxing moon {2} and the 15th, the full moon {3}.'], ['AN 3.37', 'the 14th {4}, 15th {5} and 8th {6} days compared with the visits of deities of different ranks.'],
      ['AN 3.70', 'the three kinds of Uposatha {7}: how it should <b>not</b> be observed — the “cowherd\'s Uposatha” {8} and the “Nigaṇṭha\'s Uposatha” {9} — and how the Noble One\'s Uposatha should be observed {10}. The sutta says “nights and days” rather than “days and nights” {11}; the Pali has the fixed expression <i>ahoratta</i> (“day-night”) in other contexts.']],
    ru: [['АН 10.46', 'пропускать упосатху нельзя («это ваша потеря и неудача»). {0}'], ['МН 83', 'нужно соблюдать 14-й, 15-й и 8-й дни. {1}'],
      ['МН 146', '14-й день растущей Луны {2} и 15-й, полнолуние {3}.'], ['АН 3.37', '14-й {4}, 15-й {5} и 8-й {6} дни в сравнении с посещениями божеств разных рангов.'],
      ['АН 3.70', 'три вида упосатхи {7}: как её <b>не</b> нужно соблюдать — «упосатха пастуха» {8} и «упосатха ниганты» {9} — и как соблюдать упосатху Благородного {10}. В сутте «ночь и день», а не «день и ночь» {11}; в пали в других контекстах стоит устойчивое выражение <i>ahoratta</i> («день-ночь»).']],
  };

  // ---------- state ----------
  var detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  var SOUTHERN_ZONE = /^(Australia|Antarctica)\/|^Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Noumea|Tahiti|Port_Moresby)|^Africa\/(Johannesburg|Maseru|Mbabane|Windhoek|Harare|Lusaka|Maputo)|^America\/(Sao_Paulo|Argentina|Buenos_Aires|Santiago|Lima|La_Paz|Asuncion|Montevideo)/;
  var state = {
    tz: store('dgUposathaTz') || detected,
    south: null,
    ref: store('dgUposathaSutta') === '0' ? 6 : 18, // by the suttas (default): the evening of the date itself (sunset, or 18:00); the modern scheme: the morning (sunrise, or 06:00)
    lite: store('dgUposathaLite') === '1',
    screen: params.get('view') === 'all' ? 'cal' : (store('dgUposathaView') === 'cal' ? 'cal' : 'list'),
    months: 3, calOff: 0, selected: null,
    loc: (function () { try { return JSON.parse(store('dgUposathaLoc')); } catch (e) { return null; } })(),
    locMsg: '',
    rem: (function () { var d = { on: false, lead: 24, d8: true, d14: true }; try { var v = JSON.parse(store('dgUposathaRemind')); if (v) for (var k in d) if (k in v) d[k] = v[k]; } catch (e) { /* defaults */ } return d; })(),
    remMsg: '',
  };
  var hemi = store('dgUposathaHemisphere');
  state.south = hemi ? hemi === 'south' : SOUTHERN_ZONE.test(state.tz);
  var sutta = function () { return state.ref === 18; };
  var ZONE_COORDS = window.DG_ZONE_COORDS || {};
  var zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : Object.keys(ZONE_COORDS);
  if (zones.indexOf(detected) === -1) zones = [detected].concat(zones);
  if (zones.indexOf(state.tz) === -1) zones = [state.tz].concat(zones);
  var FIRST_DAY = lang === 'ru' ? 1 : 0; // weeks start on Monday for ru, Sunday for en
  var UPOSATHA = [8, 14, 15, 23, 29, 30]; // tithi numbers of the 8th, 14th, 15th of the waxing half, then of the waning half

  // ---------- the Moon and the Sun ----------
  function localDay(date, tz) { return date.toLocaleDateString('en-CA', { timeZone: tz }); } // yyyy-mm-dd, sortable
  function offsetMs(utcMs, tz) {
    var v = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(utcMs)).forEach(function (p) { v[p.type] = +p.value; });
    return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - utcMs;
  }
  function zonedToUtc(y, m, d, h, tz) { // the UTC moment of hour `h` on the calendar date y-m-d in `tz`
    var wall = Date.UTC(y, m - 1, d, h, 0, 0), utc = wall;
    for (var i = 0; i < 2; i++) utc = wall - offsetMs(utc, tz);
    return new Date(utc);
  }
  function sunEvent(kind, y, m, d, tz, obs) { // the Sun's rise / set on the date at the observer's place, or null
    if (!obs) return null;
    var found = A.SearchRiseSet('Sun', obs, kind === 'rise' ? 1 : -1, zonedToUtc(y, m, d, 0, tz), 1);
    return found ? found.date : null;
  }
  function tithiAt(date) { return Math.floor(A.MoonPhase(date) / 12) + 1; } // 1..30
  function dayNo(tithi) { return tithi <= 15 ? tithi : tithi - 15; }

  // One row per calendar date from..to (y-m-d, inclusive): the lunar day in force at the reading moment of that date, until
  // when it lasts, whether days before it were skipped or it repeats, and the full / new moon falling within the next 24 hours.
  function civilDays(from, to, tz, ref, obs) {
    var f = from.split('-').map(Number), rows = [], prev = null;
    for (var i = -1; ; i++) { // i = -1: the day before, only to tell whether the first date's number jumped
      var c = new Date(Date.UTC(f[0], f[1] - 1, f[2] + i));
      var y = c.getUTCFullYear(), m = c.getUTCMonth() + 1, d = c.getUTCDate();
      var ymd = y + '-' + pad(m) + '-' + pad(d);
      if (ymd > to) break;
      var refKind = ref === 18 ? 'evening' : 'morning', at = null;
      if (obs) {
        if (ref === 18) { at = sunEvent('set', y, m, d, tz, obs); refKind = 'sunset'; }
        else { at = sunEvent('rise', y, m, d, tz, obs); refKind = 'sunrise'; }
      }
      if (!at) { at = zonedToUtc(y, m, d, ref, tz); refKind = ref === 18 ? 'evening' : 'morning'; }
      var tithi = tithiAt(at), waxing = tithi <= 15;
      var row = { ymd: ymd, y: y, m: m, d: d, dow: c.getUTCDay(), at: at, refKind: refKind, tithi: tithi, waxing: waxing, day: dayNo(tithi),
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
      row.names = row.keptWith.concat(UPOSATHA.indexOf(tithi) !== -1 ? [tithi] : []);
      row.uposatha = row.names.length > 0;
      if (i >= 0) rows.push(row);
      prev = row;
    }
    return rows;
  }
  function markPhases(rows, byYmd, tz, from, to) { // the modern scheme: the date on which each of the four principal phases falls
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
  function dataset(from, to) {
    var obs = state.loc ? new A.Observer(state.loc.lat, state.loc.lon, 0) : null;
    var rows = civilDays(from, to, state.tz, state.ref, obs), byYmd = {};
    rows.forEach(function (r) { byYmd[r.ymd] = r; });
    if (!sutta()) markPhases(rows, byYmd, state.tz, from, to);
    return { rows: rows, byYmd: byYmd, obs: obs };
  }
  function ymdAdd(ymd, n) { return new Date(Date.parse(ymd) + n * DAY).toISOString().slice(0, 10); }

  // ---------- drawing ----------
  // The moon as a picture: p is the phase 0..1 (0 new, .5 full); the lit side flips in the Southern Hemisphere.
  function moonSVG(p, cls) {
    var c = 50, r = 46, a = 2 * Math.PI * p, rx = Math.abs(Math.cos(a)) * r, wax = p < .5, cres = (p < .25 || p > .75);
    var d = wax ? 'M' + c + ',' + (c - r) + 'A' + r + ',' + r + ' 0 0 1 ' + c + ',' + (c + r) + 'A' + rx + ',' + r + ' 0 0 ' + (cres ? 0 : 1) + ' ' + c + ',' + (c - r) + 'Z'
      : 'M' + c + ',' + (c - r) + 'A' + r + ',' + r + ' 0 0 0 ' + c + ',' + (c + r) + 'A' + rx + ',' + r + ' 0 0 ' + (cres ? 1 : 0) + ' ' + c + ',' + (c - r) + 'Z';
    return '<svg class="' + (cls || 'moon') + '" viewBox="0 0 100 100"><g' + (state.south ? ' transform="matrix(-1 0 0 1 100 0)"' : '') + '><circle class="dk" cx="50" cy="50" r="' + r + '"></circle><path class="lt" d="' + d + '"></path><circle class="rim" cx="50" cy="50" r="' + r + '"></circle></g></svg>';
  }
  // The phase each Uposatha day is drawn at: the 8th a quarter, the 14th the last not-yet-full (or not-yet-new) shape, the 15th
  // the full moon in the waxing half and the new moon in the waning one.
  function dayPhaseP(waxing, n) { return waxing ? (n === 8 ? .25 : n === 14 ? .47 : .5) : (n === 8 ? .75 : n === 14 ? .97 : 0); }
  function rowP(r) { return sutta() ? dayPhaseP(r.names[0] <= 15, dayNo(r.names[0])) : [0, .25, .5, .75][r.phase]; }
  function halfName(tithi) { return t.halves[tithi <= 15 ? 0 : 1]; }
  function nameOf(r) {
    if (!sutta()) return t.events[r.phase];
    return t.dayOf(r.names.map(function (x) { return t.nth(dayNo(x)); }).join(t.and), halfName(r.names[0]));
  }

  // Formatters for the chosen zone; the "UTC" ones are for calendar dates, which have no zone.
  function formats() {
    var tz = state.tz, L = t.locale;
    return {
      dateLong: new Intl.DateTimeFormat(L, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      longUtc: new Intl.DateTimeFormat(L, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      eve: new Intl.DateTimeFormat(L, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'long' }),
      day: new Intl.DateTimeFormat(L, { timeZone: 'UTC', day: 'numeric' }),
      wd: new Intl.DateTimeFormat(L, { timeZone: 'UTC', weekday: 'short' }),
      week: new Intl.DateTimeFormat(L, { timeZone: 'UTC', day: 'numeric', month: 'short' }),
      month: new Intl.DateTimeFormat(L, { timeZone: 'UTC', month: 'long', year: 'numeric' }),
      hm: new Intl.DateTimeFormat(L, { timeZone: tz, hour: '2-digit', minute: '2-digit' }),
      stamp: new Intl.DateTimeFormat(L, { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }),
      remWhen: new Intl.DateTimeFormat(L, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
    };
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function line(k, v, grey) { return '<span class="ln' + (grey ? ' grey' : '') + '">' + (k ? '<span class="k">' + esc(k) + ':</span> ' : '') + esc(v) + '</span>'; }
  function readAt(r) { return r.refKind === 'sunset' ? t.atSunset : r.refKind === 'sunrise' ? t.atSunrise : t.atFixed(pad(state.ref) + ':00'); }
  function notesOf(r, F) {
    var n = [];
    if (!sutta()) return n; // the modern scheme's line is the exact time of the phase
    if (r.fullMoon) n.push(t.fullL + ' ' + F.hm.format(r.fullMoon));
    if (r.newMoon) n.push(t.newL + ' ' + F.hm.format(r.newMoon));
    r.keptWith.forEach(function (x) { n.push(t.keptWith(t.nth(dayNo(x)))); });
    r.skipped.forEach(function (x) { if (r.keptWith.indexOf(x) === -1) n.push(t.skipped(t.nth(dayNo(x)))); });
    if (r.repeats) n.push(t.repeats);
    return n;
  }
  // The lines under a date: when it begins and how long it is observed (by the suttas) or the exact moment (modern), and in grey
  // the lunar day that is really in force, for information and checking.
  function infoHtml(r, F) {
    var h = '';
    if (sutta()) {
      var eve = F.eve.format(Date.parse(r.ymd)), after = F.eve.format(Date.parse(r.ymd) + DAY);
      h += line(t.kBegins, t.beginsVal(eve, (r.refKind === 'sunset' ? t.sunset + ' ' : '') + F.hm.format(r.at)));
      h += line(t.kSpan, t.spanVal(eve, after));
    } else if (r.phaseAt) {
      h += line(t.kTime, F.stamp.format(r.phaseAt));
    }
    h += line(t.kLunar, t.lunarVal(r.day, halfName(r.tithi), readAt(r), F.stamp.format(r.ends.date)), true);
    notesOf(r, F).forEach(function (n) { h += line('', n, true); });
    return h;
  }

  // ---------- the page ----------
  function applyLang() {
    document.documentElement.lang = lang;
    Array.prototype.forEach.call(document.querySelectorAll('[data-t]'), function (e) { var v = t[e.getAttribute('data-t')]; if (typeof v === 'string') e.innerHTML = v; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tt]'), function (e) { var v = t[e.getAttribute('data-tt')]; if (typeof v === 'string') { e.title = v; e.setAttribute('aria-label', v); } });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tp]'), function (e) { e.placeholder = t[e.getAttribute('data-tp')] || ''; });
    document.title = t.h1 + ' — Dhamma.gift';
    $('d-help').href = t.docs;
    Array.prototype.forEach.call($('langseg').children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
    $('rem-lead').innerHTML = t.leads.map(function (l) { return '<option value="' + l[0] + '">' + esc(l[1]) + '</option>'; }).join('');
  }
  function setTheme(mode) { // light | dark | auto, stored under the site's own key
    store('theme', mode);
    var eff = mode === 'auto' ? (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;
    document.documentElement.setAttribute('data-theme', eff);
    Array.prototype.forEach.call($('themeseg').children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === mode)); });
  }
  function toast(msg) { var e = $('toast'); e.textContent = msg; e.classList.add('on'); setTimeout(function () { e.classList.remove('on'); }, 2000); }
  function openPanel(id) { closeAll(); $(id).setAttribute('data-open', 'true'); $('scrim').setAttribute('data-open', 'true'); }
  function closeAll() { ['drawer', 'p-set', 'scrim'].forEach(function (i) { $(i).setAttribute('data-open', 'false'); }); }

  function paint() {
    var now = new Date(), tz = state.tz, F = formats(), su = sutta();
    var todayYmd = localDay(now, tz), tp = todayYmd.split('-').map(Number);
    var monthStart = tp[0] + '-' + pad(tp[1]) + '-01';
    var emoji = state.south;
    document.body.setAttribute('data-screen', state.screen);
    document.body.setAttribute('data-mode', state.lite ? 'lite' : 'detailed');
    document.body.setAttribute('data-remind', state.rem.on ? 'on' : 'off');

    // ----- the list's data: from the last day of last month (today's yesterday) to the end of the shown months
    var lastOfMonth = new Date(Date.UTC(tp[0], tp[1] - 1 + state.months, 0)).toISOString().slice(0, 10);
    var L = dataset(new Date(Date.UTC(tp[0], tp[1] - 1, 0)).toISOString().slice(0, 10), lastOfMonth);
    var todayRow = L.byYmd[todayYmd], yRow = L.byYmd[ymdAdd(todayYmd, -1)];
    var evToday = (L.obs && sunEvent('set', tp[0], tp[1], tp[2], tz, L.obs)) || zonedToUtc(tp[0], tp[1], tp[2], 18, tz);
    // Is it an Uposatha now? By the suttas one runs from the evening it begins to the next evening (night first, then day).
    var isUposatha = su ? !!((yRow && yRow.uposatha && now < evToday) || (todayRow && todayRow.uposatha && now >= evToday)) : !!(todayRow && todayRow.uposatha);
    var tonight = su && !!(todayRow && todayRow.uposatha && now < evToday);

    // ----- today
    var angle = A.MoonPhase(now), tithi = tithiAt(now), pIndex = Math.floor(((angle + 22.5) % 360) / 45);
    var percent = Math.round(A.Illumination('Moon', now).phase_fraction * 100);
    var dayEnds = A.SearchMoonPhase((tithi * 12) % 360, now, 3);
    $('t-moon').innerHTML = moonSVG(angle / 360, 'moon');
    $('t-date').textContent = cap(F.dateLong.format(now));
    $('t-phase').innerHTML = '<span>' + esc(t.phases[pIndex]) + '</span><span class="dot">·</span><span>' + percent + '% ' + esc(t.illum) + '</span><span class="dot">·</span><span><b style="font-weight:600;color:var(--dg-text)">' + dayNo(tithi) + '</b> ' + esc(t.ld) + ' ' + esc(t.of15) + ', ' + esc(halfName(tithi)) + '</span>' +
      (dayEnds ? '<span class="dot">·</span><span>' + esc(t.until) + ' ' + esc(F.stamp.format(dayEnds.date)) + '</span>' : '');
    var nextRow = L.rows.filter(function (r) { return r.uposatha && r.ymd > todayYmd; })[0];
    if (isUposatha) $('t-status').innerHTML = '<span class="badge">' + esc(t.uday) + '</span>' + (tonight ? '' : '');
    else if (tonight) $('t-status').innerHTML = '<span class="badge">' + esc(t.tonight) + '</span>';
    else $('t-status').innerHTML = nextRow ? '<span class="badge soft">' + esc(t.next2) + ': ' + esc(F.eve.format(Date.parse(nextRow.ymd))) + '</span><em>' + esc(t.inN(Math.round((Date.parse(nextRow.ymd) - Date.parse(todayYmd)) / DAY))) + '</em>' : '';
    if (isUposatha && tonight) $('t-status').innerHTML += '<span class="badge">' + esc(t.tonight) + '</span>';
    var sunLine = '';
    if (L.obs) {
      var sr = sunEvent('rise', tp[0], tp[1], tp[2], tz, L.obs), ss = sunEvent('set', tp[0], tp[1], tp[2], tz, L.obs);
      sunLine = (sr ? t.sunrise + ' ' + F.hm.format(sr) : '') + (sr && ss ? ' · ' : '') + (ss ? t.sunset + ' ' + F.hm.format(ss) : '');
    }
    $('t-sun').textContent = sunLine;
    var off = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now).filter(function (p) { return p.type === 'timeZoneName'; })[0];
    var place = state.loc ? (state.loc.name || state.loc.lat + ', ' + state.loc.lon) : (off ? off.value : tz);
    $('ctx-place').textContent = place + ' · ' + tz.split('/').pop().replace(/_/g, ' ');
    $('ctx-mode').textContent = su ? t.modeS : t.modeM;

    // ----- the list
    var list = L.rows.filter(function (r) { return r.uposatha && r.ymd >= monthStart; });
    var html = '', lastMonth = '', lastWeek = '';
    list.forEach(function (r) {
      var month = r.ymd.slice(0, 7), startOffset = (r.dow - FIRST_DAY + 7) % 7;
      var weekStart = new Date(Date.UTC(r.y, r.m - 1, r.d - startOffset)), weekKey = weekStart.toISOString().slice(0, 10);
      if (month !== lastMonth) {
        if (lastMonth) html += '</ul></div>';
        html += '<div class="mon"><h2>' + esc(F.month.format(Date.parse(r.ymd))) + '</h2><ul>'; lastMonth = month; lastWeek = '';
      }
      if (weekKey !== lastWeek) {
        html += '<li class="wk">' + esc(F.week.format(weekStart) + ' – ' + F.week.format(new Date(weekStart.getTime() + 6 * DAY))) + '</li>'; lastWeek = weekKey;
      }
      var dd = Math.round((Date.parse(r.ymd) - Date.parse(todayYmd)) / DAY);
      var w = dd === 0 ? t.isToday : dd === 1 ? t.tomorrow : dd > 1 ? t.inN(dd) : '';
      var note = '';
      if (su && r.names.indexOf(15) !== -1 || su && r.names.indexOf(30) !== -1) note = r.names.indexOf(15) !== -1 ? t.fullL : t.newL;
      html += '<li class="row" data-ymd="' + r.ymd + '"' + (dd < 0 ? ' data-past="true"' : '') + (dd === 0 ? ' data-now="true"' : '') + '>' +
        '<span class="n">' + esc(F.day.format(Date.parse(r.ymd))) + '<small>' + esc(F.wd.format(Date.parse(r.ymd))) + '</small></span>' + moonSVG(rowP(r), 'moon mi') +
        '<span class="t"><b>' + esc(nameOf(r)) + '</b>' + (note ? '<span class="nt">· ' + esc(note) + '</span>' : '') + '<span class="info">' + infoHtml(r, F) + '</span></span>' +
        '<span class="w">' + esc(w) + '</span></li>';
    });
    if (lastMonth) html += '</ul></div>';
    $('list').innerHTML = html;

    // ----- the calendar: one ordinary month, weeks in rows
    var cm = new Date(Date.UTC(tp[0], tp[1] - 1 + state.calOff, 1)), cy = cm.getUTCFullYear(), mo = cm.getUTCMonth();
    var lead = (new Date(Date.UTC(cy, mo, 1)).getUTCDay() - FIRST_DAY + 7) % 7;
    var cells = Math.ceil((lead + new Date(Date.UTC(cy, mo + 1, 0)).getUTCDate()) / 7) * 7;
    var g0 = new Date(Date.UTC(cy, mo, 1 - lead)), gEnd = new Date(Date.UTC(cy, mo, 1 - lead + cells - 1));
    var C = dataset(new Date(g0.getTime() - DAY).toISOString().slice(0, 10), gEnd.toISOString().slice(0, 10));
    $('cal-title').textContent = cap(F.month.format(cm.getTime()));
    var g = '';
    for (var w2 = 0; w2 < 7; w2++) g += '<div class="wd">' + esc(t.wds[(FIRST_DAY + w2) % 7]) + '</div>';
    for (var i = 0; i < cells; i++) {
      var d = new Date(g0.getTime() + i * DAY), k = d.toISOString().slice(0, 10), r2 = C.byYmd[k];
      var u = '', lb = '';
      if (r2 && r2.uposatha) {
        if (su) { var dn = dayNo(r2.names[0]); u = String(dn); lb = dn === 15 ? '<span class="lb">' + moonSVG(rowP(r2), 'moon mi') + '<span>' + esc(r2.names[0] === 15 ? t.fullL : t.newL) + '</span></span>' : '<span class="lb"><span>' + esc(t.nth(dn)) + '</span></span>'; }
        else { u = (r2.phase === 0 || r2.phase === 2) ? '15' : '8'; lb = '<span class="lb">' + moonSVG(rowP(r2), 'moon mi') + '<span>' + esc(t.events[r2.phase].toLowerCase()) + '</span></span>'; }
      }
      g += '<button type="button" class="c' + (d.getUTCMonth() !== mo ? ' o' : '') + '"' + (u ? ' data-u="' + u + '"' : '') + (k === todayYmd ? ' data-today="true"' : '') + ' data-ymd="' + k + '">' +
        '<span class="n">' + d.getUTCDate() + '</span>' + lb + (r2 ? '<span class="ld">' + r2.day + '</span>' : '') + '</button>';
    }
    $('grid').innerHTML = g;
    $('legend').innerHTML = su ? '<span><i class="f"></i>' + esc(t.lgS15) + '</span><span><i class="r"></i>' + esc(t.lgS814) + '</span><span><i class="t"></i>' + esc(t.lgT) + '</span>'
      : '<span><i class="f"></i>' + esc(t.lgM15) + '</span><span><i class="r"></i>' + esc(t.lgM8) + '</span><span><i class="t"></i>' + esc(t.lgT) + '</span>';
    function showDetail(ymd) {
      var r = C.byYmd[ymd] || L.byYmd[ymd], box = $('detail');
      Array.prototype.forEach.call(document.querySelectorAll('#grid .c'), function (c) { c.setAttribute('data-sel', String(c.getAttribute('data-ymd') === ymd)); });
      if (!r) { box.innerHTML = esc(t.cellHint); return; }
      box.innerHTML = '<strong>' + esc(cap(F.longUtc.format(Date.parse(ymd)))) + '</strong>' + (r.uposatha ? '<span class="badge">' + esc(t.uday) + '</span><span class="ttl">' + esc(nameOf(r)) + '</span>' : '') +
        '<span class="info">' + infoHtml(r, F) + '</span>';
    }
    Array.prototype.forEach.call(document.querySelectorAll('#grid .c'), function (c) { c.onclick = function () { state.selected = c.getAttribute('data-ymd'); showDetail(state.selected); reportHeight(); }; });
    showDetail(state.selected && (C.byYmd[state.selected] || L.byYmd[state.selected]) ? state.selected : todayYmd);

    // ----- the settings panel mirrors the state
    $('tz').innerHTML = zones.map(function (z) { return '<option' + (z === tz ? ' selected' : '') + '>' + esc(z) + '</option>'; }).join('');
    Array.prototype.forEach.call($('hemiseg').children, function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-hemi') === 'south') === state.south)); });
    $('sw-sut').setAttribute('aria-pressed', String(su));
    $('sw-det').setAttribute('aria-pressed', String(!state.lite));
    $('city').value = state.loc && state.loc.name ? state.loc.name : '';
    $('locnote').innerHTML = state.loc ? esc(t.locOk + ': ' + (state.loc.name ? state.loc.name + ' · ' : '') + state.loc.lat + ', ' + state.loc.lon) + ' · <a href="#" id="unloc">' + esc(t.locForget) + '</a>' : esc(state.locMsg || t.locNone);
    if ($('unloc')) $('unloc').onclick = function (e) { e.preventDefault(); state.loc = null; state.locMsg = ''; store('dgUposathaLoc', ''); paint(); };
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button, #langseg button'), function () { /* wired once */ });
    $('tab-list').setAttribute('aria-pressed', String(state.screen === 'list'));
    $('tab-cal').setAttribute('aria-pressed', String(state.screen === 'cal'));
    $('more').parentNode.style.display = list.length ? '' : 'none';
    paintReminders(L, F);
    reportHeight();
  }

  // ---------- reminders ----------
  var timer = null, nativeSig = '';
  function wantDay(r) { // by the suttas the days are chosen; in the modern scheme every listed day counts
    if (!sutta()) return true;
    return r.names.some(function (x) { var n = dayNo(x); return (n === 8 && state.rem.d8) || (n === 14 && state.rem.d14); });
  }
  // The 14th day is followed by the 15th: its reminder says that there are two Uposathas (the 15th has none of its own).
  function twoUposathas(r, byYmd) {
    if (!sutta() || !r.names.some(function (x) { return dayNo(x) === 14; })) return false;
    if (r.names.some(function (x) { return dayNo(x) === 15; })) return true;
    var next = byYmd[ymdAdd(r.ymd, 1)];
    return !!(next && next.names.some(function (x) { return dayNo(x) === 15; }));
  }
  function dueList(rows, byYmd) {
    var now = Date.now(), lead = state.rem.lead * 3600000;
    return rows.filter(function (r) { return r.uposatha && r.at.getTime() > now && wantDay(r); }).map(function (r) {
      return { key: r.ymd + (sutta() ? 's' : 'm'), when: r.at.getTime() - lead, start: r.at, title: nameOf(r), two: twoUposathas(r, byYmd) };
    });
  }
  function notify(item, F) {
    var opts = { body: (item.two ? t.remTwo : t.remBody)(F.stamp.format(item.start)), tag: 'uposatha-' + item.key, icon: '/assets/img/pwa-bold-monocolor-192.png', data: { url: '/uposatha-calendar' } };
    var seen = []; try { seen = JSON.parse(store('dgUposathaNotified') || '[]'); } catch (e) { seen = []; }
    if (seen.indexOf(item.key) !== -1) return;
    seen.push(item.key); store('dgUposathaNotified', JSON.stringify(seen.slice(-40)));
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration('/').then(function (reg) {
      if (reg && reg.showNotification) reg.showNotification(item.title, opts); else new Notification(item.title, opts);
    }).catch(function () { new Notification(item.title, opts); });
    else new Notification(item.title, opts);
  }
  // In the Android / iOS app the reminders are local notifications scheduled on the device itself: they arrive with the app
  // closed and nothing is kept on our side. (iOS holds 64 pending notifications, hence at most 60 here.)
  var NATIVE_ID_BASE = 7000;
  function nativePlugin() {
    var C = window.Capacitor;
    return C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.LocalNotifications ? C.Plugins.LocalNotifications : null;
  }
  function scheduleNative(LN, rows, byYmd, F) {
    var now = Date.now();
    var list = state.rem.on ? dueList(rows, byYmd).sort(function (a, b) { return a.when - b.when; }).slice(0, 60) : [];
    var items = list.map(function (item, i) {
      return { id: NATIVE_ID_BASE + i, title: item.title, body: (item.two ? t.remTwo : t.remBody)(F.stamp.format(item.start)),
        schedule: { at: new Date(Math.max(item.when, now + 3000)), allowWhileIdle: true }, extra: { url: '/uposatha-calendar' } };
    });
    var sig = JSON.stringify(items.map(function (i) { return [i.id, i.title, i.schedule.at.getTime() > now + 10000 ? i.schedule.at.getTime() : 0]; }));
    if (sig !== nativeSig) { // only when something changed: paint() runs on every touch
      nativeSig = sig;
      LN.getPending().then(function (p) {
        var ours = ((p && p.notifications) || []).filter(function (n) { return n.id >= NATIVE_ID_BASE && n.id < NATIVE_ID_BASE + 100; }).map(function (n) { return { id: n.id }; });
        return ours.length ? LN.cancel({ notifications: ours }) : null;
      }).then(function () { return items.length ? LN.schedule({ notifications: items }) : null; }).catch(function () { nativeSig = ''; });
    }
    return list.filter(function (i) { return i.when > now; })[0] || null;
  }
  // Show what is due now (a reminder time that passed while the app was closed, before the day begins) and set a timer for the
  // next one; a timer holds only ~24 days, so the schedule is rebuilt on every paint and on focus.
  function scheduleReminders(rows, byYmd, F) {
    var LN = nativePlugin();
    if (LN) return scheduleNative(LN, rows, byYmd, F);
    clearTimeout(timer);
    if (!state.rem.on || !('Notification' in window) || Notification.permission !== 'granted') return null;
    var now = Date.now(), list = dueList(rows, byYmd), next = null;
    list.forEach(function (i) { if (i.when <= now) notify(i, F); else if (!next || i.when < next.when) next = i; });
    if (next) timer = setTimeout(function () { notify(next, F); paint(); }, Math.min(next.when - now, 2147000000));
    return next;
  }
  function paintReminders(L, F) {
    var inApp = !!nativePlugin();
    var next = scheduleReminders(L.rows, L.byYmd, F);
    var permission = inApp ? 'granted' : 'Notification' in window ? Notification.permission : 'unsupported';
    $('sw-rem').setAttribute('aria-pressed', String(state.rem.on));
    $('rem-lead').value = String(state.rem.lead);
    $('rd8').setAttribute('aria-pressed', String(state.rem.d8));
    $('rd14').setAttribute('aria-pressed', String(state.rem.d14));
    $('rem-days-row').style.display = sutta() ? '' : 'none';
    $('rem-msg').textContent = state.remMsg || (permission === 'denied' ? t.remDenied : permission === 'unsupported' ? t.remUnsupported : (state.rem.on ? (next ? t.remNext(F.remWhen.format(next.when), next.title) : t.remNone) : ''));
    $('rem-note').textContent = inApp ? t.remAppNote : t.remNote;
    $('p-ics').style.display = inApp ? 'none' : '';
    $('d-ics').style.display = inApp ? 'none' : '';
    window.__uposathaRows = L; // for the calendar file
  }
  function icsEscape(x) { return String(x).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  function icsStamp(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); }
  // A calendar file: one event per Uposatha day, from the start of the observance for a day, with an alarm `lead` ahead.
  function downloadIcs() {
    var L = window.__uposathaRows; if (!L) return;
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dhamma.gift//Uposatha//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + icsEscape(t.h1)];
    L.rows.filter(function (r) { return r.uposatha && r.at.getTime() > Date.now(); }).forEach(function (r) {
      lines.push('BEGIN:VEVENT', 'UID:uposatha-' + r.ymd + (sutta() ? '-s' : '-m') + '@dhamma.gift', 'DTSTAMP:' + icsStamp(new Date()),
        'DTSTART:' + icsStamp(r.at), 'DTEND:' + icsStamp(new Date(r.at.getTime() + DAY)), 'SUMMARY:' + icsEscape(t.uday + ' — ' + nameOf(r)),
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

  // ---------- key suttas and the reader ----------
  var rdCur = -1;
  function passageLabel(i) { var p = PASSAGES[i][1].split(' · '); return p.length > 1 ? p[0] + ' · ' + p[1].split('|')[lang === 'ru' ? 1 : 0] : p[0]; }
  function readerLabel(i) { var l = passageLabel(i); return lang === 'ru' ? l.replace(/^AN /, 'АН ').replace(/^MN /, 'МН ') : l; }
  function paintKeys() {
    $('keylist').innerHTML = KEYS[lang].map(function (k) {
      return '<li><b>' + k[0] + '</b> — ' + k[1].replace(/\{(\d+)\}/g, function (_, n) { return '<button class="rd" type="button" data-i="' + n + '">' + (lang === 'ru' ? 'Читать →' : 'Read →') + '</button>'; }) + '</li>';
    }).join('');
    $('rd-sel').innerHTML = PASSAGES.map(function (p, i) { return '<option value="' + i + '">' + esc(readerLabel(i)) + '</option>'; }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.rd'), function (b) { b.onclick = function () { readSutta(+b.getAttribute('data-i')); }; });
    markReader();
  }
  function readerUrl(i) { return '/' + PASSAGES[i][0] + '?lang=' + lang; }
  function readSutta(i) {
    rdCur = i; $('reader').hidden = false; $('rd-now').textContent = readerLabel(i); $('rd-sel').value = String(i);
    $('rd-new').href = readerUrl(i); $('rd-frame').src = readerUrl(i); markReader();
    $('reader').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function markReader() { var open = !$('reader').hidden; Array.prototype.forEach.call(document.querySelectorAll('.rd'), function (b) { b.setAttribute('aria-current', String(open && +b.getAttribute('data-i') === rdCur)); }); }

  // ---------- height for the docs frame ----------
  function reportHeight() {
    // The height of the content itself, not of the document: documentElement.scrollHeight is never smaller than the frame it
    // sits in, so after a tall view the frame could not shrink back.
    if (embed && parent !== window) {
      var h = Math.ceil(document.querySelector('main').getBoundingClientRect().height) + 2;
      parent.postMessage({ dgFrameHeight: h, dgUposathaHeight: h }, '*');
    }
  }

  // ---------- events ----------
  function wire() {
    $('b-theme').onclick = function () { setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); };
    $('b-set').onclick = function () { openPanel('p-set'); };
    $('b-menu').onclick = function () { openPanel('drawer'); };
    $('ctx-change').onclick = function () { openPanel('p-set'); };
    $('scrim').onclick = closeAll;
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.onclick = closeAll; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
    window.addEventListener('scroll', function () { document.body.classList.toggle('scrolled', window.scrollY > 4); }, { passive: true });
    $('tab-list').onclick = function () { state.screen = 'list'; store('dgUposathaView', 'list'); paint(); };
    $('tab-cal').onclick = function () { state.screen = 'cal'; store('dgUposathaView', 'cal'); paint(); };
    $('more').onclick = function () { state.months += 3; paint(); };
    $('cal-prev').onclick = function () { state.calOff--; paint(); };
    $('cal-next').onclick = function () { state.calOff++; paint(); };
    $('cal-today').onclick = function () { state.calOff = 0; state.selected = null; paint(); };
    $('to-keys').onclick = $('d-keys').onclick = function (e) { e.preventDefault(); closeAll(); $('keys').scrollIntoView({ behavior: 'smooth' }); };
    Array.prototype.forEach.call($('langseg').children, function (b) { b.onclick = function () { lang = b.getAttribute('data-lang'); t = T[lang]; store('dhammaLanguage', lang); FIRST_DAY = lang === 'ru' ? 1 : 0; applyLang(); paintKeys(); paint(); }; });
    Array.prototype.forEach.call($('themeseg').children, function (b) { b.onclick = function () { setTheme(b.getAttribute('data-theme-set')); }; });
    $('d-set').onclick = function () { openPanel('p-set'); };
    $('d-ics').onclick = $('p-ics').onclick = downloadIcs;
    $('d-share').onclick = function () {
      var url = location.origin + '/uposatha-calendar' + (lang === 'ru' ? '?lang=ru' : '');
      if (navigator.share) navigator.share({ title: t.shareTitle, url: url }).catch(function () { /* cancelled */ });
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast(t.linkCopied); });
      else window.prompt(t.shareTitle, url);
    };
    $('tz').onchange = function (e) { state.tz = e.target.value; store('dgUposathaTz', state.tz); paint(); };
    Array.prototype.forEach.call($('hemiseg').children, function (b) { b.onclick = function () { state.south = b.getAttribute('data-hemi') === 'south'; store('dgUposathaHemisphere', state.south ? 'south' : 'north'); paint(); }; });
    $('sw-sut').onclick = function () { state.ref = state.ref === 18 ? 6 : 18; store('dgUposathaSutta', state.ref === 18 ? '1' : '0'); paint(); };
    $('sw-det').onclick = function () { state.lite = !state.lite; store('dgUposathaLite', state.lite ? '1' : '0'); paint(); };
    function setPlace(lat, lon, name) { // the place fixes the Sun; south of the equator flips the moon's shape
      state.loc = { lat: lat, lon: lon }; if (name) state.loc.name = name; store('dgUposathaLoc', JSON.stringify(state.loc));
      state.south = lat < 0; store('dgUposathaHemisphere', state.south ? 'south' : 'north');
    }
    $('loc-btn').onclick = function () {
      if (!navigator.geolocation) { state.locMsg = t.locDenied; paint(); return; }
      $('locnote').textContent = t.locFinding;
      navigator.geolocation.getCurrentPosition(function (pos) {
        // about a kilometre is plenty for a sunrise, and less to keep
        setPlace(Math.round(pos.coords.latitude * 100) / 100, Math.round(pos.coords.longitude * 100) / 100); state.locMsg = ''; paint();
      }, function () { state.locMsg = t.locDenied; paint(); }, { timeout: 15000, maximumAge: 3600000 });
    };
    $('cities').innerHTML = Object.keys(ZONE_COORDS).sort(function (a, b) { return a.split('/').pop() < b.split('/').pop() ? -1 : 1; }).map(function (z) { return '<option value="' + esc(z.split('/').pop().replace(/_/g, ' ') + ' · ' + z) + '">'; }).join('');
    $('city').onchange = function (e) { // a city: its time zone, its coordinates (so the real sunrise and sunset), its hemisphere
      var zone = String(e.target.value).split('·').pop().trim(), c = ZONE_COORDS[zone];
      if (!c) return;
      state.tz = zone; store('dgUposathaTz', zone); setPlace(c[0], c[1], String(e.target.value).split('·')[0].trim()); state.locMsg = ''; paint();
    };
    function saveRem() { store('dgUposathaRemind', JSON.stringify(state.rem)); }
    $('sw-rem').onclick = function () {
      state.remMsg = '';
      if (state.rem.on) { state.rem.on = false; saveRem(); paint(); return; }
      var LN = nativePlugin();
      if (LN) {
        LN.requestPermissions().then(function (r) { state.rem.on = !!(r && r.display === 'granted'); if (!state.rem.on) state.remMsg = t.remDenied; saveRem(); paint(); }).catch(function () { state.remMsg = t.remUnsupported; paint(); });
        return;
      }
      if (!('Notification' in window)) { state.remMsg = t.remUnsupported; paint(); return; }
      Notification.requestPermission().then(function (perm) { state.rem.on = perm === 'granted'; if (perm !== 'granted') state.remMsg = t.remDenied; saveRem(); paint(); });
    };
    $('rem-lead').onchange = function (e) { state.rem.lead = parseInt(e.target.value, 10); saveRem(); paint(); };
    $('rd8').onclick = function () { state.rem.d8 = !state.rem.d8; saveRem(); paint(); };
    $('rd14').onclick = function () { state.rem.d14 = !state.rem.d14; saveRem(); paint(); };
    $('rd-sel').onchange = function (e) { readSutta(+e.target.value); };
    $('rd-close').onclick = function () { $('reader').hidden = true; markReader(); };
    document.addEventListener('visibilitychange', function () { if (!document.hidden) paint(); });
    window.addEventListener('resize', reportHeight);
    window.addEventListener('message', function (e) { if (e.data && e.data.dgFrameHeightRequest) reportHeight(); });
  }

  // ---------- go ----------
  if (embed) document.body.classList.add('embed');
  var themeMode = params.get('theme') || store('theme') || 'auto';
  setTheme(themeMode === 'dark' || themeMode === 'light' ? themeMode : 'auto');
  if (params.get('theme')) store('theme', store('theme') || params.get('theme')); // a theme passed in the URL is not remembered over the user's own
  applyLang(); paintKeys(); wire(); paint();
  // The docs page may not be listening yet when the first height goes out (the frame can load before the page hydrates), so it
  // is repeated for a few seconds and whenever the parent asks.
  [300, 1000, 2500].forEach(function (ms) { setTimeout(reportHeight, ms); });

  // Installable as an app of its own (its own manifest, start_url and scope). The site's service worker at /sw.js controls the
  // page; it is registered here too, so visiting the calendar first is enough to install it.
  if (!embed && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () { /* not fatal: the page works without it */ });
})();
