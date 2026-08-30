// === Файл: /assets/js/copyToClipboard.js ===
// OVERRIDE COPY of legacy /assets/js/copyToClipboard.js (dg repo) — see CLAUDE.md override
// pattern. Diff: two fixes for dg-node's reader specifically (both scoped to the copied-citation
// path, i.e. clicking a .copyLink span inside sutta text — the plain "copy this link"
// right-click/long-press path below is untouched):
// 1. suttaId now falls back to window._currentSlug — legacy read this from the ?q= query param,
//    which dg-node's path-based reader URLs (/mn1, /sn22.84:1.3, ...) never carry, so the id was
//    silently dropped from every copied citation.
// 2. Link sits directly under the id (single \n), not a second blank line under it — owner:
//    "Цитата / (blank) / mn1 / Ссылка", id+link read as one unit, only quote→id gets the blank
//    line.

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

// Extracted from copyToClipboard()'s body so reader/common.js's "Paragraph" context-menu item
// (copies every segment from the clicked one to the end of the enclosing <p>) can reuse the same
// Pali+translation extraction per segment instead of duplicating it. clickedElement is optional —
// passed for the segment the user actually clicked (disambiguates between two same-language
// columns in R+R/E+E multiFor mode via closest()); sibling segments collected for a paragraph
// copy have no click point, so they fall back to the first matching [lang] element instead.
function getSegmentTextParts(parentSpan, clickedLang, clickedElement) {
  let textParts = [];

  // Ищем все блоки с lang="pi", чтобы захватить и мнемонику, и полный текст (для memorize.js)
  const piElements = parentSpan.querySelectorAll('[lang="pi"]');

  piElements.forEach(piElement => {
    // Проверка на вложенность: если родитель тоже имеет lang="pi", пропускаем (чтобы избежать дублирования)
    if (piElement.parentElement.closest('[lang="pi"]')) return;

    const piClone = piElement.cloneNode(true);
    // Удаляем только скрытые варианты
    piClone.querySelectorAll('.hidden-variant').forEach(el => el.remove());

    const piText = piClone.textContent
      .trim()
      .replace(/ /g, '\n')
      .replace(/\s\s+/g, '\n');

    if (piText) {
      textParts.push(piText);
    }
  });

  if (clickedLang !== 'pi') {
    const translationElement = clickedElement
      ? clickedElement.closest('[lang]:not([lang="pi"])')
      : parentSpan.querySelector('[lang]:not([lang="pi"])');
    // Owner (paragraph copy): a segment with no real translation still has an EMPTY [lang]
    // element (untranslated), and pushing "" here left a doubled blank line once textParts got
    // joined with '\n\n' across a multi-segment paragraph — truthy check, same as otherTranslations
    // already does below.
    if (translationElement && translationElement.textContent.trim()) {
      textParts.push(translationElement.textContent.trim());
    }

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

  return textParts;
}
window.getSegmentTextParts = getSegmentTextParts;

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
  // dg-node's reader uses path-based URLs (/mn1, /sn22.84:1.3, ...), not the legacy ?q= query
  // param this line was written for — searchParams.get('q') is always empty there. window.
  // _currentSlug (set by reader/megareader.js's buildSutta, the only place these .copyLink
  // spans get rendered) is the authoritative current id in that case.
  const suttaId = new URL(text).searchParams.get('q') || window._currentSlug || ''; // Уже в нижнем регистре

  // 1. Пали (с видимыми вариантами) + 2. кликнутый перевод + 3. остальные видимые переводы —
  // общая логика вынесена в getSegmentTextParts() выше (её же переиспользует "Абзац" в
  // reader/common.js).
  let textParts = getSegmentTextParts(parentSpan, clickedLang, clickedElement);

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

  // Link directly under the id — no blank line here (only quote→id gets one, see above).
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
