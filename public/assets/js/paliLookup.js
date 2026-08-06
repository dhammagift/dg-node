const isMobileLike = (
            (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) ||
                        (window.innerWidth <= 768)
        );
const isLocalhost = window.location.href.includes('localhost') || window.location.href.includes('127.0.0.1');


const currentHost = window.location.origin; 

function getEffectiveTheme() {
  if (localStorage.theme === 'light' || localStorage.theme === 'dark') {
    return localStorage.theme;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

const newWindowWidth = 500;
const newWindowHeight = 500;

const screenWidth = window.screen.availWidth;
const screenHeight = window.screen.availHeight;

const newWindowleft = screenWidth - newWindowWidth - 30; 
const newWindowTop = screenHeight - newWindowHeight - 50; 

const popupFeatures = `width=${newWindowWidth},height=${newWindowHeight},left=${newWindowleft},top=${newWindowTop},scrollbars=yes,resizable=yes`;

let dictionaryWindow = null;

function openDictionaryWindow(url) {
if (isLocalhost && externalDict === true) {
    window.location.href = url;
    return;
}
  dictionaryWindow = window.open(url, 'dictionaryPopup', popupFeatures);

  if (dictionaryWindow) {
    dictionaryWindow.focus();
  }
}

if (typeof initCopyNotification === 'undefined') {
    function initCopyNotification() {
        if (!document.getElementById('bubbleNotification')) {
            const bubble = document.createElement('div');
            bubble.id = 'bubbleNotification';
            bubble.className = 'bubble-notification';
            document.body.appendChild(bubble);
        }
    }
        initCopyNotification();
}

if (typeof showBubbleNotification === 'undefined') {
     function showBubbleNotification(text) {
        const bubble = document.getElementById('bubbleNotification');
        if (!bubble) return;

        bubble.textContent = text;
        bubble.classList.add('show');
        bubble.style.opacity = '1';

        setTimeout(() => {
            bubble.style.opacity = '0';
        }, 2000);
    }
}

const siteLanguage = localStorage.getItem('siteLanguage');
let savedDict = localStorage.getItem('selectedDict');

// СЛУШАТЕЛЬ СМЕНЫ ЯЗЫКА 
// СЛУШАТЕЛЬ СМЕНЫ ЯЗЫКА ИЗ IFRAME
window.addEventListener('message', function(event) {
    if (event.origin !== 'https://dict.dhamma.gift') return;

    if (event.data && event.data.action === 'dg_language_changed') {
        const newLang = event.data.lang; 
        
        // ВАЖНО: Обновляем язык на лету
        window.isRu = (newLang === 'ru');
        localStorage.setItem('siteLanguage', newLang);

        let currentSavedDict = localStorage.getItem('selectedDict') || "standalone";
        let newDict = currentSavedDict;

        if (newLang === 'ru') {
            if (currentSavedDict === 'standalone') newDict = 'standaloneru';
            else if (currentSavedDict === 'newwindow') newDict = 'newwindowru';
        } else if (newLang === 'en') {
            if (currentSavedDict === 'standaloneru') newDict = 'standalone';
            else if (currentSavedDict === 'newwindowru') newDict = 'newwindow';
        }
        
        // Вызываем функцию всегда, чтобы сбросить кэш и применить новые URL
        applyDictConfig(newDict);
    }
});


function getSelectedText() {
    const selection = window.getSelection();
    return selection ? selection.toString().trim() : '';
}

function isSelectionWithinElement(element) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;

    const range = selection.getRangeAt(0);
    return element.contains(range.commonAncestorContainer);
}

function savePopupState() {
    if (!popupElements) return;
    localStorage.setItem('popupWidth', popupElements.popup.style.width);
    localStorage.setItem('popupHeight', popupElements.popup.style.height);
    localStorage.setItem('popupTop', popupElements.popup.style.top);
    localStorage.setItem('popupLeft', popupElements.popup.style.left);
}

if (savedDict) {
    savedDict = savedDict.toLowerCase();
} else if (window.location.pathname.includes('/r/') ||
           window.location.pathname.includes('/ml/') ||
           window.location.pathname.includes('/ru/')) {
    savedDict = "standaloneru";
} else {
    savedDict = "standalone";
}

const userSelectedDict = localStorage.getItem('selectedDict');

if (window.location.search.includes('script=devanagari') || window.location.pathname.includes('/d/')) {
    if (!userSelectedDict) {
        savedDict = "dpdfull";
    }
}

function createDictSearchUrl(word) {
    if (isLocalhost || !navigator.onLine) {
        const isAndroid = /Android/i.test(navigator.userAgent);
        return isAndroid
            ? `dttp://app.dicttango/WordLookup?word=${encodeURIComponent(word)}`
            : `goldendict://${encodeURIComponent(word)}`;
    }
     const theme = getEffectiveTheme();   
     return `https://dict.dhamma.gift/${savedDict.includes("ru") ? "ru/" : ""}?silent&theme=${theme}&q=${encodeURIComponent(word)}`;
}

let dhammaGift;
let dgParams;
let dictUrl;

let externalDict = false;
let inNewWindow = false;

function applyDictConfig(newDict) {
    savedDict = newDict;
    localStorage.setItem('selectedDict', newDict);

    externalDict = false;
    inNewWindow = false;

    // Принудительно меняем сохраненный словарь в зависимости от текущего языка
    if (savedDict === "standalone" || savedDict === "standaloneru") {
        savedDict = window.isRu ? "standaloneru" : "standalone";
        localStorage.setItem('selectedDict', savedDict);
    } else if (savedDict === "newwindow" || savedDict === "newwindowru") {
        savedDict = window.isRu ? "newwindowru" : "newwindow";
        localStorage.setItem('selectedDict', savedDict);
    } else if (savedDict === "machinetranslation") {
        inNewWindow = true;
    }

    // --- МАГИЯ ОЧИСТКИ ДЛЯ КОРРЕКТНОГО ПЕРЕКЛЮЧЕНИЯ ---
    // Определяем путь скрипта, который нам БОЛЬШЕ НЕ НУЖЕН
    const oldLangScriptUrl = window.isRu 
        ? '/assets/js/standalone-dpd/dpd_ebts.js' 
        : '/assets/js/standalone-dpd/ru/dpd_ebts.js';
    
    // Удаляем старый тег из DOM, чтобы загрузчик не считал, что база уже готова
    const oldScriptElement = document.querySelector(`script[src="${oldLangScriptUrl}"]`);
    if (oldScriptElement) {
        oldScriptElement.remove();
    }
    
    // Удаляем из нашего внутреннего кэша загруженных скриптов
    if (typeof scriptCache !== 'undefined') {
        scriptCache.delete(oldLangScriptUrl);
    }
    
    // Сбрасываем промис. При следующем клике браузер мгновенно 
    // достанет нужный файл из своего HTTP-кэша и обновит базу.
    dbLoadPromise = null; 
    // ----------------------------------------------------

    const theme = getEffectiveTheme();

    if (savedDict.includes("dpd")) {
        dictUrl = "https://dict.dhamma.gift";
        if (savedDict.includes("ru")) {
            dictUrl += "/ru";
        }
        if (savedDict.includes("full")) {
            dictUrl += `/?silent&theme=${theme}&q=`;
        } else if (savedDict.includes("compact")) {
            dictUrl += "/gd?search=";
        }
    } else if (savedDict === "dicttango") {
        externalDict = true;
        dictUrl = "dttp://app.dicttango/WordLookup?word=";
    } else if (savedDict === "goldenpc") {
        externalDict = true;
        dictUrl = "goldendict://";
    } else if (savedDict === "mdict") {
        externalDict = true;
        dictUrl = "mdict://mdict.cn/search?text=";
    } else if (savedDict === "newwindow" || savedDict === "newwindowru") {
        dictUrl = `https://dict.dhamma.gift/${window.isRu ? "ru/" : ""}?silent&theme=${theme}&q=`;
    } else if (savedDict === "standaloneru") {
        dictUrl = "standaloneru"; 
    } else if (savedDict === "standalone") {
        dictUrl = "standalone"; 
    } else if (savedDict === "machinetranslation") {
        dictUrl = "https://dharmamitra.org/translate?input_sentence="; 
    } else {
        dictUrl = "searchonly";
    }
}


dhammaGift = '';
if (isLocalhost) {
  dictUrl = "https://dict.dhamma.gift";
} else if (savedDict.includes("compact")) {
    dictUrl = "https://dict.dhamma.gift";
} else {
    dictUrl = "https://dict.dhamma.gift";
}

if (window.location.href.includes('/r/') || window.location.href.includes('/ru/') || window.location.href.includes('/ml/') || (localStorage.siteLanguage && localStorage.siteLanguage === 'ru')) {
   dhammaGift += '/ru';
}
dhammaGift += '/?q=';

dgParams = '&p=-kn';

const theme = getEffectiveTheme();   

if (savedDict.includes("dpd")) {
  if (savedDict.includes("ru")) {
    dictUrl += "/ru";
  }

  if (savedDict.includes("full")) {
    dictUrl += `/?silent&theme=${theme}&q=`;
  } else if (savedDict.includes("compact")) {
    dictUrl += "/gd?search=";
  }
} else if (savedDict === "dicttango") {
  externalDict = true;
  dictUrl = "dttp://app.dicttango/WordLookup?word=";
} else if (savedDict === "goldenpc") {
  externalDict = true;
  dictUrl = "goldendict://";
} else if (savedDict === "mdict") {
  externalDict = true;
  dictUrl = "mdict://mdict.cn/search?text=";
} else if (savedDict === "newwindow") {
  dictUrl = `https://dict.dhamma.gift/?silent&theme=${theme}&q=`;
} else if (savedDict === "newwindowru") {
  dictUrl = `https://dict.dhamma.gift/ru/?silent&theme=${theme}&q=`;
}
else if (savedDict === "standaloneru") {
  dictUrl = "standaloneru"; 
} else if (savedDict === "standalone") {
  dictUrl = "standalone"; 
} else {
   dictUrl = "searchonly";
}

if (savedDict === "machinetranslation") {
    inNewWindow = true;
  dictUrl = "https://dharmamitra.org/translate?input_sentence="; 
}

const scriptCache = new Map();
const requestIdleCallback = window.requestIdleCallback ||
    function(cb) { return setTimeout(() => { cb({ didTimeout: false }); }, 0); };

// Функция-обещание загрузки стилей
function loadDictCSS() {
    return new Promise((resolve) => {
        if (document.getElementById('palilookup-css-lazy')) {
            resolve();
            return;
        }
        const link = document.createElement('link');
        link.id = 'palilookup-css-lazy';
        link.rel = 'stylesheet';
        link.href = '/assets/css/paliLookup.css';
        link.onload = resolve; // Идем дальше только когда CSS готов!
        link.onerror = resolve; // Если ошибка сети, все равно идем дальше
        document.head.appendChild(link);
    });
}

async function handleWordLookup(word, event) {
    if (!dictionaryVisible) return;

    // 1. Быстрая защита до очистки: игнорируем, если кликнули чисто на цифры или знаки
    if (!word || /^[\d\-.,:; ]+$/.test(word.trim())) return;

    let cleanedWord = cleanWord(word);
    
    // 2. Вторая защита: если после очистки осталась пустая строка, прерываем
    if (!cleanedWord) return;

    await loadDictCSS();
    const currentTheme = getEffectiveTheme();
    
    if (savedDict.includes("full")) {
        dictUrl = `https://dict.dhamma.gift/${window.isRu ? "ru/" : ""}?silent&theme=${currentTheme}&q=`;
    } else if (savedDict === "newwindow" || savedDict === "newwindowru") {
        dictUrl = `https://dict.dhamma.gift/${window.isRu ? "ru/" : ""}?silent&theme=${currentTheme}&q=`;
    }

    const { popup, overlay, iframe } = getPopup();

    let translation = "";

    // --- Ждем базы перед поиском ---
    if (dictUrl === "standalone" || dictUrl === "standaloneru" || savedDict === "standalone" || savedDict === "standaloneru") {
        const lang = window.isRu ? "ru" : "en";
        await lazyLoadStandaloneScripts(lang);
    }
    // -------------------------------

    if (dictUrl === "standalone" || dictUrl === "standaloneru") {
        const phraseTranslation = lookupWordInStandaloneDict(cleanedWord);

        if (phraseTranslation.trim() !== "") {
            translation += phraseTranslation;
        }
        else {
            const words = cleanedWord.split(/\s+/)
                                    .map(w => cleanWord(w))
                                    .filter(w => w.length > 0);

            for (const singleWord of words) {
                translation += lookupWordInStandaloneDict(singleWord);
            }
        }
    }
    else if (externalDict) {
        const tempLink = document.createElement('a');
        tempLink.href = 'javascript:void(0)';
        tempLink.onclick = function() {
            window.location.href = `${dictUrl}${encodeURIComponent(cleanedWord)}`;
            return false;
        };
        tempLink.click();
        translation = "";
        popup.style.display = 'none';
        overlay.style.display = 'none';
    } else if (inNewWindow || savedDict === "newwindow" || savedDict === "newwindowru") {
        const url = `${dictUrl}${encodeURIComponent(cleanedWord)}`;
        openDictionaryWindow(url);
        return;
    }
    else {
        const url = `${dictUrl}${encodeURIComponent(cleanedWord)}`;
        iframe.src = url;
    }

    const wordForSearch = cleanedWord.replace(/'ti/, '');
    let dictSearchUrl;

    if (isLocalhost) {
        const isAndroid = /Android/i.test(navigator.userAgent);
        dictSearchUrl = isAndroid
            ? `dttp://app.dicttango/WordLookup?word=${encodeURIComponent(wordForSearch)}`
            : `goldendict://${encodeURIComponent(wordForSearch)}`;
    } else {
        dictSearchUrl = createDictSearchUrl(wordForSearch);
    }

    if ((dictUrl === "standalone" || dictUrl === "standaloneru") && !translation) {
        const wordLink = `<strong>${createClickableLink(word)}</strong>`;
        const fallbackUrl = `${currentHost}${window.isRu ? "/ru" : ""}/?p=-kn&q=${encodeURIComponent(word)}`;

        translation = window.isRu ?
            `<div style="padding: 10px;">
                ${wordLink} не найдено во встроенном словаре.
                <br><br>
                <a href="${fallbackUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration: underline; color: inherit;">Искать на Dhamma.gift</a>
                <br>
                <a href="/cse.php?q=${word}" target="_blank" rel="noopener noreferrer" style="text-decoration: underline; color: inherit;">Искать в интернете</a>
            </div>` :
            `<div style="padding: 10px;">
                ${wordLink} is not found in the built-in dictionary.
                <br><br>
                <a href="${fallbackUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration: underline; color: inherit;">Search on Dhamma.gift</a>
                <br>
                <a href="/cse.php?q=${word}" target="_blank" rel="noopener noreferrer" style="text-decoration: underline; color: inherit;">Search on the internet</a>
            </div>`;
    }

    if (translation) {
        const isDarkMode = document.body.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark';
        const themeClass = isDarkMode ? 'dark' : '';

        const tempDiv = document.createElement('div');
        tempDiv.className = 'popup-measure-div';
        tempDiv.innerHTML = translation;
        document.body.appendChild(tempDiv);

        const contentHeight = tempDiv.offsetHeight;
        document.body.removeChild(tempDiv);

        let minHeight = 100;
        const maxHeight = window.innerHeight * 0.95;

        if (dictUrl === "standalone" || dictUrl === "standaloneru") {
            minHeight = 100;
        } else {
            const screenHeight = window.innerHeight;
            minHeight = (screenHeight * 0.8 < 600) ? screenHeight * 0.8 : 600;
        }

        let finalHeight = Math.min(Math.max(contentHeight + 20, minHeight), maxHeight);

        // Вставляем чистый HTML и линкуем внешний CSS файл
        iframe.srcdoc = `
            <!DOCTYPE html>
            <html lang="en" class="dict-iframe-html ${themeClass}">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="stylesheet" href="/assets/css/paliLookup.css">
            </head>
            <body class="dict-iframe-body ${themeClass}">
                ${translation}
            </body>
            </html>
        `;

        popup.style.height = `${finalHeight}px`;
        popup.style.display = 'block';
        overlay.style.display = 'block';

        iframe.onload = function() {
            try {
                const iframeBody = iframe.contentDocument.body;
                const scrollHeight = iframeBody.scrollHeight;
                const adjustedHeight = Math.min(Math.max(scrollHeight + 20, minHeight), maxHeight);
                popup.style.height = `${adjustedHeight}px`;
            } catch(e) {
                console.error('Error adjusting iframe height:', e);
            }
        };
    }

    const openBtn = document.querySelector('.open-btn');
    openBtn.href = `${dhammaGift}${encodeURIComponent(wordForSearch)}${dgParams}`;

    const dictBtn = document.querySelector('.dict-btn');
    dictBtn.href = dictSearchUrl;

    if (savedDict === "standalone" || savedDict === "standaloneru") {
      dictBtn.onclick = (e) => {
        e.preventDefault();
        parent.openDictionaryWindow(dictSearchUrl);
        return false;
      };
    }

function showSearchButton() {
        const existingBtn = document.querySelector('.quick-search-float-btn');
        if (existingBtn) {
            existingBtn.remove();
        }

        const wordForSearch = cleanedWord.replace(/'ti/, '');
        const searchBtn = document.createElement('a');
        searchBtn.href = `${dhammaGift}${encodeURIComponent(wordForSearch)}${dgParams}`;
        searchBtn.className = 'quick-search-float-btn';
        searchBtn.target = '_blank';
        searchBtn.style.top = `${event.clientY - 10}px`;
        searchBtn.style.left = `${event.clientX - 10}px`;
        searchBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16" height="16" fill="white" style="transform: scaleX(-1);">
                <path d="M505 442.7l-99.7-99.7c28.4-35.3 45.7-79.8 45.7-128C451 98.8 352.2 0 224 0S-3 98.8-3 224s98.8 224 224 224c48.2 0 92.7-17.3 128-45.7l99.7 99.7c6.2 6.2 14.4 9.4 22.6 9.4s16.4-3.1 22.6-9.4c12.5-12.5 12.5-32.8 0-45.3zM224 384c-88.4 0-160-71.6-160-160S135.6 64 224 64s160 71.6 160 160-71.6 160-160 160z"/>
            </svg>
        `;
        document.body.appendChild(searchBtn);

        // Плавное появление (fade-in)
        setTimeout(() => {
            searchBtn.classList.add('show');
        }, 10);
        
        searchBtn.addEventListener('click', () => {
            searchBtn.remove();
        });
        
        // Плавное исчезновение (fade-out)
        setTimeout(() => {
            if (document.body.contains(searchBtn)) {
                searchBtn.classList.remove('show');
                
                // Ждем окончания CSS-анимации перед удалением из DOM
                setTimeout(() => {
                    if (document.body.contains(searchBtn)) {
                        searchBtn.remove();
                    }
                }, 300); 
            }
        }, 1500);
    }

     if (externalDict) {
        popup.style.display = 'none';
        overlay.style.display = 'none';
        showSearchButton();
    } else if (dictUrl.includes('searchonly')) {
        popup.style.display = 'none';
        overlay.style.display = 'none';
        showSearchButton();
    } else {
        popup.style.display = 'block';
        overlay.style.display = 'block';
    }
}

let dbLoadPromise = null;

function lazyLoadStandaloneScripts(lang = 'en') {

    if (dbLoadPromise) return dbLoadPromise;

    const commonScripts = [
        '/assets/js/standalone-dpd/dpd_i2h.js',
        '/assets/js/standalone-dpd/dpd_deconstructor.js'
    ];

    const langSpecific = lang === 'ru'
        ? '/assets/js/standalone-dpd/ru/dpd_ebts.js'
        : '/assets/js/standalone-dpd/dpd_ebts.js';

    const scripts = [...commonScripts, langSpecific];
    const scriptsToLoad = scripts.filter(src => {
        return !document.querySelector(`script[src="${src}"]`) && !scriptCache.has(src);
    });

    if (scriptsToLoad.length === 0) {
        return Promise.resolve(false); // Если всё уже есть - возвращаем false (быстро)
    }

    dbLoadPromise = new Promise((resolve) => {
        const loadingId = 'dict-loading-' + Date.now();
        let slowLoadTriggered = false;
        
        // Запускаем таймер
        const slowLoadTimer = setTimeout(() => {
            slowLoadTriggered = true;
            const loadingEl = document.createElement('div');
            loadingEl.id = loadingId;
            loadingEl.className = 'dict-loading-indicator';
            loadingEl.textContent = window.isRu ? 'Словарь загружается...' : 'Dictionary is loading...';
            document.body.appendChild(loadingEl);
            setTimeout(() => loadingEl.classList.add('show'), 10);
        }, 150);

        const loadPromises = scriptsToLoad.map(src => {
            return new Promise((scriptResolve) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => {
                    scriptCache.set(src, true);
                    scriptResolve();
                };
                script.onerror = () => scriptResolve(); 
                document.head.appendChild(script);
            });
        });

        Promise.all(loadPromises).then(() => {
            clearTimeout(slowLoadTimer); 
            
            // Если плашка успела появиться - убираем её
            if (slowLoadTriggered) {
                const el = document.getElementById(loadingId);
                if (el) {
                    el.classList.remove('show');
                    setTimeout(() => el.remove(), 300);
                }
            }
            // Передаем статус "медленности" наружу
            resolve(slowLoadTriggered);
        });
    });

    return dbLoadPromise;
}


function createClickableLink(wordToLink) {
    const wordSearchUrl = createDictSearchUrl(wordToLink);
    let clickAction;

    if (isLocalhost || !navigator.onLine) {
        clickAction = `window.location.href=this.href; return false;`;
    } else {
        clickAction = `event.preventDefault(); event.stopPropagation(); parent.openDictionaryWindow(this.href); return false;`;
    }

    return `<a href="${wordSearchUrl}" onclick="${clickAction}" style="text-decoration: none; color: inherit;">${wordToLink}</a>`;
} 


function lookupWordInStandaloneDict(word) {
   // Защита от пустых строк и чисел (игнорируем 1, 2, 11-19 и т.д.)
    if (!word || /^[\d\-]+$/.test(word)) return ""; 
  
    let out = "";
    word = word.replace(/[’”'"]/g, "").replace(/ṁ/g, "ṃ");
  
    function linkifyPaliWords(text) {
        const wordRegex = /(?![^<]*>)([a-zA-ZāīūṅñṭḍṇḷṃĀĪŪṄÑṬḌṆḶṂёЁа-яА-Я']+)/g;
        return text.replace(wordRegex, (foundWord) => createClickableLink(foundWord));
    }

    if (word in dpd_i2h) {
        out += `<strong>${createClickableLink(word)}</strong><br><ul>`;
        for (const headword of dpd_i2h[word]) {
            if (headword in dpd_ebts) {
                const clickableHeadword = createClickableLink(headword);
                const linkedDefinition = linkifyPaliWords(dpd_ebts[headword]);
                out += `<li><span class="pli-lang" lang="pi">${clickableHeadword}. ${linkedDefinition}</span></li>`;
            }
        }
        out += "</ul>";
    }
    else {
        for (const key in dpd_i2h) {
            if (dpd_i2h[key].includes(word) && word in dpd_ebts) {
                if (!out.includes(`<strong>`)) { 
                     out += `<strong>${createClickableLink(word)}</strong><br><ul>`;
                }
                const clickableWord = createClickableLink(word);
                const linkedDefinition = linkifyPaliWords(dpd_ebts[word]);
                out += `<li><span class="pli-lang" lang="pi">${clickableWord}. ${linkedDefinition}</span></li></ul>`;
                break; 
            }
        }
    }

    if (word in dpd_deconstructor) {
        if (!out.includes(`<strong>`)) { 
            out += `<strong>${createClickableLink(word)}</strong><br>`;
        }
        
        const linkedDeconstruction = linkifyPaliWords(dpd_deconstructor[word]);
        out += `<ul><li><span class='pli-lang' lang='pi'>${linkedDeconstruction}</span></li></ul>`;
    }

    return out.replace(/ṃ/g, "ṁ");
}

function clearParams() {
    const keys = ['popupWidth', 'popupHeight', 'popupTop', 'popupLeft', 'windowWidth', 'windowHeight', 'isFirstDrag'];
    keys.forEach(key => localStorage.removeItem(key));
}

function createPopup() {
    const overlay = document.createElement('div');
    overlay.classList.add('overlay');

    const popup = document.createElement('div');
    popup.classList.add('popup');
    popup.style.position = 'fixed';
    popup.style.maxWidth = '100%';
    popup.style.maxHeight = '1200px';
    popup.style.borderRadius = '8px';
    popup.style.overflow = 'hidden';

    const currentWindowWidth = window.innerWidth;
    const currentWindowHeight = window.innerHeight;

    const savedWindowWidth = localStorage.getItem('windowWidth');
    const savedWindowHeight = localStorage.getItem('windowHeight');

    if (
        savedWindowWidth &&
        savedWindowHeight &&
        (parseInt(savedWindowWidth, 10) !== currentWindowWidth ||
            parseInt(savedWindowHeight, 10) !== currentWindowHeight)
    ) {
        clearParams();
    }

    localStorage.setItem('windowWidth', currentWindowWidth);
    localStorage.setItem('windowHeight', currentWindowHeight);

    const savedWidth = localStorage.getItem('popupWidth');
    const savedHeight = localStorage.getItem('popupHeight');
    const savedTop = localStorage.getItem('popupTop');
    const savedLeft = localStorage.getItem('popupLeft');

    if (savedWidth) popup.style.width = savedWidth;
    if (savedHeight) popup.style.height = savedHeight;
    if (savedTop) popup.style.top = savedTop;
    if (savedLeft) popup.style.left = savedLeft;

    const closeBtn = document.createElement('button');
    closeBtn.classList.add('close-btn');
    closeBtn.title = '(Esc)';
    closeBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="17" height="17" fill="currentColor">
            <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
        </svg>
    `;

    const openBtn = document.createElement('a');
    openBtn.className = 'open-btn popup-action-btn popup-open-btn';
    openBtn.target = '_blank';
    openBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16" height="16" fill="white" style="transform: scaleX(-1);">
            <path d="M505 442.7l-99.7-99.7c28.4-35.3 45.7-79.8 45.7-128C451 98.8 352.2 0 224 0S-3 98.8-3 224s98.8 224 224 224c48.2 0 92.7-17.3 128-45.7l99.7 99.7c6.2 6.2 14.4 9.4 22.6 9.4s16.4-3.1 22.6-9.4c12.5-12.5 12.5-32.8 0-45.3zM224 384c-88.4 0-160-71.6-160-160S135.6 64 224 64s160 71.6 160 160-71.6 160-160 160z"/>
        </svg>
    `;

    const dictBtn = document.createElement('a');
    dictBtn.className = 'dict-btn popup-action-btn popup-dict-btn';
    dictBtn.target = '_blank';
    dictBtn.title = 'Open in dict.dhamma.gift';
    dictBtn.innerHTML = `<img src="/assets/svg/dpd-logo-dark.svg" width="18" height="18">`;

    const iframe = document.createElement('iframe');
    iframe.className = 'popup-iframe';
    iframe.src = '';

    const header = document.createElement('div');
    header.className = 'popup-header';
    header.textContent = '';

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle-corner'; 
    
    const resizeHandleRight = document.createElement('div');
    resizeHandleRight.className = 'resize-handle-right';

    const resizeHandleBottom = document.createElement('div');
    resizeHandleBottom.className = 'resize-handle-bottom';


    popup.appendChild(header);
    popup.appendChild(dictBtn);
    popup.appendChild(openBtn);
    popup.appendChild(closeBtn);
    popup.appendChild(iframe);
    popup.appendChild(resizeHandle);
    popup.appendChild(resizeHandleRight);
    popup.appendChild(resizeHandleBottom);

    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    let isDragging = false;
    let isResizing = false;
    let currentResizeType = 'corner';

    let startX, startY, initialLeft, initialTop;
    let isFirstDrag = localStorage.getItem('isFirstDrag') === 'false' ? false : true;

    if (isFirstDrag) {
        if (savedDict && savedDict.includes("standalone")) {
            popup.style.top = '50%';
            popup.style.left = '50%';
            popup.style.width = '749px';
            popup.style.height = '600px';
            popup.style.transform = 'translate(-50%, -50%)';
        } else {
            popup.style.width = '500px';
            popup.style.height = '500px';
            const rightMargin = isMobileLike ? 0 : 15;
            popup.style.right = `${rightMargin}px`;
            popup.style.top = `${window.innerHeight - 510}px`;
            popup.style.transform = 'none';
        }
    }

    function startDrag(e) {
        isDragging = true;
        iframe.style.pointerEvents = 'none';
        popup.classList.add('dragging');

        if (isFirstDrag) {
            const rect = popup.getBoundingClientRect();
            popup.style.transform = 'none';
            popup.style.top = rect.top + 'px';
            popup.style.left = rect.left + 'px';
            isFirstDrag = false;
            localStorage.setItem('isFirstDrag', isFirstDrag);
        }

        startX = e.clientX || e.touches[0].clientX;
        startY = e.clientY || e.touches[0].clientY;
        initialLeft = parseInt(popup.style.left || 0, 10);
        initialTop = parseInt(popup.style.top || 0, 10);
        e.preventDefault();
    }

    function moveDrag(e) {
        if (isDragging) {
            const deltaX = (e.clientX || e.touches[0].clientX) - startX;
            const deltaY = (e.clientY || e.touches[0].clientY) - startY;
            popup.style.left = `${initialLeft + deltaX}px`;
            popup.style.top = `${initialTop + deltaY}px`;
        }
    }

    function stopDrag() {
        if (isDragging) {
            isDragging = false;
            iframe.style.pointerEvents = 'auto';
            popup.classList.remove('dragging');
            savePopupState();
        }
    }

    let startWidth, startHeight, startResizeX, startResizeY;
    
    function startResize(e, resizeType = 'corner') {
        isResizing = true;
        currentResizeType = resizeType; 
        iframe.style.pointerEvents = 'none';
        popup.classList.add('resizing');

        startWidth = parseInt(document.defaultView.getComputedStyle(popup).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(popup).height, 10);
        startResizeX = e.clientX || e.touches[0].clientX;
        startResizeY = e.clientY || e.touches[0].clientY;

        e.preventDefault();
        e.stopPropagation();
    }

    function doResize(e) {
        if (!isResizing) return;

        const currentX = e.clientX || e.touches[0].clientX;
        const currentY = e.clientY || e.touches[0].clientY;

        let newWidth = startWidth;
        let newHeight = startHeight;

        if (currentResizeType === 'corner' || currentResizeType === 'right') {
            newWidth = startWidth + (currentX - startResizeX);
        }
        if (currentResizeType === 'corner' || currentResizeType === 'bottom') {
            newHeight = startHeight + (currentY - startResizeY);
        }
        
        const minWidth = 200;
        const minHeight = 150;
        const maxWidth = window.innerWidth * 0.9;
        const maxHeight = window.innerHeight * 0.9;

        popup.style.width = Math.max(minWidth, Math.min(newWidth, maxWidth)) + 'px';
        popup.style.height = Math.max(minHeight, Math.min(newHeight, maxHeight)) + 'px';

        e.preventDefault();
        e.stopPropagation();
    }

    function stopResize() {
        if (isResizing) {
            isResizing = false;
            iframe.style.pointerEvents = 'auto';
            popup.classList.remove('resizing');
           savePopupState();
        }
    }
    
    header.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', moveDrag);
    document.addEventListener('mouseup', stopDrag);
    header.addEventListener('touchstart', startDrag);
    document.addEventListener('touchmove', moveDrag);
    document.addEventListener('touchend', stopDrag);

    resizeHandle.addEventListener('mousedown', (e) => startResize(e, 'corner'));
    resizeHandle.addEventListener('touchstart', (e) => startResize(e, 'corner'));

    resizeHandleRight.addEventListener('mousedown', (e) => startResize(e, 'right'));
    resizeHandleRight.addEventListener('touchstart', (e) => startResize(e, 'right'));

    resizeHandleBottom.addEventListener('mousedown', (e) => startResize(e, 'bottom'));
    resizeHandleBottom.addEventListener('touchstart', (e) => startResize(e, 'bottom'));

    document.addEventListener('mousemove', doResize);
    document.addEventListener('touchmove', doResize);
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchend', stopResize);

    document.addEventListener('mouseleave', () => {
        if (isDragging) stopDrag();
        if (isResizing) stopResize();
    });

    return { overlay, popup, closeBtn, iframe };
}

let popupElements = null;

function getPopup() {
    if (popupElements) return popupElements;

    popupElements = createPopup();

    popupElements.iframe.addEventListener('mouseover', () => {
        window.focus();
    });

    popupElements.closeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        popupElements.popup.style.display = 'none';
        popupElements.overlay.style.display = 'none';
        popupElements.iframe.src = '';
    });

    popupElements.overlay.addEventListener('click', (event) => {
        event.stopPropagation();
        popupElements.popup.style.display = 'none';
        popupElements.overlay.style.display = 'none';
        popupElements.iframe.src = '';
    });

    return popupElements;
}

let dictionaryVisible = localStorage.getItem('dictionaryVisible') === null ? true : localStorage.getItem('dictionaryVisible') === 'true';

const toggleBtn = document.querySelector('.toggle-dict-btn img');
if (dictionaryVisible) {
  toggleBtn.src = "/assets/svg/comment.svg";
} else {
  toggleBtn.src = "/assets/svg/comment-slash.svg";
  clearParams();
}

toggleBtn.addEventListener('click', () => {
  dictionaryVisible = !dictionaryVisible;
  localStorage.setItem('dictionaryVisible', dictionaryVisible);

  if (dictionaryVisible) {
  toggleBtn.src = "/assets/svg/comment.svg";
        showBubbleNotification("Dictionary On");

} else {
  toggleBtn.src = "/assets/svg/comment-slash.svg";
        showBubbleNotification("Dictionary Off");

}
});

  document.addEventListener("keydown", (event) => {
    if (event.altKey && event.code === "KeyA") {
      toggleBtn.click();
    }
  });

document.addEventListener("keydown", (event) => {
    if (event.altKey && event.code === "KeyB") {

        const modes = {
            standalone: window.isRu ? "standaloneru" : "standalone",
            full: "dpdfull",
            newWindow: window.isRu ? "newwindowru" : "newwindow"
        };

        const currentDict = localStorage.getItem('selectedDict');
        let newDict, notificationText;
        localStorage.setItem('dictionaryVisible', 'true');

        if (isMobileLike) {
            newDict = currentDict === modes.full ? modes.standalone : modes.full;
            notificationText = window.isRu ?
                `Словарь: ${newDict === modes.full ? "Полный" : "Встроенный"}` :
                `Dictionary: ${newDict === modes.full ? "Full" : "Standalone"}`;
        } else {
            newDict = currentDict === modes.newWindow ? modes.standalone : modes.newWindow;
            notificationText = window.isRu ?
                `Словарь: ${newDict === modes.newWindow ? "В новом окне" : "Встроенный"}` :
                `Dictionary: ${newDict === modes.newWindow ? "New Window" : "Standalone"}`;
        }

        applyDictConfig(newDict);
        showBubbleNotification(notificationText);
    }
});

document.addEventListener('click', function(event) {
    const pliElement = event.target.closest('.pli-lang, [lang="pi"]');
    if (pliElement && pliElement.classList.contains('dict-ignore')) return;
    const selectedText = getSelectedText();

    if (pliElement && selectedText && isSelectionWithinElement(pliElement)) {
        if (event.target.closest('a, button, input, textarea, select')) return;
        
        if (isMultiSelectMode) return; 
        
        handleWordLookup(selectedText, event);
    }
    else if (pliElement) {
        if (event.target.closest('a, button, input, textarea, select')) return;
        const clickedWord = getClickedWordWithHTML(event.target, event.clientX, event.clientY);
        if (clickedWord) handleWordLookup(clickedWord, event);
    }
});

let isMultiSelectMode = localStorage.getItem('multiSelectMode') === 'true';
let multiSelectTimer = null;

const svgSelectActive = "/assets/svg/select.svg";
const svgSelectSlashed = "/assets/svg/select-slash.svg";

function updateMultiSelectUI() {
    const toggleBtn = document.getElementById('toggle-multiselect');
    if (toggleBtn) {
        const img = toggleBtn.querySelector('img');
        if (isMultiSelectMode) {
            if (img) img.src = svgSelectActive;
        } else {
            if (img) img.src = svgSelectSlashed;
        }
    }
    if (typeof window.syncSmartIcons === 'function') window.syncSmartIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateMultiSelectUI);
} else {
    updateMultiSelectUI();
}

document.addEventListener('click', (e) => {
    const msBtn = e.target.closest('#toggle-multiselect');
    
    if (msBtn) {
        e.preventDefault();
        isMultiSelectMode = !isMultiSelectMode;
        localStorage.setItem('multiSelectMode', isMultiSelectMode);
        
        updateMultiSelectUI();
        
        // Если режим включили — проверяем текущее выделение
        if (isMultiSelectMode) {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();

            if (selectedText.length > 0 && selection.rangeCount > 0) {
                const rect = selection.getRangeAt(0).getBoundingClientRect();
                
                // Сразу отправляем выделенный текст в функцию словаря
                // Передаем координаты центра выделения для позиционирования окна
                if (typeof handleWordLookup === 'function') {
                    handleWordLookup(selectedText, {
                        clientX: rect.left + (rect.width / 2),
                        clientY: rect.top + (rect.height / 2)
                    });
                }
            }
        }
        
        if (typeof showBubbleNotification !== 'undefined') {
            showBubbleNotification(isMultiSelectMode ? "Multi-select On" : "Multi-select Off");
        }
    }
});

document.addEventListener('selectionchange', () => {
    if (!isMultiSelectMode || (typeof dictionaryVisible !== 'undefined' && !dictionaryVisible)) return;
    
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    clearTimeout(multiSelectTimer);

    if (selectedText.length > 0) {
        multiSelectTimer = setTimeout(() => {
            
            if (!selection.rangeCount) return;
            
            let targetNode = selection.anchorNode;
            if (!targetNode) return;
            if (targetNode.nodeType === 3) targetNode = targetNode.parentNode;
            
            const pliElement = targetNode.closest('.pli-lang, [lang="pi"]');
            if (pliElement && !pliElement.classList.contains('dict-ignore')) {
                if (targetNode.closest('a, button, input, textarea, select, .popup, .overlay')) return;
                
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const mockEvent = {
                    clientX: rect.left + (rect.width / 2),
                    clientY: rect.top + (rect.height / 2)
                };
                
                if (typeof handleWordLookup === 'function') {
                    handleWordLookup(selectedText, mockEvent);
                }
                
                setTimeout(() => {
                    if (window.getSelection) {
                        window.getSelection().removeAllRanges();
                    }
                }, 50);
            }
        }, 2000); 
    }
});

function getClickedWordWithHTML(element, x, y) {
    let range;

    if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(x, y); 
    } else if (document.caretPositionFromPoint) {
        const position = document.caretPositionFromPoint(x, y); 
        if (position && position.offsetNode) {
            range = document.createRange();
            range.setStart(position.offsetNode, position.offset);
            range.setEnd(position.offsetNode, position.offset);
        }
    }

    if (!range) return null;
    
    if (range.startContainer.nodeType !== Node.TEXT_NODE) {
        return null;
    }

    const rects = range.getClientRects();
    if (rects.length === 0) return null;
    
    const caretRect = rects[0];

    const dx = Math.max(caretRect.left - x, 0, x - caretRect.right);
    const dy = Math.max(caretRect.top - y, 0, y - caretRect.bottom);
    
    const distance = Math.sqrt(dx * dx + dy * dy);

    const CLICK_TOLERANCE = 10; 

    if (distance > CLICK_TOLERANCE) {
        return null; 
    }

    const parentElement = element.closest('.pli-lang, .rus-lang, .eng-lang, [lang="pi"], [lang="en"], [lang="ru"]');
    if (!parentElement) {
        return null;
    }

    const { fullText, globalOffset } = getTextAndOffset(parentElement, range.startContainer, range.startOffset);
    
    if (globalOffset === -1) {
        return null;
    }

    const regex = /[^\s,;.–—!?()]+/g;
    let match;
    while ((match = regex.exec(fullText)) !== null) {
        if (match.index <= globalOffset && regex.lastIndex >= globalOffset) {
            return match[0];
        }
    }

    return null;
}

function getTextAndOffset(parentElement, targetNode, targetOffset) {
    let fullText = '';
    let globalOffset = -1;
    
    const walker = document.createTreeWalker(parentElement, NodeFilter.SHOW_TEXT, null, false);
    let node;
    let prevIsVar = null;

    while ((node = walker.nextNode())) {
        const isVar = node.parentElement && node.parentElement.closest('.var, .variant') !== null;
        
        // Если статус "варианта" изменился, добавляем пробел для разделения склеенных слов
        if (prevIsVar !== null && isVar !== prevIsVar) {
            // Добавляем пробел, только если на стыке нет других пробельных символов
            if (!fullText.endsWith(' ') && !node.textContent.startsWith(' ')) {
                fullText += ' ';
            }
        }
        
        // Фиксируем смещение с учетом добавленных пробелов
        if (node === targetNode) {
            globalOffset = fullText.length + targetOffset;
        }
        
        fullText += node.textContent;
        prevIsVar = isVar;
    }

    return { fullText, globalOffset };
}


function getFullTextFromElement(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);

    let node;
    while ((node = walker.nextNode())) {
        textNodes.push(node.textContent);
    }

    return textNodes.join(' ').replace(/\s+/g, ' ').trim(); 
}

function cleanWord(word) {
    return word
        .replace(/^[\s'‘—.–।|…"“”]+/, ' ') 
        .replace(/^[0-9]+/, ' ') 
        .replace(/·/g, "")
        .replace(/[\s'‘,—.—–।|"“…:;”]+$/, ' ') 
        .replace(/[‘'’‘"“””]+/g, "'") 
        .trim()
        .toLowerCase();
}


