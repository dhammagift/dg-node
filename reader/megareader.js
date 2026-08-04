//ридер не должен качать всю базу с сервера чтобы открыть один текст. качать всю базу только для оффлайн использвания. и нужно проверять если есть оффлан - то использотвать если нет, то брать из сети, но только сутту... а не всю БД

const Sccopy = "/suttacentral.net";
const suttaArea = document.getElementById("sutta");
const homeButton = document.getElementById("home-button");
const fdgButton = document.getElementById("fdg-button");
const citation = document.getElementById("paliauto");
const form = document.getElementById("form");
const pathLang = "ru";

let language = "pli-2nd";

if (homeButton) {
    homeButton.addEventListener("click", () => {
      document.location.search = "";
    });
}

// ==========================================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ ЯЗЫКА И ИНТЕРФЕЙСА
// ==========================================

window.showPaliEnglish = function() {
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
    if (lang === "pli-2nd") window.showPaliEnglish();
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
            else if (nextMode === "pli-2nd") window.showPaliEnglish();

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

window.mergeGathas = function(htmlData, paliData, transData, varData, engTransData = null) {
    const originalSegments = Object.keys(htmlData);
    if (localStorage.getItem("mergeGathas") === "false") return originalSegments; 
    
    const processedSegments = [];
    for (let i = 0; i < originalSegments.length; i++) {
        let segment = originalSegments[i];

        if (transData && transData[segment] === undefined) transData[segment] = "";
        if (engTransData && engTransData[segment] === undefined) engTransData[segment] = "";
        if (paliData && paliData[segment] === undefined) paliData[segment] = "";

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

                if (paliData && paliData[nextSegment]) paliData[segment] = (paliData[segment] || "").trim() + " " + toLower(paliData[nextSegment].trim());
                if (transData && transData[nextSegment]) transData[segment] = (transData[segment] || "").trim() + " " + toLower(transData[nextSegment].trim());
                if (engTransData && engTransData[nextSegment]) engTransData[segment] = (engTransData[segment] || "").trim() + " " + toLower(engTransData[nextSegment].trim());
                if (varData && varData[nextSegment]) varData[segment] = (varData[segment] || "").trim() + " " + toLower(varData[nextSegment].trim());

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

    if (window.MOBILE_DB && window.MOBILE_DB[slug]) return slug;
    return slug; 
};


// ==========================================
// SPA-НАВИГАЦИЯ (Перехват кликов для мгновенной загрузки)
// ==========================================
window.navigateSutta = function(event, slug) {
    if (event) event.preventDefault(); // Отменяем полную перезагрузку страницы
    
    let params = new URLSearchParams(document.location.search);
    let sQuery = params.has("s") ? `&s=${params.get("s")}` : "";
    
    // Меняем URL без перезагрузки
    history.pushState({ page: slug }, "", `?q=${slug}${sQuery}`);
    
    // Обновляем инпут поиска, если он есть
    const citation = document.getElementById("paliauto");
    if (citation) citation.value = slug;
    
    // Строим сутту из памяти
    window.buildSutta(slug);
    
    // Прокручиваем страницу наверх
    window.scrollTo(0, 0);
};

// ==========================================
// ЛОГИКА НАВИГАЦИИ (Без PHP и сети, из ОЗУ)
// ==========================================
window.renderNavigation = function(slug) {
    if (!window.MOBILE_DB) return;

    const dbKeys = Object.keys(window.MOBILE_DB);
    const currentIndex = dbKeys.indexOf(slug);
    if (currentIndex === -1) return;

    let params = new URLSearchParams(document.location.search);
    let sQuery = params.has("s") ? `&s=${params.get("s").replace(/ṃ/g, "ṁ")}` : "";

    const formatLink = (targetSlug) => {
        let titles = window.MOBILE_DB[targetSlug].titles || {};
        let name = (titles.pi || titles.ru || titles.en || titles.root || "").replace(/[0-9.-]/g, '').trim();
        let outSlug = targetSlug.replace(/pli-tv-|b[ui]-vb-/g, "");
        return name === "" ? outSlug : `${outSlug} <span class="sutta-name"> ${name}</span>`;
    };

    const currentTitles = window.MOBILE_DB[slug].titles || {};
    let cleanSlug = slug.replace(/pli-tv-|b[ui]-vb-/g, "");
    let cleanPaliName = (currentTitles.pi || currentTitles.root || "").replace(/[0-9.-]/g, '').trim();
    let translatedName = (currentTitles.ru || currentTitles.en || "").replace(/[0-9.-]/g, '').trim();
    let newTitle = cleanPaliName ? `${cleanPaliName} ${translatedName} ${cleanSlug}`.trim() : cleanSlug;
    
    document.title = newTitle;
    let metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = newTitle;
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = newTitle;

    const next = document.getElementById("next");
    const next2 = document.getElementById("next2");
    if (currentIndex < dbKeys.length - 1) {
        let nextSlug = dbKeys[currentIndex + 1];
        // Добавлен onclick с перехватом
        let htmlNext = `<a href="?q=${nextSlug}${sQuery}" onclick="window.navigateSutta(event, '${nextSlug}')">${formatLink(nextSlug)}
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="11">
                <g transform="matrix(0.021484375 0 0 0.021484375 2 -0)"><path d="M202.1 450C 196.03278 449.9987 190.56381 446.34256 188.24348 440.73654C 185.92316 435.13055 187.20845 428.67883 191.5 424.39L191.5 424.39L365.79 250.1L191.5 75.81C 185.81535 69.92433 185.89662 60.568687 191.68266 54.782654C 197.46869 48.996624 206.82434 48.91536 212.71 54.6L212.71 54.6L397.61 239.5C 403.4657 245.3575 403.4657 254.8525 397.61 260.71L397.61 260.71L212.70999 445.61C 209.89557 448.4226 206.07895 450.0018 202.1 450z" fill="#8f8f8f"/></g>
            </svg></a>`;
        if (next) next.innerHTML = htmlNext;
        if (next2) next2.innerHTML = htmlNext.replace(/class="sutta-name"/g, '');
    } else {
        if (next) next.innerHTML = "";
        if (next2) next2.innerHTML = "";
    }

    const previous = document.getElementById("previous");
    const previous2 = document.getElementById("previous2");
    if (currentIndex > 0) {
        let prevSlug = dbKeys[currentIndex - 1];
        // Добавлен onclick с перехватом
        let htmlPrev = `<a href="?q=${prevSlug}${sQuery}" onclick="window.navigateSutta(event, '${prevSlug}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="11">
                <g transform="matrix(0.021484375 0 0 0.021484375 2 -0)"><path d="M353 450C 349.02106 450.0018 345.20444 448.4226 342.39 445.61L342.39 445.61L157.5 260.71C 151.64429 254.8525 151.64429 245.3575 157.5 239.5L157.5 239.5L342.39 54.6C 346.1788 50.809414 351.70206 49.328068 356.8792 50.713974C 362.05634 52.099876 366.10086 56.14248 367.4892 61.318974C 368.87753 66.49547 367.3988 72.01941 363.61002 75.81L363.61002 75.81L189.32 250.1L363.61 424.39C 367.90283 428.6801 369.18747 435.13425 366.8646 440.74118C 364.5417 446.34808 359.06903 450.00275 353 450z" fill="#8f8f8f"/></g>
            </svg>${formatLink(prevSlug)}</a>`;
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
window.buildSutta = async function(rawSlug) {
    if (!window.MOBILE_DB) {
        console.error("База данных не загружена!");
        return;
    }

    const slug = window.normalizeSlugToDbKey(rawSlug);
    const suttaData = window.MOBILE_DB[slug];

    if (!suttaData) {
        if (typeof window.handleFetchError === 'function') window.handleFetchError(rawSlug, true);
        return;
    }

    const texttype = suttaData.category || "sutta";
    let params = new URLSearchParams(document.location.search);
    
    let htmlData = {}, paliData = {}, transData = {}, varData = {};
    let activeLang = "ru";
    let activeTranslatorId = "Неизвестно";
    let globalTargetKey = null;

    // 1. Устанавливаем строгий порядок приоритетов
    const translatorPriorities = ['ru_o', 'ru_sv', 'ru_sv+edited+o'];

    // 2. Ищем лучший перевод для ВСЕГО текста (смотрим по первым доступным переводам)
    let debugAvailableKeys = [];
    for (const seg of suttaData.segments) {
        if (seg.translations && Object.keys(seg.translations).length > 0) {
            const availableKeys = Object.keys(seg.translations);
            debugAvailableKeys = availableKeys; // сохраняем для алерта
            const ruKeys = availableKeys.filter(k => k.startsWith('ru_'));
            
            if (ruKeys.length > 0) {
                ruKeys.sort((a, b) => {
                    let idxA = translatorPriorities.indexOf(a);
                    let idxB = translatorPriorities.indexOf(b);
                    if (idxA === -1) idxA = 999;
                    if (idxB === -1) idxB = 999;
                    return idxA - idxB;
                });
                globalTargetKey = ruKeys[0];
                activeLang = "ru";
                activeTranslatorId = globalTargetKey.split('_').slice(1).join('_');
                break; // Нашли лучший ключ, выходим из цикла поиска автора
            }
        }
    }

    // ТЕСТОВЫЙ АЛЕРТ: Выводим результаты логики приоритетов
 //   alert(`Слаг: ${slug}\nСегментов: ${suttaData.segments.length}\nНайдено ключей: ${debugAvailableKeys.join(', ')}\nВыбранный приоритет: ${globalTargetKey || 'нет русских переводов'}`);

    // 3. Собираем сегменты, используя только выбранный глобальный ключ
    for (const seg of suttaData.segments) {
        htmlData[seg.segment] = seg.html || "{}";
        paliData[seg.segment] = seg.root_text || undefined;
        varData[seg.segment] = seg.variant || undefined;

        if (globalTargetKey && seg.translations && seg.translations[globalTargetKey]) {
            transData[seg.segment] = seg.translations[globalTargetKey];
        } else {
            transData[seg.segment] = undefined;
        }
    }

    let html = `<div class="button-area"><button title="Переключить язык (Atl+Z или Alt+Space)" id="language-button" class="hide-button">Pāḷi Рус</button></div>`;
    
    let finalRulingAnchor = "";
    if (slug.includes("bu-") || slug.includes("bi-")) {
        for (let seg in htmlData) {
            if (htmlData[seg] && htmlData[seg].includes("patimokkha")) {
                finalRulingAnchor = seg.substring(seg.indexOf(':') + 1);
                break;
            }
        }
    }

    const segments = window.mergeGathas(htmlData, paliData, transData, varData);
    const pliClass = "pli-lang inputscript-ISOPali";

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

        let finder = (params.get("s") || "").replace(/ṃ/g, "ṁ");
        if (finder && finder.trim() !== "") {
            let regex = new RegExp(finder, 'gi');
            try {
                if (paliData[segment]) paliData[segment] = paliData[segment].replace(regex, match => `<b class='match finder'>${match}</b>`);
                if (transData[segment]) transData[segment] = transData[segment].replace(regex, match => `<b class="match finder">${match}</b>`);
                if (varData[segment]) varData[segment] = varData[segment].replace(regex, match => `<b class="match finder">${match}</b>`);
            } catch (error) {}
        }

        const linkToCopyStart = `<a class="text-decoration-none copyLink copyLink-start" onclick="copyToClipboard('${fullUrlWithAnchor}')"></a>`;
        let linkToCopy = `<a class="text-decoration-none copyLink" onclick="copyToClipboard('${fullUrlWithAnchor}')"></a>`;

        if (paliData[segment] !== undefined && transData[segment] !== undefined && varData[segment] !== undefined && Object.keys(varData).length > 0) {
            html += `${openHtml}<span id="${anchor}">
                <span class="${pliClass}" lang="pi">${linkToCopyStart}${paliData[segment].trim()}${linkToCopy}
                <font class="variant"><br>${linkToCopyStart}${varData[segment].trim()}${linkToCopy}</font>     
                </span>
                <span class="rus-lang" lang="${activeLang}">${linkToCopyStart}${transData[segment].trim()}${linkToCopy}</span>
                </span>${closeHtml}\n\n`;
        } else if (paliData[segment] !== undefined && transData[segment] !== undefined) {
            html += `${openHtml}<span id="${anchor}">
                <span class="${pliClass}" lang="pi">${linkToCopyStart}${paliData[segment].trim()}${linkToCopy}</span>
                <span class="rus-lang" lang="${activeLang}">${linkToCopyStart}${transData[segment].trim()}${linkToCopy}</span>
                </span>${closeHtml}\n\n`;
        } else if (paliData[segment] !== undefined) {
            html += openHtml + '<span id="' + anchor + '"><span class="' + pliClass + '" lang="pi">' + linkToCopyStart + paliData[segment].trim() + linkToCopy + '</span></span>' + closeHtml + '\n\n';
        } else if (transData[segment] !== undefined) {
            html += openHtml + '<span id="' + anchor + '"><span class="rus-lang" lang="${activeLang}">' + linkToCopyStart + transData[segment].trim() + linkToCopy + '</span></span>' + closeHtml + '\n\n';
        }
    }

    let translatorforuser = activeTranslatorId;
    if (window.TRANSLATORS_CONFIG && window.TRANSLATORS_CONFIG[activeLang] && window.TRANSLATORS_CONFIG[activeLang][activeTranslatorId]) {
        translatorforuser = window.TRANSLATORS_CONFIG[activeLang][activeTranslatorId];
    } else {
        translatorforuser = translatorforuser.charAt(0).toUpperCase() + translatorforuser.slice(1);
    }

    const translatorByline = `<div id="trn" class="byline">
    <p><span class="pli-lang" lang="pi">Pāḷi <a class="text-decoration-none text-reset" href="/assets/texts/abbr.html?s=ms" title="Mahāsaṅgīti Pāḷi">MS</a></span> <span class="rus-lang" lang="ru"> Пер. ${translatorforuser}</span></p>
    </div>`;

    const ruUrl  = window.location.href;
    const mlUrl = ruUrl.replace("/r/", "/ml/");
    const mtUrl = ruUrl.replace("/r/", "/mt/");
    const enUrl = ruUrl.replace("/r/", "/read/");
    
    let cleanSlugReady = slug; 
    
    let scLink = `<p class="sc-link">
    <a target="" title='Pali + Русский + Русский' href="${mtUrl}">R+R</a>
    <a target="" title='Pali + Русский + Английский (Alt+2)' href="${mlUrl}">R+E</a>
    <a title='Английский (Alt+1)' href="${enUrl}">En</a>&nbsp;`;

    if (typeof window.generateThirdPartyLinks === 'function') {
        scLink += window.generateThirdPartyLinks(slug, cleanSlugReady, texttype, activeTranslatorId);
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

    const warning = `
        <div class="warning-container warning-box">
        <p class='warning'>
            <strong>Заметка:</strong><a class='text-decoration-none cursor-pointer' target='' href='${dUrl}'>&nbsp;</a>Переводы, словари и комментарии сделаны не Благословенным.<a class='text-decoration-none cursor-pointer' target='' href='${thUrl}'>&nbsp;</a>Сверяйтесь с Пали в 4 основных никаях.
                ${canShowClose && !isWarningClosed ? `<span class="close-warning">×</span>` : ''} 
        </p>
        </div>
    `;

    suttaArea.innerHTML = 
        `<div id="top-links-container" class="min-h-24"></div><br>` + 
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

    window.renderNavigation(slug);

    window.dispatchEvent(new Event('suttaLoaded'));
    
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
    // 1. Загрузка базы данных
    try {
        const response = await fetch('/nodejs/dg_db.json');
        window.MOBILE_DB = await response.json();
    } catch (error) {
        console.error('Ошибка загрузки базы:', error);
        return;
    }

    // 2. Читаем URL
    // Игнорируем путь, если используется параметр ?q=, 
    // либо берем корректную часть пути, если у вас ЧПУ
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get("q");

    // Если есть параметр ?q=, используем его, иначе пытаемся распарсить путь
    const query = searchParam || window.location.pathname.split('/').filter(Boolean).pop();

    if (query) {
        // Заполняем инпут для удобства
        const citation = document.getElementById("paliauto");
        if (citation) citation.value = query;

        // 3. ЛОГИКА ВЫБОРА: Текст или Поиск
        const normalizedSlug = window.normalizeSlugToDbKey ? window.normalizeSlugToDbKey(query) : query;

        if (window.MOBILE_DB[normalizedSlug]) {
            console.log("Открываем сутту:", normalizedSlug);
            window.buildSutta(normalizedSlug);
        } else {
            console.log("Запускаем поиск по слову:", query);
            if (typeof window.executeGlobalSearch === 'function') {
                window.executeGlobalSearch(query);
            } else {
                console.lot(`Поиск по слову "${query}" (Функция в разработке)`);
            //    alert(`Поиск по слову "${query}" (Функция в разработке)`);
            }
        }
    } else {
        if (typeof window.getInstructionHTML === 'function') {
            document.getElementById("sutta").innerHTML = window.getInstructionHTML(pathLang);
        }
    }
}

initReader();
