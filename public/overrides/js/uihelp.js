// Целевые визиты для показа подсказок
const TARGET_MAIN_VISITS = 7;   // На какой раз подсветить меню на главной
const TARGET_RESULT_VISITS = 7; // На какой раз подсветить элементы на страницах поиска
const TARGET_READ_VISITS = 8;   // На какой раз подсветить шестеренку в читалке
const TARGET_PWA_VISITS = 13;   // На какой общий визит показать окно установки

// === Легкая CSS-анимация ===
function animatedGreyHighlight(id) {
    const el = document.getElementById(id);
    if (!el) return;

    el.classList.add('dg-temp-blink');
    
    // Снимаем класс после завершения анимации (3 цикла по 0.8с = 2.4с)
    setTimeout(() => {
        el.classList.remove('dg-temp-blink');
    }, 2500);
}

// === Умная подсветка только при появлении в зоне видимости ===
function highlightWhenVisible(idsArray, storageKey) {
    if (!Array.isArray(idsArray) || localStorage.getItem(storageKey)) return;

    // Настраиваем наблюдателя
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            // Если элемент появился в зоне видимости
            if (entry.isIntersecting) {
                animatedGreyHighlight(entry.target.id);
                obs.unobserve(entry.target);
                // Отмечаем успех, чтобы больше никогда не подсвечивать эту группу
                localStorage.setItem(storageKey, 'true');
            }
        });
    }, {
        threshold: 0.5 // Срабатывает, когда видно хотя бы 50% элемента
    });

    // Вешаем наблюдателя на запрошенные ID
    idsArray.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            observer.observe(el);
        }
    });
}

function initUiHelp() {
    const path = window.location.pathname;

    // 1. Обновляем глобальный счетчик (для PWA)
    let visitGlobal = parseInt(localStorage.getItem("visitGlobal") || "0", 10) + 1;
    localStorage.setItem("visitGlobal", visitGlobal);

    // 2. Логика для читалки (/read, /r, /ml, /b, /d, /memorize)
    const isReadPage = path.includes('/read/') || path.includes('/r/') || 
                       path.includes('/ml/') || path.includes('/b/') || 
                       path.includes('/d/') || path.includes('/memorize/') ||
                       path.includes('/rev/') || path.includes('/frev/');
                       
    if (isReadPage) {
        let visitRead = parseInt(localStorage.getItem("visitRead") || "0", 10) + 1;
        localStorage.setItem("visitRead", visitRead);

        if (visitRead >= TARGET_READ_VISITS && !localStorage.getItem('highlighted_read')) {
            highlightWhenVisible(['gearRead', 'helpsc'], 'highlighted_read');
        }
    }

    // 3. Логика для Главной страницы (/ или /ru/)
    const isMainPage = path === '/' || path === '/ru/';
    if (isMainPage) {
        let visitMain = parseInt(localStorage.getItem("visitMain") || "0", 10) + 1;
        localStorage.setItem("visitMain", visitMain);

        if (visitMain >= TARGET_MAIN_VISITS && !localStorage.getItem('highlighted_main')) {
            highlightWhenVisible(['gear', 'MenuRead', 'MenuEnglish', 'MenuRussian', 'history', 'MenuDict', 'tools', 'materials'], 'highlighted_main');
        }
    }

    // 4. Логика для страниц результатов поиска (/result/ или /w.php/)
    const isResultPage = path.includes('/result/') || path.includes('/w.php/');
    if (isResultPage) {
         let visitResult = parseInt(localStorage.getItem("visitResult") || "0", 10) + 1;
         localStorage.setItem("visitResult", visitResult);
         
         if (visitResult >= TARGET_RESULT_VISITS && !localStorage.getItem('highlighted_result')) {
             highlightWhenVisible(['gearsc', 'gearSettings', 'helpResult'], 'highlighted_result');
         }
    }

    // 5. Окно PWA
    const infoUpdate = document.getElementById("infoUpdate");
    if (infoUpdate) {
        if (visitGlobal >= TARGET_PWA_VISITS && !localStorage.getItem("PWAinstallMessage")) {
            infoUpdate.style.display = "block";
        }

        const closeBtn = infoUpdate.querySelector(".btn-close");
        if (closeBtn) {
            closeBtn.addEventListener("click", function () {
                localStorage.setItem("PWAinstallMessage", "true");
                infoUpdate.style.display = "none";
            });
        }
    }

    // === Логика всплывающих подсказок-тостов ===
    function showHint(settings) {
        // 1. Определяем язык (по URL или настройке)

        // 2. Определяем тип страницы и ключ для localStorage
        let hintKey, hintType;
        const searchParams = new URLSearchParams(window.location.search);
        
        if (path.includes('/read/') || path.includes('/r/') || path.includes('/ml/') || 
            path.includes('/b/') || path.includes('/d/') || path.includes('/memorize/') || 
            path.includes('/rev/') || path.includes('/frev/')) {
            hintKey = 'hintShown_read_mode';
            hintType = 'read';
        } else if (path.includes('/result/') || path.includes('/w.php') || searchParams.get('q')?.trim()) {
            hintKey = 'hintShown_result_mode';
            hintType = 'result';
        } else {
            return; // Если это не читалка и не поиск - выходим
        }
      
        // 3. Показываем тост, если еще не показывали
        if (!localStorage.getItem(hintKey)) {
            const hintText = settings[hintType][window.isRu ? 'ru' : 'en'];
            
            const notification = document.createElement('div');
            notification.className = 'dg-bottom-toast';
            
            notification.innerHTML = `
                <div class="dg-toast-main">
                    <div>💡 <strong>${hintText.title}</strong> ${hintText.message}</div>
                    <button id="closeHintBtn" class="dg-toast-close" title="(Esc)">×</button>
                </div>
            `;

            document.body.appendChild(notification);

            document.getElementById('closeHintBtn').addEventListener('click', function() {
                notification.style.opacity = '0';
                notification.style.transform = 'translate(-50%, 10px)';
                
                setTimeout(() => {
                    notification.remove();
                    localStorage.setItem(hintKey, 'true');
                }, 300);
            });
        }
    }

    // Более чистая структура текстов без привязки к конкретным URL
    const hintSettings = {
        result: {
            ru: {
                title: 'Подсказка:',
                message: 'Чтобы открыть текст с нужного места, кликните по невидимой ссылке ✦ в начале или в конце фрагмента.'
            },
            en: {
                title: 'Hint:',
                message: 'To open the text from a specific location, click the invisible link ✦ at the beginning or end of the fragment.'
            }
        },
        read: {
            ru: {
                title: 'Подсказка:',
                message: 'Чтобы скопировать цитату со ссылкой, кликните по невидимой ссылке ✦ в начале или в конце строки. Длинное нажатие или правый клик копирует только ссылку.'
            },
            en: {
                title: 'Hint:',
                message: 'To copy a quote with a link, click the invisible link ✦ at the beginning or end of the line. Long press or right-click copies only the link.'
            }
        }
    };

    showHint(hintSettings);
}

// Запускаем либо сразу, если DOM уже готов, либо ждем события
if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initUiHelp);
} else {
    initUiHelp();
}