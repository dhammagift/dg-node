
// Функция для определения языка
function getNotificationText() {
  const path = window.location.pathname;
  const language = localStorage.getItem('siteLanguage') ||
                  (path.includes('/r/') ? 'ru' :
                   path.includes('/read/') ? 'en' : 'en');

  return {
    ru: "Цитата скопирована",
    en: "Quote copied"
  }[language] || "Quote copied";
}

// Основная функция копирования
function copyToClipboard(text = "") {


  // Обработка URL
  if (text === 127) {
    text = window.location.href.replace('localhost', '127.0.0.1');
  } else if (text === "") {
    text = window.location.href;
    text = text.includes('localhost') || text.includes('127.0.0.1')
      ? text.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/gi, 'https://dhamma.gift')
      : text.includes('dhamma.gift')
        ? text.replace('https://dhamma.gift', 'http://127.0.0.1:8080')
        : 'https://dhamma.gift' + text.substring(text.indexOf('/', 8));
  }

  // ИЗМЕНЕНИЕ: Парсим URL и приводим параметр q и хеш к нижнему регистру
  try {
    const parsedUrl = new URL(text);
    if (parsedUrl.searchParams.has('q')) {
      parsedUrl.searchParams.set('q', parsedUrl.searchParams.get('q').toLowerCase());
    }
    if (parsedUrl.hash) {
      parsedUrl.hash = parsedUrl.hash.toLowerCase();
    }
    text = parsedUrl.href;
  } catch (e) {
    console.error('Ошибка при обработке URL: ', e);
  }

  // Получаем элемент, на котором кликнули
  const clickedElement = event?.target;
  if (!clickedElement || !clickedElement.classList.contains('copyLink')) {
    navigator.clipboard.writeText(text);
    showBubbleNotification(getNotificationText());
    return;
  }

  const parentSpan = clickedElement.closest('span[id]');
  if (!parentSpan) return;

  // Определяем язык кликнутого элемента
  const clickedLang = clickedElement.closest('[lang]')?.getAttribute('lang');
  const suttaId = new URL(text).searchParams.get('q') || ''; // Уже в нижнем регистре

  let textParts = [];

  // 1. Всегда добавляем текст пали (с видимыми вариантами)
  // ИЗМЕНЕНИЕ: Ищем все блоки с lang="pi", чтобы захватить и мнемонику, и полный текст (для memorize.js)
  const piElements = parentSpan.querySelectorAll('[lang="pi"]');

  piElements.forEach(piElement => {
    // Проверка на вложенность: если родитель тоже имеет lang="pi", пропускаем (чтобы избежать дублирования)
    if (piElement.parentElement.closest('[lang="pi"]')) return;

    const piClone = piElement.cloneNode(true);
    // Удаляем только скрытые варианты
    piClone.querySelectorAll('.hidden-variant').forEach(el => el.remove());
    
    const piText = piClone.textContent
      .trim()
      .replace(/\u00A0/g, '\n')
      .replace(/\s\s+/g, '\n');
    
    if (piText) {
      textParts.push(piText);
    }
  });

  // 2. Если кликнули на перевод - добавляем его текст
  if (clickedLang !== 'pi') {
    const translationElement = clickedElement.closest('[lang]:not([lang="pi"])');
    if (translationElement) {
      const translationText = translationElement.textContent.trim();
      textParts.push(translationText);
    }
  }

  // 3. Добавляем все остальные видимые переводы (кроме кликнутого)
  if (clickedLang !== 'pi') {
    const otherTranslations = Array.from(
      parentSpan.querySelectorAll('[lang]:not([lang="pi"]):not([lang="' + clickedLang + '"])')
    )
      .filter(el => !el.closest('.hidden-variant'))
      .map(el => el.textContent.trim())
      .filter(Boolean);

    if (otherTranslations.length > 0) {
      textParts = textParts.concat(otherTranslations);
    }
  }

let textToCopy = textParts.join('\n\n')
  .replace(/✦/g, '')
  .replace(/  /g, '')
  .replace(/^ +/gm, '')  // Убирает все начальные пробелы в каждой строке
  .trim();

  // 4. Добавляем ID сутты и ссылку с дополнительными отступами
  if (suttaId) textToCopy += `\n\n${suttaId}`;

  if (text.includes('localhost') || text.includes('127.0.0.1')) {
    text = text.replace(/http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/g, 'https://dhamma.gift');
  }

  textToCopy += `\n${text}`;

 // console.log('Копируемый текст:', textToCopy);
  showBubbleNotification(getNotificationText());

  if (navigator.clipboard) {
    navigator.clipboard.writeText(textToCopy).catch(() => fallbackCopy(textToCopy));
  } else {
    fallbackCopy(textToCopy);
  }
}

// Fallback для старых браузеров
function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}


// Скрыть share icon на production
document.addEventListener('DOMContentLoaded', function() {
  const shareOnlineElement = document.getElementById('shareOnline');
  if (shareOnlineElement && window.location.href.includes('dhamma.gift')) {
    shareOnlineElement.style.display = 'none';
  }



  let pressTimer = null;

  // Универсальная функция-обработчик, которая находит и копирует ссылку
  const handleLineLinkCopy = (event) => {
    // Ищем ближайший элемент .copyLink к месту клика/нажатия.
    const copyLinkTarget = event.target.closest('.copyLink');

    // Если клик был НЕ на элементе .copyLink, ничего не делаем и выходим.
    if (!copyLinkTarget) {
      return;
    }

    // Отменяем стандартное меню.
    event.preventDefault();

    // Находим родителя с ID.
    const anchorElement = copyLinkTarget.closest('[id]');
    if (!anchorElement) return;

    const copyLinkElem = copyLinkTarget; 

    // ИЗМЕНЕНИЕ: Используем ID найденного родителя как хеш и приводим к нижнему регистру
    const hash = anchorElement.id.toLowerCase();

    const onclickAttr = copyLinkElem.getAttribute('onclick');
    const urlMatch = onclickAttr.match(/copyToClipboard\('([^']*)'\)/);
    if (!urlMatch || !urlMatch[1]) return;

    const baseUrl = new URL(urlMatch[1]);
    
    // ИЗМЕНЕНИЕ: Приводим параметр q к нижнему регистру перед копированием ссылки
    if (baseUrl.searchParams.has('q')) {
      baseUrl.searchParams.set('q', baseUrl.searchParams.get('q').toLowerCase());
    }
    
    baseUrl.hash = hash;
    let finalUrl = baseUrl.href;

    if (finalUrl.includes('localhost') || finalUrl.includes('127.0.0.1')) {
      finalUrl = finalUrl.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/gi, 'https://dhamma.gift');
    }

    navigator.clipboard.writeText(finalUrl).then(() => {
      const path = window.location.pathname;
      const language = localStorage.getItem('siteLanguage') || (path.includes('/r/') ? 'ru' : 'en');
      const notificationText = {
        ru: "Ссылка скопирована",
        en: "Link copied"
      }[language] || "Link copied";
      showBubbleNotification(notificationText);
    }).catch(err => {
      console.error('Не удалось скопировать ссылку: ', err);
      fallbackCopy(finalUrl);
    });
  };

  // 1. Обработчик для правого клика мыши
  document.addEventListener('contextmenu', handleLineLinkCopy);

  // 2. Обработчики для долгого нажатия на сенсорных устройствах
  document.addEventListener('touchstart', (event) => {
    if (event.target.closest('.copyLink')) {
      pressTimer = window.setTimeout(() => {
        handleLineLinkCopy(event);
        pressTimer = null;
      }, 500);
    }
  }, { passive: false });

  const clearLongPressTimer = () => {
    clearTimeout(pressTimer);
  };

  document.addEventListener('touchend', clearLongPressTimer);
  document.addEventListener('touchmove', clearLongPressTimer);
 
});
