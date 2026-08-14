const DEFAULT_SETTINGS = {
  uiLanguage: 'ru',
  translationLanguages: ['ru', 'en'],
  theme: 'dark',
  fontSize: '18px',
  fontFamily: 'serif',
  aksharamukhaScript: 'roman',
  apiKey: '',
  siteRoot: '',
  activeTab: 'reading',
  preferredDictionaries: ['ru-pali', 'pts', 'cone', 'dp', 'cped']
};

export class SettingsManager {
  constructor() {
    this.settings = this.loadSettings();
    this.currentDemoQuote = {
      pali: 'Sabbe saṅkhārā aniccāti, yadā paññāya passati.',
      translations: {
        ru: 'Когда человек постигает с мудростью: «Все обусловленные вещи непостоянны»...',
        en: 'When one sees with wisdom that all conditioned things are impermanent...',
        de: 'Wenn man mit Weisheit erkennt: «Alle bedingten Dinge sind unbeständig»...'
      },
      suttaId: 'dhp277',
      segmentId: 'dhp277:1'
    };
    this.init();
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem('dg_settings');
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Could not read settings from localStorage:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  saveSettings() {
    try {
      localStorage.setItem('dg_settings', JSON.stringify(this.settings));
      this.applyGlobalStyles();
    } catch (e) {
      console.error('Could not save settings:', e);
    }
  }

  init() {
    this.bindEvents();
    this.populateForm();
    this.updateDemoPreview();
    this.updateDictionaryOrderList();
    this.updateStickyVisibility();
  }

  bindEvents() {
    const uiLangSelect = document.getElementById('setting-ui-lang');
    if (uiLangSelect) {
      uiLangSelect.addEventListener('change', (e) => {
        const newLang = e.target.value;
        this.settings.uiLanguage = newLang;
        if (!this.settings.customLanguagesSaved) {
          this.settings.translationLanguages = newLang === 'ru' ? ['ru', 'en'] : ['en'];
        }
        this.saveSettings();
        this.populateForm();
        this.updateDictionaryOrderList();
        this.updateDemoPreview();
      });
    }

    const btnRefreshStyles = document.getElementById('btn-refresh-demo-style');
    if (btnRefreshStyles) {
      btnRefreshStyles.addEventListener('click', () => {
        this.applyDemoStyles();
      });
    }

    const btnRandomQuote = document.getElementById('btn-randomize-quote');
    if (btnRandomQuote) {
      btnRandomQuote.addEventListener('click', () => {
        this.fetchRandomDemoQuote();
      });
    }

    const btnToggleApi = document.getElementById('btn-toggle-api-key');
    const inputApiKey = document.getElementById('setting-api-key');
    if (btnToggleApi && inputApiKey) {
      btnToggleApi.addEventListener('click', () => {
        const isPassword = inputApiKey.type === 'password';
        inputApiKey.type = isPassword ? 'text' : 'password';
        const icon = btnToggleApi.querySelector('i');
        if (icon) {
          icon.className = isPassword ? 'bi bi-eye-slash' : 'bi bi-eye';
        }
      });
    }

    const btnClearApi = document.getElementById('btn-clear-api-key');
    if (btnClearApi && inputApiKey) {
      btnClearApi.addEventListener('click', () => {
        const confirmMsg = this.settings.uiLanguage === 'ru' 
          ? 'Вы уверены, что хотите удалить сохраненный API ключ?' 
          : 'Are you sure you want to clear your API key?';
        if (confirm(confirmMsg)) {
          inputApiKey.value = '';
          this.settings.apiKey = '';
          this.saveSettings();
        }
      });
    }

    document.querySelectorAll('.btn-back-action').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = this.settings.siteRoot || '/';
        }
      });
    });

    const dictTestInput = document.getElementById('dict-test-input');
    const dictTestBtn = document.getElementById('btn-dict-test');
    if (dictTestBtn && dictTestInput) {
      dictTestBtn.addEventListener('click', () => {
        this.testDictionaryLookup(dictTestInput.value);
      });
    }

    document.querySelectorAll('.settings-nav-item').forEach(navItem => {
      navItem.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        this.settings.activeTab = tab;
        this.updateStickyVisibility();
      });
    });
  }

  populateForm() {
    const uiLang = document.getElementById('setting-ui-lang');
    if (uiLang) uiLang.value = this.settings.uiLanguage;

    const apiKeyInput = document.getElementById('setting-api-key');
    if (apiKeyInput) apiKeyInput.value = this.settings.apiKey;

    const siteRootInput = document.getElementById('setting-siteroot');
    if (siteRootInput) siteRootInput.value = this.settings.siteRoot;
  }

  updateDemoPreview() {
    const paliEl = document.getElementById('demo-pali-text');
    const transContainer = document.getElementById('demo-translations-container');
    const readLink = document.getElementById('demo-read-link');

    if (paliEl) {
      paliEl.textContent = this.transformScript(this.currentDemoQuote.pali, this.settings.aksharamukhaScript);
    }

    if (transContainer) {
      transContainer.innerHTML = '';
      this.settings.translationLanguages.forEach(lang => {
        if (this.currentDemoQuote.translations[lang]) {
          const p = document.createElement('p');
          p.className = `demo-trans-item trans-${lang} mb-1`;
          p.innerHTML = `<span class="badge bg-secondary me-1">${lang.toUpperCase()}</span> ${this.currentDemoQuote.translations[lang]}`;
          transContainer.appendChild(p);
        }
      });
    }

    if (readLink) {
      readLink.href = `${this.settings.siteRoot}/r/?q=${this.currentDemoQuote.suttaId}#${this.currentDemoQuote.segmentId}`;
    }

    this.applyDemoStyles();
  }

  applyDemoStyles() {
    const container = document.getElementById('demo-preview-card');
    if (!container) return;
    container.style.fontSize = this.settings.fontSize;
    container.style.fontFamily = this.settings.fontFamily;
  }

  transformScript(text, targetScript) {
    if (!targetScript || targetScript === 'roman' || !window.Aksharamukha) {
      return text;
    }
    try {
      return window.Aksharamukha.convert(text, 'IAST', targetScript);
    } catch (e) {
      return text;
    }
  }

  updateStickyVisibility() {
    const stickyDemo = document.getElementById('sticky-demo-panel');
    if (!stickyDemo) return;
    const shouldShow = ['reading', 'dictionary'].includes(this.settings.activeTab);
    stickyDemo.style.display = shouldShow ? 'block' : 'none';
  }

  updateDictionaryOrderList() {
    const list = document.getElementById('dict-order-list');
    if (!list) return;
    
    const isRu = this.settings.uiLanguage === 'ru';
    const dicts = isRu 
      ? ['ru-pali', 'pts', 'cone', 'dp', 'cped']
      : ['pts', 'cone', 'dp', 'cped', 'ru-pali'];

    list.innerHTML = '';
    dicts.forEach(d => {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center py-1';
      li.textContent = d.toUpperCase();
      list.appendChild(li);
    });
  }

  testDictionaryLookup(term) {
    const resultBox = document.getElementById('dict-test-result');
    if (!resultBox || !term) return;
    resultBox.innerHTML = `
      <div class="alert alert-info py-2 my-2">
        <strong>${term}</strong>: <em>(Тестовая словарная статья)</em>
        <div class="small mt-1 text-muted">Демонстрация стилей и шрифта словаря: font-size ${this.settings.fontSize}.</div>
      </div>
    `;
  }

  applyGlobalStyles() {
    document.documentElement.setAttribute('data-theme', this.settings.theme);
  }

  fetchRandomDemoQuote() {
    const quotes = [
      {
        pali: 'Sabbe dhammā anattāti, yadā paññāya passati.',
        translations: { ru: 'Все феномены лишены самости...', en: 'All phenomena are not-self...' },
        suttaId: 'dhp279',
        segmentId: 'dhp279:1'
      },
      {
        pali: 'Appamādo amatapadaṁ, pamādo maccuno padaṁ.',
        translations: { ru: 'Осознанность — стезя к бессмертию, беспечность — путь к смерти.', en: 'Heedfulness is the path to the Deathless, heedlessness is the path to death.' },
        suttaId: 'dhp21',
        segmentId: 'dhp21:1'
      }
    ];
    const rand = quotes[Math.floor(Math.random() * quotes.length)];
    this.currentDemoQuote = { ...this.currentDemoQuote, ...rand };
    this.updateDemoPreview();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.settingsManager = new SettingsManager();
});

export default SettingsManager;
