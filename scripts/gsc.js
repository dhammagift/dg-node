#!/usr/bin/env node
// Google Search Console for dhamma.gift, through the service account in /root/.secrets/gsc.json
// (siteOwner of sc-domain:dhamma.gift). The key never leaves the box: the JWT is signed here.
//   node scripts/gsc.js query  [days=28] [dims=query] [limit=50] [filter dim~text]   search analytics, tab-separated
//   node scripts/gsc.js inspect URL...                                              index status of each URL
//   node scripts/gsc.js sitemap [submit]                                            the sitemap's state / resubmit it
const crypto = require('crypto');
const fs = require('fs');

const SITE = 'sc-domain:dhamma.gift';
const SITEMAP = 'https://dhamma.gift/sitemap.xml';
const KEY_FILE = process.env.GSC_KEY || '/root/.secrets/gsc.json';

async function token() {
    const k = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
        iss: k.client_email, scope: 'https://www.googleapis.com/auth/webmasters', aud: k.token_uri, iat: now, exp: now + 3600,
    });
    const jwt = unsigned + '.' + crypto.sign('RSA-SHA256', Buffer.from(unsigned), k.private_key).toString('base64url');
    const r = await fetch(k.token_uri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });
    if (!r.ok) throw new Error(`token: HTTP ${r.status} ${await r.text()}`);
    return (await r.json()).access_token;
}

async function api(tok, method, url, body) {
    const r = await fetch(url, {
        method, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`${method} ${url}: HTTP ${r.status} ${await r.text()}`);
    return r.status === 204 ? {} : r.json();
}

async function main() {
    const [cmd, ...args] = process.argv.slice(2);
    const tok = await token();
    const site = encodeURIComponent(SITE);
    if (cmd === 'query') {
        const [days = '28', dims = 'query', limit = '50', filter] = args;
        const end = new Date(Date.now() - 2 * 864e5), start = new Date(end - days * 864e5);
        const body = { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10),
            dimensions: dims.split(','), rowLimit: +limit, dataState: 'all' };
        if (filter) {
            const [dim, expression] = filter.split('~');
            body.dimensionFilterGroups = [{ filters: [{ dimension: dim, operator: 'contains', expression }] }];
        }
        const { rows = [] } = await api(tok, 'POST', `https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, body);
        console.log([...body.dimensions, 'clicks', 'impressions', 'ctr%', 'position'].join('\t'));
        for (const r of rows) console.log([...r.keys, r.clicks, r.impressions, (r.ctr * 100).toFixed(1), r.position.toFixed(1)].join('\t'));
    } else if (cmd === 'inspect') {
        for (const url of args) {
            const r = await api(tok, 'POST', 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { inspectionUrl: url, siteUrl: SITE })
                .then(d => d.inspectionResult.indexStatusResult, e => ({ coverageState: 'ERROR ' + e.message }));
            console.log([url, r.coverageState, r.lastCrawlTime || '', r.googleCanonical || ''].join('\t'));
        }
    } else if (cmd === 'sitemap') {
        const url = `https://www.googleapis.com/webmasters/v3/sites/${site}/sitemaps/${encodeURIComponent(SITEMAP)}`;
        if (args[0] === 'submit') await api(tok, 'PUT', url);
        const s = await api(tok, 'GET', url);
        console.log(JSON.stringify({ lastSubmitted: s.lastSubmitted, lastDownloaded: s.lastDownloaded, isPending: s.isPending,
            errors: s.errors, warnings: s.warnings, contents: s.contents }, null, 1));
    } else {
        console.log('usage: node scripts/gsc.js query [days] [dims] [limit] [dim~text] | inspect URL... | sitemap [submit]');
    }
}
main().catch(e => { console.error(e.message); process.exit(1); });
