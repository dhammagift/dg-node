// DG voices with no network: the Pali voices (pratham, priyamvada) and the translation ones (en: alan, norman, kathleen;
// ru: ruslan, irina) run on the device - Piper's ONNX model in onnxruntime-web, read with the same rules as the voice
// service (pali-tts: web/pali-tts.js + pali_ipa.export() / respell.export(), served by the service itself, so nothing
// here copies the rules). Each voice is one download (~63 MB model); onnxruntime's wasm and the engine (~14 MB) come once
// with the first voice; the en/ru voices also need espeak-ng (web/espeak, the service's own espeak-ng-data): its code and
// common data once (~1 MB), then each language's dictionary once (en 0.2 MB, ru 9 MB). Kept in IndexedDB (not Cache Storage: the service worker
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

// What a voice still needs besides its model: [key, offline file, bytes] (onnxruntime, espeak's code and packs)
async function missing(o, v) {
  const want = [];
  if (!(await get('wasm'))) want.push(['wasm', null, WASM_BYTES]);
  if (v.lang === 'en' || v.lang === 'ru') {
    if (!(await get('espeak-wasm'))) want.push(['espeak-wasm', 'espeak.wasm', o.espeak.code]);
    for (const pack of ['core', v.lang]) {
      if (!(await get('espeak:' + pack))) want.push(['espeak:' + pack, `espeak-${pack}.bin`, o.espeak[pack]]);
    }
  }
  return want;
}

// onProgress(share 0..1, bytes done, bytes total); signal: an AbortSignal to cancel. Nothing is stored until all is in.
export async function download(vid, onProgress = () => {}, signal) {
  await migrated;
  const o = await offer();
  const v = o.voices[vid];
  if (!v) throw new Error('voice ' + vid + ' is not offered offline');
  const want = await missing(o, v), shared = want.some(w => w[0] === 'wasm');
  const total = v.bytes + want.reduce((n, w) => n + w[2], 0);
  const est = await navigator.storage?.estimate?.().catch(() => null);
  if (est && est.quota - est.usage < total * 1.1) throw new Error('no space');
  let done = 0;
  const tick = n => { done += n; onProgress(Math.min(done / total, 1), done, total); };
  const extra = want.filter(w => w[1]);
  const [model, json, engine, wasm, ort, esJs, ...esFiles] = await Promise.all([
    fetchAny(vid + '.onnx', { signal }).then(r => bytes(r, tick)),
    fetchAny(vid + '.onnx.json', { signal }).then(r => r.json()),
    fetchAny('pali-tts.js', { signal }).then(r => r.text()),
    shared ? fetchAny(ORT + 'ort-wasm-simd-threaded.wasm', { signal }).then(r => bytes(r, tick)) : null,
    shared ? fetchAny(ORT + 'ort.wasm.bundle.min.mjs', { signal }).then(r => r.text()) : null,
    extra.length ? fetchAny('espeak.mjs', { signal }).then(r => r.text()) : null,
    ...extra.map(w => fetchAny(w[1], { signal }).then(r => bytes(r, tick))),
  ]);
  if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
  await idb('readwrite', s => {
    s.put({ vid, label: v.label, lang: v.lang || 'pi', tag: v.tag, json }, 'meta:' + vid);
    s.put(model, 'model:' + vid);
    s.put({ rules: o.rules, data: o.data, respell: o.respell }, 'rules');
    s.put(engine, 'engine');
    if (shared) { s.put(wasm, 'wasm'); s.put(ort, 'ort'); }
    if (esJs) s.put(esJs, 'espeak-js');
    extra.forEach((w, i) => s.put(esFiles[i], w[0]));
  });
  try { await navigator.storage?.persist?.(); } catch (e) {}  // ask the browser not to evict it
  setIds([...new Set([...ids(), vid])]);
  localStorage.setItem(STALE, (localStorage.getItem(STALE) || '').split(',').filter(x => x && x !== vid).join(','));
  stopWorker();
}

export async function remove(vid) {
  const left = ids().filter(x => x !== vid);
  const langs = (await Promise.all(left.map(x => get('meta:' + x)))).map(m => m?.lang);
  await idb('readwrite', s => {
    if (!left.length) return s.clear();  // the last voice: onnxruntime and the engine go too
    s.delete('meta:' + vid);
    s.delete('model:' + vid);
    for (const lang of ['en', 'ru']) if (!langs.includes(lang)) s.delete('espeak:' + lang);  // a language's dictionary
    if (!langs.some(l => l === 'en' || l === 'ru')) ['espeak-js', 'espeak-wasm', 'espeak:core'].forEach(k => s.delete(k));
  });
  setIds(left);
  stopWorker();
}

// When online: newer rules come in silently (a few KB); a newer model only marks the voice stale (an update icon in the
// voice list downloads it again).
export async function refresh() {
  if (!ids().length) return;
  const o = await offer(), r = await get('rules');
  if (!r || r.rules !== o.rules || JSON.stringify(r.respell) !== JSON.stringify(o.respell)) {
    const engine = await fetchAny('pali-tts.js').then(x => x.text());
    await idb('readwrite', s => { s.put({ rules: o.rules, data: o.data, respell: o.respell }, 'rules'); s.put(engine, 'engine'); });
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
      const pali = eng.makePali(m.init.data);
      let tr = null;
      if (m.init.espeak) {  // en/ru: espeak-ng's code and its data files, unpacked from the service's packs
        const files = {};
        for (const pack of m.init.espeak.packs) {
          const v = new DataView(pack), n = v.getUint32(0, true);
          let at = 4 + n;
          for (const [path, size] of JSON.parse(new TextDecoder().decode(new Uint8Array(pack, 4, n)))) {
            files[path] = new Uint8Array(pack, at, size);
            at += size;
          }
        }
        const es = await eng.loadEspeak((await import(m.init.espeak.js)).default, files, { wasmBinary: m.init.espeak.wasm });
        tr = eng.makeTranslation(m.init.respell, pali, es);
      }
      sp = await eng.makeSpeaker(ort, pali, m.init.model, m.init.json, { translation: tr, lang: m.init.lang });
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
    const lang = m.lang || 'pi';
    let espeak = null;
    if (lang !== 'pi') {
      const [js, ew, ...packs] = await Promise.all(['espeak-js', 'espeak-wasm', 'espeak:core', 'espeak:' + lang].map(get));
      if (!js || !ew || packs.some(p => !p)) throw new Error('espeak for ' + vid + ' is not downloaded');
      espeak = { js: url(js, 'text/javascript'), wasm: await ew.arrayBuffer(), packs: await Promise.all(packs.map(p => p.arrayBuffer())) };
    }
    await call({ init: { data: r.data, respell: r.respell, json: m.json, model: new Uint8Array(await model.arrayBuffer()), lang, espeak,
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
