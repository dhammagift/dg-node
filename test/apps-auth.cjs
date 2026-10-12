// Self-check for the owner's /apps board (dg-fastify.js: /api/apps-status). Same approach as
// test/lbl-auth.cjs: the real server on its own port, Google's keys replaced by a local stub, tokens
// signed here. A listed e-mail gets the store status rows; anyone else is refused.
//
//   node test/apps-auth.cjs
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const APP_PORT = 3013, JWKS_PORT = 3014;
const ROOT = path.join(__dirname, '..');
const projectId = JSON.parse(fs.readFileSync(path.join(ROOT, 'configs/local/sync-config.json'), 'utf8')).projectId;
const owner = JSON.parse(fs.readFileSync(path.join(ROOT, 'configs/local/apps-admins.json'), 'utf8')).emails[0];

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = 'self-check-key';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
function sign(over = {}) {
    const head = b64({ alg: 'RS256', kid, typ: 'JWT' });
    const body = b64({ aud: projectId, iss: 'https://securetoken.google.com/' + projectId, sub: 'x',
        exp: now + 600, iat: now, email: owner, email_verified: true, ...over });
    return head + '.' + body + '.' + crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), privateKey).toString('base64url');
}
const jwksServer = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ keys: [jwk] })); });

function get(token, p = '/api/apps-status') {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: APP_PORT, path: p, headers: token ? { Authorization: 'Bearer ' + token } : {} }, (res) => {
            const chunks = []; res.on('data', (c) => chunks.push(c));
            res.on('end', () => { const buf = Buffer.concat(chunks); resolve({ status: res.statusCode, body: buf.toString('latin1'), size: buf.length, type: res.headers['content-type'] || '' }); });
        }).on('error', reject);
    });
}
const waitFor = async () => {
    for (let i = 0; i < 100; i++) {
        const up = await new Promise(r => http.get({ host: '127.0.0.1', port: APP_PORT, path: '/' }, res => { res.resume(); r(true); }).on('error', () => r(false)));
        if (up) return;
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('server never came up');
};

(async () => {
    await new Promise(r => jwksServer.listen(JWKS_PORT, '127.0.0.1', r));
    const server = spawn(process.execPath, ['dg-fastify.js'], {
        cwd: ROOT, env: { ...process.env, PORT: String(APP_PORT), DG_FIREBASE_JWKS_URL: `http://127.0.0.1:${JWKS_PORT}/jwks` },
        stdio: ['ignore', 'ignore', 'inherit'],
    });
    let failed = 0;
    try {
        await waitFor();
        const cases = [
            ['owner', sign(), 200],
            ['no token', null, 401],
            ['stranger', sign({ email: 'stranger@example.com' }), 403],
            ['unverified', sign({ email_verified: false }), 403],
        ];
        for (const [name, token, want] of cases) {
            const r = await get(token);
            let ok = r.status === want;
            if (ok && want === 200) ok = Array.isArray(JSON.parse(r.body).rows) && JSON.parse(r.body).rows.length > 0;
            console.log((ok ? 'ok   ' : 'FAIL ') + name + ': ' + r.status + (ok ? '' : ' ' + r.body.slice(0, 200)));
            if (!ok) failed++;
        }
        // "Скачать APK": the newest dictionary APK artifact of dg-apps comes back as an APK (a zip starting with PK), not to strangers.
        const arts = await (await fetch('https://api.github.com/repos/dhammagift/dg-apps/actions/artifacts?per_page=100', {
            headers: { Authorization: 'Bearer ' + fs.readFileSync('/root/.secrets/github-token', 'utf8').trim(), 'User-Agent': 'dg-node' } })).json();
        const art = (arts.artifacts || []).find(a => /^dg-dict-apk-release-\d+$/.test(a.name) && !a.expired);
        if (art) {
            const r = await get(sign(), '/api/apps-apk/' + art.id);
            const ok = r.status === 200 && /android\.package-archive/.test(r.type) && r.size > 500000 && r.body.startsWith('PK');
            console.log((ok ? 'ok   ' : 'FAIL ') + 'apk ' + art.name + ': ' + r.status + ' ' + r.size + ' bytes');
            if (!ok) failed++;
            const s2 = await get(sign({ email: 'stranger@example.com' }), '/api/apps-apk/' + art.id);
            console.log((s2.status === 403 ? 'ok   ' : 'FAIL ') + 'apk to a stranger: ' + s2.status);
            if (s2.status !== 403) failed++;
        }
    } finally {
        server.kill(); jwksServer.close();
    }
    process.exit(failed ? 1 : 0);
})();
