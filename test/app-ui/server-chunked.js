// The database host as the DEVICE sees it: chunked, i.e. no Content-Length.
//
// That is not a hypothetical. The app's first real downloads came from a deployment that served
// dg-mobile.db without Content-Length, and the progress card then had no denominator at all — the
// bar slid from side to side with no percentage and no "X of Y MB", on the page and in the status-bar
// notification (owner: "нет общего колва мб файла... юзер вообще не знает сколько ждать"). The
// worker now falls back to the manifest's size; this server is how that fallback is kept honest.
//
// The manifest (db-manifest.json) is still served normally: that is where the size comes from.
const http = require('http');
const fs = require('fs');
const path = require('path');

const [, , WWW, DIST, PORT_ARG] = process.argv;
const PORT = +(PORT_ARG || 8097);

const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);

    if (url.startsWith('/mobile-data/')) {
        const name = url.slice('/mobile-data/'.length);
        const file = path.join(DIST, name);
        if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
        if (name.endsWith('.db')) {
            // The point of this server: chunked, no Content-Length, no Accept-Ranges.
            res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Transfer-Encoding': 'chunked' });
            fs.createReadStream(file, { highWaterMark: 1 << 20 }).pipe(res);
            return;
        }
        const body = fs.readFileSync(file);
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/json', 'Content-Length': body.length });
        res.end(body);
        return;
    }

    const file = path.join(WWW, url);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(path.join(WWW, 'index.html')).pipe(res);
        return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': fs.statSync(file).size });
    fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('chunked server on', PORT));
