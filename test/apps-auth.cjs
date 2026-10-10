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

function get(token) {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: APP_PORT, path: '/api/apps-status', headers: token ? { Authorization: 'Bearer ' + token } : {} }, (res) => {
            let body = ''; res.on('data', (c) => (body += c)); res.on('end', () => resolve({ status: res.statusCode, body }));
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
    } finally {
        server.kill(); jwksServer.close();
    }
    process.exit(failed ? 1 : 0);
})();
