// Global State Management for SPA
// Keeps search state and reader state isolated

class SpaState {
  constructor() {
    // Search state
    this.search = {
      query: null,
      scope: 'default', // default|all|dhamma|vinaya|abhi|khudakka|dn,mn,...
      langs: ['ru', 'en'], // active languages
      lb: 0, // lines before
      la: 0, // lines after
      exact: false, // exact word match
      results: null, // cached search results
      loading: false,
    };

    // Reader state
    this.reader = {
      suttaId: null,
      currentSegment: null, // current reading position
      highlightKeyword: null, // keyword to highlight (from search)
      editions: ['ms'], // which pali editions to show
      translations: ['ru_o', 'en_sujato'], // which translations to show
      displayMode: 'default', // default|compact|expanded
      fontSize: 'medium', // small|medium|large
      theme: 'light', // light|dark
      loading: false,
    };

    // UI state
    this.ui = {
      currentView: 'landing', // landing|search|reader
      modalOpen: false,
      modalTab: null, // settings|compass|help
      sidebarOpen: false,
      language: 'ru', // UI language
    };

    this.listeners = [];
  }

  // Search state methods
  setSearchQuery(query) {
    this.search.query = query;
    this.notifyListeners('search.query');
  }

  setSearchScope(scope) {
    this.search.scope = scope;
    this.notifyListeners('search.scope');
  }

  setSearchLangs(langs) {
    this.search.langs = Array.isArray(langs) ? langs : [langs];
    this.notifyListeners('search.langs');
  }

  setSearchContext(lb, la) {
    this.search.lb = lb;
    this.search.la = la;
    this.notifyListeners('search.context');
  }

  setSearchResults(results) {
    this.search.results = results;
    this.notifyListeners('search.results');
  }

  setSearchLoading(loading) {
    this.search.loading = loading;
    this.notifyListeners('search.loading');
  }

  // Reader state methods
  setReaderSutta(suttaId) {
    this.reader.suttaId = suttaId;
    this.reader.currentSegment = null; // reset position when opening new sutta
    this.notifyListeners('reader.sutta');
  }

  setReaderSegment(segmentId) {
    this.reader.currentSegment = segmentId;
    this.notifyListeners('reader.segment');
  }

  setReaderHighlight(keyword) {
    this.reader.highlightKeyword = keyword;
    this.notifyListeners('reader.highlight');
  }

  setReaderEditions(editions) {
    this.reader.editions = Array.isArray(editions) ? editions : [editions];
    this.notifyListeners('reader.editions');
  }

  setReaderTranslations(translations) {
    this.reader.translations = Array.isArray(translations) ? translations : [translations];
    this.notifyListeners('reader.translations');
  }

  setReaderDisplayMode(mode) {
    this.reader.displayMode = mode;
    this.notifyListeners('reader.displayMode');
  }

  setReaderFontSize(size) {
    this.reader.fontSize = size;
    this.notifyListeners('reader.fontSize');
  }

  setReaderTheme(theme) {
    this.reader.theme = theme;
    this.notifyListeners('reader.theme');
  }

  setReaderLoading(loading) {
    this.reader.loading = loading;
    this.notifyListeners('reader.loading');
  }

  // UI state methods
  setCurrentView(view) {
    this.ui.currentView = view;
    this.notifyListeners('ui.view');
  }

  setModalOpen(open, tab = null) {
    this.ui.modalOpen = open;
    if (tab) {
      this.ui.modalTab = tab;
    }
    this.notifyListeners('ui.modal');
  }

  openModalWithTab(tab) {
    this.ui.modalOpen = true;
    this.ui.modalTab = tab; // settings|compass|help
    this.notifyListeners('ui.modal');
  }

  setSidebarOpen(open) {
    this.ui.sidebarOpen = open;
    this.notifyListeners('ui.sidebar');
  }

  setUILanguage(lang) {
    this.ui.language = lang;
    this.notifyListeners('ui.language');
  }

  // State listeners
  onChange(callback) {
    this.listeners.push(callback);
  }

  notifyListeners(changedPath) {
    this.listeners.forEach(cb => cb(changedPath, this));
  }

  // Get snapshot of entire state
  getSnapshot() {
    return {
      search: { ...this.search },
      reader: { ...this.reader },
      ui: { ...this.ui },
    };
  }

  // Reset to initial state
  reset() {
    this.search = {
      query: null,
      scope: 'default',
      langs: ['ru', 'en'],
      lb: 0,
      la: 0,
      exact: false,
      results: null,
      loading: false,
    };
    this.reader = {
      suttaId: null,
      currentSegment: null,
      highlightKeyword: null,
      editions: ['ms'],
      translations: ['ru_o', 'en_sujato'],
      displayMode: 'default',
      fontSize: 'medium',
      theme: 'light',
      loading: false,
    };
    this.notifyListeners('*');
  }
}

// Export as singleton
const spaState = new SpaState();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = spaState;
}
