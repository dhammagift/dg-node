// === Файл: /assets/js/autopali.js ===
//
// OVERRIDE-копия легаси-файла (siteroot/assets/js/autopali.js) — тот же приём и та же причина,
// что у public/overrides/read/js/voice.js: сам легаси-файл общий с продом и мы его не трогаем,
// а dg-node отдаёт свою копию первым (см. app.use('/assets', ...) в dg-light.js).
//
// ЕДИНСТВЕННОЕ отличие от оригинала — фильтрация истории в source() (см. комментарий там же):
// она игнорировала диакритику, поэтому запись "aṅgārakās" не находилась по вводу "an", хотя
// словарные подсказки в том же выпадающем списке диакритику уже нормализуют. Больше в файле
// ничего не менялось; при обновлении легаси-версии этот патч нужно перенести заново.

function uniCoder(textInput) {
    if (!textInput || textInput === "") return textInput;
    return textInput
        .replace(/aa/g, "ā")
        .replace(/ii/g, "ī")
        .replace(/uu/g, "ū")
        .replace(/\"n/g, "ṅ")
        .replace(/\~n/g, "ñ")
        .replace(/\.t/g, "ṭ")
        .replace(/\.d/g, "ḍ")
        .replace(/\.n/g, "ṇ")
        .replace(/\.m/g, "ṃ")
        .replace(/\.l/g, "ḷ")
        .replace(/\.h/g, "ḥ");
}

let suttaWordsCache = null;

const ruToEn = {
    'а': 'f', 'в': 'd', 'е': 't', 'к': 'r', 'м': 'v',
    'н': 'y', 'о': 'j', 'п': 'g', 'р': 'h', 'с': 'c',
    'т': 'n', 'у': 'e', 'х': '[', 'ъ': ']', 'ы': 's',
    'ь': 'm', 'э': "'", 'ё': '`', 'я': 'z', 'ж': ';',
    'з': 'p', 'и': 'b', 'й': 'q', 'л': 'k', 'д': 'l',
    'г': 'u', 'ф': 'a', 'ц': 'w', 'ч': 'x', 'ш': 'i',
    'щ': 'o', 'б': ',', 'ю': '.', ' ': ' '
};

// --- УТИЛИТЫ ДЛЯ УМНОЙ ЗАГРУЗКИ ---
window._dgLoadPromises = window._dgLoadPromises || {};

function _loadStyle(href) {
    if (!document.querySelector(`link[href="${href}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }
}

function _loadScript(src) {
    // Если скрипт уже грузится, возвращаем существующий Promise (защита от двойной загрузки)
    if (window._dgLoadPromises[src]) return window._dgLoadPromises[src];
    
    window._dgLoadPromises[src] = new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
    
    return window._dgLoadPromises[src];
}
// -----------------------------------

window.initPaliAutocomplete = function(selector) {
    let inputEl = document.querySelector(selector);
    if (!inputEl) return;

    if (inputEl.dataset.autopaliBound === "true") return;
    inputEl.dataset.autopaliBound = "true";

    // 1. Мгновенно вешаем конвертер Юникода. Он легкий и должен работать сразу, 
    // даже пока грузятся тяжелые скрипты
    inputEl.addEventListener("input", function () {
        let textInput = inputEl.value;
        let convertedText = uniCoder(textInput);
        if (inputEl.value !== convertedText) {
            inputEl.value = convertedText;
        }
    });

    // 2. Логика отложенной загрузки
    let isLoaded = false;
    let isLoading = false;

    const lazyLoadAndInit = async (e) => {
        if (isLoaded) return;
        
        // Запоминаем, был ли это клик по пустому полю (чтобы показать историю)
        const triggerEmptySearch = (e.type === 'click' && inputEl.value === '');

        if (isLoading) return;
        isLoading = true;

        try {
            // Подгружаем стили
            _loadStyle('/assets/css/jquery-ui.min.css');

            // Фикс z-index для модальных окон
            if (!document.getElementById('autopali-zindex-fix')) {
                let style = document.createElement('style');
                style.id = 'autopali-zindex-fix';
                style.textContent = '.ui-autocomplete { z-index: 10005 !important; }';
                document.head.appendChild(style);
            }

            // Подгружаем jQuery и jQuery UI строго последовательно
            if (typeof jQuery === 'undefined') {
                await _loadScript('/assets/js/jquery-3.7.0.min.js');
            }
            if (typeof jQuery === 'undefined' || typeof jQuery.ui === 'undefined') {
                await _loadScript('/assets/js/jquery-ui.min.js');
            }

            // Загружаем словарь через нативный fetch
            if (!suttaWordsCache) {
                const response = await fetch("/assets/texts/sutta_words.txt");
                if (!response.ok) throw new Error("Ошибка загрузки словаря");
                const text = await response.text();
                suttaWordsCache = text.split('\n');
            }

            // Инициализируем автокомплит
            bindAutocomplete(selector, suttaWordsCache);
            isLoaded = true;

            // Вешаем обработчик для будущих кликов по пустому полю (когда скрипт уже загружен)
            inputEl.addEventListener("click", function() {
                if (inputEl.value === "" && $(inputEl).hasClass('ui-autocomplete-input')) {
                    $(inputEl).autocomplete("search", "");
                }
            });

            // Восстанавливаем действие пользователя, которое инициировало загрузку
            if (triggerEmptySearch) {
                $(inputEl).autocomplete("search", "");
            } else if (inputEl.value !== "") {
                $(inputEl).autocomplete("search", inputEl.value);
            }

        } catch (error) {
            console.error("Ошибка ленивой загрузки Autopali:", error);
        } finally {
            isLoading = false;
        }
    };

    // Слушаем взаимодействия для старта загрузки
    inputEl.addEventListener("focus", lazyLoadAndInit);
    inputEl.addEventListener("input", lazyLoadAndInit);
    inputEl.addEventListener("click", lazyLoadAndInit);
};

function bindAutocomplete(selector, allWords) {
    var accentMap = {
        "ā": "a", "ī": "i", "ū": "u", 
        "ḍ": "d", "ḷ": "l", 
        "ṃ": "m", "ṁ": "m", 
        "ṅ": "n", "ṇ": "n", "ṭ": "t", "ñ": "n"
    };

    var normalize = function(term) {
        var ret = "";
        term = term.toLowerCase(); 
        for (var i = 0; i < term.length; i++) {
            ret += accentMap[term.charAt(i)] || term.charAt(i);
        }
        return ret;
    };

    var autocompleteInstance = $(selector).autocomplete({
        // Owner: suggestions should always open downward, never up — "left bottom"/"at: left
        // top" was jQuery UI's "prefer above, flip below only when out of room" config, which
        // flipped inconsistently depending on scroll position (sometimes up, sometimes down).
        // "left top"/"at: left bottom" is the plain "always below" config; collision:"none"
        // means no flip-to-above fallback at all — with #home-hint moved above the input (see
        // search/index.html), there's nothing above worth flipping toward anyway.
        position: {
            my: "left top",
            at: "left bottom",
            collision: "none"
        },
        minLength: 0,
        multiple: /[\s\*]/,
        source: function(request, response) {
            
            function normalizeTerm(term) {
                return term.trim()
                    .replace(/[а-яё]/g, char => ruToEn[char] || char)
                    .replace(/,/g, ".")
                    .replace(/\b(bu|bi)\s+(pj|ss|ay|np|pc|pd|sk|as|pm)\b/gi, "$1-$2")
                    .replace(/([a-zA-Z]+)\s+(\d+)\s+(\d+)/g, "$1$2.$3")
                    .replace(/([a-zA-Z]+)(\d+)\s+(\d+)/g, "$1$2.$3")
                    .replace(/([a-zA-Z]+)\s+(\d+)\.(\d+)/g, "$1$2.$3")
                    .replace(/([a-zA-Z]+)\s+(\d+)/g, "$1$2");
            }

            var normalizedTerm = normalizeTerm(request.term);
            var terms = normalizedTerm.split(/[\|\s\*]/);
            var lastTerm = terms.pop().trim();
            var minLengthForSearch = 3;

            var history = JSON.parse(localStorage.getItem("localSearchHistory")) || [];
            
            var historyObjList = history.map(function(item) {
                if (Array.isArray(item)) {
                    return { label: item[0], value: item[0], url: item[1], isHistory: true };
                }
                return { label: item, value: item, isHistory: true };
            });

            if (!lastTerm) {
                response(historyObjList);
                return;
            }

            // История фильтруется по ТЕМ ЖЕ правилам, что и словарные подсказки ниже: сначала
            // снимаем диакритику через normalize() (он уже объявлен выше и используется для
            // словаря), потом сверяем. Раньше здесь было сырое startsWith по исходной строке —
            // запись "aṅgārakās" на ввод "an" не находилась, потому что второй символ у неё "ṅ",
            // а не "n", хотя в словарных подсказках то же слово находится нормально.
            // Совпадение не только с начала: длинную запись из истории человек чаще помнит
            // серединой (тот же принцип, что strictMatchAll/looseMatchAll для словаря), а
            // начальные совпадения всё равно идут первыми.
            var normHistTerm = normalize(lastTerm.toLowerCase());
            var historyBegins = [];
            var historyContains = [];
            historyObjList.forEach(function (item) {
                if (!item.label) return;
                var normLabel = normalize(String(item.label).toLowerCase());
                if (normLabel.indexOf(normHistTerm) === 0) historyBegins.push(item);
                else if (normLabel.indexOf(normHistTerm) !== -1) historyContains.push(item);
            });
            var filteredHistory = historyBegins.concat(historyContains);

            if (lastTerm.length < minLengthForSearch) {
                response(filteredHistory);
                return;
            }

            var normLastTerm = normalize(lastTerm);
            var re = $.ui.autocomplete.escapeRegex(normLastTerm);
            
            // 1. Строгий поиск (без смешивания m и n)
            var strictReStr = re.replace(/([a-zA-Z])/g, "$1{1,2}");
            var strictMatchBegin = new RegExp("^" + strictReStr, "i");
            var strictMatchAll = new RegExp(strictReStr, "i");

            // 2. Мягкий поиск (разрешаем замену m на n и наоборот)
            var looseReStr = strictReStr.replace(/m|n/g, "[mn]");
            var looseMatchBegin = new RegExp("^" + looseReStr, "i");
            var looseMatchAll = new RegExp(looseReStr, "i");

            var strictBeginList = [];
            var looseBeginList = [];
            var strictAllList = [];
            var looseAllList = [];

            // Один проход по словарю с распределением по приоритетам
            $.each(allWords, function(i, value) {
                var valStr = value.label || value.value || value;
                var normVal = normalize(valStr);

                if (strictMatchBegin.test(normVal)) {
                    strictBeginList.push(value);
                } else if (looseMatchBegin.test(normVal)) {
                    looseBeginList.push(value);
                } else if (strictMatchAll.test(normVal)) {
                    strictAllList.push(value);
                } else if (looseMatchAll.test(normVal)) {
                    looseAllList.push(value);
                }
            });

            var maxRecord = 1000;
            // Склейка результатов по убыванию приоритета
            var resultList = strictBeginList
                .concat(looseBeginList)
                .concat(strictAllList)
                .concat(looseAllList)
                .slice(0, maxRecord);

            response(resultList);
        },
        focus: function() { return false; },
        select: function(event, ui) {
            if (ui.item.url && /\d/.test(ui.item.value)) {
                // Пункт ИСТОРИИ (ui.item.url только у них, см. historyObjList выше) — свой же
                // внутренний путь (saveToHistory кладёт url.pathname текущей страницы), не
                // внешняя ссылка. window.location.href был полной перезагрузкой — терял SPA
                // (владелец заметил: "с главной переход в текст работает не в спа режиме").
                // dgNavigateInternal — из search/index.html, тот же скрипт, что рисует шапку/
                // ридер, только он умеет history.pushState + правильно выбрать текст/поиск.
                if (typeof window.dgNavigateInternal !== 'function' || !window.dgNavigateInternal(ui.item.url)) {
                    window.location.href = ui.item.url;
                }
                return false;
            }

            var terms = this.value.split(/([\|\s\*])/);
            terms.pop();
            
            var selectedValue = ui.item.value;
            if (/\s+\d+$/.test(selectedValue)) selectedValue = selectedValue.split(/\s+/)[0];
            if (/\d+\s+/.test(selectedValue)) selectedValue = selectedValue.split(/\s+/)[0];
            if (/b[ui]pm|b[ui]-pm|pm/.test(selectedValue)) selectedValue = selectedValue.split(/\s+/)[0];
            
            if (/\d/.test(selectedValue)) {
                this.value = selectedValue.split(/\s+/)[0]; 
                
                const form = this.closest('form');
                if (form) {
                    const submitBtn = form.querySelector('[type="submit"]');
                    if (submitBtn) submitBtn.click();
                    else form.submit();
                }
                return false;
            } else {
                terms.push(selectedValue);
            }

            for (var i = 1; i < terms.length; i += 2) {
                if (terms[i] === "*") terms[i] = "*";
                else if (terms[i] === "|") terms[i] = "|";
                else terms[i] = " ";
            }

            this.value = terms.join("");
            return false;
        }
    }).data("ui-autocomplete");

    $(selector).autocomplete("widget").addClass("fixed-height");

    autocompleteInstance._renderItem = function(ul, item) {
        var $div = $("<div>").addClass("autopali-dropdown-item");
        
        if (item.isHistory) {
            $div.append('<img src="/assets/svg/clock-rotate-left.svg" class="autocomplete-history-icon" alt="History">');
        }
        
        $div.append($("<span>").text(item.label));
        
        return $("<li>").append($div).appendTo(ul);
    };
}

function setupMainInput() {
    if (document.getElementById("paliauto")) {
        initPaliAutocomplete("#paliauto");
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupMainInput);
} else {
    setupMainInput();
}
