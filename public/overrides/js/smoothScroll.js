// === Файл: /assets/js/smoothScroll.js ===

// One scroll to an element, done properly. The target position used to be measured ONCE, when the
// element first appeared, and several smooth scrolls (this file twice, megareader.js once) raced
// each other — but the layout above the target keeps changing after that (web font swap, late
// rendering: measured ~1900px on bu-pm, 33k px down the page), so the scroll ended pages short and
// differently on every load. Now: a newer request cancels the older one, the first measurement waits
// for the fonts, and after the animation the target is measured again and corrected until it holds.
// offset: px from the viewport top, or 'center'. done(): called once the position has settled.
let dgScrollToken = 0;
window.dgScrollToElement = function (el, offset, instant, done) {
    const token = ++dgScrollToken;
    // our own scroll, not the reader's: the auto-hiding header (search/index.html) must not take its corrections
    // for a move back up and slide in at the end (owner 2026-11-01, dn2 opened from a search)
    window.dgScrollingTo = token;
    const finish = () => { if (window.dgScrollingTo === token) setTimeout(() => { if (window.dgScrollingTo === token) window.dgScrollingTo = 0; }, 100); if (done) done(); };
    const targetY = () => {
        const r = el.getBoundingClientRect();
        return Math.max(0, window.pageYOffset + r.top - (offset === 'center' ? (window.innerHeight - r.height) / 2 : offset));
    };
    const go = behavior => window.scrollTo({ top: targetY(), behavior });
    let tries = 0, held = 0;
    const settle = () => {
        if (token !== dgScrollToken) return;
        // Corrected until it holds: a long text keeps laying out while it is drawn (content-visibility estimates), and on a
        // slow phone 5 tries (1.75 s) gave up 18-25 thousand px short (QA 2026-11-07, /dn2:57.2 at 4x CPU). Up to ~8 s, and
        // done only once the place has held for two checks in a row.
        const off = Math.abs(targetY() - window.pageYOffset) > 40;
        if (off) { held = 0; if (tries++ < 24) { go('instant'); setTimeout(settle, 350); return; } }
        else if (++held < 2 && tries++ < 24) { setTimeout(settle, 350); return; }
        finish();
    };
    // The reader takes over: any manual scroll input cancels the pending corrections.
    const cancel = () => { if (token === dgScrollToken) dgScrollToken++; if (window.dgScrollingTo === token) window.dgScrollingTo = 0; };
    ['wheel', 'touchstart', 'keydown'].forEach(ev => window.addEventListener(ev, cancel, { once: true, passive: true }));
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => {
        if (token !== dgScrollToken) return;
        go(instant ? 'instant' : 'smooth');
        let called = false;
        const next = () => { if (!called) { called = true; settle(); } };
        if (instant) return setTimeout(next, 350);
        window.addEventListener('scrollend', next, { once: true }); // Chrome/Safari 18; the timer covers the rest
        setTimeout(next, 1500);
    });
};

const ScrollManager = {
    config: {
        eyeLevel: 120, // Линия глаз для сохранения прогресса
        maxWait: 8000, // Ждем загрузки AJAX до 8 секунд
    },

    scrollSaveTimeout: null,
    isWaitingForToast: false,
    hasScrolledDeep: false,

    init() {
        this.setupScrollToTop();
        
        // Автосохранение прогресса
        window.addEventListener('scroll', () => {
            if (localStorage.getItem('dg_progressEnabled') === 'false') return;

            if (document.visibilityState !== 'visible') return; 
            if (window.isRestoringProgress) return; 

            // 1. ЗАЩИТА: Если висит плашка, игнорируем мелкие скроллы.
            if (this.isWaitingForToast) {
                if (window.scrollY > 600) {
                    this.hideProgressNotification();
                } else {
                    return; 
                }
            }

            // 2. ОПТИМИЗАЦИЯ БАЗЫ: Мертвая зона наверху 
            if (window.scrollY < 500 && !this.hasScrolledDeep) return;
            if (window.scrollY >= 500) this.hasScrolledDeep = true;

            clearTimeout(this.scrollSaveTimeout);
            this.scrollSaveTimeout = setTimeout(() => this.saveReadingProgress(), 1000); 
        }, { passive: true });

        // Умная отправка в облако
        document.addEventListener('visibilitychange', () => {
            if (localStorage.getItem('dg_progressEnabled') === 'false') return;

            if (document.visibilityState === 'hidden') {
                const urlParams = new URLSearchParams(window.location.search);
                const slug = this.normalizeSlug(this.getRawSlugFromUrl(urlParams));

                if (slug && typeof syncProgressItemToCloud === 'function' && this.hasScrolledDeep) {
                    this.saveReadingProgress(); 
                    syncProgressItemToCloud(slug);
                }
            }
        });

        document.addEventListener('DOMContentLoaded', (e) => this.handleInitialScroll(e));
        window.addEventListener('suttaLoaded', (e) => this.handleInitialScroll(e));
        
        window.addEventListener('hashchange', () => {
            if (window.isRestoringProgress) return;
            this.scrollToHash();
        });
    },

    normalizeSlug(slug) {
        if (!slug) return '';
        const s = String(slug).trim();
        if (s.startsWith('memo_')) return s;
        return s.toLowerCase();
    },

    // Легаси-файл читал слаг ТОЛЬКО из ?q= — dg-node своей навигацией генерирует чистые пути
    // без него (/{slug}?s=...&mode=...&lang=..., см. megareader.js:307-310) и парсит слаг из
    // pathname с тем же фоллбэком (megareader.js:791-803: ?q= в приоритете для обратной
    // совместимости старых ссылок, иначе последний сегмент пути, отрезая ":segment" после
    // первого ":"). Без этого весь ПРИОРИТЕТ 2 (`s=` scroll) ниже молча не срабатывал бы на
    // собственной навигации dg-node — currentSlug/query были бы всегда пустыми.
    getRawSlugFromUrl(urlParams) {
        const q = urlParams.get('q');
        if (q) return q;
        const pathSlug = window.location.pathname.split('/').filter(Boolean).pop();
        if (!pathSlug) return '';
        return pathSlug.includes(':') ? pathSlug.split(':')[0] : pathSlug;
    },

    waitForElement(id) {
        return new Promise((resolve) => {
            let el = this.findFallbackElement(id);
            if (el) return resolve(el);

            const observer = new MutationObserver((mutations, obs) => {
                el = this.findFallbackElement(id);
                if (el) {
                    obs.disconnect();
                    resolve(el);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); resolve(null); }, this.config.maxWait);
        });
    },

    waitForText(searchText) {
        return new Promise((resolve) => {
            const tryFindText = () => {
                const suttaArea = document.getElementById('sutta');
                if (!suttaArea) return null;
                // megareader.js has already marked the matches, with its guards against slow patterns:
                // a pattern run again here hung the tab on /dn1?s=(.|.)*\d (review R4).
                const marked = suttaArea.querySelector('b.match.finder');
                if (marked) return marked;

                try {
                    // Same rule as megareader.js's highlight: punctuation between the letters of a
                    // plain search word is ignored ("evaṁ bhikkhave" finds "evaṁ, bhikkhave").
                    const plain = !/[.*+?^${}()|[\]\\]/.test(searchText);
                    if (!plain) return null; // a pattern is found only through megareader's marks above
                    // ...and blind to diacritics like the highlight (megareader.js foldForFind), so the
                    // node the highlight marked is the node found here.
                    const fold = plain && typeof foldForFind === 'function' ? foldForFind : (t => t);
                    const regex = new RegExp(plain ? Array.from(fold(searchText)).join('[,;:!"\'“”‘’«»]*') : searchText, 'gi');
                    const textNodes = document.evaluate(
                        ".//text()[normalize-space(parent::*) != '']",
                        suttaArea, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null
                    );
                    for (let i = 0; i < textNodes.snapshotLength; i++) {
                        const currentNode = textNodes.snapshotItem(i);
                        if (regex.test(fold(currentNode.nodeValue))) return currentNode.parentNode;
                    }
                } catch (e) {}
                return null;
            };

            let el = tryFindText();
            if (el) return resolve(el);

            const observer = new MutationObserver((mutations, obs) => {
                el = tryFindText();
                if (el) { obs.disconnect(); resolve(el); }
            });

            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); resolve(null); }, this.config.maxWait);
        });
    },

 async handleInitialScroll(event) {
        // Same text re-rendered in place (settings side panel, megareader.js buildSutta opts):
        // the caller keeps the reading place itself — no hash jump, no "Continue reading".
        if (event && event.detail && event.detail.inPlace) return;
        if (localStorage.getItem('dg_progressEnabled') === 'false') {
            window.isRestoringProgress = false;
            this.scrollToHash();
            return;
        }

        let anchorId = null;
        let offset = this.config.eyeLevel;
        let progressToOffer = null; 
        
        this.hasScrolledDeep = false; 
        this.hideProgressNotification(); 

        const urlParams = new URLSearchParams(window.location.search);
        // Явно запрошенный сегмент — это и старый формат "#3.9", и чистый путь dg-node
        // "/dn1:1.22.2" (см. getRawSlugFromUrl ниже — он сам режет по ":"). Учитывался только
        // хэш, поэтому при переходе из поиска на конкретную цитату дальше отрабатывал ПРИОРИТЕТ 3
        // и восстановленный прогресс чтения перебивал прыжок на сегмент: страница уезжала туда,
        // где человек читал в прошлый раз, а найденное место оставалось выше экрана (замерено:
        // сегмент оказывался на -65px от верха вьюпорта, то есть невидим).
        const pathSlug = window.location.pathname.split('/').filter(Boolean).pop() || '';
        const hasHash = !!window.location.hash || pathSlug.includes(':');
        
        // Получаем идентификатор текущего текста (slug) один раз для всех проверок
        const currentSlug = this.normalizeSlug(this.getRawSlugFromUrl(urlParams));

        // ПРИОРИТЕТ 1: Одноразовый прыжок из настроек
        const rawSettingsData = localStorage.getItem('exactScrollAnchor');
        if (rawSettingsData) {
            try {
                const anchor = JSON.parse(rawSettingsData);
                
                // ИСПРАВЛЕНИЕ: Жесткая сверка идентификаторов. 
                // Прыгаем, только если якорь предназначался для этой конкретной сутты.
                if (anchor.slug === currentSlug) {
                    anchorId = anchor.id;
                    offset = anchor.offset;
                }
                
                // Обязательно удаляем якорь из памяти в любом случае, 
                // чтобы предотвратить зависание старых команд
                localStorage.removeItem('exactScrollAnchor');
            } catch(e) {}
        }

        // ПРИОРИТЕТ 2: Поиск текста по ?s=... — было `query` (только ?q=), заменено на
        // currentSlug (getRawSlugFromUrl выше), чтобы срабатывало и на чистых путях dg-node.
        const finder = urlParams.get("s");

        if (!anchorId && !hasHash && finder && finder.trim() !== "" && currentSlug) {
            const textElement = await this.waitForText(finder);
            if (textElement) {
                // ?scroll=instant учитывается и здесь. Это ветка "подсветить найденное слово по
                // ?s=", и она срабатывает раньше прыжка по сегменту — а ссылки из поиска несут
                // и s=, и scroll=instant. Прокрутка была жёстко "smooth", поэтому во встроенном
                // попапе (маленькое окно, там нужен резкий прыжок) всё равно ехала анимация.
                const instantFinder = urlParams.get('scroll') === 'instant';
                // textElement is the <b class="match finder"> around the WORD, and this used to be
                // scrollIntoView({block:'start'}) on it: the matched word's line landed flush
                // with the viewport top, everything of the segment before that line was already
                // above the fold, and the fixed toolbar covered the rest — the first hit
                // scrolled out of sight (owner: kacchapa in dn1/dn2). Scroll the SEGMENT
                // container (ttsTarget, resolved below) through the same executeScroll() the
                // hash/progress paths use, with the same eye-level offset (config.eyeLevel).
                const ttsTarget = textElement.closest('[class*="-lang"], .pli-lang, .rus-lang, .eng-lang, .tha-lang') || textElement;
                this.executeScroll(ttsTarget, this.config.eyeLevel, instantFinder);
                // ВСЕ остальные scroll-to-segment пути в этом файле (scrollToHash ниже, через
                // highlightById/highlightAllById) сразу зовут activateSegmentForTTS — эта ветка
                // не звала (TODO.md ридер п.5: "не активирует динамик ттс кнопку"). Тот же
                // фоллбэк-паттерн, что и в megareader.js:803-807.
                //
                // textElement здесь — это parentNode текстового узла с совпадением (обычно сам
                // <b class="match finder"> из highlightText(), см. megareader.js:579), а не
                // сегмент-контейнер с классом *-lang. activateSegmentForTTS (settings.js) ищет
                // класс *-lang только у себя или у ДЕТЕЙ — предку не смотрит, поэтому без
                // closest() тут он молча ничего не находит и выходит. Легаси делает так же
                // (read/js/common.js:2226 — closest('.pli-lang, .rus-lang, .eng-lang, .tha-lang')
                // перед вызовом) — здесь дополнительно [class*="-lang"], т.к. megareader.js
                // использует короткие ISO-классы (ru-lang/en-lang), а не легаси rus-lang/eng-lang.
                if (typeof window.activateSegmentForTTS === 'function') {
                    window.activateSegmentForTTS(ttsTarget);
                } else {
                    textElement.classList.add('active-word');
                }
                return;
            }
        }

        // ПРИОРИТЕТ 3: Прогресс (Two-Key System)
        if (!anchorId && !hasHash) {
            if (currentSlug) {
                try {
                    const localDataRaw = JSON.parse(localStorage.getItem('dg_suttaProgress') || '{}');
                    const cloudDataRaw = JSON.parse(localStorage.getItem('dg_cloudProgress') || '{}');
                    
                    const localData = localDataRaw[currentSlug];
                    const cloudData = cloudDataRaw[currentSlug];

                    let bestData = null;

                    if (localData && cloudData) {
                        bestData = cloudData.time > localData.time ? cloudData : localData;
                    } else {
                        bestData = localData || cloudData;
                    }

                    if (bestData) {
                        const isSearchInputLoad = event && event.type === 'suttaLoaded';
                        let resumed = false;   // the app's start at the last place (resumeLastPlace below): the reader was reading here
                        try { resumed = sessionStorage.getItem('dgResumeJump') === '1'; sessionStorage.removeItem('dgResumeJump'); } catch (e) { /* none */ }
                        const forceAutoJump = resumed || localStorage.getItem('dg_autoJumpProgress') === 'true';
                        
                        if (!isSearchInputLoad || forceAutoJump) {
                            anchorId = bestData.id;
                            offset = bestData.offset || this.config.eyeLevel;
                            window.isRestoringProgress = true; 
                        } else {
                            progressToOffer = bestData; 
                        }
                    }
                } catch(e) {}
            }
        }

        if (anchorId) {
            const el = await this.waitForElement(anchorId);
            if (el) {
                this.executeScroll(el, offset, true); 
                this.hasScrolledDeep = true; 
            } else {
                window.isRestoringProgress = false;
            }
        } else {
            window.isRestoringProgress = false;
            this.scrollToHash(); 

            if (progressToOffer) {
                this.showProgressNotification(progressToOffer);
            }
        }
    },


    hideProgressNotification() {
        const existing = document.getElementById('progress-toast');
        if (existing) {
            existing.style.opacity = '0';
            existing.style.transform = 'translate(-50%, 15px)';
            setTimeout(() => existing.remove(), 300);
        }
        this.isWaitingForToast = false;
    },

    showProgressNotification(data) {
        this.hideProgressNotification(); 
        this.isWaitingForToast = true;

        // The interface language right now. window.isRu is set by several scripts by different rules
        // (URL path, a saved key, a regex match) and showed this toast in Russian on the English site.
        const ru = String((window.DHAMMA_I18N && window.DHAMMA_I18N.language) || document.documentElement.lang || '').startsWith('ru');
        const textBtn = ru ? "Продолжить чтение" : "Continue reading";
        const textCheckbox = ru ? "Больше не спрашивать" : "Don't ask again";

        const toast = document.createElement('div');
        toast.id = 'progress-toast';
        toast.className = 'dg-bottom-toast'; 
        
        toast.innerHTML = `
            <div id="progress-toast-main" class="dg-toast-main">
                <button id="btn-jump-progress" class="btn btn-sm btn-secondary rounded-pill">${textBtn}</button>
                <button id="close-progress-toast" class="dg-toast-close" title="(Esc)">&times;</button>
            </div>
            <label class="dg-toast-cb-label">
                <input type="checkbox" id="toast-dont-ask-cb" style="display: inline-block !important;">
                ${textCheckbox}
            </label>
        `;

        document.body.appendChild(toast);

        toast.addEventListener('click', async (e) => {
            const cb = document.getElementById('toast-dont-ask-cb');
            const isChecked = cb && cb.checked;

            if (e.target.id === 'close-progress-toast') {
                if (isChecked) {
                    localStorage.setItem('dg_progressEnabled', 'false');
                }
                this.hideProgressNotification();
                return;
            }
            
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL' || e.target.closest('.dg-toast-cb-label')) {
                return; 
            }
            
            if (e.target.closest('#btn-jump-progress')) {
                if (isChecked) {
                    localStorage.setItem('dg_autoJumpProgress', 'true');
                }
                this.hideProgressNotification();
                
                window.isRestoringProgress = true;
                const el = await this.waitForElement(data.id);
                if (el) {
                    this.executeScroll(el, data.offset || this.config.eyeLevel, false);
                    this.highlightById(data.id);
                    this.hasScrolledDeep = true; 
                } else {
                    window.isRestoringProgress = false;
                }
            }
        });
    },

    scrollToHash() {
        const hash = window.location.hash;
        if (!hash) return;
        
        const hashContent = hash.substring(1);
        const urlParams = new URLSearchParams(window.location.search);
        const isInstant = urlParams.get('scroll') === 'instant' || hashContent.includes('scroll=instant');
        const cleanId = hashContent.split('&')[0].split('?')[0];

        if (cleanId.includes(',')) {
            const ids = cleanId.split(','); 
            this.waitForElement(ids[0]).then(el => {
                if (el) {
                    this.executeScroll(el, window.innerHeight * 0.20, isInstant);
                    ids.forEach(id => this.highlightById(id)); 
                    this.hasScrolledDeep = true;
                }
            });
        } else {
            this.waitForElement(cleanId).then(el => {
                if (el) {
                    this.executeScroll(el, window.innerHeight * 0.20, isInstant);
                    this.highlightAllById(cleanId);
                    this.hasScrolledDeep = true;
                }
            });
        }
    },

    executeScroll(element, offsetData, isInstant) {
        const restoring = window.isRestoringProgress;
        // A #line (a favourite, "Continue reading", a shared link) is held by the site's one way of holding a line
        // (search/index.html dgHoldLine): put back every frame and on every size change until the text is quiet - the
        // scroll here landed at the top of the text or off it, the paragraphs on the way not laid out yet, and worse with
        // the size setting changed (owner 2026-11-10: favourites did not reach the line). Called again once the reader
        // has drawn the text ('suttaLoaded'), which replaces the hold from the server's text.
        if (typeof window.dgHoldLine === 'function' && typeof offsetData === 'number') {
            const id = element.id;
            const find = () => (element.isConnected ? element : (id && document.getElementById(id))) || null;
            const hold = window.dgHoldLine(find, () => offsetData, id || null);
            (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { hold.ready(); window.isRestoringProgress = false; });
            return;
        }
        window.dgScrollToElement(element, offsetData, isInstant || restoring, () => { window.isRestoringProgress = false; });
    },

    saveReadingProgress() {
        if (localStorage.getItem('dg_progressEnabled') === 'false') return;

        const urlParams = new URLSearchParams(window.location.search);
        const slug = this.normalizeSlug(this.getRawSlugFromUrl(urlParams));
        if (!slug) return;

        if (window.scrollY < 1000) {
            try {
                let progressData = JSON.parse(localStorage.getItem('dg_suttaProgress') || '{}');
                if (progressData[slug]) {
                    delete progressData[slug];
                    localStorage.setItem('dg_suttaProgress', JSON.stringify(progressData));
                }
            } catch (e) {}
            return; 
        }

        const suttaContainer = document.getElementById('sutta');
        if (!suttaContainer) return;

        // --- ИСПРАВЛЕНИЕ: Фильтруем технические блоки, ссылки и метаданные ---
        const elements = Array.from(suttaContainer.querySelectorAll('[id]')).filter(el => {
            return !el.closest('#top-links-container, #bottom-links-container, .byline, .warning-container');
        });

        if (elements.length === 0) return;

        let bestElement = null;
        let minDistance = Infinity;

        for (const el of elements) {
            const rectTop = el.getBoundingClientRect().top;
            const distance = Math.abs(rectTop - this.config.eyeLevel);

            if (distance < minDistance) {
                minDistance = distance;
                bestElement = el;
            } else if (rectTop > this.config.eyeLevel) {
                break;
            }
        }

        if (bestElement) {
            let progressData = {};
            try {
                progressData = JSON.parse(localStorage.getItem('dg_suttaProgress') || '{}');
            } catch (e) {}

            progressData[slug] = {
                id: bestElement.id,
                offset: bestElement.getBoundingClientRect().top,
                time: Date.now()
            };

            const keys = Object.keys(progressData);
            if (keys.length > 30) {
                keys.sort((a, b) => progressData[b].time - progressData[a].time);
                const newProgressData = {};
                for (let i = 0; i < 30; i++) {
                    newProgressData[keys[i]] = progressData[keys[i]];
                }
                progressData = newProgressData;
            }

            localStorage.setItem('dg_suttaProgress', JSON.stringify(progressData));
        }
    },

    // A segment id may not exist as an element: verse lines are merged in the reader (mergeGathas
    // keeps the first id, so "18.6" lives inside "18.5"), and range files name segments "an1.9:1.1".
    // Order: exact id, id prefix, then the nearest PREVIOUS segment (the one that swallowed it),
    // then the nearest NEXT one.
    findFallbackElement(baseId) {
        if (!baseId) return null;
        const idStr = String(baseId);

        let el = document.getElementById(idStr);
        if (el) return el;

        el = document.querySelector('[id^="' + idStr.replace(/["\\]/g, '\\$&') + ':"]');
        if (el) return el;

        const match = idStr.match(/(.*?)(\d+)$/);
        if (!match) return null;

        const prefix = match[1];
        const num = parseInt(match[2], 10);
        const MAX_STEPS = 10;

        for (let k = 1; k <= MAX_STEPS && num - k >= 0; k++) {
            el = document.getElementById(prefix + (num - k));
            if (el) return el;
        }
        for (let k = 1; k <= MAX_STEPS; k++) {
            el = document.getElementById(prefix + (num + k));
            if (el) return el;
        }
        return null;
    },

    highlightAllById(elementId) {
        const element = this.findFallbackElement(elementId);
        if (!element) return;

        // No blinking frame over the line any more (owner 2026-11-13: «рамка что-то не то выделяет… Актив ворд то выделяет»):
        // on a line of columns it covered the first row only; the Active Word below marks the whole line.

        // Искусственная задержка для инициализации плеера и DOM в iframe
        setTimeout(() => {
            if (typeof window.activateSegmentForTTS === 'function') {
                if (element.matches('.pli-lang, .rus-lang, .eng-lang, .tha-lang')) {
                     window.activateSegmentForTTS(element);
                } else {
                    const childLang = element.querySelector('.pli-lang, .rus-lang, .eng-lang, .tha-lang');
                    if (childLang) {
                        window.activateSegmentForTTS(childLang);
                    } else {
                        window.activateSegmentForTTS(element);
                    }
                }
            } else {
                element.classList.add('active-word');
            }
        }, 400);
    },

    highlightById(elementId) {
        const element = this.findFallbackElement(elementId);
        if (!element) return;

        // the Active Word marks it, no blinking frame (see highlightAllById)

        // Искусственная задержка для инициализации плеера и DOM в iframe
        setTimeout(() => {
            if (typeof window.activateSegmentForTTS === 'function') {
                window.activateSegmentForTTS(element);
            } else {
                element.classList.add('active-word');
            }
        }, 400);
    },


    setupScrollToTop() {
        const scrollToTopBtn = document.createElement('button');
        scrollToTopBtn.id = 'scrollToTopBtn';
        scrollToTopBtn.className = 'btn btn-secondary rounded-pill hide-button';
        scrollToTopBtn.style.display = 'none';

        const img = document.createElement('img');
        img.id = 'arrowImg';
        img.alt = 'To top';
        img.src = '/assets/svg/arrow-up-dark.svg';
        scrollToTopBtn.appendChild(img);
        
        document.body.appendChild(scrollToTopBtn);

        // Written only when it changes: every write on every scroll event invalidated the style of
        // the page, and on 1000 result rows the next layout cost about a second (2026-10-06).
        let shown = null;
        window.addEventListener('scroll', () => {
            const show = window.scrollY > 600;
            if (show === shown) return;
            shown = show;
            scrollToTopBtn.style.display = show ? 'block' : 'none';
        }, { passive: true });

        scrollToTopBtn.addEventListener('click', (event) => {
            event.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
};

ScrollManager.init();

// Opened as an app - the installed site (PWA, TWA) or the store apps - it starts where the reader left it, as a browser tab does
// (owner 2026-11-12, Trello keqnW7iC: «открывается с главной, и приходится проделывать весь путь заново»). A browser tab is left
// alone: dhamma.gift typed in it means the home page. The route is kept when the app goes to the background; a start on the bare
// home page (a shortcut or a link brings its own route) goes back to it, and ScrollManager above takes the reader to the line.
// Left on the home page = home next time. This file is one the apps refresh from the site, so it reaches them without a build.
(function resumeLastPlace() {
    const appMode = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true
        || !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (!appMode) return;
    const KEY = 'dgLastRoute', RUN = 'dgResumeRun', MAX_AGE = 30 * 24 * 3600 * 1000;
    const isHome = () => /^\/(ru\/?)?$/.test(location.pathname) && !/[?&]q=/.test(location.search) && !location.hash;
    const save = () => {
        if (/^\/(assets|settings|login)\//.test(location.pathname)) return;   // a page of its own, not the reader's place
        // a text without the line it was opened at (/mn77:1.1 -> /mn77): the reading progress takes the reader to where they
        // read to, not to the line of the link they came by (owner 2026-11-12); other places keep their address as it is
        let route = location.pathname + location.search + location.hash;
        const text = /^(\/(?:ru\/)?[a-z][a-z.-]*\d[\w.-]*):[^?#]*/i.exec(location.pathname);
        if (text) route = text[1] + location.search;
        else if (/^\/(ru\/)?[a-z][a-z.-]*\d[\w.-]*$/i.test(location.pathname)) route = location.pathname + location.search;
        try { localStorage.setItem(KEY, JSON.stringify({ route: isHome() ? '' : route, at: Date.now() })); } catch (e) { /* private mode */ }
    };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
    window.addEventListener('pagehide', save);
    try {
        if (sessionStorage.getItem(RUN)) return;   // only the first page of a run
        sessionStorage.setItem(RUN, '1');
    } catch (e) { return; }
    let last = null;
    try { last = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* none */ }
    let home = false;
    try { home = localStorage.getItem('dgStartPage') === 'home'; } catch (e) { /* default: the last place */ }   // Settings: «При запуске открывать»
    if (home || !last || !last.route || Date.now() - last.at > MAX_AGE || !isHome()) return;
    let tries = 0;
    (function go() {
        if (!isHome()) return;   // a link or a shortcut got there first
        // a page of its own (Memo, the tools, history...: their place is kept by nav-component.js) is a real navigation
        if (/^\/(memo|hatthipada|assets)\/|\.html(\?|#|$)/.test(last.route)) { location.href = last.route; return; }
        try { sessionStorage.setItem('dgResumeJump', '1'); } catch (e) { /* the offer then */ }   // straight to the progress, no offer
        if (typeof window.dgNavigateInternal === 'function') { window.dgNavigateInternal(last.route); return; }
        if (++tries < 50) setTimeout(go, 100);
    })();
})();
