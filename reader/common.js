// Портировано из C:\soft\dg\read\js\common.js (строки ~1-10, 2002-2411) — визуальные иконки
// play/link на заголовочной строке (id="0.1") и контекстное меню (Цитата/Ссылка/Голос/Закладка/
// Запомнить/Сравнить), открывающееся кликом по любой невидимой .copyLink ссылке. CSS для всего
// этого уже был в reader/css/uiextra.css (#segment-context-menu, .title-play-btn, .title-svg-icon,
// .copy-Link-special, .trn-title-icon) — не хватало только этой JS-логики.
//
// Легаси определял isRuPath/isLocalHost по префиксу пути (/r/, /ru/...) — здесь языка колонки
// определяется через localStorage.dhammaLanguage (см. megareader.js), не через путь.
window.isRuPath = (localStorage.getItem('dhammaLanguage') || 'en') === 'ru';
window.isLocalHost = window.location.host.includes('localhost') || window.location.host.includes('127.0.0.1');

// SPA (search/index.html) injects this script LAZILY, on first text open — well after the
// page's own DOMContentLoaded already fired, so a plain 'DOMContentLoaded' listener below would
// never run (event fires once, already past). reader-template.html loads this script eagerly at
// parse time, where the plain listener was fine — SPA needs the "already ready" branch too.
function onReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

// TODO.md общие п.2: siteLanguage — легаси-ключ, от которого напрямую зависит облачная
// синхронизация (settings.js, портирован из assets/js/settings.js почти дословно — тот же
// код читает siteLanguage при сохранении/восстановлении настроек). На странице поиска мост уже
// есть (search/index.html), в ридере его не было вообще (grep — ноль совпадений) — язык,
// выбранный в ридере, не долетал ни до легаси-страниц, ни обратно при восстановлении настроек
// из облака. Тот же паттерн: сид один раз при загрузке + досинхронизация на живую смену языка.
if (!localStorage.getItem('siteLanguage')) {
    localStorage.setItem('siteLanguage', localStorage.getItem('dhammaLanguage') || 'en');
}
window.siteLanguage = localStorage.getItem('siteLanguage') || 'en';
document.addEventListener('dhamma:languagechange', function (e) {
    var lang = e.detail && e.detail.language;
    if (!lang) return;
    window.siteLanguage = lang;
    try { localStorage.setItem('siteLanguage', lang); } catch (_) {}
});

// TODO.md ридер п.2: клик по кнопке языка (.btn-language) в шестерёнке настроек ничего не делал —
// разметка (reader-template.html) скопирована с той же кнопки на странице поиска
// (search/index.html), а обработчик клика — нет, его нигде не было. Тот же паттерн, что на
// поиске: читаем data-lang (i18n подставляет его из {{locale.targetLanguageCode}} — единственная
// кнопка-тумблер "переключить на другой язык", не пара как на поиске) и зовём setSiteLanguage().
// Она сама вызывает applySubtree() и переприменяет {{locale.*}} — кнопка сама перерисуется с
// новым target-языком, отдельно ничего обновлять не нужно.
onReady(function () {
    document.querySelectorAll('.btn-language').forEach(function (btn) {
        btn.addEventListener('click', function (event) {
            event.preventDefault();
            var newLang = this.getAttribute('data-lang');
            if (newLang && typeof window.setSiteLanguage === 'function') {
                window.setSiteLanguage(newLang);
            }
        });
    });
});

// ==========================================
// ИКОНКИ АУДИО И ПОДЕЛИТЬСЯ ДЛЯ СТРОКИ 0.1 (заголовок сутты/раздела)
// ==========================================
function addIconsTo01() {
    const segment01 = document.getElementById('0.1');
    if (!segment01) return;

    if (segment01.classList.contains('icons-added')) return;
    segment01.classList.add('icons-added');

    const langSpans = segment01.querySelectorAll('[class*="-lang"]');

    langSpans.forEach((span, index) => {
        // Если это первый доступный язык (любой), он главный. Остальные скрыты по умолчанию.
        const hideClass = index === 0 ? '' : 'trn-title-icon';

        // 1. Убираем стартовые якоря, они здесь не нужны
        const copyStarts = span.querySelectorAll('.copyLink-start');
        copyStarts.forEach(el => el.remove());

        // 2. Находим конечную ссылку и вешаем классы для CSS
        const oldLinks = span.querySelectorAll('.copyLink');
        if (oldLinks.length > 0) {
            const shareLink = oldLinks[oldLinks.length - 1];

            shareLink.classList.add('copy-Link-special');
            if (hideClass) {
                shareLink.classList.add(hideClass);
            }

            // Вставляем SVG вместо текста и прячем от TTS
            shareLink.innerHTML = '<img src="/assets/svg/link-solid-full.svg" class="title-svg-icon" alt="" aria-hidden="true">';

            // Удаляем дубликаты
            for (let i = 0; i < oldLinks.length - 1; i++) {
                oldLinks[i].remove();
            }
        }

        // 3. Добавляем SVG Play в начало
        const playBtn = document.createElement('span');
        playBtn.className = hideClass ? `title-play-btn ${hideClass}` : 'title-play-btn';
        playBtn.innerHTML = '<img src="/assets/svg/volume-solid-full.svg" class="title-svg-icon" alt="" aria-hidden="true">';

        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof window.activateSegmentForTTS === 'function') {
                window.activateSegmentForTTS(span);

                const playerContainer = document.getElementById('voice-player-container');
                const isPlayerActive = playerContainer && playerContainer.classList.contains('active');

                if (isPlayerActive) {
                    const mainPlayBtn = playerContainer.querySelector('.play-main-button');
                    if (mainPlayBtn) mainPlayBtn.click();
                } else if (!window.isVoiceScriptLoaded && typeof window.loadVoiceScripts === 'function') {
                    window.loadVoiceScripts(() => {
                        // voice.js определяет window.isRu по пути (/r/, /ru/...) при первой
                        // загрузке — у нас пути чистые (/dn22), поэтому переопределяем на
                        // основе реального языка колонки сразу после загрузки скрипта.
                        window.isRu = window.isRuPath;
                        const dynamicBtn = document.querySelector('.dynamic-tts-btn');
                        if (dynamicBtn) dynamicBtn.click();
                    });
                } else {
                    const dynamicBtn = document.querySelector('.dynamic-tts-btn');
                    if (dynamicBtn) dynamicBtn.click();
                }
            }
        });

        span.insertBefore(playBtn, span.firstChild);
    });
}

// Привязываем выполнение к стандартным событиям окончания загрузки сутты
window.addEventListener('suttaLoaded', addIconsTo01);
window.addEventListener('suttaRenderedCentral', addIconsTo01);

// ==========================================
// Контекстное меню на невидимых .copyLink ссылках (Цитата/Ссылка/Голос/Закладка/Запомнить/Сравнить)
// ==========================================
onReady(() => {
    const labels = {
        quote: window.isRuPath ? 'Цитата' : 'Quote',
        link: window.isRuPath ? 'Ссылка' : 'Link',
        audio: window.isRuPath ? 'Слушать' : 'Voice',
        bookmark: window.isRuPath ? 'Избранное' : 'Bookmark',
        memo: window.isRuPath ? 'Запомнить' : 'Memorize',
        compare: window.isRuPath ? 'Сравнить' : 'Compare'
    };

    // 1. Создаём HTML структуру меню
    const menuHtml = `
    <div id="segment-context-menu" class="segment-menu-hidden">
      <ul>
        <li id="sm-quote"><img src="/assets/svg/copy.svg" class="menu-icon" alt=""> ${labels.quote}</li>
        <li id="sm-link"><img src="/assets/svg/copy.svg" class="menu-icon" alt=""> ${labels.link}</li>
        <li id="sm-audio"><img src="/assets/svg/play.svg" class="menu-icon" alt=""> ${labels.audio}</li>
        <li id="sm-bookmark"><img src="/assets/svg/star-black.svg" class="menu-icon" alt=""> ${labels.bookmark}</li>
        <li id="sm-memo"><img src="/assets/svg/memo-black.svg" class="menu-icon" alt=""> ${labels.memo}</li>
        <li id="sm-compare"><img src="/assets/svg/code-compare-solid-full.svg" class="menu-icon" alt=""> ${labels.compare}</li>
      </ul>
    </div>
  `;
    document.body.insertAdjacentHTML('beforeend', menuHtml);

    const menu = document.getElementById('segment-context-menu');
    let currentContext = null;

    // 2. Открытие меню по клику на .copyLink — capture-фаза: перехватывает ДО инлайнового
    // onclick="copyToClipboard(...)" на самой ссылке (см. megareader.js), иначе клик срабатывал
    // бы дважды (инлайн + меню). "Цитата" в меню сама переигрывает клик с isSimulated=true, чтобы
    // тот самый инлайн-onclick сработал по-настоящему один раз.
    document.addEventListener('click', (e) => {
        if (e.isSimulated) return;

        const copyBtn = e.target.closest('.copyLink');

        if (copyBtn) {
            e.preventDefault();
            e.stopImmediatePropagation();

            const memoBtn = document.getElementById('sm-memo');
            if (memoBtn) {
                const isMeditate = Math.random() > 0.5;
                const textRu = isMeditate ? 'Медитировать' : 'Запомнить';
                const textEn = isMeditate ? 'Meditate' : 'Memorize';
                memoBtn.innerHTML = `<img src="/assets/svg/memo-black.svg" class="menu-icon" alt=""> ${window.isRuPath ? textRu : textEn}`;
            }

            const parentSpan = copyBtn.closest('span[id]');
            if (!parentSpan) return;

            const onclickAttr = copyBtn.getAttribute('onclick') || '';
            const urlMatch = onclickAttr.match(/copyToClipboard\('([^']*)'\)/);
            let rawUrl = urlMatch ? urlMatch[1] : window.location.href;

            currentContext = {
                element: copyBtn,
                parentSpan: parentSpan,
                url: rawUrl,
                hash: parentSpan.id.toLowerCase()
            };

            menu.style.left = '-9999px';
            menu.style.top = '-9999px';
            menu.classList.remove('segment-menu-hidden');

            const btnRect = copyBtn.getBoundingClientRect();
            const menuRect = menu.getBoundingClientRect();

            const offsetTop = 25;
            const offsetLeft = 0;

            let left = btnRect.left + offsetLeft;
            let top = btnRect.top + window.scrollY + offsetTop;

            if (left + menuRect.width > window.innerWidth) {
                left = window.innerWidth - menuRect.width - 10;
            }

            if (top + menuRect.height > window.innerHeight + window.scrollY) {
                top = btnRect.top + window.scrollY - menuRect.height - 10;
            }

            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;

            return;
        }

        if (!menu.contains(e.target)) {
            menu.classList.add('segment-menu-hidden');
        }
    }, true);

    // 3. Логика кнопок меню

    // --- ЦИТАТА ---
    document.getElementById('sm-quote').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('segment-menu-hidden');
        if (!currentContext) return;

        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
        clickEvent.isSimulated = true;
        currentContext.element.dispatchEvent(clickEvent);
    });

    // --- ССЫЛКА ---
    document.getElementById('sm-link').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('segment-menu-hidden');
        if (!currentContext) return;

        try {
            const baseUrl = new URL(currentContext.url);
            if (baseUrl.searchParams.has('q')) {
                baseUrl.searchParams.set('q', baseUrl.searchParams.get('q').toLowerCase());
            }
            baseUrl.hash = currentContext.hash;
            let finalUrl = baseUrl.href;

            if (window.isLocalHost) {
                finalUrl = finalUrl.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/gi, 'https://dhamma.gift');
            }

            navigator.clipboard.writeText(finalUrl).then(() => {
                if (typeof showBubbleNotification === 'function') {
                    showBubbleNotification(window.isRuPath ? "Ссылка скопирована" : "Link copied");
                }
            });
        } catch (err) {
            console.error('URL parse error', err);
        }
    });

    // --- АУДИО ---
    document.getElementById('sm-audio').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('segment-menu-hidden');
        if (!currentContext) return;

        const targetLangSegment = currentContext.element.closest('[class*="-lang"]');

        if (targetLangSegment && typeof window.activateSegmentForTTS === 'function') {
            window.activateSegmentForTTS(targetLangSegment);

            const playerContainer = document.getElementById('voice-player-container');
            const isPlayerActive = playerContainer && playerContainer.classList.contains('active');

            if (isPlayerActive) {
                const playBtn = playerContainer.querySelector('.play-main-button');
                if (playBtn) playBtn.click();
            } else if (!window.isVoiceScriptLoaded && typeof window.loadVoiceScripts === 'function') {
                window.loadVoiceScripts(() => {
                    window.isRu = window.isRuPath;
                    const dynamicBtn = document.querySelector('.dynamic-tts-btn');
                    if (dynamicBtn) dynamicBtn.click();
                });
            } else {
                const dynamicBtn = document.querySelector('.dynamic-tts-btn');
                if (dynamicBtn) dynamicBtn.click();
            }
        }
    });

    // --- ЗАКЛАДКА ---
    document.getElementById('sm-bookmark').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('segment-menu-hidden');
        if (!currentContext) return;

        if (typeof toggleFavoriteGlobal === 'function') {
            // URL чистый (/dn22), не ?q=dn22 — реальный слаг лежит в window._currentSlug
            // (megareader.js buildSutta), а не в query-параметрах.
            const q = window._currentSlug || '';

            const targetLangSegment = currentContext.element.closest('[class*="-lang"]');
            const fallbackSpan = currentContext.parentSpan.querySelector('[class*="-lang"]:not(.pli-lang)') || currentContext.parentSpan.querySelector('.pli-lang');
            const textSpan = targetLangSegment || fallbackSpan;

            let textSnippet = textSpan ? textSpan.textContent.replace(/[✦]/g, '').trim().substring(0, 40) + '...' : currentContext.hash;

            const uniqueLineSlug = `${q}#${currentContext.hash}`;

            const bookmarkData = {
                slug: uniqueLineSlug,
                id: currentContext.hash,
                title: `${q} - ${textSnippet}`,
                path: window.location.pathname,
                search: window.location.search + '#' + currentContext.hash,
                timestamp: Date.now()
            };

            toggleFavoriteGlobal(bookmarkData);
        }
    });

    // --- MEMO (ЗАПОМИНАНИЕ) ---
    document.getElementById('sm-memo').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('segment-menu-hidden');
        if (!currentContext) return;

        const suttaContainer = document.getElementById('sutta') || document;
        const targetLangSegment = currentContext.element.closest('[class*="-lang"]');

        // Реальный язык — из lang="", а не из позиционных rus-lang/eng-lang (их больше нет),
        // так режим корректно обобщается на любой язык, не только ru/en/th.
        let targetSelector = '.pli-lang';
        const targetLang = targetLangSegment && targetLangSegment.getAttribute('lang');
        if (targetLang) targetSelector = `[lang="${targetLang}"]`;

        let allValidElements = Array.from(suttaContainer.querySelectorAll(targetSelector));

        if (allValidElements.length === 0) {
            allValidElements = Array.from(suttaContainer.querySelectorAll('p, h1, h2, h3, h4, li, blockquote'));
        }

        allValidElements = allValidElements.filter(el =>
            el.offsetParent !== null && !el.closest('.tts-ignore, nav, footer, .input-group')
        );

        const segmentId = currentContext.parentSpan.id;
        let startIndex = allValidElements.findIndex(el => el.id === segmentId || el.closest(`[id="${segmentId}"]`));

        let textToPass = '';
        const MAX_CHARS = 1200;
        const URL_MAX_LENGTH = 1500;

        if (startIndex !== -1) {
            let currentLength = 0;
            let textArr = [];
            for (let i = startIndex; i < allValidElements.length; i++) {
                let text = (allValidElements[i].innerText || allValidElements[i].textContent).replace(/✦/g, '').trim();
                if (text) {
                    if (currentLength + text.length > MAX_CHARS) {
                        let remainingSpace = Math.max(0, MAX_CHARS - currentLength - 3);
                        if (remainingSpace > 0) textArr.push(text.substring(0, remainingSpace) + '...');
                        break;
                    }
                    textArr.push(text);
                    currentLength += text.length + 1;
                }
            }
            textToPass = textArr.join('\n');
        }

        const baseUrl = window.isRuPath ? '/ru/memo/' : '/memo/';

        if (textToPass) {
            if (textToPass.length <= URL_MAX_LENGTH) {
                localStorage.removeItem('currentMemoText');
                window.open(`${baseUrl}?text=${encodeURIComponent(textToPass)}`, '_blank');
            } else {
                localStorage.setItem('currentMemoText', textToPass);
                window.open(baseUrl, '_blank');
            }
        } else {
            localStorage.removeItem('currentMemoText');
            window.open(baseUrl, '_blank');
        }
    });

    // --- СРАВНИТЬ (COMPARE) - ЛОКАЛЬНАЯ И ОНЛАЙН ВЕРСИИ ---
    document.getElementById('sm-compare').addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('segment-menu-hidden');
        if (!currentContext) return;

        const urlParams = new URLSearchParams(window.location.search);
        // URL чистый (/dn22), не ?q=dn22 — реальный слаг лежит в window._currentSlug.
        let slug = window._currentSlug;
        const sParam = urlParams.get('s');

        if (!slug) return;

        slug = slug.split('&')[0].toLowerCase();

        if (typeof get4ntUrl === 'function') {
            let url4nt = get4ntUrl(slug);

            if (url4nt) {
                try {
                    const anchorBase = url4nt.split('#')[1] || slug;
                    const urlWithoutHash = url4nt.split('#')[0];

                    const parsedUrl = new URL(urlWithoutHash, window.location.origin);

                    if (!window.isLocalHost) {
                        parsedUrl.protocol = 'https:';
                        parsedUrl.hostname = 's.dhamma.gift';
                        parsedUrl.pathname = parsedUrl.pathname.replace(/^\/4nt/, '');
                    }

                    const newParams = new URLSearchParams();
                    newParams.set('cols', 'pali,pali_royal_iast,pali_myanmar_iast,pali_bjt_iast');

                    if (sParam) {
                        newParams.set('s', sParam);
                    }

                    parsedUrl.search = newParams.toString();

                    if (slug.includes('-')) {
                        parsedUrl.hash = `#tr-${currentContext.hash}`;
                    } else {
                        parsedUrl.hash = `#tr-${anchorBase}:${currentContext.hash}`;
                    }

                    window.open(parsedUrl.href, '_blank');
                } catch (err) {
                    console.error('Ошибка при формировании ссылки для сравнения:', err);
                }
            } else {
                console.warn('Функция get4ntUrl не вернула ссылку для slug:', slug);
            }
        } else {
            console.error('Функция get4ntUrl не определена на странице.');
        }
    });
});

// ==========================================
// TOC (оглавление) — портировано из siteroot/read/js/common.js (легаси, общий с прод-сайтом,
// его не трогаем; строки ~1407-1815 там: getTOCNodes/syncTOC/buildFullTOC/клик-тоггл).
// Пропущено сознательно: initSwipeGestures (смахивание для закрытия панели — не критично) и
// isMemoPath-ветка (режима "запомнить" в этом проекте нет). Кнопка теперь живёт ВНУТРИ
// #reader-toolbar как рядовая иконка (search/index.html) — раньше была отдельной плавающей
// пилюлей со своим fade-in/out по скроллу (#smart-toc-container, position:fixed), но раз весь
// #reader-toolbar и так появляется/прячется через autoHideHeader() (search/index.html), вторая
// независимая анимация не нужна — .icon-only/.visible-переключение по scroll-позиции из легаси
// тоже не портировано, класс "visible" в разметке просто стоит статически.
// activeSlug — не URL ?q= (легаси-формат), а window._currentSlug (см. sm-compare/sm-bookmark
// выше в этом файле) — тот самый источник, что этот проект уже использует для чистых URL.
(function () {
    var activeSlug = '';
    var cachedTOCNodes = null;

    function capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function throttle(fn, wait) {
        var last = 0;
        return function () {
            var now = Date.now();
            if (now - last >= wait) { last = now; fn.apply(this, arguments); }
        };
    }

    function getTOCNodes() {
        if (cachedTOCNodes) return { nodes: cachedTOCNodes };

        var suttaContainer = document.getElementById('sutta');
        if (!suttaContainer) return { nodes: [] };

        var hasInternalHeaders = suttaContainer.querySelector('h3, h4, h5, h6') !== null;
        var selector = 'h1, h2, .endsutta';
        if (hasInternalHeaders) {
            selector += ', h3, h4, h5, h6';
        } else {
            selector += ', .speaker, .rule, .subrule, .verse-line, .anapatti, .uddana-intro';
        }

        var standardNodes = Array.from(suttaContainer.querySelectorAll(selector)).filter(function (el) {
            if (el.classList.contains('verse-line')) {
                var parentBlock = el.closest('blockquote, section');
                if (parentBlock && (parentBlock.querySelector('.uddana-intro') ||
                    (parentBlock.previousElementSibling && parentBlock.previousElementSibling.classList.contains('uddana-intro')))) return false;
                var firstContentBlock = suttaContainer.querySelector('p, blockquote, .rule');
                if (firstContentBlock && (firstContentBlock === parentBlock || firstContentBlock.contains(el))) return false;
                if (el !== (parentBlock && parentBlock.querySelector('.verse-line'))) return false;
            }
            return el.innerText.trim().length > 0;
        });

        var realHeaders = suttaContainer.querySelectorAll('h2, h3, h4, h5, h6');
        var segments = Array.from(suttaContainer.querySelectorAll('span[id]'));
        var fallbackNodes = [];

        // Длинные плоские тексты без внутренних заголовков (например, длинная сутта одним
        // потоком) — берём 4 условные "четверти" по номеру сегмента как ориентиры, иначе TOC
        // был бы пустым/бесполезным для навигации по такому тексту.
        if (realHeaders.length <= 3 && segments.length > 120 && !hasInternalHeaders) {
            [0, 0.25, 0.5, 0.75].forEach(function (frac) {
                var targetIndex = Math.floor(segments.length * frac);
                var found = segments[targetIndex];
                for (var i = targetIndex; i < Math.min(targetIndex + 20, segments.length); i++) {
                    if (segments[i].id.match(/\.1$/)) { found = segments[i]; break; }
                }
                if (found && fallbackNodes.indexOf(found) === -1 && standardNodes.indexOf(found) === -1) {
                    found.dataset.fallback = 'true';
                    fallbackNodes.push(found);
                }
            });
        }

        var combinedNodes = standardNodes.concat(fallbackNodes);
        combinedNodes.sort(function (a, b) {
            if (a === b) return 0;
            return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
        });

        cachedTOCNodes = combinedNodes;
        return { nodes: cachedTOCNodes };
    }

    function syncTOC() {
        var suttaContainer = document.getElementById('sutta');
        var pillLabel = document.getElementById('smart-toc-current');
        var tocPanel = document.getElementById('smart-toc-panel');
        var tocBtn = document.getElementById('smart-toc-btn');
        if (!suttaContainer || !pillLabel) return;

        var currentSlug = window._currentSlug || '';
        if (activeSlug !== currentSlug) {
            activeSlug = currentSlug;
            cachedTOCNodes = null;
            if (tocPanel) { tocPanel.innerHTML = ''; tocPanel.classList.remove('active'); }
        }

        var headings = getTOCNodes().nodes;
        if (tocBtn) tocBtn.classList.toggle('hidden-toc', headings.length === 0);
        if (headings.length === 0) return;

        var activeIndex = 0;
        var eyeLevel = window.innerHeight * 0.4;
        for (var i = headings.length - 1; i >= 0; i--) {
            if (headings[i].getBoundingClientRect().top <= eyeLevel) { activeIndex = i; break; }
        }

        var langClass = window.isRuPath ? '.rus-lang' : '.eng-lang';
        var labelText = headings[activeIndex].innerText;

        if (headings[activeIndex].tagName.startsWith('H')) {
            labelText = labelText.replace(/\s+/g, ' ').trim();
            if (headings[activeIndex].classList.contains('inserted-heading')) {
                var tSpan = headings[activeIndex].querySelector(langClass) || headings[activeIndex].querySelector('.eng-lang');
                if (tSpan) labelText = tSpan.textContent.trim();
            }
            pillLabel.textContent = capitalize(labelText);
        } else if (headings[activeIndex].classList.contains('endsutta') || headings[activeIndex].classList.contains('uddana-intro')) {
            var tSpan2 = headings[activeIndex].querySelector(langClass) || headings[activeIndex].querySelector('.eng-lang') || headings[activeIndex].querySelector('.pli-lang');
            labelText = tSpan2 ? tSpan2.textContent.replace(/[()\[\]"“”«»'‘’]/g, '').trim() : labelText.replace(/[()\[\]"“”«»'‘’]/g, '').trim();
            pillLabel.textContent = capitalize(labelText);
        } else {
            pillLabel.textContent = capitalize(labelText.split('\n')[0].trim());
        }

        if (tocPanel && tocPanel.classList.contains('active')) {
            var tocItems = tocPanel.querySelectorAll('.toc-item');
            var newActive = tocItems[activeIndex];
            var currentActive = tocPanel.querySelector('.toc-item.active');
            if (newActive && currentActive !== newActive) {
                if (currentActive) currentActive.classList.remove('active');
                newActive.classList.add('active');
                var panelHeight = tocPanel.clientHeight;
                var itemTop = newActive.offsetTop;
                var itemHeight = newActive.clientHeight;
                tocPanel.scrollTo({ top: itemTop - (panelHeight / 2) + (itemHeight / 2), behavior: 'smooth' });
            }
        }
    }

    function buildFullTOC() {
        var suttaContainer = document.getElementById('sutta');
        var tocPanel = document.getElementById('smart-toc-panel');
        if (!suttaContainer || !tocPanel) return;

        var headings = getTOCNodes().nodes;
        tocPanel.innerHTML = '';

        var lastSpeakerText = '';
        var lastPoemBlock = null;
        var currentLevel = 2;
        var firstContentBlock = suttaContainer.querySelector('p, blockquote, .rule');

        headings.forEach(function (el) {
            var text = el.innerText.replace(/[()\[\]"“”«»'‘’]/g, '').replace(/\s+/g, ' ').trim();
            if (!text) return;

            if (el.tagName.startsWith('H')) currentLevel = parseInt(el.tagName.substring(1), 10);

            var tocClassType = 'h' + currentLevel;
            var extraClass = '';
            var targetLang = window.isRuPath ? 'rus-lang' : 'eng-lang';

            if (el.classList.contains('inserted-heading')) {
                var span = el.querySelector('.' + targetLang) || el.querySelector('.eng-lang');
                var displayText = span ? span.textContent.replace(/[()\[\]"“”«»'‘’]/g, '').replace(/\s+/g, ' ').trim() : text;
                var item0 = document.createElement('div');
                item0.className = 'toc-item toc-' + tocClassType;
                item0.textContent = capitalize(displayText);
                item0.onclick = function (e) {
                    e.stopPropagation();
                    tocPanel.classList.remove('active');
                    var offset = 120;
                    var targetY = window.pageYOffset + el.getBoundingClientRect().top - offset;
                    window.scrollTo({ top: targetY, behavior: 'smooth' });
                    if (typeof window.activateSegmentForTTS === 'function') window.activateSegmentForTTS(el);
                };
                tocPanel.appendChild(item0);
                return;
            }

            var isCustomMultiLang = false;
            var customLangData = {};

            if (el.classList.contains('speaker')) {
                if (text === lastSpeakerText) return;
                lastSpeakerText = text;
                extraClass = ' toc-speaker';
            } else if (el.classList.contains('verse-line')) {
                var parentBlock = el.closest('blockquote, section');
                if (parentBlock && (parentBlock.querySelector('.uddana-intro') ||
                    (parentBlock.previousElementSibling && parentBlock.previousElementSibling.classList.contains('uddana-intro')))) return;
                if (parentBlock && parentBlock === lastPoemBlock) return;
                lastPoemBlock = parentBlock;
                if (firstContentBlock && (firstContentBlock === parentBlock || firstContentBlock.contains(el))) return;
                extraClass = ' toc-v-line';
                isCustomMultiLang = true;
                var getFirstWord = function (langClass) {
                    var span2 = el.querySelector('.' + langClass);
                    if (span2) {
                        var cleanText = span2.textContent.replace(/[()\[\]"“”«»'‘’:;]/g, '').replace(/\s+/g, ' ').trim();
                        var words = cleanText.split(/[\s,.;:!?]/);
                        var label = words[0] || '';
                        if (label.length <= 3 && words.length > 1) label += ' ' + words[1];
                        return label;
                    }
                    return '';
                };
                customLangData = {
                    pli: 'Gāthā' + (getFirstWord('pli-lang') ? ' ' + getFirstWord('pli-lang') + '...' : ''),
                    rus: 'Гатха' + (getFirstWord('rus-lang') ? ' ' + getFirstWord('rus-lang') + '...' : ''),
                    eng: 'Gatha' + (getFirstWord('eng-lang') ? ' ' + getFirstWord('eng-lang') + '...' : '')
                };
            } else if (el.classList.contains('rule') || el.classList.contains('subrule')) {
                extraClass = ' toc-rule';
            } else if (el.classList.contains('anapatti')) {
                extraClass = ' toc-anapatti';
                isCustomMultiLang = true;
                customLangData = { pli: 'Anāpatti', rus: 'Без вины', eng: 'Non-offense' };
            } else if (el.classList.contains('uddana-intro')) {
                tocClassType = 'h1';
                extraClass = ' toc-uddana';
                isCustomMultiLang = true;
                customLangData = { pli: 'Tassuddānaṁ', rus: 'Содержание', eng: 'Summary' };
            } else if (el.classList.contains('endsutta')) {
                tocClassType = 'h1';
                extraClass = ' toc-endsutta';
            }

            var item = document.createElement('div');
            item.className = 'toc-item toc-' + tocClassType + extraClass;

            var scrollAndHighlight = function (targetElement) {
                tocPanel.classList.remove('active');
                var offset = 120;
                var scrollTarget = targetElement;
                if (!scrollTarget.offsetParent || scrollTarget.getBoundingClientRect().height === 0) {
                    scrollTarget = scrollTarget.closest('[id]') || scrollTarget.parentElement || scrollTarget;
                }
                var targetY = window.pageYOffset + scrollTarget.getBoundingClientRect().top - offset;
                window.scrollTo({ top: targetY, behavior: 'smooth' });
                if (typeof window.activateSegmentForTTS === 'function') window.activateSegmentForTTS(targetElement);
            };

            if (isCustomMultiLang) {
                var targetLangText = window.isRuPath ? customLangData.rus : customLangData.eng;
                [{ cls: 'pli-lang', txt: customLangData.pli }, { cls: targetLang, txt: targetLangText }].forEach(function (l) {
                    var span3 = document.createElement('span');
                    span3.className = l.cls;
                    span3.textContent = capitalize(l.txt) + ' ';
                    span3.onclick = function (e) { e.stopPropagation(); scrollAndHighlight(el); };
                    item.appendChild(span3);
                });
            } else {
                var langSpans = el.querySelectorAll('.pli-lang, .rus-lang, .eng-lang');
                if (langSpans.length > 0) {
                    langSpans.forEach(function (originalSpan) {
                        var clone = originalSpan.cloneNode(true);
                        clone.querySelectorAll('.copyLink, .copyLink-start, .variant').forEach(function (child) { child.remove(); });
                        var cleanText = clone.textContent.replace(/[()\[\]"“”«»'‘’]/g, '').replace(/\s+/g, ' ').trim();
                        if (cleanText) {
                            if (el.dataset.fallback === 'true') {
                                var words2 = cleanText.split(/\s+/);
                                if (words2.length > 8) cleanText = words2.slice(0, 8).join(' ') + '...';
                            }
                            clone.textContent = capitalize(cleanText) + ' ';
                            clone.onclick = function (e) { e.stopPropagation(); scrollAndHighlight(originalSpan); };
                            item.appendChild(clone);
                        }
                    });
                } else {
                    if (el.dataset.fallback === 'true') {
                        var words3 = text.split(/\s+/);
                        if (words3.length > 8) text = words3.slice(0, 8).join(' ') + '...';
                    }
                    item.textContent = capitalize(text);
                    item.onclick = function () { scrollAndHighlight(el); };
                }
            }
            if (item.innerHTML.trim() !== '' || item.textContent.trim() !== '') tocPanel.appendChild(item);
        });

        syncTOC();
    }

    document.addEventListener('click', function (e) {
        var btn = e.target.closest('#smart-toc-btn');
        var panel = document.getElementById('smart-toc-panel');
        if (btn) {
            e.stopPropagation();
            if (panel.innerHTML.trim() === '') buildFullTOC();
            var isOpening = !panel.classList.contains('active');
            panel.classList.toggle('active');
            if (isOpening) {
                syncTOC();
                setTimeout(function () {
                    var activeItem = panel.querySelector('.toc-item.active');
                    if (activeItem) {
                        var panelHeight = panel.clientHeight;
                        var itemTop = activeItem.offsetTop;
                        var itemHeight = activeItem.clientHeight;
                        panel.scrollTop = itemTop - (panelHeight / 2) + (itemHeight / 2);
                    }
                }, 50);
            }
        } else if (panel && !panel.contains(e.target)) {
            panel.classList.remove('active');
        }
    });

    window.addEventListener('suttaLoaded', function () { activeSlug = ''; cachedTOCNodes = null; syncTOC(); });
    window.addEventListener('suttaRenderedCentral', function () { activeSlug = ''; cachedTOCNodes = null; syncTOC(); });
    window.addEventListener('scroll', throttle(syncTOC, 150), { passive: true });
})();
