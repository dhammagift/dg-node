// View Rendering System for SPA
// Manages landing, search results, and reader views

const SpaViews = {
  // Landing page view
  landing: function(route, state) {
    const container = document.getElementById('spa-container');
    if (!container) {
      console.error('spa-container element not found');
      return;
    }

    // Show landing page elements
    const mainContent = document.getElementById('main-content');
    const searchSection = document.getElementById('search-section');
    const helpSection = document.getElementById('help-section');
    const aboutSection = document.getElementById('about-section');

    if (searchSection) searchSection.style.display = 'block';
    if (helpSection) helpSection.style.display = 'block';
    if (aboutSection) aboutSection.style.display = 'block';

    // Clear search results
    const resultsSection = document.getElementById('search-results-section');
    if (resultsSection) resultsSection.style.display = 'none';

    // Hide reader
    const readerSection = document.getElementById('reader-section');
    if (readerSection) readerSection.style.display = 'none';

    // Focus on search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 100);
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    state.setCurrentView('landing');
  },

  // Search results view
  search: function(route, state) {
    const container = document.getElementById('spa-container');
    if (!container) {
      console.error('spa-container element not found');
      return;
    }

    // Update search input with query
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.value = route.query || '';
    }

    // Show search results section
    const resultsSection = document.getElementById('search-results-section');
    if (resultsSection) {
      resultsSection.style.display = 'block';
    }

    // Hide full-page info sections
    const helpSection = document.getElementById('help-section');
    const aboutSection = document.getElementById('about-section');
    if (helpSection) helpSection.style.display = 'none';
    if (aboutSection) aboutSection.style.display = 'none';

    // Hide reader
    const readerSection = document.getElementById('reader-section');
    if (readerSection) readerSection.style.display = 'none';

    // Trigger search
    state.setSearchQuery(route.query);
    state.setCurrentView('search');

    // If we have search results already cached, show them
    if (state.search.results) {
      SpaViews.renderSearchResults(state.search.results);
    } else {
      SpaViews.performSearch(route.query, state);
    }

    // Scroll search input into view
    if (searchInput) {
      setTimeout(() => {
        searchInput.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  },

  // Reader view
  reader: function(route, state) {
    const container = document.getElementById('spa-container');
    if (!container) {
      console.error('spa-container element not found');
      return;
    }

    // Show reader section
    const readerSection = document.getElementById('reader-section');
    if (readerSection) {
      readerSection.style.display = 'block';
    }

    // Hide info sections
    const helpSection = document.getElementById('help-section');
    const aboutSection = document.getElementById('about-section');
    const resultsSection = document.getElementById('search-results-section');
    if (helpSection) helpSection.style.display = 'none';
    if (aboutSection) aboutSection.style.display = 'none';
    if (resultsSection) resultsSection.style.display = 'none';

    // Update search input to show sutta citation
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.placeholder = 'Search or enter citation...';
      searchInput.value = route.suttaId || '';
    }

    // Load reader content
    state.setReaderSutta(route.suttaId);
    if (route.keyword) {
      state.setReaderHighlight(route.keyword);
    }
    state.setCurrentView('reader');

    // Load and render reader (would call existing megareader.js logic)
    SpaViews.loadReader(route.suttaId, route.keyword, state);

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // Perform search via API
  performSearch: async function(query, state) {
    if (!query || query.trim() === '') {
      return;
    }

    state.setSearchLoading(true);

    try {
      const params = new URLSearchParams({
        q: query,
        scope: state.search.scope,
        langs: state.search.langs.join(','),
        lb: state.search.lb,
        la: state.search.la,
        exact: state.search.exact,
      });

      const response = await fetch(`/search?${params}`);
      const results = await response.json();

      state.setSearchResults(results);
      SpaViews.renderSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      state.setSearchLoading(false);
    }
  },

  // Render search results in table
  renderSearchResults: function(results) {
    const container = document.getElementById('search-results-container');
    if (!container) {
      console.error('search-results-container not found');
      return;
    }

    // This would integrate with existing DataTables logic
    // For now, just a placeholder
    console.log('Rendering search results:', results);

    // Would call existing renderResultsTable() or similar
    if (window.renderResultsTable) {
      window.renderResultsTable(results);
    }
  },

  // Load reader content
  loadReader: async function(suttaId, keyword, state) {
    if (!suttaId) {
      console.error('No sutta ID provided to reader');
      return;
    }

    state.setReaderLoading(true);

    try {
      // This would integrate with existing megareader.js logic
      // Fetch sutta content and render it

      // Placeholder: would call existing reader loading functions
      if (window.loadReaderContent) {
        await window.loadReaderContent(suttaId, state.reader.editions, state.reader.translations);
      }

      if (keyword) {
        // Highlight keyword in reader
        if (window.highlightInReader) {
          window.highlightInReader(keyword);
        }
      }
    } catch (error) {
      console.error('Reader error:', error);
    } finally {
      state.setReaderLoading(false);
    }
  },

  // Handle search input changes
  setupSearchInputListener: function(state) {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;

    let searchTimeout;
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
          spaApp.goToSearch(query);
        }
      }
    });

    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      // Could add real-time search suggestions here
    });
  },

  // Modal management
  openSettingsModal: function() {
    if (spaApp) {
      spaApp.openModal('settings');
    }
  },

  openCompassModal: function() {
    if (spaApp) {
      spaApp.openModal('compass');
    }
  },

  openHelpModal: function() {
    if (spaApp) {
      spaApp.openModal('help');
    }
  },
};

// Make available globally
if (typeof window !== 'undefined') {
  window.SpaViews = SpaViews;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpaViews;
}
