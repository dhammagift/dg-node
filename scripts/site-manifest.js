#!/usr/bin/env node
// The signed list of this site's files that the apps (Dhamma.Gift, Uposatha, Dict) may take without a new build: dg-apps
// src/site-updater.js reads SITE/app-site-manifest.json, checks the signature with the public key built into the apps, takes
// nothing unless the site's history contains the commit the app was built from, and takes only files whose SHA-256 is
// listed here. No list, an old list or a bad signature = the apps take nothing (they keep their own copies).
//
// Run AFTER every deploy (git pull + pm2 restart: the server regenerates some files, the bundles, at start):
//   node scripts/site-manifest.js --origin https://dhamma.gift            (prod;  writes ./app-site-manifest.json)
//   node scripts/site-manifest.js --origin https://test.dhamma.gift       (test)
// Another site (dict.dhamma.gift, a static tree) names its own roots, its git checkout and where the list goes:
//   node scripts/site-manifest.js --origin https://dict.dhamma.gift --git /var/www/ddg-ui --out /var/www/ddg-ui/app-site-manifest.json \
//        --root /=/var/www/ddg-ui --root https://dhamma.gift/assets/=/var/www/dg-node-prod/public/overrides
// --key: the private key (default /root/.secrets/site-manifest-signing.pem; never copied anywhere, never printed).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { servedBytes } = require('../core/min-js');

const REPO = path.join(__dirname, '..');
const args = process.argv.slice(2);
function opt(name, fallback) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; }
function opts(name) { return args.flatMap((a, i) => (a === '--' + name ? [args[i + 1]] : [])); }

const ORIGIN = opt('origin', 'https://dhamma.gift');
const KEY = opt('key', '/root/.secrets/site-manifest-signing.pem');
const GIT = opt('git', REPO);
const OUT = opt('out', path.join(REPO, 'app-site-manifest.json'));
// URL prefix -> directories, first one wins (dg-fastify.js mounts these the same way: public/overrides before the legacy tree).
const ROOTS = opts('root').length
    ? opts('root').map((r) => { const at = r.indexOf('='); return [r.slice(0, at), [r.slice(at + 1)]]; })
    : [
        ['/assets/', ['public/overrides', 'siteroot/assets']],
        // Not siteroot/read: /read misses go through proxyToOld, which the test host does not answer (a listed file that does
        // not come stops the whole update in the app).
        ['/read/', ['public/overrides/read']],
        ['/reader/', ['reader', 'configs/reader']],
        ['/nodejs/res/', ['search', 'configs/search']],
        ['/settings/', ['settings']],
    ].map(([prefix, dirs]) => [prefix, dirs.map((d) => path.join(REPO, d))]);
const TYPES = /\.(js|mjs|css|svg|png|webp|ico|woff2?|json|mp3|html)$/;
const SKIP_DIRS = new Set(['texts', 'shots', 'bak', 'unusedcode', 'node_modules']);
// Answered by a route of their own, not by the file on disk (dg-fastify.js): never listed, so never taken.
const ROUTED = new Set(['/reader/mode-table.json', '/assets/js/translators.json']);
const MAX_BYTES = 8 * 1024 * 1024;   // DgSite.put's limit

const hashes = {};
for (const [prefix, dirs] of ROOTS) {
    for (const dir of dirs) {
        (function walk(abs, rel) {
            let entries;
            try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch (e) { return; }
            for (const e of entries) {
                if (e.name.startsWith('.')) continue;
                const a = path.join(abs, e.name);
                let st;
                try { st = fs.statSync(a); } catch (err) { continue; }   // a dangling link
                if (st.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(a, rel + e.name + '/'); continue; }
                const url = prefix + rel + e.name;
                if (!TYPES.test(e.name) || st.size > MAX_BYTES || ROUTED.has(url) || url in hashes) continue;
                // Pages served by dg-fastify rewrite their links (cache-busters), so only a static site's pages are listed.
                if (e.name.endsWith('.html') && !opts('root').length) continue;
                // our own scripts as the site sends them, minified (core/min-js.js)
                const sha = crypto.createHash('sha256').update(servedBytes(a)).digest('hex');
                hashes[url] = sha;
                // A directory's page is asked for by the directory (/ru/ for /ru/index.html).
                if (e.name === 'index.html' && !((prefix + rel) in hashes)) hashes[prefix + rel] = sha;
            }
        })(dir, '');
    }
}

const git = (...a) => execFileSync('git', ['-C', GIT, ...a], { encoding: 'utf8' }).trim();
const [commit, commitTime] = git('log', '-1', '--format=%H %ct').split(' ');
const list = {
    origin: ORIGIN,
    commit,
    commitTime: Number(commitTime),
    // The app's own commit must be in here for it to take anything (src/site-updater.js, siteIsNewer).
    contains: git('rev-list', '--max-count=1000', 'HEAD').split('\n').map((c) => c.slice(0, 12)),
    generated: new Date().toISOString(),
    hashes,
};
const signed = JSON.stringify(list);
const key = crypto.createPrivateKey(fs.readFileSync(KEY));
const sig = crypto.sign('sha256', Buffer.from(signed), { key, dsaEncoding: 'ieee-p1363' });
// The same check the apps make (WebCrypto ECDSA P-256 / SHA-256, r||s), so a list that would be refused is never published.
if (!crypto.verify('sha256', Buffer.from(signed), { key: crypto.createPublicKey(key), dsaEncoding: 'ieee-p1363' }, sig)) {
    throw new Error('the signature does not verify');
}
fs.writeFileSync(OUT + '.tmp', JSON.stringify({ signed, sig: sig.toString('base64') }));
fs.renameSync(OUT + '.tmp', OUT);
console.log(`${OUT}: ${Object.keys(hashes).length} files of ${ORIGIN} at ${commit.slice(0, 12)}, signed`);
