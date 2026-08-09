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
document.addEventListener('DOMContentLoaded', () => {
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
