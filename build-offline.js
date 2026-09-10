#!/usr/bin/env node
// build-offline.js — produces everything the optional offline PWA layer needs at runtime, into
// public/offline/ (see docs/OFFLINE_PWA_PLAN.md, Stage 1):
//
//   1. vendor/sqlite-wasm/{index.js,sqlite3.wasm,sqlite3-opfs-async-proxy.js}
//      — copied from node_modules, not committed: same source-of-truth reasoning as
//      build-icons.js (fontawesome-local.js) and dblight.js (dg_db_light.json).
//   2. core-bundle.js — the site's own core/search-core.js reshaped to run inside the data
//      worker. Ported from dg-app-full/build-core-bundle.js, which built it inside the app; the
//      app now consumes dg-node's output instead. The three substitutions it makes (config JSON
//      inlined, READER_LANGS scanned at build time, module.exports -> a global) are the whole
//      difference between "runs on the server" and "runs in a browser".
//   3. build-id.json — a content hash of the offline layer, read by public/service-worker.js to
//      version its shell cache. Without it the SW has no way to know a deploy changed anything
//      (the lesson from the legacy cache-first worker: a cache name nobody ever bumps).
//
// Usage: npm run build-offline      (run it after changing core/search-core.js or any file here)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const OFFLINE = path.join(ROOT, 'public', 'offline');
const VENDOR = path.join(OFFLINE, 'vendor', 'sqlite-wasm');

// What the SW versions its cache by. Every file the offline layer actually serves is part of the
// hash, so a change to the shim, the worker or the core invalidates the cached shell copies of
// them; the wasm is hashed by size+name rather than content (865 KB read per build for a value
// that only ever changes when the npm dependency does is not worth it).
const HASHED_FILES = [
    path.join(OFFLINE, 'app.js'),
    path.join(OFFLINE, 'db-worker.js'),
    path.join(OFFLINE, 'offline-status.js'),
    path.join(OFFLINE, 'offline-library-settings.js'),
    path.join(OFFLINE, 'core-bundle.js'),
];

// path.join, and only join: see build-core-bundle.js in dg-app-full for why the core needs it —
// it decides which tree a translation came from by looking at a path, so the offline core
// synthesises one from DG_OFFLINE and only ever joins strings with a slash.
const PATH_SHIM = `// path.join, and only join: the core uses it to tell translation sources apart by path.
const path = { join: (...parts) => parts.filter(Boolean).join('/').replace(/\\/{2,}/g, '/') };
`;
const ALLOWED_PATH_METHODS = ['join'];

function copyVendor() {
    const from = path.join(ROOT, 'node_modules', '@sqlite.org', 'sqlite-wasm', 'dist');
    if (!fs.existsSync(from)) {
        throw new Error(`@sqlite.org/sqlite-wasm not installed (${from} missing) — run npm install first`);
    }
    // index.mjs lands RENAMED as index.js. A browser accepts a module only when it arrives with a
    // JavaScript MIME type, and "mjs" is missing from more MIME tables than you would hope
    // (Android's MimeTypeMap being the one that actually bit this project: the worker failed to
    // start, taking every search and reader request with it). Nothing inside the file refers to
    // its own name — it locates the .wasm and the async proxy through import.meta.url.
    const FILES = {
        'index.mjs': 'index.js',
        'sqlite3.wasm': 'sqlite3.wasm',
        'sqlite3-opfs-async-proxy.js': 'sqlite3-opfs-async-proxy.js',
    };
    fs.mkdirSync(VENDOR, { recursive: true });
    for (const [name, as] of Object.entries(FILES)) {
        const src = path.join(from, name);
        if (!fs.existsSync(src)) throw new Error(`sqlite-wasm is missing ${name} — package layout changed?`);
        fs.copyFileSync(src, path.join(VENDOR, as));
    }
    console.log(`vendor:    ${path.relative(ROOT, VENDOR)} (${Object.values(FILES).join(', ')})`);
}

function buildCoreBundle() {
    const src = path.join(ROOT, 'core', 'search-core.js');
    if (!fs.existsSync(src)) throw new Error(`${src} not found — nothing to bundle`);
    let code = fs.readFileSync(src, 'utf8');

    // --- configs: inline the JSON the core requires -------------------------------------------
    const configRe = /const (\w+) = require\('\.\.\/configs\/([^']+)'\);/g;
    const inlined = [];
    code = code.replace(configRe, (_, name, rel) => {
        const json = fs.readFileSync(path.join(ROOT, 'configs', rel), 'utf8').trim();
        inlined.push(rel);
        return `const ${name} = ${json};`;
    });
    if (!inlined.length) throw new Error('no config requires found — has the core changed shape?');

    // --- READER_LANGS: the core scans configs/reader/ for lang_*.json -------------------------
    const readerDir = path.join(ROOT, 'configs', 'reader');
    const readerLangs = fs.readdirSync(readerDir)
        .filter(n => /^lang_[a-z]+\.json$/.test(n))
        .map(n => n.match(/^lang_([a-z]+)\.json$/)[1])
        .sort();
    const langsRe = /const READER_LANGS = fsSync\.readdirSync\([\s\S]*?\.sort\(\);/;
    if (!langsRe.test(code)) throw new Error('READER_LANGS scan not found — has the core changed shape?');
    code = code.replace(langsRe,
        `const READER_LANGS = ${JSON.stringify(readerLangs)}; // computed at build time by build-offline.js`);

    // --- the two node requires the core opens with --------------------------------------------
    code = code
        .replace("const fsSync = require('fs');\n", '')
        .replace("const path = require('path');\n", '');

    // Whatever is left must not reach for Node. Checked rather than hoped: a require() surviving
    // into the bundle is a blank screen in the browser, discovered late and far from here.
    const leftoverRequire = code.match(/\brequire\s*\(/);
    if (leftoverRequire) {
        const line = code.slice(0, code.indexOf(leftoverRequire[0])).split('\n').length;
        throw new Error(`core/search-core.js still calls require() at line ${line} of the bundle — add it to the shim above`);
    }
    if (/\bfsSync\./.test(code)) {
        throw new Error('core/search-core.js still uses fsSync.* after bundling — it cannot run in a browser');
    }
    for (const m of code.matchAll(/\bpath\.(\w+)\(/g)) {
        if (!ALLOWED_PATH_METHODS.includes(m[1])) {
            throw new Error(`core/search-core.js uses path.${m[1]}(), which the bundle does not shim — add it or change the core`);
        }
    }

    // --- exports -> a global -------------------------------------------------------------------
    const exportsRe = /module\.exports = \{([\s\S]*?)\};\s*$/;
    if (!exportsRe.test(code)) throw new Error('module.exports block not found — has the core changed shape?');
    code = code.replace(exportsRe, (_, names) => `return {${names}};`);

    const stamp = new Date().toISOString();
    const out =
`// GENERATED — do not edit. Built by build-offline.js from core/search-core.js.
// Source: ${src}
// Built:  ${stamp}
// Configs inlined: ${inlined.join(', ')}
// READER_LANGS: ${readerLangs.join(', ')}
//
// This is the site's own search core, running in the browser over the offline database. Editing
// it here would fork the search a second time — change core/search-core.js and rebuild.
const DG_SEARCH_CORE = (function () {
${PATH_SHIM}
${code}
})();

export default DG_SEARCH_CORE;
// Also on the global, so a plain <script type="module"> can reach it too.
if (typeof self !== 'undefined') self.DG_SEARCH_CORE = DG_SEARCH_CORE;
`;

    fs.mkdirSync(OFFLINE, { recursive: true });
    const dest = path.join(OFFLINE, 'core-bundle.js');
    fs.writeFileSync(dest, out);
    console.log(`core:      ${path.relative(ROOT, dest)} (${(out.length / 1024).toFixed(1)} KB, ` +
        `configs: ${inlined.length}, reader langs: ${readerLangs.length})`);
}

function writeBuildId() {
    const hash = crypto.createHash('sha256');
    for (const file of HASHED_FILES) {
        if (!fs.existsSync(file)) continue;
        hash.update(path.basename(file));
        hash.update(fs.readFileSync(file));
    }
    for (const name of fs.readdirSync(VENDOR).sort()) {
        hash.update(name + ':' + fs.statSync(path.join(VENDOR, name)).size);
    }
    const build_id = hash.digest('hex').slice(0, 12);
    const dest = path.join(OFFLINE, 'build-id.json');
    fs.writeFileSync(dest, JSON.stringify({ build_id, built_at: new Date().toISOString() }, null, 2) + '\n');
    console.log(`build id:  ${build_id} -> ${path.relative(ROOT, dest)}`);
    return build_id;
}

copyVendor();
buildCoreBundle();
writeBuildId();
