// Our own scripts as the site serves them: minified by terser without compress or mangle - the same
// statements in the same order, only without comments and whitespace - with a source map beside them.
// Shared by dg-fastify.js, which serves them, and scripts/site-manifest.js: the apps' signed list has to
// name the bytes the site sends, not the file on disk.
'use strict';
const fs = require('fs');
const path = require('path');
const { minify_sync } = require('terser');

const REPO = path.join(__dirname, '..');
// URL prefix -> folder (top level only), as dg-fastify.js mounts them
const MIN_JS_DIRS = {
    '/assets/js': 'public/overrides/js',
    '/spa': 'public/spa',
    '/reader': 'reader',
    '/nodejs/res/js': 'search/js',
    '/offline': 'public/offline',
};

// Not the vendor files: already minified, or (pdfmake's fonts, the full FontAwesome) megabytes only a rare click loads.
function servedMinified(name, size) {
    return name.endsWith('.js') && !name.endsWith('.min.js') && name !== 'datatables-slim.js' && size < 1e6;
}

// Is this file on disk one the site sends minified? Any dg-node checkout (the dict's list names prod's).
function isMinifiedFile(abs) {
    const dir = path.dirname(abs);
    return Object.values(MIN_JS_DIRS).some(d => dir.endsWith(path.sep + d.split('/').join(path.sep))
        && fs.existsSync(path.join(dir.slice(0, -d.length - 1), 'dg-fastify.js')))
        && servedMinified(path.basename(abs), fs.statSync(abs).size);
}

// -> { code, map }; throws on what terser cannot parse (an ES module): such a file is sent as it is
function minifyJs(source, name) {
    const r = minify_sync({ [name]: source }, {
        compress: false, mangle: false, format: { comments: false },
        sourceMap: { filename: name, url: name + '.map', includeSources: true },
    });
    return { code: r.code, map: r.map };
}

// The bytes the site sends for this file (site-manifest.js)
function servedBytes(abs) {
    const buf = fs.readFileSync(abs);
    if (!isMinifiedFile(abs)) return buf;
    try { return Buffer.from(minifyJs(buf.toString('utf8'), path.basename(abs)).code); } catch { return buf; }
}

module.exports = { REPO, MIN_JS_DIRS, servedMinified, isMinifiedFile, minifyJs, servedBytes };
