// The files the Uposatha calendar page loads, read from this checkout: no server, no browser.
// The Uposatha app (dg-apps, uposatha/tools/bundle-from-repo.js) bundles exactly this list, so a
// file the page starts to load is in the next app build without anyone keeping a list by hand.
//
//   node scripts/uposatha-files.js [dir]      -> JSON [{ url, file }] (file: path relative to the checkout)
//   require('./scripts/uposatha-files.js').pageFiles(dir) -> the same, file: null when it is not there
//
// What is followed, starting at public/uposatha-calendar.html:
//   html  src/href of every tag but <a> (an <a> leads to another page), and asset paths in its inline scripts
//   css   url(...)
//   js    string literals that are asset paths ('/assets/sounds/gong.mp3', "/assets/js/quickModal.js?v=1");
//         "{lang}" in one ("/nodejs/res/lang_{lang}.json") stands for every language that has the file
// plus EXTRAS (names a script builds at run time) and minus SKIP (what shared scripts load for other pages).
// A URL is resolved the way dg-fastify.js mounts it (HTML_ASSET_URL_ROOTS, the same order of roots).
// The CLI exits 1 when a file is not in the checkout; pageFiles() returns it with file: null, so the
// app's build can take it from its own pinned copies (files this repository does not keep in git:
// the generated settings/scripts.json and fontawesome-local.js, the legacy sounds/gong.mp3).
const fs = require('fs');
const path = require('path');

const PAGE = '/uposatha-calendar.html';
// dg-fastify.js: HTML_ASSET_URL_ROOTS, and the two files it serves from public/ by name.
const ROOTS = {
    '/assets': ['public/overrides', 'siteroot/assets'],
    '/nodejs/res': ['search', 'configs/search'],
    '/settings': ['settings'],
};
const FILES = { [PAGE]: 'public/uposatha-calendar.html', '/uposatha-calendar.webmanifest': 'public/uposatha-calendar.webmanifest' };
// Built at run time: uposatha-calendar.js plays '/assets/audio/parts/' + PART_KEYS[i] + '.mp3'. A directory: every file in it.
const EXTRAS = ['/assets/audio/parts/'];
// settings.js, autopali.js and home.js are shared with the search page and the reader, and name in strings what those
// pages load on demand. Not part of the calendar (a prefix ending in / is a directory):
const SKIP = [
    '/assets/js/paliLookup.js',          // the word lookup popup, and the offline dictionary it loads (25 MB)
    '/assets/js/standalone-dpd/',
    '/assets/js/pdfmake.min.js',         // the reader's PDF export (4.4 MB with its fonts)
    '/assets/js/vfs_fonts.js',
    '/assets/texts/sutta_words.txt',     // the search box's word suggestions (1.6 MB)
    '/assets/common/',                   // the reader's SuttaCentral modals (the legacy tree, not in this repository)
    '/assets/img/albumart512.png',       // a web notification's icon and badge (home.js); the app notifies natively
    '/assets/img/dgsanhkalogo_sqare.png',
];

const ASSET = '\\/(?:assets|nodejs\\/res|settings)\\/[A-Za-z0-9_\\-./{}]+\\.[A-Za-z0-9]+';
const LITERAL = () => new RegExp('[\'"](' + ASSET + ')(?=[\'"?#])', 'g');
const REFS = {
    html: [/<(?!a[\s>])[a-z]+\b[^>]*?\s(?:src|href)="(\/[^"?#]*)/gi, LITERAL()],
    css: [/url\(\s*['"]?(\/[^'")?#]+)/g],
    js: [LITERAL()],
};

// The checkout-relative candidates for a URL, in dg-fastify.js's order.
function candidates(url) {
    if (FILES[url]) return [FILES[url]];
    const prefix = Object.keys(ROOTS).find((p) => url.startsWith(p + '/'));
    return prefix ? ROOTS[prefix].map((r) => path.join(r, url.slice(prefix.length))) : [];
}

function find(dir, url, isDir) {
    return candidates(url).find((f) => {
        try { return fs.statSync(path.join(dir, f))[isDir ? 'isDirectory' : 'isFile'](); } catch (e) { return false; }
    }) || null;
}

// "/nodejs/res/lang_{lang}.json" -> every lang_*.json the roots have.
function expandLang(dir, url) {
    if (!url.includes('{lang}')) return [url];
    const slash = url.lastIndexOf('/') + 1;
    const [before, after] = url.slice(slash).split('{lang}');
    const names = new Set();
    for (const folder of candidates(url.slice(0, slash))) {
        let list = [];
        try { list = fs.readdirSync(path.join(dir, folder)); } catch (e) { continue; }
        for (const n of list) if (n.startsWith(before) && n.endsWith(after) && /^[a-z]{2}$/.test(n.slice(before.length, n.length - after.length))) names.add(n);
    }
    return names.size ? [...names].sort().map((n) => url.slice(0, slash) + n) : [url];
}

function pageFiles(dir = path.join(__dirname, '..')) {
    const out = new Map();
    const queue = [PAGE];
    for (const extra of EXTRAS) {
        const folder = find(dir, extra, true);
        if (!folder) { out.set(extra, null); continue; }
        for (const name of fs.readdirSync(path.join(dir, folder)).sort()) queue.push(extra + name);
    }
    while (queue.length) {
        const url = queue.shift();
        if (out.has(url) || SKIP.some((s) => (s.endsWith('/') ? url.startsWith(s) : url === s))) continue;
        const file = find(dir, url, false);
        out.set(url, file);
        const kind = file && path.extname(file).slice(1);
        if (!REFS[kind]) continue;
        const text = fs.readFileSync(path.join(dir, file), 'utf8');
        for (const re of REFS[kind]) for (const m of text.matchAll(re)) if (candidates(m[1]).length) queue.push(...expandLang(dir, m[1]));
    }
    return [...out].map(([url, file]) => ({ url, file })).sort((a, b) => (a.url < b.url ? -1 : 1));
}

if (require.main === module) {
    const files = pageFiles(path.resolve(process.argv[2] || path.join(__dirname, '..')));
    const missing = files.filter((f) => !f.file);
    console.log(JSON.stringify(files, null, 1));
    if (missing.length) { console.error('uposatha-files: not in this checkout: ' + missing.map((f) => f.url).join(', ')); process.exit(1); }
}
module.exports = { pageFiles, candidates, SKIP };
