// core/regex-worker.js — the body of the worker thread that runs a regex-keyword search.
//
// Why this exists at all: a keyword containing a regex metacharacter used to be compiled and run
// inside the HTTP process, against every row of dg.db (1.31M rows, synchronous node:sqlite) — a
// single request blocked the event loop for everyone: measured 11s / ~1GB for "d.*" and no return
// at all for "(.+)+#" (catastrophic backtracking, which cannot be interrupted in-process). The
// worker is the only way to interrupt that: worker.terminate() stops a stuck V8 regex (verified:
// a worker stuck in (.+)+# is killed in ~5ms while the main thread keeps serving).
//
// It runs the SAME code as the main process (core/search-core.js), so there is no second
// implementation of search to drift: same database, same skeleton (rebuilt here from dg.db's
// `suttas` table with the same query dg-fastify.js uses), same builders. The parent only decides
// how long to wait.
//
// The process is long-lived: the database and the skeleton are prepared once at spawn, and every
// request after that is just a postMessage. On timeout the parent terminates it and spawns a fresh
// one on the next regex request (core/regex-runner.js).
'use strict';

const { parentPort, workerData } = require('worker_threads');
const { DatabaseSync } = require('node:sqlite');
const searchCore = require('./search-core.js');

const db = new DatabaseSync(workerData.dbPath, { readOnly: true });
db.exec('PRAGMA cache_size = -16000'); // same setting dg-fastify.js applies to its own handle

const skeleton = {};
for (const row of db.prepare('SELECT id, category, dir_path, title, mr FROM suttas').all()) {
    skeleton[row.id] = { category: row.category, dir_path: row.dir_path, title: row.title, mr: row.mr };
}

searchCore.init({ searchDb: db, DG_OFFLINE: workerData.dgOffline, limits: workerData.limits });
searchCore.setSkeleton(skeleton);

parentPort.on('message', async job => {
    try {
        parentPort.postMessage({ id: job.id, ok: true, result: await searchCore.runRegexJob(job) });
    } catch (err) {
        // A bad pattern is the caller's mistake, not a worker fault — the worker stays alive and
        // the parent turns this into the same 400 the main process would answer.
        parentPort.postMessage({ id: job.id, ok: false, badRequest: !!err.badRequest, message: err.message });
    }
});
