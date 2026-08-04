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
            // Установка значения в атрибут href
            link.href = textUrl;
            link.target = "_blank";

        }
    });
});

function openRu(slug) {
 //  console.log("Открывается Ru для:", slug);
    let textUrl = findRuTextUrl(slug);
    if (textUrl) {
     //   console.log("Ссылка найдена:", textUrl);
        window.open(textUrl, "_blank");
    } else {
            console.log("Ссылка не найдена", slug, textUrl);
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
        
        // Принудительно ставим слэш, делая ссылку локальной в любом случае
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