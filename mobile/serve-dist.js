// Standalone static file server for mobile/dist/*.db — deliberately separate from dg-light.js
// (own process, own port, zero shared code) so the offline app's DB downloads stay decoupled
// from the live web search server. Run: node serve-dist.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2]) || 8090;
const DIST_DIR = path.join(__dirname, 'dist');

http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.replace(/^\/+/, ''));
    if (!/^[a-z0-9_.-]+\.db$/i.test(name)) {
        res.writeHead(404).end('not found');
        return;
    }
    const filePath = path.join(DIST_DIR, name);
    fs.stat(filePath, (err, stat) => {
        if (err) {
            res.writeHead(404).end('not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': stat.size,
        });
        fs.createReadStream(filePath).pipe(res);
    });
}).listen(PORT, () => {
    console.log(`Serving ${DIST_DIR} on http://0.0.0.0:${PORT}/<name>.db`);
});
