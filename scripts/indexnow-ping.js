#!/usr/bin/env node
// Announces dhamma.gift pages to IndexNow (api.indexnow.org shares them with Yandex, Bing, Seznam…).
// Usage: node scripts/indexnow-ping.js            every URL of the live sitemap
//        node scripts/indexnow-ping.js URL...     only these
// Run on prod after content changes (scripts/pull-db.sh does it after installing a new build).
const fs = require('fs');
const path = require('path');

const HOST = 'dhamma.gift';
const KEY = fs.readFileSync(path.join(__dirname, '..', 'configs', 'indexnow-key.txt'), 'utf8').trim();
const BATCH = 10000; // the protocol's limit per request

async function main() {
    let urls = process.argv.slice(2);
    if (!urls.length) {
        // the server writes the sitemap it serves to settings/sitemap.xml at start; read locally — F1 cannot reach
        // its own public address (hairpin NAT: dhamma.gift from F1 resets)
        const xml = fs.readFileSync(path.join(__dirname, '..', 'settings', 'sitemap.xml'), 'utf8');
        urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
    }
    // the engines fetch the key from the live site: a key that is not deployed yet would fail every batch
    // (unreachable from the box itself is not "not live": only a wrong answer stops us)
    const live = await fetch(`https://${HOST}/${KEY}.txt`).then(r => r.text(), e => { console.warn(`IndexNow: key check skipped (${e.cause ? e.cause.code : e.message})`); return KEY; });
    if (live.trim() !== KEY) throw new Error(`key file https://${HOST}/${KEY}.txt is not live yet`);
    for (let i = 0; i < urls.length; i += BATCH) {
        const urlList = urls.slice(i, i + BATCH);
        const res = await fetch('https://api.indexnow.org/indexnow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
        });
        console.log(`IndexNow: ${urlList.length} URL(s) -> HTTP ${res.status} ${res.status >= 300 ? await res.text() : ''}`);
        if (res.status >= 300) process.exitCode = 1;
    }
}
main().catch(e => { console.error(`IndexNow: ${e.message}`); process.exit(1); });
