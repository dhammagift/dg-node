// The app's own static server, with the two behaviours that matter for these checks:
//
//  - default: what Capacitor actually does. A path with no file behind it (a pushState route such as
//    /dn22:2.2, or a file the build forgot to copy) is answered with the root index.html. That is
//    why a missing page does not look like a 404 in the app — it looks like the search page.
//  - --strict: exactly one difference — a missing file under an asset extension is a 404 instead of
//    index.html, so a check can tell "not copied" from "served". The page checks use this to catch
//    the failure mode early rather than through its symptoms.
//
// /mobile-data/* is served from this checkout's siteroot/mobile-data (the same artifact the site
// publishes), which is what db-worker.js downloads.
const http = require('http');
const fs = require('fs');
const path = require('path');

const [, , WWW, DIST, PORT_ARG] = process.argv;
const PORT = +(PORT_ARG || 8099);
const STRICT = process.argv.includes('--strict');

const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = url.startsWith('/mobile-data/')
        ? path.join(DIST, url.slice('/mobile-data/'.length))
        : path.join(WWW, url);

    const exists = fs.existsSync(file) && !fs.statSync(file).isDirectory();
    if (exists) {
        res.writeHead(200, {
            'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
            'Content-Length': fs.statSync(file).size,
        });
        fs.createReadStream(file).pipe(res);
        return;
    }

    if (STRICT && /\.(js|css|json|woff2?|svg|png|wasm|html)$/.test(url)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
        return;
    }

    // Capacitor's fallback: the SPA shell for anything it does not have.
    const index = path.join(WWW, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(index).pipe(res);
}).listen(PORT, () => console.log('app server on', PORT, STRICT ? '(strict)' : ''));
