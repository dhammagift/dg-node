// test/regex-guard.js — the check that fails if the regex-search limits stop working.
//
// What it pins (see configs/search/regex-limits.json):
//   * a pattern with no real literal ("a.*", "d.*") is refused, not scanned;
//   * a pattern with one ("duk.*") is answered, and the literal is used to prefilter rows;
//   * a pattern that is only slow-inside-one-row ("duk(.+)+#", catastrophic backtracking) is
//     killed by the deadline instead of blocking the process;
//   * the HTTP process stays responsive while that doomed job runs;
//   * the worker is usable again after it was terminated.
//
// Run: node test/regex-guard.js
'use strict';

const path = require('path');
const fs = require('fs');
const searchCore = require('../core/search-core.js');
const regexRunner = require('../core/regex-runner.js');

const root = path.join(__dirname, '..');
const limits = JSON.parse(fs.readFileSync(path.join(root, 'configs', 'search', 'regex-limits.json'), 'utf8'));
delete limits._comment;

searchCore.setRegexLimits(limits);
regexRunner.configure({
    dbPath: path.join(root, 'dg.db'),
    dgOffline: path.join(root, 'siteroot', 'data', 'dhammagift'),
    limits,
});

let failed = 0;
function check(name, ok, detail) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) failed++;
}

(async () => {
    // 1. The guard: a pattern matching half the canon is not an answer.
    for (const bad of ['a.*', 'd.*', '.*x.*', '(.+)+#']) {
        check(`refused: ${bad}`, !!searchCore.regexProblem(bad));
    }
    check('allowed: duk.*', !searchCore.regexProblem('duk.*'));
    check('refused: too long', !!searchCore.regexProblem('duk' + '.'.repeat(limits.maxPatternLength)));

    // 2. The literal prefilter.
    check('prefilter duk.* -> duk', JSON.stringify(searchCore.regexPrefilterLiterals('duk.*')) === '["duk"]');
    check('prefilter dukkkha|kacchapa', JSON.stringify(searchCore.regexPrefilterLiterals('kacchapa|migala')) === '["kacchapa","migala"]');
    check('no prefilter for (duk)?x', searchCore.regexPrefilterLiterals('(duk)?x') === null);

    // 3. A normal regex query is answered, through the worker, with the prefilter reported.
    const t0 = Date.now();
    const ok = await regexRunner.runJob('fast', { keyword: 'kacchap.*', scope: 'default', exact: false, langs: ['en'], lb: 0, la: 0 });
    const ms = Date.now() - t0;
    check('worker answers kacchap.*', ok.ok === true, `${ms}ms`);
    check('prefilter was used', !!(ok.ok && ok.result.metadata.regex && ok.result.metadata.regex.literals), ok.ok ? JSON.stringify(ok.result.metadata.regex) : ok.message);
    check('within timeout', ms < limits.timeoutMs);

    // 4. Catastrophic backtracking on a row that the prefilter does return: the job must be killed
    //    at the deadline WHILE the main thread keeps running.
    let ticks = 0;
    const ticker = setInterval(() => ticks++, 50);
    const t1 = Date.now();
    const doomed = regexRunner.runJob('fast', { keyword: 'duk(.+)+#', scope: 'default', exact: false, langs: ['en'], lb: 0, la: 0 });
    const killed = await doomed;
    const killMs = Date.now() - t1;
    clearInterval(ticker);
    check('doomed job timed out, not answered', killed.ok === false && killed.timedOut === true, `${killMs}ms`);
    check('main thread was free during it', ticks > 2, `${ticks} ticks`);
    check('killed near the deadline', killMs < limits.timeoutMs + 1000, `${killMs}ms`);

    // 5. The terminated worker is replaced, not left dead.
    const again = await regexRunner.runJob('fast', { keyword: 'kacchap.*', scope: 'default', exact: false, langs: ['en'], lb: 0, la: 0 });
    check('worker works again after termination', again.ok === true);

    regexRunner.shutdown();
    console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
    process.exit(failed ? 1 : 0);
})();
