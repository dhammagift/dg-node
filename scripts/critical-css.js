#!/usr/bin/env node
// Critical CSS: the rules a page state really uses on its first screens, inlined in <head> as
// <style id="dg-critical"> so the page paints without waiting for the full stylesheets, which then load
// without blocking (preload + onload). One file per state, committed: configs/critical/<state>.css.
//
//   node scripts/critical-css.js --state reader [--base https://test.dhamma.gift] [/mn10 /dn22 ...]
//   npm run critical -- --state reader
//
// How: a real browser (Playwright's Chromium) opens each URL at phone and desktop width, light and dark,
// with CDP CSS rule-usage tracking on from the first byte (so the cold-load busy/skeleton rules count too),
// and records every style rule that matched. Those rules are cut out of the stylesheets the page actually
// got (the served bundle, not the sources), each with its @media/@supports wrappers, in cascade order;
// all @font-face and @keyframes go along (they cost nothing until used). Relative url()s are made absolute.
//
// The first line names every stylesheet URL the page loaded, ?v= hash included. The server inlines the
// file only while the page it sends links exactly those URLs: any edited stylesheet changes its ?v=, the
// list no longer matches, and the page falls back to the plain blocking stylesheets (never mis-styled by a
// stale file). Regenerate after a CSS change; dg-fastify.js logs which state went stale.
const fs = require('fs');
const path = require('path');

const PW = '/usr/lib/node_modules/@playwright/cli/node_modules/playwright-core';
const CHROME = process.env.CHROME_PATH || '/root/.cache/ms-playwright/chromium-1247/chrome-linux-arm64/chrome';
const DEFAULT_URLS = {
    reader: ['/mn10', '/mn10?lang=ru', '/dn22', '/dhp1-20', '/snp1.8', '/an1.1-10', '/pli-tv-bu-vb-pj1?lang=ru', '/ds1.1'],
    home: ['/', '/?lang=ru'],
    results: ['/kacchapa', '/kacchapa?lang=ru'],
    toc: ['/toc', '/toc/mn', '/toc/mn?lang=ru'],
};
const VIEWS = [
    { width: 390, height: 844, isMobile: true, hasTouch: true, colorScheme: 'light' },
    { width: 390, height: 844, isMobile: true, hasTouch: true, colorScheme: 'dark' },
    { width: 1280, height: 900, isMobile: false, hasTouch: false, colorScheme: 'light' },
    { width: 1280, height: 900, isMobile: false, hasTouch: false, colorScheme: 'dark' },
];

function args() {
    const a = process.argv.slice(2), o = { urls: [] };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--state') o.state = a[++i];
        else if (a[i] === '--base') o.base = a[++i];
        else o.urls.push(a[i]);
    }
    if (!o.state || !DEFAULT_URLS[o.state] && !o.urls.length) throw new Error('usage: critical-css.js --state reader|home|results|toc [--base URL] [paths...]');
    o.base = (o.base || 'https://test.dhamma.gift').replace(/\/+$/, '');
    if (!o.urls.length) o.urls = DEFAULT_URLS[o.state];
    return o;
}

// The block structure of a stylesheet: top-level and nested statements with their text ranges.
// { start, end, prelude, kind: 'rule'|'at', children } - comments and strings skipped, no deps.
function scan(css) {
    const root = { children: [] }, stack = [root];
    let i = 0, stmtStart = 0;
    const skipWs = () => { stmtStart = i; };
    while (i < css.length) {
        const c = css[i];
        if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 2; if (css.slice(stmtStart, i).trim().startsWith('/*')) stmtStart = i; continue; }
        if (c === '"' || c === "'") { i++; while (i < css.length && css[i] !== c) { if (css[i] === '\\') i++; i++; } i++; continue; }
        if (c === '{') {
            const prelude = css.slice(stmtStart, i).trim();
            const node = { start: stmtStart, prelude, kind: prelude.startsWith('@') ? 'at' : 'rule', children: [], bodyStart: i + 1 };
            stack[stack.length - 1].children.push(node);
            stack.push(node);
            i++; skipWs(); continue;
        }
        if (c === '}') {
            const node = stack.pop();
            if (node && node !== root) { node.end = i + 1; }
            if (!stack.length) stack.push(root);
            i++; skipWs(); continue;
        }
        if (c === ';' && stack[stack.length - 1].kind !== 'rule') {
            const text = css.slice(stmtStart, i + 1).trim();
            if (text.startsWith('@')) stack[stack.length - 1].children.push({ start: stmtStart, end: i + 1, prelude: text, kind: 'statement', children: [] });
            i++; skipWs(); continue;
        }
        i++;
    }
    // a rule nested in a rule (CSS nesting) keeps its parent as the unit
    return root;
}

const absolutize = (css, sheetUrl) => css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) =>
    /^(data:|https?:|\/|#)/.test(u) ? m : `url(${q}${new URL(u, sheetUrl).pathname}${q})`);

async function main() {
    const o = args();
    const { chromium } = require(PW);
    const browser = await chromium.launch({ executablePath: CHROME });
    const sheets = new Map(); // key -> { url, text, used: Set<startOffset>, order }
    let order = 0;
    const linked = new Set(); // stylesheet URLs the pages linked, ?v= included
    for (const url of o.urls) {
        for (const view of VIEWS) {
            const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height }, isMobile: view.isMobile, hasTouch: view.hasTouch, colorScheme: view.colorScheme, deviceScaleFactor: 1 });
            const page = await ctx.newPage();
            const cdp = await ctx.newCDPSession(page);
            const headers = new Map();
            cdp.on('CSS.styleSheetAdded', e => headers.set(e.header.styleSheetId, e.header));
            await cdp.send('DOM.enable');
            await cdp.send('CSS.enable');
            await cdp.send('CSS.startRuleUsageTracking');
            await page.goto(o.base + url, { waitUntil: 'load' });
            // the reader keeps or swaps its text, then the page settles
            await page.waitForFunction(() => !document.querySelector('#sutta[data-ssr="1"]'), null, { timeout: 30000 }).catch(() => {});
            await page.waitForTimeout(2500);
            const { ruleUsage } = await cdp.send('CSS.stopRuleUsageTracking');
            const docOrder = await page.evaluate(() => [...document.styleSheets].map(s => s.href || (s.ownerNode && s.ownerNode.id === 'dg-critical' ? 'critical' : 'inline')));
            for (const href of docOrder) if (href.startsWith('http')) linked.add(new URL(href).pathname + new URL(href).search);
            for (const [id, h] of headers) {
                if (h.origin !== 'regular') continue;
                const { text } = await cdp.send('CSS.getStyleSheetText', { styleSheetId: id }).catch(() => ({ text: '' }));
                if (!text || text.startsWith('/* dg-critical')) continue;
                const key = (h.isInline ? 'inline:' : '') + (h.sourceURL || '') + ':' + text.length;
                if (!sheets.has(key)) sheets.set(key, { url: h.sourceURL, inline: h.isInline, text, used: new Set(), order: order++, pos: docOrder.indexOf(h.sourceURL) });
                const s = sheets.get(key);
                for (const u of ruleUsage) if (u.styleSheetId === id && u.used) s.used.add(u.startOffset);
            }
            await ctx.close();
            process.stdout.write('.');
        }
    }
    await browser.close();

    // cascade order: linked sheets in document order, inline ones where they first appeared
    const list = [...sheets.values()].filter(s => s.used.size).sort((a, b) => (a.pos < 0 ? 1e6 + a.order : a.pos) - (b.pos < 0 ? 1e6 + b.order : b.pos) || a.order - b.order);
    let out = '';
    const keyframes = []; // [name, text]: kept only if a kept rule animates with it
    const stripComments = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{2,}/g, '\n');
    for (const s of list) {
        const tree = scan(s.text);
        const take = (node) => {
            if (node.kind === 'rule') return [...s.used].some(off => off >= node.start && off < node.end) ? s.text.slice(node.start, node.end) : '';
            if (node.kind === 'statement') return ''; // @charset/@import: meaningless or already inlined in a <style>
            const kf = /^@(?:-webkit-)?keyframes\s+([\w-]+)/i.exec(node.prelude);
            if (kf) { keyframes.push([kf[1], s.text.slice(node.start, node.end)]); return ''; }
            if (/^@(font-face|property|counter-style)/i.test(node.prelude)) return s.text.slice(node.start, node.end);
            const inner = node.children.map(take).join('');
            return inner ? `${node.prelude}{${inner}}` : '';
        };
        const part = stripComments(tree.children.map(take).join(''));
        if (part.trim()) out += `/* ${s.inline ? 'inline <style> of ' : ''}${(s.url || '').replace(o.base, '')} */\n` + absolutize(part, s.url || o.base + '/') + '\n';
    }
    const kept = keyframes.filter(([name]) => new RegExp(`animation(-name)?\\s*:[^;}]*\\b${name}\\b`).test(out));
    if (kept.length) out += '/* @keyframes the rules above use */\n' + stripComments(kept.map(k => k[1]).join('\n')) + '\n';
    const header = `/* dg-critical ${o.state} sources: ${JSON.stringify([...linked].sort())} */\n`;
    const file = path.join(__dirname, '..', 'configs', 'critical', o.state + '.css');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, header + out);
    const total = list.reduce((n, s) => n + s.text.length, 0);
    console.log(`\n${path.relative(process.cwd(), file)}: ${out.length} bytes of ${total} (${list.length} stylesheets, ${linked.size} linked)`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
