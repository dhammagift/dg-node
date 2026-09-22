// core/regex-runner.js — the HTTP-process side of the regex-keyword worker (core/regex-worker.js).
//
// One long-lived worker, one job at a time (configs/search/regex-limits.json: maxConcurrent).
// Every call gets a hard deadline: when it passes, the worker is terminated — not asked to stop —
// because the thing it is stuck in (catastrophic regex backtracking) cannot be interrupted from
// inside. The next call spawns a fresh worker; terminate() itself takes ~5ms even mid-backtrack.
//
// Callers get a plain outcome object and never see a worker or a promise rejection:
//   { ok: true,  result }
//   { ok: false, badRequest: true, message }   → bad pattern, answer 400
//   { ok: false, timedOut: true }              → deadline passed, answer 503
//   { ok: false, unavailable: true, message }  → worker could not start/died, caller decides
'use strict';

const path = require('path');

// Mirrors configs/search/regex-limits.json — the file is the source of truth, these are only the
// fallback for a caller that forgot to configure() (tests, MCP without the server).
const DEFAULTS = {
    enabled: true,
    minLiteralChars: 3,
    maxPatternLength: 128,
    timeoutMs: 2000,
    maxConcurrent: 1,
    maxRows: 200000,
    prefilter: true,
};

let limits = { ...DEFAULTS };
let dbPath = '';
let dgOffline = '';
let worker = null;
let seq = 0;
let inFlight = 0;

function configure(opts) {
    limits = { ...DEFAULTS, ...((opts && opts.limits) || {}) };
    if (opts && opts.dbPath) dbPath = opts.dbPath;
    if (opts && opts.dgOffline) dgOffline = opts.dgOffline;
    // Limits are handed to the worker at spawn, so a live worker keeps the old ones.
    dropWorker();
}

function getLimits() {
    return limits;
}

function isBusy() {
    return inFlight >= Math.max(1, Number(limits.maxConcurrent) || 1);
}

function dropWorker() {
    if (worker) { worker.terminate(); worker = null; }
}

function spawn() {
    if (!worker) {
        const { Worker } = require('worker_threads');
        worker = new Worker(path.join(__dirname, 'regex-worker.js'), {
            workerData: { dbPath, dgOffline, limits },
        });
    }
    return worker;
}

function runJob(kind, args) {
    if (isBusy()) return Promise.resolve({ ok: false, busy: true });
    if (!dbPath) return Promise.resolve({ ok: false, unavailable: true, message: 'regex runner is not configured' });

    let w;
    try {
        w = spawn();
    } catch (err) {
        worker = null;
        return Promise.resolve({ ok: false, unavailable: true, message: err.message });
    }

    const id = ++seq;
    inFlight++;
    return new Promise(resolve => {
        let settled = false;
        const finish = outcome => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            w.off('message', onMessage);
            w.off('exit', onExit);
            w.off('error', onError);
            inFlight--;
            resolve(outcome);
        };
        const onMessage = msg => {
            if (!msg || msg.id !== id) return;
            if (msg.ok) return finish({ ok: true, result: msg.result });
            finish({ ok: false, badRequest: !!msg.badRequest, message: msg.message });
        };
        const onExit = () => { if (worker === w) worker = null; finish({ ok: false, unavailable: true, message: 'worker exited' }); };
        const onError = err => { if (worker === w) worker = null; finish({ ok: false, unavailable: true, message: err.message }); };
        const timer = setTimeout(() => {
            if (worker === w) worker = null;
            w.terminate();
            finish({ ok: false, timedOut: true });
        }, Math.max(200, Number(limits.timeoutMs) || DEFAULTS.timeoutMs));

        w.on('message', onMessage);
        w.on('exit', onExit);
        w.on('error', onError);
        w.postMessage({ id, kind, ...args });
    });
}

module.exports = { configure, getLimits, isBusy, runJob, shutdown: dropWorker, DEFAULTS };
