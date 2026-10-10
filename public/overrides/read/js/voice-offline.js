// DG voices with no network: the Pali voices (pratham, priyamvada) run on the device - Piper's ONNX model in
// onnxruntime-web, read with the same rules as the voice service (pali-tts: web/pali-tts.js + pali_ipa.export(), served by
// the service itself, so nothing here copies the rules). Each voice is one download (~63 MB model); onnxruntime's wasm
// and the engine (~14 MB) come once with the first voice. Kept in IndexedDB (not Cache Storage: the service worker
// deletes every cache but its own on each deploy). Synthesis runs in a worker, so the page does not freeze.
// Same code in the browser, the PWA and the apps (Capacitor WebView).
// voice.js imports this only once a voice is downloaded (localStorage dg_voice_offline: ids, comma-separated) or on a
// download / the offline voices window.
const APIS = [...(self.DG_TTS_URL ? [self.DG_TTS_URL.replace(/\/pali$/, '/offline/')] : []),  // as voice.js's DG_TTS_URLS
              'https://api.dhamma.gift/api/tts/offline/', 'https://api2.dhamma.gift/api/tts/offline/', '/api/tts/offline/'];
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
export const WASM_BYTES = 14239897;  // ort-wasm-simd-threaded.wasm of 1.30.0: sizes and progress only
const KEY = 'dg_voice_offline', STALE = 'dg_voice_offline_stale';

export const ids = () => (localStorage.getItem(KEY) || '').split(',').filter(Boolean);
const setIds = list => list.length ? localStorage.setItem(KEY, list.join(',')) : localStorage.removeItem(KEY);

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('dg-voice-offline', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('files');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('files', mode), req = fn(tx.objectStore('files'));
      tx.oncomplete = () => { open.result.close(); resolve(req && req.result); };
      tx.onerror = tx.onabort = () => { open.result.close(); reject(tx.error); };
    };
  });
}
const get = key => idb('readonly', s => s.get(key));
// On load: the first test build kept one voice under 'meta'/'model' (dropped: download again); and localStorage must not
// name a voice the browser has evicted from IndexedDB
const migrated = get('meta').then(async m => {
  if (m) await idb('readwrite', s => s.clear());
  const have = await Promise.all(ids().map(vid => get('meta:' + vid)));
  setIds(ids().filter((vid, i) => have[i]));
}).catch(() => {});

async function fetchAny(name, init) {
  let err;
  for (const base of name.startsWith('http') ? [''] : APIS) {
    try {
      const r = await fetch(base + name, init);
      if (r.ok) return r;
      err = new Error(base + name + ' HTTP ' + r.status);
    } catch (e) { err = e; }
  }
  throw err;
}

// What the service offers: {rules, data, voices: {id: {label, bytes, tag}}}
export const offer = () => fetchAny('pali-ipa.json', { signal: AbortSignal.timeout(8000) }).then(r => r.json());

async function bytes(r, onBytes) {
  const reader = r.body.getReader(), parts = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    onBytes(value.length);
  }
  return new Blob(parts);
}

// The downloaded voices: [{vid, label, tag, json}]
export async function list() {
  await migrated;
  return (await Promise.all(ids().map(vid => get('meta:' + vid)))).filter(Boolean);
}

// Whether onnxruntime + the engine still have to come with the next voice
export const needsShared = async () => !(await get('wasm'));

// onProgress(share 0..1, bytes done, bytes total); signal: an AbortSignal to cancel. Nothing is stored until all is in.
export async function download(vid, onProgress = () => {}, signal) {
  await migrated;
  const o = await offer();
  const v = o.voices[vid];
  if (!v) throw new Error('voice ' + vid + ' is not offered offline');
  const shared = await needsShared();
  const total = v.bytes + (shared ? WASM_BYTES : 0);
  const est = await navigator.storage?.estimate?.().catch(() => null);
  if (est && est.quota - est.usage < total * 1.1) throw new Error('no space');
  let done = 0;
  const tick = n => { done += n; onProgress(Math.min(done / total, 1), done, total); };
  const [model, json, engine, wasm, ort] = await Promise.all([
    fetchAny(vid + '.onnx', { signal }).then(r => bytes(r, tick)),
    fetchAny(vid + '.onnx.json', { signal }).then(r => r.json()),
    fetchAny('pali-tts.js', { signal }).then(r => r.text()),
    shared ? fetchAny(ORT + 'ort-wasm-simd-threaded.wasm', { signal }).then(r => bytes(r, tick)) : null,
    shared ? fetchAny(ORT + 'ort.wasm.bundle.min.mjs', { signal }).then(r => r.text()) : null,
  ]);
  if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
  await idb('readwrite', s => {
    s.put({ vid, label: v.label, tag: v.tag, json }, 'meta:' + vid);
    s.put(model, 'model:' + vid);
    s.put({ rules: o.rules, data: o.data }, 'rules');
    s.put(engine, 'engine');
    if (shared) { s.put(wasm, 'wasm'); s.put(ort, 'ort'); }
  });
  try { await navigator.storage?.persist?.(); } catch (e) {}  // ask the browser not to evict it
  setIds([...new Set([...ids(), vid])]);
  localStorage.setItem(STALE, (localStorage.getItem(STALE) || '').split(',').filter(x => x && x !== vid).join(','));
  stopWorker();
}

export async function remove(vid) {
  const left = ids().filter(x => x !== vid);
  await idb('readwrite', s => {
    if (!left.length) return s.clear();  // the last voice: onnxruntime and the engine go too
    s.delete('meta:' + vid);
    s.delete('model:' + vid);
  });
  setIds(left);
  stopWorker();
}

// When online: newer rules come in silently (a few KB); a newer model only marks the voice stale (an update icon in the
// voice list downloads it again).
export async function refresh() {
  if (!ids().length) return;
  const o = await offer(), r = await get('rules');
  if (!r || r.rules !== o.rules) {
    const engine = await fetchAny('pali-tts.js').then(x => x.text());
    await idb('readwrite', s => { s.put({ rules: o.rules, data: o.data }, 'rules'); s.put(engine, 'engine'); });
    stopWorker();
  }
  const stale = (await list()).filter(m => o.voices[m.vid] && o.voices[m.vid].tag !== m.tag).map(m => m.vid);
  localStorage.setItem(STALE, stale.join(','));  // voice.js shows an update icon for these
}

const WORKER = `
let sp, eng, queue = Promise.resolve();
async function handle(m) {
  try {
    if (m.init) {
      const ort = await import(m.init.ort);
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmBinary = m.init.wasm;
      eng = await import(m.init.engine);
      sp = await eng.makeSpeaker(ort, eng.makePali(m.init.data), m.init.model, m.init.json);
      postMessage({ id: m.id });
    } else {
      const { pcm, sr } = await sp.speak(m.text, m.rate);
      postMessage({ id: m.id, b64: eng.wavBase64(pcm, sr) });
    }
  } catch (e) { postMessage({ id: m.id, error: String(e && e.message || e) }); }
}
onmessage = e => { queue = queue.then(() => handle(e.data)); };
`;
let worker = null;  // {vid, w, speak}: one voice loaded at a time
function stopWorker() {
  if (worker) worker.w.terminate();
  worker = null;
}

function startWorker(vid) {
  const url = (s, type) => URL.createObjectURL(new Blob([s], { type }));
  const w = new Worker(url(WORKER, 'text/javascript'), { type: 'module' });
  const waiting = new Map();
  let n = 0;
  w.onmessage = ({ data }) => {
    const p = waiting.get(data.id);
    waiting.delete(data.id);
    if (p) data.error ? p.reject(new Error(data.error)) : p.resolve(data.b64);
  };
  const call = msg => new Promise((resolve, reject) => {
    const id = ++n;
    waiting.set(id, { resolve, reject });
    w.postMessage({ ...msg, id });
  });
  const ready = (async () => {
    const [m, model, r, wasm, ort, engine] = await Promise.all(['meta:' + vid, 'model:' + vid, 'rules', 'wasm', 'ort', 'engine'].map(get));
    if (!m || !model) throw new Error('voice ' + vid + ' is not downloaded');
    await call({ init: { data: r.data, json: m.json, model: new Uint8Array(await model.arrayBuffer()),
                         wasm: await wasm.arrayBuffer(), ort: url(ort, 'text/javascript'), engine: url(engine, 'text/javascript') } });
  })();
  const me = { vid, w, speak: (text, rate) => ready.then(() => call({ text, rate })) };
  ready.catch(() => { if (worker === me) worker = null; w.terminate(); });
  return me;
}

// base64 WAV (voice.js plays it like the service's base64 mp3). rate as sent to the service (1 = the tuned pace).
export async function speak(text, rate, vid) {
  await migrated;
  if (!worker || worker.vid !== vid) {
    stopWorker();
    worker = startWorker(vid);
  }
  return worker.speak(text, rate);
}
