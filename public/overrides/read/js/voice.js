// --- КОНФИГУРАЦИЯ "БЕСПЛАТНОГО ПРОБНОГО ПЕРИОДА" ---
window.TRIAL_KEY = ""; 
const TRIAL_BLOCK_KEY = 'tts_block_trial_key'; 

// --- Утилиты ---

window.isRu = window.location.pathname.includes('/r/') || 
                     window.location.pathname.includes('/ru/') || 
                     window.location.pathname.includes('/ml/') || 
                     window.location.pathname.includes('/mt/');
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
const makeJsonUrl = (slug) => {
  const basePath = '/assets/texts/devanagari/root/pli/ms/';
  const suffix = '_rootd-pli-ms.json';
  const fullPath = `${basePath}${slug}${suffix}`;
  return fullPath;
};

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

  // Режим заучивания /d/ или /memorize/ (Индийский контекст для обоих слотов) — реальная
  // отдельная фича по URL, не связана с языком перевода, оставляем как есть.
  if (path.includes('/d/') || path.includes('/memorize/')) {
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

const RATES_PALI = [0.25, 0.5, 0.6, 0.8, 1.0, 1.25, 1.5];
const RATES_TRN = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5];

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

function updateRateOptions(isPali, activeRate) {
  const rateSelect = document.getElementById('tts-rate-select');
  if (!rateSelect) return;

  const ratesToUse = isPali ? RATES_PALI : RATES_TRN;
  
  let displayRates = [...ratesToUse];
  if (!displayRates.includes(activeRate)) {
    displayRates.push(activeRate);
    displayRates.sort((a, b) => a - b);
  }

  const optionsHtml = displayRates.map(r => 
    `<option value="${r}" ${r === activeRate ? 'selected' : ''}>${r}x</option>`
  ).join('');

  if (rateSelect.innerHTML !== optionsHtml) {
    rateSelect.innerHTML = optionsHtml;
  }
  
  rateSelect.value = activeRate;
}

function getRateForLang(lang) {
  if (lang === 'pi-dev') {
    return parseFloat(localStorage.getItem(RATE_PALI_KEY)) || 1.0; 
  } else {
    return parseFloat(localStorage.getItem(RATE_TRN_KEY)) || 1.0; 
  }
}

let isWakeLockActive = false; // Добавляем флаг состояния

async function requestWakeLock() {
  if ('wakeLock' in navigator && !isWakeLockActive) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      isWakeLockActive = true;
      
      wakeLock.addEventListener('release', () => {
        isWakeLockActive = false;
        console.log('Wake Lock released by system');
      });
      
      console.log('Wake Lock acquired successfully');
    } catch (err) {
      console.warn(`Wake Lock error: ${err.name}, ${err.message}`);
      isWakeLockActive = false;
    }
  }
}


async function releaseWakeLock() {
  if (wakeLock !== null) {
    await wakeLock.release();
    wakeLock = null;
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


function setButtonIcon(type) {
  const allImgs = document.querySelectorAll('.play-main-button img');
  allImgs.forEach(img => {
    img.src = (type === 'pause') ? '/assets/svg/pause-grey.svg' : '/assets/svg/play-grey.svg';
  });
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
    return response.ok ? await response.json() : null;
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
function getSuttaContainer() {
    const c = document.querySelector('.sutta-container, .sutta');
    if (c && c.querySelector('[lang], .pli-lang')) return c;
    return document;
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

    const isPremium = (name) => {
        return name.includes('Wavenet') || name.includes('Neural2') || name.includes('Chirp') || name.includes('Polyglot');
    };

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
                activeVoiceName = currentVoices[0].name;
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

    const allSelects = document.querySelectorAll('.google-voice-select-group select');
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
        // Если это /d/ или /memorize/ -> предлагаем Индийские языки
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
    const finalDefaultConfig = bestDefaultVoice ? { languageCode: bestDefaultVoice.languageCodes[0], name: bestDefaultVoice.name } : context.defaultConfig;

    // Важно: передаем context.storageKey
    setupVoiceSelectors(trnVoices, 'google-lang-select-trn', 'google-voice-select-trn', context.storageKey, finalDefaultConfig);
    
}


// --- ПОЛУЧЕНИЕ АУДИО (УЧИТЫВАЕТ КОНТЕКСТ) ---
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
          text = text.replace(/ं(?=\s|[।,:;.?!\"]|$)/g, 'ङ्');
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
  const jsonKeys = []; 

  if (paliJsonData) {
    Object.keys(paliJsonData).forEach(key => {
      const cleanKey = useFullKey ? key : key.split(':').pop();
      const rawText = paliJsonData[key].replace(/<[^>]*>/g, '').trim(); 
      cleanJsonMap[cleanKey] = cleanTextForTTS(rawText);
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
    let translation1 = '';
    let translation2 = '';
    
    if (cleanJsonMap[id]) {
      paliDev = cleanJsonMap[id];
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
          }
          lookAheadIndex++;
        }
      }
    } else if (paliElement) {
      let rawDomText = paliElement.textContent.replace(/<[^>]*>/g, '').trim();
      let cleanedText = cleanTextForTTS(rawDomText);
      if (window.convertPaliToDevanagari) {
          paliDev = window.convertPaliToDevanagari(cleanedText);
      } else {
          paliDev = cleanedText;
      }
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
              text: item.paliDev, lang: lang, element: item.paliElement, id: item.id
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
async function playCurrentSegment() {
 
 if (window.ttsDelayTimeout) clearTimeout(window.ttsDelayTimeout);
 
  if (ttsState.googleAudio) {
      ttsState.googleAudio.pause();       
      ttsState.googleAudio.onended = null; 
      ttsState.googleAudio = null;         
  }
  window.speechSynthesis.cancel();         
  
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
    const savedPaliRate = localStorage.getItem(RATE_PALI_KEY);
    uiRate = savedPaliRate !== null ? parseFloat(savedPaliRate) : 0.8;
    
    audioRateBrowser = uiRate * PALI_RATIO; 
    audioRateGoogle  = uiRate;              
  }

  const rateSelect = document.getElementById('tts-rate-select');
  if (rateSelect) {
      updateRateOptions(isPali, uiRate);
      if (isPali) {
          rateSelect.style.borderStyle = '';
          rateSelect.title = "Скорость Пали (нормализована: 1.0 = медленно)";
      } else {
          rateSelect.style.borderStyle = 'dashed';
          rateSelect.title = "Скорость Перевода";
      }
  }

  const googleKey = (localStorage.getItem(GOOGLE_KEY_STORAGE) || window.TRIAL_KEY); 
  const useNativePali = localStorage.getItem(NATIVE_PALI_KEY) === 'true';
  const useNativeTrn  = localStorage.getItem(NATIVE_TRN_KEY) === 'true'; 
  
  let tryGoogle = false;

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

  if (tryGoogle) {
      try {
          const targetIndex = ttsState.currentIndex; 

          const audioContent = await fetchGoogleAudio(item.text, targetLang, audioRateGoogle, googleKey);
          
          if (targetIndex !== ttsState.currentIndex || !ttsState.speaking) {
              return; 
          }

          if (audioContent) {
              const audio = window.sharedGoogleAudio || new Audio();
              window.sharedGoogleAudio = audio;
              audio.src = "data:audio/mp3;base64," + audioContent;
              
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

            const helpUrl = window.isRu ? '/ru/docs/tts' : '/docs/voice-tts';
            const title = window.isRu ? 'TTS:' : 'TTS Hint:';
            const helpLink = `<a href="${helpUrl}" target="_blank" style="color: #4da6ff;">(?)</a>`;
            const message = window.isRu 
              ? `Не найдено модулей близких к Пали. Установлен Английский. См. помощь ${helpLink}.`
              : `No Pāḷi-friendly voices found. Using English. See help ${helpLink}.`;
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
          const mainPlayBtn = document.querySelector('a.voice-link[data-slug]');
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
    const panel = document.getElementById('tts-settings-panel');
    const icon = document.getElementById('tts-settings-icon');
    const abPanel = document.getElementById('memorize-panel');
    
    let wasAbPanelOpen = false;
    if (abPanel && abPanel.classList.contains('visible')) {
        wasAbPanelOpen = true;
        abPanel.classList.remove('visible'); 
    }

    if (panel) {
        panel.classList.toggle('visible');
        if (panel.classList.contains('visible')) {
            if (icon) icon.style.transform = 'rotate(90deg)';
        } else {
            if (icon) icon.style.transform = 'rotate(0deg)';
            
            const advSettings = document.getElementById('tts-advanced-settings');
            if (advSettings) advSettings.classList.remove('visible');
            
            const basicPanel = document.getElementById('tts-basic-settings');
            if (basicPanel) {
                basicPanel.style.maxHeight = '200px';
                basicPanel.style.opacity = '1';
            }
            
            const delayLabel = document.querySelector('.tts-delay-label')?.parentElement;
            if (delayLabel) {
                delayLabel.style.display = 'flex';
            }
        }
    }
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
  if (window.TRIAL_KEY && !localStorage.getItem(GOOGLE_KEY_STORAGE)) {
      if (!localStorage.getItem('tts_trial_play_hint_shown')) {
          
          const title = window.isRu ? "Демо-режим:" : "Demo Mode:";
          
          // Ссылки на поиск Google
          const searchUrlRu = "https://www.google.com/search?q=%D0%BA%D0%B0%D0%BA+%D0%BF%D0%BE%D0%BB%D1%83%D1%87%D0%B8%D1%82%D1%8C+%D0%B0%D0%BF%D0%B8+%D0%BA%D0%BB%D1%8E%D1%87+%D0%B3%D1%83%D0%B3%D0%BB+tts";
          const searchUrlEn = "https://www.google.com/search?q=how+to+get+google+cloud+text+to+speech+api+key";
          
          // Стиль для ссылки (светло-голубой, чтобы видно на темном)
          const linkStyle = "color: #4da6ff; text-decoration: underline; font-weight: bold;";

          const message = window.isRu 
              ? `Включены <b>голоса от Google</b>. Если понравится, вы можете <a href="${searchUrlRu}" target="_blank" style="${linkStyle}">получить свой ключ</a> бесплатно.` 
              : `<b>Google voices</b> active. If you like it, you can <a href="${searchUrlEn}" target="_blank" style="${linkStyle}">get your own key</a> for free.`;

          if (typeof showVoiceHint === 'function') {
              showVoiceHint(title, message, 'tts_trial_play_hint_shown');
          }
      }
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
      maxWidth: '600px', minWidth: '200px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)'
  });

  document.body.appendChild(notification);

  if (!document.getElementById('voice-hint-styles')) {
      const style = document.createElement('style');
      style.id = 'voice-hint-styles';
      style.textContent = `
          @keyframes fadeInUp { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
          @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
          #closeVoiceHintBtn:hover { color: #ccc; }
      `;
      document.head.appendChild(style);
  }

  const closeBtn = notification.querySelector('#closeVoiceHintBtn');
  closeBtn.addEventListener('click', function() {
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
  let initialRate;
  let currentRatesList; 
  
  if (savedMode === 'pi') {
      initialRate = parseFloat(localStorage.getItem(RATE_PALI_KEY)) || 1.0;
      currentRatesList = RATES_PALI; 
  } else {
      initialRate = parseFloat(localStorage.getItem(RATE_TRN_KEY)) || 1.0;
      currentRatesList = RATES_TRN;  
  }

  if (!currentRatesList.includes(initialRate)) {
      currentRatesList = [...currentRatesList, initialRate].sort((a,b) => a - b);
  }


  // Points at the new Docs/Help portal now (RU slug renamed to /tts, EN frozen at old
  // /voice-tts — see TODO.md), not the legacy static ttsHelp.html page.
  const helpUrl = window.isRu ? '/ru/docs/tts' : '/docs/voice-tts';

  const modeLabels = window.isRu
    ? { 'pi': 'Пали', 'pi-trn': 'Пали + Рус', 'trn': 'Перевод', 'trn-pi': 'Рус + Пали' }
    : { 'pi': 'Pāḷi', 'pi-trn': 'Pāḷi + Trn', 'trn': 'Trn', 'trn-pi': 'Trn + Pāḷi' };

  // Объект с переводами интерфейса
  const t = {
    settings: window.isRu ? "Настройки" : "Settings",
    scroll: window.isRu ? "Скролл" : "Scroll",
    autoplay: window.isRu ? "Автостарт" : "Autoplay",
    delay: window.isRu ? "Задержка" : "Delay",
    sec: window.isRu ? "сек" : "sec",
    paliVoice: window.isRu ? "Голос Пали:" : "Pāḷi Voice:",
    trnVoice: window.isRu ? "Голос Перевода:" : "Trn Voice:",
    native: window.isRu ? "Нативный" : "Native",
    speedPali: window.isRu ? "Скорость (Пали)" : "Speed (Pali)",
    speedTrn: window.isRu ? "Скорость (Перевод)" : "Speed (Translation)",
    delayTitle: window.isRu ? "Пауза между фразами (секунды)" : "Pause between phrases (seconds)",
    apiKeyTitle: window.isRu ? "Введите API-ключ Google Cloud TTS" : "Enter Google Cloud TTS API Key for premium voices",
    refreshVoices: window.isRu ? "Обновить список" : "Refresh Voice List",
    resetTts: window.isRu ? "Полный сброс (очистить данные)" : "Full Reset (Clear Data)",
    help: window.isRu ? "Помощь" : "Help"
  };

  return `
    <div class="tts-container-inner">
       <div class="tts-main-row">
        <a href="javascript:void(0)" id="tts-settings-toggle" class="tts-top-btn tts-settings-btn" title="${t.settings}">
            <svg id="tts-settings-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
            </svg>
        </a>

        <div class="tts-controls-row">
            <a href="javascript:void(0)" title="← ↑" class="prev-main-button tts-icon-btn">
                <img src="/assets/svg/backward-step.svg" class="tts-icon backward" width="20">
            </a>
            <a href="javascript:void(0)" title="Space" class="play-main-button tts-icon-btn large">
                <img src="/assets/svg/play-grey.svg" class="tts-icon play" width="34">
            </a>
            <a href="javascript:void(0)" title="→ ↓" class="next-main-button tts-icon-btn">
                <img src="/assets/svg/forward-step.svg" class="tts-icon forward" width="20">
            </a>
        </div>

        <a href="javascript:void(0)" title="Esc" class="tts-top-btn close-tts-btn">&times;</a>
    </div>
    
    <div id="tts-settings-panel">
          <div id="tts-basic-settings">
              <select title="Num Key (1-4)" id="tts-mode-select" class="tts-mode-select">
                ${Object.entries(modeLabels).map(([val, label]) =>
                  `<option value="${val}" ${savedMode === val ? 'selected' : ''}>${label}</option>`
                ).join('')}
              </select>

              <select id="tts-rate-select" class="tts-rate-select" title="${savedMode === 'pi' ? t.speedPali : t.speedTrn}">
                ${currentRatesList.map(r =>
                  `<option value="${r}" ${initialRate == r ? 'selected' : ''}>${r}x</option>`
                ).join('')}
              </select>
              
              <br>

              <div class="tts-toggles-row">
                <label class="tts-checkbox-custom">
                  <input title="on/off (S)" type="checkbox" id="tts-scroll-toggle" ${ttsState.autoScroll ? 'checked' : ''}>
                  ${t.scroll}
                </label>
                <label class="tts-checkbox-custom">
                  <input type="checkbox" id="tts-autoplay-toggle" ${localStorage.getItem('ttsMode') === 'true' ? 'checked' : ''}>
                  ${t.autoplay}
                </label>
              </div>
          </div>

          <div class="tts-delay-row">
              <label class="tts-delay-label" title="${t.delayTitle}">
                  <img src="/assets/svg/hourglass-regular-full.svg" width="14" height="14" alt="timer">
                  ${t.delay}
                  <span id="tts-segment-delay-input" class="tts-editable-span" contenteditable="true" inputmode="decimal" spellcheck="false">${localStorage.getItem('dg_tts_segment_delay') || 0}</span>
                  ${t.sec}
              </label>
          </div>

          <div class="tts-links-row">
            <button id="tts-advanced-toggle-btn" class="extra-settings-toggle advanced-btn">
                🔧 Google Voice
            </button>
            
            <a href="/tts.php${window.location.search}" class="tts-link tts-text-link">TTS</a>
            <a class="tts-link" title='sc-voice.net' href='https://www.sc-voice.net/?src=sc#/sutta/$fromjs'>VSC</a>
            
            <span id="audio-file-link-placeholder"></span>
            
            <a href="${helpUrl}" target="_blank" class="tts-link tts-help-link" title="${t.help}">?</a>
          </div>

          <div id="tts-advanced-settings">
              <div class="api-key-row">
                <input type="password" id="google-api-key-input" 
                       value="${savedKey}" 
                       placeholder="Google API Key" 
                       title="${t.apiKeyTitle}">
                <button id="refresh-voices-btn" class="refresh-api-btn" title="${t.refreshVoices}">
                    <img src="/assets/svg/rotate-right-solid-full.svg" width="16" height="16" alt="Refresh">     
                </button>
                <button id="reset-tts-btn" class="reset-tts-btn" title="${t.resetTts}">
                    <img src="/assets/svg/trash-can-regular-full.svg" width="16" height="16" alt="Reset">
                </button>
              </div>

              <div id="google-voice-settings-container">
                  <div class="google-voice-select-group">
                       <div class="google-voice-label">${t.paliVoice} 
                           <label class="tts-checkbox-custom tts-native-label">
                              <input type="checkbox" id="native-pali-toggle" ${isNativePali ? 'checked' : ''}>
                              ${t.native}
                           </label>
                       </div>
                      <div id="pali-google-dropdowns">
                           <select id="google-lang-select-pali" class="google-voice-dropdown"></select>
                           <select id="google-voice-select-pali" class="google-voice-dropdown"></select>
                      </div>
                  </div>

                  <div class="google-voice-select-group">
                      <div class="google-voice-label">${t.trnVoice}
                          <label class="tts-checkbox-custom tts-native-label">
                              <input type="checkbox" id="native-trn-toggle" ${isNativeTrn ? 'checked' : ''}>
                              ${t.native}
                          </label>
                      </div>
                      <div id="trn-google-dropdowns">
                          <select id="google-lang-select-trn" class="google-voice-dropdown"></select>
                          <select id="google-voice-select-trn" class="google-voice-dropdown"></select>
                      </div>
                  </div>
              </div>
          </div>
      </div>
    </div>
    `;
}


function getOrBuildPlayer() {
    const playerId = 'voice-player-container';
    let playerContainer = document.getElementById(playerId);

    if (!document.getElementById('voice-css-lazy')) {
        document.head.insertAdjacentHTML('beforeend', '<link id="voice-css-lazy" rel="stylesheet" href="/read/css/voice.css">');
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
  if (e.target.id === 'tts-advanced-toggle-btn') {
      e.preventDefault();
      const advancedPanel = document.getElementById('tts-advanced-settings');
      const basicPanel = document.getElementById('tts-basic-settings'); 
      
      // Находим контейнер задержки (он идет сразу после basicPanel в HTML)
      const delayLabel = document.querySelector('.tts-delay-label')?.parentElement;

      if (advancedPanel) {
          const isOpening = !advancedPanel.classList.contains('visible');
          advancedPanel.classList.toggle('visible');
          
          if (isOpening) {
              // Скрываем основные настройки
              if (basicPanel) {
                  basicPanel.style.maxHeight = '0px';
                  basicPanel.style.opacity = '0';
              }
              // Скрываем блок Delay
              if (delayLabel) {
                  delayLabel.style.display = 'none';
              }
          } else {
              // Возвращаем основные настройки
              if (basicPanel) {
                  basicPanel.style.maxHeight = '200px';
                  basicPanel.style.opacity = '1';
              }
              // Возвращаем блок Delay
              if (delayLabel) {
                  delayLabel.style.display = 'flex';
              }
          }
      }
      return;
  }
  
  // 0. RESET BUTTON (Сброс всего)
  if (e.target.id === 'reset-tts-btn') {
      e.preventDefault();

      const resetMessage = window.isRu
        ? 'Сбросить настройки голоса: отключить Google TTS, удалить API-ключ и включить системные голоса?'
        : 'Reset voice settings: disable Google TTS, remove the API key, and use system voices?';
        
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

          // 2. ВАЖНО: Ставим блокировку, чтобы триал не вернулся при перезагрузке
          localStorage.setItem(TRIAL_BLOCK_KEY, 'true'); 
          
          window.location.reload();
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
  
  // 4. Rate
  if (e.target.id === 'tts-rate-select') {
    const newRate = parseFloat(e.target.value);
    
    let targetKey = RATE_TRN_KEY; 
    if (ttsState.speaking && !ttsState.paused && ttsState.playlist[ttsState.currentIndex]) {
        const currentItem = ttsState.playlist[ttsState.currentIndex];
        if (currentItem.lang === 'pi-dev') {
            targetKey = RATE_PALI_KEY;
        }
    } else {
        const currentMode = localStorage.getItem(MODE_STORAGE_KEY);
        if (currentMode === 'pi') {
            targetKey = RATE_PALI_KEY;
        }
    }

    localStorage.setItem(targetKey, newRate);
    
    if (ttsState.speaking && !ttsState.paused) {
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
  
    // 6. Autoplay (связка с ttsMode)
  if (e.target.id === 'tts-autoplay-toggle') {
     const isChecked = e.target.checked;

     
     if (isChecked) {
         localStorage.setItem('ttsMode', 'true');
     } else {
         localStorage.removeItem('ttsMode');
     }
     return;
  }
}


document.addEventListener('change', handleTTSSettingChange);
document.addEventListener('click', (e) => {
    // Добавили проверку e.target.id === 'tts-advanced-toggle-btn'
    if (e.target.id === 'refresh-voices-btn' || 
        e.target.id === 'reset-tts-btn' || 
        e.target.id === 'tts-advanced-toggle-btn') {
        handleTTSSettingChange(e);
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
async function refreshVoiceDropdowns(forceRefresh = false) {
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
            const allSelects = document.querySelectorAll('.google-voice-select-group select');
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


    if (paliLangSelect && paliVoiceSelect) {
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
    
    if (trnLangSelect && trnVoiceSelect) {
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
                                    trnVoices.find(v => v.languageCodes[0].replace('_', '-').toLowerCase() === 'pa-in') ||
                                    trnVoices[0];
            } else {
                const pageLang = detectTranslationLang(); 
                const preferredName = (pageLang === 'ru') ? 'ru-RU-Standard-D' : 
                                      (pageLang === 'th') ? 'th-TH-Standard-A' : 'en-US-Standard-D';
                
                bestDefaultVoice = trnVoices.find(v => v.name === preferredName) || 
                                   trnVoices.find(v => v.name.includes('Standard') && v.languageCodes[0].replace('_', '-').toLowerCase().startsWith(pageLang)) ||
                                   context.defaultConfig;
            }
            const finalDefaultConfig = bestDefaultVoice ? { languageCode: bestDefaultVoice.languageCodes[0], name: bestDefaultVoice.name } : context.defaultConfig;
            
            setupVoiceSelectors(trnVoices, 'google-lang-select-trn', 'google-voice-select-trn', context.storageKey, finalDefaultConfig);
        }
    }
}



window.speechSynthesis.onvoiceschanged = () => {
    synth.getVoices();
    // Если панель настроек голоса уже в DOM, обновляем ее, чтобы появились нативные голоса
    if (document.getElementById('google-voice-settings-container')) {
        refreshVoiceDropdowns();
    }
};

function initTTS() {
  // --- Та самая часть с контекстным меню ---
  document.addEventListener('contextmenu', function(e) {
    if (!e.target.closest('a.voice-link')) return;
    if (localStorage.getItem('ttsMode') === 'true') {
        e.preventDefault();
        e.stopImmediatePropagation();
        const currentSearch = window.location.search; 
        const ttsUrl = `${window.location.origin}/t2s.html${currentSearch}`;
        setTimeout(() => window.open(ttsUrl, '_blank'), 500);
    }
  }, { passive: false });

  synth.getVoices();
  
  // --- AUTOPLAY LOGIC ---
  const urlParams = new URLSearchParams(window.location.search);
  
  if (urlParams.has('autoplay') || localStorage.getItem('ttsMode') === 'true') {
      setTimeout(() => {
          let slug = null;
          
          // 1. Ищем ID сутты
          const voiceLink = document.querySelector('.voice-link[data-slug]');
          if (voiceLink) {
              slug = voiceLink.dataset.slug;
          } else if (typeof isLegacyPage === 'function' && isLegacyPage()) {
              slug = window.location.pathname.split('/').pop() || 'legacy_page';
          }

          if (slug) {
              console.log("🚀 Autoplay: Starting logic for", slug);
              
              const player = getOrBuildPlayer();
              player.classList.add('active'); 
              const internalPlayBtn = player.querySelector('.play-main-button');
              if (internalPlayBtn) internalPlayBtn.dataset.slug = slug;

              // 2. ОПРЕДЕЛЕНИЕ РЕЖИМА
              let mode = urlParams.get('mode');
              const validModes = ['pi', 'trn', 'pi-trn', 'trn-pi'];

              if (!mode || !validModes.includes(mode)) {
                  mode = localStorage.getItem(MODE_STORAGE_KEY) || 'trn';
              } else {
                  const modeSelect = document.getElementById('tts-mode-select');
                  if (modeSelect) modeSelect.value = mode;
                  localStorage.setItem(MODE_STORAGE_KEY, mode);
              }

              // 3. ЗАПУСК
              startPlayback(document, mode, slug, 0);

              // 4. СТРАХОВКА ОТ БЛОКИРОВКИ
              const forceUnlock = (e) => {
                  const isPlayerClick = e && e.target && e.target.closest('.voice-player');
                  
                  if (ttsState.speaking && ttsState.paused && !isPlayerClick) {
                      console.log("🔓 Audio Unlocked by Background Action!");
                      ttsState.paused = false;
                      setButtonIcon('pause');
                      toggleSilence(true); 

                      if (ttsState.googleAudio) {
                          ttsState.googleAudio.play().catch(err => console.warn(err));
                      } else {
                          playCurrentSegment();
                      }
                  }

                  ['click', 'touchstart', 'scroll', 'keydown'].forEach(evt => 
                      document.removeEventListener(evt, forceUnlock)
                  );
              };

              // Восстановил твои обработчики в исходном виде
              ['click', 'touchstart', 'scroll', 'keydown'].forEach(evt => 
                  document.addEventListener(evt, forceUnlock, { passive: true })
              );

              ['click', 'touchstart', 'scroll', 'keydown'].forEach(evt => 
                  document.addEventListener(evt, forceUnlock, { once: true, passive: true })
              );
          }
      }, 1000); 
  }
}

// Запускаем немедленно, если DOM уже готов (при ленивой загрузке), 
// или ждем готовности, если грузится стандартно
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTTS);
} else {
    initTTS();
}



document.addEventListener('visibilitychange', async () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    requestWakeLock();
  }
});

// --- АДАПТЕР ДЛЯ THERAVADA.RU (LEGACY HTML) ---

function isLegacyPage() {
    // Если есть блок с классом "a" ИЛИ специфичная для старого дизайна ячейка таблицы
    return document.querySelectorAll('.a').length > 0 || document.querySelector('td[style*="justify"]') !== null;
}

function prepareLegacyData() {
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


function prepareGeneralArticleData() {
    const textData = [];
    let segmentCounter = 0;

    // Ищем все потенциально текстовые элементы на странице
    const elements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote');

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

    // 3. Горячие клавиши: -, + (Скорость) и R (Сброс скорости) + Numpad
    if (['Minus', 'Equal', 'KeyR', 'NumpadSubtract', 'NumpadAdd'].includes(e.code)) {
        e.preventDefault();
        const rateSelect = document.getElementById('tts-rate-select');
        if (rateSelect) {
            const options = Array.from(rateSelect.options).map(o => parseFloat(o.value));
            const currentIndex = options.indexOf(parseFloat(rateSelect.value));
            
            let nextIndex = currentIndex;
            
            if (e.code === 'Minus' || e.code === 'NumpadSubtract') nextIndex = Math.max(0, currentIndex - 1);
            else if (e.code === 'Equal' || e.code === 'NumpadAdd') nextIndex = Math.min(options.length - 1, currentIndex + 1);
            else if (e.code === 'KeyR') {
                // Ищем индекс для 1.0, если его нет — берем средний или первый
                const defaultIdx = options.indexOf(1.0);
                nextIndex = defaultIdx !== -1 ? defaultIdx : 0;
            }
            
            if (nextIndex !== currentIndex) {
                rateSelect.value = options[nextIndex];
                rateSelect.dispatchEvent(new Event('change', { bubbles: true }));
                
                if (typeof showBubbleNotification === 'function') {
                    showBubbleNotification((window.isRu ? 'Скорость: ' : 'Speed: ') + rateSelect.value + 'x');
                }
            }
        }
        return;
    }

    // 4. Стандартное управление плеером
    if (!ttsState.autoScroll) return;

    switch(e.code) {
        case 'Space':
            e.preventDefault();
            const playBtn = document.querySelector('.play-main-button');
            if (playBtn) playBtn.click();
            break;

        case 'ArrowLeft':
        case 'ArrowUp':
            e.preventDefault();
            const prevBtn = document.querySelector('.prev-main-button');
            if (prevBtn) prevBtn.click();
            break;

        case 'ArrowRight':
        case 'ArrowDown':
            e.preventDefault();
            const nextBtn = document.querySelector('.next-main-button');
            if (nextBtn) nextBtn.click();
            break;
    }
});


// --- Закрытие настроек плеера при клике в пустое место ---
document.addEventListener('click', (e) => {
    // 1. Настройки основного плеера
    const panel = document.getElementById('tts-settings-panel');
    
    if (panel && panel.classList.contains('visible')) {
        if (!e.target.closest('#tts-settings-panel') && !e.target.closest('#tts-settings-toggle')) {
            
            panel.classList.remove('visible');
            
            const icon = document.getElementById('tts-settings-icon');
            if (icon) icon.style.transform = 'rotate(0deg)';
            
            const advSettings = document.getElementById('tts-advanced-settings');
            if (advSettings) advSettings.classList.remove('visible');
            
            const basicPanel = document.getElementById('tts-basic-settings');
            if (basicPanel) {
                basicPanel.style.maxHeight = '200px';
                basicPanel.style.opacity = '1';
            }
            
            const delayLabel = document.querySelector('.tts-delay-label')?.parentElement;
            if (delayLabel) {
                delayLabel.style.display = 'flex';
            }
        }
    } 

    // 2. Настройки A-B цикла (Memo)
    const abPanel = document.getElementById('memorize-panel');
    
    if (abPanel && abPanel.classList.contains('visible')) {
        if (!e.target.closest('#memorize-panel') && !e.target.closest('#ab-loop-toggle-btn')) {
            
            abPanel.classList.remove('visible');
            
            // Сбрасываем визуальный статус кнопок выбора (если был активен pickMode)
            const pickingBtns = abPanel.querySelectorAll('.mem-pick-btn.picking');
            pickingBtns.forEach(btn => btn.classList.remove('picking'));
        }
    }
});
