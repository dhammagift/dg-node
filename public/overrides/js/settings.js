


window.notEn= /^\/(ru|r|ml|mt)(\/|$)/.test(window.location.pathname)
    || (localStorage.getItem('siteLanguage') || 'en') !== 'en';

// Портировано из легаси settings.js — openBw.js (загружается через junction на легаси-репо) ожидает
// эту функцию глобально, а этот override её не содержал (скопирован раньше, чем она появилась в легаси).
function checkForceLocalFlag() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('force_local')) {
        localStorage.setItem('forceLocal', 'true');
    } else if (urlParams.has('clear_local')) {
        localStorage.removeItem('forceLocal');
    }
}
checkForceLocalFlag();

window.isRu = window.notEn;


    // Проверяем, ГДЕ мы находимся. 
    // Запускаем логику редиректа ТОЛЬКО если мы НЕ на локальном сервере.
    if (window.location.hostname !== '127.0.0.1' && window.location.hostname !== 'localhost') {
        
        function tryLocalServer() {
            fetch('http://127.0.0.1:8080/', { mode: 'no-cors', cache: 'no-store' })
                .then(() => {
                    // Сервер ответил! Делаем редирект с сохранением пути, параметров и якоря.
                    const currentPath = window.location.pathname + window.location.search + window.location.hash;
                    window.location.replace('http://127.0.0.1:8080' + currentPath);
                })
                .catch(() => {
                    // Сервера нет. Остаемся в PWA.
                    console.log('Локальный сервер не запущен. Остаемся на закэшированной PWA версии.');
                });
        }

        window.addEventListener('load', () => {
            if (!navigator.onLine) {
                tryLocalServer();
            }
        });

        window.addEventListener('offline', () => {
            tryLocalServer();
        });
    }

// === ЗАГРУЗКА СЛОВАРЯ (УМНАЯ ФОНОВАЯ ИЛИ ПО КЛИКУ) ===
(function() {
    window.isDictScriptLoaded = false;
    let dictScriptPromise = null;

    // Функция управления твоим родным лоадером
    window.dg_toggleNativeLoader = function(show, customText = null) {
        let loadingEl = document.getElementById('main-dict-loader');
        
        if (show) {
            if (!loadingEl) {
                loadingEl = document.createElement('div');
                loadingEl.id = 'main-dict-loader';
                loadingEl.className = 'dict-loading-indicator';
                document.body.appendChild(loadingEl);
            }
            
            loadingEl.textContent = customText || (window.notEn ? 'Словарь загружается...' : 'Dictionary is loading...');
            
            setTimeout(() => loadingEl.classList.add('show'), 10);
        } else {
            if (loadingEl) {
                loadingEl.classList.remove('show');
                setTimeout(() => loadingEl.remove(), 300);
            }
        }
    };

    window.dg_loadDictionaryScripts = function() {
        if (window.isDictScriptLoaded) return Promise.resolve(false);
        if (dictScriptPromise) return dictScriptPromise;

        dictScriptPromise = new Promise((resolve, reject) => {
            let slowLoadTriggered = false;
            
            // Заводим таймер. Если грузится долго — показываем лоадер и запоминаем это
            const slowLoadTimer = setTimeout(() => {
                slowLoadTriggered = true;
                window.dg_toggleNativeLoader(true);
            }, 150);

            const script = document.createElement('script');
            script.src = "/assets/js/paliLookup.js";
            
            script.onload = () => {
                clearTimeout(slowLoadTimer); 
                window.isDictScriptLoaded = true;
                localStorage.setItem('dg_dict_cached', 'true'); 
                // Возвращаем статус: была ли медленная загрузка
                resolve(slowLoadTriggered);
            };
            
            script.onerror = (e) => {
                clearTimeout(slowLoadTimer);
                dictScriptPromise = null;
                window.dg_toggleNativeLoader(false);
                reject(e);
            };
            
            document.head.appendChild(script);
        });

        return dictScriptPromise;
    };

    const clickHandler = function(e) {
        if (typeof dictionaryVisible !== 'undefined' && !dictionaryVisible) return;

        const isPaliWord = e.target.closest('.pli-lang, [lang="pi"]');
        const isDictBtn = e.target.closest('.toggle-dict-btn');
        const isMultiSelectBtn = e.target.closest('#toggle-multiselect');

        if (isPaliWord || isDictBtn || isMultiSelectBtn) {
            if (window.isDictScriptLoaded) return; 

            e.preventDefault();
            e.stopPropagation();

            const clickX = e.clientX;
            const clickY = e.clientY;
            const target = e.target;

            window.dg_loadDictionaryScripts().then(() => {
                // Если лоадер был показан (медленная сеть), убираем его перед показом перевода
                window.dg_toggleNativeLoader(false);

                const clickEvent = new MouseEvent('click', {
                    view: window, bubbles: true, cancelable: true, clientX: clickX, clientY: clickY
                });
                target.dispatchEvent(clickEvent);
            });
        }
    };

    document.addEventListener('click', clickHandler, true);
})();

// ==========================================
// ФОНОВАЯ АКТИВАЦИЯ С РОДНОЙ ПЛАШКОЙ (СО 2-ГО ВИЗИТА)
// ==========================================
window.addEventListener('suttaRenderedCentral', () => {
    if (localStorage.getItem('dg_dict_cached') !== 'true') return;

    const preloadDictionary = () => {
        if (typeof dictionaryVisible !== 'undefined' && !dictionaryVisible) return;

        window.dg_loadDictionaryScripts().then((scriptWasSlow) => {
            if (typeof lazyLoadStandaloneScripts === 'function') {
                
                // paliLookup.js уже загрузился и сам вычислил свой глобальный savedDict.
                // Полностью доверяем его логике определения языка базы:
                const isDictRu = typeof savedDict !== 'undefined' && savedDict.includes('ru');
                const lang = isDictRu ? 'ru' : 'en';

                // Для локализации самой плашки тоже берем готовую переменную из словаря, если она есть
                                lazyLoadStandaloneScripts(lang).then((dbWasSlow) => {
                    if (scriptWasSlow || dbWasSlow) {
                        window.dg_toggleNativeLoader(true, window.notEn ? 'Словарь загружен.' : 'Dictionary is loaded.');
                        
                        setTimeout(() => {
                            window.dg_toggleNativeLoader(false);
                        }, 1000);
                    }
                }).catch(e => {
                    console.error("Ошибка фоновой загрузки:", e);
                    window.dg_toggleNativeLoader(false);
                });
            } else {
                if (scriptWasSlow) window.dg_toggleNativeLoader(false);
            }
        });
    };

    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => preloadDictionary());
    } else {
        preloadDictionary();
    }
});


// === ЗАГРУЗКА TTS СТРОГО ПО КЛИКУ / ХОТКЕЮ / АВТОПЛЕЮ ===
(function() {
    window.isVoiceScriptLoaded = false;
    let isVoiceInitializing = false;

    window.loadVoiceScripts = function(callback) {
        // === ИСКЛЮЧЕНИЕ ДЛЯ СТРАНИЦ РЕЗУЛЬТАТОВ ПОИСКА ===
        const path = window.location.pathname;
        const isSearchResult = (path === '/' || path === '/ru/') && window.location.search.includes('q=');
        
        if (isSearchResult) {
            if (callback) callback();
            return;
        }
        // ==========================================

        if (window.isVoiceScriptLoaded) {
            if (callback) callback();
            return;
        }
        if (isVoiceInitializing) return;
        isVoiceInitializing = true;

        // 1. Показываем визуальный лоадер
        let loadingEl = document.getElementById('voice-loader');
        if (!loadingEl) {
            loadingEl = document.createElement('div');
            loadingEl.id = 'voice-loader';
            loadingEl.className = 'dict-loading-indicator';
            
            loadingEl.textContent = window.notEn ? 'Инициализация аудио...' : 'Initializing audio...';
            document.body.appendChild(loadingEl);
            setTimeout(() => loadingEl.classList.add('show'), 10);
        }

        // 2. Сначала грузим voice.js
        const scriptVoice = document.createElement('script');
        scriptVoice.src = "/read/js/voice.js";
        
        scriptVoice.onload = () => {
            // ---> ИСПРАВЛЕНИЕ: Блокируем загрузку A-B цикла для приложения Memo <---
            // У Memo своя логика задержек и интерфейса, voice-mem.js там вызывает конфликты
            const currentPath = window.location.pathname;

            if (currentPath.includes('/memo/') && !currentPath.includes('/memorize/')) {
                window.isVoiceScriptLoaded = true;
                isVoiceInitializing = false;
                
                if (loadingEl) {
                    loadingEl.classList.remove('show');
                    setTimeout(() => loadingEl.remove(), 300);
                }
                if (callback) callback();
                return; // Прерываем цепочку, не загружая voice-mem.js
            }

            // 3. Затем voice-mem.js (он зависит от window.ttsAPI из voice.js)
            const scriptMem = document.createElement('script');
            scriptMem.src = "/read/js/voice-mem.js";
            
            scriptMem.onload = () => {
                window.isVoiceScriptLoaded = true;
                isVoiceInitializing = false;
                
                if (loadingEl) {
                    loadingEl.classList.remove('show');
                    setTimeout(() => loadingEl.remove(), 300);
                }
                if (callback) callback();
            };
            
            scriptMem.onerror = () => {
                console.error("Failed to load voice-mem.js");
                window.isVoiceScriptLoaded = true; // Считаем, что ядро всё равно загружено
                isVoiceInitializing = false;
                if (loadingEl) loadingEl.remove();
                if (callback) callback();
            };
            
            document.head.appendChild(scriptMem);
        };
        
        scriptVoice.onerror = () => {
            console.error("Failed to load voice.js");
            isVoiceInitializing = false;
            if (loadingEl) loadingEl.remove();
        };
        
        document.head.appendChild(scriptVoice);
    };

    // Перехват кликов
    const voiceClickHandler = function(e) {
        const isVoiceLink = e.target.closest('.voice-link');
        const isDynamicBtn = e.target.closest('.dynamic-tts-btn');

        if (isVoiceLink || isDynamicBtn) {
            if (window.isVoiceScriptLoaded) return; // Пусть работает логика voice.js

            e.preventDefault();
            e.stopPropagation();

            const clickX = e.clientX;
            const clickY = e.clientY;
            const target = e.target;

            window.loadVoiceScripts(() => {
                // Имитируем клик после загрузки скриптов
                const clickEvent = new MouseEvent('click', {
                    view: window, bubbles: true, cancelable: true, clientX: clickX, clientY: clickY
                });
                target.dispatchEvent(clickEvent);
            });
        }
    };

    document.addEventListener('click', voiceClickHandler, true);

    // Проверка автоплея (чтобы загрузить сразу без клика)
    document.addEventListener('DOMContentLoaded', () => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('autoplay') || localStorage.getItem('ttsMode') === 'true') {
            window.loadVoiceScripts();
        }
    });
})();

// === ПЕРЕХВАТ КЛИКОВ ПО HISTORY.PHP ===
document.addEventListener('click', function(e) {
    const historyLink = e.target.closest('a[href*="history.php"]');
    if (historyLink) {
        if (historyLink.classList.contains('quick-all-history-link')) return; 
        const historyData = localStorage.getItem("localSearchHistory");
        if (historyData) {
            try {
                const historyArray = JSON.parse(historyData);
                if (Array.isArray(historyArray) && historyArray.length > 0) {
                    e.preventDefault();
                    if (typeof window.toggleQuickModal === 'function') window.toggleQuickModal();
                }
            } catch (err) { console.error("History intercept error:", err); }
        }
    }
});

// Глобальные уведомления с настраиваемым таймером
window.showBubbleNotification = function(text, duration = 2500, type = 'success') {
    let bubble = document.getElementById('bubbleNotification') || document.querySelector('.bubble-notification');

    if (!bubble) {
        bubble = document.createElement('div');
        bubble.id = 'bubbleNotification';
        bubble.className = 'bubble-notification';
        document.body.appendChild(bubble);
    }

    // Удаляем все возможные цветовые классы перед установкой нового
    bubble.classList.remove('success', 'error', 'warning', 'info');
    bubble.classList.add(type);
    
    bubble.textContent = text;
    bubble.classList.add('show');

    if (window.bubbleNotificationTimer) clearTimeout(window.bubbleNotificationTimer);

    window.bubbleNotificationTimer = setTimeout(() => {
        bubble.classList.remove('show');
    }, duration);
};

// === UI ВЫДЕЛЕНИЯ ТЕКСТА И КНОПКА PLAY (Работает до загрузки voice.js) ===
window.removeAllHighlights = function() {
    document.querySelectorAll(".active-word").forEach(el => el.classList.remove("active-word"));
    const oldBtn = document.querySelector('.dynamic-tts-btn');
    if (oldBtn) oldBtn.remove();
};

window.addTtsButton = function(containerElement, specificElement) {
    // Безопасная проверка видимости плеера (до загрузки voice.js ttsState не существует)
    const player = document.getElementById('voice-player-container');
    const isPlayerVisible = player && player.classList.contains('active');
    const isSpeakingOrPaused = typeof ttsState !== 'undefined' && (ttsState.speaking || ttsState.paused);

    if (isPlayerVisible && isSpeakingOrPaused) return;

    const oldBtn = document.querySelector('.dynamic-tts-btn');
    if (oldBtn) oldBtn.remove();

    const btnContainer = document.createElement('div');
    btnContainer.className = 'dynamic-tts-btn'; 
    btnContainer.innerHTML = `<img src="/assets/svg/play.svg" alt="Play">`;

    const scrollBtn = document.getElementById('scrollToTopBtn');
    if (scrollBtn && window.getComputedStyle(scrollBtn).opacity > 0) {
        btnContainer.classList.add('shifted');
    }

    document.body.appendChild(btnContainer);
};

window.activateSegmentForTTS = function(element) {
    if (!element) return;
    
    let targetElement = element;
    if (!targetElement.matches('[class*="-lang"]')) {
        const childLang = targetElement.querySelector('[class*="-lang"]');
        if (childLang) {
            targetElement = childLang;
        } else {
            return;
        }
    }

    window.removeAllHighlights();
    targetElement.classList.add("active-word");
    
    const rowContainer = targetElement.closest("[id]") || targetElement;
    window.addTtsButton(rowContainer, targetElement);
};

document.addEventListener("click", function (e) {
    // Игнорируем клики по самому плееру, кнопкам настроек или кнопке Play
    if (e.target.closest('.tts-ignore') || e.target.closest('.dynamic-tts-btn')) return;
    
    // === ИСКЛЮЧЕНИЕ ДЛЯ СТРАНИЦ РЕЗУЛЬТАТОВ ПОИСКА ===
    const path = window.location.pathname;
    const isSearchResult = (path === '/' || path === '/ru/') && window.location.search.includes('q=');
    if (isSearchResult) return;
    // ==========================================

    const clickedSegment = e.target.closest('[class*="-lang"]');

    if (clickedSegment) {
        // Если кликнули по уже выделенному слову - снимаем выделение
        if (clickedSegment.classList.contains("active-word")) {
            window.removeAllHighlights();
            return;
        }
        window.activateSegmentForTTS(clickedSegment);
        return;
    }

    // Если клик был мимо текста и мимо плеера - снимаем выделение
    if (
        !e.target.closest(".voice-player") &&
        !e.target.closest(".tts-mode-select") &&
        !e.target.closest(".tts-rate-select") &&
        !e.target.closest("#tts-scroll-toggle") && 
        !e.target.closest(".dynamic-tts-btn") &&
        // ДОБАВЛЕННЫЕ ИСКЛЮЧЕНИЯ: сохраняем активный TTS для меню и модалок
        !e.target.closest(".modal") &&                     // Клики внутри модального окна
        !e.target.closest("[data-bs-toggle='modal']") &&   // Кнопки, открывающие модалки
        !e.target.closest(".smart-panel") &&               // Панель шестеренки
        !e.target.closest(".smart-btn") &&                 // Кнопки шестеренки/оглавления
        !e.target.closest("#smart-gear-btn")               // Сама кнопка шестеренки
    ) {
        window.removeAllHighlights();
    }
});

// ========================================================================



function checkStorage(key) {
    if (localStorage.getItem(key) !== null) {
        alert(`Запись "${key}" есть в localStorage! Значение: ${localStorage.getItem(key)}`);
    } else {
      
     alert(`Записи "${key}" нет.`); 
    }
}

// Вызов проверки для ttsEnabled
//localStorage.setItem('ttsMode', 'true');
//checkStorage('ttsMode');
//checkStorage('removePunct');

// 1. Обработка URL-параметров при загрузке
(function () {
  try {
    const url = new URL(window.location.href);

    // --- TTS как читалка ---
    if (url.searchParams.has('tts')) {
      const raw = url.searchParams.get('tts');
      const val = raw ? raw.toLowerCase() : '';

      const allowedModes = ['pi', 'trn', 'pi-trn', 'trn-pi'];

      // tts=true | 1 | yes | on
      if (['', '1', 'true', 'yes', 'on'].includes(val)) {
        localStorage.setItem('ttsMode', 'true');
      }

      // tts=pi | trn | pi-trn | trn-pi
      if (allowedModes.includes(val)) {
        localStorage.setItem('ttsMode', 'true');
        localStorage.setItem('tts_preferred_mode', val);
      }

      // tts=false | 0 | off
      if (['false', '0', 'off'].includes(val)) {
        localStorage.removeItem('ttsMode');
      }
    }

    // --- Скорость ---
    if (url.searchParams.has('ttsRate')) {
      const rate = parseFloat(url.searchParams.get('ttsRate'));
      if (!isNaN(rate) && rate > 0) {
        localStorage.setItem('tts_preferred_rate', rate.toString());
      }
    }

  } catch (e) {
    console.error('Ошибка обработки URL:', e);
  }
})();

const MAX_HISTORY = 8400;
let textinfoCache = null; // Кеш для данных сутт


function processSearchQuery(query) {
    return query.toLowerCase()
        .replace(/\s*https?:\/\/\S+/gi, '')
        .replace(/\s*www\.\S+/gi, '')
        .replace(/^"|"$/g, '')
        .trim();
}

async function tryEnhanceKey(key) {
    const textinfo = await loadTextData();
    const baseKey = key.split(/\s+/)[0];
    const suttaName = textinfo[baseKey]?.pi;
    return suttaName ? `${baseKey} ${suttaName}` : key;
}

async function loadTextData() {
    if (textinfoCache) return textinfoCache;
    
    // 1. Проверяем глобальную переменную
    if (typeof textinfo !== 'undefined') {
        textinfoCache = textinfo;
        return textinfo;
    }

    // 2. Пробуем загрузить как модуль
    try {
        const module = await import('/assets/js/textinfo.js?update=' + Date.now());
        if (module.textinfo) {
            textinfoCache = module.textinfo;
            return module.textinfo;
        }
    } catch {}

    // 3. Пробуем загрузить как сырой текст
    try {
        const response = await fetch('/assets/js/textinfo.js?update=' + Date.now());
        const text = await response.text();
        
        // Пытаемся разобрать разными способами
        const data = parseTextInfo(text);
        if (data) {
            textinfoCache = data;
            return data;
        }
    } catch (e) {
        console.error("Ошибка загрузки textinfo:", e);
    }

    return {};
}

function parseTextInfo(text) {
    try {
        // Вариант 1: Чистый JSON
        return JSON.parse(text);
    } catch {
        try {
            // Вариант 2: JS-объект с присваиванием
            const match = text.match(/var\s+\w+\s*=\s*({[\s\S]+?});/);
            if (match) return JSON.parse(match[1]);

            // Вариант 3: Самовыполняющаяся функция
            return (new Function(text + '; return textinfo || window.textinfo;'))();
        } catch {
            return null;
        }
    }
}

// === ЦЕНТРАЛИЗОВАННОЕ ФОРМАТИРОВАНИЕ КЛЮЧЕЙ ===
function formatSlug(str) {
    if (!str) return '';
    const trimmed = String(str).trim();

    // 1. МЕМО (цитаты): оставляем как есть, сохраняем оригинальный регистр
    if (trimmed.startsWith('memo_')) {
        return trimmed;
    }

    // Находим позицию самого первого пробела
    const firstSpaceIndex = trimmed.indexOf(' ');

    // 2. ПОИСК ИЛИ СУТТА БЕЗ ПРОБЕЛОВ (например, "kacchapa" или "MN16")
    if (firstSpaceIndex === -1) {
        return trimmed.toLowerCase();
    }

    // 3. ПОИСК ИЛИ СУТТА С ПРОБЕЛАМИ (например, "MN16 Mahāsīhanāda Sutta")
    // Первое слово (id/запрос) с маленькой, остальное (title) как есть
    const slug = trimmed.slice(0, firstSpaceIndex).toLowerCase(); 
    const title = trimmed.slice(firstSpaceIndex); 

    return slug + title;
}


async function addToSearchHistory() {
    try {
        const url = new URL(window.location.href);
        const qParam = url.searchParams.get("q");
        if (!qParam) return;

        let key = processSearchQuery(qParam);

        // 1. Быстрое локальное сохранение (функция вернет ключ, возможно уже улучшенный из истории)
        const savedKey = await saveToHistory(key, url);

        // 2. Попытка улучшить ключ через базу textinfo (асинхронно)
        // Запускаем ТОЛЬКО если это сутта (есть цифры) и НЕТ пробела (т.е. названия еще нет)
        if (/\d/.test(savedKey) && !savedKey.includes(' ')) {
            try {
                const enhancedKey = await tryEnhanceKey(savedKey);
                // Сохраняем повторно, только если база реально дала новое длинное имя
                if (enhancedKey && enhancedKey !== savedKey) {
                    await saveToHistory(enhancedKey, url);
                }
            } catch (e) {
                console.debug("Не удалось добавить название:", e);
            }
        }
    } catch (e) {
        console.error("Ошибка сохранения истории:", e);
    }
}

async function saveToHistory(key, url) {
    key = formatSlug(key); 
    const value = url.pathname + url.search + url.hash;
    const timestamp = new Date().toISOString();
  
    let history = JSON.parse(localStorage.getItem("localSearchHistory")) || [];
    
    const firstWord = key.split(/\s+/)[0];
    const isSutta = /\d/.test(firstWord);
    const rootKey = isSutta ? firstWord : key;

    let bestKey = key; 
    
    history = history.filter(([k]) => {
        if (k === key) return false; 
        
        if (isSutta) {
            const kRoot = k.split(/\s+/)[0];
            if (kRoot === rootKey) {
                if (k.length > bestKey.length) {
                    bestKey = k;
                }
                return false; 
            }
        }
        return true;
    });
    
    history.unshift([bestKey, value, timestamp]);
    localStorage.setItem("localSearchHistory", JSON.stringify(history.slice(0, MAX_HISTORY)));
    
    // --- ИЗМЕНЕНО: Атомарная отправка истории ---
    if (typeof syncHistoryItemToCloud === 'function') {
        syncHistoryItemToCloud(bestKey, value, timestamp);
    }

    if (typeof window.refreshQuickModalData === 'function' && window.quickModalIsOpen) {
        window.refreshQuickModalData();
    }

    return bestKey; 
}


//установка фокуса в инпуте по нажатию / 
document.addEventListener('keydown', function(event) {
    // Проверяем именно символ / (код 191 или Slash)
    if (event.key === '/' || event.code === 'Slash') {
        // Проверяем, активно ли модальное окно через глобальный window (защита от ReferenceError)
        const isModalActive = window.quickModalIsOpen && document.getElementById('quickSearchInput');

        
        // Если модальное окно активно, устанавливаем фокус в его поле ввода
        if (isModalActive) {
            const modalInput = document.getElementById('quickSearchInput');
            event.preventDefault();
            modalInput.focus();
            modalInput.setSelectionRange(modalInput.value.length, modalInput.value.length);
            return; // Прерываем выполнение, так как модальное окно активно
        }
        
        // Ищем все возможные инпуты (оригинальная логика)
        const inputs = document.querySelectorAll(
            '#paliauto[type="search"], #paliauto[type="text"], .dtsb-value.dtsb-input'
        );
        
        // Если нет ни одного подходящего инпута - выходим
        if (inputs.length === 0) return;
        
        // Берем первый подходящий инпут
        const input = inputs[0];
        
        // Предотвращаем действие по умолчанию только если нашли инпут
        event.preventDefault();
        
        // Фокусируемся и перемещаем курсор в конец
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }
}); 

// Отключаем перехват / когда фокус уже в инпуте
const handleInputKeydown = (event) => {
    if (event.key === '/' || event.code === 'Slash') {
        event.stopPropagation();
    }
};

// Вешаем обработчики на все существующие и будущие инпуты
document.querySelectorAll('input').forEach(input => {
    input.addEventListener('keydown', handleInputKeydown);
});

// Наблюдатель для динамически добавляемых инпутов
new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeName === 'INPUT') {
                node.addEventListener('keydown', handleInputKeydown);
            } else if (node.querySelectorAll) {
                node.querySelectorAll('input').forEach(input => {
                    input.addEventListener('keydown', handleInputKeydown);
                });
            }
        });
    });
}).observe(document.body, { childList: true, subtree: true });

//конец фокуса в инпуте по нажатию / 


function loadModal(modalId, modalFile) {
    fetch(modalFile)
        .then(response => response.text())
        .then(html => {
            document.getElementById("modalContainer").innerHTML = html;
            let modal = new bootstrap.Modal(document.getElementById(modalId));
           //modal.show();
        })
        .catch(error => console.error("Ошибка загрузки модального окна:", error));
}

//loadModal("paliLookupInfo", "/assets/common/modalsSC.html");




// Функция для обновления ссылок
// --- DYNAMIC LINKS UPDATE SYSTEM (Merged) ---

function updateDemoLinks() {
  // 1. Собираем все текущие параметры из URL
  const urlParams = new URLSearchParams(window.location.search);
  
  // 2. Определяем приоритетный источник запроса (q)
  let newQ = '';
  const input = document.getElementById('paliauto');
  
  // А. Инпут (наивысший приоритет)
  if (input && input.value && input.value.trim() !== "") {
    newQ = input.value.trim();
  } 
  // Б. Активное слово (если инпут пуст)
  else {
    const activeWord = document.querySelector('.active-word');
    if (activeWord) {
       newQ = activeWord.id || activeWord.closest('[id]')?.id || '';
    }
  }
  
  // Обновляем параметр 'q', если нашли новое значение в интерфейсе
  if (newQ) {
      urlParams.set('q', newQ);
  }

  // 3. Определяем базовый URL для "Standard" режима
  let standardBaseUrl;
  const currentPath = window.location.href;
  const storedLang = localStorage.siteLanguage;

  if (currentPath.includes('/ru/') || currentPath.includes('/r/') || storedLang === 'ru') {
    standardBaseUrl = window.location.origin + "/r/";
  } else if (currentPath.includes('/th') || storedLang === 'th') {
    standardBaseUrl = window.location.origin + "/th/read/";
  } else {
    standardBaseUrl = window.location.origin + "/read/";
  }


  // Для русских – /mt/, для остальных – // (можно заменить на любой другой путь)
  const mtUrl = window.notEn
    ? window.location.origin + "/mt/"
    : window.location.origin + "/multi/";

  const linksMap = {
    stDemo: standardBaseUrl,
    mtDemo: mtUrl,                    
    memDemo: window.location.origin + "/memorize/",
    dDemo: window.location.origin + "/d/",
    mlDemo: window.location.origin + "/ml/",
    thDemo: window.location.origin + "/th/read/",
    rvDemo: window.location.origin + "/rev/",
    frDemo: window.location.origin + "/frev/",
    mlthDemo: window.location.origin + "/mlth/"
  };
  // 5. Обновляем href элементов
  const hash = window.location.hash || ''; // Сохраняем якорь, если есть

  Object.keys(linksMap).forEach(id => {
    const linkEl = document.getElementById(id);
    if (!linkEl) return;

    let newUrl = linksMap[id];
    const queryString = urlParams.toString();
    
    // Добавляем строку параметров, если она не пустая
    if (queryString) {
        newUrl += `?${queryString}`;
    }
    
    // Добавляем хэш в конец
    linkEl.href = newUrl + hash;
  });
}

// --- Триггеры (Events) ---

// 1. При загрузке страницы
document.addEventListener("DOMContentLoaded", updateDemoLinks);

// 2. При вводе в поиск
const searchInput = document.getElementById('paliauto');
if (searchInput) {
    searchInput.addEventListener('input', updateDemoLinks);
    searchInput.addEventListener('focus', updateDemoLinks);
}

// 3. При наведении мыши (Hover) на кнопки меню
document.body.addEventListener('mouseenter', (e) => {
    // Реагируем, если навели на ссылку с ID, содержащим "Demo"
    if (e.target.closest && e.target.closest('[id*="Demo"]')) {
        updateDemoLinks();
    }
}, true);

// 4. Перед правым кликом (чтобы скопировать актуальную ссылку)
document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('a')) {
        updateDemoLinks();
    }
}, true);

  //end 




//sett8ngs management

document.addEventListener("DOMContentLoaded", function() {

  const scriptSelect = document.getElementById('script-select');
  const dictSelect = document.getElementById('dict-select');

  const applyButton = document.getElementById('apply-button');
  const resetButton = document.getElementById('reset-button');
  const settingsButton = document.getElementById('settingsButton');
  const helpButton = document.getElementById('helpMessage');
  const goButton = document.querySelector('.go-button'); // Кнопка "Go"



function shouldIgnoreKeyEvent() {
  const activeElement = document.activeElement;
  return activeElement && activeElement.id === "paliauto" && activeElement.tagName === "INPUT";
}



window.addEventListener("keydown", (event) => {
    if (event.key === 'Escape' || event.code === 'Escape') {

        // ==========================================
        // ПРИОРИТЕТ 1: ПОДСКАЗКИ (Hints)
        // ==========================================
        
        // --- 1.1. Voice Hint ---
        const voiceHint = document.getElementById('active-voice-hint');
        if (voiceHint) {
            const closeHintBtn = document.getElementById('closeVoiceHintBtn');
            if (closeHintBtn) {
                closeHintBtn.click();
                event.preventDefault();
                return;
            }
        }

        // --- 1.2. General Hint Popup (С логами для Павла) ---
        // Ищем все варианты уведомлений: старые, новые тосты и баблы
        const hintElements = document.querySelectorAll('.dg-bottom-toast, .hint, .bubble-notification');
        
        for (let i = 0; i < hintElements.length; i++) {
            const hintElement = hintElements[i];
            const style = window.getComputedStyle(hintElement);
            
            // Проверяем наличие класса 'show' или фактическую видимость через opacity
            const isVisible = hintElement.classList.contains('show') || 
                              (style.display !== 'none' && style.opacity !== '0');
            
            if (isVisible) {
                
                // Ищем любую кнопку закрытия внутри
                const closeHintButton = hintElement.querySelector('#closeHintBtn, .dg-toast-close, .close-btn, .dg-bottom-toast-close');
                
                if (closeHintButton) {
                    closeHintButton.click();
                } else {
                    hintElement.classList.remove('show');
                }
                
                event.preventDefault();
                return; 
            }
        }

		
        // ==========================================
        // ПРИОРИТЕТ 2: СЛОВАРИ (Dictionaries)
        // ==========================================

        // --- 2.1. FDG Popup ---
        const fdgPopupElement = document.querySelector('.fdg-popup');
        if (fdgPopupElement && fdgPopupElement.style.display === 'block') {
            const fdgCloseButton = fdgPopupElement.querySelector('.fdg-close-btn');
            if (fdgCloseButton) {
                fdgCloseButton.click();
                event.preventDefault();
                return;
            }
        }

        // --- 2.2. Pali Lookup Popup (Главный словарь) ---
        const paliLookupPopupElement = document.querySelector('.popup');
        if (paliLookupPopupElement && paliLookupPopupElement.style.display === 'block') {
            const paliLookupCloseButton = paliLookupPopupElement.querySelector('.close-btn');
            if (paliLookupCloseButton) {
                paliLookupCloseButton.click();
                event.preventDefault();
                return;
            }
        }

        // ==========================================
        // ПРИОРИТЕТ 3: МОДАЛЬНЫЕ ОКНА (Modals & Banners)
        // ==========================================

        // --- 3.1. Quick Modal (Cattāri Ariyasaccāni) ---
        if (window.quickModalIsOpen) {
            if (typeof window.toggleQuickModal === 'function') {
                window.toggleQuickModal(); 
                event.preventDefault();
                return;
            }
        }

        // --- 3.2. PWA Banner ---
        const pwaBanner = document.getElementById('pwa-banner');
        if (pwaBanner && pwaBanner.offsetParent !== null) { 
            const closePwaBtn = document.getElementById('closePwaBanner');
            if (closePwaBtn) {
                closePwaBtn.click();
                event.preventDefault();
                return;
            }
        }

        // --- 3.3. Основные модальные окна (Settings, Help и т.д.) ---
        const closeBtnElements = document.querySelectorAll('.btn-close');
        if (closeBtnElements.length > 0) {
            let modalClosed = false;
            closeBtnElements.forEach(button => {
                if (button.offsetParent !== null) {
                    button.click();
                    modalClosed = true;
                }
            });
            // Возвращаемся, только если действительно закрыли видимое окно
            if (modalClosed) {
                event.preventDefault();
                return; 
            }
        }

        // ==========================================
        // ПРИОРИТЕТ 4: TTS И ВЫДЕЛЕНИЯ (Active Word)
        // ==========================================
        
        const dropdown = document.querySelector('.voice-dropdown');
        const isDropdownActive = dropdown && dropdown.classList.contains('active');
        const isHighlightActive = document.querySelector('.active-word');

        // Безопасная проверка, чтобы не уронить скрипт до загрузки voice.js
        const isTtsActive = typeof ttsState !== 'undefined' && (ttsState.speaking || ttsState.paused);

        // Если что-то играет, открыто меню или выделен текст
        if (isTtsActive || isDropdownActive || isHighlightActive) {
            event.preventDefault();
            
            if (typeof stopPlayback === 'function') {
                stopPlayback();        // Остановить звук, сбросить state
            }
            if (typeof removeAllHighlights === 'function') {
                removeAllHighlights(); // Убрать желтое выделение и мини-кнопку
            }
            
            // Закрываем меню плеера визуально
            if (dropdown) dropdown.classList.remove('active');
            return;
        }
    }
}, true);



    // Добавляем обработчик сочетания клавиш Alt + Space (физическая клавиша)
document.addEventListener("keydown", (event) => {
    if ((event.altKey && event.code === "Space") || (event.altKey && event.code === "KeyZ")) {
        const languageButton = document.getElementById("language-button");
      if (languageButton) {
       event.preventDefault();
       // Имитируем клик по кнопке
      languageButton.click();
      }
    }
 
    // Обработчик для Alt+P в любой раскладке
  // Проверяем Alt и физическое расположение клавиши P (код KeyP)
if (event.altKey && (event.code === "KeyP" || event.code === "KeyY")) { 
  event.preventDefault();
    toggleQuickModal();
  }

//Ctrl + ArrowRight navigate to next sutta
  if (shouldIgnoreKeyEvent()) return;

  if (event.ctrlKey && event.code === "ArrowRight") {
    const nextDiv = document.getElementById("next");
    if (nextDiv) {
      const link = nextDiv.querySelector("a");
      if (link) {
        history.pushState(null, "", link.href);
        location.href = link.href;
      }
    }
  } else if (event.ctrlKey && event.code === "ArrowLeft") {
    const prevDiv = document.getElementById("previous");
    if (prevDiv) {
      const link = prevDiv.querySelector("a");
      if (link) {
        history.pushState(null, "", link.href);
        location.href = link.href;
      }
    }
  }

    // === УНИВЕРСАЛЬНОЕ ДОБАВЛЕНИЕ В ИЗБРАННОЕ (Alt+Shift+P или Alt+F) ===
    if ((event.altKey && event.code === "KeyF" && !event.shiftKey)) { // Alt+F без шифта
        
        // Игнорируем, если фокус в поле ввода (чтобы не мешать печатать)
        const activeTag = document.activeElement.tagName;
        if (['INPUT', 'TEXTAREA'].includes(activeTag) || document.activeElement.isContentEditable) {
            return;
        }

        event.preventDefault();

        // 1. Попытка для Memo (эмулируем клик по кнопке в memo)
        const memoFavBtn = document.getElementById('toggle-memo-favorite');
        if (memoFavBtn) {
            memoFavBtn.click();
            return;
        }

        // 2. Попытка для Читалки (эмулируем клик по скрытой/видимой кнопке в read.php)
        const readerFavBtn = document.getElementById('toggle-favorite');
        if (readerFavBtn) {
            readerFavBtn.click(); 
            return;
        }

        // 3. Фолбэк: Страница поиска (если кнопок нет, сохраняем поисковый запрос)
        const urlParams = new URLSearchParams(window.location.search);
        const q = urlParams.get('q');

        if (q && typeof toggleFavoriteGlobal === 'function') {
            const searchData = {
                slug: q,
                id: q,
                title: "" + q, // Лупа покажет, что это поисковый запрос 🔎
                path: window.location.pathname,
                search: window.location.search,
                timestamp: Date.now()
            };
            
            toggleFavoriteGlobal(searchData);
        }
    }



//open Dict.Dhamma.Gift New Window
  if (event.altKey && event.code === "KeyN") {
    const inputEl = document.getElementById('paliauto');
    const inputVal = inputEl?.value.trim() || '';

    const urlParams = new URLSearchParams(window.location.search);
    const paramQ = urlParams.get('q')?.trim() || '';
    const paramS = urlParams.get('s')?.trim() || '';

    let q = '';

    if (inputVal === paramQ) {
      q = paramS || paramQ;
    } else if (inputVal) {
      q = inputVal;
    } else if (paramS) {
      q = paramS;
    } else {
      q = paramQ;
    }

    const path = window.location.pathname.toLowerCase();
    let langPrefix = '';

    if (path.includes('/ru/') || path.includes('/r/')) {
      langPrefix = '/ru';
    } else if (path.includes('/ml/')) {
      langPrefix = '/ml';
    }

    const baseUrl = 'https://dict.dhamma.gift' + langPrefix;

    const url = q
      ? baseUrl + '/?silent&source=pwa&q=' + encodeURIComponent(q)
      : baseUrl + '/';

    openDictionaryWindow(url);
  }

//Help + Settings + History
  if (event.altKey && event.code === "KeyH") {
    // Имитируем клик по кнопке
    helpButton.click();
  }

// --- Обработчик горячих клавиш (Alt + R) ---
if (event.altKey && event.code === "KeyR") {
    // 1. Пропускаем, если фокус в поле ввода
    const activeTag = document.activeElement.tagName;
    if (['INPUT', 'TEXTAREA'].includes(activeTag) || document.activeElement.isContentEditable) {
        return;
    }

    event.preventDefault();

    // Если скрипты еще не загружены — грузим и запускаем
    if (!window.isVoiceScriptLoaded) {
        window.loadVoiceScripts(() => {
            const voiceLink = document.querySelector('.voice-link');
            if (voiceLink) voiceLink.click();
        });
        return;
    }

    // 2. Сценарий: Плеер уже активен
    if (typeof ttsState !== 'undefined' && ttsState.speaking) {
        const mainPlayBtn = document.querySelector('.play-main-button');
        if (mainPlayBtn) {
            mainPlayBtn.click();
        }
        return;
    }

    // 3. Сценарий: Выбран конкретный сегмент (мини-кнопка)
    const miniPlayBtn = document.querySelector('.dynamic-tts-btn');
    if (miniPlayBtn) {
        miniPlayBtn.click();
        return;
    }

    // 4. Сценарий: Запуск по умолчанию
    const voiceLink = document.querySelector('.voice-link');
    if (voiceLink) {
        voiceLink.click();
    }
}



    if (event.altKey && event.code === "KeyS") {
      // Имитируем клик по кнопке
      settingsButton.click();
    }

// Мультиселект Alt + J (физическая клавиша J)
if (event.altKey && event.code === "KeyJ") {
    // Пропускаем, если фокус в поле ввода (используем твою функцию)
    if (typeof shouldIgnoreKeyEvent === 'function' && shouldIgnoreKeyEvent()) return;

    const multiSelectBtn = document.getElementById('toggle-multiselect');
    
    // Проверяем наличие кнопки на странице, чтобы код не падал
    if (multiSelectBtn) {
        event.preventDefault();
        multiSelectBtn.click();
    }
}


 // --- 2. Оглавление (TOC) Alt + W ---
    if (event.altKey && event.code === "KeyW") {
        event.preventDefault();
        const tocBtn = document.getElementById('smart-toc-btn');
        const gearBtn = document.getElementById('smart-gear-btn');
        
        if (tocBtn && gearBtn) {
            // Делаем кнопки физически видимыми
            tocBtn.classList.add('visible');
            gearBtn.classList.add('visible');
            // Эмулируем клик для открытия оглавления
            tocBtn.click();
        }
    }
  
//alt + G history toggle
 function handleHistoryToggle() {
  const currentUrl = window.location.pathname;
  let historyPhpPath, historyHtmlPath;

  // Если URL содержит языковой префикс (/ru/, /r/, /ml/)
  if (currentUrl.match(/\/(ru|r|ml)\//)) {
    const langPrefix = 'ru/';
    historyPhpPath = `/${langPrefix}history.php`;
    historyHtmlPath = `/${langPrefix}assets/common/history.html`;
  } 
  // Если URL содержит /assets/common/ (но без языкового префикса)
  else if (currentUrl.includes('/assets/common/')) {
    historyPhpPath = '/history.php';  // Переход в корень
    historyHtmlPath = '/assets/common/history.html';
  }
  // Все остальные случаи (корень сайта или другие пути)
  else {
    historyPhpPath = '/history.php';
    historyHtmlPath = '/assets/common/history.html';
  }

  // Переключение между history.php и history.html
  if (currentUrl.endsWith('history.php')) {
    window.location.href = historyHtmlPath;
  } 
  else if (currentUrl.endsWith('history.html')) {
    window.location.href = historyPhpPath;
  }
  // Если не на странице истории, идём на history.php
  else {
    window.location.href = historyPhpPath;
  }
}

  if (event.altKey && event.code === "KeyG") {
    event.preventDefault(); // отключаем стандартное действие
    handleHistoryToggle();
  }
 
 //Language Alt + L
  if (event.altKey && event.code === "KeyL") {
    event.preventDefault(); // Предотвращаем стандартное поведение

    const scriptOptions = ['ISOPali', 'devanagari', 'thai']; // Доступные скрипты
    const url = new URL(window.location.href);
    let currentScript = url.searchParams.get('script') || 'ISOPali';

    // Получаем следующий скрипт в списке
    let nextIndex = (scriptOptions.indexOf(currentScript) + 1) % scriptOptions.length;
    let nextScript = scriptOptions[nextIndex];
 
    localStorage.removeItem('selectedScript');

    // Обновляем URL
    if (nextScript === 'ISOPali') {
      url.searchParams.delete('script'); // Удаляем параметр для ISOPali
    } else {
      url.searchParams.set('script', nextScript);
    }

    window.location.href = url.toString(); // Перезагружаем страницу
  }
 
  // Для отладки: смотри, что нажимается
//  console.log('Pressed:', event.code);
 if (
    event.altKey && // любой Alt
    (event.code === 'Period' || 
     event.code === 'Comma' || 
     event.code === 'KeyM')
  ) {
    event.preventDefault();

    const currentValue = localStorage.getItem("removePunct") === "true";
    localStorage.setItem("removePunct", currentValue ? "false" : "true");

    location.reload();
  }


  if (event.altKey && (event.code === 'KeyQ')) {
    event.preventDefault();

openDictionaries(event);
  }

    // Если нажат Alt
    if (event.altKey) {
        
        // Alt + Minus (на основной клавиатуре или на NumPad)
        if (event.code === "Minus" || event.code === "NumpadSubtract") {
            event.preventDefault(); // Отменяем стандартное действие браузера
            const btnDec = document.getElementById('fontDec');
            if (btnDec) btnDec.click(); // Имитируем клик по кнопке "-"
        }

        // Alt + Plus (Клавиша "равно" считается плюсом, или NumPad Plus)
        // Мы используем "Equal", чтобы не требовать нажатия Shift
        if (event.code === "Equal" || event.code === "NumpadAdd") {
            event.preventDefault();
            const btnInc = document.getElementById('fontInc');
            if (btnInc) btnInc.click(); // Имитируем клик по кнопке "+"
        }
    }
});
 
// setup dictionary

// Выполняем логику только если элемент существует на странице
if (dictSelect) {
  // Загрузка сохраненного значения из localStorage
  const savedDict = localStorage.getItem('selectedDict');

  if (savedDict && [...dictSelect.options].some(opt => opt.value === savedDict)) {
    dictSelect.value = savedDict; // Устанавливаем только если значение есть в списке
  } else {
    const currentUrl = window.location.href;
    
    if (currentUrl.includes('/r/') || currentUrl.includes('/ml/') || currentUrl.includes('/ru/')) {
      dictSelect.value = 'standaloneru'; // Значение по умолчанию standaloneru
    } else if (currentUrl.includes('/d/')) {
      dictSelect.value = 'dpdFull'; // Значение по умолчанию dpdFull
    } else {
      dictSelect.value = 'standalone'; // Значение по умолчанию
    }
  }
}
  
    // Загрузка сохраненного значения из localStorage
  const savedScript = localStorage.getItem('selectedScript');

    // Установка сохраненного значения в select при загрузке страницы
if (savedScript) {
  scriptSelect.value = savedScript;
} else {
  scriptSelect.value = 'ISOPali'; // Значение по умолчанию, если ничего не сохранено
localStorage.setItem('selectedScript', 'ISOPali');
}

if (applyButton) {
  applyButton.addEventListener('click', async function() {
    localStorage.setItem('selectedScript', scriptSelect.value);
    localStorage.setItem('selectedDict', dictSelect.value);
    
    const removePunctCheckbox = document.querySelector('.setting-checkbox[data-key="removePunct"]');
    if (removePunctCheckbox) {
      localStorage.setItem('removePunct', removePunctCheckbox.checked);
    }
    
    localStorage.setItem("firstVisitShowSettingsClosed", "true");
    saveExactScrollPosition(); 
    
    // Ждем завершения синхронизации перед релоадом
    if (typeof syncSettingsToCloud === 'function') {
        await syncSettingsToCloud();  
    }
    
    location.reload();
  });
}

  // Функция для применения сохраненного значения
function applySavedDict(dict) {
  localStorage.setItem('selectedDict', dict);
    localStorage.setItem('dictionaryVisible', 'true');
      location.reload();  // Перезагрузка, если изменился словарь
}

  // Функция для применения сохраненного значения
  function applySavedScript(script) {
    const url = new URL(window.location.href);

    if (script === 'ISOPali') {
      localStorage.setItem('selectedScript', 'ISOPali');
      url.searchParams.delete('script');
    } else {
      url.searchParams.set('script', script.toLowerCase());
    }

    // Перезагрузка страницы с новым URL
    if (window.location.href !== url.toString()) {
      window.location.href = url.toString();
    }
  }

if (resetButton) {
  resetButton.addEventListener('click', async function () {
    const path = window.location.pathname;
    const language =
      localStorage.getItem('siteLanguage') ||
      (/^\/(ru|r|ml)\//.test(path) ? 'ru' : 'en');

    const messages = {
      ru: {
        confirm: 'Вы уверены, что хотите сбросить ВСЕ настройки?',
        success: 'Настройки сброшены'
      },
      en: {
        confirm: 'Are you sure you want to reset ALL settings?',
        success: 'Reset successful'
      }
    };

    if (!confirm(messages[language].confirm)) return;

    const notificationText = messages[language].success;

    if (typeof clearFdgPopupParams === 'function') {
      clearFdgPopupParams();
    }

    const keysToKeep = [
        'localSearchHistory', 
        'dg_favorites', 
        'syncPhraseId', 
        'syncPhraseRaw', 
        'dg_cloud_session', 
        'lastSyncTime', 
        'dg_suttaProgress', 
        'dg_cloudProgress'
    ];

    try {
        const favs = JSON.parse(localStorage.getItem('dg_favorites')) || [];
        favs.forEach(fav => {
            if (fav.search && fav.search.includes('saved_id=')) {
                const params = new URLSearchParams(fav.search);
                const savedId = params.get('saved_id');
                if (savedId) keysToKeep.push(savedId);
            }
        });
    } catch (e) {}

    const savedData = {};
    keysToKeep.forEach(key => {
        const val = localStorage.getItem(key);
        if (val !== null) savedData[key] = val;
    });

    // Отключаем локальный перехватчик изменений, чтобы он не мешал
    window.dg_ignoreNextStorageEvent = true;

    localStorage.clear();
    sessionStorage.clear();

    Object.keys(savedData).forEach(key => {
        localStorage.setItem(key, savedData[key]);
    });

    localStorage.setItem('variantVisibility', 'hidden');

    const url = new URL(window.location.href);
    url.searchParams.delete('script');

    if (typeof showBubbleNotification === 'function') {
      showBubbleNotification(notificationText);
    } else {
      alert(notificationText);
    }

    // --- ЖЕСТКОЕ УДАЛЕНИЕ НАСТРОЕК ИЗ БАЗЫ FIREBASE ---
    // Напрямую стираем весь узел settings в документе пользователя
    if (window.firebase && typeof db !== 'undefined' && db && typeof getUid === 'function') {
        const uid = getUid();
        if (uid) {
            try {
                await Promise.race([
                    db.collection("users").doc(uid).set({
                        settings: firebase.firestore.FieldValue.delete(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true }),
                    new Promise(resolve => setTimeout(resolve, 800)) // Таймаут для оффлайна
                ]);
            } catch (e) {
                console.warn("Ошибка при стирании настроек в облаке", e);
            }
        }
    }

    // Перезагрузка страницы
    setTimeout(() => {
      if (url.toString() !== window.location.href) {
        window.location.href = url.toString();
      } else {
        window.location.reload();
      }
    }, 50); 
  });
}


// Получаем все радиокнопки
var readerRadios = document.querySelectorAll('input[name="reader"]');

// Устанавливаем обработчики событий при изменении состояния радиокнопок
readerRadios.forEach(function(radio) {
    radio.addEventListener('change', function() {
        if (this.checked) {
            // Устанавливаем значение в localStorage
            localStorage.setItem("defaultReader", this.value);
        }
    });
});

// Проверяем значение в localStorage при загрузке страницы и устанавливаем состояние радиокнопок
var savedReader = localStorage.getItem("defaultReader");
if (savedReader) {
    document.querySelector('input[name="reader"][value="' + savedReader + '"]').checked = true;
}

// Сохраняем текущие значения параметров
const initialBaseUrl = getBaseUrl();
const initialDefaultReader = localStorage.defaultReader;

// Функция для получения текущего baseUrl
function getBaseUrl() {
    let baseUrl;
    if (window.location.href.includes('/ru') || (localStorage.siteLanguage && localStorage.siteLanguage === 'ru')) {
        baseUrl = window.location.origin + "/r/";
    } else {
        baseUrl = window.location.origin + "/read/";
    }

    if (localStorage.defaultReader === 'ml') {
        baseUrl = window.location.origin + "/ml/";
    } else if (localStorage.defaultReader === 'mt') {
        baseUrl = window.location.origin + "/mt/";
    } else if (localStorage.defaultReader === 'rv') {
        baseUrl = window.location.origin + "/rev/";
    } else if (localStorage.defaultReader === 'd') {
        baseUrl = window.location.origin + "/d/";
    } else if (localStorage.defaultReader === 'mem') {
        baseUrl = window.location.origin + "/memorize/";
    } else if (localStorage.defaultReader === 'fr') {
        baseUrl = window.location.origin + "/frev/";
    }

    return baseUrl;
}

// Функция для обновления URL
function updateUrl() {
    const currentBaseUrl = getBaseUrl();
    const url = new URL(window.location.href);

    // Извлекаем путь из currentBaseUrl
    const newPath = new URL(currentBaseUrl).pathname;

    // Обновляем путь в текущем URL
    url.pathname = newPath;

    // Сохраняем новый URL
    window.location.href = url.toString();
}
const initialRemovePunct = localStorage.getItem("removePunct");
// Функция для проверки изменений и обновления URL
function checkAndUpdateUrl() {
    const currentBaseUrl = getBaseUrl();
    const currentDefaultReader = localStorage.defaultReader;
    const currentRemovePunct = localStorage.getItem("removePunct"); // Новая проверка

    // Если параметры изменились, обновляем URL
    if (currentBaseUrl !== initialBaseUrl || 
        currentDefaultReader !== initialDefaultReader || 
        currentRemovePunct !== initialRemovePunct) { // Добавлено
        updateUrl();
    }
}

// end of default reader part

// open current url in demo mode

// Функция для извлечения параметров из URL
function getQueryParams() {
  const params = {};
  const queryString = window.location.search.substring(1);
  const pairs = queryString.split('&');
  pairs.forEach(pair => {
    const [key, value] = pair.split('=');
    if (key && value) {
      params[key] = value;
    }
  });
  return params;
}




//remove punctuation checkbox
    document.querySelectorAll(".setting-checkbox").forEach(checkbox => {
        const key = checkbox.dataset.key; // Берём ключ из data-key
        checkbox.checked = localStorage.getItem(key) === "true";

        checkbox.addEventListener("change", () => {
            localStorage.setItem(key, checkbox.checked);
        });
    });



//end of DOMContentLoaded

});


//Горячие кнопки от 1 до Х

document.addEventListener("keydown", (event) => {
  if (event.altKey && event.code === "Digit1") { // Проверяем, что нажаты Alt и 7
    event.preventDefault();

    let currentUrl = window.location.href; // Получаем текущий URL
    let urlWithoutParams = currentUrl.split('?')[0]; // Удаляем всё после ?

    let newUrl;
    let defaultLanguage = localStorage.getItem('siteLanguage') || "en"; // Получаем язык из localStorage или используем "en" по умолчанию

    let defaultLanguageLinkPart;
        if (defaultLanguage === "ru") {
          defaultLanguageLinkPart = "/r/";
        } else if (defaultLanguage === "th") {
          defaultLanguageLinkPart = "/th/read/";
        } else {
          defaultLanguageLinkPart = "/read/";
        }


    // Проверяем, содержит ли URL /r/
    if (urlWithoutParams.endsWith("/r/")) {
      newUrl = urlWithoutParams.replace("/r/", "/read/"); // Меняем на /read/
    } else if (urlWithoutParams.endsWith("/th/read/")) {
      newUrl = urlWithoutParams.replace("/th/read/", defaultLanguageLinkPart); // Меняем на /read/
    } else if (urlWithoutParams.endsWith("/read/")) {
      newUrl = urlWithoutParams.replace("/read/", "/r/"); // Меняем на /r/
    } 
    else {
      // Если URL не содержит ни /r/, ни /read/, выбираем начальный вариант
      if (localStorage.siteLanguage && localStorage.siteLanguage === 'ru') {
        newUrl = window.location.origin + "/r/";
      } else {
        newUrl = window.location.origin + "/read/";
      }
    }


    // Добавляем параметры обратно, если они были
let params = currentUrl.split('?')[1] || '';
newUrl = params ? `${newUrl}?${params}` : `${newUrl}?q=sn56.11`;

    if (newUrl !== currentUrl) { // Проверяем, изменился ли URL
      history.pushState(null, "", newUrl); // Добавляем запись в историю
      location.href = newUrl; // Принудительно переходим по новому URL
      location.reload();
    }
  }
  
});


// Объект, связывающий цифры от 1 до 6 с id ссылок
const demoLinks = {
 // 1: "stDemo", // Alt + 1
  2: "mtDemo", // Alt + 2
  3: "memDemo",  // Alt + 3
  4: "dDemo", // Alt + 4
  5: "mlDemo", // Alt + 5
  6: "thDemo", // Alt + 6
  7: "rvDemo",  // Alt + 7
  8: "frDemo",  // Alt + 8
  9: "mlthDemo"  // Alt + 9
};

// Обработчик события нажатия клавиш
document.addEventListener("keydown", (event) => {
  // Проверяем, что нажата клавиша Alt и одна из цифр от 1 до 6
  if (event.altKey && event.code.startsWith("Digit")) {
              event.preventDefault();

// Извлекаем цифру из event.code (например, "Digit1" -> 1)
const digit = parseInt(event.code.replace("Digit", ""), 10);

// Проверяем, существует ли такая цифра в нашем объекте demoLinks
if (demoLinks.hasOwnProperty(digit)) {
    event.preventDefault(); // Предотвращаем системное действие только если ключ совпал
    
	updateDemoLinks(); // <--- Вызываем обновленную функцию перед кликом
	
    const linkId = demoLinks[digit];
    const linkElement = document.getElementById(linkId);

    if (linkElement) {
        linkElement.click();
    } else {
        console.error(`Ссылка с id "${linkId}" не найдена!`);
    }
}
			  
/*			  
    // Проверяем, что цифра находится в диапазоне от 1 до 7
    if (digit >= 2 && digit <= 7) {
      // Получаем id ссылки из объекта demoLinks
      const linkId = demoLinks[digit];

      // Находим ссылку по id
      const linkElement = document.getElementById(linkId);

      // Если ссылка найдена, имитируем клик
      if (linkElement) {
        linkElement.click(); // Программный клик по ссылке
      } else {
        console.error(`Ссылка с id "${linkId}" не найдена!`);
      }
    }
	
	*/
  }
});


document.addEventListener("keydown", (event) => {
  if (event.altKey && event.code === "Digit8") { // Проверяем, что нажаты Alt и 7
            event.preventDefault();
    let currentUrl = window.location.href; // Получаем текущий URL

    // Шаг 1: Удаляем всё после первого / (оставляем базовую часть)
    let base = currentUrl.split('/')[0] + '//' + currentUrl.split('/')[2];

    // Шаг 2: Удаляем всё перед ? (оставляем параметры, если они есть)
    let params = currentUrl.split('?')[1] || '';

    // Шаг 3: Собираем новый URL
    let newUrl = `${base}/mlth/${params ? `?${params}` : ''}`;

    if (newUrl !== currentUrl) { // Проверяем, изменился ли URL
      history.pushState(null, "", newUrl); // Добавляем запись в историю
      location.href = newUrl; // Принудительно переходим по новому URL
    }
  }
});


document.addEventListener('keydown', function(event) {
  if (event.ctrlKey && event.code === 'Digit3') {
    event.preventDefault();

    const currentUrl = window.location.href;
    const currentParams = window.location.search; // включает всё после '?', включая '?'

    let targetUrl;

    if (currentUrl.includes('/ru/') || currentUrl.includes('/r/') || currentUrl.includes('/ml/')) {
      targetUrl = 'https://dict.dhamma.gift/ru/';
    } else {
      targetUrl = 'https://dict.dhamma.gift/';
    }

    // Добавляем параметры, если есть
    if (currentParams) {
      targetUrl += currentParams;
    }

    window.location.href = targetUrl;
  }
});

document.addEventListener("keydown", function (event) {
  const isCtrlPressed = event.ctrlKey || event.metaKey;
  const currentPath = window.location.pathname;
  const baseUrl = window.location.origin;

  const key = "preferredLanguage";
  const savedLang = localStorage.getItem(key);
  

  // Функция: получить URL для заданного языка и страницы
  function makeUrl(lang, isHomepage) {
    if (isHomepage) {
      return lang === "ru" ? `${baseUrl}/ru/` : `${baseUrl}/`;
    } else {
      return lang === "ru" ? `${baseUrl}/ru/read.php` : `${baseUrl}/read.php`;
    }
  }

  // Функция: определить, нужно ли переключать язык или использовать сохранённый
  function determineTargetUrl(isHomepage) {
    const isCurrentTarget =
      (isHomepage && (currentPath === "/" || currentPath === "/ru/")) ||
      (!isHomepage && (currentPath === "/read.php" || currentPath === "/ru/read.php"));

    let nextLang;

    if (isCurrentTarget) {
      // Уже на целевой странице — делаем toggle
      nextLang = window.notEn ? "en" : "ru";
      localStorage.setItem(key, nextLang);
    } else {
      // С других страниц — просто используем сохранённое предпочтение
      nextLang = savedLang || (window.notEn ? "ru" : "en");
      if (!savedLang) localStorage.setItem(key, nextLang); // сохранить при первом запуске
    }

    return makeUrl(nextLang, isHomepage);
  }

  // === Ctrl + 1: Переход на домашнюю страницу ===
  // !event.shiftKey — иначе конфликтует с отдельным шорткатом Ctrl+Shift+1 (переключение языка сайта, см. ниже)
  if (isCtrlPressed && !event.shiftKey && event.key === "1") {
    event.preventDefault();
    const targetUrl = determineTargetUrl(true);
    window.location.href = targetUrl;
  }

  // === Ctrl + 2: Переход на read.php ===
  if (isCtrlPressed && event.key === "2") {
    event.preventDefault();
    const targetUrl = determineTargetUrl(false);
    window.location.href = targetUrl;
  }
  
  // === Ctrl + 3: клик по "Читать Главами" ===
if (isCtrlPressed && event.key === "3") {
    event.preventDefault();

    const input = document.getElementById('paliauto');
    const q = input?.value.trim().toLowerCase().replace(/ṁ/g, 'ṃ') || '';

    // Если q пустое, ничего не делаем
    if (!q) return;

    // Корень для ?q=
    const match = q.match(/^([a-z]+[0-9]+)/i);
    const base = match ? match[1] : q;

    // Находим кнопку (она может быть /ru/r.php или /r.php)
    const chapterBtn = document.querySelector('#chapter-button a');
    if (!chapterBtn) return;

    const href = chapterBtn.getAttribute("href");

    // Формируем итоговый URL
    const finalUrl =
        `${href}?q=${encodeURIComponent(base)}#${encodeURIComponent(q)}`;

    window.location.href = finalUrl;
}

  
  
});

document.addEventListener("keydown", function (event) {
  if (event.ctrlKey && event.shiftKey && event.code === "Digit1") {
    event.preventDefault();

    if (typeof window.setSiteLanguage !== "function") return;
    var current = (window.DHAMMA_I18N && window.DHAMMA_I18N.language) || document.documentElement.lang || "en";
    var next = current.toLowerCase().startsWith("ru") ? "en" : "ru";
    window.setSiteLanguage(next);
  }
});



/*
const openQuickModalBtn = document.createElement("button");
openQuickModalBtn.innerText = "≡"; // или иконку по желанию
openQuickModalBtn.setAttribute("aria-label", "Открыть окно Cattāri Ariyasaccāni");
openQuickModalBtn.style.cssText = `
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 10001;
  background-color: #859900;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  font-size: 1.5rem;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  cursor: pointer;
`;

openQuickModalBtn.addEventListener("click", toggleQuickModal);
document.body.appendChild(openQuickModalBtn);

if (!document.getElementById("openQuickModalBtn")) {
  const openQuickModalBtn = document.createElement("button");
  openQuickModalBtn.addEventListener("click", toggleQuickModal);
}

<button onclick="toggleQuickModal()" aria-label="Открыть Cattāri Ariyasaccāni" style="
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 10001;
  background-color: #859900;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  font-size: 1.5rem;
  font-weight: bold;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  cursor: pointer;
">
  ≡
</button>
*/

// === ФУНКЦИЯ "УМНОГО" СОХРАНЕНИЯ ПОЗИЦИИ ===
function saveExactScrollPosition() {
    const suttaContainer = document.getElementById('sutta');
    if (!suttaContainer) return;

    const elements = suttaContainer.querySelectorAll('[id]');
    if (elements.length === 0) return;

    const eyeLevel = 120;
    
    let bestElement = null;
    let minDistance = Infinity;

    for (const el of elements) {
        const rect = el.getBoundingClientRect();
        const distance = Math.abs(rect.top - eyeLevel);

        if (distance < minDistance) {
            minDistance = distance;
            bestElement = el;
        }
    }

    if (bestElement) {
        // ДОБАВЛЕНО: Получаем текущий slug из URL
        const urlParams = new URLSearchParams(window.location.search);
        let currentSlug = urlParams.get('q') || '';
        currentSlug = currentSlug.trim().toLowerCase();

        const data = {
            id: bestElement.id,
            offset: bestElement.getBoundingClientRect().top,
            slug: currentSlug // ДОБАВЛЕНО: сохраняем slug вместе с координатами
        };
        localStorage.setItem('exactScrollAnchor', JSON.stringify(data));
    }
}



    // === ЛОГИКА МАСШТАБИРОВАНИЯ (С ЛОКАЛИЗАЦИЕЙ) ===
    
    const btnDec = document.getElementById('fontDec');
    const btnInc = document.getElementById('fontInc');
    const valDisplay = document.getElementById('fontVal');

    // Текущий масштаб из памяти (или 100%)
    let currentScale = parseInt(localStorage.getItem('uiScale')) || 100;
    
    // Обновляем цифру в меню настроек при открытии
    if (valDisplay) valDisplay.textContent = currentScale + '%';

    // Функция изменения масштаба
    function changeScale(delta) {
        const newScale = currentScale + delta;

        // Ограничение от 70% до 150%
        if (newScale >= 70 && newScale <= 150) {
            currentScale = newScale;

            // 1. Применяем размер
            document.documentElement.style.fontSize = currentScale + '%';
            localStorage.setItem('uiScale', currentScale);
            
            // 2. Обновляем цифру в модальном окне
            if (valDisplay) valDisplay.textContent = currentScale + '%';

            // 3. Определяем язык для уведомления
            const path = window.location.pathname;
            // Если путь содержит /ru/, /r/ или /ml/ — показываем по-русски
            
            // Выбираем текст
            const label = window.notEn ? 'Размер' : 'Font size';

            // 4. Показываем Bubble-уведомление
            if (typeof showBubbleNotification === 'function') {
                showBubbleNotification(`${label}: ${currentScale}%`);
            }
        }
    }

    // Обработчики кликов (для меню настроек)
    // Если вы вызываете .click() из своего блока горячих клавиш, это тоже сработает
    if (btnDec && btnInc) {
        btnDec.addEventListener('click', () => changeScale(-5)); // Уменьшить
        btnInc.addEventListener('click', () => changeScale(5));  // Увеличить
    }



// ==========================================
// УМНЫЙ РОУТИНГ И ПАРСИНГ ЗАПРОСОВ (Dhamma.gift)
// ==========================================

let textInfoData = null;

// 1. Асинхронная подгрузка карты диапазонов
fetch('/assets/js/textinfo.js')
    .then(res => res.ok ? res.json() : null)
    .then(data => textInfoData = data)
    .catch(err => console.error("Ошибка загрузки textinfo.js", err));

// 2. Транслитерация
function cyrillicToLatin(str) {
    const ru = {
        "А":"a", "Б":"b", "В":"v", "Г":"g", "Д":"d", "Е":"e", "Ё":"yo", "Ж":"zh", "З":"z", "И":"i",
        "Й":"j", "К":"k", "Л":"l", "М":"m", "Н":"n", "О":"o", "П":"p", "Р":"r", "С":"s", "Т":"t",
        "У":"u", "Ф":"f", "Х":"kh", "Ц":"ts", "Ч":"ch", "Ш":"sh", "Щ":"sch", "Ъ":"", "Ы":"y", "Ь":"",
        "Э":"e", "Ю":"yu", "Я":"ya", "а":"a", "б":"b", "в":"v", "г":"g", "д":"d", "е":"e", "ё":"yo",
        "ж":"zh", "з":"z", "и":"i", "й":"j", "к":"k", "л":"l", "м":"m", "н":"n", "о":"o", "п":"p",
        "р":"r", "с":"s", "т":"t", "у":"u", "ф":"f", "х":"kh", "ц":"ts", "ч":"ch", "ш":"sh", "щ":"sch",
        "ъ":"", "ы":"y", "ь":"", "э":"e", "ю":"yu", "я":"ya", " ": " ", ".":".", ",":".", "/":"-",
        ":":"", ";":"", "—":"", "–":"-"
    };
    return str.split('').map(char => ru[char] || char).join('');
}

// 3. Универсальная Нормализация (опечатки, пробелы, префиксы)
function normalizeQuery(rawQuery) {
    let q = rawQuery.trim();
    if (!q) return "";

    q = cyrillicToLatin(q).toLowerCase();
    q = q.replace(/,/g, '.').replace(/\s*\.\s*/g, '.');

    if (/^(bu|bi)\s+[a-z]/.test(q)) {
         q = q.replace(/^(bu|bi)\s+([a-z]+)/, '$1-$2'); 
    }

    q = q.replace(/([a-z])\s+(\d)/g, '$1$2');

    const match = q.match(/^([a-z]+)(\d.*)$/);
    if (match) {
        let letters = match[1];
        let rest = match[2];

        const keepAsIs = ['iti', 'snp', 'ud', 'thig', 'thag', 'dhp', 'pj', 'ss', 'ay', 'np', 'pc', 'pd', 'sk', 'as', 'bu', 'bi'];

        if (keepAsIs.includes(letters) || letters.startsWith('bu-') || letters.startsWith('bi-')) {
             q = letters + rest;
        } else {
            const first = letters[0];
            if (first === 'm') q = 'mn' + rest;
            else if (first === 'd') q = 'dn' + rest;
            else if (first === 'a') q = 'an' + rest;
            else if (first === 's') q = 'sn' + rest;
        }
    }

    q = q.replace(/(\d+)\s+(\d+)/g, '$1.$2');
    return q;
}

// 4. Поиск диапазона
function findRangeForKey(normalizedQ) {
    if (!textInfoData) return null;
    if (textInfoData[normalizedQ]) return { type: 'exact', key: normalizedQ }; 

    const match = normalizedQ.match(/^([a-z]+)(\d+)\.(\d+)$/);
    if (match) {
        const prefix = match[1];
        const major = match[2];
        const minor = parseInt(match[3], 10);
        const searchPrefix = `${prefix}${major}.`; 
        
        for (const key in textInfoData) {
            if (key.startsWith(searchPrefix)) {
                const r = key.match(/(\d+)-(\d+)$/);
                if (r && minor >= parseInt(r[1]) && minor <= parseInt(r[2])) {
                    return { type: 'range', key: key };
                }
            }
        }
    }
    return null;
}

// 5. Единый слушатель кликов (MenuRead и home-button)
document.addEventListener('click', function(e) {
    // Ищем клик по любой из целевых кнопок
    const targetLink = e.target.closest('#MenuRead, #home-button a');
    
    if (targetLink) {
        e.preventDefault();
        
        const searchInput = document.getElementById('paliauto');
        let rawQuery = searchInput ? searchInput.value : '';
        
        // Фоллбэк на URL-параметр q
        if (!rawQuery.trim()) {
            const urlParams = new URLSearchParams(window.location.search);
            rawQuery = urlParams.get('q') || '';
        }
        
        const q = normalizeQuery(rawQuery);
        let baseUrl = targetLink.getAttribute('href').split(/[?#]/)[0];
        
        if (!q) {
            window.location.href = baseUrl;
            return;
        }

        // Роутинг специфичных страниц (Виная)
        if (/^(bu|pm|bpm|bupm)$/.test(q)) { window.location.href = '/pm.php?expand=true'; return; }
        if (/^(bi|bipm)$/.test(q)) { window.location.href = '/bipm.php?expand=true'; return; }
        if (/^(pj|ss|ay|np|pc|pd|sk|as)/.test(q)) {
             let clean = q.replace('bu-', '').replace('bi-', '');
             let suffix = q.startsWith('bi-') ? 'CollapseBi' : 'CollapseBu';
             window.location.href = baseUrl + '#' + clean + suffix;
             return;
        }

        // Роутинг сутт с проверкой на диапазоны
        if (/\d/.test(q) && !q.includes('-')) {
            const result = findRangeForKey(q);
            const anchor = (result && result.type === 'range') ? result.key : q;
            window.location.href = baseUrl + '#' + anchor;
        } else {
             window.location.href = baseUrl + '#' + q;
        }
    }
});

// 6. Слушатель отправки формы поиска (для корректной подстановки диапазонов в URL)
document.addEventListener('submit', function(e) {
    if (e.target.id === 'searchForm') {
        const searchInput = document.getElementById('paliauto');
        if (!searchInput) return;

        const q = normalizeQuery(searchInput.value);
        if (!q) return;

        // Добавляем параметр reader для обычного сабмита формы (чтобы php его подхватил)
        const savedReader = localStorage.getItem("defaultReader");
        if (savedReader && savedReader !== 'st') {
            let hiddenReader = e.target.querySelector('input[name="reader"]');
            if (!hiddenReader) {
                hiddenReader = document.createElement('input');
                hiddenReader.type = 'hidden';
                hiddenReader.name = 'reader';
                e.target.appendChild(hiddenReader);
            }
            hiddenReader.value = savedReader;
        }

        if (/\d/.test(q) && !q.includes('-')) {
            const result = findRangeForKey(q);
            if (result && result.type === 'range') {
                e.preventDefault();
                
                let readerQuery = (savedReader && savedReader !== 'st') ? `&reader=${savedReader}` : '';
                
                // Делаем редирект с правильным параметром q, reader и якорем
                window.location.href = '?q=' + result.key + readerQuery + '#' + q;
            }
        }
    }
});



// ==========================================
// ГЛОБАЛЬНОЕ ИЗБРАННОЕ (FAVORITES API)
// ==========================================
const FAV_STORAGE_KEY = 'dg_favorites';

function getFavorites() {
    try { return JSON.parse(localStorage.getItem(FAV_STORAGE_KEY)) || []; } 
    catch (e) { return []; }
}

function isFavorite(slug) {
    // Прогоняем запрос через единые правила перед проверкой
    if (typeof formatSlug === 'function') {
        slug = formatSlug(slug);
    }
    const favs = getFavorites();
    return favs.some(fav => fav.slug === slug);
}


function toggleFavoriteGlobal(itemData) {
    if (!itemData || !itemData.slug) return false;

    itemData.slug = formatSlug(itemData.slug);
    if (itemData.id) itemData.id = formatSlug(itemData.id);

    const currentPath = window.location.pathname;
    
    
    const textRemoved = window.notEn ? "Удалено из избранного" : "Removed from favorites";
    const textSaved = window.notEn ? "Сохранено в избранное" : "Saved to favorites";

    let favs = getFavorites();
    const existingIndex = favs.findIndex(fav => fav.slug === itemData.slug);
    let isAdded = false;

    if (existingIndex !== -1) {
        favs.splice(existingIndex, 1); 
        if (typeof showBubbleNotification === 'function') showBubbleNotification(textRemoved);
    } else {
        itemData.timestamp = Date.now();
        favs.unshift(itemData); 
        isAdded = true;
        if (typeof showBubbleNotification === 'function') showBubbleNotification(textSaved);
    }

    localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(favs));
    
    // --- ИЗМЕНЕНО: Атомарная отправка избранного ---
    if (typeof syncFavoriteItemToCloud === 'function') {
        syncFavoriteItemToCloud(itemData, !isAdded); // Передаем флаг удаления
    }

    if (typeof window.refreshQuickModalData === 'function' && window.quickModalIsOpen) {
        window.refreshQuickModalData();
    }
    
    window.dispatchEvent(new CustomEvent('favoritesUpdated', { 
        detail: { slug: itemData.slug, isAdded: isAdded } 
    }));

    return isAdded;
}

// АВТО-СОХРАНЕНИЕ В ИСТОРИЮ ПРИ ОТКРЫТИИ ССЫЛКИ
document.addEventListener("DOMContentLoaded", () => {
    if (typeof addToSearchHistory === 'function') addToSearchHistory();
});

// === ЛЕНИВАЯ ЗАГРУЗКА QUICK MODAL (СТРОГО ПО КЛИКУ / ХОТКЕЮ) ===
(function() {
    window.isQuickModalScriptLoaded = false;
    let isQuickModalInitializing = false;

    // Создаем функцию-прокси (заглушку)
    window.toggleQuickModal = function() {
        // Если скрипт уже загружен, выходим (хотя заглушка перезапишется)
        if (window.isQuickModalScriptLoaded) return;

        if (isQuickModalInitializing) return;
        isQuickModalInitializing = true;

        // 1. Показываем визуальный лоадер (берем стили от словаря)
        let loadingEl = document.getElementById('quick-modal-loader');
        if (!loadingEl) {
            loadingEl = document.createElement('div');
            loadingEl.id = 'quick-modal-loader';
            loadingEl.className = 'dict-loading-indicator';
            
            loadingEl.textContent = window.notEn ? 'Загрузка меню...' : 'Loading menu...';
            document.body.appendChild(loadingEl);
            setTimeout(() => loadingEl.classList.add('show'), 10);
        }

        // 2. Скачиваем скрипт модального окна
        const script = document.createElement('script');
        script.src = "/assets/js/quickModal.js"; // Проверьте правильность пути!
        
        script.onload = () => {
            window.isQuickModalScriptLoaded = true;
            isQuickModalInitializing = false;
            
            // Убираем лоадер
            if (loadingEl) {
                loadingEl.classList.remove('show');
                setTimeout(() => loadingEl.remove(), 300);
            }

            // Вызываем РЕАЛЬНУЮ функцию, которая только что перезаписала эту заглушку
            if (typeof window.toggleQuickModal === 'function') {
                window.toggleQuickModal();
            }
        };
        
        script.onerror = () => {
            isQuickModalInitializing = false;
            console.error("Ошибка загрузки quickModal.js");
            if (loadingEl) loadingEl.remove();
        };
        
        document.head.appendChild(script);
    };

    // Авто-открытие через URL параметры (вызовет заглушку и загрузит скрипт)
    document.addEventListener("DOMContentLoaded", () => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('sacca') === 'true' || urlParams.get('action') === 'true') {
            setTimeout(() => {
                if (typeof window.toggleQuickModal === 'function') {
                    window.toggleQuickModal();
                }
            }, 300);
        }
    });
})();

// ==========================================
// УМНАЯ ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ FIREBASE (Local-First Architecture)
// ==========================================

let db = null;
let auth = null;
let googleProvider = null;

// Переменные для отписки от слушателей Firebase
let unsubSettings = null;
let unsubFavs = null;
let unsubHist = null;
let unsubProgress = null; 
let unsubSessionList = null; 
let unsubMySession = null;   

// АНОНИМНЫЙ ПАРСЕР УСТРОЙСТВА (С ПОЛНЫМ «ПАСПОРТОМ»)
window.getAnonymousDeviceName = function() {
    const ua = navigator.userAgent;
    let os = "Device";
    let browser = "Web";
    let model = "";

    // 1. Определение ОС и конкретной модели
    if (ua.indexOf("Win") !== -1) {
        os = "Windows";
    } else if (ua.indexOf("Mac") !== -1 && ua.indexOf("iPhone") === -1 && ua.indexOf("iPad") === -1) {
        os = "MacOS";
    } else if (ua.indexOf("Linux") !== -1 && ua.indexOf("Android") === -1) {
        os = "Linux";
    } else if (ua.indexOf("Android") !== -1) {
        os = "Android";
        // Извлекаем модель из User-Agent
        const androidMatch = ua.match(/Android\s[^;]+;\s([^;)]+)/);
        if (androidMatch && androidMatch[1]) {
            model = androidMatch[1].split(' Build/')[0].trim();
            // Маппинг брендов для чистоты отображения
            if (ua.indexOf("Samsung") !== -1 && !model.includes("Samsung")) model = "Samsung " + model;
            if (ua.indexOf("Xiaomi") !== -1 && !model.includes("Xiaomi")) model = "Xiaomi " + model;
            if (ua.indexOf("Redmi") !== -1 && !model.includes("Redmi")) model = "Redmi " + model;
            if (ua.indexOf("Pixel") !== -1 && !model.includes("Pixel")) model = "Google Pixel " + model;
        }
    } else if (ua.indexOf("iPhone") !== -1) {
        os = "iOS";
        model = "iPhone";
    } else if (ua.indexOf("iPad") !== -1) {
        os = "iOS";
        model = "iPad";
    }

    // 2. Определение браузера
    if (ua.indexOf("Edg/") !== -1) browser = "Edge";
    else if (ua.indexOf("Chrome/") !== -1) browser = "Chrome";
    else if (ua.indexOf("Firefox/") !== -1) browser = "Firefox";
    else if (ua.indexOf("Safari/") !== -1) browser = "Safari";

    // Возвращаем объект. В displayName больше нет кривой модели (типа "K").
    return {
        displayName: `${os} • ${browser}`,
        os: os,
        browser: browser,
        model: model, 
        raw: ua // Сырой User-Agent на всякий случай
    };
};


// УДАЛЕНИЕ ЧУЖОЙ СЕССИИ (Кнопка Крестик)
window.terminateRemoteSession = async function(sessionId) {
    
    
    // 1. Спрашиваем подтверждение
    const confirmMsg = window.notEn 
        ? "Вы уверены, что хотите принудительно завершить эту сессию? Устройство будет отключено от облака, а локальные данные на нем будут стерты." 
        : "Are you sure you want to forcibly terminate this session? The device will be disconnected and its local data will be wiped.";

    if (!confirm(confirmMsg)) return; // Если юзер нажал "Отмена" — прерываем

    const uid = getUid();
    if (!uid || !db) return;
    
    // 2. Выполняем удаление
    try {
        await db.collection("users").doc(uid).collection("sessions").doc(sessionId).delete();
        
        // 3. Показываем красивое уведомление об успехе
        if (typeof showBubbleNotification === 'function') {
            showBubbleNotification(window.notEn ? "Устройство отключено" : "Device disconnected");
        }
    } catch (e) { 
        console.error("Error terminating session", e); 
        if (typeof showBubbleNotification === 'function') {
            showBubbleNotification(window.notEn ? "❌ Ошибка при отключении" : "❌ Error disconnecting");
        }
    }
};


function getUid() {
    const user = auth ? auth.currentUser : null;
    return user ? user.uid : localStorage.getItem('syncPhraseId');
}

function sanitizeId(str) {
    return encodeURIComponent(str).replace(/\./g, '%2E');
}

function loadFirebaseScripts() {
    return new Promise((resolve) => {
        if (window.firebase) { resolve(); return; }
        const scripts = [
            "https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js",
            "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth-compat.js",
            "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore-compat.js"
        ];
        let loadedCount = 0;
        scripts.forEach(src => {
            const script = document.createElement('script');
            script.src = src; script.async = true; 
            script.onload = () => {
                loadedCount++;
                if (loadedCount === scripts.length) resolve();
            };
            document.head.appendChild(script);
        });
    });
}

// Делаем функцию глобальной, чтобы ее можно было вызвать при логине
window.initFirebase = async function() {
    try {
        await loadFirebaseScripts();
        if (firebase.apps.length) return;

        const response = await fetch('/config/sync-config.json?update=' + Date.now());
        if (!response.ok) throw new Error('Config not found');
        
        const firebaseConfig = await response.json();
        firebase.initializeApp(firebaseConfig);
        
        db = firebase.firestore();

        // 1. ВКЛЮЧАЕМ OFFLINE PERSISTENCE (Кэширование базы в браузере)
        try {
            await db.enablePersistence({
                synchronizeTabs: true
            });
        } catch (err) {
            if (err.code === 'failed-precondition') {
                console.warn('Firebase: Открыто несколько вкладок, кэширование активно в главной.');
            } else if (err.code === 'unimplemented') {
                console.warn('Firebase: Браузер не поддерживает offline-режим.');
            }
        }

        auth = firebase.auth();
        googleProvider = new firebase.auth.GoogleAuthProvider();

        auth.onAuthStateChanged((user) => {
            const phraseId = localStorage.getItem('syncPhraseId'); 
            const phraseRaw = localStorage.getItem('syncPhraseRaw'); 
            const uid = user ? user.uid : phraseId;
            
            // Запоминаем факт сессии для будущих перезагрузок страницы
            if (user) {
                localStorage.setItem('dg_cloud_session', 'true');
            }

            if (uid) {
                // 2. ПОДКЛЮЧАЕМ РЕАКТИВНЫЕ СЛУШАТЕЛИ
                setupCloudListeners(uid);
                // 3. ВКЛЮЧАЕМ НАБЛЮДАТЕЛЯ ЗА НАСТРОЙКАМИ ТОЛЬКО ТЕПЕРЬ
                if (typeof initSettingsObserver === 'function') initSettingsObserver();
            }

            if (typeof updateGlobalSyncButtons === 'function') updateGlobalSyncButtons(user, phraseId);
            if (typeof renderLoginPageUI === 'function') renderLoginPageUI(user, phraseRaw);
        });
        
    } catch (error) { console.error("Firebase Init Error:", error); }
};

// --- ОТЛОЖЕННЫЙ ЗАПУСК FIREBASE ---
// Инициализируем только если есть активная сессия (Google) или фраза
const hasPhrase = localStorage.getItem('syncPhraseId');
const hasCloudSession = localStorage.getItem('dg_cloud_session') === 'true';
if (hasPhrase || hasCloudSession) {
    window.initFirebase();
}
// ----------------------------------

function refreshSyncTimeUI() {
    localStorage.setItem('lastSyncTime', Date.now());
    if (typeof renderLoginPageUI === 'function') {
        const user = auth ? auth.currentUser : null;
        renderLoginPageUI(user, localStorage.getItem('syncPhraseRaw'));
    }
}

// === РЕАКТИВНЫЕ СЛУШАТЕЛИ (onSnapshot) ===
window.setupCloudListeners = function(uid) {
    if (!db || !uid) return;

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Очищаем локальные данные ДО активации слушателей,
    // если пользователь выбрал режим Overwrite в модальном окне.
    if (window.pendingOverwrite === true) {
        localStorage.removeItem('localSearchHistory');
        localStorage.removeItem('dg_favorites');
        localStorage.removeItem('dg_deleted_history');
        
        // Сбрасываем флаг сразу после удаления
        window.pendingOverwrite = false;
        
        if (typeof window.refreshQuickModalData === 'function') window.refreshQuickModalData();
    }

    if (unsubSettings) unsubSettings();
    if (unsubFavs) unsubFavs();
    if (unsubHist) unsubHist();
    if (unsubProgress) unsubProgress(); 

    const userRef = db.collection("users").doc(uid);

    // Слушатель Настроек
    unsubSettings = userRef.onSnapshot((doc) => {
        if (doc.metadata.hasPendingWrites) return; 

        if (doc.exists && doc.data().settings) {
            const cloudSettings = doc.data().settings;
            const cloudTime = doc.data().updatedAt ? doc.data().updatedAt.toMillis() : 0;
            const localTime = parseInt(localStorage.getItem('dg_localSettingsTimestamp') || '0', 10);

            if (localTime > cloudTime) return;

            let uiNeedsRefresh = false;
            for (const k in cloudSettings) {
                if (localStorage.getItem(k) !== cloudSettings[k]) {
                    window.dg_ignoreNextStorageEvent = true; 
                    localStorage.setItem(k, cloudSettings[k]);
                    uiNeedsRefresh = true;
                }
            }
            if (uiNeedsRefresh) window.dg_settingsChanged = false; 
        }
    });

    // Слушатель Избранного
    unsubFavs = userRef.collection("favorites").onSnapshot((snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;
        let localFavs = JSON.parse(localStorage.getItem('dg_favorites')) || [];
        let favMap = new Map();
        localFavs.forEach(f => favMap.set(f.slug, f)); 

        snapshot.docChanges().forEach((change) => {
            let cloudFav = change.doc.data();
            if (change.type === "added" || change.type === "modified") {
                if (cloudFav.fullText && cloudFav.search) {
                    const params = new URLSearchParams(cloudFav.search);
                    const savedId = params.get('saved_id');
                    if (savedId) localStorage.setItem(savedId, cloudFav.fullText);
                    delete cloudFav.fullText;
                }
                favMap.set(cloudFav.slug, cloudFav);
            }
            if (change.type === "removed") {
                if (cloudFav.search && cloudFav.search.includes('saved_id=')) {
                    const params = new URLSearchParams(cloudFav.search);
                    const savedId = params.get('saved_id');
                    if (savedId) localStorage.removeItem(savedId);
                }
                favMap.delete(cloudFav.slug);
            }
        });
        const finalFavs = Array.from(favMap.values()).sort((a, b) => b.timestamp - a.timestamp);
        localStorage.setItem('dg_favorites', JSON.stringify(finalFavs));
        if (typeof window.refreshQuickModalData === 'function' && window.quickModalIsOpen) window.refreshQuickModalData();
    });

    // Слушатель Истории
    unsubHist = userRef.collection("history").onSnapshot((snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;
        let localHist = JSON.parse(localStorage.getItem('localSearchHistory')) || [];
        let histMap = new Map();
        localHist.forEach(h => {
            const baseKey = /\d/.test(h[0]) ? h[0].split(/\s+/)[0] : h[0];
            histMap.set(baseKey, { key: h[0], url: h[1], timestamp: new Date(h[2]).getTime() });
        });

        snapshot.docChanges().forEach((change) => {
            const cloudHist = change.doc.data();
            const baseKey = /\d/.test(cloudHist.key) ? cloudHist.key.split(/\s+/)[0] : cloudHist.key;
            if (change.type === "added" || change.type === "modified") {
                const cloudTime = cloudHist.updatedAt && cloudHist.updatedAt.toDate 
                    ? cloudHist.updatedAt.toDate().getTime() 
                    : (new Date(cloudHist.timestamp).getTime() || Date.now());
                histMap.set(baseKey, { ...cloudHist, timestamp: cloudTime });
            }
            if (change.type === "removed") histMap.delete(baseKey);
        });

        const finalHist = Array.from(histMap.values())
            .sort((a, b) => b.timestamp - a.timestamp)
            .map(h => [h.key, h.url, new Date(h.timestamp).toISOString()])
            .slice(0, 8400);
        localStorage.setItem('localSearchHistory', JSON.stringify(finalHist));
        if (typeof window.refreshQuickModalData === 'function' && window.quickModalIsOpen) window.refreshQuickModalData();
    });

    // Слушатель Прогресса
    unsubProgress = userRef.collection("progress").onSnapshot((snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;
        let cloudProgressData = JSON.parse(localStorage.getItem('dg_cloudProgress')) || {};
        let hasChanges = false;
        snapshot.docChanges().forEach((change) => {
            const cloudProg = change.doc.data();
            const slug = cloudProg.slug || change.doc.id;
            if (change.type === "added" || change.type === "modified") {
                cloudProgressData[slug] = cloudProg;
                hasChanges = true;
            }
            if (change.type === "removed") {
                delete cloudProgressData[slug];
                hasChanges = true;
            }
        });
        if (hasChanges) localStorage.setItem('dg_cloudProgress', JSON.stringify(cloudProgressData));
    });

    // Сессии
    let localSessionId = localStorage.getItem('dg_session_id');
    if (!localSessionId) {
        localSessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        localStorage.setItem('dg_session_id', localSessionId);
    }
    const mySessionRef = userRef.collection("sessions").doc(localSessionId);
    const deviceData = window.getAnonymousDeviceName();
    mySessionRef.set({
        deviceName: deviceData.displayName,
        deviceMeta: deviceData,
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    if (typeof unsubMySession !== 'undefined' && unsubMySession) unsubMySession();
    unsubMySession = mySessionRef.onSnapshot((doc) => {
        if (doc.metadata.hasPendingWrites) return;
        if (!doc.exists && localStorage.getItem('dg_cloud_session') === 'true') {
            triggerSelfDestruct(); 
        }
    });
};

// === БЛОКПОСТ: ПРОВЕРКА СЕССИИ ===
window.verifySessionActive = async function() {
    const uid = getUid();
    const localSessionId = localStorage.getItem('dg_session_id');
    
    if (!uid || !localSessionId || !db) return true;

    try {
        const sessionRef = db.collection("users").doc(uid).collection("sessions").doc(localSessionId);
        const doc = await sessionRef.get();
        
        if (doc.exists) {
            return true; 
        } else {
            if (typeof triggerSelfDestruct === 'function') triggerSelfDestruct();
            return false; 
        }
    } catch (e) {
        return true; 
    }
};

// === ПРОТОКОЛ САМОУНИЧТОЖЕНИЯ ===
window.triggerSelfDestruct = async function(reason = "terminated") {
    console.warn("Протокол самоуничтожения активирован.");
    
    if (typeof unsubSettings !== 'undefined' && unsubSettings) unsubSettings();
    if (typeof unsubFavs !== 'undefined' && unsubFavs) unsubFavs();
    if (typeof unsubHist !== 'undefined' && unsubHist) unsubHist();
    if (typeof unsubProgress !== 'undefined' && unsubProgress) unsubProgress(); 
    if (window.unsubSessionList) window.unsubSessionList();
    if (typeof unsubMySession !== 'undefined' && unsubMySession) unsubMySession();

    if (typeof auth !== 'undefined' && auth && auth.currentUser) await auth.signOut();

    const savedLang = localStorage.getItem('siteLanguage');
    const savedTheme = localStorage.getItem('theme');
    
    localStorage.clear(); 
    
    if (savedLang) localStorage.setItem('siteLanguage', savedLang);
    if (savedTheme) localStorage.setItem('theme', savedTheme);

    if (typeof showBubbleNotification === 'function') {
        
        let msg = window.notEn ? "Сессия удалена. Данные очищены." : "Session terminated. Data wiped.";
        
        // Кастомное сообщение, если аккаунт удален целиком
        if (reason === "deleted") {
            msg = window.notEn ? "Аккаунт был удален. Доступ закрыт." : "Account deleted. Access revoked.";
        }
        
        showBubbleNotification(msg, 5000);
    }

    setTimeout(() => {
        window.location.reload();
    }, 1500);
};

// === АТОМАРНЫЕ ЗАПИСИ В ОБЛАКО ===
window.syncSettingsToCloud = async function() {
    if (!(await verifySessionActive())) return;
    if (!db || !getUid()) return;
    const uid = getUid();
    
    let settingsToSave = { ...window.dg_pendingSettingsUpdates };

    if (window.dg_deletedKeys && window.dg_deletedKeys.size > 0) {
        window.dg_deletedKeys.forEach(key => {
            if (!settingsToSave.hasOwnProperty(key)) {
                settingsToSave[key] = firebase.firestore.FieldValue.delete();
            }
        });
    }

    // Если изменений нет, просто обновляем локальный штамп времени и выходим
    if (Object.keys(settingsToSave).length === 0) {
        if (typeof refreshSyncTimeUI === 'function') refreshSyncTimeUI();
        return;
    }

    try {
        await db.collection("users").doc(uid).set({
            settings: settingsToSave,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        window.dg_pendingSettingsUpdates = {};
        if (window.dg_deletedKeys) window.dg_deletedKeys.clear();
        window.dg_settingsChanged = false;
        
        if (typeof refreshSyncTimeUI === 'function') refreshSyncTimeUI();
    } catch (e) { 
        console.error("Settings Sync Error:", e); 
    }
};

window.syncFavoriteItemToCloud = async function(favData, isDeleted = false) {
    // ПРОПУСКНОЙ ПУНКТ:
    if (!(await verifySessionActive())) return;

    if (!db || !getUid()) return;
    const uid = getUid();
    const docId = sanitizeId(favData.slug);
    const docRef = db.collection("users").doc(uid).collection("favorites").doc(docId);

    try {
        if (isDeleted) {
            await docRef.delete();
        } else {
            let cloudData = { ...favData };
            
            // АТОМАРНОСТЬ: Если есть сохраненный длинный текст, прикрепляем его к документу
            if (cloudData.search && cloudData.search.includes('saved_id=')) {
                const params = new URLSearchParams(cloudData.search);
                const savedId = params.get('saved_id');
                if (savedId) {
                    const localText = localStorage.getItem(savedId);
                    if (localText) cloudData.fullText = localText; // Текст летит вместе с Избранным
                }
            }

            await docRef.set({ 
                ...cloudData, 
                updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
            }, { merge: true });
        }
        if (typeof refreshSyncTimeUI === 'function') refreshSyncTimeUI();
    } catch (e) { console.error("Fav Sync Error:", e); }
};


window.syncHistoryItemToCloud = async function(key, url, timestamp, isDeleted = false) {
    // ПРОПУСКНОЙ ПУНКТ:
    if (!(await verifySessionActive())) return;

    if (!db || !getUid()) return;
    const uid = getUid();
    const baseKey = /\d/.test(key) ? key.split(/\s+/)[0] : key;
    const docId = sanitizeId(baseKey);
    const docRef = db.collection("users").doc(uid).collection("history").doc(docId);

    try {
        if (isDeleted) {
            await docRef.delete();
        } else {
            await docRef.set({ 
                key, url, timestamp,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        if (typeof refreshSyncTimeUI === 'function') refreshSyncTimeUI();
    } catch (e) { console.error("History Sync Error:", e); }
};

// Функция отправки Прогресса чтения
window.syncProgressItemToCloud = async function(slug) {
    // ПРОПУСКНОЙ ПУНКТ:
    if (!(await verifySessionActive())) return;

    if (!db || !getUid() || !slug) return;
    
    const localProgress = JSON.parse(localStorage.getItem('dg_suttaProgress')) || {};
    const progressData = localProgress[slug];
    
    if (!progressData) return;

    const uid = getUid();
    const docId = sanitizeId(slug);
    const docRef = db.collection("users").doc(uid).collection("progress").doc(docId);

    try {
        await docRef.set({ 
            ...progressData,
            slug: slug,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) { console.error("Progress Sync Error:", e); }
};


window.clearCloudHistory = async function() {
    if (!db || !getUid()) return;
    const uid = getUid();
    try {
        const snap = await db.collection("users").doc(uid).collection("history").get();
        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        refreshSyncTimeUI();
    } catch (e) { console.error("Error clearing history:", e); }
};

// === УТИЛИТЫ И АВТОРИЗАЦИЯ ===
window.forceSyncNow = async function() {
    if (!(await verifySessionActive())) return;
    if (!db || !getUid()) return;

    document.querySelectorAll('.fa-rotate').forEach(icon => icon.classList.add('fa-spin'));
    document.querySelectorAll('#btn-sync-now img').forEach(icon => icon.classList.add('custom-spin'));

    try {
        // Синхронизируем настройки, если они были изменены
        if (window.dg_settingsChanged) {
            await syncSettingsToCloud();
        }

        // Прогресс текущей страницы
        const urlParams = new URLSearchParams(window.location.search);
        const qParam = urlParams.get('q');
        if (qParam) {
            let currentSlug = String(qParam).trim().toLowerCase();
            if (String(qParam).trim().startsWith('memo_')) currentSlug = String(qParam).trim();
            await window.syncProgressItemToCloud(currentSlug);
        }

        // Ждем немного для визуального эффекта и гарантированного завершения
        await new Promise(res => setTimeout(res, 500));
        
        // ОБЯЗАТЕЛЬНО обновляем время в конце, чтобы пользователь видел успех
        if (typeof refreshSyncTimeUI === 'function') refreshSyncTimeUI();

    } catch (error) { 
        console.error("Sync error:", error); 
    } finally {
        document.querySelectorAll('.fa-rotate').forEach(icon => icon.classList.remove('fa-spin'));
        document.querySelectorAll('#btn-sync-now img').forEach(icon => icon.classList.remove('custom-spin'));
    }
};

window.syncLoginGoogle = async function() {
    if (!window.firebase) await window.initFirebase(); // Подгружаем на лету, если еще нет
    if (!auth) return;
    try { 
        await auth.signInWithPopup(googleProvider);
        localStorage.setItem('dg_cloud_session', 'true'); // Ставим флаг сессии
    } 
    catch (error) { console.error("Login Error:", error); }
};

window.syncEnablePhrase = async function(rawPhrase, hashedId) {
    localStorage.setItem('syncPhraseRaw', rawPhrase);
    localStorage.setItem('syncPhraseId', hashedId);
    localStorage.setItem('dg_cloud_session', 'true'); // Флаг тоже полезен
    
    if (!window.firebase) {
        await window.initFirebase(); // Загрузит скрипты и сам подхватит фразу из localStorage
    } else {
        setupCloudListeners(hashedId);
        if (typeof initSettingsObserver === 'function') initSettingsObserver();
    }
    
    if (typeof updateGlobalSyncButtons === 'function') updateGlobalSyncButtons(null, hashedId);
    if (typeof renderLoginPageUI === 'function') renderLoginPageUI(null, rawPhrase);
};

window.syncLogout = async function() {
    // 1. Отключаем все слушатели
    if (typeof unsubSettings !== 'undefined' && unsubSettings) unsubSettings();
    if (typeof unsubFavs !== 'undefined' && unsubFavs) unsubFavs();
    if (typeof unsubHist !== 'undefined' && unsubHist) unsubHist();
    if (typeof unsubProgress !== 'undefined' && unsubProgress) unsubProgress(); 
    if (window.unsubSessionList) window.unsubSessionList();
    if (typeof unsubMySession !== 'undefined' && unsubMySession) unsubMySession();

    const uid = getUid();
    const localSessionId = localStorage.getItem('dg_session_id');

    // 2. УДАЛЯЕМ СЕССИЮ ИЗ БАЗЫ при штатном выходе (чтобы не оставлять мусор)
    if (uid && db && localSessionId) {
        try { 
            await db.collection("users").doc(uid).collection("sessions").doc(localSessionId).delete(); 
        } catch (e) {}
    }

    // 3. Выходим из аккаунта и чистим ключи
    if (typeof auth !== 'undefined' && auth && auth.currentUser) await auth.signOut();
    localStorage.removeItem('syncPhraseId');
    localStorage.removeItem('syncPhraseRaw');
    localStorage.removeItem('lastSyncTime');
    localStorage.removeItem('dg_cloud_session'); 
    localStorage.removeItem('dg_cloudProgress');
    localStorage.removeItem('dg_session_id'); // <-- Удаляем локальный ID сессии
    
    // 4. Обновляем интерфейс
    if (typeof renderLoginPageUI === 'function') renderLoginPageUI(null, null);
    if (typeof updateGlobalSyncButtons === 'function') updateGlobalSyncButtons(null, null);
};

window.syncDeleteData = async function() {
    const uid = typeof getUid === 'function' ? getUid() : null;
    const currentDb = typeof db !== 'undefined' ? db : window.db;
    

    if (uid && currentDb) {
        try {
            // Меняем текст кнопки, так как физическое удаление может занять 1-2 секунды
            const btnDelete = document.getElementById('lbl-delete');
            if (btnDelete) btnDelete.textContent = window.notEn ? "Стираем базу..." : "Wiping data...";

            // Функция физического пакетного удаления коллекции (у Firestore лимит 500 за раз)
            const deleteCollection = async (colName) => {
                const ref = currentDb.collection("users").doc(uid).collection(colName);
                const snap = await ref.get();
                if (snap.empty) return;
                
                let batch = currentDb.batch();
                let count = 0;
                for (const doc of snap.docs) {
                    batch.delete(doc.ref);
                    count++;
                    if (count === 500) {
                        await batch.commit();
                        batch = currentDb.batch();
                        count = 0;
                    }
                }
                if (count > 0) await batch.commit();
            };

            // 1. Уничтожаем все вложенные коллекции истории, избранного, прогресса и сессий
            await Promise.all([
                deleteCollection("history"),
                deleteCollection("favorites"),
                deleteCollection("progress"),
                deleteCollection("sessions")
            ]);

            // 2. Уничтожаем сам корневой документ (с настройками)
            await currentDb.collection("users").doc(uid).delete();

            // 3. Если это Google-аккаунт, удаляем и его
            const user = typeof auth !== 'undefined' && auth ? auth.currentUser : null;
            if (user) await user.delete(); 

        } catch (error) { 
            console.error("Delete Error:", error); 
        }
    }
    
    // --- ЛОКАЛЬНАЯ ОЧИСТКА И ВЫХОД ---
    if (typeof auth !== 'undefined' && auth && auth.currentUser) await auth.signOut();
    
    const keysToRemove = ['syncPhraseId', 'syncPhraseRaw', 'lastSyncTime', 'dg_cloud_session', 'dg_cloudProgress', 'dg_session_id'];
    keysToRemove.forEach(k => localStorage.removeItem(k));
    
    if (typeof renderLoginPageUI === 'function') renderLoginPageUI(null, null);
    if (typeof updateGlobalSyncButtons === 'function') updateGlobalSyncButtons(null, null);
};

window.updateGlobalSyncButtons = function(user, phraseId) {
    
    const promoBtn = document.getElementById('global-btn-login-promo');
    const syncBtn = document.getElementById('global-btn-sync-now');
    
    if (promoBtn && syncBtn) {
        promoBtn.innerHTML = window.notEn ? '<i class="fa-solid fa-cloud"></i> Включить облако' : '<i class="fa-solid fa-cloud"></i> Enable Sync';
        syncBtn.innerHTML = window.notEn ? '<i class="fa-solid fa-rotate"></i> Синхронизировать' : '<i class="fa-solid fa-rotate"></i> Sync Data';
        promoBtn.style.display = (user || phraseId) ? 'none' : 'inline-block';
        syncBtn.style.display = (user || phraseId) ? 'inline-block' : 'none';
    }
};

// ==========================================
// БЕЗОПАСНЫЙ НАБЛЮДАТЕЛЬ ЗА НАСТРОЙКАМИ (ОТЛОЖЕННЫЙ ЗАПУСК)
// ==========================================
window.dg_settingsChanged = false; 
window.dg_ignoreNextStorageEvent = false;
window.dg_deletedKeys = new Set(); // Очередь ключей на удаление из облака
window.dg_pendingSettingsUpdates = {}; // Очередь атомарных изменений (дифф)
let isObserverInitialized = false;

window.initSettingsObserver = function() {
    if (isObserverInitialized) return;
    isObserverInitialized = true;

    const originalSetItem = localStorage.setItem;
    const originalRemoveItem = localStorage.removeItem;
    const originalClear = localStorage.clear;
    
    // Добавлены firestore_ и firebase_ в исключения
    const ignoreList = ['DataTables_', 'localSearchHistory', 'lastSyncTime', 'syncPhrase', 'dg_', 'firebase_', 'firestore_'];

    localStorage.setItem = function(key, value) {
        // Если данные пришли из облака (стоит флаг), просто пишем и снимаем флаг
        if (window.dg_ignoreNextStorageEvent) {
            originalSetItem.apply(this, arguments);
            window.dg_ignoreNextStorageEvent = false; 
            return;
        }

        const isImportant = !ignoreList.some(prefix => key.startsWith(prefix));
        
        if (isImportant && localStorage.getItem(key) !== String(value)) {
            window.dg_settingsChanged = true;
            window.dg_deletedKeys.delete(key);
            
            // 1. АТОМАРНОСТЬ: Собираем только измененные ключи
            window.dg_pendingSettingsUpdates[key] = value; 
            
            // 2. ЗАЩИТА (Мастер): Ставим печать времени. Облако не перезапишет это старьем
            originalSetItem.apply(this, ['dg_localSettingsTimestamp', String(Date.now())]);
        }
        
        originalSetItem.apply(this, arguments);
    };

    localStorage.removeItem = function(key) {
        const isImportant = !ignoreList.some(prefix => key.startsWith(prefix));
        if (isImportant && localStorage.getItem(key) !== null) {
            window.dg_settingsChanged = true;
            window.dg_deletedKeys.add(key);
            originalSetItem.apply(this, ['dg_localSettingsTimestamp', String(Date.now())]);
        }
        originalRemoveItem.apply(this, arguments);
    };

    localStorage.clear = function() {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const isImportant = !ignoreList.some(prefix => key.startsWith(prefix));
            if (isImportant) {
                window.dg_deletedKeys.add(key);
            }
        }
        window.dg_settingsChanged = true;
        originalSetItem.apply(this, ['dg_localSettingsTimestamp', String(Date.now())]);
        originalClear.apply(this, arguments);
    };
};


// ==========================================
// PWA INSTALL BANNER LOGIC
// ==========================================
(function initGlobalPwa() {
    let deferPrompt = null;
    let banner = null;
    const pwaBannerShownKey = 'pwaBannerShown';
    const targetVisitForPWApopup = 9;

    function getLanguage() {
        const path = window.location.pathname;
        return (path.startsWith('/ru/') || path.startsWith('/r/')) ? 'ru' : 'en';
    }

    function createPwaBanner() {
        if (document.getElementById('pwa-banner')) return;
        
        const bannerHTML = `
            <div id="pwa-banner" class="pwa-install hidden">
                <img src="/assets/img/icon-192x192.png" alt="App Icon" class="icon">
                <div class="text">
                    <h2 class="pwa-title">Install Dhamma.Gift</h2>
                    <p class="pwa-description">Add to home screen for quick access</p>
                </div>
                <div class="actions">
                    <button id="installBtn" class="pwa-button">Install</button>
                    <button id="closePwaBanner">✕</button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', bannerHTML);
        
        banner = document.getElementById('pwa-banner');
        
        document.getElementById('installBtn').addEventListener('click', async () => {
            if (deferPrompt) {
                try {
                    deferPrompt.prompt();
                    const { outcome } = await deferPrompt.userChoice;
                    if (outcome === 'accepted') hidePwaBanner();
                } catch (error) {
                    console.error('Ошибка при установке PWA:', error);
                } finally {
                    deferPrompt = null;
                }
            }
        });

        document.getElementById('closePwaBanner').addEventListener('click', hidePwaBanner);
    }

    function hidePwaBanner() {
        if (banner) {
            banner.classList.add('hidden');
            localStorage.setItem(pwaBannerShownKey, 'true');
        }
    }

    function localizePwaBanner() {
        if (!banner) return;
        const texts = {
            ru: {
                title: 'Установить Dhamma.Gift',
                description: 'Добавить на главный экран для быстрого доступа',
                installBtn: 'Установить'
            },
            en: {
                title: 'Install Dhamma.Gift',
                description: 'Add to home screen for quick access',
                installBtn: 'Install'
            }
        };
        
        const currentTexts = texts[getLanguage()] || texts.en;
        banner.querySelector('.pwa-title').textContent = currentTexts.title;
        banner.querySelector('.pwa-description').textContent = currentTexts.description;
        banner.querySelector('.pwa-button').textContent = currentTexts.installBtn;
    }

    // Слушаем событие глобально
    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('beforeinstallprompt event triggered');
        e.preventDefault();
        deferPrompt = e;
        
        const visitCount = parseInt(localStorage.getItem('visitCount') || '0', 10);
        const alreadyShown = localStorage.getItem(pwaBannerShownKey);
        
        // Показываем баннер только если достигнут таргет визитов и баннер не закрывали ранее
        if (visitCount >= targetVisitForPWApopup && !alreadyShown) {
            createPwaBanner();
            localizePwaBanner();
            banner.classList.remove('hidden');
        }
    });
})();

(function checkAndLoadUiHelper() {
    // Проверяем, выполнены ли уже все задачи (подсказки, хайлайты, баннер PWA)
    const hintRead = localStorage.getItem('hintShown_read_mode');
    const hintResult = localStorage.getItem('hintShown_result_mode');
    const hlMain = localStorage.getItem('highlighted_main');
    const hlRead = localStorage.getItem('highlighted_read');
    const hlResult = localStorage.getItem('highlighted_result');
    const pwaShown = localStorage.getItem('PWAinstallMessage');

    const allTasksDone = hintRead && hintResult && hlMain && hlRead && hlResult && pwaShown;

    // Грузим скрипт, если остались непоказанные подсказки.
    // Проверку visitGlobal <= 13 отсюда убрали, так как uihelp.js сам 
    // проверяет нужные счетчики внутри себя перед показом элементов.
    if (!allTasksDone) {
        const script = document.createElement('script');
        script.src = '/assets/js/uihelp.js';
        script.defer = true;
        document.head.appendChild(script);
    }
})();


// === Умная и легкая подсветка элементов по хешу ===
function applyHashHighlights() {
    const hash = window.location.hash;
    
    // РАННИЙ ВЫХОД: если хеша нет или в нем нет запятой — ничего не делаем (0 нагрузки)
    if (!hash || !hash.includes(',')) return;

    const ids = hash.substring(1).split(',');

    ids.forEach(id => {
        let attempts = 0;
        // Легкий поллинг на случай, если элемент рендерится с задержкой (веб-компоненты)
        const timer = setInterval(() => {
            const el = document.getElementById(id);
            if (el) {
                // Вешаем CSS-класс с анимацией
                el.classList.add('dg-temp-blink');
                
                // Снимаем класс после завершения анимации (3 цикла по 0.8с = 2.4с)
                setTimeout(() => {
                    el.classList.remove('dg-temp-blink');
                }, 2500);
                
                clearInterval(timer); // Элемент найден, останавливаем поиск
            }
            
            // Если за 4.5 секунды (15 попыток) элемента нет — сдаемся
            if (++attempts > 15) clearInterval(timer);
        }, 300);
    });
}

// Запускаем при загрузке страницы
if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", applyHashHighlights);
} else {
    applyHashHighlights();
}

// Запускаем при клике по ссылке без перезагрузки страницы
window.addEventListener('hashchange', applyHashHighlights);

// ==========================================
// АВТОМАТИЧЕСКАЯ ЗАГРУЗКА AUTOPALI
// ==========================================
(function autoLoadAutopali() {
    // Проверяем, не подключен ли скрипт уже напрямую в HTML
    if (!document.querySelector('script[src*="autopali.js"]')) {
        const script = document.createElement('script');
        script.src = "/assets/js/autopali.js";
        script.defer = true;
        document.head.appendChild(script);
    }
})();

// Портировано из легаси settings.js (getSlug/get4ntUrl) — этот override был скопирован раньше,
// чем они появились в легаси, поэтому кнопка "Сравнить" в контекстном меню ридера (common.js,
// sm-compare) молча ничего не делала: get4ntUrl была undefined. Копия верна, ничего внутри не
// менялось.
function getSlug(slug = null) {
    if (slug) return slug.trim().toLowerCase();

    return (
        document.querySelector('#paliauto')?.value.trim() ||
        document.querySelector('input[name="q"]')?.value.trim() ||
        new URLSearchParams(location.search).get('q')?.trim() ||
        null
    )?.toLowerCase();
}

function get4ntUrl(slug = null) {
    slug = getSlug(slug);
    if (!slug) return null;

    const basePath = "/4nt";

    // =========================================================
    // 1. ЛОГИКА ДЛЯ ВИНАИ (Vinaya)
    // =========================================================

    // Словарь для преобразования коротких имен в полные имена папок 4nt
    const vinayaFolderMap = {
        // Параджика (Parajika)
        "bu-pj": "pli-tv-bu-vb-pj",
        "bi-pj": "pli-tv-bi-vb-pj",

        // Сангхадисеса (Sanghadisesa)
        "bu-ss": "pli-tv-bu-vb-ss",
        "bi-ss": "pli-tv-bi-vb-ss",

        // Анията (Aniyata)
        "bu-ay": "pli-tv-bu-vb-ay",
        "bi-ay": "pli-tv-bi-vb-ay",

        // Ниссаггия Пачиттия (Nissaggiya Pacittiya)
        "bu-np": "pli-tv-bu-vb-np",
        "bi-np": "pli-tv-bi-vb-np",

        // Пачиттия (Pacittiya)
        "bu-pc": "pli-tv-bu-vb-pc",
        "bi-pc": "pli-tv-bi-vb-pc",
        "bu-vb-pc": "pli-tv-bu-vb-pc", // Оставляем на случай, если уже приходит такой формат
        "bi-vb-pc": "pli-tv-bi-vb-pc",

        // Патидесания (Patidesaniya)
        "bu-pd": "pli-tv-bu-vb-pd",
        "bi-pd": "pli-tv-bi-vb-pd",

        // Секхия (Sekhiya)
        "bu-sk": "pli-tv-bu-vb-sk",
        "bi-sk": "pli-tv-bi-vb-sk",

        // Адхикарана-саматха (Adhikarana-samatha)
        "bu-as": "pli-tv-bu-vb-as",
        "bi-as": "pli-tv-bi-vb-as",
        "bu-vb-as": "pli-tv-bu-vb-as",
        "bi-vb-as": "pli-tv-bi-vb-as",

        // Патимоккха (Patimokkha)
        "bu-pm": "pli-tv-bu-pm",
        "bupm": "pli-tv-bu-pm",
        "bi-pm": "pli-tv-bi-pm",
        "bipm": "pli-tv-bi-pm",

        // Кхандхака и Паривара
        "pvr": "pli-tv-pvr",
        "kd": "pli-tv-kd"
    };

    let vinayaBook = "";
    let anchorBase = slug;

    // Вариант А: Slug уже нормализован вашей функцией parseSlug и начинается с "pli-tv-"
    if (slug.startsWith("pli-tv-")) {
        // 1. Для Patimokkha, Pacittiya, Aniyata/Sekhiya (цифры правила идут после, в якоре)
        const matchVb = slug.match(/^(pli-tv-(?:bu|bi)-(?:vb-)?(?:pc|as|pm))/);
        if (matchVb) {
            vinayaBook = matchVb[1]; // например, "pli-tv-bu-vb-pc"
        } else {
            // 2. Для Khandhaka и Parivara, где цифра может быть частью имени папки (как в примере pli-tv-pvr15)
            const matchKdPvr = slug.match(/^(pli-tv-(?:pvr|kd)\d*)/);
            if (matchKdPvr) {
                vinayaBook = matchKdPvr[1]; // например, "pli-tv-pvr15"
            } else {
                // 3. Запасной вариант: берем все буквы и дефисы до первой цифры
                const matchFallback = slug.match(/^(pli-tv-[a-z-]+)/);
                if (matchFallback) {
                    vinayaBook = matchFallback[1];
                }
            }
        }
    }
    // Вариант Б: Slug короткий (например, "bu-pc34" или "bupm227")
    else {
        for (const [shortKey, fullFolder] of Object.entries(vinayaFolderMap)) {
            if (slug.startsWith(shortKey)) {
                vinayaBook = fullFolder;
                // Заменяем короткое имя на полное для формирования корректного якоря
                // Например: "bu-pc34" -> "pli-tv-bu-vb-pc34"
                anchorBase = slug.replace(shortKey, fullFolder);
                break;
            }
        }
    }

    // Если мы успешно распознали Винаю, формируем специальный URL и сразу возвращаем его
    if (vinayaBook) {
        return `${basePath}/vin/tv/${vinayaBook}/index.html#${anchorBase}`;
    }

    // =========================================================
    // 2. СУЩЕСТВУЮЩАЯ ЛОГИКА ДЛЯ СУТТ (Nikayas)
    // =========================================================
    const slugParts = slug.match(/^([a-z]+)(\d*)/);
    if (!slugParts) return null;

    const book = slugParts[1];
    const firstNum = slugParts[2];

    if (book === "dn" || book === "mn") {
//        return `${basePath}/${book}/#${slug}`;
          return `${basePath}/${book}/${slug}`;

    }

    if (book === "sn" || book === "an") {
        return `${basePath}/${book}/${book}${firstNum}/#${slug}`;
    }

    if (["ud", "iti", "snp", "dhp", "thig", "thag", "kp"].includes(book)) {
        return `${basePath}/kn/${book}/#${slug}`;
    }

    return null;
}
