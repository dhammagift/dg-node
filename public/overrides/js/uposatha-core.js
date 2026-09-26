// Uposatha calculation core, shared by the page (browser) and the calendar feed (/uposatha.ics, Node).
// See uposatha-calendar.js for the scheme (by the suttas: dated by the evening it begins; modern: the four moon-phase dates).
// A lunar day is the tithi: floor(MoonPhase / 12) + 1, 1..30; 1-15 waxing half, 16-30 waning half.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/astronomy.browser.min.js'));
  else root.UposathaCore = factory(root.Astronomy);
})(this, function (A) {
  'use strict';
  var DAY = 86400000;
  var UPOSATHA = [8, 14, 15, 23, 29, 30]; // tithi numbers of the 8th, 14th, 15th of the waxing half, then of the waning half
  var EN_ORD = { 1: '1st', 2: '2nd', 3: '3rd' };
  // Words used in names, shared by the page and the calendar file.
  var NAMES = {
    en: {
      halves: ['waxing half', 'waning half'], halvesOf: ['waxing half', 'waning half'], events: ['New moon', 'First quarter', 'Full moon', 'Last quarter'], uday: 'Uposatha day', and: ' & ',
      nth: function (n) { return EN_ORD[n] || n + 'th'; }, dayOf: function (nth, half) { return nth + ' day of the ' + half; },
      two: 'Two Uposatha days: the 14th and the 15th.', begins: 'Begins', tzName: 'Uposatha days',
    },
    ru: {
      halves: ['растущая половина', 'убывающая половина'], halvesOf: ['растущей половины', 'убывающей половины'], events: ['Новолуние', 'Первая четверть', 'Полнолуние', 'Последняя четверть'], uday: 'День упосатхи', and: ' и ',
      nth: function (n) { return n + '-й'; }, dayOf: function (nth, half) { return nth + ' день · ' + half; },
      two: 'Две упосатхи: 14-й и 15-й дни.', begins: 'Начало', tzName: 'Дни упосатхи',
    },
  };
  function pad(n) { return ('0' + n).slice(-2); }
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
  function tithiAt(date) { return Math.floor(A.MoonPhase(date) / 12) + 1; }
  function dayNo(tithi) { return tithi <= 15 ? tithi : tithi - 15; }
  function ymdAdd(ymd, n) { return new Date(Date.parse(ymd) + n * DAY).toISOString().slice(0, 10); }

  // One row per calendar date from..to (y-m-d, inclusive): the lunar day in force at the reading moment of that date (by the suttas: the dawn after it), until
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
        at = sunEvent(ref === 18 ? 'set' : 'rise', y, m, d, tz, obs);
        if (at) refKind = ref === 18 ? 'sunset' : 'sunrise';
      }
      if (!at) at = zonedToUtc(y, m, d, ref, tz);
      // By the suttas the observance begins in the evening and its daytime falls in the next morning, so its lunar day is the one
      // in force at that dawn (the night before it belongs to the same day); the modern scheme reads at its own morning.
      var readAt = at;
      if (ref === 18) readAt = sunEvent('rise', y, m, d + 1, tz, obs) || zonedToUtc(y, m, d + 1, 6, tz);
      var tithi = tithiAt(readAt);
      var row = { ymd: ymd, y: y, m: m, d: d, dow: c.getUTCDay(), at: at, refKind: refKind, tithi: tithi, waxing: tithi <= 15, day: dayNo(tithi),
        ends: A.SearchMoonPhase((tithi * 12) % 360, readAt, 3), skipped: [], repeats: false };
      if (prev) {
        var gap = (tithi - prev.tithi + 30) % 30;
        row.repeats = gap === 0;
        for (var k = 1; k < gap; k++) row.skipped.push((prev.tithi + k - 1) % 30 + 1);
      }
      // the 15th lunar day of the waxing half ends at the full moon, that of the waning half at the new moon
      row.fullMoon = tithi === 15 ? row.ends.date : null;
      row.newMoon = tithi === 30 ? row.ends.date : null;
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
  // opts: { tz, sutta (bool), loc: {lat, lon} | null }
  function dataset(from, to, opts) {
    var obs = opts.loc ? new A.Observer(opts.loc.lat, opts.loc.lon, 0) : null;
    var rows = civilDays(from, to, opts.tz, opts.sutta ? 18 : 6, obs), byYmd = {};
    rows.forEach(function (r) { byYmd[r.ymd] = r; });
    if (!opts.sutta) markPhases(rows, byYmd, opts.tz, from, to);
    return { rows: rows, byYmd: byYmd, obs: obs };
  }
  function halfName(t, tithi) { return t.halves[tithi <= 15 ? 0 : 1]; }
  function nameOf(t, r, sutta) {
    if (!sutta) return t.events[r.phase];
    return t.dayOf(r.names.map(function (x) { return t.nth(dayNo(x)); }).join(t.and), halfName(t, r.names[0]));
  }
  // rem: { lead (hours), d8, d14, d15 }; by the suttas the days are chosen, in the modern scheme every listed day counts
  function wantDay(r, sutta, rem) {
    if (!sutta) return true;
    return r.names.some(function (x) { var n = dayNo(x); return (n === 8 && rem.d8) || (n === 14 && rem.d14) || (n === 15 && rem.d15); });
  }
  // The 14th day is followed by the 15th: its reminder says that there are two Uposathas.
  function twoUposathas(r, byYmd, sutta) {
    if (!sutta || !r.names.some(function (x) { return dayNo(x) === 14; })) return false;
    if (r.names.some(function (x) { return dayNo(x) === 15; })) return true;
    var next = byYmd[ymdAdd(r.ymd, 1)];
    return !!(next && next.names.some(function (x) { return dayNo(x) === 15; }));
  }
  function icsEscape(x) { return String(x).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  function icsStamp(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); }
  // A calendar file (also the body of the subscription feed): one event per Uposatha day from the moment it begins,
  // an alarm `lead` hours ahead on the wanted days. o: { lang, tz, sutta, loc, rem, days (how far ahead), feed (bool) }
  function buildIcs(o) {
    var t = NAMES[o.lang === 'ru' ? 'ru' : 'en'], now = new Date(), from = ymdAdd(localDay(now, o.tz), -1), to = ymdAdd(from, o.days);
    var data = dataset(from, to, { tz: o.tz, sutta: o.sutta, loc: o.loc });
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dhamma.gift//Uposatha//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsEscape(t.tzName)];
    if (o.feed) lines.push('REFRESH-INTERVAL;VALUE=DURATION:P1D', 'X-PUBLISHED-TTL:PT24H');
    data.rows.filter(function (r) { return r.uposatha && r.at.getTime() > now.getTime() - DAY; }).forEach(function (r) {
      var name = nameOf(t, r, o.sutta), two = twoUposathas(r, data.byYmd, o.sutta);
      lines.push('BEGIN:VEVENT', 'UID:uposatha-' + r.ymd + (o.sutta ? '-s' : '-m') + '@dhamma.gift', 'DTSTAMP:' + icsStamp(now),
        'DTSTART:' + icsStamp(r.at), 'DTEND:' + icsStamp(new Date(r.at.getTime() + DAY)), 'SUMMARY:' + icsEscape(t.uday + ' — ' + name),
        'DESCRIPTION:' + icsEscape((two ? t.two + '\n' : '') + 'https://dhamma.gift/uposatha-calendar'));
      if (wantDay(r, o.sutta, o.rem)) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(name), 'TRIGGER:' + (o.rem.lead ? '-PT' + o.rem.lead + 'H' : 'PT0S'), 'END:VALARM');
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }
  return { NAMES: NAMES, UPOSATHA: UPOSATHA, DAY: DAY, pad: pad, localDay: localDay, offsetMs: offsetMs, zonedToUtc: zonedToUtc, sunEvent: sunEvent,
    tithiAt: tithiAt, dayNo: dayNo, ymdAdd: ymdAdd, civilDays: civilDays, markPhases: markPhases, dataset: dataset, halfName: halfName, nameOf: nameOf,
    wantDay: wantDay, twoUposathas: twoUposathas, buildIcs: buildIcs };
});
