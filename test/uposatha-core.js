// The Uposatha calendar core (public/overrides/js/uposatha-core.js): by the suttas the key days are the phase moments —
// the 15th day is the one the full moon (waxing half) or the new moon (waning half) falls in, the 8th the one the first or
// the last quarter falls in, and the 14th is the day before the 15th. Naming a day by the tithi read at the dawn after it
// (the tradition's own way of numbering a lunar day) put a phase that comes late in the evening a few hours past the end of
// the evening-to-evening day it named — the new moon of 10 Oct 2026 at 20:50 in Asia/Yekaterinburg with its 15th day ending
// at 17:16 — which is why the names are pinned to the moments. This is what that pinning must keep true.
//   node test/uposatha-core.js        (npm run test-uposatha)
const assert = require('assert');
const A = require('../public/overrides/js/vendor/astronomy.browser.min.js');
const C = require('../public/overrides/js/uposatha-core.js');

const DAY = 86400000;
const FROM = '2026-01-01', TO = '2027-06-01';

// With a place the day runs sunset to sunset; without one 18:00 to 18:00 in the given zone (the bot's own reference).
const PLACES = [
    ['Bodh Gaya, 18:00 to 18:00', 'Asia/Kolkata', null],
    ['Surgut (UTC+5, 61N — the case that was wrong)', 'Asia/Yekaterinburg', { lat: 61.25, lon: 73.42 }],
    ['Colombo', 'Asia/Colombo', { lat: 6.93, lon: 79.86 }],
    ['Sydney (southern hemisphere)', 'Australia/Sydney', { lat: -33.87, lon: 151.21 }],
];

function phases(from, to) {
    const out = [];
    for (let q = A.SearchMoonQuarter(new Date(Date.parse(from) - 3 * DAY)); ; ) {
        const at = q.time.date;
        if (at.getTime() > Date.parse(to) + DAY) break;
        out.push({ quarter: q.quarter, at });
        q = A.NextMoonQuarter(q);
    }
    return out;
}

for (const [label, tz, loc] of PLACES) {
    const { rows } = C.dataset(FROM, TO, { tz, sutta: true, loc });
    const dayOf = (ms) => { let found = null; for (const r of rows) { if (r.at.getTime() <= ms) found = r; else break; } return found; };
    const ph = phases(FROM, TO).filter((p) => p.at.getTime() < rows[rows.length - 1].at.getTime() + DAY);

    for (const p of ph) {
        const r = dayOf(p.at.getTime());
        const want = p.quarter === 0 || p.quarter === 2 ? 15 : 8;
        const has = r && r.names.some((n) => C.dayNo(n) === want);
        assert.ok(has, `${label}: the ${want}th day should be the one holding the phase of ${p.at.toISOString()} (got ${r && r.ymd} ${r && JSON.stringify(r.names)})`);
        assert.ok(p.at.getTime() < r.at.getTime() + DAY, `${label}: the phase of ${p.at.toISOString()} must fall inside its day ${r.ymd}`);
    }
    rows.forEach((r, i) => {
        if (!r.names.some((n) => C.dayNo(n) === 14)) return;
        const next = rows[i + 1];
        assert.ok(next && next.names.some((n) => C.dayNo(n) === 15), `${label}: the 14th of ${r.ymd} must be the day before a 15th`);
    });
    const lunations = ph.length / 4;
    const uposatha = rows.filter((r) => r.uposatha).length;
    assert.strictEqual(uposatha / lunations, 6, `${label}: six Uposatha days a month (got ${uposatha} over ${lunations} lunations)`);
    console.log(`ok   ${label}: ${uposatha} days over ${lunations} lunations, every phase inside its day, every 14th before a 15th`);
}

// The case the owner reported: October 2026 at UTC+5 (sunset 17:16 on the 10th), where the new moon of Sat 10 Oct 20:50
// used to sit past the end of the 15th day it belonged to.
{
    const tz = 'Asia/Yekaterinburg', loc = { lat: 61.25, lon: 73.42 };
    const { rows, byYmd } = C.dataset('2026-09-25', '2026-10-30', { tz, sutta: true, loc });
    const named = (ymd) => (byYmd[ymd] && byYmd[ymd].names.map(C.dayNo)) || [];
    assert.deepStrictEqual(named('2026-10-09'), [14], 'the 14th day is 9 October');
    assert.deepStrictEqual(named('2026-10-10'), [15], 'the 15th day is 10 October');
    assert.deepStrictEqual(named('2026-10-03'), [8], 'the 8th day is 3 October');
    const fifteenth = byYmd['2026-10-10'], next = byYmd['2026-10-11'];
    assert.ok(fifteenth.newMoon, 'the 15th day carries the new moon');
    assert.ok(fifteenth.newMoon.getTime() > fifteenth.at.getTime() && fifteenth.newMoon.getTime() < next.at.getTime(),
        'the new moon falls inside the 15th day (evening to evening)');
    console.log(`ok   October 2026, UTC+5: 14th 9 Oct, 15th 10 Oct (new moon inside it), 8th 3 Oct`);
}
console.log('uposatha core: ok');
