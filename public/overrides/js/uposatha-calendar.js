// The Uposatha calendar as a page of its own (/uposatha-calendar), also embedded (?embed=1) in the docs page.
//
// Two schemes, kept apart, one switch ("By the suttas", on by default).
// By the suttas: six days a month, the 14th, 15th and 8th lunar days of each half. A day begins in the evening, so an
// Uposatha is dated by the EVENING it begins - the night of that date, then the day after - and its lunar day is the one in
// force at the dawn that follows (06:00 without a place), because its daytime lies there.
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
  var T = {
    en: {
      pH: 'Parts of the day and night', pSub: 'Sunrise to sunset is cut into three parts, and sunset to sunrise likewise — for your place and the season.', pDay: 'Day', pNight: 'Night',
      dayParts: [['Pubbaṇhasamaya', 'morning'], ['Majjhanhikasamaya', 'midday'], ['Sāyanhasamaya', 'evening']], nightParts: [['Paṭhama yāma', 'first watch'], ['Majjhima yāma', 'middle watch'], ['Pacchima yāma', 'last watch']],
      fSpecial: 'special', fGeneral: 'general', fRandom: 'random', slTitle: 'From the suttas', fAll: 'All', sortKind: 'By kind', sortSutta: 'By sutta', showAll: 'Show all', readIt: 'Read', dayTag: function (d) { return d.map(function (n) { return n + 'th'; }).join(', ') + ' day'; },
      age: 'age', of30: 'of 30', from: 'from', left: 'left', dU: 'd', hU: 'h', mU: 'min',
      searchPh: 'Search: kacchapa, dn22…', searchGo: 'Search', tag: 'observance days', compass: 'Favorites / History', menu: 'Menu', theme: 'Theme', prev: 'Previous', next: 'Next', close: 'Close',
      h1: 'Uposatha days', lead: 'The 14th, 15th and 8th lunar days of each half-month, as the suttas count them — six a month.', suttas: 'The suttas on Uposatha →',
      today: 'Today', change: 'change', tList: 'Uposatha days', tCal: 'Calendar', more: 'Three more months', todayBtn: 'Today',
      kH: 'Key suttas to start with', kSub: 'Each “Read →” opens the sutta at the passage in question and highlights it.', kNow: 'Now open', kNew: 'Open in a new window',
      lic: 'Licences', mt: 'Multitool', lHome: 'Home', lToc: 'Contents', lDict: 'Dictionary', lMemo: 'Memorizer', lang: 'Language', themeH: 'Theme', dark: 'Dark', light: 'Light', auto: 'Auto',
      gCal: 'Calendar', subNote: 'Subscribe: the days for a year ahead, kept up to date by itself.', icsNote: 'Or a file, once: the next 12 months.', copyLink: 'Copy link',
      ics: 'Download .ics file', suttasL: 'The suttas on Uposatha', help: 'Help', share: 'Share', settingsL: 'Uposatha settings', settings: 'Settings',
      gPlace: 'Place & time', tz: 'Time zone', hemi: 'Hemisphere', hemiD: 'how the moon is drawn', north: 'Northern', south: 'Southern',
      loc: 'Location', locD: 'for the real sunrise and sunset; otherwise 18:00 and 06:00', myLoc: 'Use my location', city: 'or a city: Almaty…',
      locNone: 'The location is not shared — the fixed times are used.', locFinding: 'Locating…', locOk: 'Location', locForget: 'forget', locDenied: 'The location was not shared — the fixed times are used.',
      gCount: 'Counting', bySuttas: 'By the suttas', bySuttasD: 'Off — the four moon-phase days',
      detail: 'Details', detailD: 'Off — the short form',
      gRem: 'Reminders', remind: 'Remind me', adv: 'In advance', leads: [[1, '1 hour'], [3, '3 hours'], [12, '12 hours'], [24, '1 day'], [48, '2 days']], days: 'Days',
      remNote: 'Notifications appear while this app is open or running in the background on your device. For reminders that arrive when it is fully closed, add the days to your phone\'s calendar.',
      remAppNote: 'Reminders are scheduled on this device and arrive even when the app is closed.',
      remNext: function (when, what) { return 'Next reminder: ' + when + ' — ' + what; }, remNone: 'No reminder is due in the coming weeks.',
      remDenied: 'Notifications are blocked for this site — allow them in the browser settings.', remUnsupported: 'This browser cannot show notifications.',
      remBody: function (when) { return 'begins ' + when; }, remTwo: function (when) { return 'Two Uposatha days: the 14th and the 15th. The first begins ' + when; },
      full: 'Full moon', newm: 'New moon', fullL: 'full moon', newL: 'new moon', illum: 'illuminated', ld: 'lunar day', of15: 'of 15', until: 'until',
      phases: ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'],
      tonight: 'The Uposatha begins this evening', next2: 'Next', inN: function (n) { return 'in ' + n + ' day' + (n > 1 ? 's' : ''); }, tomorrow: 'tomorrow', isToday: 'today',
      kBegins: 'Begins', kSpan: 'Observed', kLunar: 'Lunar day', kTime: 'Exact time',
      beginsVal: function (eve, sun) { return 'evening ' + eve + (sun ? ' (' + sun + ')' : ''); }, spanVal: function (night, day) { return 'night of ' + night + ' → day of ' + day; },
      sunrise: 'sunrise', sunset: 'sunset',
      lunarVal: function (tithi, nth, half, change) { return tithi + ' of 30 (' + nth + ' of the ' + half + ') · until ' + change; },
      keptWith: function (nth) { return 'the ' + nth + ' day is skipped and kept with this date'; }, skipped: function (nth) { return nth + ' lunar day is skipped — it begins and ends between two readings'; },
      repeats: 'the same lunar day as the day before',
      modeS: 'by the suttas · 6 a month', modeM: 'modern · 4 a month', lgS: 'the evening an Uposatha begins', lgS15: '15th — full / new moon', lgS814: '8th and 14th', lgM15: 'new / full moon', lgM8: 'quarters', lgT: 'today',
      cellHint: 'Tap a date for details.', pickDate: 'Tap a date',
      wds: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], docs: '/docs/uposatha', linkCopied: 'Link copied', shareTitle: 'Uposatha days', locale: 'en-GB',
    },
    ru: {
      pH: 'Части дня и ночи', pSub: 'Время от восхода до заката делится на три части, и от заката до восхода тоже — для вашего места и сезона.', pDay: 'День', pNight: 'Ночь',
      dayParts: [['Pubbaṇhasamaya', 'утро'], ['Majjhanhikasamaya', 'полдень'], ['Sāyanhasamaya', 'вечер']], nightParts: [['Paṭhama yāma', 'первая стража'], ['Majjhima yāma', 'средняя стража'], ['Pacchima yāma', 'последняя стража']],
      fSpecial: 'особое', fGeneral: 'общее', fRandom: 'случайное', slTitle: 'Из сутт', fAll: 'Все', sortKind: 'По видам', sortSutta: 'По суттам', showAll: 'Показать все', readIt: 'Читать', dayTag: function (d) { return d.map(function (n) { return n + '-й'; }).join(', ') + ' день'; },
      age: 'возраст', of30: 'из 30', from: 'с', left: 'осталось', dU: 'д', hU: 'ч', mU: 'мин',
      searchPh: 'Поиск: kacchapa, dn22…', searchGo: 'Найти', tag: 'дни соблюдения', compass: 'Избранное / История', menu: 'Меню', theme: 'Тема', prev: 'Назад', next: 'Вперёд', close: 'Закрыть',
      h1: 'Дни упосатхи', lead: '14-й, 15-й и 8-й лунные дни каждой половины месяца, как их считают сутты, — шесть в месяц.', suttas: 'Сутты об упосатхе →',
      today: 'Сегодня', change: 'изменить', tList: 'Упосатхи', tCal: 'Календарь', more: 'Ещё три месяца', todayBtn: 'Сегодня',
      kH: 'Ключевые сутты для начала', kSub: 'Каждое «Читать →» открывает сутту на нужном месте и подсвечивает его.', kNow: 'Сейчас открыта', kNew: 'Открыть в новом окне',
      lic: 'Лицензии', mt: 'Мультитул', lHome: 'Главная', lToc: 'Оглавление', lDict: 'Словарь', lMemo: 'Меморайзер', lang: 'Язык', themeH: 'Тема', dark: 'Тёмная', light: 'Светлая', auto: 'Авто',
      gCal: 'Календарь', subNote: 'Подписка: дни на год вперёд, обновляется сама.', icsNote: 'Или файлом, один раз: на 12 месяцев вперёд.', copyLink: 'Копировать ссылку',
      ics: 'Скачать файл .ics', suttasL: 'Сутты об упосатхе', help: 'Помощь', share: 'Поделиться', settingsL: 'Настройки упосатхи', settings: 'Настройки',
      gPlace: 'Место и время', tz: 'Часовой пояс', hemi: 'Полушарие', hemiD: 'как рисовать луну', north: 'Северное', south: 'Южное',
      loc: 'Место', locD: 'для настоящих восхода и заката; без него — 18:00 и 06:00', myLoc: 'Определить моё место', city: 'или город: Алматы…',
      locNone: 'Место не передано — используется фиксированное время.', locFinding: 'Определяю…', locOk: 'Место', locForget: 'забыть', locDenied: 'Место не передано — используется фиксированное время.',
      gCount: 'Счёт', bySuttas: 'По суттам', bySuttasD: 'Выкл — четыре дня лунных фаз',
      detail: 'Подробно', detailD: 'Выкл — короткая форма',
      gRem: 'Напоминания', remind: 'Напоминать', adv: 'Заранее', leads: [[1, 'за 1 час'], [3, 'за 3 часа'], [12, 'за 12 часов'], [24, 'за сутки'], [48, 'за 2 суток']], days: 'Дни',
      remNote: 'Уведомления приходят, пока приложение открыто или работает в фоне на вашем устройстве. Чтобы напоминание пришло и при полностью закрытом приложении, добавьте дни в календарь телефона.',
      remAppNote: 'Напоминания ставятся на этом устройстве и приходят даже при закрытом приложении.',
      remNext: function (when, what) { return 'Ближайшее напоминание: ' + when + ' — ' + what; }, remNone: 'В ближайшие недели напоминаний нет.',
      remDenied: 'Уведомления для сайта запрещены — разрешите их в настройках браузера.', remUnsupported: 'Этот браузер не умеет показывать уведомления.',
      remBody: function (when) { return 'начинается ' + when; }, remTwo: function (when) { return 'Две упосатхи: 14-й и 15-й дни. Первая начинается ' + when; },
      full: 'Полнолуние', newm: 'Новолуние', fullL: 'полнолуние', newL: 'новолуние', illum: 'освещено', ld: 'лунный день', of15: 'из 15', until: 'до',
      phases: ['Новолуние', 'Растущий серп', 'Первая четверть', 'Растущая Луна', 'Полнолуние', 'Убывающая Луна', 'Последняя четверть', 'Убывающий серп'],
      tonight: 'Упосатха начинается сегодня вечером', next2: 'Следующая', inN: function (n) { var m = n % 10, h = n % 100; return 'через ' + n + ' ' + (m === 1 && h !== 11 ? 'день' : m >= 2 && m <= 4 && (h < 12 || h > 14) ? 'дня' : 'дней'); }, tomorrow: 'завтра', isToday: 'сегодня',
      kBegins: 'Начало', kSpan: 'Упосатха', kLunar: 'Лунный день', kTime: 'Точное время',
      beginsVal: function (eve, sun) { return 'вечер ' + eve + (sun ? ' (' + sun + ')' : ''); }, spanVal: function (night, day) { return 'ночь ' + night + ' → день ' + day; },
      sunrise: 'восход', sunset: 'закат',
      lunarVal: function (tithi, nth, half, change) { return tithi + ' из 30 (' + nth + ' ' + half + ') · до ' + change; },
      keptWith: function (nth) { return nth + ' день пропущен и соблюдается в эту дату'; }, skipped: function (nth) { return nth + ' лунный день пропущен — он начинается и кончается между двумя замерами'; },
      repeats: 'тот же лунный день, что и накануне',
      modeS: 'по суттам · 6 в месяц', modeM: 'современная · 4 в месяц', lgS: 'вечер, с которого начинается упосатха', lgS15: '15-й — полнолуние / новолуние', lgS814: '8-й и 14-й', lgM15: 'новолуние / полнолуние', lgM8: 'четверти', lgT: 'сегодня',
      cellHint: 'Нажмите на дату, чтобы увидеть подробности.', pickDate: 'Нажмите на дату',
      wds: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'], docs: '/ru/docs/uposatha', linkCopied: 'Ссылка скопирована', shareTitle: 'Дни упосатхи', locale: 'ru-RU',
    },
  };
  ['en', 'ru'].forEach(function (l) { Object.assign(T[l], window.UposathaCore.NAMES[l]); });
  var lang = (params.get('lang') || store('dhammaLanguage') || (navigator.language || 'en')).slice(0, 2) === 'ru' ? 'ru' : 'en';
  var t = T[lang];

  // Key suttas: {n} in the text is a "Read →" button for the n-th passage; every passage opens at its own segment.
  var PASSAGES = [
    ['an10.46:1.5', 'AN 10.46'], ['mn83:3.3', 'MN 83'], ['mn146:15.2', 'MN 146 · 14th|14-й'], ['mn146:27.2', 'MN 146 · 15th|15-й'],
    ['an3.37:1.3', 'AN 3.37 · 14th|14-й'], ['an3.37:1.5', 'AN 3.37 · 15th|15-й'], ['an3.37:1.1', 'AN 3.37 · 8th|8-й'],
    ['an3.70:2.3', 'AN 3.70 · three kinds|три вида'], ['an3.70:2.4', 'AN 3.70 · cowherd|пастух'], ['an3.70:3.1', 'AN 3.70 · Nigaṇṭha|ниганты'],
    ['an3.70:4.1', 'AN 3.70 · Noble One|Благородный'], ['an3.70:19.3', 'AN 3.70 · nights and days|ночь и день'],
    ['sn20.4:1.2', 'SN 20.4 · parts of the day|части дня'], ['mn53:10.3', 'MN 53 · night watches|стражи ночи'], ['ud1.1:1.4', 'Ud 1.1 · first watch|первая стража'],
  ];
  var KEYS = {
    en: [['AN 10.46', 'skipping the uposathas is not allowed (“it is your loss and failure”). {0}'], ['MN 83', 'one should observe the 14th, 15th, and 8th days. {1}'],
      ['MN 146', 'the 14th of the waxing moon {2} and the 15th, the full moon {3}.'], ['AN 3.37', 'the 14th {4}, 15th {5} and 8th {6} days compared with the visits of deities of different ranks.'],
      ['AN 3.70', 'the three kinds of Uposatha {7}: how it should <b>not</b> be observed — the “cowherd\'s Uposatha” {8} and the “Nigaṇṭha\'s Uposatha” {9} — and how the Noble One\'s Uposatha should be observed {10}. The sutta says “nights and days” rather than “days and nights” {11}; the Pali has the fixed expression <i>ahoratta</i> (“day-night”) in other contexts.'],
      ['SN 20.4', 'the three parts of the day: <i>pubbaṇhasamaya</i>, <i>majjhanhikasamaya</i>, <i>sāyanhasamaya</i>. {12}'],
      ['MN 53', 'the three watches of the night: <i>paṭhama</i>, <i>majjhima</i>, <i>pacchima yāma</i> {13}; the same in AN 8.9, and in Ud 1.1 the Buddha spends the first watch on dependent origination. {14}']],
    ru: [['АН 10.46', 'пропускать упосатху нельзя («это ваша потеря и неудача»). {0}'], ['МН 83', 'нужно соблюдать 14-й, 15-й и 8-й дни. {1}'],
      ['МН 146', '14-й день растущей Луны {2} и 15-й, полнолуние {3}.'], ['АН 3.37', '14-й {4}, 15-й {5} и 8-й {6} дни в сравнении с посещениями божеств разных рангов.'],
      ['АН 3.70', 'три вида упосатхи {7}: как её <b>не</b> нужно соблюдать — «упосатха пастуха» {8} и «упосатха ниганты» {9} — и как соблюдать упосатху Благородного {10}. В сутте «ночь и день», а не «день и ночь» {11}; в пали в других контекстах стоит устойчивое выражение <i>ahoratta</i> («день-ночь»).'],
      ['СН 20.4', 'три части дня: <i>pubbaṇhasamaya</i>, <i>majjhanhikasamaya</i>, <i>sāyanhasamaya</i>. {12}'],
      ['МН 53', 'три стражи ночи: <i>paṭhama</i>, <i>majjhima</i>, <i>pacchima yāma</i> {13}; то же в АН 8.9, а в Уд 1.1 Будда проводит первую стражу над зависимым возникновением. {14}']],
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
    rem: (function () { var d = { on: false, lead: 24, d8: true, d14: true, d15: false }; try { var v = JSON.parse(store('dgUposathaRemind')); if (v) for (var k in d) if (k in v) d[k] = v[k]; } catch (e) { /* defaults */ } return d; })(),
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

  // ---------- the Moon and the Sun (the calculation lives in uposatha-core.js, shared with the calendar feed) ----------
  var C = window.UposathaCore;
  var localDay = C.localDay, zonedToUtc = C.zonedToUtc, sunEvent = C.sunEvent, tithiAt = C.tithiAt, dayNo = C.dayNo, ymdAdd = C.ymdAdd;
  function dataset(from, to) { return C.dataset(from, to, { tz: state.tz, sutta: sutta(), loc: state.loc }); }

  // ---------- drawing ----------
  // The moon as an emoji (index 0..7 = new, waxing crescent, first quarter, waxing gibbous, full, waning gibbous, last quarter,
  // waning crescent); the lit side flips in the Southern Hemisphere.
  var MOON_N = ['\uD83C\uDF11', '\uD83C\uDF12', '\uD83C\uDF13', '\uD83C\uDF14', '\uD83C\uDF15', '\uD83C\uDF16', '\uD83C\uDF17', '\uD83C\uDF18'];
  var MOON_S = ['\uD83C\uDF11', '\uD83C\uDF18', '\uD83C\uDF17', '\uD83C\uDF16', '\uD83C\uDF15', '\uD83C\uDF14', '\uD83C\uDF13', '\uD83C\uDF12'];
  function moon(i, cls) { return '<span class="' + cls + '" aria-hidden="true">' + (state.south ? MOON_S : MOON_N)[i] + '</span>'; }
  // The shape each Uposatha day is drawn with: the 8th a quarter, the 14th the last not-yet-full (or not-yet-new) shape, the 15th
  // the full moon in the waxing half and the new moon in the waning one.
  function dayPhaseI(waxing, n) { return waxing ? (n === 8 ? 2 : n === 14 ? 3 : 4) : (n === 8 ? 6 : n === 14 ? 7 : 0); }
  function rowI(r) { return sutta() ? dayPhaseI(r.names[0] <= 15, dayNo(r.names[0])) : [0, 2, 4, 6][r.phase]; }
  function halfName(tithi) { return C.halfName(t, tithi); }
  function nameOf(r) { return C.nameOf(t, r, sutta()); }

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
      stamp: new Intl.DateTimeFormat(L, { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit' }),
      remWhen: new Intl.DateTimeFormat(L, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
    };
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function line(k, v, grey) { return '<span class="ln' + (grey ? ' grey' : '') + '">' + (k ? '<span class="k">' + esc(k) + ':</span> ' : '') + esc(v) + '</span>'; }
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
    h += line(t.kLunar, t.lunarVal(r.tithi, t.nth(r.day), t.halvesOf[r.tithi <= 15 ? 0 : 1], F.stamp.format(r.ends.date)), true);
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
    renderMultitool();
    Array.prototype.forEach.call($('langseg').children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
    $('rem-lead').innerHTML = t.leads.map(function (l) { return '<option value="' + l[0] + '">' + esc(l[1]) + '</option>'; }).join('');
  }
  function setTheme(mode) { // light | dark | auto, stored under the site's own key
    store('theme', mode);
    var eff = mode === 'auto' ? (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;
    document.documentElement.setAttribute('data-theme', eff);
    document.documentElement.setAttribute('data-bs-theme', eff); // the shared scripts (quick window, settings.js) read these
    document.body.classList.toggle('dark', eff === 'dark');
    Array.prototype.forEach.call($('themeseg').children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === mode)); });
  }
  function toast(msg) { var e = $('toast'); e.textContent = msg; e.classList.add('on'); setTimeout(function () { e.classList.remove('on'); }, 2000); }
  function openPanel(id) { closeAll(); $(id).setAttribute('data-open', 'true'); $('scrim').setAttribute('data-open', 'true'); }
  function closeAll() { ['drawer', 'sl-modal', 'scrim'].forEach(function (i) { $(i).setAttribute('data-open', 'false'); }); }

  // Lit part of the Moon to a hundredth of a percent: near the full moon a whole percent stays the same for half a day.
  function illumPercent(d) { var v = (A.Illumination('Moon', d).phase_fraction * 100).toFixed(2); return lang === 'ru' ? v.replace('.', ',') : v; }
  // What changes while the page is open: the lit part, the Moon's age since the new moon and the time left of the lunar day.
  var live = { ends: null, born: null };
  function span(ms) {
    var m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60);
    return (d ? d + ' ' + t.dU + ' ' : '') + h + ' ' + t.hU + ' ' + (m % 60) + ' ' + t.mU;
  }
  function liveTick() {
    if (document.hidden) return;
    var now = new Date(), e;
    if ((e = $('pct'))) e.textContent = illumPercent(now);
    if ((e = $('age')) && live.born) e.textContent = span(now - live.born);
    if ((e = $('left')) && live.ends) e.textContent = span(live.ends - now);
  }
  // The parts of the day: sunrise to sunset in three, sunset to sunrise in three (fixed 06:00 / 18:00 without a place).
  function paintParts(F, now, ymd) {
    var obs = state.loc ? new A.Observer(state.loc.lat, state.loc.lon, 0) : null, tz = state.tz;
    function sun(kind, d) { var p = d.split('-').map(Number); return sunEvent(kind, p[0], p[1], p[2], tz, obs) || zonedToUtc(p[0], p[1], p[2], kind === 'rise' ? 6 : 18, tz); }
    var rise = sun('rise', ymd), set = sun('set', ymd);
    var nightFrom = now < rise ? ymdAdd(ymd, -1) : ymd, nStart = sun('set', nightFrom), nEnd = sun('rise', ymdAdd(nightFrom, 1));
    function block(title, sub, from, to, names) {
      var third = (to - from) / 3;
      return '<div class="pblk"><h3>' + esc(title) + '<span>' + esc(sub) + '</span></h3>' + names.map(function (n, i) {
        var a = from.getTime() + i * third, b = a + third;
        return '<div class="prow"' + (now >= a && now < b ? ' data-now="true"' : '') + '><span><b>' + esc(n[0]) + '</b><small>' + esc(n[1]) + '</small></span><span class="tm">' + F.hm.format(a) + ' – ' + F.hm.format(b) + '</span></div>';
      }).join('') + '</div>';
    }
    $('pgrid').innerHTML = block(t.pDay, F.week.format(Date.parse(ymd)), rise, set, t.dayParts) +
      block(t.pNight, F.week.format(Date.parse(nightFrom)) + ' → ' + F.week.format(Date.parse(ymdAdd(nightFrom, 1))), nStart, nEnd, t.nightParts);
  }
  function paint() {
    var now = new Date(), tz = state.tz, F = formats(), su = sutta();
    var todayYmd = localDay(now, tz), tp = todayYmd.split('-').map(Number);
    var monthStart = tp[0] + '-' + pad(tp[1]) + '-01';
    var emoji = state.south;
    document.body.setAttribute('data-screen', state.screen);
    document.body.setAttribute('data-mode', state.lite ? 'lite' : 'detailed');
    document.body.setAttribute('data-loc', state.loc ? 'on' : 'off');
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
    var percent = illumPercent(now);
    var dayEnds = A.SearchMoonPhase((tithi * 12) % 360, now, 3);
    var dayBegan = A.SearchMoonPhase(((tithi - 1) * 12) % 360, new Date(now.getTime() - 2 * DAY), 3); // the lunar day in force began within the last ~26 hours
    var lastNew = A.SearchMoonPhase(0, new Date(now.getTime() - 30 * DAY), 40);
    live = { ends: dayEnds && dayEnds.date, born: lastNew && lastNew.date };
    $('t-moon').innerHTML = moon(pIndex, 'moon');
    $('t-date').textContent = cap(F.dateLong.format(now));
    var dot = '<span class="dot">·</span>';
    $('t-phase').innerHTML = '<span>' + esc(t.phases[pIndex]) + '</span>' + dot + '<span><span id="pct">' + percent + '</span>% ' + esc(t.illum) + '</span>' + dot + '<span>' + esc(t.age) + ' <span id="age"></span></span><br>' +
      '<span><b style="font-weight:600;color:var(--dg-text)">' + esc(t.ld) + ' ' + tithi + '</b> ' + esc(t.of30) + ' (' + esc(t.nth(dayNo(tithi))) + ' ' + esc(t.halvesOf[tithi <= 15 ? 0 : 1]) + ')</span>' +
      (dayEnds ? dot + '<span>' + (dayBegan ? esc(t.from) + ' ' + esc(F.stamp.format(dayBegan.date)) + ' ' : '') + esc(t.until) + ' ' + esc(F.stamp.format(dayEnds.date)) + '</span>' + dot + '<span>' + esc(t.left) + ' <span id="left"></span></span>' : '');
    liveTick();
    paintParts(F, now, todayYmd);
    // which of the 8th / 14th / 15th are now or begin within a day (yesterday's while its evening-to-evening span still runs)
    var relDays = [];
    [now < evToday ? ymdAdd(todayYmd, -1) : null, todayYmd, ymdAdd(todayYmd, 1)].forEach(function (k) {
      var r = k && L.byYmd[k];
      if (r && r.uposatha) (su ? r.names.map(dayNo) : [r.phase === 0 || r.phase === 2 ? 15 : 8]).forEach(function (d) { if (relDays.indexOf(d) === -1) relDays.push(d); });
    });
    relDays.sort(function (a, b) { return a - b; });
    slidesFor(relDays);
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
        '<span class="n">' + esc(F.day.format(Date.parse(r.ymd))) + '<small>' + esc(F.wd.format(Date.parse(r.ymd))) + '</small></span>' + moon(rowI(r), 'moon mi') +
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
        if (su) { var dn = dayNo(r2.names[0]); u = String(dn); lb = '<span class="lb">' + moon(rowI(r2), 'moon mi') + '<span>' + esc(dn === 15 ? (r2.names[0] === 15 ? t.fullL : t.newL) : t.nth(dn)) + '</span></span>'; }
        else { u = (r2.phase === 0 || r2.phase === 2) ? '15' : '8'; lb = '<span class="lb">' + moon(rowI(r2), 'moon mi') + '<span>' + esc(t.events[r2.phase].toLowerCase()) + '</span></span>'; }
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
  function wantDay(r) { return C.wantDay(r, sutta(), state.rem); }
  function twoUposathas(r, byYmd) { return C.twoUposathas(r, byYmd, sutta()); }
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
    $('rd15').setAttribute('aria-pressed', String(state.rem.d15));
    $('rem-days-row').style.display = sutta() ? '' : 'none';
    $('rem-msg').textContent = state.remMsg || (permission === 'denied' ? t.remDenied : permission === 'unsupported' ? t.remUnsupported : (state.rem.on ? (next ? t.remNext(F.remWhen.format(next.when), next.title) : t.remNone) : ''));
    $('rem-note').textContent = inApp ? t.remAppNote : t.remNote;
    $('d-cal').style.display = inApp ? 'none' : '';
    $('sub-apple').href = feedUrl('webcal');
    $('sub-google').href = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(feedUrl('webcal'));
  }
  // The calendar file (one-off, the next 12 months) and the subscription feed (renews itself) come from the same core; the feed
  // is a plain URL with the choices in its query, so nothing is stored on our side.
  function feedUrl(scheme) {
    var host = /^(localhost|127\.)/.test(location.hostname) ? 'https://dhamma.gift' : location.origin;
    var q = ['lang=' + lang, 'tz=' + encodeURIComponent(state.tz), 'scheme=' + (sutta() ? 'sutta' : 'modern'), 'lead=' + state.rem.lead,
      'd8=' + (state.rem.d8 ? 1 : 0), 'd14=' + (state.rem.d14 ? 1 : 0), 'd15=' + (state.rem.d15 ? 1 : 0)];
    if (state.loc) q.push('lat=' + state.loc.lat, 'lon=' + state.loc.lon);
    var url = host + '/uposatha.ics?' + q.join('&');
    return scheme === 'webcal' ? url.replace(/^https?:/, 'webcal:') : url;
  }
  function downloadIcs() {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([C.buildIcs({ lang: lang, tz: state.tz, sutta: sutta(), loc: state.loc, rem: state.rem, days: 366 })], { type: 'text/calendar' }));
    a.download = 'uposatha.ics';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- multitool: the same tiles as the home page's menu, from the same menu-links.json ----------
  var menuData = null, menuLoading = false;
  var TILE_ORDER = { en: ['read', 'external', 'dicts', 'materials', 'tools', 'history', 'help'], ru: ['read', 'external', 'russian', 'dicts', 'materials', 'tools', 'history', 'help'] };
  var TILE_ICON = { read: 'book', external: 'globe', russian: 'book', dicts: 'dict', materials: 'cap', tools: 'wrench', history: 'star', help: 'help' };
  function linkAttrs(href) { return 'href="' + esc(href) + '"' + (/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ''); }
  function itemHtml(it, chip) {
    if (!it.href) return ''; // items that need a search word on the home page have no place here
    return chip ? '<a ' + linkAttrs(it.href) + '>' + esc(it.label) + '</a>'
      : '<a class="row" ' + linkAttrs(it.href) + '>' + esc(it.label) + (it.desc ? '<small>' + esc(it.desc) + '</small>' : '') + '</a>';
  }
  function groupHtml(g) {
    var h = g.name ? '<h4>' + esc(g.name) + '</h4>' : '';
    if (g.blocks) return h + g.blocks.map(function (b) { return (b.rows || b.inline || []).map(function (it) { return itemHtml(it, false); }).join(''); }).join('');
    var items = (g.items || []).map(function (it) { return itemHtml(it, g.layout === 'chips'); }).join('');
    return items ? h + (g.layout === 'chips' ? '<div class="chipline">' + items + '</div>' : items) : '';
  }
  function renderMultitool() {
    var host = $('mtlist');
    if (!menuData) {
      if (!menuLoading) {
        menuLoading = true;
        fetch('/nodejs/res/menu-links.json').then(function (r) { return r.json(); }).then(function (d) { menuData = d; renderMultitool(); }).catch(function () { menuLoading = false; });
      }
      return;
    }
    var data = menuData[lang] || menuData.en, open = {};
    Array.prototype.forEach.call(host.querySelectorAll('details[open]'), function (d) { open[d.getAttribute('data-k')] = true; });
    host.innerHTML = TILE_ORDER[lang].filter(function (k) { return data[k]; }).map(function (k) {
      var tile = data[k], label = esc(tile.drawerLabel || tile.label), ic = '<svg class="ic"><use href="#i-' + TILE_ICON[k] + '"/></svg>';
      if (k === 'help') return '<div class="mt-tile"><a href="' + t.docs + '">' + ic + '<span>' + label + '</span></a></div>';
      if (!tile.groups) return '<div class="mt-tile"><a href="' + esc(tile.href || '/') + '">' + ic + '<span>' + label + '</span></a></div>';
      return '<details class="mt-tile" data-k="' + k + '"' + (open[k] ? ' open' : '') + '><summary>' + ic + '<span>' + label + '</span><svg class="ic chev"><use href="#i-chev"/></svg></summary><div class="mt-body">' +
        tile.groups.map(groupHtml).join('') + '</div></details>';
    }).join('');
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

  // ---------- slideshow: sutta lines for the day, for keeping the Uposatha, and at random ----------
  var quotes = null, quotesLoading = false, slides = [], slSig = '', carousel = null;
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  // The first wave is for the 8th, 14th and 15th day when one is now or begins within a day; then the general lines, then a few at random.
  function buildSlides(days) {
    var all = quotes.filter(function (q) { return q[lang] || q.kind !== 'random'; }); // a random line with no translation into the page's language is left out; the key ones are shown in English
    var sp = all.filter(function (q) { return q.kind === 'special' && q.days.some(function (d) { return days.indexOf(d) !== -1; }); })
      .sort(function (a, b) { return a.days.length - b.days.length || a.days[0] - b.days[0]; }); // the lines for one day first, those for several after
    slides = sp.concat(shuffle(all.filter(function (q) { return q.kind === 'general'; })), shuffle(all.filter(function (q) { return q.kind === 'random'; })).slice(0, 8));
  }
  function slideText(q) { return q[lang] || q.en; }
  // The key words of the Uposatha (the day, its number, the parts of the day) are picked out in the Pali and in the translations.
  var KW = {
    pli: /(uposath|aṭṭham|cātuddas|pannaras|pāṭihāriy|pubbaṇhasamay|majjhanhikasamay|sāyanhasamay|yāma)[\p{L}]*/giu,
    ru: /(упосатх|восьм|четырнадцат|пятнадцат|страж)[\p{L}]*/giu,
    en: /(uposatha|sabbath|observance|eighth|fourteenth|fifteenth|watch)[\p{L}]*/giu,
  };
  function hl(text, re) { return esc(text).replace(re, '<b class="match finder">$&</b>'); } // the same look as a found word in the search results
  function trHtml(q) { return esc(slideText(q)); } // only the Pali is picked out; the translation stays plain
  function plate(q) { return '<i class="plate" data-k="' + q.kind + '">' + esc(t['f' + q.kind.charAt(0).toUpperCase() + q.kind.slice(1)]) + '</i>'; }
  function citeId(q) { return q.ref.split(':')[0]; } // dn1, an3.37 ... as everywhere on the site
  function citeText(q) { return citeId(q) + (q[lang] ? '' : ' · EN') + ' — ' + t.readIt; }
  // A slide has a fixed size, so a long text is cut down to the part that speaks of the Uposatha: from a little before the first key
  // word, as many characters as fit (fewer on a phone), with "..." where it was cut.
  function excerpt(text, re, max) {
    text = String(text).replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text;
    var m = new RegExp(re.source, 'iu').exec(text), pos = m ? m.index : 0, start = Math.max(0, pos - Math.floor(max * 0.25));
    if (start > 0) { var sp = text.indexOf(' ', start); if (sp !== -1 && sp < pos) start = sp + 1; }
    var end = Math.min(text.length, start + max);
    if (end < text.length) { var sp2 = text.lastIndexOf(' ', end); if (sp2 > start + max * 0.6) end = sp2; }
    return (start > 0 ? '… ' : '') + text.slice(start, end) + (end < text.length ? ' …' : '');
  }
  function limits() { return window.innerWidth >= 700 ? { pli: 180, tr: 170, pairs: 3 } : { pli: 100, tr: 100, pairs: 2 }; }
  // a verse: at most `n` lines, the window that holds the most key words
  function verseWindow(lines, n) {
    if (lines.length <= n) return lines;
    var best = 0, bestN = -1;
    for (var i = 0; i + n <= lines.length; i++) {
      var c = 0; lines.slice(i, i + n).forEach(function (l) { if (new RegExp(KW.pli.source, 'iu').test(l.pli)) c++; });
      if (c > bestN) { bestN = c; best = i; }
    }
    return lines.slice(best, best + n);
  }
  var CHEV = '<svg class="dg-slides-chev" viewBox="0 0 320 512" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"/></svg>';
  var ARW = ['M41.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 256 246.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z', 'M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z'];
  function slideHtml(q, i) {
    var L = limits(), trKw = q[lang] ? KW[lang] : KW.en, body;
    if (q.lines) { // a verse: each line of the Pali with its translation under it, as the reader shows gathas
      body = '<div class="sl-g">' + verseWindow(q.lines, L.pairs).map(function (l) { return '<b class="sl-gp pli-lang" lang="pi">' + hl(l.pli, KW.pli) + '</b><span class="sl-gt">' + esc(l[lang] || l.en) + '</span>'; }).join('') + '</div>';
    } else body = '<h5 class="pli-lang" lang="pi">' + hl(excerpt(q.pli, KW.pli, L.pli), KW.pli) + '</h5><span>' + esc(excerpt(slideText(q), trKw, L.tr)) + '</span>';
    return '<div class="carousel-item' + (i === 0 ? ' active' : '') + '">' + plate(q) + body + '<br><a href="/' + esc(q.ref) + '?lang=' + lang + '" target="_blank" rel="noopener" class="text-start">' + esc(citeText(q)) + CHEV + '</a></div>';
  }
  // The slideshow itself is the home page's (Bootstrap carousel, home.css); this fills it and does what home.js does around it:
  // the dots taper with the distance from the active one, and the card keeps one height.
  function renderCarousel() {
    var el = $('dg-carousel'), still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (carousel) { carousel.dispose(); carousel = null; }
    el.innerHTML = '<div class="dg-slides-box"><div class="carousel-inner">' + slides.map(slideHtml).join('') + '</div>' +
      ['prev', 'next'].map(function (d, n) { return '<button class="carousel-control-' + d + '" type="button" data-bs-target="#dg-carousel" data-bs-slide="' + d + '"><svg class="dg-slides-arw" viewBox="0 0 320 512" fill="currentColor" aria-hidden="true"><path d="' + ARW[n] + '"/></svg><span class="visually-hidden">' + d + '</span></button>'; }).join('') + '</div>' +
      '<div class="carousel-indicators">' + slides.map(function (_, i) { return '<button type="button" data-bs-target="#dg-carousel" data-bs-slide-to="' + i + '"' + (i === 0 ? ' class="active" aria-current="true"' : '') + ' aria-label="' + (i + 1) + '"></button>'; }).join('') + '</div>';
    var dots = el.querySelectorAll('.carousel-indicators [data-bs-slide-to]');
    function taper(active) { Array.prototype.forEach.call(dots, function (d, i) { d.setAttribute('data-d', Math.min(4, Math.abs(i - active))); }); }
    taper(0);
    el.addEventListener('slide.bs.carousel', function (e) { taper(e.to); });
    carousel = new bootstrap.Carousel(el, { interval: still ? false : 12000, ride: still ? false : 'carousel', pause: 'hover' });
    // one fixed height: the tallest slide (all are cut to a bounded size), so the card never changes size
    var inner = el.querySelector('.carousel-inner'), tallest = 0;
    Array.prototype.forEach.call(inner.querySelectorAll('.carousel-item'), function (item) {
      var was = item.classList.contains('active');
      if (!was) { item.style.display = 'block'; item.style.position = 'absolute'; item.style.visibility = 'hidden'; }
      tallest = Math.max(tallest, item.getBoundingClientRect().height);
      if (!was) { item.style.display = ''; item.style.position = ''; item.style.visibility = ''; }
    });
    if (tallest) inner.style.height = Math.ceil(tallest) + 'px';
    el.addEventListener('slid.bs.carousel', reportHeight);
    reportHeight();
  }
  // The whole library in a sheet like the home page's "all queries": one row per sutta (a sutta is one sutta, however many pieces of it
  // the slideshow shows), with its kind - the highest of its pieces - filterable and sortable.
  var slSort = 'kind', slFilter = 'all';
  var NIK = { dn: 0, mn: 1, sn: 2, an: 3 };
  // As in the search results: the four Nikayas by number, then the Khuddaka books alphabetically, then the Vinaya.
  function suttaKey(ref) {
    var m = ref.match(/^([a-z]+(?:-[a-z]+)*?)(\d+)(?:\.(\d+))?/) || [], pre = m[1] || ref;
    var grp = NIK[pre] !== undefined ? NIK[pre] : /^pli-tv/.test(ref) ? 5 : 4;
    return [grp, grp === 4 ? pre : grp === 5 ? ref.split(':')[0] : '', +(m[2] || 0), +(m[3] || 0)];
  }
  function cmpSutta(a, b) { var x = suttaKey(a.ref), y = suttaKey(b.ref); return x[0] - y[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0) || x[2] - y[2] || x[3] - y[3]; }
  function suttaList() {
    var rank = { special: 0, general: 1, random: 2 }, by = {}, order = [];
    (quotes || []).filter(function (q) { return q[lang] || q.kind !== 'random'; }).forEach(function (q) {
      var id = citeId(q);
      if (!by[id]) { by[id] = { id: id, title: q.title || {}, kind: q.kind, ref: q.ref, kinds: {} }; order.push(id); }
      else if (rank[q.kind] < rank[by[id].kind]) { by[id].kind = q.kind; by[id].ref = q.ref; }
    });
    return order.map(function (id) { return by[id]; });
  }
  function suttaRow(u) {
    var name = u.title[lang] || u.title.en || '';
    return '<a class="sr" href="/' + esc(u.ref) + '?lang=' + lang + '" target="_blank" rel="noopener"><b class="sid">' + esc(u.id) + '</b><span class="sr-t"><span class="sg-t">' + esc(u.title.pli || '') + (name && name !== u.title.pli ? ' <i>' + esc(name) + '</i>' : '') + '</span></span>' + plate(u) + '<svg class="chev"><use href="#i-right"/></svg></a>';
  }
  function showAllSlides() {
    var all = suttaList(), counts = { all: all.length, special: 0, general: 0, random: 0 };
    all.forEach(function (u) { counts[u.kind]++; });
    $('sl-modal-title').textContent = t.slTitle + ' · ' + all.length;
    Array.prototype.forEach.call($('sl-sort').children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-s') === slSort)); });
    $('sl-filter').innerHTML = ['all', 'special', 'general', 'random'].map(function (k) {
      return '<button type="button" data-f="' + k + '" aria-pressed="' + (k === slFilter) + '">' + esc(k === 'all' ? t.fAll : t['f' + k.charAt(0).toUpperCase() + k.slice(1)]) + ' · ' + counts[k] + '</button>';
    }).join('');
    var list = all.filter(function (u) { return slFilter === 'all' || u.kind === slFilter; }), html = '';
    if (slSort === 'kind') {
      ['special', 'general', 'random'].forEach(function (k) {
        var part = list.filter(function (u) { return u.kind === k; }).sort(cmpSutta);
        if (part.length) html += '<h4>' + esc(t['f' + k.charAt(0).toUpperCase() + k.slice(1)]) + ' · ' + part.length + '</h4>' + part.map(suttaRow).join('');
      });
    } else html = list.sort(cmpSutta).map(suttaRow).join('');
    $('sl-all-list').innerHTML = html;
    if ($('sl-modal').getAttribute('data-open') !== 'true') openPanel('sl-modal');
  }
  function slidesFor(days) {
    if (!quotes) {
      if (!quotesLoading) { quotesLoading = true; fetch('/assets/js/uposatha-quotes.json').then(function (r) { return r.json(); }).then(function (d) { quotes = d; slSig = ''; paint(); }).catch(function () { quotesLoading = false; }); }
      return;
    }
    var sig = days.join(',') + lang;
    $('slides').hidden = false;
    if (sig !== slSig) { slSig = sig; buildSlides(days); renderCarousel(); } // a new show only when the day or the language changes: a repaint must not restart it
  }

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
    $('b-menu').onclick = function () { openPanel('drawer'); };
    $('ctx-change').onclick = function () { openPanel('drawer'); $('d-uset').scrollIntoView(); };
    $('scrim').onclick = closeAll;
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.onclick = closeAll; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
    // The header hides on scrolling down and returns on a short scroll up, as on the rest of the site.
    var lastY = window.scrollY;
    window.addEventListener('scroll', function () {
      var y = window.scrollY, dy = y - lastY;
      document.body.classList.toggle('scrolled', y > 4);
      if (dy > 8 && y > 80) { document.querySelector('.tbar').classList.add('away'); lastY = y; }
      else if (dy < -4 || y <= 80) { document.querySelector('.tbar').classList.remove('away'); lastY = y; }
    }, { passive: true });
    $('hsearch').onsubmit = function (e) { e.preventDefault(); var q = $('paliauto').value.trim(); if (q) location.href = '/' + encodeURIComponent(q) + (lang === 'ru' ? '?lang=ru' : ''); };
    $('tab-list').onclick = function () { state.screen = 'list'; store('dgUposathaView', 'list'); paint(); };
    $('tab-cal').onclick = function () { state.screen = 'cal'; store('dgUposathaView', 'cal'); paint(); };
    $('more').onclick = function () { state.months += 3; paint(); };
    $('cal-prev').onclick = function () { state.calOff--; paint(); };
    $('cal-next').onclick = function () { state.calOff++; paint(); };
    $('cal-today').onclick = function () { state.calOff = 0; state.selected = null; paint(); };
    $('to-keys').onclick = function (e) { e.preventDefault(); $('keys').scrollIntoView({ behavior: 'smooth' }); };
    function setLang(l) { lang = l; t = T[lang]; store('dhammaLanguage', lang); FIRST_DAY = lang === 'ru' ? 1 : 0; applyLang(); paintKeys(); paint(); }
    Array.prototype.forEach.call($('langseg').children, function (b) { b.onclick = function () { setLang(b.getAttribute('data-lang')); }; });
    // The site-wide shortcuts (settings.js: Alt+1 language, Alt+H help, Alt+Y compass ...) find their hooks here.
    window.DHAMMA_I18N = { get language() { return lang; }, setLanguage: setLang };
    window.dgAnnounceLanguage = function (l) { toast(l === 'ru' ? 'Русский' : 'English'); };
    window.dgDrawerHelpHref = function () { return t.docs; };
    Array.prototype.forEach.call($('themeseg').children, function (b) { b.onclick = function () { setTheme(b.getAttribute('data-theme-set')); }; });
    $('p-ics').onclick = downloadIcs;
    $('sub-copy').onclick = function () { var u = feedUrl('https'); if (navigator.clipboard) navigator.clipboard.writeText(u).then(function () { toast(t.linkCopied); }); else window.prompt(t.copyLink, u); };
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
    $('rd15').onclick = function () { state.rem.d15 = !state.rem.d15; saveRem(); paint(); };
    $('sl-all-btn').onclick = showAllSlides;
    $('sl-filter').onclick = function (e) { var v = e.target.getAttribute && e.target.getAttribute('data-f'); if (v) { slFilter = v; showAllSlides(); } };
    $('sl-sort').onclick = function (e) { var v = e.target.getAttribute && e.target.getAttribute('data-s'); if (v) { slSort = v; showAllSlides(); } };
    $('rd-sel').onchange = function (e) { readSutta(+e.target.value); };
    $('rd-close').onclick = function () { $('reader').hidden = true; markReader(); };
    document.addEventListener('visibilitychange', function () { if (!document.hidden) paint(); });
    var wide = window.innerWidth >= 700;
    window.addEventListener('resize', function () { reportHeight(); var w = window.innerWidth >= 700; if (w !== wide) { wide = w; if (slides.length) renderCarousel(); } });
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
  setInterval(liveTick, 15000); // the Moon moves while the page is open

  // Installable as an app of its own (its own manifest, start_url and scope). The site's service worker at /sw.js controls the
  // page; it is registered here too, so visiting the calendar first is enough to install it.
  if (!embed && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () { /* not fatal: the page works without it */ });
})();
