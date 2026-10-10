// --- КОНФИГУРАЦИЯ "БЕСПЛАТНОГО ПРОБНОГО ПЕРИОДА" ---
window.TRIAL_KEY = ""; 
const TRIAL_BLOCK_KEY = 'tts_block_trial_key'; 

// --- Утилиты ---

// The site sets window.isRu from the chosen UI language (settings.js, SPA switches); the URL guess is
// only for pages without it, and must not overwrite it: the SPA serves Russian at /mn1?lang=ru, so the
// path said "English" and the player came up in English on the Russian site.
if (typeof window.isRu === 'undefined') {
  window.isRu = window.location.pathname.includes('/r/') || 
                     window.location.pathname.includes('/ru/') || 
                     window.location.pathname.includes('/ml/') || 
                     window.location.pathname.includes('/mt/');
}
(async function loadTrialKey() {
    // 0. LEGACY CHECK: Если это старая страница, мы просто не грузим ключ.
    // Функция isLegacyPage() "поднимется" (hoisting), поэтому её можно вызвать здесь.
    if (typeof isLegacyPage === 'function' && isLegacyPage()) {
        console.log("Legacy Mode: Trial Key disabled.");
        return; // Выходим. window.TRIAL_KEY останется ""
    }

    // 1. ПРОВЕРКА: Если пользователь нажал сброс, мы блокируем загрузку
    if (localStorage.getItem(TRIAL_BLOCK_KEY)) {
        console.log("🚫 Trial TTS Key is BLOCKED by user reset.");
        return; 
    }

    // 2. ЗАГРУЗКА: Если блокировки нет, грузим как обычно
    try {
        const response = await fetch('/config/tts-config.json');
        if (response.ok) {
            const data = await response.json();
            if (data.key) {
                window.TRIAL_KEY = data.key;
                console.log("🎁 Trial TTS Key Loaded");
            }
        }
    } catch (e) { }
})();

/// --- Конфигурация путей ---
// The canonical Pali for TTS comes from the site's own API, not from the DOM: in memorize mode the
// page shows first letters only ("Kyspa"), and in Brahmi/Devanagari script settings it shows another
// script — read aloud, both are gibberish (dg-node issue #21). The old path
// (/assets/texts/devanagari/root/pli/ms/<slug>_rootd-pli-ms.json) is flat and 404s for every slug —
// those files live under .../ms/sutta/<nikaya>/, so the DOM fallback was ALWAYS the one running.
// /api/text is also what the offline app answers from its own SQLite (dg-app-full app.js fetch shim).
// Slug can arrive as "khudakka/snp1.8" (category prefix from the reader) — /api/text wants the id.
const makeJsonUrl = (slug) => `/api/text/${encodeURIComponent(String(slug).split('/').pop())}`;

// --- Глобальное состояние и Константы ---
let wakeLock = null; 

const SCROLL_STORAGE_KEY = 'dg_tts_auto_scroll'; 
const SEGMENT_DELAY_KEY = 'dg_tts_segment_delay';
const MODE_STORAGE_KEY = 'tts_preferred_mode';
const NATIVE_PALI_KEY  = 'tts_native_pali_enabled'; 
const NATIVE_TRN_KEY = 'tts_native_trn_enabled'; 

const RATE_PALI_KEY = 'tts_rate_pali'; 
const RATE_TRN_KEY = 'tts_rate_trn';

const LAST_SLUG_KEY = 'dg_tts_last_slug';   
const LAST_INDEX_KEY = 'dg_tts_last_index'; 
const PALI_ALERT_KEY = 'dg_tts_pali_alert_shown';
// Shared tail of both Pali hints (a function: window.isRu can change at runtime): own line, bold label, so it is clear what "offline" refers to.
const offlineHint = () => window.isRu
  ? '<br><b>Для офлайн:</b> поставьте системный голос индийского языка (хинди, лучше санскрит).'
  : '<br><b>For offline:</b> install a system voice for an Indian language (Hindi, ideally Sanskrit).';

// --- Google TTS Config ---
const GOOGLE_KEY_STORAGE = 'tts_google_key';
const GOOGLE_PALI_SETTINGS_KEY = 'tts_google_pali_custom_voice'; 

// Раздельные ключи для голоса перевода в зависимости от контекста
const GOOGLE_TRN_KEY_RU    = 'tts_google_trn_ru';
const GOOGLE_TRN_KEY_EN    = 'tts_google_trn_en';
const GOOGLE_TRN_KEY_STUDY = 'tts_google_trn_study'; // Для /d/ и /memorize/

let googleVoicesList = []; 

// Дефолтные настройки для Пали
const DEFAULT_PALI_CONFIG = { languageCode: 'pa-IN', name: 'pa-IN-Chirp3-HD-Achird' };

// --- Изолируем память для BB ---
function getSavedSlugName(slug) {
    if (!slug) return slug;
    return window.location.pathname.includes('/b/') ? 'bb_' + slug : slug;
}



// --- ЛОГИКА ОПРЕДЕЛЕНИЯ КОНТЕКСТА (язык перевода) ---
// Owner: "не имеет смысла читать латиницу русским [голосом] и кириллицу английским" —
// this used to bucket by legacy PHP URL path prefix (/ru/, /r/, /ml/), which never occurs in
// dg-node's clean SPA URLs (/mn28?lang=ru is just /mn28) — so every SPA reader page silently
// fell into the 'en' bucket regardless of the real content language, and switching the reading
// language in-SPA never changed anything either (pathname never changes). Now driven by the
// actual detected segment/page language (Cyrillic vs Latin script, see detectDynamicLang/
// detectTranslationLang) instead. ponytail: only ru/en voice buckets for now (owner: "с
// немецким и тп уже будем после решать") — any other language still falls back to the 'en'
// bucket rather than crashing; a real per-language bucket is the upgrade path once needed.
function getContextInfo(langCode) {
  const path = window.location.pathname;

  // Режим заучивания: Indian voice context for both slots. The SPA addresses it as a reader mode
  // (?mode=memorize / ?mode=devanagari — see configs/reader/mode-table.json), so the URL no longer
  // contains /memorize/ or /d/; both spellings are accepted because this file is shared with the
  // legacy reader page, which is still served for its own URLs.
  var dgMode = new URLSearchParams(window.location.search).get('mode');
  if (path.includes('/d/') || path.includes('/memorize/') || dgMode === 'memorize' || dgMode === 'devanagari') {
      return {
          type: 'study',
          storageKey: GOOGLE_TRN_KEY_STUDY,
          defaultConfig: { languageCode: 'pa-IN', name: 'pa-IN-Chirp3-HD-Achird' },
          isIndianContext: true
      };
  }

  const lang = langCode || detectTranslationLang();

  if (lang === 'ru') {
      return {
          type: 'ru',
          storageKey: GOOGLE_TRN_KEY_RU,
          defaultConfig: { languageCode: 'ru-RU', name: 'ru-RU-Standard-D' },
          isIndianContext: false
      };
  }

  return {
      type: 'en',
      storageKey: GOOGLE_TRN_KEY_EN,
      defaultConfig: { languageCode: 'en-US', name: 'en-US-Standard-D' },
      isIndianContext: false
  };
}

const PALI_RATIO = 0.6; 

// Speed sliders: one for Pali, one for translations; every engine (Google, the self-hosted Pali voice,
// the native/system voice) reads the same two keys. Until the user moves it, the Pali speed is the
// engine's own normal pace (owner): DG voice 0.7, Google 0.8, OS voice 0.8.
const PALI_ENGINE_DEFAULT_RATE = { dg: 0.7, google: 0.8, native: 0.8 };
const RATE_RANGE = {
  pali: {
    key: RATE_PALI_KEY, min: 0.25, max: 2.0, step: 0.05,
    get def() { return PALI_ENGINE_DEFAULT_RATE[getTtsEngine()] || 0.8; },
    get presets() { return [0.5, this.def, 1.0, 1.5, 2.0]; }
  },
  trn: { key: RATE_TRN_KEY, min: 0.5, max: 2.5, step: 0.05, def: 1.0, presets: [0.75, 1.0, 1.25, 1.5, 2.0] }
};

function savedRate(kind) {
  const r = RATE_RANGE[kind];
  const v = parseFloat(localStorage.getItem(r.key));
  return isNaN(v) ? r.def : Math.min(r.max, Math.max(r.min, v));
}

const ttsState = {
  playlist: [],
  currentIndex: 0,
  button: null,
  speaking: false,
  paused: false,
  utterance: null,   
  googleAudio: null, 
  langSettings: null,
  autoScroll: localStorage.getItem(SCROLL_STORAGE_KEY) !== 'false', 
  currentSlug: null,
  endIndex: undefined,
  startIndex: undefined, 
  isNavigating: false 
};

// Восстанавливаем сохраненную задержку (в миллисекундах)
window.TTS_SEGMENT_DELAY = (parseFloat(localStorage.getItem(SEGMENT_DELAY_KEY)) || 0) * 1000;

const synth = window.speechSynthesis;

// playBrowserTTS() only sets utterance.voice when the user picked a custom native voice —
// otherwise it sets utterance.lang and lets the engine pick a default voice for that tag.
// synth.getVoices() is the classic Web Speech API race: it can return [] synchronously right
// after page load and populate later via 'voiceschanged'. Without waiting for that, the very
// first speak() of a session can resolve to whatever system-default voice is active (commonly
// English) even though utterance.lang is correctly 'ru-RU' — every later utterance is fine
// because by then the voice list has populated (owner: "первая строчка читается с англ
// акцентом, потом по-русски"). Resolves immediately once the list is non-empty; otherwise waits
// once for 'voiceschanged' with a safety timeout so playback never hangs if a browser never
// fires it.
function ensureVoicesReady() {
    if (synth.getVoices().length > 0) return Promise.resolve();
    return new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            synth.removeEventListener('voiceschanged', finish);
            resolve();
        };
        synth.addEventListener('voiceschanged', finish);
        setTimeout(finish, 400);
    });
}

// --- Утилиты ---

// --- "Вечная Тишина" (Heartbeat Audio) ---
const SILENCE_URL = '/assets/sounds/silence.mp3';
let silenceAudio = new Audio(SILENCE_URL);
silenceAudio.loop = true; 
silenceAudio.volume = 0.05;

// Глобальный плеер для Google TTS (для обхода блокировки iOS)
window.sharedGoogleAudio = new Audio();


function showToast(message) {
    const oldToast = document.getElementById('tts-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.id = 'tts-toast';
    toast.innerText = message;
    Object.assign(toast.style, {
        position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
        backgroundColor: 'rgba(50, 50, 50, 0.9)', color: '#00ff00', padding: '12px 24px',
        borderRadius: '8px', zIndex: '10000', fontSize: '14px', pointerEvents: 'none',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)', fontFamily: 'sans-serif', textAlign: 'center',
        transition: 'opacity 0.5s'
    });
    document.body.appendChild(toast);
    
    setTimeout(() => { 
        if(toast.parentNode) {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        } 
    }, 3000);
}

function toggleSilence(enable) {
    if (enable) {
        // --- ИСПРАВЛЕНИЕ ---
        // Проверяем, что загружен именно наш mp3, иначе перезаряжаем его
        if (!silenceAudio.src || !silenceAudio.src.includes('silence.mp3')) {
             silenceAudio.src = SILENCE_URL;
        }
        
        if (!silenceAudio.paused) return;
        // -------------------

        const playPromise = silenceAudio.play();

        if (playPromise !== undefined) {
            playPromise.then(() => {
                // Media Session Setup
                if ('mediaSession' in navigator) {
                    // ЯВНО ГОВОРИМ ANDROID, ЧТО МЫ ИГРАЕМ (убираем баги анимации)
                    navigator.mediaSession.playbackState = 'playing';
                  
                    const slug = new URLSearchParams(location.search).get('q')?.toLowerCase() || ttsState.currentSlug || '';

                    // 1. Ищем заголовок Пали
                    const paliNode = document.querySelector('h1 .pli-lang, .pli-lang h1, h1[lang="pi"], [lang="pi"] h1');
                    const paliH1 = paliNode ? paliNode.innerText.trim() : '';

                    // document.title уже собран мегаридером в формате "Название slug" (см.
                    // megareader.js renderNavigation) — берём его как есть вместо пересборки
                    // из texttype/slug (data-slug вида "Dhamma/mn28"), которое раньше вылезало
                    // сырым текстом в уведомлении на устройствах/плеерах без обложки.
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: document.title || `${slug} ${paliH1}`.trim(),
                        artist: "Dhamma.gift Voice",
                        artwork: [{ src: '/assets/img/albumart.png', sizes: '1024x1024', type: 'image/png' }]
                    });

                    navigator.mediaSession.setActionHandler('play', () => { 
                        document.querySelector('.play-main-button')?.click();
                    });
                    navigator.mediaSession.setActionHandler('pause', () => {
                        document.querySelector('.play-main-button')?.click();
                    });
                    navigator.mediaSession.setActionHandler('previoustrack', () => {
                        document.querySelector('.prev-main-button')?.click();
                    });
                    navigator.mediaSession.setActionHandler('nexttrack', () => {
                        document.querySelector('.next-main-button')?.click();
                    });
                }
            }).catch(e => {
               console.warn("Silence file playback failed:", e);
            });
        }
    } else {
        // --- PAUSE ---
        if (!silenceAudio.paused) {
            silenceAudio.pause();
            
            if ('mediaSession' in navigator) {
                // ЯВНО ГОВОРИМ ANDROID, ЧТО МЫ НА ПАУЗЕ (останавливает "змейку")
                navigator.mediaSession.playbackState = 'paused'; 
                
                // ВАЖНО: Мы БОЛЬШЕ НЕ удаляем метаданные и кнопки здесь!
                // Иначе плеер в шторке станет пустым и перестанет реагировать.
            }
        }
    }
}

// The speed button + its slider act on the language being read now (in mixed modes they switch
// with every segment, like the old dropdown did); idle, on the one the mode starts with.
function activeRateKind() {
  const item = ttsState.playlist[ttsState.currentIndex];
  if (ttsState.speaking && item) return item.lang === 'pi-dev' ? 'pali' : 'trn';
  return localStorage.getItem(MODE_STORAGE_KEY) === 'pi' ? 'pali' : 'trn';
}

function formatRate(v, digits) {
  return (digits ? v.toFixed(digits) : String(Math.round(v * 100) / 100)) + '×';
}

// Points the speed button and slider at one language; storage may also have changed from another
// tab or the cloud sync, so the value is re-read every time.
function markActiveRate(isPali) {
  const kind = isPali ? 'pali' : 'trn';
  const r = RATE_RANGE[kind], v = savedRate(kind);
  const btn = document.getElementById('tts-rate-btn');
  const slider = document.getElementById('tts-rate-slider');
  if (btn) {
    btn.textContent = formatRate(v);
    btn.title = (isPali ? (window.isRu ? 'Скорость Пали' : 'Pāḷi speed') : (window.isRu ? 'Скорость перевода' : 'Translation speed'))
      + ' · − / = / R';
  }
  if (slider) {
    slider.dataset.kind = kind;
    slider.min = r.min; slider.max = r.max; slider.step = r.step;
    slider.value = v;
  }
  showRatePopValue(v);
  const kindLabel = document.getElementById('tts-rate-kind');
  if (kindLabel) kindLabel.textContent = '· ' + (isPali ? (window.isRu ? 'Пали' : 'Pāḷi') : (window.isRu ? 'Перевод' : 'Translation'));
  const presets = document.getElementById('tts-rate-presets');
  const presetsId = kind + ':' + r.def + ':' + window.isRu;  // the Pali set depends on the engine's default
  if (presets && presets.dataset.kind !== presetsId) {
    presets.dataset.kind = presetsId;
    const normal = window.isRu ? 'обычная' : 'normal';
    presets.style.gridTemplateColumns = `repeat(${r.presets.length},1fr)`;
    presets.innerHTML = r.presets.map(p =>
      `<button type="button" class="tts-rate-preset" data-rate="${p}">${p}${p === r.def ? `<small>${normal}</small>` : ''}</button>`).join('');
  }
  presets?.querySelectorAll('.tts-rate-preset').forEach(b => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.rate - v) < 0.001)));
}

// The speed popup lives on <body>, floating above the speed button: inside the player it was
// clipped, and growing the bottom-anchored player moved the button away from the cursor.
function ensureRatePop() {
  let pop = document.getElementById('tts-rate-pop');
  if (pop) return pop;
  const t = ttsUiText();
  document.body.insertAdjacentHTML('beforeend', `
    <div id="tts-rate-pop" class="tts-win tts-rate-select" role="dialog" aria-label="${t.speed}">
      <div class="tts-wh"><span class="t"><span data-t="speed">${t.speed}</span> <small id="tts-rate-kind"></small></span><button type="button" class="tts-ib close-tts-win" title="Esc">×</button></div>
      <div id="tts-rate-title" class="tts-rv"></div>
      <div class="tts-rm" data-t="speedSep">${t.speedSep}</div>
      <div class="tts-rl">
        <button type="button" class="tts-ib tts-rate-step" data-step="-1" title="− (−)">−</button>
        <input type="range" id="tts-rate-slider" class="tts-rate-slider" aria-label="speed">
        <button type="button" class="tts-ib tts-rate-step" data-step="1" title="+ (=)">+</button>
      </div>
      <div id="tts-rate-presets" class="tts-rc"></div>
    </div>`);
  return document.getElementById('tts-rate-pop');
}

// --- Floating windows (speed, mode menu, voice picker), design v4: they fade and rise in, one at a time ---
function closeTtsWins() {
  // closing the voice picker without choosing (×, Esc, a click outside, another window) puts it back
  if (ttsVoiceWin.lang && !ttsVoiceWin.picked) restoreVoiceWin();
  document.querySelectorAll('.tts-win.on').forEach(w => w.classList.remove('on'));
  document.querySelectorAll('#tts-rate-btn, #tts-mode-chip').forEach(b => b.setAttribute('aria-expanded', 'false'));
  ttsVoiceWin.lang = null;
}

// An ancestor may scale (page zoom / font-size setting) or transform (dark theme) the page, so
// position:fixed coordinates are not viewport pixels: probe where (0,0) lands and at what scale
// (with the opening transform off, or the probe is 4% short). where(w, h) -> viewport {left, top}.
function placeTtsWin(win, where) {
  win.style.maxHeight = Math.min(440, window.innerHeight - 16) + 'px';
  const transition = win.style.transition;
  win.style.transition = 'none';
  win.style.transform = 'none';
  win.style.left = '0px';
  win.style.top = '0px';
  const p0 = win.getBoundingClientRect();
  const scale = p0.width / win.offsetWidth || 1;
  const { left, top } = where(p0.width, p0.height);
  win.style.left = (left - p0.left) / scale + 'px';
  win.style.top = (top - p0.top) / scale + 'px';
  win.style.transform = '';
  win.offsetHeight;  // commit the closed pose before the transition comes back
  win.style.transition = transition;
}

// Over the player, centred on it and covering its top edge, never off screen
function overPlayer(w, h) {
  const p = document.querySelector('#voice-player-container .voice-player')?.getBoundingClientRect()
    || { left: window.innerWidth / 2, width: 0, top: window.innerHeight };
  return {
    left: Math.max(8, Math.min(window.innerWidth - 8 - w, p.left + p.width / 2 - w / 2)),
    top: Math.max(8, Math.min(window.innerHeight - h - 8, p.top - h + 80))
  };
}

function showRatePopValue(v) {
  const title = document.getElementById('tts-rate-title');
  if (title) title.textContent = formatRate(v, 2);
  const slider = document.getElementById('tts-rate-slider');
  if (slider) slider.style.setProperty('--p', ((v - slider.min) / (slider.max - slider.min) * 100) + '%');
}

// Every speed control (-/+, presets, keys) just moves the slider and fires its change event,
// so saving and restarting playback stay in one place (handleTTSSettingChange).
function setSliderRate(value) {
  const slider = document.getElementById('tts-rate-slider');
  if (!slider) return;
  const r = RATE_RANGE[slider.dataset.kind || activeRateKind()];
  const next = Math.round(Math.min(r.max, Math.max(r.min, value)) * 100) / 100;
  if (next === parseFloat(slider.value)) return;
  slider.value = next;
  slider.dispatchEvent(new Event('change', { bubbles: true }));
}

function getRateForLang(lang) {
  return savedRate(lang === 'pi-dev' ? 'pali' : 'trn');
}

let isWakeLockActive = false; // Добавляем флаг состояния
// wakeLock.request() is async. Two calls made before the first one settles (the play click asks,
// then playCurrentSegment() asks again) used to acquire TWO locks and keep only the last one, so the
// first stayed held with nobody to release it — the screen never went off after playback ended
// (dg-app-full issue #18). One request at a time, and a release that arrives while a request is
// still pending cancels it.
let wakeLockPending = false;
let wantWakeLock = false;

async function requestWakeLock() {
  wantWakeLock = true;
  if (!('wakeLock' in navigator) || isWakeLockActive || wakeLockPending) return;
  wakeLockPending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!wantWakeLock) {
      // Playback ended (or was paused) while the request was in flight: give it straight back.
      try { await lock.release(); } catch (e) { /* already gone */ }
      return;
    }
    wakeLock = lock;
    isWakeLockActive = true;
    lock.addEventListener('release', () => {
      if (wakeLock === lock) isWakeLockActive = false;
      console.log('Wake Lock released by system');
    });
    console.log('Wake Lock acquired successfully');
  } catch (err) {
    console.warn(`Wake Lock error: ${err.name}, ${err.message}`);
    isWakeLockActive = false;
  } finally {
    wakeLockPending = false;
  }
}


async function releaseWakeLock() {
  wantWakeLock = false;
  if (wakeLock !== null) {
    const lock = wakeLock;
    wakeLock = null;
    isWakeLockActive = false;
    try { await lock.release(); } catch (e) { /* already gone */ }
  }
}

function clearTtsStorage() {
  localStorage.removeItem(LAST_SLUG_KEY);
  localStorage.removeItem(LAST_INDEX_KEY);
}

function cleanTextForTTS(text) {
  if (!text) return "";

  // 1. Стандартная базовая очистка (мусор, теги, сокращения)
  let clean = text
    .replace(/[Пп]ер\./g, 'Перевод') 
    .replace(/Англ,/g, 'английского,') 
    .replace(/ [Рр]ед\./g, ' отредактировано') 
    .replace(/Trn:/g, 'Translated by') 
    .replace(/Pāḷi MS/g, 'पालि महासङ्गीति')
    .replace(/”/g, '')
    .replace(/ पन[\.:, ]/g, 'पना ') 
    .replace(/ तेन[\.:, ]/g, 'तेना ') 
    .replace(/स्स[\.:, ]/g, 'स्सा ')
    .replace(/स[\.:, ]/g, 'सा ')
    .replace(/म्म[\.:, ]/g, 'म्मा ')
    .replace(/म[\.:, ]/g, 'मा ')
    .replace(/फस्स/g, 'प्हस्स')
    .replace(/फ/g, 'प्ह')
    .replace(/ज([िी])र/g, 'ज्ज$1र') // ФИКС ЗДЕСЬ: jira -> djira
    .replace(/…पे…/g, '…पेय्याल…')
    .replace(/’ति/g, 'ति')
    .replace(/\{.*?\}/g, '')
    .replace(/\(.*?\)/g, '')
    // "|"/"||" is danda punctuation (half-verse/verse pause), not noise — collapsing it to a
    // bare space would glue clauses together with no pause (cf. "казнить нельзя помиловать").
    // Map to real danda so TTS still pauses there, same as ";" is mapped below for long segments.
    .replace(/\|\|/g, ' ॥ ')
    .replace(/\|/g, ' । ')
    .replace(/[ \t]+/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/_/g, '').trim();

  // --- УМНАЯ ЛОГИКА (SMART SPLIT) ---
  const SAFE_LENGTH_LIMIT = 200;

  if (clean.length > SAFE_LENGTH_LIMIT) {
      clean = clean.replace(/;/g, ' ।');
      clean = clean.replace(/ होती /g, ' होती । ');
  }

  return clean;
}


// 'pause' = playing: the play triangle morphs into the pause bars (CSS on .tts-play.on)
function setButtonIcon(type) {
  document.querySelectorAll('.play-main-button').forEach(b => b.classList.toggle('on', type === 'pause'));
}

function resetUI() {
  document.querySelectorAll('.tts-active').forEach(el => el.classList.remove('tts-active'));
}

// Marks `item` as the currently-read segment (active-word + tts-active on its connected
// pali/translation lines) and scrolls it into view when autoScroll is on. Was duplicated with
// three slightly different, less complete copies (playCurrentSegment's own inline version, the
// prev/next paused-branch, and rebuildActivePlaylist's paused branch) — consolidated into one so
// every caller gets the same, most-complete behavior (paused nav/rebuild previously skipped
// active-word and the connected-elements grouping that playCurrentSegment always did).
//
// Search-results rows can be collapsed (DataTables Responsive dtr-hidden — the segment DOM still
// exists, just zero-size/invisible) — scrollIntoView on a hidden element is a no-op, and a
// display:none .tts-active is invisible regardless of its background-color, so there was no way
// to tell where reading was happening without expanding every row first (owner: "сейчас
// невозможно разобраться где идет чтение"). When the segment isn't actually rendered, this
// highlights+scrolls to its nearest <tr> instead (search/index.html: #results-tbody
// tr.tts-active-row) — doesn't force the row open, just keeps the currently-read result visible
// in the table, per owner: "может не разворачивать свернутые записи, но тогда подсвечивать ту
// строку".
function highlightAndScrollToItem(item) {
  if (!item || !item.element) return;

  document.querySelectorAll('.active-word').forEach(e => e.classList.remove('active-word'));
  document.querySelectorAll('.tts-active-row').forEach(e => e.classList.remove('tts-active-row'));
  resetUI();

  if (item.element.classList.contains('pli-lang')) {
    item.element.classList.add('active-word');
  }

  const segmentContainer = document.getElementById(item.id);
  let scrollTarget = item.element;

  if (segmentContainer) {
    const connectedElements = segmentContainer.querySelectorAll('.pli-lang, .rus-lang, .tha-lang, .eng-lang, .lang-2nd, [lang]');
    if (connectedElements.length > 0) {
      connectedElements.forEach(el => el.classList.add('tts-active'));
    } else {
      segmentContainer.classList.add('tts-active');
    }
    scrollTarget = segmentContainer;
  } else {
    item.element.classList.add('tts-active');
  }

  if (scrollTarget.offsetParent === null) {
    const row = scrollTarget.closest('tr');
    if (row) {
      row.classList.add('tts-active-row');
      scrollTarget = row;
    }
  }

  if (ttsState.autoScroll) {
    scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function fetchSegmentsData(slug) {
  // Принудительно отключаем загрузку SC-файлов для текстов Бхиккху Бодхи
  if (window.location.pathname.includes('/b/')) {
      return null;
  }
  
  try {
    const response = await fetch(makeJsonUrl(slug));
    if (!response.ok) return null;
    const data = await response.json();
    // { segments: [{segment, root_text, ...}] } -> { "sn1.8:1.1": "root text" }, the shape the
    // caller already expects (segment id -> Pali string).
    if (!data || !Array.isArray(data.segments)) return null;
    const map = {};
    data.segments.forEach(seg => { if (seg && seg.segment && seg.root_text) map[seg.segment] = seg.root_text; });
    return Object.keys(map).length ? map : null;
  } catch (e) { 
    console.warn(`Не удалось загрузить JSON для ${slug}`, e);
    return null; 
  }
}


/*
function detectTranslationLang() {
  const path = window.location.pathname;
  if (path.includes('/th/') || path.includes('/thml/')) return 'th';
  if (path.includes('/en/') || path.includes('/b/') || path.includes('/read/')) return 'en';
  return 'ru';
}
*/


/*
function detectTranslationLang() {
  // ---> НОВОЕ: Исключение ТОЛЬКО для новых статей (нет пали И это не Легаси) <---
  const hasPali = document.querySelectorAll('.pli-lang').length > 0;
  
  if (!hasPali && !isLegacyPage()) {
      const htmlLang = document.documentElement.lang ? document.documentElement.lang.toLowerCase() : '';
      if (htmlLang.startsWith('en')) return 'en';
      if (htmlLang.startsWith('th')) return 'th';
      if (htmlLang.startsWith('ru')) return 'ru';
  }

  // ---> СТАРАЯ ЛОГИКА (для сутт и Легаси работает как раньше) <---
  const path = window.location.pathname;
  if (path.includes('/th/') || path.includes('/thml/')) return 'th';
  if (path.includes('/en/') || path.includes('/b/') || path.includes('/read/')) return 'en';
  
  return 'ru';
}
*/

// dg-node: the SPA shell keeps an empty <div id="sutta" class="sutta"> in the DOM at all
// times (populated only in reader view, empty in search-results view) — a bare
// `document.querySelector('.sutta-container, .sutta') || document` always matches THIS empty
// div on the search-results page instead of falling through to `document`, so the TTS engine
// scanned zero Pali/translation elements there and silently fell back to
// prepareGeneralArticleData(), which then picked up unrelated page furniture (hero motto,
// generic segments) instead of the clicked quote line. Only trust the .sutta match if it
// actually has language-tagged content; otherwise scan the whole document like before dg-node
// added that persistent empty shell.
//
// That "has content" check alone isn't enough either: dg-node switches between home/results/
// reader by toggling a body.dg-state-* class (search/index.html dgSetState), never by tearing
// down #sutta's DOM — so #sutta keeps the LAST sutta's rendered markup even after navigating
// back to search results (owner: "проигрывает целиком сутту какую-либо" — whichever sutta was
// last open in the reader, not the clicked search-result quote). Once the state-class system is
// present (dg-node's own pages always set one of DG_STATES on load/route-change — see
// dgSetState), only trust #sutta while body is ACTUALLY in dg-state-reader; otherwise fall
// through to document, exactly like the truly-empty-#sutta case above. Pages with no dg-state-*
// system at all (legacy PHP r.php/tr.php, the theravada.ru adapter — isLegacyPage() above) never
// gain any dg-state-* class, so they keep the original content-only check unchanged.
function getSuttaContainer() {
    const c = document.querySelector('.sutta-container, .sutta');
    if (!c || !c.querySelector('[lang], .pli-lang')) return document;
    const hasStateSystem = /(^|\s)dg-state-\S+/.test(document.body.className);
    if (hasStateSystem && !document.body.classList.contains('dg-state-reader')) return document;
    return c;
}

function detectTranslationLang() {
    const container = getSuttaContainer();

    // 1. Атрибут lang — общий контракт у ВСЕХ рендереров (легаси PHP r.php/tr.php,
    // dg-node search-render.js, dg-node megareader.js) всегда ставят lang="ru"/"en"/...
    // на span с переводом, но расходятся в имени CSS-класса (rus-lang/eng-lang — легаси
    // трёхбуквенное сокращение; ru-lang/en-lang — dg-node megareader.js, ISO-код) — поэтому
    // lang-атрибут надёжнее любого конкретного имени класса.
    const langEl = container.querySelector('[lang]:not([lang="pi"])');
    if (langEl) {
        const code = langEl.getAttribute('lang').toLowerCase().split('-')[0];
        if (code) return code;
    }

    // 2. Легаси трёхбуквенные классы — на случай разметки вообще без lang-атрибута.
    if (container.querySelector('.eng-lang')) return 'en';
    if (container.querySelector('.rus-lang')) return 'ru';
    if (container.querySelector('.tha-lang')) return 'th';

    // 3. Только если ни атрибута, ни классов нет — падаем в legacy-логику по URL.
    const path = window.location.pathname;
    if (path.includes('/th/') || path.includes('/thml/')) return 'th';
    if (path.includes('/en/') || path.includes('/b/') || path.includes('/read/')) return 'en';

    // 4. Фолбек по системе письма — для страниц вообще без разметки перевода
    // (например prepareGeneralArticleData, обычные статьи без .pli-lang/.rus-lang и т.п.).
    const bodyText = container.textContent || '';
    if (/[฀-๿]/.test(bodyText)) return 'th';
    if (/[А-Яа-яЁё]/.test(bodyText)) return 'ru';

    return 'ru';
}


function getElementId(el) {
  return el.id || el.closest('[id]')?.id;
}

// --- Google API Helper & Voice Management ---

async function loadGoogleVoices(apiKey) {
    if (googleVoicesList.length > 0) return googleVoicesList; 

    try {
        const response = await fetch(`https://texttospeech.googleapis.com/v1/voices?key=${apiKey}`);
        const data = await response.json();
        if (data.voices) {
            // --- ФИЛЬТР БЕЗОПАСНОСТИ ---
            // Убираем голоса Studio, так как они платные сразу (без Free Tier)
            googleVoicesList = data.voices.filter(v => !v.name.includes('Studio'));
            // ---------------------------
            
            return googleVoicesList;
        } else if (data.error) {
             console.warn('Google API Error:', data.error);
             return [];
        }
    } catch (e) {
        console.warn('Не удалось загрузить список голосов Google:', e);
    }
    return [];
}


function setupVoiceSelectors(voices, langSelectId, voiceSelectId, storageKey, defaultConfig) {
    const langSelect = document.getElementById(langSelectId);
    const voiceSelect = document.getElementById(voiceSelectId);
    
    if (!langSelect || !voiceSelect) return;

    const languages = {}; 
    const voicesByLang = {}; 

    voices.forEach(v => {
        const langCode = v.languageCodes[0];
        if (!voicesByLang[langCode]) {
            voicesByLang[langCode] = [];
            languages[langCode] = langCode; 
        }
        voicesByLang[langCode].push(v);
    });

    const sortedLangs = Object.keys(languages).sort();

    let currentConfig = defaultConfig;
    const savedSettingRaw = localStorage.getItem(storageKey);
    if (savedSettingRaw) {
        try {
            currentConfig = JSON.parse(savedSettingRaw);
        } catch(e) {}
    }

    if (!languages[currentConfig.languageCode]) {
        currentConfig = defaultConfig; 
    }

    langSelect.innerHTML = sortedLangs.map(code => 
        `<option value="${code}" ${code === currentConfig.languageCode ? 'selected' : ''}>${code}</option>`
    ).join('');

    // Only Standard voices are billed at the cheap rate; WaveNet, Neural2, News, Studio, Journey,
    // Chirp, Polyglot... all at premium rates
    const isPremium = (name) => !name.includes('Standard');

    const renderVoices = (langCode, selectedVoiceName) => {
        const currentVoices = voicesByLang[langCode] || [];
        
        currentVoices.sort((a, b) => {
            if (a.ssmlGender !== b.ssmlGender) {
                if (a.ssmlGender === 'MALE') return -1;
                if (b.ssmlGender === 'MALE') return 1;
                return a.ssmlGender.localeCompare(b.ssmlGender);
            }
            const aPrem = isPremium(a.name);
            const bPrem = isPremium(b.name);
            if (aPrem && !bPrem) return -1;
            if (!aPrem && bPrem) return 1;
            
            return a.name.localeCompare(b.name);
        });

        let activeVoiceName = selectedVoiceName;
        if (!currentVoices.find(v => v.name === activeVoiceName)) {
            if (currentVoices.length > 0) {
                // The list puts premium voices first; for translations the fallback is a cheap one
                // (owner: premium is for Pāḷi only) - switching the language picked a premium voice.
                const cheap = storageKey !== GOOGLE_PALI_SETTINGS_KEY && currentVoices.find(v => !isPremium(v.name));
                activeVoiceName = (cheap || currentVoices[0]).name;
            }
        }

        voiceSelect.innerHTML = currentVoices.map(v => {
            const shortName = v.name.replace(langCode + '-', '');
            const premiumMarker = isPremium(v.name) ? '💎' : '📦'; 
            const genderMarker = v.ssmlGender === 'MALE' ? 'M' : (v.ssmlGender === 'FEMALE' ? 'F' : '?');
            const label = `${premiumMarker} [${genderMarker}] ${shortName}`;
            const isSelected = v.name === activeVoiceName;
            
            return `<option value="${v.name}" ${isSelected ? 'selected' : ''}>${label}</option>`;
        }).join('');
        
        return { languageCode: langCode, name: activeVoiceName };
    };

    let validConfig = renderVoices(langSelect.value, currentConfig.name);
    saveGoogleChoice(storageKey, validConfig.languageCode, validConfig.name);

    const newLangSelect = langSelect.cloneNode(true);
    langSelect.parentNode.replaceChild(newLangSelect, langSelect);
    
    const newVoiceSelect = voiceSelect.cloneNode(true);
    voiceSelect.parentNode.replaceChild(newVoiceSelect, voiceSelect);

    newLangSelect.onchange = () => {
        const newLang = newLangSelect.value;
        const newValidConfig = renderVoices(newLang, ''); 
        saveGoogleChoice(storageKey, newValidConfig.languageCode, newValidConfig.name);
    };

    newVoiceSelect.onchange = () => {
        saveGoogleChoice(storageKey, newLangSelect.value, newVoiceSelect.value);
    };
}

function saveGoogleChoice(key, langCode, voiceName) {
    if (!langCode || !voiceName) return;
    const settings = {
        languageCode: langCode,
        name: voiceName
    };
    localStorage.setItem(key, JSON.stringify(settings));
}

// --- ОСНОВНАЯ ФУНКЦИЯ ПОПУЛЯЦИИ СПИСКОВ (УЧИТЫВАЕТ КОНТЕКСТ) ---
async function populateVoiceSelectors(apiKey, forceRefresh = false) {
    const container = document.getElementById('google-voice-settings-container');
    if (container) container.style.display = 'block';

    if (forceRefresh) {
        googleVoicesList = []; 
    }

    const allSelects = document.querySelectorAll('.google-voice-select-group select:not(.tts-engine-dropdown)');
    if (googleVoicesList.length === 0) {
        allSelects.forEach(s => s.innerHTML = '<option>Loading...</option>');
    }

    const voices = await loadGoogleVoices(apiKey);
    if (!voices || !voices.length) {
        allSelects.forEach(s => s.innerHTML = '<option>Error / No Key</option>');
        return;
    }

    // Вспомогательная функция проверки на "Индийский регион"
    const isIndianLang = (code) => {
        return code.includes('-IN') || code.includes('ne-NP') || code.includes('si-LK');
    };

    // 1. Для Пали: Только Индийские
    const paliVoices = voices.filter(v => isIndianLang(v.languageCodes[0]));

    // 2. Для Перевода: Зависит от реального языка страницы (не от URL-пути, см. getContextInfo)
    const context = getContextInfo(detectTranslationLang());
    let trnVoices = [];

    if (context.isIndianContext) {
        // Study modes (memorize/devanagari) -> offer Indian languages
        trnVoices = voices.filter(v => isIndianLang(v.languageCodes[0]));
    } else {
        // Иначе -> Русский, Английский, Тайский
        trnVoices = voices.filter(v => {
            const code = v.languageCodes[0];
            return code.startsWith('ru-') || code.startsWith('en-') || code.startsWith('th-');
        });
    }

    // --- НАСТРОЙКА UI ---

    // 1. Настройка Pali
    setupVoiceSelectors(paliVoices, 'google-lang-select-pali', 'google-voice-select-pali', GOOGLE_PALI_SETTINGS_KEY, DEFAULT_PALI_CONFIG);

    // 2. Настройка Translation (используем динамический ключ и конфиг)
    
    // Пытаемся найти умный дефолт, если сохраненного нет
    let bestDefaultVoice = null;

    if (context.isIndianContext) {
         // Для Study режима ищем Хинди или Санскрит
         bestDefaultVoice = trnVoices.find(v => v.name.includes('pa-IN-Standard-D')) || 
                            trnVoices.find(v => v.languageCodes[0] === 'pa-IN') ||
                            trnVoices[0];
    } else {
        // Для обычного режима
        const pageLang = detectTranslationLang(); 
        const preferredName = (pageLang === 'ru') ? 'ru-RU-Standard-D' : 
                              (pageLang === 'th') ? 'th-TH-Standard-A' : 'en-US-Standard-D';
        
        bestDefaultVoice = trnVoices.find(v => v.name === preferredName) || 
                           trnVoices.find(v => v.name.includes('Standard') && v.languageCodes[0].startsWith(pageLang)) ||
                           context.defaultConfig;
    }
    
    // Fallback
    const finalDefaultConfig = (bestDefaultVoice && bestDefaultVoice.languageCodes) ? { languageCode: bestDefaultVoice.languageCodes[0], name: bestDefaultVoice.name } : context.defaultConfig;

    // Важно: передаем context.storageKey
    setupVoiceSelectors(trnVoices, 'google-lang-select-trn', 'google-voice-select-trn', context.storageKey, finalDefaultConfig);
    
}


// --- ПОЛУЧЕНИЕ АУДИО (УЧИТЫВАЕТ КОНТЕКСТ) ---
const PALI_VOICE_KEY = 'tts_pali_voice';

// Voice engines, chosen separately for Pali and for the translation in the voice settings
// (engine -> language -> voice). Pali: 'dg' = our self-hosted voice, 'google', 'native' (OS).
// Translation: 'dg' (Piper voice of the translation language; default), 'google', 'native'. Stored in the existing
// keys (tts_pali_voice + the native toggles), so they sync like the other settings.
function getTtsEngine() {  // the Pali engine
  if (localStorage.getItem(NATIVE_PALI_KEY) === 'true') return 'native';
  return localStorage.getItem(PALI_VOICE_KEY) === 'off' ? 'google' : 'dg';
}

const TRN_ENGINE_KEY = 'tts_trn_engine';

function getTrnEngine() {
  if (localStorage.getItem(NATIVE_TRN_KEY) === 'true') return 'native';
  return localStorage.getItem(TRN_ENGINE_KEY) === 'google' ? 'google' : 'dg';  // DG by default (owner)
}

function setTrnEngine(engine) {
  localStorage.setItem(NATIVE_TRN_KEY, engine === 'native');
  localStorage.setItem(TRN_ENGINE_KEY, engine === 'dg' ? 'dg' : 'google');
}

// DG voices come from the voice service, like Google's voice list (GET /voices: id, language, menu label, in menu
// order; a language's first voice is its default). Nothing is listed here: voices are added, renamed or dropped on the
// server only. The last list is kept in localStorage, so the menus are there at once; it is refreshed on every load.
// A translation language without DG voices is read by Google.
const DG_TRN_VOICES = {};   // lang -> [{id, label}]
const DG_PALI_VOICES = [];  // [{id, label}]
function setDgVoices(list) {
  DG_PALI_VOICES.length = 0;
  Object.keys(DG_TRN_VOICES).forEach(k => delete DG_TRN_VOICES[k]);
  list.forEach(v => {
    const item = { id: v.id, label: v.label };
    if (v.lang === 'pi') DG_PALI_VOICES.push(item);
    else (DG_TRN_VOICES[v.lang] = DG_TRN_VOICES[v.lang] || []).push(item);
  });
}
try { setDgVoices(JSON.parse(localStorage.getItem('dg_voices') || '[]')); } catch (e) {}

function dgTrnVoice(lang) {
  const list = DG_TRN_VOICES[lang];
  if (!list) return null;
  const saved = localStorage.getItem('tts_dg_voice_' + lang);
  return list.some(v => v.id === saved) ? saved : list[0].id;
}

// Fresh copy of a select: drops change handlers another engine's list attached to it.
function freshSelect(id) {
  const old = document.getElementById(id);
  if (!old) return null;
  const copy = old.cloneNode(false);
  old.parentNode.replaceChild(copy, old);
  return copy;
}

function setPaliEngine(engine) {
  localStorage.setItem(PALI_VOICE_KEY, engine === 'dg' ? 'on' : 'off');
  localStorage.setItem(NATIVE_PALI_KEY, engine === 'native');
}

// For the Memo page's mp3 download: which DG voice and pace would read this text now (null when the
// chosen engine for it is not DG), and where the service's /memo is.
window.dgVoiceFor = function (isPali, lang) {
  if (isPali) {
    if (getTtsEngine() !== 'dg') return null;
    return { voice: dgPaliVoice(), rate: savedRate('pali') / 0.8, urls: DG_TTS_URLS.map(u => u.replace(/\/pali$/, '/memo')) };
  }
  const voice = getTrnEngine() === 'dg' ? dgTrnVoice(lang) : null;
  if (!voice) return null;
  return { voice, rate: getRateForLang(lang), urls: DG_TTS_URLS.map(u => u.replace(/\/pali$/, '/memo')) };
};

function dgPaliVoice() {
  const saved = localStorage.getItem('tts_dg_voice_pi');
  return DG_PALI_VOICES.some(v => v.id === saved) ? saved : DG_PALI_VOICES[0]?.id;  // none yet: the server's default
}

// Raw IAST for the self-hosted voice: drop variant readings in {…} and (…), like cleanTextForTTS does.
function stripForPaliVoice(text) {
  return (text || '').replace(/\{.*?\}/g, '').replace(/\(.*?\)/g, '').replace(/[ \t]+/g, ' ').trim();
}

// DG voice: Piper behind /api/tts/pali (dg-fastify.js): Pali with the pali-tts listening-test rules,
// or a translation voice (voice id, e.g. 'ruslan').
// Answers like Google ({audioContent}: base64 mp3). Speed 0.8 = the voice's tuned pace (the default 0.7 is a bit slower).
// The browser calls the voice servers directly, like Google's API (public, CORS), in this order:
// api.dhamma.gift, api2.dhamma.gift (the reserve, TTS only), then this site's own /api/tts/pali. Server names,
// not machines: which server answers is set in DNS (never hardcode f1/f2/f3 here).
// Then Google (see playCurrentSegment).
const DG_TTS_URLS = [window.DG_TTS_URL || 'https://api.dhamma.gift/api/tts/pali', 'https://api2.dhamma.gift/api/tts/pali',
                     '/api/tts/pali'];

// The voice list (see setDgVoices), from the first server that answers. Playback and the voice menus wait for it
// at most 3 s; meanwhile (or if no server answers) the list from the last visit is used.
const dgVoicesLoaded = (async () => {
  for (const url of DG_TTS_URLS) {
    try {
      const r = await fetch(url.replace(/\/pali$/, '/dg-voices'), { signal: AbortSignal.timeout(4000) });
      const list = r.ok ? (await r.json()).voices : null;
      if (!Array.isArray(list) || !list.length) continue;
      setDgVoices(list);
      try { localStorage.setItem('dg_voices', JSON.stringify(list)); } catch (e) {}
      return true;
    } catch (e) {}
  }
  return false;
})();
const dgVoicesReady = () => Promise.race([dgVoicesLoaded, new Promise(r => setTimeout(r, 3000))]);

async function fetchPaliVoiceAudio(text, uiRate, voice) {
  // Pali: menu 0.8 = the voice's tuned pace; translation voices: 1.0 = their own pace
  voice = voice || dgPaliVoice();
  const isPaliVoice = !voice || DG_PALI_VOICES.some(v => v.id === voice);  // no voice: the server's Pali default
  const rate = isPaliVoice ? uiRate / 0.8 : uiRate;
  const body = JSON.stringify({ text, rate, voice });
  // The voice downloaded to the device (voice-offline.js): used with no network, or when the servers fail / are slow
  const offIds = dgOffIds(), vid = voice || offIds[0];
  const local = offIds.includes(vid) ? () => dgOffline().then(m => m.speak(text, rate, vid)) : null;
  if (local && !navigator.onLine) return local();
  let lastError;
  for (const url of DG_TTS_URLS) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body,
                                   signal: AbortSignal.timeout(local ? 5000 : 20000) });
      if (r.ok) return (await r.json()).audioContent;
      lastError = new Error(url + ' HTTP ' + r.status);
    } catch (e) {
      lastError = e;
    }
  }
  if (local) return local();
  throw lastError;
}
const dgOffline = () => import('/read/js/voice-offline.js?v=2026-10-10gain');
const dgOffIds = () => (localStorage.getItem('dg_voice_offline') || '').split(',').filter(Boolean);
if (dgOffIds().length && navigator.onLine) {  // newer rules for the downloaded voices, quietly
  setTimeout(() => dgOffline().then(m => m.refresh()).then(dgOfflineRender).catch(() => {}), 5000);
}

// Offline voices. Managed in the DG voice list itself (owner: a download icon next to each Pali voice, then a delete
// one); offered on a card above the player (dgOffCard); a settings row that names what is downloaded and opens that
// list. The full reset removes them too.
let dgOffKnown = null, dgOffAsk = null;  // the service's offline voices {id: {label, lang, bytes, tag}}, fetched once
let dgOffEspeak = null;  // sizes of espeak's code and packs {code, core, en, ru} (the en/ru voices)
let dgOffBusy = null;  // {vid, p} while a voice downloads
function dgOffVoices() {
  dgOffAsk = dgOffAsk || dgOffline().then(m => m.list().then(() => m.offer())).then(o => (dgOffEspeak = o.espeak, dgOffKnown = o.voices))
    .catch(e => { dgOffAsk = null; throw e; });
  return dgOffAsk;
}
// MB to download: the model, plus onnxruntime and the engine with the first voice, plus for en/ru espeak's code and
// common data with the first of them and the language's dictionary with its first voice
function dgOffMb(v) {
  const ids = dgOffIds(), langs = ids.map(id => dgOffKnown?.[id]?.lang);
  let b = v.bytes + (ids.length ? 0 : 14239897);
  if ((v.lang === 'en' || v.lang === 'ru') && dgOffEspeak) {
    const wire = pack => dgOffEspeak.gz?.[pack] ?? dgOffEspeak[pack];  // the packs travel gzipped (ru 9 MB -> 5 MB)
    b += (langs.some(l => l === 'en' || l === 'ru') ? 0 : dgOffEspeak.code + wire('core')) + (langs.includes(v.lang) ? 0 : wire(v.lang));
  }
  return Math.round(b / 1048576);
}
const DG_OFF_DOWN = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3v12m0 0l-5-5m5 5l5-5M4 20h16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// The icon next to a DG voice (Pali, en, ru) in the voice list (renderVoiceWin)
function dgOffIcon(vid) {
  if (!dgOffKnown) {
    dgOffVoices().then(dgOfflineRender).catch(() => {});
    return '';
  }
  const v = dgOffKnown[vid], t = ttsUiText();
  if (!v) return '';  // not offered offline (the own voice)
  if (dgOffBusy?.vid === vid) return `<span class="tts-offic busy">${Math.round(dgOffBusy.p * 100)}%</span>`;
  const stale = (localStorage.getItem('dg_voice_offline_stale') || '').split(',').includes(vid);
  if (dgOffIds().includes(vid) && !stale) {
    return `<button type="button" class="tts-ib tts-offic on" data-offdel="${vid}" title="${t.offHave} · ${t.offDel}"><i class="tts-gi" style="--u:url('/assets/svg/trash-can-regular-full.svg')"></i></button>`;
  }
  // (the owner's own voices: CC BY-NC-SA 4.0)
  return `<button type="button" class="tts-ib tts-offic" data-offvid="${vid}" title="${stale ? t.offUpd : t.offGet} · ${dgOffMb(v)} ${t.mb}${v.license ? ' · ' + v.license : ''}">${DG_OFF_DOWN}</button>`;
}

// The card above the player (owner: a separate plate in the player's style, informative, with retry and a way to
// the voice list). One card, one state at a time:
//   offer   - after the first Pali line the DG voice read online, the voice is offered offline and not on the device
//             [Download] [Later: this session] [No thanks: never; the voice list still has the icons]
//   loading - progress bar, MB of MB, [Cancel] (from the card, the voice list icon or the settings row)
//   done    - closes by itself
//   error   - why (no network / no space / the service), [Retry] [DG voices]
//   stale   - the service has a newer model of a downloaded voice [Update] [Later]
//   nonet   - no network and the voice is not downloaded: the device's voice reads now, download when online [OK]
let dgOffCardState = null;
function dgOffName(vid) { return (dgOffKnown?.[vid]?.label || vid || '').split(' ')[0]; }

function dgOffCard(kind, info = {}) {
  let card = document.getElementById('tts-off-card');
  const player = document.querySelector('#voice-player-container .voice-player');
  clearTimeout(dgOffCard.timer);
  if (!kind || !player || !player.getClientRects().length) {  // (a fixed player has no offsetParent)
    card?.classList.remove('on');
    dgOffCardState = null;
    return;
  }
  if (!card) {
    document.body.insertAdjacentHTML('beforeend', '<div id="tts-off-card" class="tts-card" role="status" aria-live="polite"></div>');
    card = document.getElementById('tts-off-card');
  }
  dgOffCardState = { kind, ...info };
  const t = ttsUiText(), name = dgOffName(info.vid), v = dgOffKnown?.[info.vid];
  const btn = (attr, text) => `<button type="button" class="tts-chip main" ${attr}>${text}</button>`;
  const x = (attr, title) => `<button type="button" class="tts-ib" ${attr} title="${title}">&times;</button>`;
  let text, act = '', close = x('data-offcard="close"', t.close), pct = null;
  if (kind === 'offer') {
    text = t.offOffer;
    act = btn(`data-offvid="${info.vid}"`, `${t.offGet} · ${dgOffMb(v)} ${t.mb}`);
    close = x('data-offcard="later"', t.offLater);
  } else if (kind === 'loading') {
    pct = Math.round((info.p || 0) * 100);
    text = `${t.offLoadT} · ${pct}%`;
    close = x('data-offcard="cancel"', t.offCancel);
  } else if (kind === 'done') {  // where the downloaded voices are managed: the DG Pali voice list
    text = t.offDoneT;
    act = `<button type="button" class="tts-chip main ic" data-offcard="voices" title="${t.offSettings}" aria-label="${t.offSettings}"><i class="tts-gi" style="--u:url('/assets/svg/gear.svg')"></i></button>`;
  } else if (kind === 'error') {
    text = `${info.why === 'space' ? t.offErr.space(dgOffMb(v)) : info.why === 'net' ? t.offErr.net : t.offErr.server} <a href="javascript:void(0)" data-offcard="voices">${t.offVoicesBtn}</a>`;
    act = btn(`data-offvid="${info.vid}"`, t.offRetry);
  } else if (kind === 'stale') {
    text = t.offStaleT(name);
    act = btn(`data-offvid="${info.vid}"`, `${t.offUpd} · ${dgOffMb(v)} ${t.mb}`);
    close = x('data-offcard="later"', t.offLater);
  } else if (kind === 'nonet') {
    text = t.offNonetT;
  }
  card.className = 'tts-card on' + (kind === 'error' ? ' err' : '');
  card.innerHTML = `${DG_OFF_DOWN}<span class="tx">${text}</span>${act}${close}` +
    (pct !== null ? `<i class="bar" style="width:${pct}%"></i>` : '');
  const p = player.getBoundingClientRect();
  card.style.width = p.width + 'px';
  placeTtsWin(card, abovePlayer);
  card.style.maxHeight = '';
  if (kind === 'done' || kind === 'nonet') dgOffCard.timer = setTimeout(() => dgOffCard(null), 8000);
}

// Right above the player, centred on it, never off screen
function abovePlayer(w, h) {
  const p = document.querySelector('#voice-player-container .voice-player').getBoundingClientRect();
  return { left: Math.max(8, Math.min(window.innerWidth - 8 - w, p.left + p.width / 2 - w / 2)), top: Math.max(8, p.top - h - 6) };
}

// After a Pali line the DG voice read (playCurrentSegment): offer the voice, or its update, once
let dgOffLines = 0;  // Pali lines the DG voice read on this page: the offer waits for the 3rd (owner: not at once)
async function dgOfflineOffer() {
  const vid = dgPaliVoice();
  if (++dgOffLines < 3 || dgOffCardState || dgOffBusy) return;
  try { await dgOffVoices(); } catch (e) { return; }
  if (!dgOffKnown[vid]) return;  // not offered offline (the own voice)
  const later = Date.now() - (+localStorage.getItem('dg_voice_offline_later') || 0) < 30 * 864e5;  // "×": a month
  if (dgOffIds().includes(vid)) {
    const stale = (localStorage.getItem('dg_voice_offline_stale') || '').split(',').includes(vid);
    if (stale && !later) dgOffCard('stale', { vid });
  } else if (!later) dgOffCard('offer', { vid });
}

// The DG voice failed on a Pali line (playCurrentSegment): with no network and no voice on the device, say so once
function dgOfflineNoNet() {
  const vid = dgPaliVoice();
  if (navigator.onLine || dgOffIds().includes(vid) || dgOffCardState || sessionStorage.getItem('dg_voice_offline_nonet')) return;
  sessionStorage.setItem('dg_voice_offline_nonet', '1');
  dgOffCard('nonet', { vid });
}

function dgOfflineRender() {
  const t = ttsUiText(), sub = document.getElementById('tts-off-sub');
  if (sub) {
    const names = dgOffIds().map(dgOffName);
    sub.textContent = dgOffBusy ? `${t.offLoading} ${Math.round(dgOffBusy.p * 100)}%` : names.length ? `${t.offHave}: ${names.join(', ')}` : t.offSub;
  }
  const win = document.getElementById('tts-voice-win');
  if (win?.classList.contains('on') && ttsVoiceWin.depth > 0) {
    const top = win.scrollTop;
    renderVoiceWin();
    win.scrollTop = top;
  }
}

async function dgOfflineDownload(vid) {
  if (dgOffBusy) return;
  const ctrl = new AbortController();
  dgOffBusy = { vid, p: 0, ctrl };
  dgOffCard('loading', { vid });
  dgOfflineRender();
  let shown = 0;
  try {
    await dgOffVoices();
    await (await dgOffline()).download(vid, (p, done, total) => {
      dgOffBusy.p = p;
      if (p - shown >= 0.01) {
        shown = p;
        if (dgOffCardState?.kind === 'loading') dgOffCard('loading', { vid, p, done, total });
        dgOfflineRender();
      }
    }, ctrl.signal);
    dgOffBusy = null;
    dgOffCard('done', { vid });
  } catch (err) {
    dgOffBusy = null;
    if (ctrl.signal.aborted) dgOffCard(null);
    else {
      console.warn('Offline voice download failed', err);
      const why = err?.name === 'QuotaExceededError' || err?.message === 'no space' ? 'space'
        : !navigator.onLine || err instanceof TypeError || err?.name === 'TimeoutError' ? 'net' : 'server';
      dgOffCard('error', { vid, why });
    }
  }
  dgOfflineRender();
}

document.addEventListener('click', async e => {
  if (e.target.closest('.close-tts-btn')) { dgOffCard(null); return; }  // the player closes: the card goes too
  const b = e.target.closest('[data-offvid], [data-offdel], [data-offno], [data-offcard], #tts-off-btn');
  if (b?.dataset.offcard === 'voices') dgOffCard(null);
  if (!b) return;
  if (b.dataset.offno) {
    localStorage.setItem('dg_voice_offline_no', '1');
    dgOffCard(null);
  } else if (b.dataset.offcard === 'later') {
    localStorage.setItem('dg_voice_offline_later', String(Date.now()));
    dgOffCard(null);
  } else if (b.dataset.offcard === 'cancel') {
    dgOffBusy?.ctrl.abort();
  } else if (b.dataset.offcard === 'close') {
    dgOffCard(null);
  } else if (b.id === 'tts-off-btn' || b.dataset.offcard === 'voices') {  // the DG Pali voice list, where the icons are
    document.querySelector('.tts-vrow[data-l="pi"] .tts-vbtn')?.click();
    await new Promise(r => setTimeout(r, 60));
    document.querySelector('#tts-voice-win [data-eng="dg"]')?.click();
  } else if (b.dataset.offdel) {
    await (await dgOffline()).remove(b.dataset.offdel);
    dgOfflineRender();
  } else {
    dgOfflineDownload(b.dataset.offvid);
  }
});


async function fetchGoogleAudio(text, lang, rate, apiKey) {
  let targetConfig = null;

  if (lang === 'pi-dev') {
      // --- PALI ---
      const savedPali = localStorage.getItem(GOOGLE_PALI_SETTINGS_KEY);
      if (savedPali) {
          try { targetConfig = JSON.parse(savedPali); } catch (e) {}
      }
      if (!targetConfig) targetConfig = DEFAULT_PALI_CONFIG;

      // === GOOGLE-SPECIFIC PALI PATCH (Schwa Deletion Fix) ===
      if (text) {
          const C = '[\u0915-\u0939\u0933]'; 
          const B = '(?=\\s|[।,:;.?!\"]|$)';

          // Модификации текста для Google
          text = text.replace(new RegExp(`(${C})${B}`, 'g'), '$1ा');
          text = text.replace(new RegExp(`(${C})ि${B}`, 'g'), '$1ी');
          text = text.replace(new RegExp(`(${C})ु${B}`, 'g'), '$1ू');
          text = text.replace(/न(?![ािीुूेोृॄॢॣंःँ्])/g, 'ना');
          text = text.replace(/म(?![ािीुूेोृॄॢॣंःँ्])/g, 'मा');
          text = text.replace(/ो$/g, 'ोो');
          
          // Фикс для окончания ṃ (ниггахита) -> заменяем на ṅ (нг) в конце слов
          // Listening tests (pali-tts round 3): a bare ङ् at word end gets dropped ("sutaṁ" -> "suta"),
          // ङ्ग् keeps an audible -ng.
          text = text.replace(new RegExp(`(?:ं|ङ्)${B}`, 'g'), 'ङ्ग्');
          // ZWNJ stops प्ह from being read as "f" (phasso).
          text = text.replace(/प्ह/g, 'प्‌ह');
          // Word-final e as a separate ए: a final े gets dropped (sattanikāye -> "sattanikāy").
          // Only after another letter: monosyllables like "me" were not tested and stay as they are.
          text = text.replace(new RegExp(`(?<=[\\u0900-\\u097F])(${C})े${B}`, 'g'), (m, c) => c === 'य' ? 'यए' : c + '्ए');
      }
      // ========================================================

  } else {
      // --- TRANSLATION (Dynamic) ---
      // `lang` here is the ACTUAL per-segment language already resolved by
      // detectDynamicLang()/createPlaylistFromData() (Cyrillic → 'ru', Latin → the page's
      // detected language, etc.) — pass it straight through instead of re-deriving from the
      // URL path (see getContextInfo comment): this is the fix for "reads Russian with an
      // English accent" / "language switch needs a reload", both root-caused to this call
      // previously ignoring the language it was actually asked to speak.
      const context = getContextInfo(lang);
      const savedTrn = localStorage.getItem(context.storageKey);
      if (savedTrn) {
          try { targetConfig = JSON.parse(savedTrn); } catch (e) {}
      }
      if (!targetConfig) targetConfig = context.defaultConfig;
  }

  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

  const payload = {
    input: { text: text },
    voice: { languageCode: targetConfig.languageCode, name: targetConfig.name },
    audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: rate
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.error) {
        const errorMsg = JSON.stringify(data.error, null, 2);
        throw new Error(data.error.message);
    }

    return data.audioContent;
  } catch (e) {
    if (navigator.onLine && !e.message.includes('Google API Error') && !e.message.includes('Synthesize failed')) {
    }

    console.warn('Google TTS Fetch Error:', e);
    return null;
  }
}


/*
async function fetchGoogleAudio(text, lang, rate, apiKey) {
  let targetConfig = null;

  if (lang === 'pi-dev') {
      // --- PALI ---
      const savedPali = localStorage.getItem(GOOGLE_PALI_SETTINGS_KEY);
      if (savedPali) {
          try { targetConfig = JSON.parse(savedPali); } catch (e) {}
      }
      if (!targetConfig) targetConfig = DEFAULT_PALI_CONFIG;
  } else {
      // --- TRANSLATION (Dynamic) ---
      const context = getContextInfo(); // Получаем текущий контекст
      
      const savedTrn = localStorage.getItem(context.storageKey);
      if (savedTrn) {
          try { targetConfig = JSON.parse(savedTrn); } catch (e) {}
      }
      
      // Если настройки нет, берем дефолт из контекста
      if (!targetConfig) targetConfig = context.defaultConfig;
  }

  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
  
  const payload = {
    input: { text: text },
    voice: { languageCode: targetConfig.languageCode, name: targetConfig.name },
    audioConfig: { 
        audioEncoding: 'MP3',
        speakingRate: rate 
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error.message);
    }
    return data.audioContent; 
  } catch (e) {
    console.warn('Google TTS Fetch Error:', e);
    return null;
  }
}

*/

async function prepareTextData(slug) {
  if (isLegacyPage()) {
      return prepareLegacyData();
  }

  let container = getSuttaContainer();
  let scopeRoots = [container];

  // Search results page has no .sutta-container/.sutta, so getSuttaContainer() falls back to the
  // whole document. td.none (search-render.js's Quote column, the only column with that
  // DataTables "never a real column" className) is the cell holding one row's Pali+translation
  // markup — it's always in the DOM regardless of expand/collapse state (DataTables Responsive
  // only toggles a dtr-hidden CSS class, never removes it).
  //
  // Owner: "Voice на поиске не работает потому что он открывает сутту, а должен идти по списку
  // текстов... где много сутт и нужно читать не всю сутту, а только цитаты" — reading from the
  // search results page means walking EVERY result's quote in order, not just the clicked row's.
  // So the scope here is every td.none currently in the DOM under #results-tbody, not just the
  // one the click happened in — that naturally also bounds itself to whatever DataTables page
  // size the user picked (10/30/.../1000, see search-render.js pageLength/lengthMenu), since
  // rows on other pages simply aren't in the DOM to query. Built as a list of per-cell roots
  // (not one query against the whole tbody) so the Title column's <strong class="pli-lang">
  // and Words column's <span class="pli-lang"> — real search-render.js markup with no id of
  // their own — never enter scope in the first place, the same class of bug as the .byline case
  // below, avoided here by construction instead of by another exclusion filter.
  if (container === document) {
      const activeWord = document.querySelector('.active-word');
      const singleRowScope = activeWord && (activeWord.closest('td.none') || activeWord.closest('tr'));
      if (singleRowScope) {
          const resultsTbody = singleRowScope.closest('#results-tbody');
          const allCells = resultsTbody ? Array.from(resultsTbody.querySelectorAll('td.none')) : [];
          scopeRoots = allCells.length ? allCells : [singleRowScope];
      }
  }

  // .rus-lang/.eng-lang/.tha-lang/.second-translation-row — легаси-классы (совпадают с
  // разметкой r.php/tr.php и search-render.js), но dg-node megareader.js рендерит перевод
  // как .ru-lang/.en-lang/.lang-2nd (ISO-код класса, не трёхбуквенное сокращение) — из-за
  // этого расхождения перевод молча не находился на страницах ридера (Пали работал, т.к.
  // .pli-lang класс общий у всех рендереров). lang-атрибут — то немногое, что действительно
  // совпадает везде (см. detectTranslationLang выше) — добавлен как основной, а не
  // единственный признак, легаси-классы остаются как доп. подстраховка.
  // .byline (#trn, megareader.js renderNavigation) holds the "Pāḷi MS / Пер. ..." credit line —
  // its spans carry lang="pi"/lang="ru" like real segments but have no id of their own, so
  // getElementId()'s closest('[id]') fallback attributed them to the whole-page #trn id, making
  // this credit line get spoken as a bogus first segment (owner: first line read in an English
  // accent — it's the translator name/abbreviation mixed into a Russian sentence). Excluded here
  // at the source rather than filtered later, since it isn't a real segment either way.
  const notByline = (el) => !el.closest('.byline');
  const queryAllRoots = (selector) => scopeRoots.flatMap(root => Array.from(root.querySelectorAll(selector)));
  const paliElements = queryAllRoots('.pli-lang, [lang="pi"]').filter(notByline);
  const translationElements = queryAllRoots('.rus-lang, .tha-lang, .eng-lang, .second-translation-row, .lang-2nd, [lang]:not([lang="pi"])').filter(notByline);

  if (paliElements.length === 0 && translationElements.length === 0) {
      return prepareGeneralArticleData();
  }
  const paliJsonData = await fetchSegmentsData(slug);

  const allIds = new Set();
  const allNodesInOrder = queryAllRoots('.pli-lang, .rus-lang, .tha-lang, .eng-lang, .second-translation-row, .lang-2nd, [lang]');

  allNodesInOrder.forEach(el => {
    const id = getElementId(el);
    if (id) allIds.add(id);
  });

  let useFullKey = false;
  for (const id of allIds) {
      if (id.includes(':')) {
          useFullKey = true;
          break;
      }
  }

  const cleanJsonMap = {};
  const iastJsonMap = {}; // raw IAST for the self-hosted Pali voice, which phonemizes IAST itself
  const jsonKeys = []; 

  if (paliJsonData) {
    Object.keys(paliJsonData).forEach(key => {
      const cleanKey = useFullKey ? key : key.split(':').pop();
      const rawText = paliJsonData[key].replace(/<[^>]*>/g, '').trim();
      // Same order as the DOM branch below: Devanagari first, then cleanTextForTTS, whose Pali
      // fixes are written against Devanagari and are no-ops on IAST.
      const devText = window.convertPaliToDevanagari ? window.convertPaliToDevanagari(rawText) : rawText;
      cleanJsonMap[cleanKey] = cleanTextForTTS(devText);
      iastJsonMap[cleanKey] = stripForPaliVoice(rawText);
      jsonKeys.push(cleanKey); 
    });
  }

  const textData = [];
  
  allIds.forEach(id => {
    const paliElement = Array.from(paliElements).find(el => getElementId(el) === id);
    const segTranslations = Array.from(translationElements).filter(el => getElementId(el) === id);
    const trnEl1 = segTranslations[0] || null;
    const trnEl2 = segTranslations.length > 1 ? segTranslations[segTranslations.length - 1] : null;
    
    let paliDev = '';
    let paliIast = '';
    let translation1 = '';
    let translation2 = '';
    
    if (cleanJsonMap[id]) {
      paliDev = cleanJsonMap[id];
      paliIast = iastJsonMap[id];
      const currentIndex = jsonKeys.indexOf(id);
      if (currentIndex !== -1) {
        let lookAheadIndex = currentIndex + 1;
        while (lookAheadIndex < jsonKeys.length) {
          const nextKey = jsonKeys[lookAheadIndex];
          if (allIds.has(nextKey)) break;
          const nextVal = cleanJsonMap[nextKey];
          if (nextVal) {
             const lowerNext = nextVal.charAt(0).toLowerCase() + nextVal.slice(1);
             paliDev += " " + lowerNext;
             paliIast += " " + iastJsonMap[nextKey];
          }
          lookAheadIndex++;
        }
      }
    } else if (paliElement) {
      // Owner: "Voice не должен читать варианты не важно вкл они или выкл" — unlike the JSON
      // path above (fetchSegmentsData returns bare root text, no variant markup at all), this DOM
      // fallback reads the RENDERED [lang="pi"] element, which has the variant note injected
      // inline (<font class="variant">, megareader.js) regardless of its current hidden-variant
      // display toggle — .textContent ignores CSS visibility, so it was always read aloud. Same
      // clone-and-strip as the translation branches below.
      const paliClone = paliElement.cloneNode(true);
      paliClone.querySelectorAll('.variant, .not_translate, sup, .ref').forEach(v => v.remove());
      let rawDomText = paliClone.textContent.replace(/<[^>]*>/g, '').trim();
      // Devanagari conversion must run BEFORE cleanTextForTTS, not after: cleanTextForTTS's
      // Pali-specific fixes (e.g. फस्स -> प्हस्स so TTS says "phasso" not "fasso", …पे… -> …पेय्याल…)
      // are written against Devanagari script and are no-ops on raw IAST Latin text.
      let paliSource = window.convertPaliToDevanagari ? window.convertPaliToDevanagari(rawDomText) : rawDomText;
      paliDev = cleanTextForTTS(paliSource);
      paliIast = stripForPaliVoice(rawDomText);
    }
    
    if (trnEl1) {
      const clone = trnEl1.cloneNode(true);
      clone.querySelectorAll('.variant, .not_translate, sup, .ref').forEach(v => v.remove());
      translation1 = cleanTextForTTS(clone.textContent);
    }
    
    if (trnEl2 && trnEl2 !== trnEl1) {
      const clone = trnEl2.cloneNode(true);
      clone.querySelectorAll('.variant, .not_translate, sup, .ref').forEach(v => v.remove());
      translation2 = cleanTextForTTS(clone.textContent);
    }
    
    if (paliDev || translation1 || translation2) {
      textData.push({
        id: id,
        paliDev: paliDev,
        paliIast: paliIast,
        translation: translation1,
        translation2: translation2,
        paliElement: paliElement || null,
        translationElement: trnEl1 || null,
        translationElement2: trnEl2 || null
      });
    }
  });
  
  return textData;
}

function detectDynamicLang(text, fallbackLang, isRoot) {
    if (!text) return fallbackLang;
    if (/[А-Яа-яЁё]/.test(text)) return 'ru';
    if (/[\u4e00-\u9fa5]/.test(text)) return 'zh';
    if (/[\u0e00-\u0e7f]/.test(text)) return 'th';
    if (isRoot) return 'pi-dev';
    if (/[A-Za-z]/.test(text)) return 'en';
    return fallbackLang;
}

function createPlaylistFromData(textData, mode) {
  const playlist = [];
  const translationLang = detectTranslationLang();
  
  textData.forEach(item => {
    const addPali = () => {
        if (item.paliDev) {
            let lang = detectDynamicLang(item.paliDev, 'pi-dev', true);
            playlist.push({
              text: item.paliDev, iast: item.paliIast, lang: lang, element: item.paliElement, id: item.id
            });
        }
    };
    const addTrn = () => {
        if (item.translation) {
            let lang = detectDynamicLang(item.translation, translationLang, false);
            playlist.push({
              text: item.translation, lang: lang, element: item.translationElement, id: item.id
            });
        }
    };
    const addTrn2 = () => {
        if (item.translation2) {
            let lang = detectDynamicLang(item.translation2, translationLang, false);
            playlist.push({
              text: item.translation2, lang: lang, element: item.translationElement2, id: item.id
            });
        }
    };

    if (mode === 'pi') { addPali(); }
    else if (mode === 'trn') { addTrn(); }
    else if (mode === 'trn2') { addTrn2(); }
    else if (mode === 'pi-trn') { addPali(); addTrn(); }
    else if (mode === 'trn-pi') { addTrn(); addPali(); }
    else if (mode === 'pi-trn2') { addPali(); addTrn2(); }
    else if (mode === 'trn2-pi') { addTrn2(); addPali(); }
  });
  
  return playlist;
}





function shouldRequestWakeLockForItem(item) {
  const googleKey = (localStorage.getItem(GOOGLE_KEY_STORAGE) || window.TRIAL_KEY);

  // Если Google TTS недоступен, остаётся нативный голос — экран держим
  if (!googleKey || googleKey.length <= 10) return true;
  if (!item) return true;

  const useNativePali = localStorage.getItem(NATIVE_PALI_KEY) === 'true';
  const useNativeTrn  = localStorage.getItem(NATIVE_TRN_KEY) === 'true';

  // Если для текущего языка включен нативный режим, возвращаем true (экран не гаснет)
  if (item.lang === 'pi-dev') return useNativePali;
  return useNativeTrn;
}

// --- Ядро TTS ---
// --- DG voice prefetch: while a line plays, the next two lines read by the DG voice are fetched, so
// there is no gap for synthesis between lines. Google is fast enough and every request costs, so only DG.
// The same request as playCurrentSegment makes (text, rate, voice), or null if DG doesn't read this line.
function dgVoiceRequest(item) {
  if (!item) return null;
  if (item.lang === 'pi-dev') {
    const off = localStorage.getItem(NATIVE_PALI_KEY) === 'true' || !item.iast || localStorage.getItem(PALI_VOICE_KEY) === 'off';
    return off ? null : { text: item.iast, rate: savedRate('pali') };
  }
  const voice = getTrnEngine() === 'dg' ? dgTrnVoice(item.lang) : null;
  if (!voice) return null;
  return { text: item.text, rate: ['ru', 'th', 'zh', 'en'].includes(item.lang) ? getRateForLang(item.lang) : 1.0, voice };
}
const dgAudioPending = new Map();  // request key -> Promise of base64 mp3, newest last
function dgAudio(req) {
  const key = `${req.voice || dgPaliVoice()}|${req.rate.toFixed(2)}|${req.text}`;
  let p = dgAudioPending.get(key);
  if (!p) {
    p = fetchPaliVoiceAudio(req.text, req.rate, req.voice);
    p.catch(() => dgAudioPending.delete(key));  // a failed fetch is retried next time, not cached
    dgAudioPending.set(key, p);
    while (dgAudioPending.size > 8) dgAudioPending.delete(dgAudioPending.keys().next().value);
  }
  return p;
}
function dgPrefetchAhead(index) {
  for (let k = 1; k <= 2; k++) {
    const req = dgVoiceRequest(ttsState.playlist[index + k]);
    if (req) dgAudio(req).catch(() => {});
  }
}

async function playCurrentSegment() {
 await dgVoicesReady();  // resolved after the first line: no delay then
 
 if (window.ttsDelayTimeout) clearTimeout(window.ttsDelayTimeout);
 
  if (ttsState.googleAudio) {
      ttsState.googleAudio.pause();       
      ttsState.googleAudio.onended = null; 
      ttsState.googleAudio = null;         
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  
  if (ttsState.currentIndex < 0 || ttsState.currentIndex >= ttsState.playlist.length) {
    clearTtsStorage();
    stopPlayback();
    return;
  }

  const item = ttsState.playlist[ttsState.currentIndex];

  if (!wakeLock && !ttsState.paused && shouldRequestWakeLockForItem(item)) {
    requestWakeLock();
  }

  if (ttsState.utterance) {
    ttsState.utterance.onend = null;
    ttsState.utterance.onerror = null;
  }
  
  synth.cancel();
  
  resetUI();

  if (ttsState.currentSlug) {
    if (ttsState.currentIndex >= ttsState.playlist.length - 2) {
       clearTtsStorage(); 
    } else {
       localStorage.setItem(LAST_SLUG_KEY, getSavedSlugName(ttsState.currentSlug));
       localStorage.setItem(LAST_INDEX_KEY, ttsState.currentIndex);
    }
  }
  
  highlightAndScrollToItem(item);

  let uiRate = 1.0;
  let audioRateBrowser = 1.0; 
  let audioRateGoogle = 1.0;  
  
  let isPali = false;
  let targetLang = 'en';

  if (item.lang === 'ru') {
    uiRate = getRateForLang('ru');
    audioRateBrowser = uiRate;
    audioRateGoogle = uiRate;
    targetLang = 'ru';
  } else if (item.lang === 'th') { 
    uiRate = getRateForLang('th'); 
    audioRateBrowser = uiRate;
    audioRateGoogle = uiRate;
    targetLang = 'th';
  } else if (item.lang === 'zh') { 
    uiRate = getRateForLang('zh'); 
    audioRateBrowser = uiRate;
    audioRateGoogle = uiRate;
    targetLang = 'zh';
  } else if (item.lang === 'en') {
    uiRate = getRateForLang('en');
    audioRateBrowser = uiRate;
    audioRateGoogle = uiRate;
    targetLang = 'en';
  } else if (item.lang === 'pi-dev') {
    isPali = true;
    targetLang = 'pi-dev';
    uiRate = savedRate('pali');
    
    audioRateBrowser = uiRate * PALI_RATIO; 
    audioRateGoogle  = uiRate;              
  }

  markActiveRate(isPali);

  const googleKey = (localStorage.getItem(GOOGLE_KEY_STORAGE) || window.TRIAL_KEY); 
  const useNativePali = localStorage.getItem(NATIVE_PALI_KEY) === 'true';
  const useNativeTrn  = localStorage.getItem(NATIVE_TRN_KEY) === 'true'; 
  
  let tryGoogle = false;
  // DG (self-hosted Piper) voice first when chosen: Pali via our IAST rules, translations via a Piper
  // voice of that language. Google stays the fallback.
  const dgTrnId = !isPali && getTrnEngine() === 'dg' ? dgTrnVoice(item.lang) : null;
  const usePaliVoice = (isPali && !useNativePali && !!item.iast && localStorage.getItem(PALI_VOICE_KEY) !== 'off') || !!dgTrnId;

  if (googleKey && googleKey.length > 10) {
      if (isPali) {
          if (!useNativePali) {
              tryGoogle = true;
          }
      } else {
          if (!useNativeTrn) { 
              tryGoogle = true;
          }
      }
  }

  if (tryGoogle || usePaliVoice) {
      try {
          const targetIndex = ttsState.currentIndex; 

          let audioContent = null;
          if (usePaliVoice) {
              try {
                  audioContent = await dgAudio(dgVoiceRequest(item));
                  dgPrefetchAhead(targetIndex);
                  if (item.lang === 'pi-dev') dgOfflineOffer();
              } catch (e) {
                  console.warn("Pali voice failed, falling back to Google", e);
                  if (item.lang === 'pi-dev') dgOfflineNoNet();
              }
          }
          if (!audioContent && tryGoogle) {
              audioContent = await fetchGoogleAudio(item.text, targetLang, audioRateGoogle, googleKey);
          }
          
          if (targetIndex !== ttsState.currentIndex || !ttsState.speaking) {
              return; 
          }

          if (audioContent) {
              const audio = window.sharedGoogleAudio || new Audio();
              window.sharedGoogleAudio = audio;
              // a WAV (base64 'RIFF…') comes from the voice on the device (voice-offline.js)
              audio.src = (audioContent.startsWith('UklGR') ? 'data:audio/wav;base64,' : 'data:audio/mp3;base64,') + audioContent;
              
              ttsState.googleAudio = audio;
              
              audio.onended = () => {
                  ttsState.googleAudio = null;
                  if (ttsState.speaking && !ttsState.paused) {
                      let delay = window.TTS_SEGMENT_DELAY || 0;
                      const isRangeEnd = ttsState.endIndex !== undefined && ttsState.currentIndex >= ttsState.endIndex;

                      const currentItem = ttsState.playlist[ttsState.currentIndex];
                      const nextItem = ttsState.playlist[ttsState.currentIndex + 1];
                      if (currentItem && nextItem && currentItem.id === nextItem.id) {
                          delay = 0;
                      }

                      if (!isRangeEnd) {
                          ttsState.currentIndex++; 
                      }

                      const finishOrNext = () => {
                          if (isRangeEnd) {
                              ttsState.speaking = false;
                              setButtonIcon('play');
                              releaseWakeLock();
                              document.dispatchEvent(new CustomEvent('tts-range-finished'));
                          } else {
                              playCurrentSegment();
                          }
                      };

                      if (delay > 0) {
                          window.ttsDelayTimeout = setTimeout(finishOrNext, delay);
                      } else {
                          finishOrNext();
                      }
                  }
              };

              audio.onerror = (err) => {
                  console.error("Google Audio playback error", err);
                  playBrowserTTS(item.text, targetLang, audioRateBrowser, isPali); 
              };

              if (!ttsState.paused) {
                  const playPromise = audio.play();
                  if (playPromise !== undefined) {
                      playPromise.catch(e => {
                          console.warn("Autoplay blocked or failed", e);
                          ttsState.paused = true; 
                          setButtonIcon('play');
                          releaseWakeLock();
                      });
                  }
              }
              return; 
          }
      } catch (e) {
          console.warn("Google TTS failed, falling back to browser", e);
      }
  }

  playBrowserTTS(item.text, targetLang, audioRateBrowser, isPali);
}

function playBrowserTTS(text, langKey, rate, isPali) {
  if (!wakeLock && !ttsState.paused) {
    requestWakeLock();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  
  let savedConfigRaw = isPali 
      ? localStorage.getItem('tts_native_pali_custom_voice')
      : localStorage.getItem('tts_native_trn_custom_voice');
      
  let nativeVoiceSelected = null;
  
  if (savedConfigRaw) {
      try {
          const savedConfig = JSON.parse(savedConfigRaw);
          const voices = synth.getVoices();
          nativeVoiceSelected = voices.find(v => v.name === savedConfig.name);
      } catch(e) {}
  }

  if (nativeVoiceSelected) {
      utterance.voice = nativeVoiceSelected;
      utterance.lang = nativeVoiceSelected.lang;
  } else {
      if (langKey === 'ru') utterance.lang = 'ru-RU';
      else if (langKey === 'th') utterance.lang = 'th-TH';
      else if (langKey === 'zh') utterance.lang = 'zh-CN';
      else if (langKey === 'en') utterance.lang = 'en-US';
      else if (langKey === 'pi-dev') {
         utterance.lang = 'sa-IN'; 
         utterance._fallbackAttempt = 0; 
      }
  }

  utterance.rate = rate;

  utterance.onend = () => {
      if (ttsState.speaking && !ttsState.paused) {
          let delay = window.TTS_SEGMENT_DELAY || 0;
          const isRangeEnd = ttsState.endIndex !== undefined && ttsState.currentIndex >= ttsState.endIndex;

          const currentItem = ttsState.playlist[ttsState.currentIndex];
          const nextItem = ttsState.playlist[ttsState.currentIndex + 1];
          if (currentItem && nextItem && currentItem.id === nextItem.id) {
              delay = 0;
          }

          if (!isRangeEnd) {
              ttsState.currentIndex++; 
          }

          const finishOrNext = () => {
              if (isRangeEnd) {
                  ttsState.speaking = false;
                  setButtonIcon('play');
                  releaseWakeLock();
                  document.dispatchEvent(new CustomEvent('tts-range-finished'));
              } else {
                  playCurrentSegment();
              }
          };

          if (delay > 0) {
              window.ttsDelayTimeout = setTimeout(finishOrNext, delay);
          } else {
              finishOrNext();
          }
      }
  };

  utterance.onerror = (e) => {
    if (e.error === 'not-allowed') {
      console.warn('TTS: Autoplay blocked by browser policy.');
      ttsState.paused = true;
      setButtonIcon('play');
      releaseWakeLock();
      return; 
    }

    if (e.error === 'audio-busy' || e.error === 'network') {
      console.error('TTS: Critical system error:', e.error);
      ttsState.paused = true;
      setButtonIcon('play');
      releaseWakeLock();
      return; 
    }

    console.error('Browser TTS Error:', e);
    
    if (langKey === 'pi-dev') {
      const currentAttempt = utterance._fallbackAttempt || 0;
      
      if (currentAttempt === 0 && utterance.lang === 'sa-IN') {
        console.log('Sanskrit failed, trying Hindi...');
        utterance.lang = 'hi-IN';
        utterance._fallbackAttempt = 1;
        utterance.rate = rate; 
        setTimeout(() => { if (ttsState.speaking && !ttsState.paused) synth.speak(utterance); }, 1);
        return;
      }
      
      if (currentAttempt === 1 && utterance.lang === 'hi-IN') {
        console.log('Hindi failed, trying English...');
        utterance.lang = 'en-US';
        utterance._fallbackAttempt = 2;
        utterance.rate = rate;
        
        setTimeout(() => {
          if (ttsState.speaking && !ttsState.paused) {
            synth.speak(utterance);
            
            const pathLang = location.pathname.split('/')[1];

            const helpUrl = window.isRu ? '/ru/docs/tts' : '/docs/tts';
            const title = window.isRu ? 'TTS:' : 'TTS Hint:';
            const helpLink = `<a href="${helpUrl}" target="_blank" style="color: #4da6ff;">(?)</a>`;
            // Issue #37: «почему не проигрывается пали» — в подсказке теперь сказано, чем пали
            // читается: в сети — голоса Google (ключ берётся бесплатно, если хочется), офлайн —
            // системный голос индийского языка; иначе остаётся английский.
            const message = window.isRu
              ? `Пали читать нечем — включён Английский. В сети: голоса Google, ключ бесплатный, если хотите ${helpLink}.${offlineHint()}`
              : `Nothing reads Pāḷi — English is used. Online: Google voices work, a free key if you want ${helpLink}.${offlineHint()}`;
            showVoiceHint(title, message, PALI_ALERT_KEY);
          }
        }, 1);
        return;
      }
    }
    
    if (document.hidden || e.error === 'interrupted') {
      ttsState.paused = true;
      setButtonIcon('play');
      releaseWakeLock();
      return; 
    }

    if (ttsState.speaking && !ttsState.paused) {
      ttsState.currentIndex++;
      playCurrentSegment();
    }
  };

  ttsState.utterance = utterance;
  
  if (!ttsState.paused) {
    setTimeout(() => {
      if (ttsState.speaking && !ttsState.paused && ttsState.utterance === utterance) {
        synth.speak(utterance);
      }
    }, 50);
  }
}




async function handleSuttaClick(e) {
  const dynamicBtn = e.target.closest('.dynamic-tts-btn');
  const voiceLink = e.target.closest('.voice-link');
  const playBtn = e.target.closest('.play-main-button');
  const navBtn = e.target.closest('.prev-main-button, .next-main-button');
  
  // ВОССТАНОВЛЕННАЯ ПЕРЕМЕННАЯ (без неё всё падало)
  const container = e.target.closest('.sutta-container, .sutta') || document;

  // ВАЖНО: Запрашиваем экран мгновенно при любом клике, связанном с воспроизведением.
  // Это синхронный перехват жеста пользователя, который требует iOS Safari.
  if (dynamicBtn || voiceLink || (playBtn && !e.target.classList.contains('voice-link')) || navBtn) {
      requestWakeLock();
  }

  if (dynamicBtn) {
      e.preventDefault();
      e.stopPropagation();

      let globalMode = localStorage.getItem(MODE_STORAGE_KEY) || 'trn';
      let playbackMode = globalMode;
      
      const activeWord = document.querySelector('.active-word');
      if (activeWord) {
          const isPali = activeWord.classList.contains('pli-lang');
          const isTrn2 = activeWord.classList.contains('second-translation-row') || activeWord.classList.contains('lang-2nd');
          
          if (isTrn2) {
              if (globalMode === 'pi-trn') playbackMode = 'pi-trn2';
              else if (globalMode === 'trn-pi') playbackMode = 'trn2-pi';
              else playbackMode = 'trn2';
          } else if (isPali) {
              if (globalMode !== 'pi-trn' && globalMode !== 'trn-pi') playbackMode = 'pi';
          } else {
              if (globalMode !== 'pi-trn' && globalMode !== 'trn-pi') playbackMode = 'trn';
          }

          if (['pi', 'trn', 'pi-trn', 'trn-pi'].includes(playbackMode)) {
              localStorage.setItem(MODE_STORAGE_KEY, playbackMode);
              const modeSelect = document.getElementById('tts-mode-select');
              if (modeSelect) modeSelect.value = playbackMode;
          }
      }
      
      let slug = ttsState.currentSlug;
      if (!slug) {
          // #dg-voice-slug (search/index.html's right-click "Listen") is created specifically
          // for this flow — prefer it over a generic a.voice-link[data-slug] lookup, which would
          // otherwise match a STALE reader-page voice-link left in the DOM from a sutta viewed
          // earlier in the session (dg-node keeps #sutta's old markup around across state
          // switches instead of clearing it, see getSuttaContainer() above) and mislabel
          // ttsState.currentSlug with that unrelated sutta.
          const mainPlayBtn = document.getElementById('dg-voice-slug') || document.querySelector('a.voice-link[data-slug]');
          if (mainPlayBtn) slug = mainPlayBtn.dataset.slug;
      }
      // Search results page has no a.voice-link[data-slug] for a plain word click (only the
      // right-click "Listen" menu manufactures one, a hidden #dg-voice-slug link, search/
      // index.html) — so clicking the dynamic-tts-btn that a direct word click creates
      // (settings.js activateSegmentForTTS) silently did nothing here (owner: "можно
      // стартануть ттс через меню, но не через дин ттс кнопку"): slug stayed empty and this
      // whole branch returned before ever calling startPlayback(). The active word's own id IS
      // "sutta:segment" (search-render.js renderSegment) — same source prepareTextData already
      // derives sutta ids from — so pull the slug from there instead of requiring a link.
      if (!slug) {
          const activeWordId = activeWord && getElementId(activeWord);
          if (activeWordId && activeWordId.includes(':')) {
              slug = activeWordId.split(':')[0];
          }
      }
      if (!slug && typeof isLegacyPage === 'function' && isLegacyPage()) {
           slug = window.location.pathname.split('/').pop() || 'legacy_page';
      }
      if (!slug) return;
      
      const player = getOrBuildPlayer();
      const internalPlayBtn = player.querySelector('.play-main-button');
      if (internalPlayBtn) internalPlayBtn.dataset.slug = slug;
      
      player.classList.add('active');
      startPlayback(container, playbackMode, slug); 
      dynamicBtn.remove();
      return;
  }

  if (e.target.closest('#tts-settings-toggle')) {
    e.preventDefault();
    // the gear closes whichever settings level is open (settings or voice settings), else opens settings
    const open = ['tts-settings-panel', 'tts-advanced-settings'].some(id => document.getElementById(id)?.classList.contains('visible'));
    ttsMorph(() => showTtsPanel(open ? null : 'tts-settings-panel'));
    return;
  }

  if (voiceLink) {
    e.preventDefault();
    let targetSlug = voiceLink.dataset.slug;
    if (!targetSlug) {
        targetSlug = window.location.pathname.replace(/[^a-zA-Z0-9]/g, '_');
    }
    const player = getOrBuildPlayer();
    const internalPlayBtn = player.querySelector('.play-main-button');
    if (internalPlayBtn && targetSlug) {
        internalPlayBtn.dataset.slug = targetSlug;
    }
    player.classList.add('active');
    if (!ttsState.speaking) {
      const mode = player.querySelector('#tts-mode-select')?.value 
                   || localStorage.getItem(MODE_STORAGE_KEY) 
                   || 'trn';
      startPlayback(container, mode, targetSlug, 0);
    }
    return;
  }

  if (navBtn) {
    e.preventDefault();
    if (!ttsState.speaking || ttsState.playlist.length === 0) return;
    if (window.ttsDelayTimeout) clearTimeout(window.ttsDelayTimeout);
    if (ttsState.utterance) {
        ttsState.utterance.onend = null;
    }
    let direction = navBtn.classList.contains('prev-main-button') ? -1 : 1;
    let newIndex = ttsState.currentIndex + direction;
    
    if (ttsState.startIndex !== undefined && ttsState.endIndex !== undefined) {
        if (direction > 0 && newIndex > ttsState.endIndex) {
            newIndex = ttsState.startIndex; 
        } else if (direction < 0 && newIndex < ttsState.startIndex) {
            newIndex = ttsState.endIndex;   
        }
    } else {
        if (direction < 0 && newIndex < 0) newIndex = 0;
        else if (direction > 0 && newIndex >= ttsState.playlist.length) newIndex = ttsState.playlist.length - 1;
    }
    
    if (newIndex === ttsState.currentIndex) return;
    synth.cancel();
    if (ttsState.googleAudio) {
        ttsState.googleAudio.pause();
        ttsState.googleAudio.onended = null;
        ttsState.googleAudio = null;
    }
    ttsState.currentIndex = newIndex;
    if (ttsState.paused) {
      highlightAndScrollToItem(ttsState.playlist[ttsState.currentIndex]);
    } else {
      playCurrentSegment();
    }
    return;
  }

  if (playBtn && !e.target.classList.contains('voice-link')) {
    e.preventDefault();
    const pageVoiceLink = document.querySelector('.voice-link[data-slug]');
    const freshPageSlug = pageVoiceLink ? pageVoiceLink.dataset.slug : null;
    const activeWordElement = container.querySelector('.active-word');
    const activeId = activeWordElement ? getElementId(activeWordElement) : null;
    const currentItem = ttsState.playlist[ttsState.currentIndex];
    const currentId = currentItem ? currentItem.id : null;
    const shouldJump = activeId && (!ttsState.speaking || activeId !== currentId);

    if (shouldJump) {
      let globalMode = localStorage.getItem(MODE_STORAGE_KEY) || 'trn';
      let playbackMode = globalMode;

      const isPali = activeWordElement.classList.contains('pli-lang');
      const isTrn2 = activeWordElement.classList.contains('second-translation-row') || activeWordElement.classList.contains('lang-2nd');
      
      if (isTrn2) {
          if (globalMode === 'pi-trn') playbackMode = 'pi-trn2';
          else if (globalMode === 'trn-pi') playbackMode = 'trn2-pi';
          else playbackMode = 'trn2';
      } else if (isPali) {
          if (globalMode !== 'pi-trn' && globalMode !== 'trn-pi') playbackMode = 'pi';
      } else {
          if (globalMode !== 'pi-trn' && globalMode !== 'trn-pi') playbackMode = 'trn';
      }

      if (['pi', 'trn', 'pi-trn', 'trn-pi'].includes(playbackMode)) {
          localStorage.setItem(MODE_STORAGE_KEY, playbackMode);
          const modeSelect = document.getElementById('tts-mode-select');
          if (modeSelect) modeSelect.value = playbackMode;
      }

      let targetSlug = freshPageSlug || playBtn.dataset.slug || ttsState.currentSlug;
      startPlayback(container, playbackMode, targetSlug, 0);
    } else {
      if (ttsState.speaking) {
        if (ttsState.paused) {
          ttsState.paused = false;
          setButtonIcon('pause');
          toggleSilence(true);

          if (shouldRequestWakeLockForItem(ttsState.playlist[ttsState.currentIndex])) {
            requestWakeLock();
          }
          if (ttsState.googleAudio) {
              ttsState.googleAudio.play();
          } else {
              playCurrentSegment(); 
          }
        } else {
          ttsState.paused = true;
          releaseWakeLock(); 
          if (window.ttsDelayTimeout) clearTimeout(window.ttsDelayTimeout); 
          if (ttsState.utterance) ttsState.utterance.onend = null; 
          synth.cancel();
          if (ttsState.googleAudio) {
              ttsState.googleAudio.pause();
          }
          toggleSilence(false); 
          setButtonIcon('play');
        }
      } else {
        const mode = document.getElementById('tts-mode-select')?.value || localStorage.getItem(MODE_STORAGE_KEY) || 'trn';
        let targetSlug = freshPageSlug || playBtn.dataset.slug || ttsState.currentSlug;
        startPlayback(container, mode, targetSlug, 0);
      }
    }
    return;
  }

  if (e.target.closest('.close-tts-btn')) {
    e.preventDefault();
    stopPlayback();
    const activeWord = document.querySelector('.active-word');
    if (activeWord) {
        const rowContainer = activeWord.closest("[id]") || activeWord;
        addTtsButton(rowContainer, activeWord);
    }
  }
}

// SPA: another sutta opened in place (prev/next, a link) while the player was reading - the old
// playlist kept going (owner: an6.63 on screen, sn12.2 still playing). Stop it and forget it; the
// player stays open, and Play starts the sutta now on screen. A re-render of the same text
// (mode or language switch) is not a change of sutta: rebuildActivePlaylist handles that.
window.addEventListener('suttaLoaded', e => {
  if ((e.detail && e.detail.inPlace) || !ttsState.speaking) return;
  const now = String(window._currentSlug || '').toLowerCase();
  const was = String(ttsState.currentSlug || '').split('/').pop().toLowerCase();
  if (!now || !was || now === was) return;
  const player = document.getElementById('voice-player-container');
  const open = player && player.classList.contains('active');
  stopPlayback();
  ttsState.playlist = [];
  ttsState.currentSlug = '';
  if (open) player.classList.add('active');
});

function stopPlayback() {
  if (window.ttsDelayTimeout) clearTimeout(window.ttsDelayTimeout); // УБИВАЕМ ПРИЗРАКА
  if (ttsState.utterance) ttsState.utterance.onend = null;
  synth.cancel();
  
  if (ttsState.googleAudio) {
      ttsState.googleAudio.pause();
      // Убираем полную выгрузку src и load(), чтобы iOS Safari не заблокировал элемент снова
      ttsState.googleAudio = null;
  }
  
  // --- ПОЛНАЯ ОСТАНОВКА ФОНОВОЙ ТИШИНЫ ---
  silenceAudio.pause();
  silenceAudio.src = ''; // Отвязываем mp3 файл
  silenceAudio.load();   // Заставляем браузер забыть его. Это действие закроет шторку Android!
  // ---------------------------------------

  // --- ПОЛНАЯ ОЧИСТКА ПЛЕЕРА ИЗ ТРЕЯ ---
  if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
  }
  // -----------------------------------------------

  ttsState.speaking = false;
  ttsState.paused = false;
  ttsState.isNavigating = false;
  releaseWakeLock();
  
  const player = document.getElementById('voice-player-container');
  if (player) {
    player.classList.remove('active');
  }
  
  if (ttsState.utterance) {
    ttsState.utterance.onend = null;
    ttsState.utterance.onerror = null;
    ttsState.utterance = null;
  }
  
  setButtonIcon('play');
  resetUI();
}


// Cancels current speech and re-scans the DOM to rebuild ttsState.playlist for `newMode`,
// preserving the current segment's position by id. Originally only reachable from the
// tts-mode-select change handler (switching pi/trn/pi-trn); also called directly by
// megareader.js's switchReadingLanguage() right after it re-renders the sutta in the new
// language (window.rebuildActivePlaylist() — top-level function decl, attaches to window in
// this classic script), and from the dhamma:languagechange listener below as a catch-all for
// any other path that changes the page language. `newMode` defaults to the current/saved mode
// so callers outside this file (megareader.js) don't need to know about ttsState internals.
// Returns false without changing anything if there is no active/paused session, or the rebuilt
// playlist comes back empty.
async function rebuildActivePlaylist(newMode) {
  newMode = newMode || ttsState.langSettings || localStorage.getItem(MODE_STORAGE_KEY) || 'trn';
  if (!(ttsState.speaking || ttsState.paused)) return false;

  const wasPaused = ttsState.paused;
  const currentId = ttsState.playlist[ttsState.currentIndex]?.id;
  const pausedIndex = ttsState.currentIndex;

  synth.cancel();
  if (ttsState.googleAudio) {
      ttsState.googleAudio.pause();
      ttsState.googleAudio = null;
  }

  const textData = await prepareTextData(ttsState.currentSlug);
  const newPlaylist = createPlaylistFromData(textData, newMode);

  if (!newPlaylist.length) return false;

  let newIndex = 0;
  if (currentId) {
    const foundIndex = newPlaylist.findIndex(item => item.id === currentId);
    if (foundIndex !== -1) newIndex = foundIndex;
  } else if (pausedIndex < newPlaylist.length) {
    newIndex = pausedIndex;
  }

  ttsState.playlist = newPlaylist;
  ttsState.currentIndex = newIndex;
  ttsState.langSettings = newMode;
  ttsState.speaking = true;
  ttsState.paused = wasPaused;

  if (!wasPaused) {
    setButtonIcon('pause');
    playCurrentSegment();
  } else {
    setButtonIcon('play');
    highlightAndScrollToItem(ttsState.playlist[ttsState.currentIndex]);
  }
  return true;
}

// voice.js had no listener for dhamma:languagechange at all (unlike reader/common.js's
// window.isRuPath/window.siteLanguage, which do react to it) — ttsState.playlist is a one-time
// snapshot of text/lang/DOM-element taken when playback started, so switching the reading
// language in-SPA (no reload) and pressing "continue" kept speaking the old language (owner:
// "нужна перезагрузка чтобы поменять язык чтения... раньше это было невозможно без СПА режима").
// IMPORTANT: this event fires from dhamma-i18n.js's setSiteLanguage() (interface-string config
// load), which megareader.js's switchReadingLanguage() awaits BEFORE calling buildSutta() — so
// by the time this listener runs, the sutta DOM is usually still in the OLD language, and a
// rebuild here would just re-capture stale content. The authoritative rebuild for an actual
// reading-language switch is the direct window.rebuildActivePlaylist() call in
// switchReadingLanguage() itself, made AFTER buildSutta() finishes (see megareader.js). This
// listener stays as a catch-all for any OTHER path that changes the page language without going
// through switchReadingLanguage (harmless no-op re-scan if the content didn't actually change).
document.addEventListener('dhamma:languagechange', function (e) {
    if (e.detail && e.detail.language) window.isRu = e.detail.language === 'ru';
    if (ttsState.playlist.length > 0) {
        rebuildActivePlaylist();
    }
});

function ttsModeLabels() {
  return window.isRu
    ? { 'pi': 'Пали', 'pi-trn': 'Пали + Рус', 'trn': 'Перевод', 'trn-pi': 'Рус + Пали' }
    : { 'pi': 'Pāḷi', 'pi-trn': 'Pāḷi + Trn', 'trn': 'Trn', 'trn-pi': 'Trn + Pāḷi' };
}

// The player is built once, but the reading language can change in place (SPA): relabel the mode
// list and refill the voice lists (translation voices follow the translation language). Called by
// megareader.js once the sutta is re-rendered in the new language.
window.refreshTtsLanguage = function () {
  const modeSelect = document.getElementById('tts-mode-select');
  if (!modeSelect) return;
  const labels = ttsModeLabels();
  for (const o of modeSelect.options) if (labels[o.value]) o.textContent = labels[o.value];
  paintModeChip();
  const t = ttsUiText();
  document.querySelectorAll('#voice-player-container [data-t], .tts-win [data-t]').forEach(el => { if (t[el.dataset.t]) el.textContent = t[el.dataset.t]; });
  closeTtsWins();
  refreshVoiceDropdowns();
};

async function startPlayback(container, mode, slug, startIndex = 0) {
  const textData = await prepareTextData(slug);
  if (!textData.length) {
    console.warn('Нет данных для воспроизведения');
    return;
  }
  const playlist = createPlaylistFromData(textData, mode);
  if (!playlist.length) {
    console.warn('Плейлист пуст для режима:', mode);
    return;
  }
  
  let actualStartIndex = startIndex;
  const activeWord = container.querySelector('.active-word');
  
  if (activeWord) {
    const activeId = getElementId(activeWord);
    if (activeId) {
      const foundIndex = playlist.findIndex(item => item.id === activeId);
      if (foundIndex !== -1) {
        actualStartIndex = foundIndex;
      } else {
        const sourceIndex = textData.findIndex(item => item.id === activeId);
        if (sourceIndex !== -1) {
          for (let i = sourceIndex + 1; i < textData.length; i++) {
            const nextId = textData[i].id;
            const nextInPlaylistIndex = playlist.findIndex(item => item.id === nextId);
            if (nextInPlaylistIndex !== -1) {
              actualStartIndex = nextInPlaylistIndex;
              break; 
            }
          }
        }
      }
    }
  } else {
    if (actualStartIndex === 0 && slug) {
      const lastSlug = localStorage.getItem(LAST_SLUG_KEY);
      const lastIndex = parseInt(localStorage.getItem(LAST_INDEX_KEY) || '0');
      // Оборачиваем текущий слаг в наш хелпер для проверки
      if (lastSlug === getSavedSlugName(slug) && lastIndex < playlist.length) {
        actualStartIndex = lastIndex;
      }
    }

  }
  
  synth.cancel();
  if (ttsState.googleAudio) {
      ttsState.googleAudio.pause();
      ttsState.googleAudio = null;
  }

  // === UNLOCK GLOBAL AUDIO FOR IOS ===
  if (!window.sharedGoogleAudio) {
      window.sharedGoogleAudio = new Audio();
  }
  // Пустой короткий MP3 для снятия блокировки автоплей при клике
  window.sharedGoogleAudio.src = 'data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
  window.sharedGoogleAudio.play().catch(e => console.warn('Unlock failed', e));
  // ===================================
  
  toggleSilence(true);
  
  ttsState.playlist = playlist;
  ttsState.currentIndex = actualStartIndex;
  ttsState.currentSlug = slug;
  
  ttsState.endIndex = undefined; // Сброс границы заучивания
  document.dispatchEvent(new CustomEvent('tts-playback-started')); // Сигнал отключения цикла
  
  ttsState.langSettings = mode;
  ttsState.speaking = true;
  ttsState.paused = false;
  ttsState.isNavigating = false;
  
  setButtonIcon('pause');
  
  // --- НОВОЕ: Показываем Hint при первом воспроизведении (с ссылкой) ---
  // Shown to everyone on the first play (online or offline, own key or demo); PALI_ALERT_KEY is
  // shared with the Pali-fallback hint, so closing either one silences both.
  if (!localStorage.getItem(PALI_ALERT_KEY)) {
      const searchUrlRu = "https://www.google.com/search?q=%D0%BA%D0%B0%D0%BA+%D0%BF%D0%BE%D0%BB%D1%83%D1%87%D0%B8%D1%82%D1%8C+%D0%B0%D0%BF%D0%B8+%D0%BA%D0%BB%D1%8E%D1%87+%D0%B3%D1%83%D0%B3%D0%BB+tts";
      const searchUrlEn = "https://www.google.com/search?q=how+to+get+google+cloud+text+to+speech+api+key";
      const linkStyle = "color: #4da6ff; text-decoration: underline; font-weight: bold;";

      // Issue #37: one single hint must cover both paths at once - Google voices online
      // (free key, optional) and the system-voice setup needed offline.
      // DG voice (our own Piper voices) reads by default and needs no key; Google and the device's
      // voices are the alternatives in ⚙ → Voice settings.
      // Owner: short, just the three kinds of voices (the "for offline" line is what Built-in says).
      const li = 'display:block;text-align:left;margin-top:4px';
      const message = window.isRu
          ? `(⚙ → Voice settings):<span style="${li}">• <b>DG Voice</b> — бесплатные нейроголоса</span><span style="${li}">• <b>Google</b> — бесплатный лимит, нужен <a href="${searchUrlRu}" target="_blank" style="${linkStyle}">свой API-ключ</a></span><span style="${li}">• <b>Встроенные</b> — голоса вашего устройства, работают без интернета</span>`
          : `(⚙ → Voice settings):<span style="${li}">• <b>DG Voice</b> — free neural voices</span><span style="${li}">• <b>Google</b> — free quota, needs <a href="${searchUrlEn}" target="_blank" style="${linkStyle}">your own API key</a></span><span style="${li}">• <b>Built-in</b> — your device's voices, work offline</span>`;

      showVoiceHint(window.isRu ? 'Попробуйте разные голоса' : 'Try different voices', message, PALI_ALERT_KEY);
  }
  
  ensureVoicesReady().then(() => {
      setTimeout(() => {
         playCurrentSegment();
      }, 100);
  });
}

function showVoiceHint(title, message, storageKey) {
  if (localStorage.getItem(storageKey)) return;
  if (document.getElementById('active-voice-hint')) return;

  const notification = document.createElement('div');
  notification.id = 'active-voice-hint'; 

  notification.innerHTML = `
      <div class="hint" style="display: flex; align-items: center; gap: 10px;">
          <div>💡 <strong>${title}</strong> ${message}</div>
          <button id="closeVoiceHintBtn" style="background: none; border: none; color: white; font-size: 16px; cursor: pointer; padding: 0 0 0 10px;" title="(Esc)">×</button>
      </div>
  `;

  Object.assign(notification.style, {
      position: 'fixed', top: '30%', left: '50%', transform: 'translateX(-50%)',
      backgroundColor: 'rgba(66, 66, 106, 1)', color: 'white',
      padding: '12px 20px', borderRadius: '8px', fontSize: '14px', zIndex: '9999',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)', animation: 'fadeInUp 0.5s ease-out',
      // left:50% alone limits a fixed box to half the screen: on a phone the text stood in a narrow column
      width: 'max-content', maxWidth: 'min(600px, calc(100vw - 32px))', boxSizing: 'border-box',
      minWidth: '200px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)'
  });

  document.body.appendChild(notification);

  if (!document.getElementById('voice-hint-styles')) {
      const style = document.createElement('style');
      style.id = 'voice-hint-styles';
      style.textContent = `
          @keyframes fadeInUp { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
          @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
          #closeVoiceHintBtn:hover { color: #ccc; }
          #active-voice-hint b { color: inherit; } /* page CSS paints <b> red: unreadable on this dark card */
      `;
      document.head.appendChild(style);
  }

  const closeBtn = notification.querySelector('#closeVoiceHintBtn');
  const onEsc = e => { if (e.key === 'Escape') closeBtn.click(); };
  document.addEventListener('keydown', onEsc);
  closeBtn.addEventListener('click', function() {
      document.removeEventListener('keydown', onEsc);
      notification.style.animation = 'fadeOut 0.3s ease-in';
      setTimeout(() => {
          notification.remove();
          localStorage.setItem(storageKey, 'true'); 
      }, 300);
  });
}

function getPlayerHtml() {
  const isSpecialPath = window.location.pathname.match(/\/d\/|\/memorize\//);
  const defaultMode = isSpecialPath ? 'pi' : 'trn';
  const savedMode = localStorage.getItem(MODE_STORAGE_KEY) || defaultMode;
  
  const saved = localStorage.getItem(GOOGLE_KEY_STORAGE);
  const savedKey = saved ?? window.TRIAL_KEY ?? '';
  const isNativePali = localStorage.getItem(NATIVE_PALI_KEY) === 'true'; 
  const isNativeTrn = localStorage.getItem(NATIVE_TRN_KEY) === 'true'; 
  const engine = getTtsEngine();
  const trnEngine = getTrnEngine();


  // Points at the new Docs/Help portal (both RU and EN use the clean /tts slug now),
  // not the legacy static ttsHelp.html page.
  const helpUrl = window.isRu ? '/ru/docs/tts' : '/docs/tts';

  const modeLabels = ttsModeLabels();

  const t = ttsUiText();
  const gi = (icon) => `<i class="tts-gi" style="--u:url('/assets/svg/${icon}')"></i>`;
  const voiceRow = (l, label) => `
          <div class="google-voice-select-group tts-vrow${l === 'pi' ? ' tts-pali-voice-group' : ''}" data-l="${l}">
              <span class="vk" data-t="${l === 'pi' ? 'pali' : 'trn'}">${label}</span>
              <button type="button" class="tts-vbtn" title="${t.engine}"></button>
              <button type="button" class="tts-ib tts-vtry" title="${t.tryVoice}">${gi('play.svg')}</button>
              <div id="${l === 'pi' ? 'pali' : 'trn'}-google-dropdowns" class="tts-vsel">
                  <select id="tts-engine-${l === 'pi' ? 'pali' : 'trn'}" class="google-voice-dropdown tts-engine-dropdown">
                    <option value="dg" ${(l === 'pi' ? engine : trnEngine) === 'dg' ? 'selected' : ''}>${t.engineDg}</option>
                    <option value="google" ${(l === 'pi' ? engine : trnEngine) === 'google' ? 'selected' : ''}>Google Cloud</option>
                    <option value="native" ${(l === 'pi' ? engine : trnEngine) === 'native' ? 'selected' : ''}>${t.engineNative}</option>
                  </select>
                  <select id="google-lang-select-${l === 'pi' ? 'pali' : 'trn'}" class="google-voice-dropdown"></select>
                  <select id="google-voice-select-${l === 'pi' ? 'pali' : 'trn'}" class="google-voice-dropdown"></select>
              </div>
          </div>`;

  return `
    <div class="tts-container-inner">
      <div class="tts-main-row tts-top">
        <a href="javascript:void(0)" id="tts-settings-toggle" class="tts-ib" aria-expanded="false" title="${t.settings}">${gi('gear.svg')}</a>
        <div class="tts-controls-row tts-tr">
          <a href="javascript:void(0)" title="← ↑" class="prev-main-button tts-ib">${gi('backward-step.svg')}</a>
          <a href="javascript:void(0)" title="Space" class="play-main-button tts-play"><svg class="pp" viewBox="0 0 24 24" aria-hidden="true"><path class="pp-l" d="M7.7 4.5L14.2 8.25L14.2 15.75L7.7 19.5Z"/><path class="pp-r" d="M14.2 8.25L20.7 12L20.7 12L14.2 15.75Z"/></svg></a>
          <a href="javascript:void(0)" title="→ ↓" class="next-main-button tts-ib">${gi('forward-step.svg')}</a>
        </div>
        <a href="javascript:void(0)" title="Esc" class="tts-ib close-tts-btn">&times;</a>
      </div>

      <div class="tts-chips">
        <select id="tts-mode-select" class="tts-mode-select" hidden>
          ${Object.entries(modeLabels).map(([val, label]) =>
            `<option value="${val}" ${savedMode === val ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
        <button type="button" class="tts-chip" id="tts-mode-chip" aria-expanded="false" title="${t.modeTitle}"><span id="tts-mode-label">${modeLabels[savedMode] || ''}</span><span class="dd">▾</span></button>
        <button type="button" id="tts-rate-btn" class="tts-chip tts-rate-select" aria-expanded="false">${formatRate(savedRate(savedMode === 'pi' ? 'pali' : 'trn'))}</button>
      </div>

      <div id="tts-settings-panel" class="tts-pan">
          <div class="tts-grp" data-t="playback">${t.playback}</div>
          <label class="tts-row"><span class="lb"><span data-t="scroll">${t.scroll}</span> <span class="tts-kbd">S</span><small data-t="scrollSub">${t.scrollSub}</small></span><span class="tts-sw"><input type="checkbox" id="tts-scroll-toggle" ${ttsState.autoScroll ? 'checked' : ''}><span></span></span></label>
          <div class="tts-row tts-delay-row"><span class="lb" title="${t.delayTitle}" data-t="delay">${t.delay}</span><span class="tts-stp"><button type="button" data-stp="tts-segment-delay-input" data-d="-0.5" aria-label="−">−</button><span id="tts-segment-delay-input" class="stp-v" contenteditable="true" inputmode="decimal" spellcheck="false">${localStorage.getItem('dg_tts_segment_delay') || 0}</span><span class="u" data-t="sec">${t.sec}</span><button type="button" data-stp="tts-segment-delay-input" data-d="0.5" aria-label="+">+</button></span></div>
          <div class="tts-row"><span class="lb"><span data-t="offline">${t.offline}</span><small id="tts-off-sub">${t.offSub}</small></span><button type="button" id="tts-off-btn" class="tts-chip">${t.offVoices}</button></div>
          <div class="tts-links tts-links-row">
            <a href="javascript:void(0)" id="tts-advanced-toggle-btn" title="${t.engineSettingsTitle}">${gi('wrench-solid-full.svg')}${t.engineSettings}</a>
            <span id="audio-file-link-placeholder"></span>
            <a href="${helpUrl}" target="_blank" class="tts-link tts-help-link" data-t="help">${t.help}</a>
          </div>
      </div>

      <div id="tts-advanced-settings" class="tts-pan" data-pali-engine="${engine}" data-trn-engine="${trnEngine}">
          <div class="tts-sub-h"><button type="button" class="tts-ib" id="tts-voice-back" title="${t.back}">‹</button><span>${t.engineSettings}</span></div>
          <div id="google-voice-settings-container">${voiceRow('pi', t.pali)}${voiceRow('trn', t.trn)}</div>
          <div class="api-key-block tts-key">
              <input type="password" id="google-api-key-input" value="${savedKey}" placeholder="Google Cloud API key" title="${t.apiKeyTitle}">
              <button type="button" id="refresh-voices-btn" class="tts-ib spin refresh-api-btn" title="${t.refreshVoices}">${gi('rotate-right-solid-full.svg')}</button>
              <button type="button" id="reset-tts-btn" class="tts-ib danger reset-tts-btn" title="${t.resetTts}">${gi('trash-can-regular-full.svg')}</button>
          </div>
      </div>
    </div>
    `;
}

// Player labels, in the page's language (window.isRu is re-read on every build and SPA switch).
function ttsUiText() {
  const ru = window.isRu;
  return {
    settings: ru ? "Настройки" : "Settings",
    offline: ru ? "Без интернета" : "Offline",
    offSub: ru ? "Голос можно скачать в списке голосов DG" : "Download a voice in the DG voice list",
    offVoices: ru ? "Голоса" : "Voices",
    offOffer: ru ? "Слушать без интернета" : "Listen offline",
    offLater: ru ? "Позже" : "Later",
    offLoadT: ru ? "Скачивание голоса" : "Downloading the voice",
    offCancel: ru ? "Отмена" : "Cancel",
    offDoneT: ru ? "Голос скачан" : "Voice downloaded",
    offSettings: ru ? "Настройки" : "Settings",
    offErr: {
      net: ru ? "Не скачалось: нет сети." : "Not downloaded: no network.",
      space: mb => ru ? `Нет места: нужно ${mb} МБ.` : `No space: ${mb} MB needed.`,
      server: ru ? "Не скачалось: сервер недоступен." : "Not downloaded: server unavailable.",
    },
    offRetry: ru ? "Повторить" : "Retry",
    offVoicesBtn: ru ? "Голоса" : "Voices",
    offStaleT: () => ru ? "Есть обновление" : "Update available",
    offNonetT: ru ? "Нет сети: читает голос устройства" : "No network: the device's voice reads",
    close: ru ? "Закрыть" : "Close",
    offGet: ru ? "Скачать" : "Download",
    offDel: ru ? "Удалить" : "Remove",
    offUpd: ru ? "Обновить" : "Update",
    offNo: ru ? "Не надо" : "No thanks",
    offHave: ru ? "Скачано" : "Downloaded",
    offStale: ru ? "есть новая версия" : "a newer version is out",
    offLoading: ru ? "Скачивание…" : "Downloading…",
    offDone: ru ? "Голос скачан: читает и без интернета" : "Voice downloaded: reads with no network",
    offFail: ru ? "Не удалось скачать, попробуйте позже" : "Download failed, try again later",
    mb: ru ? "МБ" : "MB",
    playback: ru ? "Воспроизведение" : "Playback",
    scroll: ru ? "Автоскролл" : "Scroll",
    scrollSub: ru ? "Текст едет за голосом" : "Text follows the voice",
    delay: ru ? "Пауза м-у фразами" : "Delay",
    sec: ru ? "с" : "sec",
    delayTitle: ru ? "Пауза между фразами (секунды)" : "Pause between phrases (seconds)",
    modeTitle: ru ? "Что читать (клавиши 1–4)" : "What to read (keys 1–4)",
    pali: ru ? "Пали" : "Pāḷi",
    trn: ru ? "Перевод" : "Translation",
    apiKeyTitle: ru ? "Ключ Google Cloud Text-to-Speech" : "Google Cloud Text-to-Speech API key",
    refreshVoices: ru ? "Обновить список голосов" : "Refresh the voice list",
    resetTts: ru ? "Полный сброс: убрать ключ и скачанные голоса, вернуть системные голоса" : "Full reset: remove the key and downloaded voices, back to system voices",
    engine: ru ? "Голос" : "Voice",
    engineDg: "DG Voice",
    engineNative: ru ? "Системные" : "System",
    engineSettings: "Voice settings",
    engineSettingsTitle: ru ? "Голоса: движок и голос для пали и перевода" : "Voices: engine and voice for Pāḷi and translation",
    tryVoice: ru ? "Прослушать" : "Listen",
    back: ru ? "Назад" : "Back",
    speed: ru ? "Скорость" : "Speed",
    speedSep: ru ? "отдельно для пали и для перевода" : "separate for Pāḷi and translation",
    voice: ru ? "Голос" : "Voice",
    noVoices: ru ? "Голосов нет на этом устройстве" : "No voices on this device",
    dgE: ru ? "Свои голоса Piper, без ключа" : "Own Piper voices, no key",
    gE: ru ? "Нужен ключ API" : "API key required",
    osE: ru ? "Голоса устройства" : "Device voices",
    help: ru ? "Справка ?" : "Help ?",
    startA: ru ? "Начало A" : "Start A",
    endB: ru ? "Конец B" : "End B"
  };
}


function getOrBuildPlayer() {
    const playerId = 'voice-player-container';
    let playerContainer = document.getElementById(playerId);

    if (!document.getElementById('voice-css-lazy')) {
        // The ?v= stamp matters: /read/css/voice.css is served immutable for a year, so without it a
        // CSS fix would never reach anyone who had already opened the player (issue #20's rule was
        // invisible in the browser because of exactly that). Bump the stamp with the next edit.
        document.head.insertAdjacentHTML('beforeend', '<link id="voice-css-lazy" rel="stylesheet" href="/read/css/voice.css?v=2026-10-10offset2">');
    }

    if (!playerContainer) {
        playerContainer = document.createElement('div');
        playerContainer.id = playerId;
        playerContainer.className = 'voice-dropdown'; 
        
        const player = document.createElement('div');
        player.className = 'voice-player';
        playerContainer.appendChild(player);
        document.body.appendChild(playerContainer);
    }
    
    const playerInner = playerContainer.querySelector('.voice-player');
    if (playerInner) {
        playerInner.innerHTML = getPlayerHtml();
        dgOfflineRender();

        // Запускаем сборку интерфейса (Нативные + Google)
        setTimeout(() => refreshVoiceDropdowns(), 100);
    }

    const placeholder = playerContainer.querySelector('#audio-file-link-placeholder');
    const sourceLink = document.querySelector('span.tts-link[data-src]');

    if (sourceLink && placeholder) {
        const fileUrl = sourceLink.getAttribute('data-src');
        if (fileUrl) {
            placeholder.innerHTML = `<a class='tts-link' href='${fileUrl}' target='_blank'>File</a>`;
            placeholder.style.display = "inline"; 
        } else {
             placeholder.style.display = "none";
        }
    } else if (placeholder) {
        placeholder.style.display = "none";
    }

    return playerContainer;
}

// --- Интерфейс (для index.js) ---
function getTTSInterfaceHTML(texttype, slugReady, slug) {
  return `<a data-slug="${texttype}/${slugReady}" href="javascript:void(0)" title="Text-to-Speech (Alt+R)" class="voice-link">Voice</a>`;
}

// --- Обработчик изменения настроек ---
async function handleTTSSettingChange(e) {

// --- Toggle Advanced Settings ---
  if (e.target.closest('#tts-advanced-toggle-btn')) {
      e.preventDefault();
      paintVoiceButtons();
      ttsMorph(() => showTtsPanel('tts-advanced-settings'));
      return;
  }
  if (e.target.closest('#tts-voice-back')) {
      e.preventDefault();
      closeTtsWins();
      ttsMorph(() => showTtsPanel('tts-settings-panel'));
      return;
  }
  
  // 0. RESET BUTTON (Сброс всего)
  if (e.target.id === 'reset-tts-btn') {
      e.preventDefault();

      const resetMessage = window.isRu
        ? 'Сбросить настройки голоса: отключить Google TTS, удалить API-ключ, удалить скачанные голоса и включить системные голоса?'
        : 'Reset voice settings: disable Google TTS, remove the API key, delete the downloaded voices, and use system voices?';
        
      if (confirm(resetMessage)) {
          // 1. Список ключей для удаления (чистим старое)
          const keysToRemove = [
              GOOGLE_KEY_STORAGE, 
              GOOGLE_PALI_SETTINGS_KEY, 
              'tts_google_trn_custom_voice',
              GOOGLE_TRN_KEY_RU,
              GOOGLE_TRN_KEY_EN,
              GOOGLE_TRN_KEY_STUDY,
              'tts_native_pali_custom_voice',
              'tts_native_trn_custom_voice',
              SCROLL_STORAGE_KEY, 
              MODE_STORAGE_KEY, 
              NATIVE_PALI_KEY,
              NATIVE_TRN_KEY,
              RATE_PALI_KEY, 
              RATE_TRN_KEY, 
              LAST_SLUG_KEY, 
              LAST_INDEX_KEY, 
              PALI_ALERT_KEY
          ];
          
          keysToRemove.forEach(k => localStorage.removeItem(k));
          // the voices downloaded for offline (voice-offline.js) go too
          ['dg_voice_offline', 'dg_voice_offline_no', 'dg_voice_offline_stale', 'dg_voice_offline_later'].forEach(k => localStorage.removeItem(k));
          await new Promise(r => {
            const q = indexedDB.deleteDatabase('dg-voice-offline');
            q.onsuccess = q.onerror = q.onblocked = r;
            setTimeout(r, 2000);
          });

          // 2. ВАЖНО: Ставим блокировку, чтобы триал не вернулся при перезагрузке
          localStorage.setItem(TRIAL_BLOCK_KEY, 'true'); 
          
          window.location.reload();
      }
      return;
  }

  // 0. Engine of a language (first level of engine -> language -> voice)
  if (e.target.id === 'tts-engine-pali' || e.target.id === 'tts-engine-trn') {
      const isPaliRow = e.target.id === 'tts-engine-pali';
      if (isPaliRow) setPaliEngine(e.target.value);
      else setTrnEngine(e.target.value);
      document.getElementById('tts-advanced-settings')?.setAttribute(isPaliRow ? 'data-pali-engine' : 'data-trn-engine', e.target.value);
      refreshVoiceDropdowns();
      markActiveRate(activeRateKind() === 'pali');  // an unchanged Pali speed follows the engine's default
      if (ttsState.speaking && !ttsState.paused) {
          synth.cancel();
          if (ttsState.googleAudio) { ttsState.googleAudio.pause(); ttsState.googleAudio = null; }
          playCurrentSegment();
      }
      return;
  }

  // 0. Toggle Native Pali
  if (e.target.id === 'native-pali-toggle') {
      const isChecked = e.target.checked;
      localStorage.setItem(NATIVE_PALI_KEY, isChecked);
      refreshVoiceDropdowns();
      return; 
  }

  // 0. Toggle Native Translation
  if (e.target.id === 'native-trn-toggle') {
      const isChecked = e.target.checked;
      localStorage.setItem(NATIVE_TRN_KEY, isChecked);
      refreshVoiceDropdowns();
      return; 
  }

  // 1. Refresh Button (Обработка клика по кнопке обновления)
  if (e.target.id === 'refresh-voices-btn') {
      e.preventDefault();
      refreshVoiceDropdowns(true);
      return;
  }

  // 2. Save API Key
  if (e.target.id === 'google-api-key-input') {
      const key = e.target.value.trim();
      localStorage.setItem(GOOGLE_KEY_STORAGE, key);
      
      // Если юзер ввел ключ руками — снимаем блокировку
      localStorage.removeItem(TRIAL_BLOCK_KEY); 
      
      return;
  }

  // 3. Mode
  if (e.target.id === 'tts-mode-select') {
    e.preventDefault();
    const newMode = e.target.value;
    localStorage.setItem(MODE_STORAGE_KEY, newMode);
    await rebuildActivePlaylist(newMode);
  }
  
  // 4. Rate (slider): writes the key of the language it was opened for; restart if that one is playing
  if (e.target.id === 'tts-rate-slider') {
    const kind = e.target.dataset.kind || activeRateKind();
    localStorage.setItem(RATE_RANGE[kind].key, parseFloat(e.target.value));
    markActiveRate(kind === 'pali');

    if (ttsState.speaking && !ttsState.paused && activeRateKind() === kind) {
      synth.cancel();
      if (ttsState.googleAudio) {
          ttsState.googleAudio.pause();
          ttsState.googleAudio = null;
      }
      playCurrentSegment();
    }
  }

  // 5. Scroll
  if (e.target.id === 'tts-scroll-toggle') {
     ttsState.autoScroll = e.target.checked;
     localStorage.setItem(SCROLL_STORAGE_KEY, e.target.checked);

     if (ttsState.autoScroll && (ttsState.speaking || ttsState.paused)) {
        highlightAndScrollToItem(ttsState.playlist[ttsState.currentIndex]);
     }

  }
  
}


document.addEventListener('change', handleTTSSettingChange);
document.addEventListener('input', e => {
  if (e.target.id === 'tts-rate-slider') {
    const v = parseFloat(e.target.value);
    const btn = document.getElementById('tts-rate-btn');
    if (btn) btn.textContent = formatRate(v);
    showRatePopValue(v);
  }
});
// Speed button: opens the slider for the language being read; a click elsewhere closes it.
document.addEventListener('click', e => {
  const btn = e.target.closest('#tts-rate-btn');
  if (btn) {
    const pop = ensureRatePop();
    const wasOpen = pop.classList.contains('on');
    closeTtsWins();
    if (wasOpen) return;
    markActiveRate(activeRateKind() === 'pali');
    placeTtsWin(pop, overPlayer);
    pop.classList.add('on');
    btn.setAttribute('aria-expanded', 'true');
    return;
  }
  if (e.target.closest('.close-tts-win')) { closeTtsWins(); return; }
  const step = e.target.closest('.tts-rate-step');
  const preset = e.target.closest('.tts-rate-preset');
  if (step || preset) {
    const slider = document.getElementById('tts-rate-slider');
    const was = slider.value;
    setSliderRate(step ? parseFloat(slider.value) + parseFloat(slider.step) * +step.dataset.step : +preset.dataset.rate);
    // the big number gives a small bump when a button moved it
    if (slider.value !== was) document.getElementById('tts-rate-title')?.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
    return;
  }
  // a target that re-rendered itself away (voice picker levels) is no click outside
  // (the offline strip's buttons open the voice list themselves)
  if (e.target.isConnected && !e.target.closest('.tts-win, #tts-mode-chip, .tts-vbtn, #tts-off-card')) closeTtsWins();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.querySelector('.tts-win.on')) {
    closeTtsWins();
    e.stopImmediatePropagation();  // Esc closes the window first, the player on the next press
  }
}, true);
// Only a real change of width closes the windows: the language pill dispatches a synthetic 'resize'
// whenever <body> classes change, i.e. on every line read aloud, and a phone's address bar changes
// the height while the text scrolls - both closed the voice picker mid-playback.
let ttsWinWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === ttsWinWidth) return;
  ttsWinWidth = window.innerWidth;
  closeTtsWins();
});

// Smooth change of the player's height when a panel opens or closes (design v4: height .32s on the
// shared easing, the panel that appears fades in .26s). fn does the DOM change.
function ttsMorph(fn) {
  const p = document.querySelector('#voice-player-container .voice-player');
  if (!p) { fn(); return; }
  const from = p.offsetHeight;
  fn();
  const to = p.offsetHeight;
  if (from === to) return;
  p.style.height = from + 'px';
  p.style.overflowY = 'hidden';
  p.offsetHeight;
  p.style.transition = 'height .32s var(--dg-ease)';
  p.style.height = to + 'px';
  p.querySelectorAll('.tts-pan.visible').forEach(x => x.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' }));
  clearTimeout(p._morph);
  p._morph = setTimeout(() => { p.style.height = ''; p.style.transition = ''; p.style.overflowY = ''; }, 340);
}
window.ttsMorph = ttsMorph;

// One panel open at a time: settings, voice settings (a sub-level of settings) or A-B (voice-mem.js)
function showTtsPanel(id) {
  ['tts-settings-panel', 'tts-advanced-settings', 'memorize-panel'].forEach(pid =>
    document.getElementById(pid)?.classList.toggle('visible', pid === id));
  document.getElementById('tts-settings-toggle')?.setAttribute('aria-expanded', String(id === 'tts-settings-panel' || id === 'tts-advanced-settings'));
  document.getElementById('ab-loop-toggle-btn')?.setAttribute('aria-expanded', String(id === 'memorize-panel'));
  if (id !== 'tts-advanced-settings') closeTtsWins();
}
window.showTtsPanel = showTtsPanel;

// Click feedback of the design: ↻ makes a full turn, the bin shakes
function spinIcon(btn) {
  btn.querySelector('.tts-gi')?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 600, easing: 'cubic-bezier(.22,.68,0,1)' });
}
function shakeIcon(btn) {
  btn.querySelector('.tts-gi')?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-18deg)' }, { transform: 'rotate(14deg)' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(0)' }], { duration: 420, easing: 'ease-out' });
}
window.ttsShakeIcon = shakeIcon;

// Stepper counter, a "drum": the old number slides out while the new one slides in. The old value is
// drawn as a ghost over the field (a field cannot hold two values); .tts-stp clips the edges.
function stepTick(el, dir, old) {
  const st = el.closest('.tts-stp'), g = document.createElement('span');
  const r = el.getBoundingClientRect(), sr = st.getBoundingClientRect(), cs = getComputedStyle(el);
  g.textContent = old;
  Object.assign(g.style, { position: 'absolute', left: (r.left - sr.left) + 'px', top: (r.top - sr.top) + 'px', width: r.width + 'px',
    height: r.height + 'px', lineHeight: r.height + 'px', textAlign: cs.textAlign, font: cs.font, color: cs.color, pointerEvents: 'none' });
  st.appendChild(g);
  const d = dir > 0 ? 1 : -1, o = { duration: 300, easing: 'cubic-bezier(.22,.68,0,1)' };
  g.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(' + (-d * 100) + '%)', opacity: 0 }], o).onfinish = () => g.remove();
  el.animate([{ transform: 'translateY(' + (d * 100) + '%)', opacity: 0 }, { transform: 'none', opacity: 1 }], o);
}
// −/+ of a stepper: writes the editable value and fires its input event, so the field's own handler
// (delay here, A-B pause/repeats in voice-mem.js) saves it exactly as when typed. data-inf: 0 shows ∞.
document.addEventListener('click', e => {
  const b = e.target.closest('.tts-stp button[data-stp]');
  if (!b) return;
  const el = document.getElementById(b.dataset.stp);
  if (!el) return;
  const inf = 'inf' in el.dataset, old = el.innerText.trim();
  const v = inf && old === '∞' ? 0 : (parseFloat(old.replace(',', '.')) || 0);
  const nv = Math.max(0, Math.min(+(el.dataset.max || 600), Math.round((v + +b.dataset.d) * 100) / 100));
  if (nv === v) return;
  el.innerText = inf && nv === 0 ? '∞' : String(nv);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('focusout', { bubbles: true }));
  stepTick(el, +b.dataset.d, old);
});

// --- Mode chip: a small menu right above it; the hidden select keeps driving playback ---
function paintModeChip() {
  const sel = document.getElementById('tts-mode-select'), lb = document.getElementById('tts-mode-label');
  if (sel && lb) lb.textContent = sel.options[sel.selectedIndex]?.textContent || '';
}
document.addEventListener('change', e => { if (e.target.id === 'tts-mode-select') paintModeChip(); });
document.addEventListener('click', e => {
  const chip = e.target.closest('#tts-mode-chip');
  const item = e.target.closest('#tts-mode-menu [data-m]');
  if (!chip && !item) return;
  const sel = document.getElementById('tts-mode-select');
  if (item) {
    if (sel && sel.value !== item.dataset.m) {
      sel.value = item.dataset.m;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    closeTtsWins();
    return;
  }
  let menu = document.getElementById('tts-mode-menu');
  const wasOpen = menu?.classList.contains('on');
  closeTtsWins();
  if (wasOpen || !sel) return;
  if (!menu) {
    document.body.insertAdjacentHTML('beforeend', '<div id="tts-mode-menu" class="tts-win menu" role="menu"></div>');
    menu = document.getElementById('tts-mode-menu');
  }
  menu.innerHTML = [...sel.options].map((o, i) => `<button type="button" class="tts-mi" data-m="${o.value}"><span class="ck">${o.value === sel.value ? '✓' : ''}</span><span class="ml">${o.textContent}</span><span class="kb">${i + 1}</span></button>`).join('');
  const r = chip.getBoundingClientRect();
  placeTtsWin(menu, (w, h) => ({ left: Math.max(8, Math.min(window.innerWidth - w - 8, r.left)), top: Math.max(8, r.top - h - 6) }));
  menu.classList.add('on');
  chip.setAttribute('aria-expanded', 'true');
});

// --- Voice picker: engine › (language) › voice, in a window over the player (design v4) ---
// The tree walks the real selects of the Voice settings row (engine, then whichever of the language
// and voice lists that engine shows), so every engine keeps its own loading and saving code.
// Browsing an engine or a language changes those selects; closing without picking a voice puts
// them back.
const ttsVoiceWin = { lang: null, depth: 0, saved: null, picked: false };
const ttsVoiceSel = l => {
  const k = l === 'pi' ? 'pali' : 'trn';
  return { eng: document.getElementById('tts-engine-' + k), lists: ['google-lang-select-' + k, 'google-voice-select-' + k].map(id => document.getElementById(id)) };
};
const ttsShownLists = l => ttsVoiceSel(l).lists.filter(s => s && s.style.display !== 'none' && s.options.length);
const TTS_ENGINE_TAG = { dg: 'DG', google: 'Google' };

function paintVoiceButtons() {
  const t = ttsUiText();
  document.querySelectorAll('#tts-advanced-settings .tts-vrow').forEach(row => {
    const l = row.dataset.l, { eng } = ttsVoiceSel(l), lists = ttsShownLists(l), last = lists[lists.length - 1];
    if (!eng) return;
    const e = eng.value, name = last ? (last.options[last.selectedIndex]?.textContent || '') : '';
    const tag = TTS_ENGINE_TAG[e] || (window.isRu ? 'ОС' : 'OS');
    const btn = row.querySelector('.tts-vbtn');
    btn.innerHTML = `<span class="tts-vtag ${e}">${tag}</span><span class="tts-vnm">${name}</span><span class="tts-vch">›</span>`;
    btn.title = eng.options[eng.selectedIndex]?.textContent + ' · ' + name;
    const tryBtn = row.querySelector('.tts-vtry');
    if (tryBtn) {
      tryBtn.disabled = e !== 'dg';  // previews go through the DG voice service
      tryBtn.title = e === 'dg' ? t.tryVoice : (window.isRu ? 'Прослушать можно голоса DG' : 'Preview is for DG voices');
    }
  });
}
document.addEventListener('change', e => { if (e.target.closest('.tts-vsel')) setTimeout(paintVoiceButtons, 0); });

// Lists refill asynchronously after an engine or language change (Google loads its voices)
function ttsListsSettled(l) {
  return new Promise(res => {
    const t0 = Date.now();
    const check = () => {
      const busy = ttsShownLists(l).some(s => [...s.options].some(o => /Loading/.test(o.textContent)));
      if ((!busy && Date.now() - t0 > 120) || Date.now() - t0 > 4000) res(); else setTimeout(check, 60);
    };
    check();
  });
}

function renderVoiceWin() {
  const win = document.getElementById('tts-voice-win'), l = ttsVoiceWin.lang, t = ttsUiText();
  if (!win || !l) return;
  const { eng } = ttsVoiceSel(l), x = '<button type="button" class="tts-ib close-tts-win" title="Esc">×</button>';
  const kind = l === 'pi' ? t.pali : t.trn;
  let html;
  if (ttsVoiceWin.depth === 0) {
    const sub = { dg: t.dgE, google: t.gE, native: t.osE };
    html = `<div class="tts-wh"><span class="t">${t.voice} <small>· ${kind}</small></span>${x}</div>` +
      [...eng.options].map(o => `<button type="button" class="tts-mi" data-eng="${o.value}"><span class="ck">${o.value === eng.value ? '•' : ''}</span><span class="ml">${o.textContent}<span class="eg">${sub[o.value] || ''}</span></span><span class="ar">›</span></button>`).join('');
  } else {
    const lists = ttsShownLists(l), list = lists[ttsVoiceWin.depth - 1];
    const crumb = eng.options[eng.selectedIndex]?.textContent + (ttsVoiceWin.depth > 1 ? ` <small>· ${lists[0].value}</small>` : '');
    const leaf = ttsVoiceWin.depth === lists.length;
    html = `<div class="tts-wh"><button type="button" class="tts-ib" data-vback="1" title="${t.back}">‹</button><span class="t">${crumb}</span>${x}</div>` +
      (!list ? `<div class="tts-mi" aria-disabled="true"><span class="ck"></span><span class="ml">${t.noVoices}</span></div>` : '') +
      (list ? [...list.options].map(o => {
        const item = `<button type="button" class="tts-mi" data-opt="${o.value.replace(/"/g, '&quot;')}" ${list.disabled ? 'disabled' : ''}><span class="ck">${o.value === list.value ? (leaf ? '✓' : '•') : ''}</span><span class="ml">${o.textContent}</span>${leaf ? '' : '<span class="ar">›</span>'}</button>`;
        const off = leaf && eng.value === 'dg' ? dgOffIcon(o.value) : '';  // download / delete for offline (Pali, en, ru)
        return off ? `<div class="tts-mrow">${item}${off}</div>` : item;
      }).join('') : '');
  }
  win.innerHTML = html;
  win.scrollTop = 0;
  placeTtsWin(win, overPlayer);
}

// Back to what was selected when the picker opened (closed without choosing a voice)
async function restoreVoiceWin() {
  const { lang, saved, picked } = ttsVoiceWin;
  if (!lang || !saved || picked) return;
  const { eng, lists } = ttsVoiceSel(lang);
  if (eng.value !== saved.eng) {
    eng.value = saved.eng;
    eng.dispatchEvent(new Event('change', { bubbles: true }));
    await ttsListsSettled(lang);
  }
  lists.forEach((s, i) => {
    if (s && saved.lists[i] != null && s.value !== saved.lists[i] && [...s.options].some(o => o.value === saved.lists[i])) {
      s.value = saved.lists[i];
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  paintVoiceButtons();
}

document.addEventListener('click', async e => {
  const vbtn = e.target.closest('.tts-vbtn');
  const win = document.getElementById('tts-voice-win');
  if (vbtn) {
    const l = vbtn.closest('.tts-vrow').dataset.l, same = ttsVoiceWin.lang === l && win?.classList.contains('on');
    if (ttsVoiceWin.lang) await restoreVoiceWin();
    closeTtsWins();
    if (same) return;
    if (!win) document.body.insertAdjacentHTML('beforeend', '<div id="tts-voice-win" class="tts-win" role="dialog"></div>');
    const { eng, lists } = ttsVoiceSel(l);
    Object.assign(ttsVoiceWin, { lang: l, depth: 0, picked: false, saved: { eng: eng.value, lists: lists.map(s => s?.value) } });
    renderVoiceWin();
    document.getElementById('tts-voice-win').classList.add('on');
    return;
  }
  const b = e.target.closest('#tts-voice-win button');
  if (!b || !ttsVoiceWin.lang) return;
  const l = ttsVoiceWin.lang, { eng } = ttsVoiceSel(l);
  if (b.classList.contains('close-tts-win')) return;  // handled by the shared window closer (restores)
  if (b.dataset.vback) { ttsVoiceWin.depth--; renderVoiceWin(); return; }
  if (b.dataset.eng) {
    if (eng.value !== b.dataset.eng) {
      eng.value = b.dataset.eng;
      eng.dispatchEvent(new Event('change', { bubbles: true }));
      await ttsListsSettled(l);
    }
    ttsVoiceWin.depth = 1;
    renderVoiceWin();
    return;
  }
  if (b.dataset.opt != null) {
    const lists = ttsShownLists(l), list = lists[ttsVoiceWin.depth - 1];
    const leaf = ttsVoiceWin.depth >= lists.length;
    if (leaf) ttsVoiceWin.picked = true;  // before the change event: nothing may restore it meanwhile
    if (list && list.value !== b.dataset.opt) {
      list.value = b.dataset.opt;
      list.dispatchEvent(new Event('change', { bubbles: true }));
      if (!leaf) await ttsListsSettled(l);
    }
    if (leaf) {
      paintVoiceButtons();
      closeTtsWins();
    } else {
      ttsVoiceWin.depth++;
      renderVoiceWin();
    }
  }
});

// --- Voice previews (▶ next to each voice): fixed demo lines through the DG voice service ---
const TTS_DEMO = {
  pi: ['Katamañca bhikkhave dukkhaṁ', 'Yaṁ kho bhikkhave kāyikaṁ dukkhaṁ kāyikaṁ asātaṁ kāyasamphassajaṁ dukkhaṁ asātaṁ vedayitaṁ', 'idaṁ vuccati bhikkhave dukkhaṁ'],
  ru: ['И что такое, монахи, боль?', 'Та которая, монахи, телесная боль, телесный дискомфорт, тела-соприкосновением-рождённая боль, дискомфорт почувствованный,', 'это называется, монахи, боль.'],
  en: ['“And what is pain?', 'Whatever is experienced as bodily pain, bodily discomfort, pain or discomfort born of bodily contact,', 'that is called pain.']
};
const TTS_SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
let ttsDemo = null;  // { btn, audio, stop }

function stopTtsDemo() {
  if (!ttsDemo) return;
  ttsDemo.stopped = true;
  ttsDemo.audio.pause();
  ttsDemo.btn.classList.remove('on');
  ttsDemo = null;
}

document.addEventListener('click', async e => {
  const btn = e.target.closest('.tts-vtry');
  if (!btn || btn.disabled) return;
  const again = ttsDemo?.btn === btn;
  stopTtsDemo();
  if (again) return;
  if (ttsState.speaking && !ttsState.paused) document.querySelector('.play-main-button')?.click();  // pause the reading
  const l = btn.closest('.tts-vrow').dataset.l;
  let lines, voice, rate;
  if (l === 'pi') {
    const sel = document.getElementById('google-voice-select-pali');
    lines = TTS_DEMO.pi;
    voice = DG_PALI_VOICES.some(v => v.id === sel?.value) ? sel.value : dgPaliVoice();
    rate = savedRate('pali');
  } else {
    const lang = detectTranslationLang() === 'ru' ? 'ru' : 'en', sel = document.getElementById('google-voice-select-trn');
    lines = TTS_DEMO[lang];
    voice = (DG_TRN_VOICES[lang] || []).some(v => v.id === sel?.value) ? sel.value : dgTrnVoice(lang);
    rate = savedRate('trn');
  }
  // created inside the tap so iOS lets it play once the first clip arrives
  const audio = new Audio(TTS_SILENCE);
  audio.play().catch(() => {});
  const run = ttsDemo = { btn, audio, stopped: false };
  btn.classList.add('on');
  const clips = lines.map(text => fetchPaliVoiceAudio(text, rate, voice));  // all requested at once, played in order
  clips.forEach(c => c.catch(() => {}));
  try {
    for (const clip of clips) {
      const b64 = await clip;
      if (run.stopped) return;
      audio.src = 'data:audio/mpeg;base64,' + b64;
      await audio.play();
      await new Promise(res => { audio.onended = res; audio.onpause = res; });
      if (run.stopped) return;
    }
  } catch (err) {
    console.warn('Voice preview failed', err);
  }
  if (ttsDemo === run) stopTtsDemo();
});

document.addEventListener('click', (e) => {
    // Добавили проверку e.target.id === 'tts-advanced-toggle-btn'
    const ctl = e.target.closest('#refresh-voices-btn, #reset-tts-btn, #tts-advanced-toggle-btn, #tts-voice-back');
    if (ctl) {
        if (ctl.id === 'refresh-voices-btn') spinIcon(ctl);
        if (ctl.id === 'reset-tts-btn') shakeIcon(ctl);
        handleTTSSettingChange({ target: ctl, preventDefault: () => e.preventDefault() });
    } else {
        handleSuttaClick(e);
    }
});

// --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ НАТИВНЫХ ГОЛОСОВ (1 СПИСОК) ---
function setupNativeDropdown(voices, selectId, hideSelectId, storageKey, defaultLangCode) {
    const select = document.getElementById(selectId);
    const hideSelect = document.getElementById(hideSelectId);
    if (!select || !hideSelect) return;

    hideSelect.style.display = 'none';
    select.style.display = 'inline-block';
    select.style.maxWidth = '100%';

    // Форматтер для красивых имен регионов (например, US вместо United States)
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    
    const getShortName = (voiceName, langCode) => {
        // Убираем системный мусор из имен Apple/Android
        let cleanName = voiceName.replace(/ \((.*?)\)/g, '').replace(/ - .*$/, '').trim();
        
        // Пытаемся получить код региона из языка (например, "US" из "en-US")
        const parts = langCode.replace('_', '-').split('-');
        if (parts.length > 1) {
            const regionCode = parts[1].toUpperCase();
            try {
                const fullRegion = regionNames.of(regionCode);
                // Если имя голоса содержит полное название страны, меняем его на код
                if (fullRegion && cleanName.includes(fullRegion)) {
                    cleanName = cleanName.replace(fullRegion, regionCode);
                } else if (!cleanName.includes(regionCode)) {
                    // Иначе просто добавляем код, чтобы отличать голоса
                    cleanName = `${cleanName} ${regionCode}`;
                }
            } catch (e) {}
        }
        return cleanName;
    };

    // Форматируем опции: Имя [lang]
    const options = voices.map(v => {
        const lang = v.languageCodes[0];
        const shortName = getShortName(v.name, lang);
        const label = `${shortName} [${lang}]`;
        return { lang: lang, name: v.name, label: label };
    });

    let savedRaw = localStorage.getItem(storageKey);
    let selectedName = null;
    if (savedRaw) {
        try { selectedName = JSON.parse(savedRaw).name; } catch(e){}
    }

    if (!selectedName || !options.find(o => o.name === selectedName)) {
        let defaultOpt = options.find(o => o.lang.replace('_', '-').toLowerCase() === defaultLangCode.toLowerCase()) 
                      || options.find(o => o.lang.replace('_', '-').toLowerCase().startsWith(defaultLangCode.split('-')[0].toLowerCase())) 
                      || options[0];
                      
        selectedName = defaultOpt ? defaultOpt.name : '';
        if (defaultOpt) {
            localStorage.setItem(storageKey, JSON.stringify({ languageCode: defaultOpt.lang, name: defaultOpt.name }));
        }
    }

    select.innerHTML = options.map(o => 
        `<option value="${o.name}" ${o.name === selectedName ? 'selected' : ''}>${o.label}</option>`
    ).join('');

    const newSelect = select.cloneNode(true);
    select.parentNode.replaceChild(newSelect, select);

    newSelect.addEventListener('change', (e) => {
        const chosenOpt = options.find(o => o.name === e.target.value);
        if (chosenOpt) {
            localStorage.setItem(storageKey, JSON.stringify({ languageCode: chosenOpt.lang, name: chosenOpt.name }));
        }
    });
}

// --- ОСНОВНАЯ ФУНКЦИЯ ПОПУЛЯЦИИ СПИСКОВ (ГИБРИДНАЯ: GOOGLE + NATIVE) ---
// The voice buttons of Voice settings show what the lists hold, so they repaint after every refill
async function refreshVoiceDropdowns(forceRefresh = false) {
    await fillVoiceDropdowns(forceRefresh);
    paintVoiceButtons();
}

async function fillVoiceDropdowns(forceRefresh = false) {
    await dgVoicesReady();
    const container = document.getElementById('google-voice-settings-container');
    if (container) container.style.display = 'block';

    const apiKey = localStorage.getItem(GOOGLE_KEY_STORAGE) || window.TRIAL_KEY;
    const hasGoogleKey = apiKey && apiKey.length > 10;

    const isNativePali = localStorage.getItem(NATIVE_PALI_KEY) === 'true' || !hasGoogleKey;
    const isNativeTrn = localStorage.getItem(NATIVE_TRN_KEY) === 'true' || !hasGoogleKey;

    if (forceRefresh) {
        googleVoicesList = []; 
    }

    let googleVoices = [];
    if (hasGoogleKey) {
        if (googleVoicesList.length === 0) {
            const allSelects = document.querySelectorAll('.google-voice-select-group select:not(.tts-engine-dropdown)');
            allSelects.forEach(s => s.innerHTML = '<option>Loading...</option>');
            googleVoicesList = await loadGoogleVoices(apiKey);
        }
        googleVoices = googleVoicesList;
    }

    let nativeVoicesRaw = synth.getVoices();
    if (!nativeVoicesRaw || nativeVoicesRaw.length === 0) {
        nativeVoicesRaw = [];
    }
    
    const nativeVoices = nativeVoicesRaw.map(v => ({
        languageCodes: [v.lang || 'unknown'],
        name: v.name,
        ssmlGender: 'UNKNOWN' 
    }));

    const isIndianLang = (code) => {
        const c = code.replace('_', '-').toLowerCase();
        return c.includes('-in') || c.includes('ne-np') || c.includes('si-lk') || 
               c.startsWith('sa-') || c.startsWith('hi-') || c.startsWith('mr-') || c.startsWith('pa-');
    };
    
    const isEnglishLang = (code) => {
        return code.replace('_', '-').toLowerCase().startsWith('en-');
    };

    // --- НАСТРОЙКА UI PALI ---
    const paliLangSelect = document.getElementById('google-lang-select-pali');
    const paliVoiceSelect = document.getElementById('google-voice-select-pali');
    
    const isChineseLang = (code) => {
        return code.replace('_', '-').toLowerCase().startsWith('zh-');
    };


    if (paliLangSelect && paliVoiceSelect && getTtsEngine() === 'dg') {
        // DG voice: no languages to pick, just the voice
        paliLangSelect.style.display = 'none';
        const sel = freshSelect('google-voice-select-pali');
        sel.style.display = '';
        sel.innerHTML = DG_PALI_VOICES.map(v => `<option value="${v.id}" ${v.id === dgPaliVoice() ? 'selected' : ''}>${v.label}</option>`).join('');
        sel.addEventListener('change', () => localStorage.setItem('tts_dg_voice_pi', sel.value));
    } else if (paliLangSelect && paliVoiceSelect) {
        if (isNativePali) {
            // Теперь включаем сюда и индийские, и китайские для Пали
            let paliNativeVoices = nativeVoices.filter(v => isIndianLang(v.languageCodes[0]) || isChineseLang(v.languageCodes[0]));
            if (paliNativeVoices.length === 0) {
                paliNativeVoices = nativeVoices.filter(v => isEnglishLang(v.languageCodes[0]));
            }

            setupNativeDropdown(paliNativeVoices, 'google-lang-select-pali', 'google-voice-select-pali', 'tts_native_pali_custom_voice', 'sa-IN');
        } else {
            paliLangSelect.style.display = '';
            paliLangSelect.style.maxWidth = '';
            paliVoiceSelect.style.display = '';
            
            // Включаем китайские в список Google для Пали
            const paliVoices = googleVoices.filter(v => isIndianLang(v.languageCodes[0]) || isChineseLang(v.languageCodes[0]));
            setupVoiceSelectors(paliVoices, 'google-lang-select-pali', 'google-voice-select-pali', GOOGLE_PALI_SETTINGS_KEY, DEFAULT_PALI_CONFIG);
        }
}

    // --- НАСТРОЙКА UI TRANSLATION ---
    const trnLangSelect = document.getElementById('google-lang-select-trn');
    const trnVoiceSelect = document.getElementById('google-voice-select-trn');
    
    if (trnLangSelect && trnVoiceSelect && getTrnEngine() === 'dg') {
        // DG voice for the page's translation language; none -> Google reads it (see playCurrentSegment)
        const lang = detectTranslationLang();
        trnLangSelect.style.display = 'none';
        const sel = freshSelect('google-voice-select-trn');
        sel.style.display = '';
        const list = DG_TRN_VOICES[lang];
        sel.innerHTML = list
          ? list.map(v => `<option value="${v.id}" ${v.id === dgTrnVoice(lang) ? 'selected' : ''}>${v.label}</option>`).join('')
          : `<option>${window.isRu ? 'нет голоса DG, читает Google' : 'no DG voice, Google reads it'}</option>`;
        sel.disabled = !list;
        if (list) sel.addEventListener('change', () => localStorage.setItem('tts_dg_voice_' + lang, sel.value));
    } else if (trnLangSelect && trnVoiceSelect) {
        trnVoiceSelect.disabled = false;
        const context = getContextInfo(detectTranslationLang());
        if (isNativeTrn) {
            let trnNativeVoices = [];
            let defTrnNativeLang = 'en-US';

            if (context.isIndianContext) {
                trnNativeVoices = nativeVoices.filter(v => isIndianLang(v.languageCodes[0]));
                if (trnNativeVoices.length === 0) trnNativeVoices = nativeVoices.filter(v => isEnglishLang(v.languageCodes[0]));
                defTrnNativeLang = 'hi-IN'; 
            } else {
                const pageLang = detectTranslationLang(); 
                trnNativeVoices = nativeVoices.filter(v => v.languageCodes[0].replace('_', '-').toLowerCase().startsWith(pageLang));
                
                if (trnNativeVoices.length === 0) {
                    trnNativeVoices = nativeVoices.filter(v => isEnglishLang(v.languageCodes[0]));
                }
                if (trnNativeVoices.length === 0) trnNativeVoices = nativeVoices;
                
                if (pageLang === 'ru') defTrnNativeLang = 'ru-RU';
                else if (pageLang === 'th') defTrnNativeLang = 'th-TH';
            }

            setupNativeDropdown(trnNativeVoices, 'google-lang-select-trn', 'google-voice-select-trn', 'tts_native_trn_custom_voice', defTrnNativeLang);
        } else {
            trnLangSelect.style.display = '';
            trnLangSelect.style.maxWidth = '';
            trnVoiceSelect.style.display = '';
            
            let trnVoices = [];
            if (context.isIndianContext) {
                trnVoices = googleVoices.filter(v => isIndianLang(v.languageCodes[0]));
            } else {
                trnVoices = googleVoices.filter(v => {
                    const code = v.languageCodes[0].replace('_', '-').toLowerCase();
                    return code.startsWith('ru-') || code.startsWith('en-') || code.startsWith('th-');
                });
            }

            let bestDefaultVoice = null;
            if (context.isIndianContext) {
                 bestDefaultVoice = trnVoices.find(v => v.name.includes('pa-IN-Standard-D')) || 
                                    trnVoices.find(v => (v.languageCodes || [''])[0].replace('_', '-').toLowerCase() === 'pa-in') ||
                                    trnVoices[0];
            } else {
                const pageLang = detectTranslationLang(); 
                const preferredName = (pageLang === 'ru') ? 'ru-RU-Standard-D' : 
                                      (pageLang === 'th') ? 'th-TH-Standard-A' : 'en-US-Standard-D';
                
                bestDefaultVoice = trnVoices.find(v => v.name === preferredName) || 
                                   trnVoices.find(v => v.name.includes('Standard') && (v.languageCodes || [''])[0].replace('_', '-').toLowerCase().startsWith(pageLang)) ||
                                   context.defaultConfig;
            }
            const finalDefaultConfig = (bestDefaultVoice && bestDefaultVoice.languageCodes) ? { languageCode: bestDefaultVoice.languageCodes[0], name: bestDefaultVoice.name } : context.defaultConfig;
            
            setupVoiceSelectors(trnVoices, 'google-lang-select-trn', 'google-voice-select-trn', context.storageKey, finalDefaultConfig);
        }
    }
}



// A browser/WebView without Web Speech (Android System WebView, some in-app browsers) has no
// window.speechSynthesis: this line threw on load and took the rest of the file down (Memo in the app).
if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => {
    synth.getVoices();
    // Если панель настроек голоса уже в DOM, обновляем ее, чтобы появились нативные голоса
    if (document.getElementById('google-voice-settings-container')) {
        refreshVoiceDropdowns();
    }
};

function initTTS() {
  synth.getVoices();
}

// Запускаем немедленно, если DOM уже готов (при ленивой загрузке), 
// или ждем готовности, если грузится стандартно
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTTS);
} else {
    initTTS();
}



document.addEventListener('visibilitychange', async () => {
  if (wantWakeLock && document.visibilityState === 'visible') {
    requestWakeLock();
  }
});

// --- АДАПТЕР ДЛЯ THERAVADA.RU (LEGACY HTML) ---

function isLegacyPage() {
    // Если есть блок с классом "a" ИЛИ специфичная для старого дизайна ячейка таблицы
    // ...or a prose page that asks to be read as one (the docs mark their article data-dg-tts-prose)
    return !!document.querySelector('[data-dg-tts-prose]') ||
           document.querySelectorAll('.a').length > 0 || document.querySelector('td[style*="justify"]') !== null;
}

function prepareLegacyData() {
    const prose = document.querySelector('[data-dg-tts-prose]');
    if (prose) return prepareGeneralArticleData(prose);
    const textData = [];
    let segmentCounter = 0;
    let contentCell = null;

    // 1. ОСНОВНОЙ ПУТЬ: Ищем абзацы с классом .a (работает для 95% длинных сутт)
    const firstDivA = document.querySelector('.a');
    if (firstDivA) {
        contentCell = firstDivA.parentElement;
    } 
    // 2. ФОЛБЭК: Для коротких сутт (типа AN 1.6), где нет класса .a
    else {
        // Ищем все ячейки с вертикальным выравниванием (стандартная верстка контента там)
        const candidateCells = document.querySelectorAll('td[valign="top"]');
        for (const cell of candidateCells) {
            // Ищем ячейку, где есть текст, и отсекаем футер (счетчики, копирайты)
            if (cell.textContent.trim().length > 50 && 
                !cell.querySelector('.bottom') && 
                !cell.textContent.includes('theravada.ru – при копировании')) {
                contentCell = cell;
                break;
            }
        }
    }

    if (!contentCell) {
        console.warn("Legacy Parser: Контейнер не найден.");
        return [];
    }

    // 3. ФИКС ОБЁРТКИ: Если весь текст завёрнут в один единственный <div> внутри ячейки, 
    // проваливаемся в него, чтобы парсер мог разобрать текст по предложениям
    if (contentCell.children.length === 1 && contentCell.firstElementChild.tagName === 'DIV') {
        contentCell = contentCell.firstElementChild;
    }

    // Вспомогательная функция для создания сегмента
    const pushSegment = (nodes, text) => {
        if (!text || text.length < 2) return;
        
        // Фильтры мусора
        if (text.includes('Тхеравада.ру') || text.includes('редакция перевода')) return;
        if (text.includes('Содержание')) return;
        
        const segmentId = `legacy-seg-${segmentCounter++}`;
        
        // ВАЖНО: Если у нас несколько узлов (например, "Т" + "ак..."), 
        // мы должны обернуть их в один SPAN, чтобы подсвечивать всё сразу.
        let elementToHighlight;
        
        if (nodes.length === 1 && nodes[0].nodeType === 1 && nodes[0].id) {
            // Если это один элемент и у него уже есть ID (например div.a), используем его
            elementToHighlight = nodes[0];
        } else {
            // Иначе создаем обертку
            const wrapper = document.createElement('span');
            wrapper.className = 'rus-lang legacy-wrapper';
            wrapper.id = segmentId;
            
            // Вставляем обертку перед первым узлом
            const firstNode = nodes[0];
            const parent = firstNode.parentNode;
            if (parent) {
                parent.insertBefore(wrapper, firstNode);
                // Перемещаем все узлы внутрь обертки
                nodes.forEach(node => wrapper.appendChild(node));
                elementToHighlight = wrapper;
            } else {
                // Если узлы оторваны от DOM (редкий случай), просто вернем первый
                elementToHighlight = firstNode;
            }
        }
        
        // Чистим текст для TTS
        const cleanText = text
            .replace(/\[\d+\]/g, '')
            .replace(/\(\d+\)/g, '')
            .replace(/\d+\)/g, '')
            .replace(/^\d+\./, '')
            .replace(/\(.*?\)/g, '') // legacy TTS skipped parenthetical asides — keep that behavior
            // "|" here is Cyrillic/legacy text, not Pali danda — map to comma/period so TTS still
            // pauses instead of gluing clauses together (cf. "казнить нельзя помиловать").
            .replace(/\|\|/g, '. ')
            .replace(/\|/g, ', ')
            .replace(/\s+/g, ' ')
            .replace(/\*/g, '')
            .replace(/^[\*\-•]\s*/, '')
            .trim();

        if (cleanText.length > 0) {
            textData.push({
                id: elementToHighlight.id || segmentId,
                paliDev: "", 
                translation: cleanText,
                paliElement: null,
                translationElement: elementToHighlight
            });
        }
    };

    // 2. ПРОХОД ПО УЗЛАМ (Группировка)
    // Мы идем по детям контейнера. Если видим текст/font/b/i -> копим в буфер.
    // Если видим DIV/P/BR/TABLE -> сбрасываем буфер в сегмент, а потом обрабатываем блок.
    
    const childNodes = Array.from(contentCell.childNodes);
    let bufferNodes = [];
    let bufferText = "";

    const flushBuffer = () => {
        if (bufferNodes.length > 0) {
            pushSegment(bufferNodes, bufferText.trim());
            bufferNodes = [];
            bufferText = "";
        }
    };

    const isInline = (node) => {
        if (node.nodeType === 3) return true; // Текст
        if (!node.tagName) return false;
        // Теги, которые считаем частью строки
        const inlineTags = ['FONT', 'B', 'I', 'SPAN', 'A', 'STRONG', 'EM', 'SUP', 'SUB'];
        return inlineTags.includes(node.tagName);
    };

    childNodes.forEach((node) => {
        // Игнорируем пустые текстовые узлы (пробелы между дивами)
        if (node.nodeType === 3 && node.textContent.trim().length === 0) {
            // Но если мы внутри предложения (буфер не пуст), пробел может быть важен?
            // Обычно в HTML пробелы между тегами схлопываются. Добавим пробел в текст, но узел можно не сохранять, если он пустой.
            if (bufferNodes.length > 0) bufferText += " ";
            return;
        }

        if (isInline(node)) {
            // Это часть текущего предложения
            bufferNodes.push(node);
            bufferText += node.textContent;
        } else {
            // Это блочный элемент (DIV, BR, TABLE и т.д.) -> Разрыв
            flushBuffer();

            // Если это BR, просто игнорируем (он сработал как разрыв)
            if (node.tagName === 'BR') return;

            // Если это DIV (например div.a с диалогом), обрабатываем его как отдельный сегмент
            if (['DIV', 'P', 'H1', 'H2', 'H3', 'H4'].includes(node.tagName)) {
                // Берем весь текст блока
                pushSegment([node], node.textContent);
            }
        }
    });

    // Сбрасываем остатки буфера (если текст был в самом конце)
    flushBuffer();

    return textData;
}


// root: a prose page's article (docs, data-dg-tts-prose) instead of the whole page. There a block that
// holds other text blocks (blockquote > p, li > p) is read through them, not a second time as a whole.
function prepareGeneralArticleData(root) {
    const textData = [];
    let segmentCounter = 0;
    const BLOCKS = 'h1, h2, h3, h4, h5, h6, p, li, blockquote';

    // Ищем все потенциально текстовые элементы на странице
    let elements = Array.from((root || document).querySelectorAll(BLOCKS));
    if (root) elements = elements.filter(el => !el.querySelector(BLOCKS));

    elements.forEach(el => {
        // Пропускаем элементы навигации, футера или скрытые блоки (чтобы не читать меню)
        if (el.closest('.input-group') || el.closest('footer') || el.closest('nav') || el.closest('.tts-ignore')) {
            return;
        }

        const text = el.textContent.trim();
        
        // Берем только элементы, где есть хотя бы немного текста
        if (text.length > 2) {
            // Генерируем уникальный ID для элемента, если его нет (нужно для подсветки и автоскролла)
            if (!el.id) {
                el.id = `gen-seg-${segmentCounter}`;
            }
            segmentCounter++;

            textData.push({
                id: el.id,
                paliDev: "", // В обычных статьях пали не разделен, читаем всё как перевод
                translation: cleanTextForTTS(text),
                paliElement: null,
                translationElement: el
            });
        }
    });

    return textData;
}

// Экспорт API для внешних модулей (memorize.js)
window.ttsAPI = {
    getState: () => ttsState,
    playRange: async function(startId, endId) {
        const mode = document.getElementById('tts-mode-select')?.value || localStorage.getItem(MODE_STORAGE_KEY) || 'trn';
        let slug = ttsState.currentSlug || window.location.pathname.replace(/[^a-zA-Z0-9]/g, '_');
        
        const textData = await prepareTextData(slug);
        const playlist = createPlaylistFromData(textData, mode);
        
        if (!playlist.length) return;

        let sIdx = playlist.findIndex(item => item.id === startId);
        // Ищем ПОСЛЕДНЕЕ совпадение для endId
        let eIdx = -1;
        for (let i = playlist.length - 1; i >= 0; i--) {
            if (playlist[i].id === endId) {
                eIdx = i;
                break;
            }
        }
        
        if (sIdx === -1) sIdx = 0;
        if (eIdx === -1) eIdx = playlist.length - 1;

        ttsState.playlist = playlist;
        ttsState.currentIndex = sIdx;
        ttsState.startIndex = sIdx;
        ttsState.endIndex = eIdx;
        ttsState.currentSlug = slug;
        ttsState.langSettings = mode;
        ttsState.speaking = true;
        ttsState.paused = false;
        
        setButtonIcon('pause');
        toggleSilence(true);
        playCurrentSegment();
    },
    stop: stopPlayback,
    keepSilenceAlive: toggleSilence,
    releaseWakeLock: releaseWakeLock,
    requestWakeLock: requestWakeLock
};

// --- Обработка поля Delay (Span ContentEditable) ---
document.addEventListener('input', (e) => {
    if (e.target.id === 'tts-segment-delay-input') {
        let text = e.target.innerText.replace(/[^0-9.,]/g, '').replace(',', '.');
        let parts = text.split('.');
        if (parts.length > 2) text = parts[0] + '.' + parts.slice(1).join('');
        
        if (text !== e.target.innerText) {
            e.target.innerText = text;
            const range = document.createRange();
            range.selectNodeContents(e.target);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
        
        let val = parseFloat(text);
        if (isNaN(val) || val < 0) val = 0;
        localStorage.setItem(SEGMENT_DELAY_KEY, val);
        window.TTS_SEGMENT_DELAY = val * 1000;
    }
});

document.addEventListener('focusout', (e) => {
    if (e.target.id === 'tts-segment-delay-input') {
        let val = parseFloat(e.target.innerText);
        if (e.target.innerText.trim() === '' || isNaN(val)) {
            e.target.innerText = '0';
            localStorage.setItem(SEGMENT_DELAY_KEY, 0);
            window.TTS_SEGMENT_DELAY = 0;
        }
    }
});

document.addEventListener('keydown', (e) => {
    if (e.target.id === 'tts-segment-delay-input' && e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
    }
});

document.addEventListener('focusin', (e) => {
    if (e.target.id === 'tts-segment-delay-input') {
        const range = document.createRange();
        range.selectNodeContents(e.target);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
});
// ---------------------------------------------------


// --- Глобальная функция конвертации Pāli -> Devanagari ---
window.convertPaliToDevanagari = function(str) {
    if (!str) return str;
    const mapping = {
        'kh':'ख', 'gh':'घ', 'ch':'छ', 'jh':'झ', 'ṭh':'ठ', 'ḍh':'ढ', 'th':'थ', 'dh':'ध', 'ph':'फ', 'bh':'भ',
        'k':'क', 'g':'ग', 'ṅ':'ङ', 'c':'च', 'j':'ज', 'ñ':'ञ', 'ṭ':'ट', 'ḍ':'ड', 'ṇ':'ण', 't':'त', 'd':'द', 'n':'न',
        'p':'प', 'b':'ब', 'm':'म', 'y':'य', 'r':'र', 'l':'ल', 'ḷ':'ळ', 'v':'व', 's':'स', 'h':'ह'
    };
    const vowels = {'a':'अ', 'ā':'आ', 'i':'इ', 'ī':'ई', 'u':'उ', 'ū':'ऊ', 'e':'ए', 'o':'ओ'};
    const marks = {'ā':'ा', 'i':'ि', 'ī':'ी', 'u':'ु', 'ū':'ू', 'e':'े', 'o':'ो'};
    
    let res = ""; 
    let i = 0; 
    str = str.toLowerCase();

    const isSingleWord = !str.trim().includes(' ');

    if (isSingleWord) {
        const cleanWord = str.replace(/[.,;!?\n|]/g, '').trim();
        const specialCases = {};
        
        if (specialCases[cleanWord]) {
            let punctuation = str.match(/[.,;!?\n|]+$/);
            return specialCases[cleanWord] + (punctuation ? punctuation[0] : '');
        }
    }

    while (i < str.length) {
        let char = str[i]; 
        let nextChar = str[i+1] || ''; 
        let doubleChar = char + nextChar;
        
        if (char === 'ṃ' || char === 'ṁ') { 
            res += (isSingleWord && i === str.length - 1) ? 'ङ्' : 'ं'; 
            i++; 
            continue; 
        }
        
        if (vowels[char]) {
            if (i === 0 || !str[i-1].match(/[a-zāīūṭḍṇṅñṃḷ]/i) || vowels[str[i-1]]) res += vowels[char];
            i++; continue;
        }
        
        let cons = mapping[doubleChar] ? doubleChar : (mapping[char] ? char : null);
        if (cons) {
            res += mapping[cons]; 
            i += cons.length; 
            let v = str[i];
            if (vowels[v]) {
                if (v !== 'a') res += marks[v];
                i++;
            } else if (!v || (v !== ' ' && !v.match(/[.,;!?\n]/))) {
                res += '्'; 
                if (v === 'h' && char === 'm') res += '\u200C';
            }
            continue;
        }
        res += char; 
        i++;
    }
    return res;
};

// --- Централизованное управление плеером с клавиатуры ---
document.addEventListener('keydown', (e) => {
    // Игнорируем нажатия, если фокус находится в текстовом поле
    const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
    if (isInput) return;

    // Проверяем, развернут ли/активен ли плеер в данный момент
    const player = document.getElementById('voice-player-container');
    const isActive = player && player.classList.contains('active');
    if (!isActive) return;

    // Игнорируем нажатия с зажатыми модификаторами (Alt, Ctrl, Cmd/Win), 
    // чтобы не перебивать глобальные горячие клавиши
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    // Используем глобальную функцию


    // 1. Горячая клавиша: S (Автоскролл)
    if (e.code === 'KeyS') {
        e.preventDefault();
        ttsState.autoScroll = !ttsState.autoScroll;
        localStorage.setItem(SCROLL_STORAGE_KEY, ttsState.autoScroll);
        
        const scrollToggle = document.getElementById('tts-scroll-toggle');
        if (scrollToggle) scrollToggle.checked = ttsState.autoScroll;
        
        if (typeof showBubbleNotification === 'function') {
            const msg = ttsState.autoScroll 
                ? (window.isRu ? 'Автоскролл: Вкл' : 'Autoscroll: On') 
                : (window.isRu ? 'Автоскролл: Выкл' : 'Autoscroll: Off');
            showBubbleNotification(msg);
        }
        return;
    }

    // 2. Горячие клавиши: 1, 2, 3, 4 (Режимы TTS) + Numpad
    if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'].includes(e.code)) {
        e.preventDefault();
        
        let newMode = '';
        if (e.code === 'Digit1' || e.code === 'Numpad1') newMode = 'pi';
        else if (e.code === 'Digit2' || e.code === 'Numpad2') newMode = 'pi-trn';
        else if (e.code === 'Digit3' || e.code === 'Numpad3') newMode = 'trn';
        else if (e.code === 'Digit4' || e.code === 'Numpad4') newMode = 'trn-pi';

        if (newMode) {
            localStorage.setItem(MODE_STORAGE_KEY, newMode);
            const modeSelect = document.getElementById('tts-mode-select');
            
            if (modeSelect) {
                modeSelect.value = newMode;
                modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }

            if (typeof showBubbleNotification === 'function') {
                const modeLabelsRu = { 'pi': 'Пали', 'pi-trn': 'Пали + Рус', 'trn': 'Перевод', 'trn-pi': 'Рус + Пали' };
                const modeLabelsEn = { 'pi': 'Pāḷi', 'pi-trn': 'Pāḷi + Trn', 'trn': 'Translation', 'trn-pi': 'Trn + Pāḷi' };
                const msg = window.isRu ? ('Режим: ' + modeLabelsRu[newMode]) : ('Mode: ' + modeLabelsEn[newMode]);
                showBubbleNotification(msg);
            }
        }
        return;
    }

    // 3. Горячие клавиши: -, + (Скорость) и R (сброс к умолчанию) + Numpad — для языка, который звучит сейчас
    if (['Minus', 'Equal', 'KeyR', 'NumpadSubtract', 'NumpadAdd'].includes(e.code)) {
        e.preventDefault();
        const kind = activeRateKind();
        ensureRatePop();  // the slider lives in the speed window, which may not have been opened yet
        markActiveRate(kind === 'pali');
        const slider = document.getElementById('tts-rate-slider');
        if (slider) {
            const r = RATE_RANGE[kind];
            const cur = parseFloat(slider.value);
            // keys move in bigger steps than the slider (owner: 0.05, it was 0.1); R = the default speed
            const KEY_RATE_STEP = 0.05;
            const next = e.code === 'KeyR' ? r.def : cur + (e.code === 'Minus' || e.code === 'NumpadSubtract' ? -KEY_RATE_STEP : KEY_RATE_STEP);
            setSliderRate(next);
            if (parseFloat(slider.value) !== cur && typeof showBubbleNotification === 'function') {
                showBubbleNotification((window.isRu ? 'Скорость: ' : 'Speed: ') + formatRate(parseFloat(slider.value)));
            }
        }
        return;
    }

    // 4. Стандартное управление плеером
    // A key shows the same press as the mouse (.key mirrors :active in voice.css); held keys keep it on
    const pressKey = (b) => {
        b.classList.add('key');
        clearTimeout(b._keyTimer);
        b._keyTimer = setTimeout(() => b.classList.remove('key'), 140);
    };
    if (!ttsState.autoScroll) return;

    switch(e.code) {
        case 'Space':
            e.preventDefault();
            const playBtn = document.querySelector('.play-main-button');
            if (playBtn) { pressKey(playBtn); playBtn.click(); }
            break;

        case 'ArrowLeft':
        case 'ArrowUp':
            e.preventDefault();
            const prevBtn = document.querySelector('.prev-main-button');
            if (prevBtn) { pressKey(prevBtn); prevBtn.click(); }
            break;

        case 'ArrowRight':
        case 'ArrowDown':
            e.preventDefault();
            const nextBtn = document.querySelector('.next-main-button');
            if (nextBtn) { pressKey(nextBtn); nextBtn.click(); }
            break;
    }
});


// --- Закрытие настроек плеера при клике в пустое место ---
document.addEventListener('click', (e) => {
    if (!e.target.isConnected) return;  // re-rendered away by its own handler (voice picker), not outside
    // 1. Settings / voice settings: a click outside the player and its windows folds them
    const open = ['tts-settings-panel', 'tts-advanced-settings'].some(id => document.getElementById(id)?.classList.contains('visible'));
    if (open && !e.target.closest('.voice-player, .tts-win')) {
        ttsMorph(() => showTtsPanel(null));
    }

    // 2. Настройки A-B цикла (Memo)
    const abPanel = document.getElementById('memorize-panel');
    
    if (abPanel && abPanel.classList.contains('visible')) {
        if (!e.target.closest('#memorize-panel') && !e.target.closest('#ab-loop-toggle-btn')) {
            
            ttsMorph(() => showTtsPanel(null));
            
            // Сбрасываем визуальный статус кнопок выбора (если был активен pickMode)
            const pickingBtns = abPanel.querySelectorAll('.mem-pick-btn.picking');
            pickingBtns.forEach(btn => btn.classList.remove('picking'));
        }
    }
});
