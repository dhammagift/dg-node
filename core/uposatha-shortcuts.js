// The shortcuts of the Uposatha PWA (the menu of its icon: the taskbar's jump list, a long press on a phone): "Calendar" and the
// next three Uposatha days, as the launcher shortcuts of the phone apps (dg-apps uposatha-bridge.js).
// A manifest has no dynamic shortcuts: its list is static. So the server writes the list into the manifest it sends, and the
// browser takes it when it reads the manifest again (Chromium: when the app is opened, not more often than once a day) - the
// days follow with that delay, which is why they are named by their date and never "today" / "tomorrow".
// The page asks for its manifest with its time zone, language and scheme (uposatha-calendar.js); the place is not sent, so the
// evening is 18:00 of that zone. Without them: UTC, English, by the suttas.
'use strict';

// The shape an Uposatha day is drawn with (as in the page and the apps): the 8th a quarter, the 14th the last shape before full / new,
// the 15th full (the waxing half) or new
function moonIndex(tithi) {
    const n = tithi <= 15 ? tithi : tithi - 15, waxing = tithi <= 15;
    return waxing ? (n === 8 ? 2 : n === 14 ? 3 : 4) : (n === 8 ? 6 : n === 14 ? 7 : 0);
}

// core: public/overrides/js/uposatha-core.js; o: { now (Date), tz, lang ('en' | 'ru'), sutta (bool) }. Returns the manifest's "shortcuts".
function build(core, o) {
    const ru = o.lang === 'ru', tz = o.tz || 'UTC', sutta = o.sutta !== false, today = core.localDay(o.now, tz);
    const item = (name, url, icon, size) => ({ name, short_name: name, url, icons: [{ src: icon, sizes: size + 'x' + size, type: 'image/png' }] });
    const out = [item(ru ? 'Календарь' : 'Calendar', '/uposatha-calendar?app=1&tab=cal&source=shortcut', '/assets/img/uposatha-192.png', 192)];
    const date = new Intl.DateTimeFormat(ru ? 'ru' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    // by the suttas an Uposatha begins in the evening of its date: the row of yesterday is the one in force today
    const rows = core.dataset(core.ymdAdd(today, -1), core.ymdAdd(today, 40), { tz, sutta, loc: null }).rows;
    for (const r of rows) {
        if (out.length >= 4) break;
        if (!r.uposatha || r.ymd < (sutta ? core.ymdAdd(today, -1) : today)) continue;
        const nums = sutta ? r.names.map(core.dayNo).join('/') : '';
        const kind = sutta ? (ru ? nums + '-й день' : 'Day ' + nums) : core.nameOf(core.NAMES[ru ? 'ru' : 'en'], r, false);
        const p = r.ymd.split('-').map(Number), when = date.format(new Date(Date.UTC(p[0], p[1] - 1, p[2])));
        out.push(item(when + ' · ' + kind, '/uposatha-calendar?app=1&tab=cal&day=' + r.ymd + '&source=shortcut',
            '/assets/img/uposatha-moon-' + (sutta ? moonIndex(r.names[0]) : [0, 2, 4, 6][r.phase]) + '.png', 96));
    }
    return out;
}

module.exports = { build, moonIndex };
