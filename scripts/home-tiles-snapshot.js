#!/usr/bin/env node
// The home page's tile grid as home.js renders it for a first-time visitor (default order, nothing hidden,
// descriptions on), one per language: configs/critical/home-tiles.<lang>.html. The server puts it into
// #home-tiles (dg-fastify.js withHomeTiles) so the page's largest element paints with the HTML instead of
// after home-bundle.js + menu-links.json (PageSpeed: LCP 5.6 s on home). home.js re-renders the same grid
// over it. The first line lists md5s of the files the grid is made from; when one changes the server stops
// using the snapshot until this is run again: npm run home-tiles [-- --base https://test.dhamma.gift]
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PW = '/usr/lib/node_modules/@playwright/cli/node_modules/playwright';
// what the grid is built from: home.js renders it from menu-links.json, with FontAwesome's icons
const SOURCES = ['search/js/home.js', 'configs/search/menu-links.json', 'public/overrides/js/fontawesome-local.js'];

function sourcesHash() {
    return SOURCES.map(f => {
        const file = [path.join(ROOT, f), path.join(ROOT, 'siteroot', f.replace(/^public\/overrides\//, 'assets/'))].find(p => fs.existsSync(p));
        return f + ':' + (file ? crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex').slice(0, 10) : 'missing');
    }).join(' ');
}

async function main() {
    const i = process.argv.indexOf('--base');
    const base = i > 0 ? process.argv[i + 1] : 'https://test.dhamma.gift';
    const { chromium } = require(PW);
    const browser = await chromium.launch();
    for (const lang of ['en', 'ru']) {
        const grids = [];
        for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
            const ctx = await browser.newContext({ viewport });
            const page = await ctx.newPage();
            await page.goto(`${base}/?lang=${lang}`, { waitUntil: 'load' });
            await page.waitForFunction(() => window.FontAwesome && document.querySelectorAll('#home-tiles .dg-tile').length > 3, null, { timeout: 30000 });
            await page.waitForTimeout(1500);
            grids.push(await page.evaluate(() => document.getElementById('home-tiles').innerHTML));
            await ctx.close();
        }
        if (grids[0] !== grids[1]) throw new Error(`home tiles (${lang}) differ between phone and desktop - a snapshot cannot stand for both`);
        const file = path.join(ROOT, 'configs', 'critical', `home-tiles.${lang}.html`);
        fs.writeFileSync(file, `<!-- dg-home-tiles ${lang} sources: ${sourcesHash()} -->\n${grids[0]}\n`);
        console.log(`${path.relative(ROOT, file)}: ${grids[0].length} bytes`);
    }
    await browser.close();
}

module.exports = { sourcesHash };
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
