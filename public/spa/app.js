// SPA Application Bootstrap
// Initializes router, state, and view management

class SpaApp {
  constructor() {
    this.router = new SpaRouter();
    this.state = spaState; // from state.js
    this.currentView = null;
  }

  init() {
    // Check for legacy URL format and redirect
    if (this.router.shouldRedirect()) {
      const redirectUrl = this.router.getRedirectUrl();
      if (redirectUrl) {
        window.history.replaceState({}, '', redirectUrl);
      }
    }

    // Parse current URL
    const route = this.router.parseRoute(
      window.location.pathname,
      window.location.search
    );

    // Update state based on route
    this.updateStateFromRoute(route);

    // Listen for route changes from browser navigation
    this.router.on((view, route) => {
      this.updateStateFromRoute(route);
      this.renderView(view, route);
    });

    // Listen for state changes
    this.state.onChange((path, state) => {
      this.handleStateChange(path, state);
    });

    // Initial render
    this.renderView(route.view, route);

    // Initialize router's popstate listener
    this.router.init();
  }

  updateStateFromRoute(route) {
    this.state.setCurrentView(route.view);

    switch (route.view) {
      case 'landing':
        // Reset all state for landing page
        this.state.search.query = null;
        this.state.reader.suttaId = null;
        break;

      case 'search':
        this.state.setSearchQuery(route.query);
        this.state.reader.suttaId = null;
        break;

      case 'reader':
        this.state.setReaderSutta(route.suttaId);
        if (route.keyword) {
          this.state.setReaderHighlight(route.keyword);
        }
        break;
    }
  }

  renderView(view, route) {
    // This method will be implemented by view system
    console.log(`Rendering view: ${view}`, route);
    this.currentView = view;

    // Views will be in separate views.js file
    if (window.SpaViews && window.SpaViews[view]) {
      window.SpaViews[view](route, this.state);
    }
  }

  handleStateChange(path, state) {
    // Handle any state changes that need to update the DOM
    // This could trigger view re-renders or partial updates
    console.log(`State changed: ${path}`, state);
  }

  // Public API for navigation
  goToSearch(query) {
    const url = this.router.buildUrl('search', null, query);
    this.router.navigateTo('search', null, query);
  }

  goToReader(suttaId, keyword = null) {
    this.router.navigateTo('reader', suttaId, keyword);
  }

  goToLanding() {
    window.history.pushState({}, '', '/');
    this.router.handleUrlChange();
  }

  openModal(tab) {
    this.state.openModalWithTab(tab);
  }

  closeModal() {
    this.state.setModalOpen(false);
  }
}

// Export for use
const spaApp = new SpaApp();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = spaApp;
}
