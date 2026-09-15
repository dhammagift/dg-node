// Everything in the app build that the browser can answer, in one command:
//
//   node test/app-ui/run-all.js            # fast checks (pages, assets, offline flows if installed)
//   DG_APP_UI_ALLOW_DOWNLOAD=1 node test/app-ui/run-all.js   # also downloads the database if missing
//
// The slow, whole-database check (check-progress.js) is NOT part of this run: it pulls 509MB. Run it
// on its own when touching the offline layer or the progress card.
const { spawn } = require('child_process');
const path = require('path');

const CHECKS = [
    'check-pages.js',     // every bundled page against the site — the "tile opens search" family
    'check-assets.js',    // nothing referenced but absent (the SyntaxError-from-index.html family)
    'check-offline.js',   // offline search/reader/TOC/settings/memo/bridge (skips without a library)
];

(async () => {
    const failed = [];
    for (const name of CHECKS) {
        console.log(`\n=== ${name} ${'='.repeat(Math.max(0, 60 - name.length))}`);
        const code = await new Promise(resolve => {
            const child = spawn(process.execPath, [path.join(__dirname, name)], { stdio: 'inherit' });
            child.on('exit', resolve);
        });
        if (code !== 0) failed.push(name);
    }
    console.log('\n' + '='.repeat(64));
    if (failed.length) {
        console.log(`FAILED: ${failed.join(', ')}`);
        process.exit(1);
    }
    console.log('all app-ui checks passed');
})();
