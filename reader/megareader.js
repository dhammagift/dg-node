//ридер не должен качать всю базу с сервера чтобы открыть один текст. качать всю базу только для оффлайн использвания. и нужно проверять если есть оффлан - то использотвать если нет, то брать из сети, но только сутту... а не всю БД

const Sccopy = "/suttacentral.net";

// Тот же паттерн чтения i18n-конфига, что и в search-render.js/res/index.html — читает
// window.DHAMMA_I18N.config через глобал, не завязан на то, когда конкретно этот файл
// подключился относительно dhamma-i18n.js.
function t(path, fallback) {
    var cfg = window.DHAMMA_I18N && window.DHAMMA_I18N.config;
    if (!cfg) return fallback;
    var value = path.split('.').reduce(function (v, k) { return (v == null) ? undefined : v[k]; }, cfg);
    return value === undefined ? fallback : value;
}

const suttaArea = document.getElementById(window.MEGAREADER_SUTTA_ID || "sutta");
const homeButton = document.getElementById("home-button");
const fdgButton = document.getElementById("fdg-button");
const citation = document.getElementById("paliauto");
const form = document.getElementById("form");

// Режим — только ключ (window.READER_MODE.modeKey, см. reader-template.html: ?mode=). Что
// означает ключ (multiFor/dualScript/mnemonic/label) знает ТОЛЬКО сервер: reader/mode-table.json
// резолвится в dg-light.js по ?mode=, а здесь та же таблица подгружается один раз ИСКЛЮЧИТЕЛЬНО
// для презентационных нужд (панель ссылок, определение "это смена языка интерфейса?") — сама
// buildSutta() отправляет на сервер только ?mode=, columns в рендере берутся из ОТВЕТА API, не
// отсюда. Раньше columns/multiFor дублировались тут же (MODE_CONFIGS) — источник рассинхронизации.
// window.READER_MODE.modeKey was only ever populated by reader-template.html's own inline
// script (the pre-SPA standalone reader page, kept only as reference — see CLAUDE.md/TODO.md).
// The actual SPA (search/index.html) never sets it, so READER_MODE_EXPLICIT was always false
// and an explicit ?mode=single in the URL got silently overwritten by the UI-language fallback
// below (initReader()) on every load — owner report: "single-language mode should follow the
// first configured language, multi-language the rest" ended up ignoring ?mode= entirely.
// Reading it straight from the URL here closes that gap for the SPA the same way the old
// template's inline script did.
const modeFromUrl = new URLSearchParams(window.location.search).get('mode');
const langFromUrl = new URLSearchParams(window.location.search).get('lang');
const READER_MODE_EXPLICIT = !!(window.READER_MODE && window.READER_MODE.modeKey) || !!modeFromUrl;
let READER_MODE = window.READER_MODE || {};
if (!READER_MODE.modeKey && modeFromUrl) READER_MODE.modeKey = modeFromUrl;
// Same deal for lang — without this, a fresh load of e.g. ?mode=single&lang=en had no
// READER_MODE.lang yet on the FIRST buildSutta() call (nothing sets it before then), so that
// first request went out with no lang= at all and fell through to the server's bare fallback.
if (!READER_MODE.lang && langFromUrl) READER_MODE.lang = langFromUrl;
// `let` (unlike `var`) does NOT auto-publish to window — external code (home.js's reader-modes
// list in the burger drawer) needs to read the CURRENT mode, so keep this the SAME object
// (not a copy) window.READER_MODE points to; every later `READER_MODE.modeKey = ...` elsewhere
// in this file mutates the object in place, so the reference below stays live automatically.
window.READER_MODE = READER_MODE;
window.modeTableReady = fetch('/reader/mode-table.json')
    .then(r => r.json())
    .then(data => { window.MODE_TABLE = data; return data; });

// Owner: the burger's EN/RU switch should also change "reading language" (which translation
// leads), not just interface strings — but for a mode that already shows several languages at
// once (ml: Pāḷi+Ru+En), switching should REORDER them (chosen language first, rest untouched
// in the order the user already has), not drop the mode down to a single language. This is the
// order that survives that reordering — read by reorderColumnsByLangOrder() below, only ever
// applied on top of whatever columns the server actually returned (never invents a language the
// server didn't send).
const LANG_ORDER_KEY = 'dgReadingLangOrder';
function getLangOrder() {
    try { const v = JSON.parse(localStorage.getItem(LANG_ORDER_KEY)); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
}
function setLangOrderFirst(lang, fallbackColumns) {
    const base = getLangOrder().length ? getLangOrder() : (fallbackColumns || []);
    const next = [lang, ...base.filter(l => l !== lang)];
    try { localStorage.setItem(LANG_ORDER_KEY, JSON.stringify(next)); } catch (e) { /* приватный режим */ }
}
// Языки, которых нет в сохранённом порядке (юзер ещё не переключал), остаются в порядке сервера
// — так сохранённый порядок только переставляет "первый", а не переизобретает весь список.
function reorderColumnsByLangOrder(cols) {
    const order = getLangOrder();
    if (!order.length) return cols;
    const known = order.filter(l => cols.includes(l));
    const rest = cols.filter(l => !known.includes(l));
    return [...known, ...rest];
}

// Mode-table.json entries are pure behavior flags now (mnemonic/dualScript/multiFor) — no
// per-language duplicate keys (mem/mem_en etc. are gone, see 'memorize'/'devanagari'). Language
// is a fully separate axis (?lang=/?langs=), so these checks work identically in any language.
function isMnemonicMode(modeKey) {
    return !!(window.MODE_TABLE && window.MODE_TABLE[modeKey] && window.MODE_TABLE[modeKey].mnemonic);
}
function isDualScriptMode(modeKey) {
    return !!(window.MODE_TABLE && window.MODE_TABLE[modeKey] && window.MODE_TABLE[modeKey].dualScript);
}

// Человеко-читаемые имена переводчиков (с HTML-ссылками, напр. "o" -> <a href=...>o</a>) —
// как в legacy common.js: window.siteTranslators, из /assets/js/translators.json. Это НЕ
// window.TRANSLATORS_CONFIG/translators_config.js — тот файл беднее и без ссылок, не используется
// продовым reader-rus-translations.js/indexBB.js.
window.siteTranslatorsReady = fetch('/assets/js/translators.json')
    .then(r => r.ok ? r.json() : {})
    .then(data => { window.siteTranslators = data; return data; })
    .catch(() => { window.siteTranslators = {}; return {}; });

let language = "pli-2nd";

if (homeButton) {
    homeButton.addEventListener("click", () => {
      document.location.search = "";
    });
}

// ==========================================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ ЯЗЫКА И ИНТЕРФЕЙСА
// ==========================================

// НЕ window.showPaliEnglish — то же имя определяет и legacy switchView.js (без учёта
// column-view), а он подключён с defer и выполняется ПОСЛЕ этого файла (megareader.js без
// defer, выполняется синхронно раньше) — переопределил бы это присваивание и терялось бы
// восстановление column-view при возврате в общий режим (Alt+Z/Space), настройка 1/2 колонки
// "забывалась". switchView.js трогать нельзя — легаси, поэтому просто другое имя.
window.showPaliAndTranslation = function() {
    if (suttaArea) {
        suttaArea.classList.remove("hide-pali", "hide-english", "hide-russian");
        const savedMode = localStorage.getItem('viewMode') || 'alternate';
        if (savedMode === 'columns') suttaArea.classList.add('column-view');
    }
};

window.showEnglish = function() {
    if (suttaArea) {
        suttaArea.classList.add("hide-pali");
        suttaArea.classList.remove("hide-english", "hide-russian", "column-view");
    }
};

window.showPali = function() {
    if (suttaArea) {
        suttaArea.classList.remove("hide-pali");
        suttaArea.classList.add("hide-english", "hide-russian");
        suttaArea.classList.remove('column-view');
    }
};

window.setLanguage = function(lang) {
    if (lang === "pli-2nd") window.showPaliAndTranslation();
    else if (lang === "pli") window.showPali();
    else if (lang === "2nd") window.showEnglish();
};

window.toggleThePali = function() {
    const storageKey = "paliToggle";
    const modes = ["pli-2nd", "pli", "2nd"];
    const defaultMode = "pli-2nd";
    const languageButton = document.getElementById("language-button");
    if (!languageButton) return;

    if (!localStorage.getItem(storageKey)) {
        localStorage.setItem(storageKey, defaultMode);
    }
    window.language = localStorage.getItem(storageKey); 

    const newButton = languageButton.cloneNode(true);
    languageButton.parentNode.replaceChild(newButton, languageButton);

    newButton.addEventListener("click", () => {
        let currentMode = localStorage.getItem(storageKey) || defaultMode;
        let nextIndex = (modes.indexOf(currentMode) + 1) % modes.length;
        let nextMode = modes[nextIndex];

        const applyChange = () => {
            localStorage.setItem(storageKey, nextMode);
            window.language = nextMode;
            localStorage.setItem("dg_localSettingsTimestamp", Date.now().toString());

            if (nextMode === "pli") window.showPali();
            else if (nextMode === "2nd") window.showEnglish();
            else if (nextMode === "pli-2nd") window.showPaliAndTranslation();

            if (typeof window.syncSettingsToCloud === "function") {
                window.syncSettingsToCloud().then(() => {
                    if (typeof window.dg_settingsChanged !== 'undefined') {
                        window.dg_settingsChanged = false;
                    }
                });
            }
        };

        if (typeof window.runWithTransition === "function") window.runWithTransition(applyChange);
        else applyChange();
    });
};

window.setupVariantVisibility = function() {
    const toggleButton = document.getElementById("toggle-variants");
    if (!toggleButton) return; 

    let storedState = localStorage.getItem("variantVisibility") || "hidden";
    const eyeIcon = "/assets/svg/eye.svg";
    const eyeSlashIcon = "/assets/svg/eye-slash.svg";

    function applyState(state) {
        const variantElements = document.querySelectorAll(".variant");
        const currentBtn = document.getElementById("toggle-variants");
        const iconImage = currentBtn ? currentBtn.querySelector("img") : null;

        variantElements.forEach((el) => {
            if (state === "hidden") el.classList.add("hidden-variant");
            else el.classList.remove("hidden-variant");
        });

        if (iconImage) {
            if (state === "hidden") {
                iconImage.setAttribute("src", eyeSlashIcon);
                iconImage.classList.remove("fa-eye");
                iconImage.classList.add("fa-eye-slash");
            } else {
                iconImage.setAttribute("src", eyeIcon);
                iconImage.classList.remove("fa-eye-slash");
                iconImage.classList.add("fa-eye");
            }
        }
    }

    applyState(storedState);

    toggleButton.onclick = function(e) {
        if (e) e.preventDefault();
        storedState = storedState === "hidden" ? "visible" : "hidden";
        localStorage.setItem("variantVisibility", storedState);
        applyState(storedState);
        if (typeof showBubbleNotification === "function") {
            showBubbleNotification(storedState === "hidden" ? "Variants Off" : "Variants On");
        }
    };

    if (!window._variantHotkeySetup) {
        document.addEventListener("keydown", (event) => {
            if (event.altKey && event.code === "KeyV") {
                const currentBtn = document.getElementById("toggle-variants");
                if (currentBtn) currentBtn.click();
            }
        });
        window._variantHotkeySetup = true;
    }
};

// dataObjects: произвольный список параллельных {segmentId: text} объектов, которые нужно
// слить в лок-степе с htmlData (paliData, varData, плюс по одному на каждую языковую колонку) —
// N-арная замена старой версии, где было ровно paliData/transData/varData/engTransData.
window.mergeGathas = function(htmlData, dataObjects) {
    const originalSegments = Object.keys(htmlData);
    if (localStorage.getItem("mergeGathas") === "false") return originalSegments;

    const processedSegments = [];
    for (let i = 0; i < originalSegments.length; i++) {
        let segment = originalSegments[i];

        dataObjects.forEach(obj => { if (obj[segment] === undefined) obj[segment] = ""; });

        let nextSegment = originalSegments[i + 1];

        if (htmlData[segment] && htmlData[segment].includes('verse-line') &&
            nextSegment && htmlData[nextSegment] && htmlData[nextSegment].includes('verse-line')) {

            let [nextOpen, nextClose] = htmlData[nextSegment].split(/{}/);
            if (!nextOpen.includes('<p>')) {
                const toLower = (str) => {
                    if (!str) return "";
                    if (str.match(/^["“'‘]?(I\b|I'|O\b|О\b)/)) return str;
                    return str.charAt(0).toLowerCase() + str.slice(1);
                };

                dataObjects.forEach(obj => {
                    if (obj[nextSegment]) obj[segment] = (obj[segment] || "").trim() + " " + toLower(obj[nextSegment].trim());
                });

                let [currOpen, currClose] = htmlData[segment].split(/{}/);
                htmlData[segment] = (currOpen || '') + "{}" + (nextClose || '');

                processedSegments.push(segment);
                i++;
                continue;
            }
        }
        processedSegments.push(segment);
    }
    return processedSegments;
};

window.applyRemovePunct = function(dataObj, segment) {
    if (localStorage.getItem("removePunct") === "true" && dataObj && dataObj[segment] !== undefined) {
        dataObj[segment] = dataObj[segment].replace(/[-—–]/g, ' ')
                                           .replace(/[:;“”‘’,"']/g, '')
                                           .replace(/[.?!]/g, ' | ');
    }
};

// === MEMORIZE MODE — first-letter mnemonic ===
// Ported from prod's read/js/memorize.js (преобразоватьТекст) — reduces each Pali word down to
// its first letter, wrapping it in a clickable/hoverable .mem-trigger that reveals the full
// word in a popup bubble (showBubble below). Numbers and punctuation are kept mostly intact
// (split out so they don't get swallowed as "words").
function transformToMnemonic(rawText) {
    const lines = rawText.split('\n');
    const result = lines.map(line => {
        const spaced = line
            .replace(/"/g, ' " ').replace(/—/g, ' — ').replace(/“/g, ' “ ')
            .replace(/‘/g, " ‘ ").replace(/\?/g, " ? ").replace(/,/g, " , ")
            .replace(/\./g, " . ").replace(/:/g, " : ").replace(/;/g, " ; ");
        const words = spaced.split(/\s+/).map(word => {
            if (word.match(/\p{N}/u)) return word.replace(/[^\p{N}\-]/gu, '');
            const firstLetter = word.match(/^\p{L}/u);
            if (firstLetter) {
                const cleanWord = word.replace(/['"“‘]/g, '');
                return `<span class="mem-trigger" lang="pi" data-word="${cleanWord}" `
                    + `onclick="showBubble(this, event)" onmouseenter="handleBubbleHover(this, event)" `
                    + `onmouseleave="handleBubbleLeave(this, event)">${firstLetter[0]}</span>`;
            }
            const symbol = word.match(/^[\p{M}\p{N}\p{S}\p{P}]/u);
            return symbol ? symbol[0] : '';
        });
        const joined = words.join(' ')
            .replace(/ \?/g, '?').replace(/“ /g, '').replace(/ ,/g, ', ')
            .replace(/ \. /g, '. ').replace(/ : /g, ': ').replace(/ ; /g, '; ')
            .replace(/ ‘ /g, ' ');
        return joined.replace(/(\d+)[.,;:]/g, '$1');
    });
    return result.join('\n');
}

// === MEMORIZE MODE — word-reveal bubble ===
// Same interaction as prod: click/tap pins the bubble open (and forwards a mouseup+click into
// it so the dictionary lookup fires on the revealed word, same as selecting text normally);
// hover (mouse only, not touch — touchstart sets lastMemoTouchTime so a phantom hover from the
// tap itself doesn't also open/close it) shows it temporarily and closes on mouseleave.
let memHoverTimeout;
let lastMemoTouchTime = 0;
document.addEventListener('touchstart', () => { lastMemoTouchTime = Date.now(); }, { capture: true, passive: true });

window.showBubble = function (element, event, isHover = false) {
    if (event) event.stopPropagation();
    const now = Date.now();
    const isTouch = (now - lastMemoTouchTime < 500);

    if (element.classList.contains('mem-active')) {
        if (isHover) { clearTimeout(memHoverTimeout); return; }
        const openedAt = parseInt(element.dataset.openedAt || '0', 10);
        if (isTouch && (now - openedAt < 300)) return;
        const existingBubble = document.querySelector('.mem-bubble');
        if (existingBubble) {
            existingBubble.dataset.pinned = 'true';
            const range = document.createRange();
            range.selectNodeContents(existingBubble);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            existingBubble.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
            existingBubble.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            return;
        }
    }

    if (isHover && isTouch) return;
    window.removeBubbles();

    const word = element.getAttribute('data-word');
    if (!word) return;

    element.classList.add('mem-active');
    element.dataset.openedAt = now.toString();

    const bubble = document.createElement('div');
    bubble.className = 'mem-bubble tts-ignore pli-lang';
    bubble.dataset.pinned = isHover ? 'false' : 'true';
    bubble.setAttribute('lang', 'pi');
    const parentSegment = element.closest('[id]');
    if (parentSegment) bubble.dataset.segmentId = parentSegment.id;
    bubble.innerText = word;

    bubble.addEventListener('mouseenter', () => { clearTimeout(memHoverTimeout); });
    bubble.addEventListener('mouseleave', () => {
        if (bubble.dataset.pinned === 'false') window.removeBubbles();
    });

    document.body.appendChild(bubble);

    const rect = element.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const triggerCenter = rect.left + (rect.width / 2);
    let leftPos = triggerCenter - (bubbleRect.width / 2);
    const padding = 10;
    if (leftPos < padding) leftPos = padding;
    if (leftPos + bubbleRect.width > window.innerWidth - padding) leftPos = window.innerWidth - bubbleRect.width - padding;

    bubble.style.left = (leftPos + scrollX) + 'px';
    bubble.style.top = (rect.top + scrollY) + 'px';
    bubble.style.setProperty('--arrow-x', (triggerCenter - leftPos) + 'px');

    requestAnimationFrame(() => bubble.classList.add('visible'));
};

window.handleBubbleHover = function (element, event) { window.showBubble(element, event, true); };

window.handleBubbleLeave = function () {
    const isTouch = (Date.now() - lastMemoTouchTime < 500);
    if (isTouch) return;
    memHoverTimeout = setTimeout(() => {
        const bubble = document.querySelector('.mem-bubble');
        if (bubble && bubble.dataset.pinned === 'true') return;
        window.removeBubbles();
    }, 200);
};

window.removeBubbles = function () {
    const selection = window.getSelection();
    let shouldClearSelection = false;
    if (selection && selection.rangeCount > 0) {
        let node = selection.anchorNode;
        if (node && node.nodeType === 3) node = node.parentNode;
        if (node && node.closest('.mem-bubble')) shouldClearSelection = true;
    }
    document.querySelectorAll('.mem-bubble').forEach(el => el.remove());
    document.querySelectorAll('.mem-trigger.mem-active').forEach(el => {
        el.classList.remove('mem-active');
        el.removeAttribute('data-opened-at');
    });
    if (shouldClearSelection) selection.removeAllRanges();
};

document.addEventListener('click', (event) => {
    if (event.target.closest('.mem-bubble')) return;
    window.removeBubbles();
});
document.addEventListener('scroll', () => window.removeBubbles(), true);

window.generateThirdPartyLinks = function(slug, slugReady, texttype, translator) {
    let scLink = "";
    
    let dprUrl = null;
    if (typeof dprLinksData !== 'undefined') {
        let dprItem = dprLinksData.find(item => item[0] === slug.split('&')[0].toLowerCase());
        if (dprItem && dprItem[1]) dprUrl = "https://d.dhamma.gift/_dprhtml/index.html?loc=" + dprItem[1];
    }
    if (dprUrl) scLink += `<a target="_blank" title="Myanmar and Thai Editions at DPR" href="${dprUrl}">DPR</a>&nbsp;`;

    let bjtUrl = null;
    if (typeof bjtLinksData !== 'undefined') {
        let bjtItem = bjtLinksData.find(item => item[0] === slug.split('&')[0].toLowerCase());
        if (bjtItem && bjtItem[1]) bjtUrl = "https://open.tipitaka.lk/latn/" + bjtItem[1];
    }
    if (bjtUrl) scLink += `<a target="_blank" title="Buddha Jayanthi" href="${bjtUrl}">BJT</a>&nbsp;`;

    scLink += `<a data-slug="${texttype}/${slugReady}" href="javascript:void(0)" title="Text-to-Speech (Alt+R)" class="voice-link">Voice</a>`;

    // 4nt (s.4nt.org edition comparison) — get4ntUrl() already exists in settings.js, just
    // never got called from here (legacy read/js/common.js has the equivalent line). Needs
    // /4nt mounted on this server too (dg-light.js, symlink at repo root like login/memo).
    if (typeof get4ntUrl === 'function') {
        let url4nt = get4ntUrl(slug);
        if (url4nt) scLink += `&nbsp;<a target="_blank" class="s4ntLink" title="s.4nt.org" href="${url4nt}">4nt</a>`;
    }

    scLink += `&nbsp;<a target="_blank" title='SuttaCentral.net' href="https://suttacentral.net/${slug}">SC</a>`;
    
    const isLocal = window.location.host.includes('localhost') || window.location.host.includes('127.0.0.1');
    
    if (typeof tbwLinksData !== 'undefined') {
        const hasTbw = tbwLinksData.find(item => Array.isArray(item) ? item[0] === slug : item === slug);
        if (hasTbw) {
            if (!window.location.pathname.startsWith('/b/') && isLocal) {
                scLink += `&nbsp;<a target="" title="BB and Other translations" href="/b/?q=${slug}">BB</a>`;
            }
            const book = (slug.match(/^[a-z]+/) || [""])[0];
            scLink += `&nbsp;<a target="_blank" title="TheBuddhasWords.net" href="${isLocal ? `/bw/${book}/${slug}.html` : `https://theBuddhasWords.net/${book}/${slug}.html`}">TBW</a>`;
        }
    }

    if (typeof thruLinksData !== 'undefined') {
        const ruItem = thruLinksData.find(item => item[0] === slug);
        if (ruItem) scLink += `&nbsp;<a title="Theravada.ru" target="_blank" href="/theravada.ru/Teaching/Canon/Suttanta/Texts/${ruItem[1]}">Th.ru</a>`;
    }

    if (isLocal && typeof thsuLinksDataoffl !== 'undefined') {
        const suItem = thsuLinksDataoffl.find(item => item[0] === slug);
        if (suItem) scLink += `&nbsp;<a title="Theravada.su" target="_blank" href="/tipitaka.theravada.su/dn/${suItem[1]}">Th.su</a>`;
    } else if (!isLocal && typeof thsuLinksData !== 'undefined') {
        const suItem = thsuLinksData.find(item => item[0] === slug);
        if (suItem) scLink += `&nbsp;<a title="Theravada.su" target="_blank" href="https://tipitaka.theravada.su/${suItem[1]}">Th.su</a>`;
    }
    return scLink;
};

// ==========================================
// НОРМАЛИЗАЦИЯ SLUG (Для поиска в локальной БД)
// ==========================================
window.normalizeSlugToDbKey = function(slug) {
    slug = slug.toLowerCase().trim();
    
    if (slug.match(/^(pm|pj|ss|ay|np|pc|pd|sk|as)(\d*)$/)) {
        slug = "bu-" + slug;
    }
    
    if (!slug.match(/bu-pm|bi-pm/) && slug.match(/bu-|bi-|kd|pvr/)) {
        slug = slug.replace(/bu([psan])/, 'bu-$1').replace(/bi([psn])/, 'bi-$1');
        if (!slug.includes('pli-tv-')) slug = "pli-tv-" + slug;
        if (!slug.includes('vb-') && !slug.match(/kd|pvr/)) {
            slug = slug.replace('bu-', 'bu-vb-').replace('bi-', 'bi-vb-');
        }
    } else if (slug.match(/bu-pm|bi-pm/)) {
        slug = slug.replace(/bu([psan])/, 'bu-$1').replace(/bi([psn])/, 'bi-$1');
        if (!slug.includes('pli-tv-')) slug = "pli-tv-" + slug;
    }

    return slug;
};


// Чистый URL сутты (/{slug}?s=...&mode=...&lang=...), а не ?q={slug}&... поверх текущего пути —
// ?q= остаётся рабочим только как старый формат входа (dg-light.js всё ещё его парсит), новая
// навигация (next/prev, клавиши, клики) не должна его плодить поверх уже чистого /{slug} URL
// (было: history.pushState(..., '?q=...') резолвился ОТНОСИТЕЛЬНО текущего пути и просто
// приклеивал query-string к /dn1:1.22.2, а не заменял его на /dn10).
function buildCleanSuttaUrl(slug, params) {
    const qs = params.filter(Boolean).join('&');
    return `/${slug}${qs ? '?' + qs : ''}`;
}

// ==========================================
// SPA-НАВИГАЦИЯ (Перехват кликов для мгновенной загрузки)
// ==========================================
window.navigateSutta = function(event, slug) {
    if (event) event.preventDefault(); // Отменяем полную перезагрузку страницы

    let params = new URLSearchParams(document.location.search);
    // Сохраняем s/lang/mode/langs при переходе на след./пред. сутту — иначе выбранный язык/режим
    // (R+E, ?lang=en и т.п.) откатится к дефолту в адресной строке (сам READER_MODE в памяти
    // не меняется, но при перезагрузке/шаринге ссылки состояние потерялось бы). langs= (ручной
    // оверрайд конкретных языков контента, см. window.buildSutta) раньше сюда не попадал — при
    // переходе на след./пред. сутту он терялся, откатывая обратно на mode=/дефолт ru,en.
    let extraParams = [
        params.has("s") ? `s=${params.get("s")}` : "",
        params.has("mode") ? `mode=${params.get("mode")}` : "",
        params.has("lang") ? `lang=${params.get("lang")}` : "",
        params.has("langs") ? `langs=${params.get("langs")}` : "",
    ];

    // Меняем URL без перезагрузки — на чистый /{slug}, не ?q={slug} поверх текущего пути.
    history.pushState({ page: slug }, "", buildCleanSuttaUrl(slug, extraParams));
    
    // Обновляем инпут поиска, если он есть
    const citation = document.getElementById("paliauto");
    if (citation) citation.value = slug;
    
    // Строим сутту из памяти
    window.buildSutta(slug);
    
    // Прокручиваем страницу наверх
    window.scrollTo(0, 0);
};

// Ctrl+←/→ (пред./след. сутта) через SPA, а не полную перезагрузку. Слушатель на capture-фазе —
// перехватывает событие ДО того, как оно дойдёт до settings.js (обычный, bubble-фазный
// document.addEventListener('keydown', ...) с тем же сочетанием, который сейчас делает
// location.href = ...). Сделано в обход settings.js, чтобы не трогать его самого; когда там
// почистят дублирующий обработчик — этот можно будет оставить единственным.
document.addEventListener('keydown', (event) => {
    if (!event.ctrlKey || (event.code !== 'ArrowRight' && event.code !== 'ArrowLeft')) return;
    // Не перехватываем, если фокус в поле ввода/textarea — иначе стандартное "прыгнуть на
    // слово" (Ctrl+←/→ при редактировании текста) вместо этого листало сутты, даже когда
    // человек печатает в #paliauto или где угодно ещё. settings.js рядом уже делает такую же
    // проверку (shouldIgnoreKeyEvent), но только для #paliauto — здесь общая, по тегу.
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
    const containerId = event.code === 'ArrowRight' ? 'next' : 'previous';
    const container = document.getElementById(containerId);
    const link = container ? container.querySelector('a') : null;
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    const url = new URL(link.href);
    const slug = url.searchParams.get('q') || url.pathname.split('/').filter(Boolean).pop();
    if (slug) window.navigateSutta(null, slug);
}, true);

// Переключение режима колонок (R+R/R+E/En и т.п.) через SPA — без перезагрузки страницы.
// modeKey — ключ из window.MODE_TABLE (reader/mode-table.json, тот же файл резолвит сервер).
// Здесь берём только config.columns[0] — чисто презентационно, чтобы понять "это смена языка
// интерфейса или нет" ДО ответа сервера; сами данные (что реально показать) сервер вернёт
// заново после buildSutta(), READER_MODE.columns затем перезаписывается его ответом.
window.switchReaderMode = function(modeKey, event) {
    if (event) event.preventDefault();
    READER_MODE.modeKey = modeKey;

    // Owner: memorize mode (first-letter mnemonic) should default to punctuation removed — raw
    // punctuation just adds visual noise between the letter-triggers. A DEFAULT, not a lock:
    // only sets it the first time (localStorage key never touched before) — once the user has
    // an explicit preference either way, that wins. Same check runs on a cold ?mode=memorize
    // load too, see buildSutta() below.
    if (isMnemonicMode(modeKey) && localStorage.getItem('removePunct') === null) {
        localStorage.setItem('removePunct', 'true');
    }

    // Owner: mode TYPE and language are fully orthogonal now — switching type (single, memorize,
    // devanagari, ...) never touches ?lang=. Whatever language the URL already had stays as-is;
    // switchReadingLanguage() below is the only thing that changes it.
    let params = new URLSearchParams(document.location.search);
    params.set('mode', modeKey);
    history.pushState({ page: window._currentSlug, mode: modeKey }, "", `?${params.toString()}`);

    if (window._currentSlug) window.buildSutta(window._currentSlug);
};

// Owner: "язык в бургере... интерфейс + 1ый язык перевода. чтобы он менял и язык чтения, но
// остальные оставлял в выбранном пользователем порядке" — the EN/RU toggle should also move the
// reader to that language. Since mode TYPE no longer encodes a language at all (no more
// st/read, mt/ee per-language duplicate keys — see switchReaderMode above), there's no longer a
// "jump to the equivalent mode in the other family" step needed: the mode key stays exactly the
// same, only ?lang= (or column order, for multi-language modes) changes.
window.switchReadingLanguage = function (lang) {
    const config = window.MODE_TABLE && window.MODE_TABLE[READER_MODE.modeKey];
    if (!config) return;
    const cols = READER_MODE.columns || [];
    if (READER_MODE.lang === lang) return;

    // Owner: "lang - это язык интерфейса и первый язык в списке" — ?lang= always tracks the
    // FIRST/primary language, even in multi-language modes (reordering columns IS changing lang).
    READER_MODE.lang = lang;
    setLangOrderFirst(lang, cols);
    let params = new URLSearchParams(document.location.search);
    params.set('lang', lang);
    if (cols.length > 1) params.delete('langs'); // let it re-derive from the fresh column order below, not a stale explicit langs=
    history.pushState({ page: window._currentSlug, mode: READER_MODE.modeKey }, "", `?${params.toString()}`);
    if (typeof window.setSiteLanguage === 'function') window.setSiteLanguage(lang);
    if (window._currentSlug) window.buildSutta(window._currentSlug);
};

// ==========================================
// ЛОГИКА НАВИГАЦИИ (Без PHP и сети, из ОЗУ)
// ==========================================
window.renderNavigation = async function(slug, suttaTitle) {
    let params = new URLSearchParams(document.location.search);
    // Тот же набор параметров, что navigateSutta сохраняет при пуше в history — раньше здесь
    // была только s= (mode/lang терялись в статичном href, хотя JS-путь через onclick их уже
    // сохранял), заодно выровнено.
    let navExtraParams = [
        params.has("s") ? `s=${params.get("s").replace(/ṃ/g, "ṁ")}` : "",
        params.has("mode") ? `mode=${params.get("mode")}` : "",
        params.has("lang") ? `lang=${params.get("lang")}` : "",
        params.has("langs") ? `langs=${params.get("langs")}` : "",
    ];

    let cleanSlug = slug.replace(/pli-tv-|b[ui]-vb-/g, "");
    let cleanPaliName = (suttaTitle || "").replace(/[0-9.-]/g, '').trim();
    let newTitle = cleanPaliName ? `${cleanPaliName} ${cleanSlug}`.trim() : cleanSlug;

    document.title = newTitle;
    let metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = newTitle;
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = newTitle;

    const next = document.getElementById("next");
    const next2 = document.getElementById("next2");
    const previous = document.getElementById("previous");
    const previous2 = document.getElementById("previous2");

    let nav;
    try {
        const response = await fetch(`/api/nav/${encodeURIComponent(slug)}`);
        nav = response.ok ? await response.json() : { prev: null, next: null };
    } catch (error) {
        nav = { prev: null, next: null };
    }

    const formatLink = (entry) => {
        let name = (entry.title || "").replace(/[0-9.-]/g, '').trim();
        let outSlug = entry.slug.replace(/pli-tv-|b[ui]-vb-/g, "");
        return name === "" ? outSlug : `${outSlug} <span class="sutta-name"> ${name}</span>`;
    };

    if (nav.next) {
        let htmlNext = `<a href="${buildCleanSuttaUrl(nav.next.slug, navExtraParams)}" onclick="window.navigateSutta(event, '${nav.next.slug}')">${formatLink(nav.next)}
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="11">
                <g transform="matrix(0.021484375 0 0 0.021484375 2 -0)"><path d="M202.1 450C 196.03278 449.9987 190.56381 446.34256 188.24348 440.73654C 185.92316 435.13055 187.20845 428.67883 191.5 424.39L191.5 424.39L365.79 250.1L191.5 75.81C 185.81535 69.92433 185.89662 60.568687 191.68266 54.782654C 197.46869 48.996624 206.82434 48.91536 212.71 54.6L212.71 54.6L397.61 239.5C 403.4657 245.3575 403.4657 254.8525 397.61 260.71L397.61 260.71L212.70999 445.61C 209.89557 448.4226 206.07895 450.0018 202.1 450z" fill="#8f8f8f"/></g>
            </svg></a>`;
        if (next) next.innerHTML = htmlNext;
        if (next2) next2.innerHTML = htmlNext.replace(/class="sutta-name"/g, '');
    } else {
        if (next) next.innerHTML = "";
        if (next2) next2.innerHTML = "";
    }

    if (nav.prev) {
        let htmlPrev = `<a href="${buildCleanSuttaUrl(nav.prev.slug, navExtraParams)}" onclick="window.navigateSutta(event, '${nav.prev.slug}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="11">
                <g transform="matrix(0.021484375 0 0 0.021484375 2 -0)"><path d="M353 450C 349.02106 450.0018 345.20444 448.4226 342.39 445.61L342.39 445.61L157.5 260.71C 151.64429 254.8525 151.64429 245.3575 157.5 239.5L157.5 239.5L342.39 54.6C 346.1788 50.809414 351.70206 49.328068 356.8792 50.713974C 362.05634 52.099876 366.10086 56.14248 367.4892 61.318974C 368.87753 66.49547 367.3988 72.01941 363.61002 75.81L363.61002 75.81L189.32 250.1L363.61 424.39C 367.90283 428.6801 369.18747 435.13425 366.8646 440.74118C 364.5417 446.34808 359.06903 450.00275 353 450z" fill="#8f8f8f"/></g>
            </svg>${formatLink(nav.prev)}</a>`;
        if (previous) previous.innerHTML = htmlPrev;
        if (previous2) previous2.innerHTML = htmlPrev.replace(/class="sutta-name"/g, '');
    } else {
        if (previous) previous.innerHTML = "";
        if (previous2) previous2.innerHTML = "";
    }
};

// ==========================================
// ОСНОВНАЯ ФУНКЦИЯ СБОРКИ СУТТЫ (Без PHP)
// ==========================================
// Skeleton placeholder while the text is loading — same idea/class (.dg-skeleton-bar) as the
// search results page already uses for a pending title, defined once in search/index.html and
// available here for free since the reader lives in that same document (SPA, one page). Owner:
// the reader used to just leave the PREVIOUS sutta's text sitting on screen for the whole
// fetch+render window (measured up to ~900ms for a long sutta) — confusing, looks like nothing
// happened yet swaps abruptly. Varying widths read as paragraph lines, not a single fixed block.
function getSkeletonHTML() {
    // Was 7 lines — much shorter than a typical sutta's real rendered height, so the sudden
    // height jump when real content replaced it was visible as the fixed corner buttons
    // (scroll-to-top/TTS/language) appearing to "fly" as the page abruptly grew taller beneath
    // them (owner: "иконки футера видно как улетают"). ~6 lines per "paragraph" × 6 paragraphs
    // reads closer to a real sutta's length — still an approximation, not meant to match exactly.
    const paraWidths = [95, 88, 92, 60, 97, 75];
    const paragraphs = 6;
    let bars = '';
    for (let p = 0; p < paragraphs; p++) {
        paraWidths.forEach(function (w, i) {
            const extraGap = i === paraWidths.length - 1 ? 1.6 : 0.9;
            bars += '<div class="dg-skeleton-bar" style="display:block;width:' + w + '%;max-width:none;height:1em;margin-bottom:' + extraGap + 'em;"></div>';
        });
    }
    return '<div class="dg-sutta-skeleton" aria-hidden="true">' + bars + '</div>';
}

window.buildSutta = async function(rawSlug) {
    const slug = window.normalizeSlugToDbKey(rawSlug);
    window._currentSlug = slug;
    // Owner: the skeleton is only useful when the reader is opening cold (nothing on screen
    // yet) — swapping an ALREADY-rendered sutta out for a skeleton while the next one loads
    // (prev/next navigation, mode switch) reads as losing the text that was just there, not as
    // a loading state. Only show it when suttaArea doesn't already hold a real rendered sutta
    // (the skeleton's own wrapper doesn't count as "real" either, in case two loads overlap).
    const hasRealContent = suttaArea && suttaArea.innerHTML.trim() !== ''
        && !suttaArea.querySelector('.dg-sutta-skeleton');
    if (suttaArea && !hasRealContent) suttaArea.innerHTML = getSkeletonHTML();

    let suttaData;
    try {
        // Клиент шлёт modeKey (поведение: multiFor/dualScript/mnemonic — решает сервер, см.
        // reader/mode-table.json/dg-light.js) + lang (какой язык). Явный ?langs= в URL —
        // ручной оверрайд набора языков, работает независимо от ?mode=/?lang= (см.
        // /api/text/:suttaId в dg-light.js).
        const explicitLangs = new URLSearchParams(document.location.search).get('langs');
        let langsQuery;
        if (explicitLangs) {
            langsQuery = `langs=${encodeURIComponent(explicitLangs)}`;
        } else if (READER_MODE.modeKey === 'multiLang') {
            // Набор языков для multiLang — из уже сохранённого порядка пользователя
            // (getLangOrder(), тот же, что реордерит колонки). Owner: "не хардкодить языки" —
            // при первом заходе (порядок ещё не сохранён) единственный честный дефолт —
            // текущий язык + следующий РЕАЛЬНО доступный на сайте (availableLangs, см.
            // dg-light.js — сканируется из configs/reader/lang_*.json, не список в коде).
            // Отправляем ТОЛЬКО langs= (её первый элемент и есть текущий/первый язык) — не
            // добавляем отдельный lang=, чтобы сервер не путался, какой из двух главнее.
            let langs = getLangOrder();
            if (!langs.length) {
                langs = READER_MODE.lang ? [READER_MODE.lang] : [];
                const available = window.MODE_TABLE && window.MODE_TABLE.availableLangs;
                const next = Array.isArray(available) && available.find(l => l !== READER_MODE.lang);
                if (next) langs.push(next);
            }
            langsQuery = `mode=${encodeURIComponent(READER_MODE.modeKey)}` +
                (langs.length ? `&langs=${encodeURIComponent(langs.join(','))}` : '');
        } else {
            const langParam = READER_MODE.lang ? `&lang=${encodeURIComponent(READER_MODE.lang)}` : '';
            langsQuery = `mode=${encodeURIComponent(READER_MODE.modeKey)}${langParam}`;
        }
        // Система письма пали (Aksharamukha, см. dg-light.js) — явный ?script= в адресе
        // побеждает, иначе берём сохранённое в /settings/ значение по умолчанию
        // (localStorage.selectedScript); "ISOPali" — исходная латиница, конвертировать не нужно.
        // Owner: dualScript mode (dev/dev_en — the real "Devanagari mode", two Pali lines in
        // two scripts) needs SOME non-Latin script to show even if the user never touched the
        // /settings/ script picker — defaults to Devanagari (its namesake) only in that case;
        // every other mode's "no script chosen" default (stay Latin) is untouched.
        const dualScriptModeActive = !!(window.MODE_TABLE && window.MODE_TABLE[READER_MODE.modeKey]
            && window.MODE_TABLE[READER_MODE.modeKey].dualScript);
        const scriptParam = (new URLSearchParams(document.location.search).get('script')
            || localStorage.getItem('selectedScript')
            || (dualScriptModeActive ? 'devanagari' : '')).toLowerCase();
        const scriptQuery = (scriptParam && scriptParam !== 'isopali') ? `&script=${encodeURIComponent(scriptParam)}` : '';
        const apiUrl = `/api/text/${encodeURIComponent(slug)}?${langsQuery}${scriptQuery}`;
        const response = await fetch(apiUrl);
        if (!response.ok) {
            if (response.status === 404 && typeof window.executeGlobalSearch === 'function') {
                window.executeGlobalSearch(rawSlug);
                return false;
            }
            throw new Error(`HTTP ${response.status}`);
        }
        suttaData = await response.json();
        if (window.siteTranslatorsReady) await window.siteTranslatorsReady;
    } catch (error) {
        console.error('Ошибка загрузки текста:', error);
        if (typeof window.handleFetchError === 'function') window.handleFetchError(rawSlug, true);
        return false;
    }

    // Порядок языков-колонок — из ОТВЕТА сервера (сервер уже резолвил modeKey → columns), но
    // ПЕРЕСТАВЛЕН по сохранённому предпочтению пользователя (какой язык должен идти первым —
    // см. LANG_ORDER_KEY выше): состав колонок остаётся серверным, меняется только их порядок.
    const columns = reorderColumnsByLangOrder(suttaData.columns || []);
    READER_MODE.columns = columns; // кэш последнего известного состояния — для switchReaderMode
    READER_MODE.lang = suttaData.lang || columns[0] || READER_MODE.lang; // сервер резолвил язык явно, см. dg-light.js

    const texttype = suttaData.category || "sutta";
    let params = new URLSearchParams(document.location.search);

    let htmlData = {}, paliData = {}, varData = {}, paliIsoData = {};
    // transEntriesByLang.ru = [{translatorId, data:{segmentId: text, ...}}, ...] — сервер сам
    // решает сколько переводчиков вернуть на язык (обычно один, несколько для multiFor —
    // mt/multi), клиент просто перечисляет реально пришедшие ключи "${lang}_*" по всем
    // сегментам, не полагаясь на фиксированный список имён.
    const transEntriesByLang = {};
    const keysByLang = {};
    for (const seg of suttaData.segments) {
        if (!seg.translations) continue;
        for (const lang of columns) {
            if (!keysByLang[lang]) keysByLang[lang] = [];
            for (const key of Object.keys(seg.translations)) {
                if (key.startsWith(`${lang}_`) && !keysByLang[lang].includes(key)) {
                    keysByLang[lang].push(key);
                }
            }
        }
    }
    columns.forEach(lang => {
        transEntriesByLang[lang] = (keysByLang[lang] || []).map(key => ({
            translatorId: key.slice(lang.length + 1), key, data: {}
        }));
    });

    for (const seg of suttaData.segments) {
        htmlData[seg.segment] = seg.html || "{}";
        paliData[seg.segment] = seg.root_text || undefined;
        varData[seg.segment] = seg.variant || undefined;
        // dualScript mode only (dev/dev_en) — the original ISO/Latin Pali line, kept alongside
        // the script-converted paliData above (see dg-light.js's root_text_iso stash).
        paliIsoData[seg.segment] = seg.root_text_iso || undefined;

        columns.forEach(lang => {
            transEntriesByLang[lang].forEach(entry => {
                entry.data[seg.segment] = (seg.translations && seg.translations[entry.key]) || undefined;
            });
        });
    }

    // Подпись была захардкожена "Pāḷi Рус" всегда, даже когда реально показан английский
    // перевод (владелец: "почему Пали Рус кнопка? Пали Рус когда русская локаль, когда англ —
    // Pali Eng"). columns[0] — реальный язык текущего режима (см. комментарий выше), берём
    // отсюда, не гадаем. Карта на будущее короткая (ru/en — единственные языки с записью в
    // mode-table.json сейчас, см. CLAUDE.md) — для нового языка без своей подписи фолбэк
    // на code.toUpperCase(), не падает молча.
    const langLabels = { ru: 'Рус', en: 'Eng' };
    const secondLangLabel = langLabels[columns[0]] || (columns[0] ? columns[0].toUpperCase() : 'Рус');
    // Was: a SECOND <button id="language-button"> baked directly into this HTML string and
    // injected into #sutta on every render — duplicate id alongside the persistent page-level
    // one (search/index.html), and #language-button's CSS is position:fixed (same corner) so
    // both rendered stacked exactly on top of each other — a ghosted/doubled "Pāḷi/Eng" pill
    // (owner, screenshot: reader only, correctly not present in search results since results
    // never injects this HTML at all). toggleThePali() below (getElementById, first DOM match)
    // could end up binding its click listener to whichever instance won, leaving the other a
    // dead visual duplicate. Update the ONE real page-level button's label instead of creating
    // a second element — same dynamic per-mode text (Pāḷi Eng / Pāḷi Рус), no duplicate id.
    const languageButtonEl = document.getElementById('language-button');
    if (languageButtonEl) {
        languageButtonEl.textContent = `Pāḷi ${secondLangLabel}`;
        languageButtonEl.title = 'Переключить язык (Atl+Z или Alt+Space)';
    }
    let html = '';

    let finalRulingAnchor = "";
    if (slug.includes("bu-") || slug.includes("bi-")) {
        for (let seg in htmlData) {
            if (htmlData[seg] && htmlData[seg].includes("patimokkha")) {
                finalRulingAnchor = seg.substring(seg.indexOf(':') + 1);
                break;
            }
        }
    }

    const allTransData = columns.flatMap(lang => transEntriesByLang[lang].map(e => e.data));
    const segments = window.mergeGathas(htmlData, [paliData, varData, ...allTransData]);
    // .quote отличает реальный текст сегмента (который можно скрыть переключателем
    // Pāḷi/Рус) от byline/заголовков с тем же .pli-lang, которые всегда должны быть видны
    // (см. #sutta.hide-pali .pli-lang.quote в uiextra.css).
    const pliClass = "pli-lang inputscript-ISOPali quote";
    // Scopes the memorize-only CSS (bigger .pli-lang, .mem-trigger/.mem-bubble, etc. — see
    // reader/css/uiextra.css) so it doesn't leak into every other mode's normal rendering.
    const isMemModeRender = isMnemonicMode(READER_MODE.modeKey);
    document.body.classList.toggle('dg-mode-mem', isMemModeRender);
    // Same "default, not a lock" as switchReaderMode() — covers a cold load straight into
    // ?mode=memorize (bookmark, shared link), which never goes through that function.
    if (isMemModeRender && localStorage.getItem('removePunct') === null) {
        localStorage.setItem('removePunct', 'true');
    }

    for (let i = 0; i < segments.length; i++) {
        let segment = segments[i];

        let [openHtml, closeHtml] = htmlData[segment].split(/{}/);
        openHtml = openHtml || ''; closeHtml = closeHtml || '';

        let startIndex = segment.indexOf(':') + 1;
        let anchor = segment.substring(startIndex);
        if (slug.includes('-') && (slug.includes('an') || slug.includes('sn') || slug.includes('dhp'))) {
            anchor = segment;
        }

        var fullUrlWithAnchor = window.location.href.split('#')[0] + '#' + anchor;

        window.applyRemovePunct(paliData, segment);
        // Matches prod's devanagari.js (applyRemovePunct called on BOTH lines) — the ISO/Latin
        // second line gets the same punctuation-removal treatment as the converted-script line.
        window.applyRemovePunct(paliIsoData, segment);
        // Captured BEFORE the search-highlight block below wraps matches in <b> tags — the
        // mnemonic transform (transformToMnemonic) splits on punctuation/whitespace and would
        // shred an HTML tag into garbage "words". Same ordering as prod's memorize.js (its copy
        // is taken before highlighting runs there too).
        const isMemMode = isMnemonicMode(READER_MODE.modeKey);
        const memRawPali = isMemMode && paliData[segment] !== undefined ? paliData[segment] : null;
        const isDevMode = isDualScriptMode(READER_MODE.modeKey);

        let finder = (params.get("s") || "").replace(/ṃ/g, "ṁ");
        if (finder && finder.trim() !== "") {
            let regex = new RegExp(finder, 'gi');
            const highlight = match => `<b class='match finder'>${match}</b>`;
            try {
                if (paliData[segment]) paliData[segment] = paliData[segment].replace(regex, highlight);
                if (varData[segment]) varData[segment] = varData[segment].replace(regex, highlight);
                allTransData.forEach(data => {
                    if (data[segment]) data[segment] = data[segment].replace(regex, highlight);
                });
            } catch (error) {}
        }

        const linkToCopyStart = `<a class="text-decoration-none copyLink copyLink-start" onclick="copyToClipboard('${fullUrlWithAnchor}')"></a>`;
        let linkToCopy = `<a class="text-decoration-none copyLink" onclick="copyToClipboard('${fullUrlWithAnchor}')"></a>`;

        let hasAnyContent = paliData[segment] !== undefined || allTransData.some(data => data[segment] !== undefined);
        if (!hasAnyContent) continue;

        let inner = '';
        if (paliData[segment] !== undefined) {
            // Memorize mode: main line is the first-letter mnemonic (dict-ignore — clicking a
            // letter opens the word-reveal bubble via its own onclick, not the dictionary
            // popup), variant line skipped (not part of the memorization drill).
            const pliContent = isMemMode && memRawPali !== null
                ? transformToMnemonic(memRawPali.trim())
                : paliData[segment].trim();
            const pliSpanClass = isMemMode ? pliClass + ' dict-ignore' : pliClass;
            inner += `<span class="${pliSpanClass}" lang="pi">${linkToCopyStart}${pliContent}${linkToCopy}`;
            // dualScript mode (dev/dev_en): variant stays attached to the ISO/Latin line below
            // (matches prod's devanagari.js), not the script-converted main line here.
            if (!isMemMode && !isDevMode && varData[segment] !== undefined && varData[segment] !== '') {
                inner += `<font class="variant"><br>${linkToCopyStart}${varData[segment].trim()}${linkToCopy}</font>`;
            }
            inner += `</span>`;
        }
        // Все переводы сегмента — в общей .right-column (как на проде): CSS колоночного режима
        // (.column-view .right-column [class*="-lang"]) укладывает их блоками друг под другом,
        // без этой обёртки они текут в одну строку вперемешку. Класс — настоящий язык
        // ("${lang}-lang", нужен для hide-pali/hide-english/hide-russian, см. uiextra.css) плюс
        // .lang-2nd на второй и далее переводчик (позиционный маркер стиля, не языковой —
        // uiextra.css/rus-multi.css красят .lang-2nd приглушённым цветом).
        let rightColumnHtml = '';
        if (isMemMode) {
            // Matches prod: the "second line" isn't a translation, it's the full (untransformed)
            // Pali — the actual memorization check ("did the letters remind me of the real
            // words?"), not a translation. Reuses the mode's own family language class
            // (columns[0], e.g. "ru-lang") purely so the existing Pāḷi/Рус hide toggle still
            // shows/hides it — the content is still Pali, not a translation.
            const refLang = (columns && columns[0]) || 'ru';
            if (paliData[segment] !== undefined) {
                rightColumnHtml = `<span class="${refLang}-lang quote" lang="pi">${linkToCopyStart}${paliData[segment].trim()}${linkToCopy}</span>`;
            }
        } else if (isDevMode) {
            // The actual "Devanagari mode": main line above is Pali in the selected non-Latin
            // script, this second line is the SAME Pali in ISO/Latin script (greyed out, exactly
            // as prod's devanagari.js does it) — not a translation at all. Variant lives here,
            // under the Latin line, same as prod.
            const refLang = (columns && columns[0]) || 'ru';
            if (paliIsoData[segment] !== undefined) {
                rightColumnHtml = `<span class="${refLang}-lang greyedout quote" lang="pi">${linkToCopyStart}${paliIsoData[segment].trim()}${linkToCopy}`;
                if (varData[segment] !== undefined && varData[segment] !== '') {
                    rightColumnHtml += `<font class="variant"><br>${linkToCopyStart}${varData[segment].trim()}${linkToCopy}</font>`;
                }
                rightColumnHtml += `</span>`;
            }
        } else {
            // Все переводы сегмента — в общей .right-column (как на проде): CSS колоночного режима
            // (.column-view .right-column [class*="-lang"]) укладывает их блоками друг под другом,
            // без этой обёртки они текут в одну строку вперемешку. Класс — настоящий язык
            // ("${lang}-lang", нужен для hide-pali/hide-english/hide-russian, см. uiextra.css) плюс
            // .lang-2nd на второй и далее переводчик (позиционный маркер стиля, не языковой —
            // uiextra.css/rus-multi.css красят .lang-2nd приглушённым цветом).
            let transIndex = 0;
            columns.forEach(lang => {
                transEntriesByLang[lang].forEach(entry => {
                    const val = entry.data[segment];
                    if (val !== undefined) {
                        const posClass = transIndex === 0 ? '' : ' lang-2nd';
                        rightColumnHtml += `<span class="${lang}-lang${posClass} quote" lang="${lang}" data-translator="${entry.translatorId}">${linkToCopyStart}${val.trim()}${linkToCopy}</span>`;
                        transIndex++;
                    }
                });
            });
        }
        if (rightColumnHtml) inner += `<span class="right-column">${rightColumnHtml}</span>`;

        html += `${openHtml}<span id="${anchor}">${inner}</span>${closeHtml}\n\n`;
    }

    // Как на проде: "Pāḷi MS" отдельно от переводчиков, переводчики — в своей обёртке
    // .right-column, разделены <br>. Первый — "Пер. "/"Trn: ", второй и далее — "Перевод N: "
    // (тот же язык, как в mt) или короткая метка языка (другой язык, как в ml — "Eng: ").
    // Класс — настоящий язык ("${lang}-lang", для hide-pali/hide-english/hide-russian, wildcard
    // [class*="-lang"] в uiextra.css) плюс .lang-2nd на второй и далее переводчик — позиционный
    // маркер стиля (приглушённый цвет), не языковой. См. тот же приём в тексте сегментов ниже.
    const allEntries = columns.flatMap(lang => transEntriesByLang[lang].map(entry => ({ lang, entry })));
    const firstLang = allEntries[0] ? allEntries[0].lang : columns[0];
    const translatorSpans = allEntries.map(({ lang, entry }, i) => {
        let displayName = (window.siteTranslators && window.siteTranslators[lang] && window.siteTranslators[lang][entry.translatorId])
            || (entry.translatorId.charAt(0).toUpperCase() + entry.translatorId.slice(1));
        let label;
        if (i === 0) {
            label = lang === 'ru' ? 'Пер. ' : lang === 'en' ? 'Trn: ' : `${lang}: `;
        } else if (lang === firstLang) {
            label = lang === 'ru' ? `Перевод ${i + 1}: ` : lang === 'en' ? `Translation ${i + 1}: ` : `${lang} ${i + 1}: `;
        } else {
            label = lang === 'ru' ? 'Рус: ' : lang === 'en' ? 'Eng: ' : `${lang}: `;
        }
        const rowClass = i === 0 ? `${lang}-lang` : `${lang}-lang lang-2nd`;
        return `<span class="${rowClass}" lang="${lang}"> ${label}${displayName}</span>`;
    });

    const translatorByline = `<div id="trn" class="byline">
    <p><span class="pli-lang" lang="pi">Pāḷi <a class="text-decoration-none text-reset" href="/assets/texts/abbr.html?s=ms" title="Mahāsaṅgīti Pāḷi">MS</a></span>
    <span class="right-column">${translatorSpans.join('<br>')}</span></p></div>`;

    let cleanSlugReady = slug;

    // Mode-switch links (Ru/En/R+R/E+E/Mem/Dev/R+E) moved to the burger drawer's reading-modes
    // list (search/js/home.js paintReaderModes()) — no longer duplicated here.
    let scLink = `<p class="sc-link">`;

    if (typeof window.generateThirdPartyLinks === 'function') {
        scLink += window.generateThirdPartyLinks(slug, cleanSlugReady, texttype, transEntriesByLang[columns[0]][0]?.translatorId);
    }
    
    if (finalRulingAnchor) {
        scLink += `&nbsp;<a href="#${finalRulingAnchor}" title="К окончательному правилу">Final</a>`;
    }
    scLink += "</p>";

    const origUrl = window.location.href;
    let dUrl = origUrl.replace("/r/", "/d/");
    let thUrl = origUrl.replace("/r/", "/th/read/");

    const SHOW_CLOSE_AFTER = 10;
    let viewCount = parseInt(localStorage.getItem('warningViewCount')) || 0;
    viewCount++;
    localStorage.setItem('warningViewCount', viewCount);
    const canShowClose = viewCount >= SHOW_CLOSE_AFTER;
    const isWarningClosed = localStorage.getItem('warningClosed');

    // Раньше эта строка была захардкожена по-русски безусловно — на английской версии
    // (read/ee) тоже показывалась по-русски. Ключ и оба языка — в configs/reader/lang_{ru,en}.json
    // (reader.warningNote), не хардкод здесь — {dUrl}/{thUrl} те же токены-плейсхолдеры, что
    // {query} в search/index.html, подставляются вручную (dhamma-i18n.js textNode-substitution
    // не годится — этот HTML со ссылками собирается в JS, а не лежит в статичной DOM-разметке).
    const warningLabel = t('reader.warningNote', "<strong>Заметка:</strong><a class='text-decoration-none cursor-pointer' target='' href='{dUrl}'>&nbsp;</a>Переводы, словари и комментарии сделаны не Благословенным.<a class='text-decoration-none cursor-pointer' target='' href='{thUrl}'>&nbsp;</a>Сверяйтесь с Пали в 4 основных никаях.")
        .replace('{dUrl}', dUrl).replace('{thUrl}', thUrl);
    const warning = `
        <div class="warning-container warning-box">
        <p class='warning'>
            ${warningLabel}
                ${canShowClose && !isWarningClosed ? `<span class="close-warning">×</span>` : ''}
        </p>
        </div>
    `;

    suttaArea.innerHTML =
        `<div id="top-links-container" class="min-h-24"></div>` +
        (!isWarningClosed ? warning : '') +
        translatorByline + 
        html + 
        translatorByline + 
        (!isWarningClosed ? warning : '') + 
        `<div id="bottom-links-container" class="min-h-24"></div>`;
    
    const topContainer = document.getElementById('top-links-container');
    const bottomContainer = document.getElementById('bottom-links-container');
    if (topContainer) topContainer.innerHTML = scLink;
    if (bottomContainer) bottomContainer.innerHTML = scLink;

    window.renderNavigation(slug, suttaData.title);

    window.dispatchEvent(new Event('suttaLoaded'));
    // 'suttaRenderedCentral' — same moment, but only in the main reader window, never inside
    // the search-results citation-preview iframe (this same megareader.js runs in both). Several
    // listeners across the codebase (reader/common.js, settings.js's dictionary preload,
    // search/index.html's applyPadding) already register for BOTH names side by side, expecting
    // this one to exist too — it never actually fired (owner report traced back to this: the
    // standalone-dictionary preload-after-text-load never ran). Scoped to the central window
    // specifically so a quick citation popup doesn't eagerly pull down a multi-MB dictionary
    // database just to preview one segment.
    if (window.self === window.top) window.dispatchEvent(new Event('suttaRenderedCentral'));

    window.setupVariantVisibility();

    if (canShowClose && !isWarningClosed) {
        document.querySelectorAll('.close-warning').forEach(btn => {
        btn.addEventListener('click', function() {
            localStorage.setItem('warningClosed', 'true');
            document.querySelectorAll('.warning-container').forEach(el => el.remove());
        });
        });
    }

    window.toggleThePali();
    if (typeof window.addToSearchHistory === 'function') window.addToSearchHistory();
    return true;
};

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.page) {
        window.buildSutta(e.state.page);
    } else {
        // Резервный вариант, если в state пусто
        let params = new URLSearchParams(document.location.search);
        let slug = params.get("q");
        if (slug) window.buildSutta(slug);
    }
});

// ==========================================
// ИНИЦИАЛИЗАЦИЯ И МАРШРУТИЗАЦИЯ (SPA Routing)
// ==========================================
async function initReader() {
    await window.modeTableReady;

    // Дефолт при заходе без явного ?mode=: тип — всегда 'single' (язык режим больше не кодирует,
    // так что незачем выбирать между 'st'/'read' и т.п.), язык — из того же резолвера, что и
    // страница поиска: ?lang= → localStorage.dhammaLanguage → data-default-lang → "en"
    // (dhamma-i18n.js уже это считает, просто ждём и переиспользуем). Если режим передан явно
    // (window.READER_MODE.modeKey, см. ?mode= в reader-template.html) — ничего не трогаем.
    // Аналогично не трогаем, если явно передан ?langs= — buildSutta() всё равно шлёт его на
    // сервер напрямую (см. explicitLangs там), вывод modeKey/lang здесь только навредил бы
    // презентационным вещам, завязанным на них (панель переключения режимов и т.п.).
    const explicitLangsParam = new URLSearchParams(window.location.search).get('langs');
    if (!READER_MODE_EXPLICIT && !explicitLangsParam && window.DHAMMA_I18N_READY) {
        try { await window.DHAMMA_I18N_READY; } catch (error) {}
        const resolvedLang = (window.DHAMMA_I18N && window.DHAMMA_I18N.language)
            || localStorage.getItem('dhammaLanguage') || 'en';
        READER_MODE.modeKey = 'single';
        READER_MODE.lang = resolvedLang;
    }
    if (!READER_MODE.modeKey) READER_MODE.modeKey = 'single';

    // Читаем URL. Игнорируем путь, если используется параметр ?q=,
    // либо берём корректную часть пути, если у вас ЧПУ.
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get("q");

    // Если есть параметр ?q=, используем его, иначе пытаемся распарсить путь
    let query = searchParam || window.location.pathname.split('/').filter(Boolean).pop();

    // Старый формат: /?q=dn22#12.1 (segmentId — из хэша).
    // Новый чистый URL: /dn22:12.1 (segmentId — после ":" в самом слаге пути).
    let segmentId = window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : null;
    if (query && !searchParam && query.includes(':')) {
        const parts = query.split(':');
        query = parts[0];
        segmentId = parts.slice(1).join(':');
    }

    if (query) {
        // Заполняем инпут для удобства
        const citation = document.getElementById("paliauto");
        if (citation) citation.value = query;

        // Существование слага решает сам /api/text/:slug (200 → рендерим, 404 → поиск,
        // см. window.buildSutta) — без предзагрузки индекса всех сутт на клиенте.
        const normalizedSlug = window.normalizeSlugToDbKey ? window.normalizeSlugToDbKey(query) : query;
        // Запоминаем для живого повторного рендера при смене пунктуации/скрипта в настройках
        // (settings.js, apply-button) — без этого пришлось бы парсить URL заново или перезагружать
        // страницу целиком только ради одной текстовой настройки.
        window.currentReaderSlug = normalizedSlug;
        const rendered = await window.buildSutta(normalizedSlug);
        if (rendered && segmentId) {
            // Точное совпадение — обычный случай ("/dn1:1.22.2"). Префиксный запасной вариант —
            // для текстов-диапазонов: сервер, не найдя отдельной сутты an1.9, уводит на
            // "/an1.1-10:an1.9" (см. findRangeContaining в dg-light.js), а элементов с id
            // ровно "an1.9" там нет — сегменты внутри диапазона называются "an1.9:1.1" и т.д.
            const target = document.getElementById(segmentId)
                || document.querySelector('[id^="' + segmentId.replace(/"/g, '\\"') + ':"]');
            if (target) {
                // ?scroll=instant — тот же флаг, что уже понимает smoothScroll.js, и тот же, что
                // openFdg.js дописывает, открывая цитату из поиска во встроенном попапе-iframe:
                // там нужен именно резкий прыжок сразу на место, анимация в маленьком окне только
                // мешает. В новом окне/вкладке параметра нет — там прокрутка плавная, чтобы было
                // видно, ГДЕ в сутте находится найденное место. Здесь это не учитывалось вовсе:
                // scrollIntoView без behavior — всегда мгновенный, и оба случая выглядели одинаково.
                const instant = new URLSearchParams(window.location.search).get('scroll') === 'instant';
                target.scrollIntoView({ block: 'center', behavior: instant ? 'auto' : 'smooth' });
                // Same fallback pattern as smoothScroll.js's highlightById/highlightAllById —
                // this initial-load scroll used to jump to the segment without ever marking it
                // active-word, unlike every other scroll-to-segment path in the reader.
                if (typeof window.activateSegmentForTTS === 'function') {
                    window.activateSegmentForTTS(target);
                } else {
                    target.classList.add('active-word');
                }
            }
        } else if (rendered) {
            // No segment requested — a fresh open of this text, not a return to a saved
            // position. Without this the SPA just leaves the browser wherever the PREVIOUS
            // text's scroll happened to be (buildSutta() only replaces #sutta's content, it
            // doesn't touch scroll — a real page load would naturally start at the top, but
            // this is client-side navigation, nothing resets it on its own). Owner: new text
            // opened mid-page, at the old text's leftover scroll position.
            window.scrollTo(0, 0);
        }
    } else {
        if (typeof window.getInstructionHTML === 'function' && suttaArea) {
            // Тут ещё не было ни одного ответа сервера (buildSutta не звался) — язык берём из
            // READER_MODE.lang (уже резолвлен выше, до захода в этот блок).
            suttaArea.innerHTML = window.getInstructionHTML(READER_MODE.lang || "en");
        }
    }
}
window.initReader = initReader;

if (!window.MEGAREADER_MANUAL_INIT) {
    initReader();
}
