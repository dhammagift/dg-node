// DG voice with no network: the Pali voice (pratham) runs on the device - Piper's ONNX model in onnxruntime-web, read
// with the same rules as the voice service (pali-tts: web/pali-tts.js + pali_ipa.export(), served by the service itself,
// so nothing here copies the rules). One download (~77 MB: the model, onnxruntime's wasm, the engine), kept in IndexedDB
// (not Cache Storage: the service worker deletes every cache but its own on each deploy). Synthesis runs in a worker,
// so the page does not freeze. Same code in the browser, the PWA and the apps (Capacitor WebView).
// voice.js imports this only once a voice is downloaded (localStorage dg_voice_offline = voice id) or on "download".
const APIS = [...(self.DG_TTS_URL ? [self.DG_TTS_URL.replace(/\/pali$/, '/offline/')] : []),  // as voice.js's DG_TTS_URLS
              'https://api.dhamma.gift/api/tts/offline/', 'https://api2.dhamma.gift/api/tts/offline/'];
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
export const KEY = 'dg_voice_offline';

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

// Bytes of a response, with progress (done, total) on the way
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

export async function download(vid, onProgress = () => {}) {
  const o = await offer();
  const v = o.voices[vid];
  if (!v) throw new Error('voice ' + vid + ' is not offered offline');
  const wasmSize = 14239897;  // ort-wasm-simd-threaded.wasm of 1.30.0, for the progress bar only
  const total = v.bytes + wasmSize;
  let done = 0;
  const tick = n => { done += n; onProgress(Math.min(done / total, 1)); };
  const [model, wasm, ortJs, engine, json] = await Promise.all([
    fetchAny(vid + '.onnx').then(r => bytes(r, tick)),
    fetchAny(ORT + 'ort-wasm-simd-threaded.wasm').then(r => bytes(r, tick)),
    fetchAny(ORT + 'ort.wasm.bundle.min.mjs').then(r => r.text()),
    fetchAny('pali-tts.js').then(r => r.text()),
    fetchAny(vid + '.onnx.json').then(r => r.json()),
  ]);
  await idb('readwrite', s => {
    s.put({ vid, label: v.label, tag: v.tag, rules: o.rules, data: o.data, json }, 'meta');
    s.put(model, 'model'); s.put(wasm, 'wasm'); s.put(ortJs, 'ort'); s.put(engine, 'engine');
  });
  try { await navigator.storage?.persist?.(); } catch (e) {}  // ask the browser not to evict it
  localStorage.setItem(KEY, vid);
  stopWorker();
}

export async function remove() {
  await idb('readwrite', s => s.clear());
  localStorage.removeItem(KEY);
  stopWorker();
}

export const meta = () => get('meta');

// When online: newer rules come in silently (a few KB); a newer model only sets meta.stale, the menu offers it again.
export async function refresh() {
  const m = await meta();
  if (!m) return;
  const o = await offer();
  const v = o.voices[m.vid];
  if (o.rules !== m.rules) {
    const engine = await fetchAny('pali-tts.js').then(r => r.text());
    await idb('readwrite', s => { s.put({ ...m, rules: o.rules, data: o.data }, 'meta'); s.put(engine, 'engine'); });
    stopWorker();
  }
  if (v && v.tag !== m.tag) await idb('readwrite', s => s.put({ ...m, rules: o.rules, data: o.data, stale: true }, 'meta'));
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
let worker = null;
function stopWorker() {
  if (worker) worker.w.terminate();
  worker = null;
}

function startWorker() {
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
    const [m, model, wasm, ort, engine] = await Promise.all(['meta', 'model', 'wasm', 'ort', 'engine'].map(get));
    if (!m || !model) throw new Error('no offline voice downloaded');
    await call({ init: { data: m.data, json: m.json, model: new Uint8Array(await model.arrayBuffer()),
                         wasm: await wasm.arrayBuffer(), ort: url(ort, 'text/javascript'), engine: url(engine, 'text/javascript') } });
  })();
  ready.catch(() => { if (worker && worker.w === w) worker = null; w.terminate(); });
  return { w, speak: (text, rate) => ready.then(() => call({ text, rate })) };
}

// base64 WAV (voice.js plays it like the service's base64 mp3). rate as sent to the service (1 = the tuned pace).
export function speak(text, rate) {
  worker = worker || startWorker();
  return worker.speak(text, rate);
}
