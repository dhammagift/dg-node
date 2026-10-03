document.addEventListener("DOMContentLoaded", function() {
   // console.log("Страница загружена");
    const ruLinks = document.querySelectorAll('.ruLink');
    ruLinks.forEach(link => {
        const slug = link.getAttribute('data-slug');
    //    console.log("Slug:", slug);
        const textUrl = findRuTextUrl(slug);
      //  console.log("Text URL:", textUrl);
        if (!textUrl) {
            link.style.display = 'none';
        } else {
            // A local mirror path goes through mirror-link.js like every other mirror: href is the real
            // site, data-local the copy this server may have (used only if it answers).
            link.href = onlineRuUrl(textUrl);
            link.target = "_blank";
            if (textUrl.startsWith('/')) {
                link.classList.add('mirror-link');
                link.dataset.local = textUrl;
            }
        }
    });
});

function openRu(slug) {
 //  console.log("Открывается Ru для:", slug);
    let textUrl = findRuTextUrl(slug);
    if (textUrl) {
        openRuMirror(textUrl);
    } else {
            console.log("Ссылка не найдена", slug, textUrl);
    }
}

// "/theravada.ru/x" -> "https://theravada.ru/x" (the local mirrors keep the original sites' paths).
function onlineRuUrl(url) {
    return url.startsWith('/') ? 'https://' + url.slice(1) : url;
}

// Local mirror when this server has it, the real site otherwise (mirror-link.js); f2, the app and
// dev boxes don't carry the theravada.ru copy, and a bare local link 404ed there.
function openRuMirror(url) {
    if (url.startsWith('/') && typeof window.openMirrorLink === 'function') {
        window.openMirrorLink(url, onlineRuUrl(url));
    } else {
        window.open(url.startsWith('/') ? onlineRuUrl(url) : url, '_blank');
    }
}

function findRuTextUrl(slug) {
    let datasetRu;
    let ruRootUrl;
    let base; 
    let thsuSwitherDS;
    let thsuSwitherUrl;

    // 1. Сначала определяем базу по умолчанию (это важно для DN/thsu)
    if (window.location.host.includes('localhost') || window.location.host.includes('127.0.0.1')) {
        base = "/";
        thsuSwitherDS = thsuLinksDataoffl;
        thsuSwitherUrl = "tipitaka.theravada.su/dn/"; 
    } else {
        base = "https://";
        thsuSwitherDS = thsuLinksData;
        thsuSwitherUrl = "tipitaka.theravada.su/"; 
    }
  
    // 2. Логика ветвления
    if (slug.match("dn")) {
        // Если это Дигха Никая (thsu), оставляем логику как есть (зависит от онлайна/оффлайна)
        datasetRu = thsuSwitherDS;
        ruRootUrl = thsuSwitherUrl; 
    } else {
        // === ВОТ ЗДЕСЬ ИЗМЕНЕНИЕ ДЛЯ THERAVADA.RU ===
        // Мы попадаем сюда для ВСЕХ ссылок theravada.ru (MN, SN, AN и т.д.)
        
 // Локальный путь; если копии на этом сервере нет, openRuMirror() уводит на сам theravada.ru
        base = "/"; 
        
        datasetRu = thruLinksData;
        ruRootUrl = "theravada.ru/Teaching/Canon/Suttanta/Texts/";
    }
  
    // 3. Формирование итоговой ссылки
    if (datasetRu && datasetRu.length) {
        const item = datasetRu.find(item => Array.isArray(item) ? item[0] === slug : item === slug);
        if (item) {
            // Результат всегда будет начинаться с "/"
            return base + ruRootUrl + item[1];
        }
    }
    return null;
}