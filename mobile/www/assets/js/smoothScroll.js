// === Файл: /assets/js/smoothScroll.js ===

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

                try {
                    const regex = new RegExp(searchText, 'gi');
                    const textNodes = document.evaluate(
                        ".//text()[normalize-space(parent::*) != '']",
                        suttaArea, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null
                    );
                    for (let i = 0; i < textNodes.snapshotLength; i++) {
                        const currentNode = textNodes.snapshotItem(i);
                        if (regex.test(currentNode.nodeValue)) return currentNode.parentNode;
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
                // 'auto' would defer to :root's CSS `scroll-behavior: smooth` and animate anyway —
                // literal 'instant' bypasses that CSS (same fix as megareader.js's segment jump).
                textElement.scrollIntoView({ behavior: instantFinder ? "instant" : "smooth", block: "start" });
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
                const ttsTarget = textElement.closest('[class*="-lang"], .pli-lang, .rus-lang, .eng-lang, .tha-lang') || textElement;
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
                        const forceAutoJump = localStorage.getItem('dg_autoJumpProgress') === 'true';
                        
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

        const textBtn = window.isRu ? "Продолжить чтение" : "Continue reading";
        const textCheckbox = window.isRu ? "Больше не спрашивать" : "Don't ask again";

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
        const absoluteY = window.pageYOffset + element.getBoundingClientRect().top;
        const targetY = absoluteY - offsetData;

        if (isInstant || window.isRestoringProgress) {
            const html = document.documentElement;
            const prevBehavior = getComputedStyle(html).scrollBehavior;
            html.style.scrollBehavior = 'auto'; 
            
            window.scrollTo({ top: targetY, behavior: 'auto' });
            
            requestAnimationFrame(() => {
                const correctedY = window.pageYOffset + element.getBoundingClientRect().top - offsetData;
                window.scrollTo(0, correctedY);
                html.style.scrollBehavior = prevBehavior;
                setTimeout(() => window.isRestoringProgress = false, 150);
            });
        } else {
            window.scrollTo({ top: targetY, behavior: 'smooth' });
            setTimeout(() => window.isRestoringProgress = false, 800);
        }
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

    findFallbackElement(baseId) {
        if (!baseId) return null;
        const idStr = String(baseId);
        
        let el = document.getElementById(idStr);
        if (el) return el;
        
        const match = idStr.match(/(.*?)(\d+)$/);
        if (!match) return null;
        
        let prefix = match[1];
        let num = parseInt(match[2], 10);
        
        if (num - 1 >= 0) {
            return document.getElementById(prefix + (num - 1));
        }
        return null;
    },

    highlightAllById(elementId) {
        const element = this.findFallbackElement(elementId);
        if (!element) return;

        const originalPosition = element.style.position;
        if (getComputedStyle(element).position === 'static') {
            element.style.position = 'relative';
        }

        const overlay = document.createElement('div');
        overlay.style.position = 'absolute';
        overlay.style.top = '0'; overlay.style.left = '0';
        overlay.style.width = '100%'; overlay.style.height = '100%';
        overlay.style.pointerEvents = 'none'; overlay.style.zIndex = '10';
        overlay.style.borderRadius = getComputedStyle(element).borderRadius;
        overlay.style.transition = 'background-color 0.45s ease-in-out';
        overlay.style.backgroundColor = 'transparent';
        element.appendChild(overlay);

        let blinkCount = 0;
        const blinkInterval = setInterval(() => {
            overlay.style.backgroundColor = blinkCount % 2 === 0 ? 'rgba(26, 188, 156, 0.25)' : 'transparent';
            blinkCount++;
            if (blinkCount >= 6) { 
                clearInterval(blinkInterval);
                setTimeout(() => {
                    if (overlay.parentNode === element) element.removeChild(overlay);
                    if (!originalPosition) element.style.removeProperty('position');
                    else element.style.position = originalPosition;
                }, 450);
            }
        }, 450);

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

        const originalTransition = element.style.transition;
        const originalBoxShadow = element.style.boxShadow;
        const originalBorderRadius = element.style.borderRadius;
        element.style.borderRadius = '6px';
        element.style.transition = 'box-shadow 0.3s ease-in-out';
        
        let blinkCount = 0;
        let isWide = false;
        
        const blinkInterval = setInterval(function() {
            element.style.boxShadow = isWide ? '0 0 0 2px grey' : '0 0 0 5px rgba(128,128,128, 0.5)';
            isWide = !isWide;
            blinkCount++;
            if (blinkCount >= 6) {
                clearInterval(blinkInterval);
                setTimeout(() => {
                    element.style.removeProperty('box-shadow');
                    element.style.removeProperty('transition');
                    element.style.removeProperty('border-radius');
                    if (originalBoxShadow) element.style.boxShadow = originalBoxShadow;
                    if (originalTransition) element.style.transition = originalTransition;
                    if (originalBorderRadius) element.style.borderRadius = originalBorderRadius;
                }, 300);
            }
        }, 400);

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

        window.addEventListener('scroll', () => {
            scrollToTopBtn.style.display = window.scrollY > 600 ? 'block' : 'none';
        }, { passive: true });

        scrollToTopBtn.addEventListener('click', (event) => {
            event.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
};

ScrollManager.init();
