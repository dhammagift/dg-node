(function() {
  function getReadingLanguages() {
    try {
      const stored = localStorage.getItem('reading_languages') || localStorage.getItem('dg_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        if (parsed.readingLanguages && Array.isArray(parsed.readingLanguages)) return parsed.readingLanguages;
      }
    } catch (e) {}
    const uiLang = localStorage.getItem('ui_language') || 'ru';
    return uiLang === 'ru' ? ['ru', 'en'] : ['en'];
  }

  function setReadingLanguages(langs) {
    try {
      localStorage.setItem('reading_languages', JSON.stringify(langs));
      const current = JSON.parse(localStorage.getItem('dg_settings') || '{}');
      current.readingLanguages = langs;
      localStorage.setItem('dg_settings', JSON.stringify(current));
    } catch (e) {}
  }

  // 1. Строгая фильтрация строк переводов в блоке PREVIEW
  function filterPreviewTranslations() {
    const previewBox = document.querySelector('.preview-box, #preview, [class*="preview"], [class*="образец"]') || document.body;
    const activeLangs = getReadingLanguages(); // например: ['en']

    const rows = previewBox.querySelectorAll('p, div.trans, [data-lang], .translation-item');
    rows.forEach(el => {
      const text = el.innerText || el.textContent;
      let lang = el.getAttribute('data-lang') || el.getAttribute('lang');
      if (!lang) {
        if (/^(If they|When one|All conditioned|All phenomena)/i.test(text.trim())) lang = 'en';
        else if (/^(Если|Когда|Все обусловленные|Все феномены)/i.test(text.trim())) lang = 'ru';
        else if (/^(Wenn|Alle bedingten|Alle Daseinsfaktoren)/i.test(text.trim())) lang = 'de';
        else if (/^[\u0E00-\u0E7F]/.test(text.trim())) lang = 'th';
      }

      if (lang) {
        if (activeLangs.includes(lang.toLowerCase())) {
          el.style.display = '';
          el.style.order = activeLangs.indexOf(lang.toLowerCase());
        } else {
          el.style.display = 'none'; // Скрываем немецкий и русский, если выбран только английский
        }
      }
    });
  }

  // 2. Кнопка ↻ обновляет только стили и видимость языков, не меняя цитату
  function hookRefreshButton() {
    const btns = document.querySelectorAll('button[class*="refresh"], .btn-refresh, [title*="Refresh"], [title*="Обновить"], .preview-header button, [class*="rotate"]');
    btns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopImmediatePropagation();
        e.preventDefault();
        filterPreviewTranslations();
      }, true);
    });
  }

  // 3. Добавление русского при смене языка интерфейса
  function hookUiLanguage() {
    const uiLangSelects = document.querySelectorAll('select[name*="ui_lang"], select[id*="ui_lang"], select[class*="ui-lang"], select');
    uiLangSelects.forEach(sel => {
      sel.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'ru' || val === 'Russian' || val === 'Русский') {
          const langs = getReadingLanguages();
          if (!langs.includes('ru')) {
            langs.unshift('ru');
            setReadingLanguages(langs);
            filterPreviewTranslations();
          }
        }
      });
    });
  }

  // 4. Перемещение чипов (клавиатура ← / → и drag)
  function hookChips() {
    const chips = document.querySelectorAll('.chip, .badge, [class*="chip"], [class*="language-item"]');
    chips.forEach(chip => {
      chip.setAttribute('tabindex', '0');
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const langs = getReadingLanguages();
          const code = chip.dataset.lang || (chip.innerText.includes('English') ? 'en' : chip.innerText.includes('Русский') ? 'ru' : null);
          if (!code) return;
          const idx = langs.indexOf(code);
          if (e.key === 'ArrowLeft' && idx > 0) {
            langs.splice(idx, 1);
            langs.splice(idx - 1, 0, code);
          } else if (e.key === 'ArrowRight' && idx < langs.length - 1 && idx !== -1) {
            langs.splice(idx, 1);
            langs.splice(idx + 1, 0, code);
          }
          setReadingLanguages(langs);
          location.reload();
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    filterPreviewTranslations();
    hookRefreshButton();
    hookUiLanguage();
    hookChips();
  });
})();
