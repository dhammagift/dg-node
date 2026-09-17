// Self-check for the label-editor authorisation (dg-fastify.js: verifyLblToken + the
// POST /assets/lbl-save.php gate). Runs the real server on its own port with DG_FIREBASE_JWKS_URL
// pointing at a stub that serves a locally generated key, signs tokens with that key and asserts
// what the endpoint answers: a listed e-mail saves, everything else is refused with a reason.
//
//   node test/lbl-auth.cjs
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const APP_PORT = 3011, JWKS_PORT = 3012;
const ROOT = path.join(__dirname, '..');
const projectId = JSON.parse(fs.readFileSync(path.join(ROOT, 'configs/local/sync-config.json'), 'utf8')).projectId;
const author = JSON.parse(fs.readFileSync(path.join(ROOT, 'configs/local/lbl-authors.json'), 'utf8')).authors[0];

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = 'self-check-key';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sign(payload, { key = privateKey, kidOverride = kid } = {}) {
    const head = b64({ alg: 'RS256', kid: kidOverride, typ: 'JWT' });
    const body = b64(payload);
    const sig = crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), key).toString('base64url');
    return head + '.' + body + '.' + sig;
}
const now = Math.floor(Date.now() / 1000);
const claims = (over = {}) => ({
    aud: projectId, iss: 'https://securetoken.google.com/' + projectId, sub: 'x',
    exp: now + 600, iat: now, email: author, email_verified: true, ...over,
});

const jwksServer = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
});

function post(token, filename, body = '{"x":1}') {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: APP_PORT, method: 'POST',
            path: '/assets/lbl-save.php?file=' + encodeURIComponent(filename),
            headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) } },
            (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
        req.on('error', reject);
        req.end(body);
    });
}
const waitFor = async (port) => {
    for (let i = 0; i < 100; i++) {
        const up = await new Promise(r => http.get({ host: '127.0.0.1', port, path: '/' }, res => { res.resume(); r(true); }).on('error', () => r(false)));
        if (up) return;
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('server on ' + port + ' never came up');
};

(async () => {
    await new Promise(r => jwksServer.listen(JWKS_PORT, '127.0.0.1', r));
    const server = spawn(process.execPath, ['dg-fastify.js'], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(APP_PORT), DG_FIREBASE_JWKS_URL: `http://127.0.0.1:${JWKS_PORT}/jwks` },
        stdio: ['ignore', 'ignore', 'inherit'],
    });
    const testFile = 'self-check-' + Date.now() + '.json';
    const savedPath = path.join('/var/www/offline-data', 'lbl', testFile);
    const stranger = 'stranger@example.com';
    const cases = [
        ['valid author', sign(claims()), 200],
        ['no token', null, 401],
        ['unknown e-mail', sign(claims({ email: stranger })), 403],
        ['unverified e-mail', sign(claims({ email_verified: false })), 403],
        ['expired', sign(claims({ exp: now - 10 })), 401],
        ['wrong aud', sign(claims({ aud: 'someone-else' })), 401],
        ['unknown kid', sign(claims(), { kidOverride: 'nope' }), 401],
    ];
    let failed = 0;
    try {
        await waitFor(APP_PORT);
        for (const [name, token, want] of cases) {
            const got = await post(token, testFile);
            const ok = got.status === want;
            if (!ok) failed++;
            console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(18)} ${got.status} (want ${want}) ${got.status === 200 ? '' : got.body}`);
        }
        // tampered signature: flip the last character
        const good = sign(claims());
        const bad = good.slice(0, -2) + (good.slice(-2, -1) === 'A' ? 'B' : 'A') + good.slice(-1);
        const tampered = await post(bad, testFile);
        const tamperedOk = tampered.status === 401;
        if (!tamperedOk) failed++;
        console.log(`${tamperedOk ? 'PASS' : 'FAIL'}  tampered signature ${tampered.status} (want 401)`);
        // body limit: 3MB JSON must be refused (413), not written
        const big = await post(sign(claims()), testFile, '{"x":"' + 'a'.repeat(3 * 1024 * 1024) + '"}');
        const bigOk = big.status === 413;
        if (!bigOk) failed++;
        console.log(`${bigOk ? 'PASS' : 'FAIL'}  oversized body     ${big.status} (want 413)`);
        // the authorised save really landed on disk
        const wrote = fs.existsSync(savedPath);
        if (!wrote) failed++;
        console.log(`${wrote ? 'PASS' : 'FAIL'}  file written       ${savedPath}`);
        const log = fs.existsSync(path.join(ROOT, 'logs/lbl-saves.log'))
            && fs.readFileSync(path.join(ROOT, 'logs/lbl-saves.log'), 'utf8').includes(author);
        console.log(`${log ? 'PASS' : 'INFO'}  audit log has the author`);
    } finally {
        server.kill();
        jwksServer.close();
        try { fs.unlinkSync(savedPath); } catch {}
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
    process.exit(failed ? 1 : 0);
})();
