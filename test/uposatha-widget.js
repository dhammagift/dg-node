// The Uposatha widgets: the shared data builder (public/overrides/js/uposatha-widget-data.js), the Adaptive Card templates and the manifest
// of the Windows 11 PWA widgets, and the service worker's widget code run against fakes.
//   node test/uposatha-widget.js        (npm run test-uposatha-widget)
// What it checks:
//   1. build() gives the contract of the native widgets (same keys as the designer's fixture) and, for the same settings and moment,
//      exactly what the page's window.__upoWidgetData() gave before the builder was moved out (golden files captured from the page);
//   2. card() works for ru and en, and every ${...} of the three templates binds to a key that exists (in card() and in the placeholder data);
//   3. the templates are Adaptive Cards 1.5 whose only action is Action.Execute with a verb the service worker knows;
//   4. every file the manifest's "widgets" point to exists (screenshots with the declared size);
//   5. the worker's code (loaded as a worker would: importScripts, no module system) answers widgetinstall / widgetclick / the message.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'public/overrides/js');
const A = require(path.join(JS, 'vendor/astronomy.browser.min.js'));
const C = require(path.join(JS, 'uposatha-core.js'));
const WD = require(path.join(JS, 'uposatha-widget-data.js'));
const read = (p) => fs.readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));
const FIXTURES = path.join(__dirname, 'fixtures');

// ---------- 1. the shape and the golden output ----------
function shape(x) { // the keys of an object (recursively, the first element of an array) and the type of every leaf
    if (Array.isArray(x)) return [x.length ? shape(x[0]) : null];
    if (x && typeof x === 'object') { const o = {}; Object.keys(x).sort().forEach((k) => { o[k] = shape(x[k]); }); return o; }
    return typeof x;
}
const fixture = json(path.join(FIXTURES, 'uposatha-widget-fixture-ru.json'));
const base = { A, C, tz: 'Asia/Almaty', loc: { lat: 43.24, lon: 76.89 }, lang: 'ru', su: true, lite: false, showKala: true, south: false, noon: 'sun', twi: 'sun' };
{
    const raw = WD.build(Object.assign({}, base, { tz: 'UTC', loc: null, lite: true }));
    assert.deepStrictEqual(Object.keys(raw), Object.keys(fixture), 'top-level keys and their order');
    assert.deepStrictEqual(shape(raw), shape(fixture), 'the output has the shape of the designer\'s fixture');
    assert.strictEqual(raw.days.length, 31, '31 days');
    assert.ok(raw.uposathas.length >= 8, 'about 11 weeks of Uposathas');
    raw.days.forEach((d) => assert.strictEqual(d.parts.length, 6, 'six parts a day'));
    console.log('ok   build(): the shape of fixture-ru.json (' + raw.uposathas.length + ' Uposathas, 31 days)');
}
const T = 1791560000000; // the moment the golden files were taken at (the page, with Date frozen)
[
    ['uposatha-widget-golden-utc-ru.json', { tz: 'UTC', loc: null, lang: 'ru', su: true, lite: true, showKala: true, south: false, noon: 'sun', twi: 'sun' }],
    ['uposatha-widget-golden-almaty-en.json', { tz: 'Asia/Almaty', loc: { lat: 43.24, lon: 76.89 }, lang: 'en', su: false, lite: false, showKala: true, south: false, noon: 'mid', twi: 'sun' }],
].forEach(([file, env]) => {
    const got = JSON.parse(JSON.stringify(WD.build(Object.assign({ A, C, now: new Date(T) }, env))));
    // UPDATE_GOLDEN=1 rewrites the golden files after a change of the data on purpose (the contract's values), never to hide a regression
    if (process.env.UPDATE_GOLDEN === '1') fs.writeFileSync(path.join(FIXTURES, file), JSON.stringify(got));
    assert.deepStrictEqual(got, json(path.join(FIXTURES, file)), file + ': the same data the builder gave when the golden file was taken');
    console.log('ok   build(): identical to the page\'s own output (' + file + ')');
});

// ---------- 2. card() ----------
const S = json(path.join(ROOT, 'public/overrides/widgets/uposatha-strings.json'));
const models = [];
['ru', 'en'].forEach((lang) => [true, false].forEach((lite) => [0, 6 * 3600e3, 14 * 3600e3, 40 * 3600e3, 3 * 86400e3].forEach((dt) => {
    const now = T + dt;
    const raw = WD.build(Object.assign({}, base, { lang, lite, now: new Date(now) }));
    const m = WD.card(raw, S, now);
    assert.strictEqual(m.lang, lang);
    assert.ok(m.u.title && m.u.count && m.u.to, `${lang}: layer 1 has a title, a count and the day it counts to`);
    assert.ok(/kala|Kala|Vikala/i.test(m.u.kala + m.n.kala), `${lang}: kala or vikala is named`);
    assert.strictEqual(m.n.bar.length, 6, 'six parts in the scale');
    assert.strictEqual(m.n.list.filter((p) => p.cur).length, 1, 'exactly one current part');
    assert.ok(m.m.weeks.length >= 4 && m.m.weeks.every((w) => w.cells.length === 7), 'the month is whole weeks of 7');
    assert.ok(m.m.weeks.some((w) => w.cells.some((c) => c.c === 'Accent')), 'the month marks an Uposatha evening');
    models.push(m);
})));
console.log('ok   card(): ' + models.length + ' models (ru/en, short/long, 5 moments)');
{ // kala before midday, vikala after it
    const raw = WD.build(Object.assign({}, base, { now: new Date(T) })), d = raw.days[0];
    const k = (ms) => WD.card(raw, S, ms).n.kala;
    assert.ok(/^Kala/.test(k(d.aruna.ms + 60000)), 'kala after the dawn');
    assert.ok(/^Vikala/.test(k(d.noon.ms + 60000)), 'vikala after midday');
    assert.ok(/^Vikala/.test(k(d.aruna.ms - 60000)), 'vikala before the dawn');
}

// ---------- 3. the templates bind to what exists ----------
const WIDGETS = path.join(ROOT, 'public/overrides/widgets');
const placeholder = json(path.join(WIDGETS, 'uposatha-data.json'));
assert.deepStrictEqual(shape(placeholder), shape(models[0]), 'the placeholder data has the shape of card()');
const sw = read(path.join(ROOT, 'public/service-worker.js'));
// The Windows 11 widget is not wired on the site for now (postponed, dg-apps#65: the worker and manifest parts were taken out
// before a prod rollout; they are in commit 3ffb9bf). The builder and card() above are still checked; the rest needs the worker.
if (!/var WIDGET_TABS = /.test(sw)) { console.log('skip the templates, the manifest and the worker: the Windows widget is not wired (dg-apps#65)'); console.log('uposatha widget: ok'); process.exit(0); }
const verbs = Object.keys(eval('(' + /var WIDGET_TABS = (\{[^}]*\})/.exec(sw)[1] + ')'));
assert.ok(verbs.length >= 3, 'the worker maps the verbs to tabs');

const MISSING = Symbol('missing');
function resolve(scope, p, root) { // a path of an expression, in the scope of the element
    const seg = p.split('.');
    let cur;
    if (seg[0] === '$data') cur = scope; else if (seg[0] === '$root') cur = root; else if (seg[0] === '$host' || seg[0] === '$index') return true; else if (scope && typeof scope === 'object' && !Array.isArray(scope) && seg[0] in scope) cur = scope[seg[0]]; else return MISSING;
    for (const s of seg.slice(1)) { if (cur && typeof cur === 'object' && s in cur) cur = cur[s]; else return MISSING; }
    return cur;
}
function paths(str) { // the paths an expression string uses
    const out = [];
    String(str).replace(/\$\{([^}]*)\}/g, (m, e) => {
        e.replace(/'[^']*'|"[^"]*"/g, '').replace(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g, (t) => { if (!/^(true|false|null)$/.test(t)) out.push(t); });
    });
    return out;
}
function check(node, scope, root, where, used) {
    if (Array.isArray(node)) return node.forEach((n, i) => check(n, scope, root, where + '[' + i + ']', used));
    if (!node || typeof node !== 'object') return;
    let sc = scope;
    if (node.$data !== undefined) {
        const p = paths(node.$data)[0], v = resolve(scope, p, root);
        assert.ok(Array.isArray(v) && v.length > 0, `${where}: $data ${node.$data} must be a non-empty array`);
        sc = v[0]; used.add(p);
    }
    Object.keys(node).forEach((k) => {
        if (k === '$data') return;
        if (typeof node[k] === 'string') paths(node[k]).forEach((p) => {
            const v = resolve(sc, p, root);
            assert.ok(v !== MISSING, `${where}.${k}: ${p} is not in the data`);
            used.add(p);
        });
        else check(node[k], sc, root, where + '.' + k, used);
    });
}
const used = new Set();
['main', 'day', 'month'].forEach((n) => {
    const tpl = json(path.join(WIDGETS, 'uposatha-' + n + '.json'));
    assert.strictEqual(tpl.type, 'AdaptiveCard');
    assert.strictEqual(tpl.version, '1.5', n + ': Adaptive Card 1.5 (the Widgets Board supports 1.5/1.6)');
    assert.ok(/adaptive-card\.json$/.test(tpl.$schema), n + ': schema');
    // every action is Action.Execute (the only one a widget runs) with a verb the worker maps to a tab
    const actions = [];
    (function walk(x) { if (Array.isArray(x)) return x.forEach(walk); if (x && typeof x === 'object') { if (/^Action\./.test(x.type || '')) actions.push(x); Object.values(x).forEach(walk); } })(tpl);
    assert.ok(actions.length >= 1, n + ': at least one action');
    actions.forEach((a) => { assert.strictEqual(a.type, 'Action.Execute', n + ': only Action.Execute'); assert.ok(verbs.includes(a.verb), n + ': verb ' + a.verb + ' is handled by the worker'); });
    assert.ok(actions.length <= 4, n + ': at most 4 touch targets');
    // the three sizes are all there
    const sizes = tpl.body.map((b) => /widgetSize == '(\w+)'/.exec(b.$when || '')).map((m) => m && m[1]);
    assert.deepStrictEqual(sizes, ['small', 'medium', 'large'], n + ': a block for each size');
    [placeholder].concat(models.slice(0, 3), models.slice(-2)).forEach((model, i) => check(tpl.body, model, model, `${n}#${i}.body`, used));
    check(tpl.selectAction, placeholder, placeholder, n + '.selectAction', used);
    console.log('ok   template ' + n + ': AC 1.5, 3 sizes, ' + actions.length + ' action(s), every binding exists');
});

// ---------- 4. the manifest ----------
const manifest = json(path.join(ROOT, 'public/uposatha-calendar.webmanifest'));
assert.ok(Array.isArray(manifest.widgets) && manifest.widgets.length >= 1, 'the manifest has widgets');
const roots = [path.join(ROOT, 'public/overrides'), path.join(ROOT, 'siteroot/assets')]; // /assets is these two, in this order
function fileOf(url) {
    assert.ok(url.startsWith('/assets/'), 'a widget file is served under /assets: ' + url);
    const f = roots.map((r) => path.join(r, url.slice('/assets/'.length))).find((p) => fs.existsSync(p));
    assert.ok(f, 'file exists for ' + url);
    return f;
}
const tags = new Set();
manifest.widgets.forEach((w) => {
    ['name', 'description', 'tag', 'ms_ac_template', 'screenshots'].forEach((k) => assert.ok(w[k], `${w.tag}: ${k} is required`));
    assert.ok(w.template, w.tag + ': "template" is required by the doc (informational)');
    assert.ok(!tags.has(w.tag), 'tags are unique'); tags.add(w.tag);
    assert.ok(w.tag.indexOf('uposatha-') === 0, 'the worker handles tags that begin with uposatha-');
    assert.strictEqual(w.type, 'application/json');
    assert.strictEqual(w.auth, false);
    assert.ok(w.update >= 3600, w.tag + ': update >= 3600 s');
    const tpl = fileOf(w.ms_ac_template); json(tpl);
    json(fileOf(w.data));
    assert.ok(w.screenshots.length >= 1);
    w.screenshots.forEach((s) => {
        const f = fileOf(s.src), b = fs.readFileSync(f);
        assert.strictEqual(b.slice(1, 4).toString(), 'PNG', 'a PNG');
        assert.strictEqual(b.readUInt32BE(16) + 'x' + b.readUInt32BE(20), s.sizes, s.src + ': the declared size is the real one');
        assert.ok(b.readUInt32BE(16) <= 1024 && b.readUInt32BE(20) <= 1024, 'the doc ignores images over 1024');
        assert.ok(s.label, 'screenshots are labelled');
    });
    (w.icons || []).forEach((i) => fs.existsSync(i.src.startsWith('/assets/') ? fileOf(i.src) : path.join(ROOT, 'public', i.src)));
    console.log('ok   manifest widget ' + w.tag + ': ' + w.ms_ac_template + ', data, ' + w.screenshots.length + ' screenshot(s)');
});
assert.ok(manifest.start_url && manifest.scope, 'the PWA has a start_url and a scope');

// ---------- 5. the service worker, as a worker loads it ----------
function worker(settings, online) {
    const calls = { updates: [], sync: [], opened: [], unreg: [] }, handlers = {};
    const sandbox = {
        console: { log() {}, warn() {} }, Intl, Date, JSON, Promise, URL, Response: class { constructor(b, o) { this.body = b; this.o = o; } },
        setTimeout, clearTimeout, Math, Object, Array, String, Number, Error, RegExp, Set, Map, parseFloat, parseInt,
        navigator: { language: 'ru-RU' },
        location: { origin: 'https://test.dhamma.gift' },
        indexedDB: { open() { // enough of IndexedDB for get('widget')
            const rq = {}; rq.result = { createObjectStore() {}, close() {}, transaction: () => ({ objectStore: () => ({ get() { const g = {}; setTimeout(() => { g.result = settings; g.onsuccess(); }); return g; } }) }) };
            setTimeout(() => rq.onsuccess()); return rq; } },
        caches: { keys: () => Promise.resolve([]), delete: () => Promise.resolve(true), open: () => Promise.resolve({ put: () => Promise.resolve(), add: () => Promise.resolve(), match: () => Promise.resolve(undefined) }), match: () => Promise.resolve(undefined) },
        fetch(url) {
            if (!online) return Promise.reject(new Error('offline'));
            url = String(url);
            if (url === '/offline/build-id.json') return Promise.resolve({ ok: false });
            const f = roots.map((r) => path.join(r, String(url).replace(/^\/assets\//, ''))).find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
            if (!f) return Promise.resolve({ ok: false, status: 404 });
            const text = read(f), r = { ok: true, status: 200, type: 'basic', text: () => Promise.resolve(text), json: () => Promise.resolve(JSON.parse(text)) };
            r.clone = () => r; return Promise.resolve(r);
        },
    };
    sandbox.self = sandbox;
    sandbox.addEventListener = (type, fn) => { (handlers[type] = handlers[type] || []).push(fn); };
    sandbox.skipWaiting = () => Promise.resolve();
    sandbox.registration = { periodicSync: { getTags: () => Promise.resolve([]), register: (t, o) => { calls.sync.push([t, o]); return Promise.resolve(); }, unregister: (t) => { calls.unreg.push(t); return Promise.resolve(); } } };
    sandbox.clients = { matchAll: () => Promise.resolve([]), openWindow: (u) => { calls.opened.push(u); return Promise.resolve(); }, claim: () => Promise.resolve() };
    const installed = manifest.widgets.map((w) => ({ definition: { tag: w.tag, msAcTemplate: w.ms_ac_template, data: w.data, update: w.update }, instances: [{ id: 'i-' + w.tag }] }));
    sandbox.widgets = { matchAll: () => Promise.resolve(installed), updateByTag: (tag, payload) => { calls.updates.push([tag, payload]); return Promise.resolve(); }, getByTag: (t) => Promise.resolve(installed.find((w) => w.definition.tag === t)) };
    sandbox.importScripts = (...urls) => urls.forEach((u) => vm.runInContext(read(path.join(ROOT, 'public/overrides', u.replace(/^\/assets\//, ''))), ctx, { filename: u }));
    const ctx = vm.createContext(sandbox);
    vm.runInContext(sw, ctx, { filename: 'service-worker.js' });
    const fire = (type, ev) => { const waits = []; ev.waitUntil = (p) => waits.push(p); (handlers[type] || []).forEach((h) => h(ev)); return Promise.all(waits); };
    return { ctx, calls, fire, installed, handlers };
}
(async () => {
    const saved = { tz: 'Asia/Almaty', loc: { lat: 43.24, lon: 76.89 }, lang: 'en', su: true, lite: true, showKala: true, south: false, noon: 'sun', twi: 'sun' };
    const w = worker(saved, true);
    ['widgetinstall', 'widgetuninstall', 'widgetresume', 'widgetclick', 'periodicsync', 'message', 'activate'].forEach((t) => assert.ok(w.handlers[t], 'the worker listens to ' + t));
    assert.ok(w.ctx.UposathaWidgetData && w.ctx.Astronomy && w.ctx.UposathaCore, 'importScripts gave the worker the builder, the core and the Astronomy library');

    await w.fire('widgetinstall', { widget: w.installed[0] });
    assert.deepStrictEqual(w.calls.sync.map((c) => c[0]), ['uposatha-main'], 'a periodic sync is registered for the widget');
    assert.strictEqual(w.calls.sync[0][1].minInterval, 3600 * 1000, 'minInterval is in ms');
    assert.strictEqual(w.calls.updates.length, 1, 'the installed widget is drawn');
    const [tag, payload] = w.calls.updates[0];
    assert.strictEqual(tag, 'uposatha-main');
    assert.strictEqual(JSON.parse(payload.template).type, 'AdaptiveCard', 'the template is a string of an Adaptive Card');
    const data = JSON.parse(payload.data);
    assert.strictEqual(data.lang, 'en', 'the language is the one the page saved');
    // not the title: on an Uposatha day it is that day's name, and the static placeholder's own title is UPOSATHA
    assert.strictEqual(data.u.mode, 'by the suttas', 'the data was worked out in the worker (the placeholder has no counting)');
    assert.strictEqual(data.u.next.length, 3, 'the next three Uposatha days');
    check(JSON.parse(payload.template).body, data, data, 'worker.main', new Set());

    w.calls.updates.length = 0;
    await w.fire('message', { data: { type: 'upo-widgets-refresh' } });
    assert.deepStrictEqual(w.calls.updates.map((u) => u[0]).sort(), manifest.widgets.map((x) => x.tag).sort(), 'a message from the page redraws every installed widget');

    w.calls.updates.length = 0;
    await w.fire('widgetresume', { widget: w.installed[2] });
    assert.deepStrictEqual(w.calls.updates.map((u) => u[0]), ['uposatha-month'], 'resume redraws that widget');
    w.calls.updates.length = 0;
    await w.fire('periodicsync', { tag: 'uposatha-day' });
    assert.deepStrictEqual(w.calls.updates.map((u) => u[0]), ['uposatha-day'], 'a periodic sync redraws that widget');
    await w.fire('periodicsync', { tag: 'something-else' });
    assert.strictEqual(w.calls.updates.length, 1, 'a foreign sync tag is left alone');

    await w.fire('widgetuninstall', { widget: w.installed[0] });
    assert.deepStrictEqual(w.calls.unreg, ['uposatha-main'], 'the last instance gone: the sync goes');

    await w.fire('widgetclick', { action: 'open-month', widget: w.installed[2].instances[0] });
    await w.fire('widgetclick', { action: 'open-main', widget: w.installed[0].instances[0] });
    await w.fire('widgetclick', { action: 'nothing' });
    assert.deepStrictEqual(w.calls.opened, ['/uposatha-calendar?app=1&source=widget&tab=cal', '/uposatha-calendar?app=1&source=widget&tab=home'], 'a tap opens the page on the tab (unknown verbs are ignored)');

    // the settings never saved (the page not opened yet): the worker still draws, with its own locale
    const w2 = worker(null, true);
    await w2.fire('widgetinstall', { widget: w2.installed[1] });
    assert.strictEqual(JSON.parse(w2.calls.updates[0][1].data).lang, 'ru', 'no saved settings: the locale of the worker');
    // offline with no cache and no data: nothing thrown, nothing drawn
    const w3 = worker(saved, false);
    await w3.fire('widgetinstall', { widget: w3.installed[0] });
    console.log('ok   service worker: install / resume / sync / uninstall / click / message, with the saved settings and without them');
    console.log('uposatha widget: ok');
})().catch((e) => { console.error(e); process.exit(1); });
