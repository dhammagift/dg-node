// The regex search must give the same rows through every database host: the server (node:sqlite), the offline worker (sqlite-wasm
// shape: prepare/bind/step/get, a registered function) and the iOS app (answers whole queries only, SQL without our function).
// Runs the real core and the worker's real shim against dg.db:  node test/regex-offline-shim.js [path-to-dg.db]
const fs = require('fs'), path = require('path'), vm = require('vm');
const { DatabaseSync } = require('node:sqlite');
const dbPath = process.argv[2] || path.join(__dirname, '..', 'dg.db');
const src = fs.readFileSync(process.env.WORKER || path.join(__dirname, '..', 'public/offline/db-worker.js'), 'utf8');
const a = src.indexOf('function nodeSqliteShim'), b = src.indexOf('// Streams the database straight into OPFS');
const nodeSqliteShim = new Function(src.slice(a, b) + '; return nodeSqliteShim;')();

function fresh() { delete require.cache[require.resolve('../core/search-core.js')]; return require('../core/search-core.js'); }
const raw = new DatabaseSync(dbPath, { readOnly: true });
const skeleton = {};
for (const r of raw.prepare('SELECT id, category, dir_path, title, mr FROM suttas').all()) skeleton[r.id] = r;

function oo1(db) {   // what sqlite-wasm's oo1 gives the shim
    return {
        selectObjects: (sql, p) => db.prepare(sql).all(...(p || [])),
        selectObject: (sql, p) => db.prepare(sql).get(...(p || [])),
        createFunction: (name, fn, o) => db.function(name, { deterministic: !!o.deterministic }, (...args) => fn(null, ...args)),
        prepare: (sql) => { const st = db.prepare(sql); let it, params = []; return {
            bind(p) { params = p; }, step() { it = it || st.iterate(...params); const n = it.next(); this.row = n.value; return !n.done; },
            get() { return this.row; }, finalize() { if (it && it.return) it.return(); } }; },
    };
}
function native(db) { // the iOS handle: whole queries only, no function of ours, no prepare
    return { selectObjects: (sql, p) => db.prepare(sql).all(...(p || [])), selectObject: (sql, p) => db.prepare(sql).get(...(p || [])), createFunction() {}, jsRegexp: true };
}
const modes = {
    server: () => ({ searchDb: raw }),
    'offline worker (sqlite-wasm shape)': () => ({ searchDb: nodeSqliteShim(oo1(raw)) }),
    'iOS (native SQL, JS RegExp)': () => ({ searchDb: nodeSqliteShim(native(raw)) }),
};
const queries = ['Kata.*, dukkhaṁ\\?', 'duk+ha', 'kacchap(a|ā)', '^Katamā', 'bhikkhave\\s+dukkh'];
(async () => {
    let bad = 0;
    for (const q of queries) {
        const seen = {};
        for (const [name, mk] of Object.entries(modes)) {
            const core = fresh(); core.init({ ...mk(), DG_OFFLINE: '/nonexistent' }); core.setSkeleton(skeleton);
            let out;
            try {
                const r = await core.runRegexJob({ kind: 'fast', keyword: q, scope: 'dhamma', exact: false, langs: ['pi'], lb: 0, la: 0 });
                const ids = Object.keys((r.suttas || r.results || r) || {}).length;
                out = JSON.stringify(r).length + ':' + ids;
            } catch (e) { out = 'ERROR ' + e.message; }
            seen[name] = out;
        }
        const vals = new Set(Object.values(seen));
        const same = vals.size === 1;   // an identical refusal everywhere (a pattern the site refuses) is parity too
        console.log(same ? 'PASS' : 'FAIL', JSON.stringify(q), same ? [...vals][0].slice(0, 70) : JSON.stringify(seen));
        if (!same) bad++;
    }
    process.exit(bad ? 1 : 0);
})();
