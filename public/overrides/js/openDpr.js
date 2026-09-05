document.addEventListener("DOMContentLoaded", function() {
    // console.log("Страница загружена");
    const dprLinks = document.querySelectorAll('.dprLink');
    dprLinks.forEach(link => {
        const slug = link.getAttribute('data-slug');
        // console.log("Slug:", slug);
        
        // Вызываем новую функцию получения URL
        const textUrl = getDprUrl(slug);
        
        // console.log("Text URL:", textUrl);
        if (!textUrl) {
            link.style.display = 'none';
        } else {
            // Установка значения в атрибут href
            link.href = textUrl;
            link.target = "_blank";
        }
    });
});

function openDpr(slug) {
    // console.log("Открывается DPR для:", slug);
    
    // Вызываем новую функцию получения URL
    let textUrl = getDprUrl(slug);
    
    if (textUrl) {
        // console.log("Ссылка найдена:", textUrl);
        window.open(textUrl, "_blank");
    } else {
        console.log("Ссылка не найдена для slug:", slug);
    }
}

/**
 * Новая функция поиска ссылки через маппинг (linksdprmapping.js)
 */
function getDprUrl(slug) {
    // Проверяем, загружен ли массив данных
    if (typeof dprLinksData === 'undefined') {
        console.warn("Ошибка: Массив dprLinksData не найден. Убедитесь, что файл linksdprmapping.js подключен.");
        return null;
    }

    if (!slug) return null;

    // Очищаем slug от параметров и приводим к нижнему регистру
    let cleanSlug = slug.split('&')[0].toLowerCase();

    // Ищем совпадение в массиве dprLinksData
    // item[0] - это slug (например, dn1), item[1] - код локации
    let dprItem = dprLinksData.find(item => item[0] === cleanSlug);

    if (dprItem && dprItem[1]) {
        // Базовый URL
        const dprBaseUrl = "https://d.dhamma.gift/_dprhtml/index.html?loc=";
        return dprBaseUrl + dprItem[1];
    }
    
    return null;
}