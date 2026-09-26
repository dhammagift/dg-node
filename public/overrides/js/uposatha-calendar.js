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
      pH: 'Structure of the night and day', sH: 'Other moon tools', sSub: 'The beginning and the end of a lunar day and the phases of the Moon are astronomical data. To check them or to see them another way, use astronomical apps and sites.', sSite: 'Website', sApps: 'Apps', sDev: 'For developers', tSoft: 'Other tools', helpUrl: '/docs/uposatha/', tocH: 'On this page', tSummary: 'Summary', tSuttas: 'Suttas on the topic', tCalendar: 'Calendar', tParts: 'Structure of the night and day', tKeys: 'Key suttas', pSub: 'Time% from sunrise to sunset is cut into three equal parts, and from sunset to sunrise likewise — conventionally, for illustration, for your place and the season.', pWho: 'This is how the arahants and other monks of the suttas spend these parts.', pDay: 'Day', pNight: 'Night', setPlace: 'set a place', noonL: 'Midday', pMid: '** SN 28.1 has no word majjhanhikasamaya, but describes this part of the day; the word itself: MN 79.', pFixed: '* The times are conventional: sunrise 06:00, sunset 18:00, roughly as in the Buddha\'s lands.', pPlace: '* Conventional: three equal parts from sunrise to sunset and from sunset to sunrise.',
      dayParts: [['Pubbaṇhasamaya', 'morning', 'The monks put on robes and go for alms (piṇḍapāta)', 'sn28.1:1.2'], ['Majjhanhikasamaya', 'midday', 'Seclusion and practice, the day\'s meditation.**', 'sn28.1:1.4,mn79:17.2'], ['Sāyanhasamaya', 'evening', 'Coming out of seclusion: meeting and talking with the Teacher and the monks', 'sn28.1:2.1']], nightParts: [['Paṭhama yāma', 'first watch', 'Practice: walking and sitting, cleansing the mind', 'mn53:10.3'], ['Majjhima yāma', 'middle watch', 'The lion\'s posture: lying on the right side, mindful and aware', 'mn53:10.4'], ['Pacchima yāma', 'last watch', 'Rising: walking and sitting practice again', 'mn53:10.5']],
      fSpecial: 'special', fGeneral: 'general', fRandom: 'random', slTitle: 'From the suttas', addCal: 'Add to calendar', subH: 'Subscribe', fileH: 'Or a file', calRemind: 'The reminder time and the days are taken from the reminder settings in the menu.', gUposatha: 'Uposatha settings', on: 'On', off: 'Off', fAll: 'All', sortKind: 'By kind', sortSutta: 'By sutta', showAll: 'Show all', readIt: 'Read', dayTag: function (d) { return d.map(function (n) { return n + 'th'; }).join(', ') + ' day'; },
      age: 'age', of30: 'of 30', from: 'from', left: 'left', dU: 'd', hU: 'h', mU: 'min',
      searchPh: 'Search: kacchapa, dn22…', searchGo: 'Search', tocTitle: 'Contents (Alt+2)', clear: 'Clear', tag: 'observance days', compass: 'Favorites / History', menu: 'Menu', theme: 'Theme', prev: 'Previous', next: 'Next', close: 'Close',
      h1: 'Uposatha days', lead: 'The 14th, 15th and 8th lunar days of each half-month, as the suttas count them — six a month.', suttas: 'The suttas on Uposatha →',
      today: 'Today', change: 'change', tList: 'Uposatha days', tCal: 'Calendar', more: 'Three more months', todayBtn: 'Today',
      kH: 'Key suttas', kSub: 'Each “Read →” opens the sutta at the passage in question and highlights it.', kNow: 'Now open', kNew: 'Open in a new window',
      lic: 'Licences', mt: 'Multitool', lHome: 'Home', lToc: 'Contents', lDict: 'Dictionary', lMemo: 'Memorizer', lang: 'Language', themeH: 'Theme', dark: 'Dark', light: 'Light', auto: 'Auto',
      gCal: 'Calendar', subNote: 'The days for a year ahead, kept up to date by itself.', icsNote: 'Or a file, once: the next 12 months.', copyLink: 'Copy link',
      ics: 'Download .ics file', suttasL: 'The suttas on Uposatha', help: 'Help', share: 'Share', settingsL: 'Uposatha settings', settings: 'Settings',
      gPlace: 'Place & time', weekH: 'Week starts on', mon: 'Monday', sun: 'Sunday', tz: 'Time zone', hemi: 'Hemisphere', hemiD: 'how the moon is drawn', north: 'Northern', south: 'Southern',
      loc: 'Set a place or pick a city', locD: 'for the real sunrise and sunset; otherwise 18:00 and 06:00', myLoc: 'Use my location', city: 'or a city: Almaty…',
      locNone: 'The location is not shared — the fixed times are used.', locFinding: 'Locating…', locOk: 'Location', locForget: 'forget', locDenied: 'The location was not shared — the fixed times are used.',
      gCount: 'Counting', bySuttas: 'By the suttas', notBySuttas: 'NOT BY THE SUTTAS', bySuttasD: 'Off — the four moon-phase days',
      detail: 'Details', detailD: 'Off — the short form',
      gRem: 'Reminders', remind: 'Remind me', adv: 'In advance', leads: [[0, 'when it begins'], [1, '1 hour'], [3, '3 hours'], [12, '12 hours'], [24, '1 day'], [48, '2 days']], days: 'Days',
      remNote: 'Notifications appear while this app is open or running in the background on your device. For reminders that arrive when it is fully closed, add the days to your phone\'s calendar.',
      mealG: 'Meals', mealH: 'Meals', mealSub: 'Monks, and those who keep the Uposatha, eat in one part of the day: from dawn until midday. After midday and until dawn is <i>vikāla</i>, “the wrong time”. ',
      mealEat: function (noon, left) { return '<i>Kāla</i> — food is allowed. Midday at ' + noon + ' · until <i>vikāla</i>: ' + left; },
      mealVik: function (dawn, left) { return '<i>Vikāla</i> — until dawn at ' + dawn + ': ' + left; },
      noonBy: 'Count midday by', noonSunS: 'Sun', noonMidS: 'Middle of day', noonClockS: '12:00', noonWhat: 'Middle of the day: halfway between sunrise and sunset, the centre of the middle third.', noonChange: 'change', noonSun: 'the Sun (highest point)', noonMid: 'the middle of the day', noonClock: '12:00 by the clock', noonFixed: 'Without a place midday is 12:00 by the clock.',
      noonNote: 'The Vinaya says only “when midday has passed”, not how to find it. The Sun’s highest point is astronomical midday; the middle of the day is halfway between sunrise and sunset (almost the same); 12:00 by the clock can differ by an hour or more. Dawn here is taken as sunrise.',
 mealSet: 'Food (vikāla)', mealSumL: 'Show in the summary', mealRemL: 'Remind when the time for food ends', mealLead: 'In advance', mealLeads: [[0, 'when the time for food ends'], [15, '15 min before'], [30, '30 min before'], [45, '45 min before'], [60, '1 hour before'], [90, '1.5 hours before'], [120, '2 hours before']], mealDays: 'Days', mealDaysU: 'Uposatha days', mealDaysA: 'Every day', mealSnd: 'Sound of this reminder',
      twiL: 'Dawn and dusk', twiNote: 'Twilight: the Sun 6, 12 or 18° below the horizon. Sets the borders of the day and the night and the dawn in the meals card.', twiO: { sun: 'Sunrise and sunset', civil: 'Civil (−6°)', nautical: 'Nautical (−12°)', astro: 'Astronomical (−18°)' },
      tstL: 'Test a reminder', tstKinds: { upo: 'Uposatha day', beg: 'The time for food begins', end: 'The time for food ends' }, tst1: 'in 1 min', tst2: 'in 2 min', tstGo: 'Schedule the test',
      tstTitle: function (k) { return { upo: 'Uposatha (test)', beg: 'Time for food (test)', end: 'Vikāla soon (test)' }[k]; }, tstBody: 'A test reminder with the sound of this kind.', tstSet: function (at) { return 'It will come at ' + at + '.'; }, tstDenied: 'Notifications are not allowed.',
      testL: 'Test: show the state', testReal: 'as is', testTag: 'test',
      mealRemNow: 'Vikāla begins', mealRemZero: function (noon) { return 'Midday at ' + noon + ' — the time for food has ended.'; },
      mealBegL: 'Remind when the time for food begins', mealBegLeads: [[0, 'at dawn'], [15, '15 min before'], [30, '30 min before'], [60, '1 hour before']],
      mealBegNow: 'Time for food', mealBegZero: function (dawn) { return 'Dawn at ' + dawn + ' — the time for food has begun.'; },
      mealBegTitle: 'Time for food soon', mealBegBody: function (dawn, lead) { return 'Dawn at ' + dawn + ' — the time for food begins in ' + (lead >= 60 ? (lead / 60) + ' h' : lead + ' min') + '.'; },
      mealRemTitle: 'Vikāla soon', mealRemBody: function (noon, lead) { return 'Midday at ' + noon + ' — the time for food ends in ' + (lead >= 60 ? (lead / 60) + ' h' : lead + ' min') + '.'; },
      logoTip: 'Home · change the language: long press or right click', rateUs: 'Rate Us', appVer: 'App version', timeL: 'Time', ofMode: function (n, m, su) { return n + ' of ' + m + (su ? ' by the suttas' : ' modern'); }, locHere: 'by geo', locNone: 'manual', navHome: 'Summary', navList: 'Uposathas', navCal: 'Calendar', navParts: 'Night–day', navSet: 'Settings',
      sound: 'Sound', soundNone: 'Silent', soundOwn: 'My own sound…', soundOwnNamed: 'My own: %', soundFail: 'The sound was not set.', sounds: { gong: 'Gong', gong2: 'Gong 2', gong3: 'Gong 3', gong4: 'Gong 4', gong5: 'Gong 5', bell: 'Bell' },
      remAppNote: 'Reminders are scheduled on this device and arrive even when the app is closed.',
      remNext: function (when, what) { return 'Next reminder: ' + when + ' — ' + what; }, remNone: 'No reminder is due in the coming weeks.',
      remDenied: 'Notifications are blocked for this site — allow them in the browser settings.', remUnsupported: 'This browser cannot show notifications.',
      remBody: function (when) { return 'begins ' + when; }, remTwo: function (when) { return 'Two Uposatha days: the 14th and the 15th. The first begins ' + when; },
      full: 'Full moon', newm: 'New moon', fullL: 'full moon', newL: 'new moon', illum: 'illuminated', ld: 'lunar day', of15: 'of 15', until: 'until',
      phases: ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'],
      tonight: 'The Uposatha begins this evening', next2: 'Next', inN: function (n) { return 'in ' + n + ' day' + (n > 1 ? 's' : ''); }, tomorrow: 'tomorrow', isToday: 'today',
      kDay: 'Day', kBegins: 'Begins', kSpan: 'Observed', kLunar: 'Lunar day', kTime: 'Exact time',
      beginsVal: function (eve, sun) { return 'evening ' + eve + (sun ? ' (' + sun + ')' : ''); }, spanVal: function (night, day) { return 'night of ' + night + ' → day of ' + day; },
      sunrise: 'sunrise', sunset: 'sunset',
      lunarVal: function (tithi, nth, half, change) { return tithi + ' of 30 (' + nth + ' of the ' + half + ') · until ' + change; },
      keptWith: function (nth) { return 'the ' + nth + ' day is skipped and kept with this date'; }, skipped: function (nth) { return nth + ' lunar day is skipped — it begins and ends between two readings'; },
      repeats: 'the same lunar day as the day before',
      modeS: 'by the suttas · 6 a month', modeM: 'modern · 4 a month', lgS: 'the evening an Uposatha begins', lgC: 'the day of the Uposatha, until the evening', lgS15: '15th (begins in the evening)', lgS814: '8th and 14th', lgM15: 'new / full moon', lgM8: 'quarters', lgT: 'today',
      cellHint: 'Tap a date for details.', pickDate: 'Tap a date',
      wds: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], docs: '/docs/uposatha', linkCopied: 'Link copied', shareTitle: 'Uposatha days', locale: 'en-GB',
    },
    ru: {
      pH: 'Структура ночи-дня', sH: 'Другие лунные инструменты', sSub: 'Начало и конец лунного дня и фазы Луны — это астрономические данные. Чтобы проверить их или увидеть по-другому, пользуйтесь астрономическими приложениями и сайтами.', sSite: 'Сайт', sApps: 'Приложения', sDev: 'Разработчикам', tSoft: 'Другие инструменты', helpUrl: '/ru/docs/uposatha/', tocH: 'На странице', tSummary: 'Сводка', tSuttas: 'Сутты по теме', tCalendar: 'Календарь', tParts: 'Структура ночи-дня', tKeys: 'Ключевые сутты', pSub: 'Время% от восхода до заката делится на три равные части, и от заката до восхода тоже — условно, для наглядности, для вашего места и сезона.', pWho: 'Так проводят эти части араханты и другие монахи в суттах.', pDay: 'День', pNight: 'Ночь', setPlace: 'задать место', noonL: 'Полдень', pMid: '** В СН 28.1 слова majjhanhikasamaya нет, но описана эта часть дня; само слово — МН 79.', pFixed: '* Время условное: восход 06:00, закат 18:00, примерно как там, где жил Будда.', pPlace: '* Условно: три равные части от восхода до заката и от заката до восхода.',
      dayParts: [['Pubbaṇhasamaya', 'утро', 'Монахи одеваются и идут за подаянием (пиндапата)', 'sn28.1:1.2'], ['Majjhanhikasamaya', 'полдень', 'Уединение и практика, дневное пребывание.**', 'sn28.1:1.4,mn79:17.2'], ['Sāyanhasamaya', 'вечер', 'Выход из уединения: встреча и беседа с Учителем и монахами', 'sn28.1:2.1']], nightParts: [['Paṭhama yāma', 'первая часть', 'Практика: ходьба и сидение, очищение ума', 'mn53:10.3'], ['Majjhima yāma', 'средняя часть', 'Поза льва: лёжа на правом боку, осознанно', 'mn53:10.4'], ['Pacchima yāma', 'последняя часть', 'Вставание: снова ходьба и сидение', 'mn53:10.5']],
      fSpecial: 'особое', fGeneral: 'общее', fRandom: 'случайное', slTitle: 'Из сутт', addCal: 'В календарь', subH: 'Подписаться', fileH: 'Или файл', calRemind: 'Время напоминания и дни берутся из настроек напоминаний в меню.', gUposatha: 'Настройки упосатхи', on: 'Вкл', off: 'Выкл', fAll: 'Все', sortKind: 'По видам', sortSutta: 'По суттам', showAll: 'Показать все', readIt: 'Читать', dayTag: function (d) { return d.map(function (n) { return n + '-й'; }).join(', ') + ' день'; },
      age: 'возраст', of30: 'из 30', from: 'с', left: 'осталось', dU: 'д', hU: 'ч', mU: 'мин',
      searchPh: 'Поиск: kacchapa, dn22…', searchGo: 'Найти', tocTitle: 'Оглавление (Alt+2)', clear: 'Очистить', tag: 'дни соблюдения', compass: 'Избранное / История', menu: 'Меню', theme: 'Тема', prev: 'Назад', next: 'Вперёд', close: 'Закрыть',
      h1: 'Дни упосатхи', lead: '14-й, 15-й и 8-й лунные дни каждой половины месяца, как их считают сутты, — шесть в месяц.', suttas: 'Сутты об упосатхе →',
      today: 'Сегодня', change: 'изменить', tList: 'Упосатхи', tCal: 'Календарь', more: 'Ещё три месяца', todayBtn: 'Сегодня',
      kH: 'Ключевые сутты', kSub: 'Каждое «Читать →» открывает сутту на нужном месте и подсвечивает его.', kNow: 'Сейчас открыта', kNew: 'Открыть в новом окне',
      lic: 'Лицензии', mt: 'Мультитул', lHome: 'Главная', lToc: 'Оглавление', lDict: 'Словарь', lMemo: 'Меморайзер', lang: 'Язык', themeH: 'Тема', dark: 'Тёмная', light: 'Светлая', auto: 'Авто',
      gCal: 'Календарь', subNote: 'Дни на год вперёд, обновляется сама.', icsNote: 'Или файлом, один раз: на 12 месяцев вперёд.', copyLink: 'Копировать ссылку',
      ics: 'Скачать файл .ics', suttasL: 'Сутты об упосатхе', help: 'Помощь', share: 'Поделиться', settingsL: 'Настройки упосатхи', settings: 'Настройки',
      gPlace: 'Место и время', weekH: 'Неделя начинается с', mon: 'Понедельника', sun: 'Воскресенья', tz: 'Часовой пояс', hemi: 'Полушарие', hemiD: 'как рисовать луну', north: 'Северное', south: 'Южное',
      loc: 'Задать место или выбрать город', locD: 'для настоящих восхода и заката; без него — 18:00 и 06:00', myLoc: 'Определить моё место', city: 'или город: Алматы…',
      locNone: 'Место не передано — используется фиксированное время.', locFinding: 'Определяю…', locOk: 'Место', locForget: 'забыть', locDenied: 'Место не передано — используется фиксированное время.',
      gCount: 'Счёт', bySuttas: 'По суттам', notBySuttas: 'НЕ ПО СУТТАМ', bySuttasD: 'Выкл — четыре дня лунных фаз',
      detail: 'Подробно', detailD: 'Выкл — короткая форма',
      gRem: 'Напоминания', remind: 'Напоминать', adv: 'Заранее', leads: [[0, 'в момент начала'], [1, 'за 1 час'], [3, 'за 3 часа'], [12, 'за 12 часов'], [24, 'за сутки'], [48, 'за 2 суток']], days: 'Дни',
      remNote: 'Уведомления приходят, пока приложение открыто или работает в фоне на вашем устройстве. Чтобы напоминание пришло и при полностью закрытом приложении, добавьте дни в календарь телефона.',
      mealG: 'Приём пищи', mealH: 'Приём пищи', mealSub: 'Монахи и те, кто соблюдает упосатху, едят в одну часть дня: от рассвета до полудня. После полудня и до рассвета — <i>vikāla</i>, «неподходящее время». ',
      mealEat: function (noon, left) { return '<i>Kāla</i> — есть можно. Полдень в ' + noon + ' · до <i>vikāla</i>: ' + left; },
      mealVik: function (dawn, left) { return '<i>Vikāla</i> — до рассвета в ' + dawn + ': ' + left; },
      noonBy: 'Полдень считать по', noonSunS: 'Солнце', noonMidS: 'Середина дня', noonClockS: '12:00', noonWhat: 'Середина дня — ровно между восходом и закатом, центр средней трети дня.', noonChange: 'изменить', noonSun: 'Солнцу (высшая точка)', noonMid: 'середине дня', noonClock: '12:00 по часам', noonFixed: 'Без места полдень — 12:00 по часам.',
      noonNote: 'В Винае сказано лишь «когда полдень миновал», а как его определить — нет. Высшая точка Солнца — астрономический полдень; середина дня — ровно между восходом и закатом (почти то же самое); 12:00 по часам может отличаться на час и больше. Рассвет здесь принят за восход.',
 mealSet: 'Еда (vikāla)', mealSumL: 'Показывать в сводке', mealRemL: 'Напоминать об окончании времени еды', mealLead: 'Заранее', mealLeads: [[0, 'когда время еды закончится'], [15, 'за 15 мин'], [30, 'за 30 мин'], [45, 'за 45 мин'], [60, 'за 1 час'], [90, 'за 1,5 часа'], [120, 'за 2 часа']], mealDays: 'Дни', mealDaysU: 'Дни упосатхи', mealDaysA: 'Каждый день', mealSnd: 'Звук этого напоминания',
      twiL: 'Рассвет и закат', twiNote: 'Сумерки: Солнце на 6, 12 или 18° под горизонтом. Задаёт границы дня и ночи и рассвет в карточке приёма пищи.', twiO: { sun: 'Восход и закат', civil: 'Гражданские (−6°)', nautical: 'Навигационные (−12°)', astro: 'Астрономические (−18°)' },
      tstL: 'Проверить напоминание', tstKinds: { upo: 'День упосатхи', beg: 'Начало времени еды', end: 'Конец времени еды' }, tst1: 'через 1 мин', tst2: 'через 2 мин', tstGo: 'Поставить проверку',
      tstTitle: function (k) { return { upo: 'Упосатха (проверка)', beg: 'Время еды (проверка)', end: 'Скоро vikāla (проверка)' }[k]; }, tstBody: 'Проверочное напоминание со звуком этого вида.', tstSet: function (at) { return 'Придёт в ' + at + '.'; }, tstDenied: 'Уведомления не разрешены.',
      testL: 'Проверка: показать состояние', testReal: 'как есть', testTag: 'тест',
      mealRemNow: 'Наступает vikāla', mealRemZero: function (noon) { return 'Полдень в ' + noon + ' — время еды закончилось.'; },
      mealBegL: 'Напоминать о начале времени еды', mealBegLeads: [[0, 'на рассвете'], [15, 'за 15 мин'], [30, 'за 30 мин'], [60, 'за 1 час']],
      mealBegNow: 'Время еды', mealBegZero: function (dawn) { return 'Рассвет в ' + dawn + ' — время еды началось.'; },
      mealBegTitle: 'Скоро время еды', mealBegBody: function (dawn, lead) { return 'Рассвет в ' + dawn + ' — время еды начнётся через ' + (lead >= 60 ? (lead / 60 + '').replace('.', ',') + ' ч' : lead + ' мин') + '.'; },
      mealRemTitle: 'Скоро vikāla', mealRemBody: function (noon, lead) { return 'Полдень в ' + noon + ' — время еды закончится через ' + (lead >= 60 ? (lead / 60 + '').replace('.', ',') + ' ч' : lead + ' мин') + '.'; },
      logoTip: 'Домой · сменить язык: долгое нажатие или правая кнопка', rateUs: 'Оценить приложение', appVer: 'Версия приложения', timeL: 'Время', ofMode: function (n, m, su) { return n + ' из ' + m + (su ? ' по суттам' : ' по современной'); }, locHere: 'по гео', locNone: 'вручную', navHome: 'Сводка', navList: 'Упосатхи', navCal: 'Календарь', navParts: 'Ночь–день', navSet: 'Настройки',
      sound: 'Звук', soundNone: 'Без звука', soundOwn: 'Свой звук…', soundOwnNamed: 'Свой: %', soundFail: 'Звук не задан.', sounds: { gong: 'Гонг', gong2: 'Гонг 2', gong3: 'Гонг 3', gong4: 'Гонг 4', gong5: 'Гонг 5', bell: 'Колокол' },
      remAppNote: 'Напоминания ставятся на этом устройстве и приходят даже при закрытом приложении.',
      remNext: function (when, what) { return 'Ближайшее напоминание: ' + when + ' — ' + what; }, remNone: 'В ближайшие недели напоминаний нет.',
      remDenied: 'Уведомления для сайта запрещены — разрешите их в настройках браузера.', remUnsupported: 'Этот браузер не умеет показывать уведомления.',
      remBody: function (when) { return 'начинается ' + when; }, remTwo: function (when) { return 'Две упосатхи: 14-й и 15-й дни. Первая начинается ' + when; },
      full: 'Полнолуние', newm: 'Новолуние', fullL: 'полнолуние', newL: 'новолуние', illum: 'освещено', ld: 'лунный день', of15: 'из 15', until: 'до',
      phases: ['Новолуние', 'Растущий серп', 'Первая четверть', 'Растущая Луна', 'Полнолуние', 'Убывающая Луна', 'Последняя четверть', 'Убывающий серп'],
      tonight: 'Упосатха начинается сегодня вечером', next2: 'Следующая', inN: function (n) { var m = n % 10, h = n % 100; return 'через ' + n + ' ' + (m === 1 && h !== 11 ? 'день' : m >= 2 && m <= 4 && (h < 12 || h > 14) ? 'дня' : 'дней'); }, tomorrow: 'завтра', isToday: 'сегодня',
      kDay: 'День', kBegins: 'Начало', kSpan: 'Упосатха', kLunar: 'Лунный день', kTime: 'Точное время',
      beginsVal: function (eve, sun) { return 'вечер ' + eve + (sun ? ' (' + sun + ')' : ''); }, spanVal: function (night, day) { return 'ночь ' + night + ' → день ' + day; },
      sunrise: 'восход', sunset: 'закат',
      lunarVal: function (tithi, nth, half, change) { return tithi + ' из 30 (' + nth + ' ' + half + ') · до ' + change; },
      keptWith: function (nth) { return nth + ' день пропущен и соблюдается в эту дату'; }, skipped: function (nth) { return nth + ' лунный день пропущен — он начинается и кончается между двумя замерами'; },
      repeats: 'тот же лунный день, что и накануне',
      modeS: 'по суттам · 6 в месяц', modeM: 'современная · 4 в месяц', lgS: 'вечер, с которого начинается упосатха', lgC: 'день упосатхи, до вечера', lgS15: '15-й (начало вечером)', lgS814: '8-й и 14-й', lgM15: 'новолуние / полнолуние', lgM8: 'четверти', lgT: 'сегодня',
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
    ['sn28.1:1.2', 'SN 28.1 · a monk\'s day|день монаха'], ['mn53:10.3', 'MN 53 · parts of the night|части ночи'], ['an3.70:19.1', 'AN 3.70 · like the arahants|подобно арахантам'], ['mn79:17.2', 'MN 79 · midday|полдень'],
    ['pli-tv-bu-vb-pc37:2.1.6', 'Pc 37 · vikāla|Пч 37 · викала'], ['mn70:2.1', 'MN 70 · not at night|не ночью'], ['mn66:6.6', 'MN 66 · the wrong time|неподходящее время'], ['mn65:4.1', 'MN 65 · Bhaddāli'],
  ];
  var KEYS = { // three questions; the suttas are the special and general ones of the slideshow
    en: [['How to keep it?', [
        ['AN 3.70', 'the Noble One\'s Uposatha {10} — like the arahants {14}; avoid the cowherd\'s and the Nigaṇṭha\'s Uposatha {7}.'],
        ['AN 10.46', 'do not skip: “it is your loss and misfortune”. {0}']]],
      ['On which days?', [
        ['AN 3.37', 'the 14th {4}, the 15th {5} and the 8th {6}: on these days the guardians of the world look who keeps the Uposatha.'],
        ['MN 83', 'the 14th, 15th and 8th of the half-month. {1}']]],
      ['When to begin?', [
        ['AN 3.70', 'begin at night: night and day, “this night and day” {11}.'],
        ['MN 53', 'what is the night? The parts of the night — <i>paṭhama</i>, <i>majjhima</i>, <i>pacchima yāma</i> — and what a disciple does in each. {13}'],
        ['SN 28.1', 'what is the day? The parts of the day: a monk\'s day — alms in the morning, seclusion at midday, coming out in the evening. {12} The word majjhanhikasamaya is not there, but this is that part of the day.'],
        ['MN 79', 'midday itself: “the sun at midday” (<i>majjhanhikasamaya</i>) in a clear autumn sky. {15}'],
        ['MN 146', 'not by the phases of the moon alone: on the 14th it is not full {2}, on the 15th it is full {3}.', 'gap']]],
      ['Bonus: food', [
        ['MN 65', 'the Buddha to the monk Bhaddāli: “eat one part of the meal in the place where you’re invited, and bring the rest back to eat” — later, but still before midday. {19}'],
        ['Pc 37', '<i>vikāla</i> is “when the middle of the day has passed, until dawn” — a rule for monks. {16}'],
        ['MN 66', 'the monks give up the meal at the wrong time of day, and of night. {18}'],
        ['MN 70', 'abstaining from eating at night. {17}']]]],
    ru: [['Как соблюдать?', [
        ['АН 3.70', 'упосатха Благородных {10} — подобно арахантам {14}; избегать упосатхи пастуха и ниганты {7}.'],
        ['АН 10.46', 'не пропускать: «это ваша потеря и неудача». {0}']]],
      ['В какие дни?', [
        ['АН 3.37', '14-й {4}, 15-й {5} и 8-й {6}: в эти дни стражи мира смотрят, кто соблюдает упосатху.'],
        ['МН 83', '14-й, 15-й и 8-й дни половины месяца. {1}']]],
      ['Когда начинать?', [
        ['АН 3.70', 'начинать ночью: ночь и день, «эту ночь и этот день» {11}.'],
        ['МН 53', 'что такое ночь? Части ночи — <i>paṭhama</i>, <i>majjhima</i>, <i>pacchima yāma</i> — и что делает в каждой ученик. {13}'],
        ['СН 28.1', 'что такое день? Части дня: день монаха — подаяние утром, уединение в середине дня, выход вечером. {12} Слова majjhanhikasamaya там нет, но это именно эта часть дня.'],
        ['МН 79', 'сам полдень: «солнце в полдень» (<i>majjhanhikasamaya</i>) в ясном осеннем небе. {15}'],
        ['МН 146', 'не только по фазам луны: на 14-й она неполная {2}, на 15-й — полная {3}.', 'gap']]],
      ['Бонус: про еду', [
        ['МН 65', 'Будда монаху Бхаддали: «съешь часть там, куда тебя пригласили, и часть [еды] забери с собой, чтобы поесть [после, но до полудня]». {19}'],
        ['Пч 37', '<i>vikāla</i> — «когда полдень миновал, до рассвета»; правило для монахов. {16}'],
        ['МН 66', 'монахи отказываются от еды в неподходящее время дня и ночи. {18}'],
        ['МН 70', 'воздерживаться от еды ночью. {17}']]]],
  };

  // ---------- state ----------
  var detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  var SOUTHERN_ZONE = /^(Australia|Antarctica)\/|^Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Noumea|Tahiti|Port_Moresby)|^Africa\/(Johannesburg|Maseru|Mbabane|Windhoek|Harare|Lusaka|Maputo)|^America\/(Sao_Paulo|Argentina|Buenos_Aires|Santiago|Lima|La_Paz|Asuncion|Montevideo)/;
  var state = {
    tz: store('dgUposathaTz') || detected,
    south: null,
    ref: store('dgUposathaSutta') === '0' ? 6 : 18, // by the suttas (default): the evening of the date itself (sunset, or 18:00); the modern scheme: the morning (sunrise, or 06:00)
    lite: store('dgUposathaLite') !== '0', // the short view is the default
    screen: params.get('view') === 'all' ? 'cal' : (store('dgUposathaView') === 'cal' ? 'cal' : 'list'),
    months: 3, calOff: 0, selected: null,
    twi: (function () { var v = store('dgUposathaTwi'); return v && v in TWI ? v : 'sun'; })(),
    fake: (function () { var v = store('dgUposathaFake'); return v === 'kala' || v === 'vikala' ? v : ''; })(),
    meal: (function () { var d = { sum: true, rem: false, lead: 30, days: 'upo', snd: 'bell', beg: false, begLead: 0, begSnd: 'gong2' }; try { var v = JSON.parse(store('dgUposathaMeal')); if (v) for (var k in d) if (k in v) d[k] = v[k]; } catch (e) { /* defaults */ } return d; })(),
    noon: (function () { var v = store('dgUposathaNoon'); return /^(sun|mid|clock)$/.test(v || '') ? v : 'sun'; })(),
    loc: (function () { try { return JSON.parse(store('dgUposathaLoc')); } catch (e) { return null; } })(),
    locMsg: '',
    rem: (function () { var d = { on: false, lead: 24, d8: true, d14: true, d15: false, sound: 'gong', ownChannel: '', ownName: '' }; try { var v = JSON.parse(store('dgUposathaRemind')); if (v) for (var k in d) if (k in v) d[k] = v[k]; } catch (e) { /* defaults */ } return d; })(),
    remMsg: '',
  };
  var hemi = store('dgUposathaHemisphere');
  state.south = hemi ? hemi === 'south' : SOUTHERN_ZONE.test(state.tz);
  var sutta = function () { return state.ref === 18; };
  var ZONE_COORDS = window.DG_ZONE_COORDS || {};
  var zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : Object.keys(ZONE_COORDS);
  if (zones.indexOf(detected) === -1) zones = [detected].concat(zones);
  if (zones.indexOf(state.tz) === -1) zones = [state.tz].concat(zones);
  // the first day of the week: chosen in the menu; until then Monday for Russian, Sunday for English
  var weekPref = store('dgUposathaWeek');
  function firstDay() { return weekPref === '0' || weekPref === '1' ? +weekPref : (lang === 'ru' ? 1 : 0); }
  var UPOSATHA = [8, 14, 15, 23, 29, 30]; // tithi numbers of the 8th, 14th, 15th of the waxing half, then of the waning half

  // ---------- the Moon and the Sun (the calculation lives in uposatha-core.js, shared with the calendar feed) ----------
  var C = window.UposathaCore;
  // Dawn and dusk by a chosen definition: the Sun's upper limb at the horizon (sunrise / sunset), or the Sun 6 / 12 / 18 degrees below it (civil, nautical, astronomical twilight)
  var TWI = { sun: null, civil: -6, nautical: -12, astro: -18 };
  var localDay = C.localDay, zonedToUtc = C.zonedToUtc, sunEvent = C.sunEvent, tithiAt = C.tithiAt, dayNo = C.dayNo, ymdAdd = C.ymdAdd;
  function edge(kind, y, m, d, tz, obs) { // the dawn / dusk of the day by the chosen definition; the sunrise / sunset where the Sun does not reach that depth
    var alt = TWI[state.twi];
    if (obs && alt != null) { var r = A.SearchAltitude('Sun', obs, kind === 'rise' ? 1 : -1, zonedToUtc(y, m, d, 0, tz), 1, alt); if (r) return r.date; }
    return sunEvent(kind, y, m, d, tz, obs);
  }
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
    if (r.fullMoon) n.push(t.fullL + ' ' + F.stamp.format(r.fullMoon)); // the moment itself, with its weekday: it is often the next date
    if (r.newMoon) n.push(t.newL + ' ' + F.stamp.format(r.newMoon));
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
      h += '<span class="ln dayl"><span class="k">' + esc(t.kDay) + ':</span> ' + esc(after) + '</span>'; // the day of the Uposatha itself: shown in the short view, where the long "observed" line is not
      h += line(t.kSpan, t.spanVal(eve, after)).replace('class="ln"', 'class="ln spanl"');
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
    Array.prototype.forEach.call(document.querySelectorAll('#wordmark, .up-shell-logo'), function (e) { e.title = t.logoTip; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tt]'), function (e) { var v = t[e.getAttribute('data-tt')]; if (typeof v === 'string') { e.title = v; e.setAttribute('aria-label', v); } });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tp]'), function (e) { e.placeholder = t[e.getAttribute('data-tp')] || ''; });
    (function () { // the hint of the input: Uposatha key words and suttas, two words and a reference at random (all of them find something)
      var words = ['uposatha', 'uposathaṃ', 'cātuddasī', 'pannarasī', 'aṭṭhamī', 'aṭṭhaṅgasamannāgataṃ', 'pāṭimokkha', lang === 'ru' ? 'пастух' : 'cowherd', lang === 'ru' ? 'упосатха' : 'Uposatha'];
      var refs = ['an3.70', 'an3.37', 'an10.46', 'mn83', 'mn146', 'sn28.1', 'mn53', 'mn79'];
      function pick(a, n) { var b = a.slice(), o = []; while (n-- > 0) o.push(b.splice(Math.floor(Math.random() * b.length), 1)[0]); return o; }
      var inp = $('paliauto'); if (inp) inp.placeholder = pick(words, 2).concat(pick(refs, 1)).join(', ') + '…';
    })();
    document.title = t.h1 + ' — Dhamma.gift';
    paintToc();
    $('b-help').href = $('d-help').href = t.helpUrl; // the help is the docs page: a link, opened in a new window
    $('twi').innerHTML = Object.keys(TWI).map(function (k) { return '<option value="' + k + '">' + esc(t.twiO[k]) + '</option>'; }).join(''); $('twi').value = state.twi;
    $('tst-kind').innerHTML = Object.keys(t.tstKinds).map(function (k) { return '<option value="' + k + '">' + esc(t.tstKinds[k]) + '</option>'; }).join('');
    $('mbeg-lead').innerHTML = t.mealBegLeads.map(function (l) { return '<option value="' + l[0] + '">' + esc(l[1]) + '</option>'; }).join('');
    $('mrem-lead').innerHTML = t.mealLeads.map(function (l) { return '<option value="' + l[0] + '">' + esc(l[1]) + '</option>'; }).join('');
    $('rem-lead').innerHTML = t.leads.map(function (l) { return '<option value="' + l[0] + '">' + esc(l[1]) + '</option>'; }).join('');
  }
  function setTheme(mode) { // light | dark | auto, stored under the site's own key
    store('theme', mode);
    var eff = mode === 'auto' ? (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;
    document.documentElement.setAttribute('data-theme', eff);
    document.documentElement.setAttribute('data-bs-theme', eff); // the shared scripts (quick window, settings.js) read these
    document.body.classList.toggle('dark', eff === 'dark');
  }
  // the site's segmented control (.dg-segmented): the pressed button is the value
  function setSeg(id, v) { Array.prototype.forEach.call($(id).children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === String(v))); }); }
  function onSeg(id, fn) { $(id).onclick = function (e) { var b = e.target.closest && e.target.closest('button'), v = b && b.getAttribute('data-v'); if (v !== null && v !== undefined) fn(v); }; }
  // the drawer is the site's own (home.js): opening it is a click on its burger
  function openSettings(id) { // open the drawer at a part of the settings and light that part up, so it is clear what to do there
    document.querySelector('.dg-menu-btn').click();
    setTimeout(function () {
      var el = $(id || 'loc-block'); if (!el) return;
      el.scrollIntoView({ block: 'center' }); el.classList.remove('dg-temp-blink'); void el.offsetWidth; el.classList.add('dg-temp-blink'); // the reader's own blink: three soft pulses
      setTimeout(function () { el.classList.remove('dg-temp-blink'); }, 2500);
    }, 400);
  }
  function toast(msg) { var e = $('toast'); e.textContent = msg; e.classList.add('on'); setTimeout(function () { e.classList.remove('on'); }, 2000); }
  function openPanel(id) { closeAll(); $(id).setAttribute('data-open', 'true'); $('scrim').setAttribute('data-open', 'true'); }
  function closeAll() { ['sl-modal', 'cal-modal', 'scrim'].forEach(function (i) { $(i).setAttribute('data-open', 'false'); }); }

  // Lit part of the Moon to a hundredth of a percent: near the full moon a whole percent stays the same for half a day.
  function illumPercent(d) { var v = (A.Illumination('Moon', d).phase_fraction * 100).toFixed(2); return lang === 'ru' ? v.replace('.', ',') : v; }
  // What changes while the page is open: the lit part, the Moon's age since the new moon and the time left of the lunar day.
  var live = { ends: null, born: null };
  function span(ms) {
    var m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60);
    return (d ? d + ' ' + t.dU + ' ' : '') + h + ' ' + t.hU + ' ' + (m % 60) + ' ' + t.mU;
  }
  var repainting = false; // paint() calls liveTick(): a state that has just ended must not repaint in a loop
  function liveTick() {
    if (document.hidden) return;
    var now = new Date(), e;
    if ((e = $('pct'))) e.textContent = illumPercent(now);
    if ((e = $('age')) && live.born) e.textContent = span(now - live.born);
    if ((e = $('left')) && live.ends) e.textContent = span(live.ends - now);
    Array.prototype.forEach.call(document.querySelectorAll('.meal-left'), function (b) { var to = +b.getAttribute('data-to'); if (to <= now.getTime()) { if (!params.get('meal') && !repainting) { repainting = true; try { paint(); } finally { repainting = false; } } } else b.textContent = span(to - now); }); // the moment of midday or dawn passed: the block changes its state
  }
  // The parts of the day: sunrise to sunset in three, sunset to sunrise in three (fixed 06:00 / 18:00 without a place).
  function paintParts(F, now, ymd) {
    var obs = state.loc ? new A.Observer(state.loc.lat, state.loc.lon, 0) : null, tz = state.tz;
    function sun(kind, d) { var p = d.split('-').map(Number); return edge(kind, p[0], p[1], p[2], tz, obs) || zonedToUtc(p[0], p[1], p[2], kind === 'rise' ? 6 : 18, tz); }
    var rise = sun('rise', ymd), set = sun('set', ymd);
    var nightFrom = now < rise ? ymdAdd(ymd, -1) : ymd, nStart = sun('set', nightFrom), nEnd = sun('rise', ymdAdd(nightFrom, 1));
    function block(title, sub, from, to, names) {
      var third = (to - from) / 3;
      return '<div class="pblk"><h3>' + esc(title) + '<span>' + esc(sub) + '</span></h3>' + names.map(function (n, i) {
        var a = from.getTime() + i * third, b = a + third;
        return '<div class="prow"' + (now >= a && now < b ? ' data-now="true"' : '') + '><span><b class="pli-lang" lang="pi">' + esc(n[0]) + '</b><small>' + esc(n[1]) + '</small><em>' + esc(n[2]) + ' · ' + n[3].split(',').map(function (r) { return '<a class="pref" href="/' + esc(r) + '?lang=' + lang + '" target="_blank" rel="noopener">' + esc(r.split(':')[0]) + '</a>'; }).join(' · ') + '</em></span><span class="tm">' + F.hm.format(a) + ' – ' + F.hm.format(b) + '</span></div>';
      }).join('') + '</div>';
    }
    $('pgrid').innerHTML = block(t.pDay, F.week.format(Date.parse(ymd)), rise, set, t.dayParts) +
      block(t.pNight, F.week.format(Date.parse(nightFrom)) + ' → ' + F.week.format(Date.parse(ymdAdd(nightFrom, 1))), nStart, nEnd, t.nightParts);
    $('pwho').textContent = t.pWho; // the lead line before the table: who spends the parts this way
    $('pnote').textContent = (obs ? t.pPlace : t.pFixed) + '\n' + t.pMid; // the footnotes: what is conventional, then the word
    markPali($('pnote'));
    // the place is the important, interactive part of this block: a link by the heading, to the settings
    var noonV = { sun: t.noonSunS, mid: t.noonMidS, clock: t.noonClockS }[obs ? state.noon : 'clock'];
    $('p-place').innerHTML = icon('pin') + esc(t.timeL + ': ' + (obs ? (state.loc.name || t.locHere) : t.locNone) + ' · ') + '<span class="noonlink">' + esc(t.noonL.toLowerCase() + ': ' + noonV.toLowerCase()) + '</span>' + esc(' · ' + (obs ? t.change : t.setPlace)); // one line: the time, the midday, the way to change
    document.querySelector('#parts h2').textContent = t.pH + '*'; // the asterisk of the footnote
    paintMeal(F, now, ymd, obs, rise);
  }
  // Food and the "wrong time": from dawn to midday it is allowed, from midday to the next dawn it is vikala (Pc 37: "when midday has passed, until dawn").
  function noonFor(ymd, obs) { // the midday of a civil day by the chosen method (the clock without a place)
    var p = ymd.split('-').map(Number), tz = state.tz, m = obs ? state.noon : 'clock', noon = null;
    function sun(kind) { return edge(kind, p[0], p[1], p[2], tz, obs) || zonedToUtc(p[0], p[1], p[2], kind === 'rise' ? 6 : 18, tz); }
    var rise = sun('rise'), set = sun('set');
    if (m === 'sun') { var h = A.SearchHourAngle('Sun', obs, 0, rise); noon = h && h.time ? h.time.date : null; }
    if (m === 'mid') noon = new Date((rise.getTime() + set.getTime()) / 2);
    return noon || zonedToUtc(p[0], p[1], p[2], 12, tz);
  }
  // Every Pali word of the page opens the dictionary, not only the quotes: the site's handler takes any [lang="pi"]. The terms of this page:
  var PALI_RX = /(?<![\p{L}])(vikāla|kāla|majjhanhikasamaya|pubbaṇhasamaya|sāyanhasamaya|paṭhama|majjhima|pacchima|yāma|aṭṭhaṅgasamannāgata|uposatha)(?![\p{L}])/giu;
  function markPali(root) {
    if (!root) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), nodes = [], n;
    while ((n = w.nextNode())) { if (!PALI_RX.test(n.nodeValue)) continue; PALI_RX.lastIndex = 0; if (n.parentNode.closest('[lang="pi"], .pli-lang, a, button, select, option')) continue; nodes.push(n); }
    PALI_RX.lastIndex = 0;
    nodes.forEach(function (t) {
      var span = document.createElement('span'); span.innerHTML = esc(t.nodeValue).replace(PALI_RX, '<span class="pli-lang" lang="pi">$1</span>');
      while (span.firstChild) t.parentNode.insertBefore(span.firstChild, t); t.remove();
    });
  }
  function paintMeal(F, now, ymd, obs, rise) {
    var p = ymd.split('-').map(Number), tz = state.tz, m = obs ? state.noon : 'clock';
    var noon = noonFor(ymd, obs);
    var nowMs = now.getTime(), to, html, kind;
    var fake = state.fake || params.get('meal'); // test only: the switch in the settings (or ?meal=kala / ?meal=vikala) shows that state whatever the time is
    if (fake === 'kala') nowMs = (rise.getTime() + noon.getTime()) / 2; else if (fake === 'vikala') nowMs = noon.getTime() + 3600000;
    if (nowMs < noon.getTime() && nowMs >= rise.getTime()) { kind = 'kala'; to = noon.getTime(); html = t.mealEat(F.hm.format(noon), '<b class="meal-left" data-to="' + to + '">' + span(to - nowMs) + '</b>'); }
    else { kind = 'vikala'; var dawn = nowMs < rise.getTime() ? rise : (edge('rise', p[0], p[1], p[2] + 1, tz, obs) || zonedToUtc(p[0], p[1], p[2] + 1, 6, tz)); to = dawn.getTime(); html = t.mealVik(F.hm.format(dawn), '<b class="meal-left" data-to="' + to + '">' + span(to - nowMs) + '</b>'); }
    function ref(id, label) { return '<a class="pref" href="/' + id + '?lang=' + lang + '" target="_blank" rel="noopener">' + label + '</a>'; }
    setSeg('noonseg', obs ? state.noon : 'clock'); $('noon-note').textContent = obs ? t.noonWhat : t.noonFixed; $('noonseg').setAttribute('data-fixed', String(!obs)); // without a place only the clock is possible
    var by = '';
    var tag = state.fake ? ' <b class="testtag">' + esc(t.testTag) + '</b>' : '';
    $('meal').innerHTML = '<h3>' + esc(t.mealH) + tag + '</h3><p class="mstat" data-k="' + kind + '">' + html + '</p>' + by; // the card is short: what vikāla is stands in the key suttas (Pc 37)
    $('meal-sum').innerHTML = '<h3>' + esc(t.mealH) + tag + '</h3><p class="mstat" data-k="' + kind + '">' + html + '</p>';
    markPali($('meal')); markPali($('meal-sum'));
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
    // for the app's hero (app-refresh.js): the Uposatha that runs now and the next one to begin, by name, not parsed back from the list
    var curUp = isUposatha ? ((su && yRow && yRow.uposatha && now < evToday) ? yRow : todayRow) : null, nextUp = L.rows.filter(function (r) { return r.uposatha && r.at.getTime() > now.getTime(); })[0];
    window.__upoHero = { cur: curUp ? nameOf(curUp) : '', next: nextUp ? { at: nextUp.at.getTime(), name: nameOf(nextUp) } : null };
    // the moon of the running (or the next) Uposatha for the app's icon in the bar (and later the shortcuts, the launcher icon): the 8th a quarter, the 14th nearly full or a thin crescent, the 15th full or new
    var mRow = curUp || nextUp, mk = mRow ? parseInt(nameOf(mRow), 10) : NaN;
    window.__upoMoon = mRow && mk ? { f: mRow.waxing ? mk / 15 : 1 - mk / 15, right: mRow.waxing !== state.south, day: mk, waxing: !!mRow.waxing } : null;
    if (typeof window.__upoNavMoon === 'function') window.__upoNavMoon();

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
    $('t-phase').innerHTML = '<span>' + esc(t.phases[pIndex]) + '</span>' + dot + '<span><span id="pct">' + percent + '</span>% ' + esc(t.illum) + '</span>' + '<span class="dt">' + dot + '<span>' + esc(t.age) + ' <span id="age"></span></span></span><br>' +
      '<span><b style="font-weight:600;color:var(--dg-text)">' + esc(t.ld) + ' ' + tithi + '</b> ' + esc(t.of30) + ' (' + esc(t.nth(dayNo(tithi))) + ' ' + esc(t.halvesOf[tithi <= 15 ? 0 : 1]) + ')</span>' +
      (dayEnds ? '<span class="dt">' + dot + '<span>' + (dayBegan ? esc(t.from) + ' ' + esc(F.stamp.format(dayBegan.date)) + ' ' : '') + esc(t.until) + ' ' + esc(F.stamp.format(dayEnds.date)) + '</span>' + dot + '<span>' + esc(t.left) + ' <span id="left"></span></span></span>' : '');
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
    $('ctx-place').textContent = t.timeL + ': ' + (state.loc ? (state.loc.name || t.locHere) : t.locNone); // a city by its name, the geolocation 'by geo', no place 'manual' // neither the coordinates nor the time zone: the person knows both
    var mm = todayYmd.slice(0, 7), inMonth = L.rows.filter(function (r) { return r.uposatha && r.ymd.slice(0, 7) === mm; }); // how far this month's Uposathas have come
    $('ctx-mode').textContent = t.ofMode(inMonth.filter(function (r) { return r.ymd <= todayYmd; }).length, inMonth.length, su);

    // ----- the list
    var list = L.rows.filter(function (r) { return r.uposatha && r.ymd >= monthStart; });
    var html = '', lastMonth = '', lastWeek = '';
    list.forEach(function (r) {
      var month = r.ymd.slice(0, 7), startOffset = (r.dow - firstDay() + 7) % 7;
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
      html += '<li class="row" data-ymd="' + r.ymd + '"' + (dd < 0 ? ' data-past="true"' : '') + (dd === 0 ? ' data-now="true"' : '') + '>' +
        '<span class="n">' + esc(F.day.format(Date.parse(r.ymd))) + '<small>' + esc(F.wd.format(Date.parse(r.ymd))) + '</small></span>' + moon(rowI(r), 'moon mi') +
        '<span class="t"><b>' + esc(nameOf(r)) + '</b>' + (note ? '<span class="nt">· ' + esc(note) + '</span>' : '') + '<span class="info">' + infoHtml(r, F) + '</span></span>' +
        '<span class="w">' + esc(w) + '</span></li>';
    });
    if (lastMonth) html += '</ul></div>';
    $('list').innerHTML = html;

    // ----- the calendar: one ordinary month, weeks in rows
    var cm = new Date(Date.UTC(tp[0], tp[1] - 1 + state.calOff, 1)), cy = cm.getUTCFullYear(), mo = cm.getUTCMonth();
    var lead = (new Date(Date.UTC(cy, mo, 1)).getUTCDay() - firstDay() + 7) % 7;
    var cells = Math.ceil((lead + new Date(Date.UTC(cy, mo + 1, 0)).getUTCDate()) / 7) * 7;
    var g0 = new Date(Date.UTC(cy, mo, 1 - lead)), gEnd = new Date(Date.UTC(cy, mo, 1 - lead + cells - 1));
    var C = dataset(new Date(g0.getTime() - DAY).toISOString().slice(0, 10), gEnd.toISOString().slice(0, 10));
    $('cal-title').textContent = cap(F.month.format(cm.getTime()));
    // by the suttas the 15th is the day the Uposatha BEGINS in the evening; the full / new moon itself is a moment, often the next date:
    // it is marked on the date it really falls on
    var moonDay = {};
    if (su) C.rows.forEach(function (r) { var at = r.fullMoon || r.newMoon; if (at) moonDay[localDay(at, tz)] = { full: !!r.fullMoon, at: at }; });
    // An Uposatha begins in the evening of its date and lasts through the night and the next day: that next date carries it too, so 14th
    // and 15th on consecutive evenings read 14 / 14-15 / 15 across three dates instead of a third, unexplained day.
    var startBy = {}, dayBy = {};
    if (su) C.rows.forEach(function (r) { if (r.uposatha) { var ns = r.names.map(dayNo); startBy[r.ymd] = ns; dayBy[ymdAdd(r.ymd, 1)] = ns; } });
    var g = '';
    for (var w2 = 0; w2 < 7; w2++) g += '<div class="wd">' + esc(t.wds[(firstDay() + w2) % 7]) + '</div>';
    for (var i = 0; i < cells; i++) {
      var d = new Date(g0.getTime() + i * DAY), k = d.toISOString().slice(0, 10), r2 = C.byYmd[k];
      var u = '', lb = '', cont = false;
      if (su) {
        var sd = startBy[k] || [], dd = dayBy[k] || [], nums = dd.concat(sd.filter(function (x) { return dd.indexOf(x) === -1; }));
        if (nums.length) {
          var src = sd.length ? r2 : C.byYmd[ymdAdd(k, -1)];
          u = sd.length ? String(sd.indexOf(15) !== -1 ? 15 : sd[0]) : ''; cont = !sd.length;
          lb = '<span class="lb">' + moon(rowI(src), 'moon mi') + '<span>' + esc(nums.length > 1 ? nums.join('–') : t.nth(nums[0])) + '</span></span>';
        }
      } else if (r2 && r2.uposatha) {
        u = (r2.phase === 0 || r2.phase === 2) ? '15' : '8'; lb = '<span class="lb">' + moon(rowI(r2), 'moon mi') + '<span>' + esc(t.events[r2.phase].toLowerCase()) + '</span></span>';
      }
      if (moonDay[k]) lb += '<span class="lb">' + (lb ? '' : moon(moonDay[k].full ? 4 : 0, 'moon mi')) + '<span>' + esc((moonDay[k].full ? t.fullL : t.newL) + ' ' + F.hm.format(moonDay[k].at)) + '</span></span>'; // one moon per day: the label above already has it
      g += '<button type="button" class="c' + (d.getUTCMonth() !== mo ? ' o' : '') + '"' + (u ? ' data-u="' + u + '"' : '') + (cont ? ' data-c="true"' : '') + (k === todayYmd ? ' data-today="true"' : '') + ' data-ymd="' + k + '">' +
        '<span class="n">' + d.getUTCDate() + '</span>' + lb + (r2 ? '<span class="ld">' + r2.day + '</span>' : '') + '</button>';
    }
    $('grid').innerHTML = g;
    $('legend').innerHTML = su ? '<span><i class="f"></i>' + esc(t.lgS15) + '</span><span><i class="r"></i>' + esc(t.lgS814) + '</span><span><i class="c"></i>' + esc(t.lgC) + '</span><span><i class="t"></i>' + esc(t.lgT) + '</span>'
      : '<span><i class="f"></i>' + esc(t.lgM15) + '</span><span><i class="r"></i>' + esc(t.lgM8) + '</span><span><i class="t"></i>' + esc(t.lgT) + '</span>';
    function showDetail(ymd) {
      var own = C.byYmd[ymd] || L.byYmd[ymd], box = $('detail');
      var r = (su && dayBy[ymd] && !(own && own.uposatha)) ? (C.byYmd[ymdAdd(ymd, -1)] || own) : own; // the day after an evening: the Uposatha that is still on
      Array.prototype.forEach.call(document.querySelectorAll('#grid .c'), function (c) { c.setAttribute('data-sel', String(c.getAttribute('data-ymd') === ymd)); });
      if (!r) { box.innerHTML = esc(t.cellHint); return; }
      box.innerHTML = '<strong>' + esc(cap(F.longUtc.format(Date.parse(ymd)))) + '</strong>' + (r.uposatha ? '<span class="badge">' + esc(t.uday) + '</span><span class="ttl">' + esc(nameOf(r)) + '</span>' : '') +
        '<span class="info">' + infoHtml(r, F) + '</span>';
    }
    Array.prototype.forEach.call(document.querySelectorAll('#grid .c'), function (c) { c.onclick = function () { state.selected = c.getAttribute('data-ymd'); showDetail(state.selected); reportHeight(); }; });
    showDetail(state.selected && (C.byYmd[state.selected] || L.byYmd[state.selected]) ? state.selected : todayYmd);

    // ----- the settings panel mirrors the state
    // the zones are IANA names (one country has several); label them with today's UTC offset and sort by it, so "+5" can be found at once
    var offs = {}; zones.forEach(function (z) { try { var m = /GMT([+-]\d\d):(\d\d)/.exec(new Intl.DateTimeFormat('en', { timeZone: z, timeZoneName: 'longOffset' }).format(new Date())); offs[z] = m ? +m[1] * 60 + (m[1][0] === '-' ? -1 : 1) * +m[2] : 0; } catch (e) { offs[z] = 0; } });
    function offLabel(z) { var o = offs[z], a = Math.abs(o); return 'UTC ' + (o === 0 ? '' : o < 0 ? '−' : '+') + Math.floor(a / 60) + (a % 60 ? ':' + ('0' + a % 60).slice(-2) : ''); }
    $('tz').innerHTML = zones.slice().sort(function (x, y) { return offs[x] - offs[y] || (x < y ? -1 : 1); }).map(function (z) { return '<option value="' + esc(z) + '"' + (z === tz ? ' selected' : '') + '>' + offLabel(z) + ' · ' + esc(z.replace(/_/g, ' ')) + '</option>'; }).join('');
    Array.prototype.forEach.call($('hemiseg').children, function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-hemi') === 'south') === state.south)); });
    $('bysuttas-lb').textContent = su ? t.bySuttas : t.notBySuttas; $('bysuttas-lb').classList.toggle('troll', !su); // a small joke: the label turns burgundy when the suttas are switched off
    setSeg('weekseg', firstDay());
    setSeg('sw-sut', su ? 1 : 0); setSeg('sw-det', state.lite ? 0 : 1);
    $('city').value = state.loc && state.loc.name ? state.loc.name : '';
    $('locnote').innerHTML = state.loc ? esc(t.locOk + ': ' + (state.loc.name ? state.loc.name + ' · ' : '') + state.loc.lat + ', ' + state.loc.lon) + ' · <a href="#" id="unloc">' + esc(t.locForget) + '</a>' : esc(state.locMsg || t.locNone);
    if ($('unloc')) $('unloc').onclick = function (e) { e.preventDefault(); state.loc = null; state.locMsg = ''; store('dgUposathaLoc', ''); paint(); };
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
  // Reminders before vikala: (midday - the lead) of the Uposatha days or of every day, for the next month
  function mealDue(rows) {
    var now = Date.now(), lead = state.meal.lead * 60000, obs = state.loc ? new A.Observer(state.loc.lat, state.loc.lon, 0) : null, days = [], out = [];
    if (state.meal.days === 'all') { var today = localDay(new Date(), state.tz); for (var i = 0; i < 30; i++) days.push(ymdAdd(today, i)); }
    else rows.filter(function (r) { return r.uposatha && wantDay(r); }).forEach(function (r) { days.push(sutta() ? ymdAdd(r.ymd, 1) : r.ymd); }); // by the suttas the day of the Uposatha is the one after its evening
    days.forEach(function (ymd) {
      var noon = noonFor(ymd, obs);
      if (state.meal.rem && noon.getTime() > now) out.push({ key: 'm' + ymd, meal: true, kind: 'end', when: noon.getTime() - lead, start: noon, title: state.meal.lead ? t.mealRemTitle : t.mealRemNow });
      if (state.meal.beg) { var p = ymd.split('-').map(Number), rise = edge('rise', p[0], p[1], p[2], state.tz, obs) || zonedToUtc(p[0], p[1], p[2], 6, state.tz); // the dawn by the chosen definition
        if (rise.getTime() > now) out.push({ key: 'b' + ymd, meal: true, kind: 'beg', when: rise.getTime() - state.meal.begLead * 60000, start: rise, title: state.meal.begLead ? t.mealBegTitle : t.mealBegNow }); }
    });
    return out;
  }
  function itemBody(item, F) {
    if (item.kind === 'beg') return state.meal.begLead ? t.mealBegBody(F.hm.format(item.start), state.meal.begLead) : t.mealBegZero(F.hm.format(item.start));
    return item.meal ? (state.meal.lead ? t.mealRemBody(F.hm.format(item.start), state.meal.lead) : t.mealRemZero(F.hm.format(item.start))) : (item.two ? t.remTwo : t.remBody)(F.stamp.format(item.start));
  }
  function notify(item, F) {
    var opts = { body: itemBody(item, F), tag: 'uposatha-' + item.key, icon: '/assets/img/pwa-bold-monocolor-192.png', data: { url: '/uposatha-calendar' } };
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
  // The sound of a reminder is the notification channel's (Android fixes it per channel), so every choice is a channel of its own;
  // the built-in ones are files in the app's res/raw, the "own" one is picked by the person (DgSound, native) and has its own channel.
  var SOUND_FILES = { gong: ['gong', '/assets/sounds/gong.mp3'], gong2: ['gong2', '/assets/repeat-timer/sound/gong2.mp3'], gong3: ['gong3', '/assets/repeat-timer/sound/gong3.mp3'], gong4: ['gong4', '/assets/repeat-timer/sound/gong4.mp3'], gong5: ['gong5', '/assets/repeat-timer/sound/gong5.mp3'], bell: ['church', '/assets/repeat-timer/sound/church.mp3'] };
  function ownPlugin() { var C = window.Capacitor; return C && C.Plugins && C.Plugins.DgSound ? C.Plugins.DgSound : null; }
  function channelFor(LN, k, own) { // returns the channel id for a sound, creating the channel when it is a built-in one
    var id = 'uposatha-' + k + '-v1';
    if (k === 'own' && own) return Promise.resolve(own);
    var f = SOUND_FILES[k], ch = { id: id, name: k === 'none' ? t.soundNone : (t.sounds[k] || k), importance: k === 'none' ? 2 : 4, visibility: 1, vibration: k !== 'none' };
    if (f) ch.sound = f[0] + '.mp3';
    return LN.createChannel(ch).then(function () { return id; }, function () { return id; });
  }
  function scheduleNative(LN, rows, byYmd, F) {
    var now = Date.now();
    var list = (state.rem.on ? dueList(rows, byYmd) : []).concat((state.meal.rem || state.meal.beg) ? mealDue(rows) : []).sort(function (a, b) { return a.when - b.when; }).slice(0, 60);
    var sig = JSON.stringify([state.rem.sound, state.rem.ownChannel, state.meal.snd, state.meal.begSnd, list.map(function (i) { return [i.key, i.title, i.when > now + 10000 ? i.when : 0]; })]);
    if (sig !== nativeSig) { // only when something changed: paint() runs on every touch
      nativeSig = sig;
      Promise.all([channelFor(LN, state.rem.sound, state.rem.ownChannel), channelFor(LN, state.meal.snd), channelFor(LN, state.meal.begSnd)]).then(function (ch) { // the Uposatha, the end and the beginning of the time for food sound differently
        var items = list.map(function (item, i) {
          return { id: NATIVE_ID_BASE + i, title: item.title, body: itemBody(item, F), channelId: item.kind === 'beg' ? ch[2] : item.meal ? ch[1] : ch[0],
            schedule: { at: new Date(Math.max(item.when, now + 3000)), allowWhileIdle: true }, extra: { url: '/uposatha-calendar' } };
        });
        return LN.getPending().then(function (p) {
          var ours = ((p && p.notifications) || []).filter(function (n) { return n.id >= NATIVE_ID_BASE && n.id < NATIVE_ID_BASE + 100; }).map(function (n) { return { id: n.id }; });
          return ours.length ? LN.cancel({ notifications: ours }) : null;
        }).then(function () { return items.length ? LN.schedule({ notifications: items }) : null; });
      }).catch(function () { nativeSig = ''; });
    }
    return list.filter(function (i) { return i.when > now; })[0] || null;
  }
  // Show what is due now (a reminder time that passed while the app was closed, before the day begins) and set a timer for the
  // next one; a timer holds only ~24 days, so the schedule is rebuilt on every paint and on focus.
  function scheduleReminders(rows, byYmd, F) {
    var LN = nativePlugin();
    if (LN) return scheduleNative(LN, rows, byYmd, F);
    clearTimeout(timer);
    if (!(state.rem.on || state.meal.rem || state.meal.beg) || !('Notification' in window) || Notification.permission !== 'granted') return null;
    var now = Date.now(), list = (state.rem.on ? dueList(rows, byYmd) : []).concat((state.meal.rem || state.meal.beg) ? mealDue(rows) : []), next = null;
    list.forEach(function (i) { if (i.when <= now) notify(i, F); else if (!next || i.when < next.when) next = i; });
    if (next) timer = setTimeout(function () { notify(next, F); paint(); }, Math.min(next.when - now, 2147000000));
    return next;
  }
  function paintReminders(L, F) {
    var inApp = !!nativePlugin();
    var next = scheduleReminders(L.rows, L.byYmd, F);
    var permission = inApp ? 'granted' : 'Notification' in window ? Notification.permission : 'unsupported';
    setSeg('sw-rem', state.rem.on ? 1 : 0);
    $('rem-lead').value = String(state.rem.lead);
    setSeg('sw-msum', state.meal.sum ? 1 : 0); setSeg('sw-mrem', state.meal.rem ? 1 : 0); setSeg('mrem-days', state.meal.days);
    $('mrem-more').style.display = state.meal.rem ? '' : 'none';
    $('mrem-lead').value = String(state.meal.lead);
    setSeg('sw-mbeg', state.meal.beg ? 1 : 0); $('mbeg-more').style.display = state.meal.beg ? '' : 'none'; $('mbeg-lead').value = String(state.meal.begLead);
    $('mdays-row').style.display = state.meal.rem || state.meal.beg ? '' : 'none'; // the days are common to both reminders
    var showSnd = inApp || document.body.classList.contains('app'); // the sounds are the app's (also shown in the ?app=1 preview)
    $('mrem-sound-row').style.display = showSnd ? '' : 'none';
    if (showSnd) { $('mrem-sound').innerHTML = Object.keys(SOUND_FILES).map(function (k) { return '<option value="' + k + '">' + esc(t.sounds[k]) + '</option>'; }).concat(['<option value="none">' + esc(t.soundNone) + '</option>']).join(''); $('mrem-sound').value = state.meal.snd; }
    $('mbeg-sound-row').style.display = showSnd ? '' : 'none';
    if (showSnd) { $('mbeg-sound').innerHTML = $('mrem-sound').innerHTML; $('mbeg-sound').value = state.meal.begSnd; }
    $('meal-sum').hidden = !state.meal.sum;
    setSeg('testseg', state.fake);
    $('rem-sound-row').style.display = showSnd ? '' : 'none'; // the sound is a notification channel: only the app has them
    if (showSnd) {
      var opts = Object.keys(SOUND_FILES).map(function (k) { return [k, t.sounds[k]]; }).concat([['none', t.soundNone]]);
      if (ownPlugin()) opts.push(['own', state.rem.sound === 'own' && state.rem.ownName ? t.soundOwnNamed.replace('%', state.rem.ownName) : t.soundOwn]);
      $('rem-sound').innerHTML = opts.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('');
      $('rem-sound').value = state.rem.sound;
    }
    $('rd8').setAttribute('aria-pressed', String(state.rem.d8));
    $('rd14').setAttribute('aria-pressed', String(state.rem.d14));
    $('rd15').setAttribute('aria-pressed', String(state.rem.d15));
    $('rem-days-row').style.display = sutta() ? '' : 'none';
    $('rem-msg').textContent = state.remMsg || (permission === 'denied' ? t.remDenied : permission === 'unsupported' ? t.remUnsupported : (state.rem.on ? (next ? t.remNext(F.remWhen.format(next.when), next.title) : t.remNone) : ''));
    $('rem-note').textContent = inApp ? t.remAppNote : t.remNote;
    $('b-cal').style.display = $('d-cal').style.display = inApp ? 'none' : ''; // in the app the reminders are the device's own
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

  // ---------- key suttas and the reader ----------
  var rdCur = -1;
  function passageLabel(i) { var p = PASSAGES[i][1].split(' · '); return p.length > 1 ? p[0] + ' · ' + p[1].split('|')[lang === 'ru' ? 1 : 0] : p[0]; }
  function readerLabel(i) { var l = passageLabel(i); return lang === 'ru' ? l.replace(/^AN /, 'АН ').replace(/^MN /, 'МН ') : l; }
  function paintKeys() {
    $('keylist').innerHTML = KEYS[lang].map(function (g) {
      return '<li class="kq"><details name="keyq"><summary>' + esc(g[0]) + '</summary><ul>' + g[1].map(function (k) {
        return '<li' + (k[2] === 'gap' ? ' class="gap"' : '') + '><b>' + k[0] + '</b> — ' + k[1].replace(/\{(\d+)\}/g, function (_, n) { return '<button class="rd" type="button" data-i="' + n + '">' + (lang === 'ru' ? 'Читать →' : 'Read →') + '</button>'; }) + '</li>';
      }).join('') + '</ul></details></li>'; // each question is a drawer: the list is not long any more
    }).join('');
    $('rd-sel').innerHTML = PASSAGES.map(function (p, i) { return '<option value="' + i + '">' + esc(readerLabel(i)) + '</option>'; }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.rd'), function (b) { b.onclick = function () { readSutta(+b.getAttribute('data-i')); }; });
    markPali($('keylist'));
    markReader();
  }
  function readerUrl(i) { return '/' + PASSAGES[i][0] + '?lang=' + lang; }
  function outside(url) { window.open('https://dhamma.gift' + url, '_blank', 'noopener'); } // in the app the sutta is read on the site (or in its app), not in a frame here
  function readSutta(i, quiet) {
    if (document.body.classList.contains('app')) { outside(readerUrl(i)); return; }
    rdCur = i; $('reader').hidden = false; $('rd-now').textContent = readerLabel(i); $('rd-sel').value = String(i);
    $('rd-new').href = readerUrl(i); $('rd-frame').src = readerUrl(i); markReader();
    if (!quiet) $('reader').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  // any passage of the slideshow opens in the same reader at the bottom (a middle click or ctrl-click still opens a tab)
  function readRef(ref, label) {
    var url = '/' + ref + '?lang=' + lang;
    if (document.body.classList.contains('app')) { outside(url); return; }
    rdCur = -1; $('reader').hidden = false; $('rd-now').textContent = label; $('rd-sel').selectedIndex = -1;
    $('rd-new').href = url; $('rd-frame').src = url; markReader();
    $('reader').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    // The show is short (at most 10, fewer is better): the special lines that fit the day (at most 5), three of the general ones,
    // and two at random - those that name the days (14, 15, 8) first.
    var named = /cātuddas|pannaras|aṭṭham/i;
    var rnd = shuffle(all.filter(function (q) { return q.kind === 'random'; }));
    rnd = rnd.filter(function (q) { return named.test(q.pli); }).concat(rnd.filter(function (q) { return !named.test(q.pli); }));
    slides = sp.slice(0, 5).concat(shuffle(all.filter(function (q) { return q.kind === 'general'; })).slice(0, 3), rnd.slice(0, 2));
  }
  function slideText(q) { return q[lang] || q.en; }
  // The key words of the Uposatha (the day, its number, the parts of the day) are picked out in the Pali and in the translations.
  var KW = {
    pli: /(uposath|aṭṭham|cātuddas|pannaras|pāṭihāriy|pubbaṇhasamay|majjhanhikasamay|sāyanhasamay|yāma|divāvihār|paṭisallān)[\p{L}]*/giu,
    ru: /(упосатх|восьм|четырнадцат|пятнадцат)[\p{L}]*/giu,
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
      var per = window.innerWidth >= 700 ? { p: 58, t: 62 } : { p: 34, t: 40 }; // a day told in three parts: each part is cut to a line
      body = '<div class="sl-g">' + (q.grouped ? q.lines : verseWindow(q.lines, L.pairs)).map(function (l) {
        var pl = q.grouped ? excerpt(l.pli, KW.pli, per.p) : l.pli, tr = q.grouped ? excerpt(l[lang] || l.en, trKw, per.t) : (l[lang] || l.en);
        return '<b class="sl-gp pli-lang" lang="pi">' + hl(pl, KW.pli) + '</b><span class="sl-gt">' + esc(tr) + '</span>';
      }).join('') + '</div>';
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
  var NIK = { an: 0, dn: 1, mn: 2, sn: 3 };
  // The four Nikayas alphabetically (an, dn, mn, sn), each by number, then the Khuddaka books alphabetically, then the Vinaya.
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
      if (!by[id]) { by[id] = { id: id, title: q.title || {}, kind: q.kind, ref: q.ref, note: q.note }; order.push(id); }
      else if (rank[q.kind] < rank[by[id].kind]) { by[id].kind = q.kind; by[id].ref = q.ref; by[id].note = q.note || by[id].note; }
    });
    return order.map(function (id) { return by[id]; });
  }
  function suttaRow(u) {
    var name = u.title[lang] || u.title.en || '';
    return '<a class="sr" href="/' + esc(u.ref) + '?lang=' + lang + '" target="_blank" rel="noopener"><b class="sid">' + esc(u.id) + '</b><span class="sr-t"><span class="sg-t">' + esc(u.title.pli || '') + (name && name !== u.title.pli ? ' <i>' + esc(name) + '</i>' : '') + '</span>' + (u.note && u.kind !== 'random' ? '<span class="sr-note">' + esc(u.note[lang] || u.note.en).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') + '</span>' : '') + '</span>' + plate(u) + '<svg class="chev"><use href="#i-right"/></svg></a>';
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

  // ---------- contents of the page (a column on the right of wide screens) ----------
  var TOC = [['s-summary', 'tSummary'], ['slides', 'tSuttas'], ['s-calendar', 'tCalendar'], ['parts', 'tParts'], ['keys', 'tKeys'], ['soft', 'tSoft']];
  function paintToc() {
    $('toc').innerHTML = '<b>' + esc(t.tocH) + '</b>' + TOC.map(function (r) { return '<a href="#' + r[0] + '" data-to="' + r[0] + '">' + esc(t[r[1]]) + '</a>'; }).join('');
    Array.prototype.forEach.call($('toc').querySelectorAll('a'), function (a) {
      a.onclick = function (e) {
        e.preventDefault(); var id = a.getAttribute('data-to');
        $(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
    markToc();
  }
  function markToc() { // the section in view is the current one
    var cur = TOC[0][0], line = window.innerHeight * 0.35;
    TOC.forEach(function (r) { var e = $(r[0]); if (e && !e.hidden && e.getBoundingClientRect().top <= line) cur = r[0]; });
    Array.prototype.forEach.call($('toc').querySelectorAll('a'), function (a) { a.setAttribute('aria-current', String(a.getAttribute('data-to') === cur)); });
  }

  // ---------- events ----------
  function wire() {
    $('ctx-change').onclick = function () { openSettings('loc-block'); };
    document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a.setplace'); if (a) { e.preventDefault(); openSettings(e.target.closest('.noonlink') ? 'noon-block' : 'loc-block'); } });
    $('scrim').onclick = closeAll;
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.onclick = closeAll; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
    // The header hides on scrolling down and returns on a short scroll up, as on the rest of the site.
    var lastY = window.scrollY;
    window.addEventListener('scroll', function () {
      var y = window.scrollY, dy = y - lastY;
      document.body.classList.toggle('scrolled', y > 4); markToc();
      if (dy > 8 && y > 80) { document.querySelector('.tbar').classList.add('away'); lastY = y; }
      else if (dy < -4 || y <= 80) { document.querySelector('.tbar').classList.remove('away'); lastY = y; }
    }, { passive: true });
    var pa = $('paliauto'), clr = $('dg-clear-btn');
    function syncClear() { clr.hidden = !pa.value; }
    pa.addEventListener('input', syncClear); pa.addEventListener('search', syncClear); // a suggestion picked from the list changes the value from code: watched below too
    setInterval(syncClear, 400);
    clr.onclick = function () { pa.value = ''; syncClear(); pa.focus(); };
    $('form').onsubmit = function (e) { e.preventDefault(); var q = $('paliauto').value.trim(); if (q) location.href = '/' + encodeURIComponent(q) + (lang === 'ru' ? '?lang=ru' : ''); };
    // ----- the app (Capacitor) or ?app=1: five tabs at the bottom, one section at a time
    (function () {
      var C = window.Capacitor, isApp = params.get('app') === '1' || !!(C && C.isNativePlatform && C.isNativePlatform());
      if (!isApp) return;
      var nav = $('appnav'), tabs = nav.querySelectorAll('button');
      document.body.classList.add('app'); nav.hidden = false;
      document.addEventListener('click', function (e) { // every link to a page of the site leaves the app (a link to this page stays)
        var a = e.target.closest && e.target.closest('a[href^="/"]'); if (!a || /^\/uposatha-calendar/.test(a.getAttribute('href'))) return;
        e.preventDefault(); e.stopPropagation(); outside(a.getAttribute('href')); // once: the page's own handlers do not see this click
      }, true);
      var brand = document.querySelector('#dg-drawer .dg-brand-link'); // the drawer's header stays the site's: the conch and dhamma.gift lead out to the site (or to its app)
      if (brand) { brand.setAttribute('href', 'https://dhamma.gift/'); brand.setAttribute('target', '_blank'); brand.setAttribute('rel', 'noopener'); }
      function openTab(k) {
        if (k === 'list' || k === 'cal') { state.screen = k; store('dgUposathaView', k); }
        document.body.setAttribute('data-app-tab', k); store('dgUposathaTab', k);
        Array.prototype.forEach.call(tabs, function (b) { b.setAttribute('aria-current', String(b.getAttribute('data-tab') === k)); });
        paint(); window.scrollTo(0, 0);
      }
      Array.prototype.forEach.call(tabs, function (b) { b.onclick = function () { var k = b.getAttribute('data-tab'); if (k === 'settings') document.querySelector('.dg-menu-btn').click(); else openTab(k); }; }); // the gear opens the settings; the key suttas live in the summary
      // the drawer is under the bar: while it is open the pill sits on the gear; a tap on a tab closes the drawer and goes to that tab
      // the first item of the bar shows the moon of the Uposatha (see __upoMoon in paint)
      function moonSvg(m) {
        var f = Math.max(0, Math.min(1, m.f)), R = 9, rx = R * Math.abs(1 - 2 * f), d = f <= 0.02 ? '' : f >= 0.98 ? 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z' : 'M12 3A9 9 0 0 1 12 21A' + rx.toFixed(2) + ' 9 0 0 ' + (f < 0.5 ? 0 : 1) + ' 12 3z';
        return '<svg class="ic" data-moon="' + Math.round(f * 100) + (m.right ? 'r' : 'l') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".14"/><g' + (m.right ? '' : ' transform="translate(24 0) scale(-1 1)"') + '>' + (d ? '<path d="' + d + '" fill="currentColor" stroke="none"/>' : '') + '</g></svg>';
      }
      window.__upoNavMoon = function () { var i = nav.querySelector('[data-tab=home] i'), m = window.__upoMoon; if (i && m) { var h = moonSvg(m), cur = i.firstElementChild, key = Math.round(Math.max(0, Math.min(1, m.f)) * 100) + (m.right ? 'r' : 'l'); if (!cur || cur.getAttribute('data-moon') !== key) i.innerHTML = h; } }; // compared with what is there: the designer's script writes its own icon at load
      window.addEventListener('load', function () { setTimeout(window.__upoNavMoon, 100); setTimeout(window.__upoNavMoon, 700); });
      var closeBtn = document.querySelector('#dg-drawer .dg-drawer-close'), wasOpen = false, goTo = null;
      function setCurrent(k) { Array.prototype.forEach.call(tabs, function (b) { b.setAttribute('aria-current', String(b.getAttribute('data-tab') === k)); }); }
      new MutationObserver(function () {
        var open = document.body.classList.contains('dg-drawer-open'); if (open === wasOpen) return; wasOpen = open;
        if (open) setCurrent('settings'); else setCurrent(goTo || document.body.getAttribute('data-app-tab') || 'home'); // a tab was tapped: the pill goes straight to it (it may be the tab we came from)
        goTo = null;
      }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      nav.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('button'); if (!b || !wasOpen || !closeBtn) return;
        if (b.getAttribute('data-tab') === 'settings') { e.stopPropagation(); closeBtn.click(); return; } // the gear again: close
        goTo = b.getAttribute('data-tab'); closeBtn.click(); // a tab: the drawer goes, the tab's own handler follows
      }, true);
      if ($('up-ver')) $('up-ver').textContent = window.__DG_APP_VERSION__ || 'preview'; // the native shell sets the real one
      var last = store('dgUposathaTab'); openTab(/^(home|list|cal|parts)$/.test(last || '') ? last : 'home');
    })();
    onSeg('noonseg', function (v) { state.noon = v; store('dgUposathaNoon', v); paint(); });
    $('meal').onclick = function (e) { if (e.target.closest && e.target.closest('.noonlink')) { e.preventDefault(); openSettings('noon-block'); } };
    $('tab-list').onclick = function () { state.screen = 'list'; store('dgUposathaView', 'list'); paint(); };
    $('tab-cal').onclick = function () { state.screen = 'cal'; store('dgUposathaView', 'cal'); paint(); };
    $('more').onclick = function () { state.months += 3; paint(); };
    $('cal-prev').onclick = function () { state.calOff--; paint(); };
    $('cal-next').onclick = function () { state.calOff++; paint(); };
    $('cal-today').onclick = function () { state.calOff = 0; state.selected = null; paint(); };
    function setLang(l) { lang = l; t = T[lang]; store('dhammaLanguage', lang); applyLang(); paintKeys(); paint(); }
    // as in the dictionary: the logo and the name switch the language by a right click or a long press (a short click still goes home)
    Array.prototype.forEach.call(document.querySelectorAll('#wordmark, .up-shell-logo'), function (el) {
      var press = null, fired = false;
      function toggle() { setLang(lang === 'ru' ? 'en' : 'ru'); }
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); toggle(); });
      el.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse' && e.button !== 0) return; fired = false; press = setTimeout(function () { fired = true; toggle(); }, 600); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (n) { el.addEventListener(n, function () { clearTimeout(press); }); });
      el.addEventListener('click', function (e) { if (fired) { e.preventDefault(); fired = false; } });
    });
    // Language and theme are the site's own (dhamma-i18n.js, themeswitch.js): this page follows them
    document.addEventListener('dhamma:languagechange', function (e) { var l = ((e.detail && e.detail.language) || '').slice(0, 2) === 'ru' ? 'ru' : 'en'; if (l !== lang) setLang(l); });
    new MutationObserver(function () { var v = document.documentElement.getAttribute('data-bs-theme'); if (v && v !== document.documentElement.getAttribute('data-theme')) { document.documentElement.setAttribute('data-theme', v); document.body.classList.toggle('dark', v === 'dark'); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });
    window.dgAnnounceLanguage = window.dgAnnounceLanguage || function (l) { toast(l === 'ru' ? 'Русский' : 'English'); };
    window.dgDrawerHelpHref = function () { return t.docs; };
    function share() { // the native share sheet where there is one, else the link is copied
      var url = location.origin + '/uposatha-calendar' + (lang === 'ru' ? '?lang=ru' : '');
      if (navigator.share) navigator.share({ title: t.shareTitle, url: url }).catch(function () { /* cancelled */ });
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast(t.linkCopied); });
      else window.prompt(t.shareTitle, url);
    }
    function openCal() { var c = document.querySelector('#dg-drawer .dg-drawer-close'); if (c && !$('dg-drawer').hidden) c.click(); openPanel('cal-modal'); }
    $('b-share').onclick = $('d-share').onclick = share;
    $('b-cal').onclick = $('d-cal').onclick = openCal;
    $('p-ics').onclick = downloadIcs;
    $('sub-copy').onclick = function () { var u = feedUrl('https'); if (navigator.clipboard) navigator.clipboard.writeText(u).then(function () { toast(t.linkCopied); }); else window.prompt(t.copyLink, u); };
    $('tz').onchange = function (e) { state.tz = e.target.value; store('dgUposathaTz', state.tz); paint(); };
    Array.prototype.forEach.call($('hemiseg').children, function (b) { b.onclick = function () { state.south = b.getAttribute('data-hemi') === 'south'; store('dgUposathaHemisphere', state.south ? 'south' : 'north'); paint(); }; });
    onSeg('weekseg', function (v) { weekPref = v; store('dgUposathaWeek', v); paint(); });
    onSeg('sw-sut', function (v) { state.ref = v === '1' ? 18 : 6; store('dgUposathaSutta', v); paint(); });
    onSeg('sw-det', function (v) { state.lite = v === '0'; store('dgUposathaLite', state.lite ? '1' : '0'); paint(); });
    function km(a, b, c, d) { var r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2), h = x * x + Math.cos(a * r) * Math.cos(c * r) * y * y; return 12742 * Math.asin(Math.sqrt(h)); }
    function zoneNear(lat, lon, keep) { // the time zone by the place: the browser's own when it is close enough, else the nearest zone we know
      var k = ZONE_COORDS[keep]; if (k && km(lat, lon, k[0], k[1]) < 300) return keep;
      var best = keep, bd = 1e9; Object.keys(ZONE_COORDS).forEach(function (z) { var d = km(lat, lon, ZONE_COORDS[z][0], ZONE_COORDS[z][1]); if (d < bd) { bd = d; best = z; } });
      return best;
    }
    function setPlace(lat, lon, name) { // the place fixes the Sun; south of the equator flips the moon's shape
      state.loc = { lat: lat, lon: lon }; if (name) state.loc.name = name; store('dgUposathaLoc', JSON.stringify(state.loc));
      state.south = lat < 0; store('dgUposathaHemisphere', state.south ? 'south' : 'north');
    }
    $('loc-btn').onclick = function () {
      if (!navigator.geolocation) { state.locMsg = t.locDenied; paint(); return; }
      $('locnote').textContent = t.locFinding;
      navigator.geolocation.getCurrentPosition(function (pos) {
        // about a kilometre is plenty for a sunrise, and less to keep
        var la = Math.round(pos.coords.latitude * 100) / 100, lo = Math.round(pos.coords.longitude * 100) / 100;
        setPlace(la, lo); state.tz = zoneNear(la, lo, state.tz); store('dgUposathaTz', state.tz); state.locMsg = ''; paint(); // the place gives the zone; the picker is for a person without a place
      }, function () { state.locMsg = t.locDenied; paint(); }, { timeout: 15000, maximumAge: 3600000 });
    };
    // The place by a city: our own suggestions (a native datalist has no list in the Android WebView and shows nothing on an empty field)
    var CITIES = Object.keys(ZONE_COORDS).map(function (z) { return { zone: z, name: z.split('/').pop().replace(/_/g, ' ') }; }).sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    var POPULAR = ['Asia/Almaty', 'Asia/Bangkok', 'Asia/Colombo', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Yangon', 'Asia/Tokyo', 'Europe/Moscow', 'Europe/London', 'America/New_York', 'Australia/Sydney'];
    function cityMatches(q) {
      q = q.trim().toLowerCase();
      if (!q) return POPULAR.filter(function (z) { return ZONE_COORDS[z]; }).map(function (z) { return { zone: z, name: z.split('/').pop().replace(/_/g, ' ') }; });
      var a = CITIES.filter(function (c) { return c.name.toLowerCase().indexOf(q) === 0; }), b = CITIES.filter(function (c) { return c.name.toLowerCase().indexOf(q) > 0 || (c.name.toLowerCase().indexOf(q) < 0 && c.zone.toLowerCase().indexOf(q) >= 0); });
      return a.concat(b).slice(0, 40);
    }
    function showCities() {
      var list = cityMatches($('city').value), ul = $('citylist');
      ul.innerHTML = list.map(function (c) { return '<li role="option" data-z="' + esc(c.zone) + '">' + esc(c.name) + '<small>' + esc(c.zone) + '</small></li>'; }).join('');
      ul.hidden = !list.length; $('city').setAttribute('aria-expanded', String(!ul.hidden));
    }
    function hideCities() { $('citylist').hidden = true; $('city').setAttribute('aria-expanded', 'false'); }
    function chooseCity(zone) { // a city: its time zone, its coordinates (so the real sunrise and sunset), its hemisphere
      var c = ZONE_COORDS[zone]; if (!c) return;
      state.tz = zone; store('dgUposathaTz', zone); setPlace(c[0], c[1], zone.split('/').pop().replace(/_/g, ' ')); state.locMsg = ''; hideCities(); paint();
    }
    $('city').addEventListener('focus', showCities); $('city').addEventListener('input', showCities);
    $('city').addEventListener('keydown', function (e) { if (e.key === 'Escape') hideCities(); if (e.key === 'Enter') { e.preventDefault(); var f = cityMatches($('city').value)[0]; if (f && $('city').value.trim()) chooseCity(f.zone); } });
    $('city').addEventListener('blur', function () { setTimeout(hideCities, 150); }); // after a tap on a suggestion has been handled
    $('citylist').addEventListener('pointerdown', function (e) { var li = e.target.closest && e.target.closest('li[data-z]'); if (li) { e.preventDefault(); chooseCity(li.getAttribute('data-z')); } });
    function saveRem() { store('dgUposathaRemind', JSON.stringify(state.rem)); }
    onSeg('sw-rem', function (v) {
      state.remMsg = '';
      if (v === '0' || state.rem.on) { state.rem.on = false; saveRem(); paint(); return; }
      var LN = nativePlugin();
      if (LN) {
        LN.requestPermissions().then(function (r) { state.rem.on = !!(r && r.display === 'granted'); if (!state.rem.on) state.remMsg = t.remDenied; saveRem(); paint(); }).catch(function () { state.remMsg = t.remUnsupported; paint(); });
        return;
      }
      if (!('Notification' in window)) { state.remMsg = t.remUnsupported; paint(); return; }
      Notification.requestPermission().then(function (perm) { state.rem.on = perm === 'granted'; if (perm !== 'granted') state.remMsg = t.remDenied; saveRem(); paint(); });
    });
    function saveMeal() { store('dgUposathaMeal', JSON.stringify(state.meal)); }
    $('twi').onchange = function (e) { state.twi = e.target.value; store('dgUposathaTwi', state.twi); paint(); };
    var tstMin = 1; setSeg('tst-min', 1); onSeg('tst-min', function (v) { tstMin = +v; setSeg('tst-min', v); });
    $('tst-go').onclick = function () { // a test reminder in 1-2 minutes, through the same channels and sounds as the real ones
      var kind = $('tst-kind').value, at = new Date(Date.now() + tstMin * 60000), F = formats(), msg = $('tst-msg'), title = t.tstTitle(kind), LN = nativePlugin();
      function shown() { msg.textContent = t.tstSet(F.hm.format(at)); }
      if (LN) {
        var snd = kind === 'upo' ? [state.rem.sound, state.rem.ownChannel] : kind === 'beg' ? [state.meal.begSnd] : [state.meal.snd];
        LN.requestPermissions().then(function (r) { if (!(r && r.display === 'granted')) { msg.textContent = t.tstDenied; return; }
          return channelFor(LN, snd[0], snd[1]).then(function (channelId) { return LN.schedule({ notifications: [{ id: 7990 + (+(kind === 'beg') * 1) + (+(kind === 'end') * 2), title: title, body: t.tstBody, channelId: channelId, schedule: { at: at, allowWhileIdle: true }, extra: { url: '/uposatha-calendar' } }] }); }).then(shown); }).catch(function () { msg.textContent = t.remUnsupported; });
        return;
      }
      if (!('Notification' in window)) { msg.textContent = t.remUnsupported; return; }
      Notification.requestPermission().then(function (perm) { if (perm !== 'granted') { msg.textContent = t.tstDenied; return; }
        setTimeout(function () { try { new Notification(title, { body: t.tstBody, icon: '/assets/img/pwa-bold-monocolor-192.png' }); } catch (e) { /* the page must stay open on the site */ } }, tstMin * 60000); shown(); });
    };
    onSeg('testseg', function (v) { state.fake = v; store('dgUposathaFake', v); paint(); });
    onSeg('sw-msum', function (v) { state.meal.sum = v === '1'; saveMeal(); paint(); });
    function mealSwitch(key) { // a meal reminder on: the permission first (the same flow as the Uposatha reminders)
      return function (v) {
        state.remMsg = '';
        if (v === '0' || state.meal[key]) { state.meal[key] = false; saveMeal(); paint(); return; }
        var LN = nativePlugin();
        function done(ok) { state.meal[key] = ok; if (!ok) state.remMsg = t.remDenied; saveMeal(); paint(); }
        if (LN) { LN.requestPermissions().then(function (r) { done(!!(r && r.display === 'granted')); }).catch(function () { state.remMsg = t.remUnsupported; paint(); }); return; }
        if (!('Notification' in window)) { state.remMsg = t.remUnsupported; paint(); return; }
        Notification.requestPermission().then(function (perm) { done(perm === 'granted'); });
      };
    }
    onSeg('sw-mrem', mealSwitch('rem')); onSeg('sw-mbeg', mealSwitch('beg'));
    $('mbeg-lead').onchange = function (e) { state.meal.begLead = parseInt(e.target.value, 10); saveMeal(); paint(); };
    $('mbeg-sound').onchange = function (e) { state.meal.begSnd = e.target.value; saveMeal(); paint(); if (SOUND_FILES[e.target.value]) { try { new Audio(SOUND_FILES[e.target.value][1]).play(); } catch (err) { /* a preview only */ } } };
    onSeg('mrem-days', function (v) { state.meal.days = v; saveMeal(); paint(); });
    $('mrem-lead').onchange = function (e) { state.meal.lead = parseInt(e.target.value, 10); saveMeal(); paint(); };
    $('mrem-sound').onchange = function (e) { state.meal.snd = e.target.value; saveMeal(); paint(); if (SOUND_FILES[e.target.value]) { try { new Audio(SOUND_FILES[e.target.value][1]).play(); } catch (err) { /* a preview only */ } } };
    $('rem-lead').onchange = function (e) { state.rem.lead = parseInt(e.target.value, 10); saveRem(); paint(); };
    $('rem-sound').onchange = function (e) {
      var v = e.target.value; state.remMsg = '';
      function done() { saveRem(); paint(); }
      if (v === 'own') { // the person picks a file; the app makes a channel of it. Cancelled -> the choice stays as it was
        ownPlugin().pick().then(function (r) { if (r && r.channelId) { state.rem.sound = 'own'; state.rem.ownChannel = r.channelId; state.rem.ownName = r.name || ''; } done(); }).catch(function () { state.remMsg = t.soundFail; done(); });
        return;
      }
      state.rem.sound = v; done();
      if (SOUND_FILES[v]) { try { new Audio(SOUND_FILES[v][1]).play(); } catch (err) { /* a preview only */ } } // hear it at once
    };
    $('rd8').onclick = function () { state.rem.d8 = !state.rem.d8; saveRem(); paint(); };
    $('rd14').onclick = function () { state.rem.d14 = !state.rem.d14; saveRem(); paint(); };
    $('rd15').onclick = function () { state.rem.d15 = !state.rem.d15; saveRem(); paint(); };
    $('sl-all-btn').onclick = showAllSlides;
    $('sl-filter').onclick = function (e) { var v = e.target.getAttribute && e.target.getAttribute('data-f'); if (v) { slFilter = v; showAllSlides(); } };
    $('sl-sort').onclick = function (e) { var v = e.target.getAttribute && e.target.getAttribute('data-s'); if (v) { slSort = v; showAllSlides(); } };
    // the "open in a new window" pill sits on the frame's top border and shows on hover or after a tap inside the frame, as in the docs
    var frame = $('rd-frame'), box = $('dgframe');
    function attachFrame() { try { frame.contentWindow.addEventListener('pointerdown', function () { box.classList.add('is-active'); }); } catch (e) { /* cross-origin: hover only */ } }
    frame.addEventListener('load', attachFrame);
    document.addEventListener('pointerdown', function (e) { if (!box.contains(e.target)) box.classList.remove('is-active'); });
    document.addEventListener('click', function (e) {
      if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('#dg-carousel .carousel-item a, #sl-all-list .sr, .pref');
      if (!a) return;
      e.preventDefault();
      var href = a.getAttribute('href') || '', ref = href.replace(/^\//, '').split('?')[0];
      closeAll(); readRef(ref, ref.split(':')[0]);
    });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es, ob) { if (es[0].isIntersecting) { ob.disconnect(); if (!$('rd-frame').getAttribute('src')) readSutta(0, true); } }, { rootMargin: '300px' }).observe($('reader'));
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
