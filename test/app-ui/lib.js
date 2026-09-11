// Shared plumbing for the app-UI checks in this directory. Nothing here is specific to one check —
// the servers, the browser and the small "does this page look like the site's" helper live here so
// the checks themselves stay readable.
//
// These checks exist because the app IS the site's own build (see docs/OFFLINE_PWA_PLAN.md): every
// difference that reaches a phone came from something the build did or did not copy — a page that
// fell back to index.html (History, Materials, grammar — "the tile opens search"), a missing script
// that arrived as HTML and died as a SyntaxError (/read/js/voice.js), a lost TOC snapshot (404 in
// the offline navigator). All of those are invisible in a browser devtools tab and obvious here.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');           // the dg-node checkout
const APP_DIR = findAppDir();
const WWW = path.join(APP_DIR, 'www');
const MOBILE_DATA = path.join(ROOT, 'siteroot', 'mobile-data');
const SITE = process.env.DG_SITE_URL || 'http://127.0.0.1:3003';  // the pm2 "test" server
const APP_PORT = +(process.env.DG_APP_PORT || 8099);
const CHUNKED_PORT = +(process.env.DG_CHUNKED_PORT || 8097);
const APP = `http://127.0.0.1:${APP_PORT}`;

const PLAYWRIGHT = process.env.DG_PLAYWRIGHT || path.join(APP_DIR, 'node_modules', 'playwright-core');
const BROWSER = process.env.DG_CHROMIUM || '/usr/bin/google-chrome';
const PROFILE_ROOT = process.env.DG_PROFILE_ROOT || path.join(ROOT, 'test', '.app-ui-profiles');
// One profile shared by every check that needs the offline library: the download is 509MB, and
// paying for it per check would mean nobody ever runs these. check-progress.js downloads into it,
// check-offline.js (and anything later) reuses what is already in OPFS.
const LIBRARY_PROFILE = 'library';

// dg-app-full has been living inside this repo while the Capacitor work is in progress and is a
// sibling in the "real" layout; support both, and let the environment decide when neither fits.
function findAppDir() {
    const candidates = [
        process.env.DG_APP_PATH,
        path.join(ROOT, 'dg-app-full'),
        path.join(ROOT, '..', 'dg-app-full'),
    ].filter(Boolean);
    for (const c of candidates) {
        if (fs.existsSync(path.join(c, 'capacitor.config.json'))) return path.resolve(c);
    }
    throw new Error(`dg-app-full not found (tried ${candidates.join(', ')}) — set DG_APP_PATH`);
}

function chromium() {
    try {
        return require(PLAYWRIGHT).chromium;
    } catch (e) {
        throw new Error(`playwright-core not found at ${PLAYWRIGHT} — set DG_PLAYWRIGHT or run ` +
            `"npm install --no-save playwright-core" in dg-app-full`);
    }
}

// A persistent profile per check: OPFS is only usable with a real, writable storage context (an
// ephemeral one starts failing around 230MB with FILE_ERROR_NO_SPACE — see docs/OFFLINE_PWA_PLAN.md).
//
// Profiles are DELETED when the run ends unless DG_APP_UI_KEEP_PROFILE=1. A profile that has taken
// the offline library holds ~500-900MB of Chrome storage, and a handful of forgotten ones filled a
// 49GB disk to 100% during this work — a test suite that eats the machine is a bug in the suite.
async function launch(name, opts = {}) {
    const dir = path.join(PROFILE_ROOT, name);
    if (!process.env.DG_APP_UI_KEEP_PROFILE) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.mkdirSync(dir, { recursive: true });
    const free = freeDiskMb();
    if (free !== null && free < 2500) {
        console.warn(`[app-ui] only ${free}MB free on ${path.parse(ROOT).root} — a check that downloads ` +
            `the 509MB library may fail; the profile is deleted afterwards.`);
    }
    const ctx = await chromium().launchPersistentContext(dir, {
        executablePath: BROWSER,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
        viewport: { width: 412, height: 915 },
        isMobile: true,
        hasTouch: true,
        ...opts,
    });
    return ctx;
}

// A check that downloads the 509MB library must (a) be asked for explicitly and (b) have room for
// it. This is the automatic version of the lesson that filled a 49GB disk to 100% by accident.
function allowBigDownload(checkName) {
    if (process.env.DG_APP_UI_ALLOW_DOWNLOAD !== '1') {
        console.log(`SKIP  ${checkName} downloads ~509MB into a browser profile. ` +
            `Set DG_APP_UI_ALLOW_DOWNLOAD=1 to allow it (the profile is deleted afterwards).`);
        return false;
    }
    const free = freeDiskMb();
    if (free !== null && free < 3000) {
        console.log(`SKIP  ${checkName}: only ${free}MB free, needs ~1500MB transiently. ` +
            `Free space (or run scripts/disk-guard.js) and try again.`);
        return false;
    }
    return true;
}

// Closes the browser and removes its profile (unless asked to keep it).
async function finish(ctx, name) {
    try { await ctx.close(); } catch (e) { /* already gone */ }
    if (!process.env.DG_APP_UI_KEEP_PROFILE) {
        fs.rmSync(path.join(PROFILE_ROOT, name), { recursive: true, force: true });
    }
}

// df, so the warning above can be honest without shelling out to a platform-specific tool.
function freeDiskMb() {
    try {
        const { statfsSync } = require('fs');
        const st = statfsSync(path.parse(ROOT).root);
        return Math.round((st.bavail * st.bsize) / (1024 * 1024));
    } catch (e) {
        return null;
    }
}

// The app's own origin, serving www/ with /mobile-data from this checkout — the same two roles the
// device plays (local assets + the published database).
function startAppServer({ strict = false, chunked = false } = {}) {
    const port = chunked ? CHUNKED_PORT : APP_PORT;
    const script = path.join(__dirname, chunked ? 'server-chunked.js' : 'server-app.js');
    const args = [script, WWW, MOBILE_DATA, String(port)];
    if (strict) args.push('--strict');
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('error', e => { console.error('[server] failed to start:', e.message); process.exit(1); });
    child.on('exit', (code) => {
        // EADDRINUSE is the common one: a leftover server from a manual run. Say so instead of
        // silently testing against whatever is already listening on the port.
        if (code && code !== 0) console.error(`[server] exited with ${code} — is port ${port} already in use?`);
    });
    child.stdout.on('data', () => {});
    child.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
    return { child, url: `http://127.0.0.1:${port}`, stop: () => { try { child.kill('SIGKILL'); } catch (e) {} } };
}

async function waitForServer(url, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const r = await fetch(url + '/');
            if (r.ok) return true;
        } catch (e) { /* not up yet */ }
        await new Promise(r => setTimeout(r, 300));
    }
    throw new Error(`server did not come up at ${url}`);
}

// What a page looks like: title, visible text length, and whether it is the search page — the
// fingerprint of "Capacitor answered a missing path with index.html".
async function pageFingerprint(page, url, waitMs = 1500) {
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(waitMs);
        return await page.evaluate(() => ({
            title: document.title,
            len: (document.body.innerText || '').trim().length,
            // The search LANDING page, not merely a page with a search box: readylinebyline.html
            // has its own #paliauto input, and calling that "the search page" was a false failure.
            isSearch: !!document.getElementById('paliauto') && document.querySelectorAll('.dg-tile').length >= 3,
            url: location.pathname + location.search,
        }));
    } catch (e) {
        return { title: 'ERR ' + String(e.message).slice(0, 60), len: 0, isSearch: false };
    }
}

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  ' + detail : ''));
    return ok;
}
function summary() {
    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    return failed.length === 0;
}

module.exports = {
    ROOT, APP_DIR, WWW, MOBILE_DATA, SITE, APP, APP_PORT, CHUNKED_PORT, LIBRARY_PROFILE,
    PLAYWRIGHT, BROWSER, PROFILE_ROOT,
    chromium, launch, finish, freeDiskMb, allowBigDownload, startAppServer, waitForServer, pageFingerprint,
    check, summary, results,
};
