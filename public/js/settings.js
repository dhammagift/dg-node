export class SettingsManager {
  constructor() {
    this.storageKey = 'dg_settings';
    this.settings = this.loadSettings();
    this.currentQuote = null;
    this.init();
  }

  loadSettings() {
    const defaultData = {
      uiLanguage: localStorage.getItem('ui_language') || 'ru',
      readingLanguages: this.getInitialReadingLanguages(),
      theme: 'dark',
      fontSize: '18px',
      fontFamily: 'serif',
      aksharamukhaScript: 'roman',
      apiKey: '',
      siteRoot: '',
      activeTab: 'reading'
    };

    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) return { ...defaultData, ...JSON.parse(saved) };
    } catch (e) {
      console.warn('Failed to parse settings:', e);
    }
    return defaultData;
  }

  getInitialReadingLanguages() {
    try {
      const saved = localStorage.getItem('reading_languages');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    const uiLang = localStorage.getItem('ui_language') || 'ru';
    return uiLang === 'ru' ? ['ru', 'en'] : ['en'];
  }

  saveSettings() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
      localStorage.setItem('reading_languages', JSON.stringify(this.settings.readingLanguages));
      localStorage.setItem('ui_language', this.settings.uiLanguage);
    } catch (e) {
      console.error('Error saving settings:', e);
    }
  }

  init() {
    this.bindEvents();
    this.renderLanguageChips();
    this.initCurrentQuoteFromDomOrProject();
    this.applyDemoStyles();
    this.filterDemoTranslations();
  }

  initCurrentQuoteFromDomOrProject() {
    if (window.currentDemoQuote) {
      this.currentQuote = window.currentDemoQuote;
    } else if (typeof window.getDemoQuote === 'function') {
      this.currentQuote = window.getDemoQuote();
    } else {
      this.extractQuoteFromDom();
    }
  }

  extractQuoteFromDom() {
    const paliEl = document.getElementById('demo-pali-text') || document.querySelector('.demo-pali');
    const transContainer = document.getElementById('demo-translations-container') || document.querySelector('.demo-translations');
    
    const translations = {};
    if (transContainer) {
      transContainer.querySelectorAll('[data-lang], .demo-trans-item, [class*="trans-"]').forEach(el => {
        let lang = el.dataset.lang;
        if (!lang) {
          const match = el.className.match(/trans-([a-z]{2})/i);
          if (match) lang = match.toLowerCase();
        }
        if (lang) {
          const textEl = el.querySelector('.demo-trans-text') || el;
          translations[lang] = textEl.textContent.trim();
        }
      });
    }

    this.currentQuote = {
      pali: paliEl ? paliEl.textContent.trim() : '',
      translations: translations
    };
  }

  bindEvents() {
    const uiLangSelect = document.getElementById('setting-ui-lang');
    if (uiLangSelect) {
      uiLangSelect.value = this.settings.uiLanguage;
      uiLangSelect.addEventListener('change', (e) => {
        const newLang = e.target.value;
        this.settings.uiLanguage = newLang;

        if (newLang === 'ru' && !this.settings.readingLanguages.includes('ru')) {
          this.settings.readingLanguages.unshift('ru');
        } else if (newLang === 'en' && this.settings.readingLanguages.length === 0) {
          this.settings.readingLanguages = ['en'];
        }

        this.saveSettings();
        this.renderLanguageChips();
        this.filterDemoTranslations();
      });
    }

    const btnRefresh = document.getElementById('btn-refresh-demo') || 
                       document.getElementById('btn-refresh-demo-style') || 
                       document.querySelector('.btn-refresh-demo');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.applyDemoStyles();
        this.filterDemoTranslations();
      });
    }

    const btnRandom = document.getElementById('btn-random-quote') || 
                      document.getElementById('btn-randomize-quote') ||
                      document.querySelector('.btn-random-quote');
    if (btnRandom) {
      btnRandom.addEventListener('click', (e) => {
        if (typeof window.loadNextDemoQuote === 'function') {
          this.currentQuote = window.loadNextDemoQuote();
        } else if (Array.isArray(window.demoQuotes) && window.demoQuotes.length > 0) {
          const rand = window.demoQuotes[Math.floor(Math.random() * window.demoQuotes.length)];
          this.currentQuote = rand;
        }
        this.renderPaliText();
        this.filterDemoTranslations();
      });
    }

    ['setting-font-size', 'setting-font-family', 'setting-theme', 'setting-aksharamukha'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', (e) => {
          if (id === 'setting-font-size') this.settings.fontSize = e.target.value;
          if (id === 'setting-font-family') this.settings.fontFamily = e.target.value;
          if (id === 'setting-theme') this.settings.theme = e.target.value;
          if (id === 'setting-aksharamukha') this.settings.aksharamukhaScript = e.target.value;
          this.saveSettings();
          this.applyDemoStyles();
          this.renderPaliText();
        });
      }
    });

    document.querySelectorAll('.btn-back-action').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = this.settings.siteRoot || '/';
        }
      });
    });
  }

  renderLanguageChips() {
    const activeContainer = document.getElementById('active-languages-chips') || document.querySelector('.active-lang-chips');
    const availableContainer = document.getElementById('available-languages-chips') || document.querySelector('.available-lang-chips');
    if (!activeContainer) return;

    const allLangs = window.AVAILABLE_LANGUAGES || [
      { code: 'ru', name: 'Русский' },
      { code: 'en', name: 'English' },
      { code: 'de', name: 'Deutsch' },
      { code: 'th', name: 'ไทย' },
      { code: 'zh', name: '中文' },
      { code: 'fr', name: 'Français' },
      { code: 'es', name: 'Español' },
      { code: 'my', name: 'မြန်မာ' },
      { code: 'si', name: 'සිංහල' }
    ];

    activeContainer.innerHTML = '';
    if (availableContainer) availableContainer.innerHTML = '';

    this.settings.readingLanguages.forEach((code, index) => {
      const langInfo = allLangs.find(l => l.code === code) || { code, name: code.toUpperCase() };
      const chip = this.createChip(langInfo, true, index);
      activeContainer.appendChild(chip);
    });

    if (availableContainer) {
      allLangs.forEach(langInfo => {
        if (!this.settings.readingLanguages.includes(langInfo.code)) {
          const chip = this.createChip(langInfo, false);
          availableContainer.appendChild(chip);
        }
      });
    }

    this.initDragAndDrop(activeContainer);
  }

  createChip(langInfo, isActive, index = 0) {
    const chip = document.createElement('div');
    chip.className = `lang-chip badge ${isActive ? 'bg-primary text-white' : 'bg-secondary text-light'} p-2 m-1 d-inline-flex align-items-center`;
    chip.dataset.code = langInfo.code;
    chip.style.userSelect = 'none';

    if (isActive) {
      chip.setAttribute('draggable', 'true');
      chip.style.cursor = 'grab';
      chip.innerHTML = `
        <i class="bi bi-grip-vertical me-1 opacity-75"></i>
        <span class="chip-order me-1 fw-bold">${index + 1}.</span>
        <span class="chip-name me-2">${langInfo.name}</span>
        <button type="button" class="btn-close btn-close-white btn-sm" aria-label="Remove"></button>
      `;

      chip.querySelector('.btn-close').addEventListener('click', (e) => {
        e.stopPropagation();
        this.settings.readingLanguages = this.settings.readingLanguages.filter(c => c !== langInfo.code);
        this.saveSettings();
        this.renderLanguageChips();
        this.filterDemoTranslations();
      });
    } else {
      chip.style.cursor = 'pointer';
      chip.innerHTML = `<i class="bi bi-plus-circle me-1"></i><span>${langInfo.name}</span>`;
      chip.addEventListener('click', () => {
        this.settings.readingLanguages.push(langInfo.code);
        this.saveSettings();
        this.renderLanguageChips();
        this.filterDemoTranslations();
      });
    }

    return chip;
  }

  initDragAndDrop(container) {
    let draggedItem = null;

    container.querySelectorAll('.lang-chip[draggable="true"]').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        item.classList.add('opacity-50');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.code);
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('opacity-50');
        draggedItem = null;
        container.querySelectorAll('.lang-chip').forEach(c => c.classList.remove('border-warning'));
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      item.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (item !== draggedItem) item.classList.add('border-warning');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('border-warning');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('border-warning');
        if (draggedItem && item !== draggedItem) {
          const fromCode = draggedItem.dataset.code;
          const toCode = item.dataset.code;
          const fromIdx = this.settings.readingLanguages.indexOf(fromCode);
          const toIdx = this.settings.readingLanguages.indexOf(toCode);

          if (fromIdx !== -1 && toIdx !== -1) {
            this.settings.readingLanguages.splice(fromIdx, 1);
            this.settings.readingLanguages.splice(toIdx, 0, fromCode);
            this.saveSettings();
            this.renderLanguageChips();
            this.filterDemoTranslations();
          }
        }
      });
    });
  }

  filterDemoTranslations() {
    const transContainer = document.getElementById('demo-translations-container') || document.querySelector('.demo-translations');
    if (!transContainer) return;

    const activeLangs = this.settings.readingLanguages || [];

    if (this.currentQuote && this.currentQuote.translations) {
      transContainer.innerHTML = '';
      if (activeLangs.length === 0) {
        transContainer.innerHTML = '<div class="text-muted small p-2">Нет выбранных языков перевода.</div>';
        return;
      }

      activeLangs.forEach(langCode => {
        const text = this.currentQuote.translations[langCode];
        if (text) {
          const row = document.createElement('div');
          row.className = `demo-trans-row trans-${langCode} mb-2 p-2 border-start border-3 border-primary bg-dark bg-opacity-25 rounded-end`;
          row.dataset.lang = langCode;
          row.innerHTML = `
            <div class="d-flex align-items-center mb-1">
              <span class="badge bg-secondary me-2 text-uppercase">${langCode}</span>
            </div>
            <div class="demo-trans-text">${text}</div>
          `;
          transContainer.appendChild(row);
        }
      });
    } else {
      const existingRows = Array.from(transContainer.querySelectorAll('[data-lang], .demo-trans-item, [class*="trans-"]'));
      existingRows.forEach(row => {
        let lang = row.dataset.lang;
        if (!lang) {
          const match = row.className.match(/trans-([a-z]{2})/i);
          if (match) lang = match.toLowerCase();
        }
        if (lang) {
          if (activeLangs.includes(lang)) {
            row.style.display = '';
            row.style.order = activeLangs.indexOf(lang);
          } else {
            row.style.display = 'none';
          }
        }
      });
    }
  }

  renderPaliText() {
    const paliEl = document.getElementById('demo-pali-text') || document.querySelector('.demo-pali');
    if (!paliEl || !this.currentQuote || !this.currentQuote.pali) return;
    paliEl.textContent = this.transformScript(this.currentQuote.pali, this.settings.aksharamukhaScript);
  }

  applyDemoStyles() {
    const demoCard = document.getElementById('demo-preview-card') || document.querySelector('.demo-preview-card');
    if (!demoCard) return;
    demoCard.style.fontSize = this.settings.fontSize;
    demoCard.style.fontFamily = this.settings.fontFamily;
  }

  transformScript(text, targetScript) {
    if (!targetScript || targetScript === 'roman' || !window.Aksharamukha) return text;
    try {
      return window.Aksharamukha.convert(text, 'IAST', targetScript);
    } catch (e) {
      return text;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.settingsManager = new SettingsManager();
});
