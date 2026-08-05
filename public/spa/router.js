// Smart URL Router for SPA
// Parses URLs like:
// /kacchapa → search for "kacchapa"
// /dn22:2.2 → open reader for dn22:2.2
// /dn22:2.2/kacchapa → open dn22:2.2 with "kacchapa" search active
// /kacchapa/dn22:2.2 → same as above (reordered)

class SpaRouter {
  // Sutta ID pattern: collection+number[:segment[.subsegment]]
  // Examples: dn22, mn1, sn56:11, sn56.11, dn22:2.2
  static SUTTA_ID_PATTERN = /^([a-z]{2}\d+)(?:[:.]\d+)?(?:[:.]\d+)?$/i;

  constructor() {
    this.currentView = null;
    this.currentState = {};
    this.listeners = [];
  }

  // Test if a string looks like a sutta ID
  static isSuttaId(str) {
    return this.SUTTA_ID_PATTERN.test(str);
  }

  // Normalize sutta ID format: convert sn56.11 → sn56:11
  static normalizeSuttaId(id) {
    return id.replace(/\./g, ':');
  }

  // Parse route from URL pathname and query string
  parseRoute(pathname = '', queryString = '') {
    // First check for legacy /?q=... format
    const legacyMatch = new URLSearchParams(queryString).get('q');
    if (legacyMatch) {
      return this.parseLegacyRoute(legacyMatch, queryString);
    }

    // Clean up pathname: remove leading/trailing slashes
    const parts = pathname
      .split('/')
      .filter(p => p && p !== '' && p !== 'index.html');

    // No parts = landing page
    if (parts.length === 0) {
      return {
        view: 'landing',
        suttaId: null,
        query: null,
        keyword: null,
      };
    }

    // One part: either sutta or keyword
    if (parts.length === 1) {
      const part = parts[0];
      if (SpaRouter.isSuttaId(part)) {
        return {
          view: 'reader',
          suttaId: SpaRouter.normalizeSuttaId(part),
          query: null,
          keyword: null,
        };
      } else {
        return {
          view: 'search',
          suttaId: null,
          query: part,
          keyword: part,
        };
      }
    }

    // Two parts: could be /sutta/keyword or /keyword/sutta
    const part1 = parts[0];
    const part2 = parts[1];

    const part1IsSutta = SpaRouter.isSuttaId(part1);
    const part2IsSutta = SpaRouter.isSuttaId(part2);

    if (part1IsSutta && !part2IsSutta) {
      // /dn22:2.2/kacchapa
      return {
        view: 'reader',
        suttaId: SpaRouter.normalizeSuttaId(part1),
        query: part2,
        keyword: part2,
      };
    } else if (!part1IsSutta && part2IsSutta) {
      // /kacchapa/dn22:2.2 → reorder as /dn22:2.2/kacchapa
      return {
        view: 'reader',
        suttaId: SpaRouter.normalizeSuttaId(part2),
        query: part1,
        keyword: part1,
      };
    } else if (part1IsSutta && part2IsSutta) {
      // Both suttas? Treat as reader with first sutta
      return {
        view: 'reader',
        suttaId: SpaRouter.normalizeSuttaId(part1),
        query: null,
        keyword: null,
      };
    } else {
      // Neither is sutta? Treat first as keyword, ignore second
      return {
        view: 'search',
        suttaId: null,
        query: part1,
        keyword: part1,
      };
    }
  }

  // Parse legacy /?q=... format
  parseLegacyRoute(q, queryString) {
    const params = new URLSearchParams(queryString);
    const s = params.get('s'); // optional segment search

    if (SpaRouter.isSuttaId(q)) {
      // /?q=dn22:2.2 or /?q=dn22:2.2&s=kacchapa
      return {
        view: 'reader',
        suttaId: SpaRouter.normalizeSuttaId(q),
        query: s,
        keyword: s,
      };
    } else {
      // /?q=kacchapa
      return {
        view: 'search',
        suttaId: null,
        query: q,
        keyword: q,
      };
    }
  }

  // Build clean URL from route state
  buildUrl(view, suttaId, keyword) {
    if (view === 'landing') {
      return '/';
    }

    if (view === 'search') {
      return `/${encodeURIComponent(keyword)}`;
    }

    if (view === 'reader') {
      let url = `/${suttaId}`;
      if (keyword) {
        url += `/${encodeURIComponent(keyword)}`;
      }
      return url;
    }

    return '/';
  }

  // Redirect legacy URL to clean format
  redirectLegacyUrl(pathname, queryString) {
    const params = new URLSearchParams(queryString);
    const q = params.get('q');
    const s = params.get('s');

    if (!q) return null;

    const route = this.parseLegacyRoute(q, queryString);
    const cleanUrl = this.buildUrl(route.view, route.suttaId, route.keyword);

    return cleanUrl;
  }

  // Listen for route changes
  on(callback) {
    this.listeners.push(callback);
  }

  // Emit route change
  emit(view, state) {
    this.currentView = view;
    this.currentState = state;
    this.listeners.forEach(cb => cb(view, state));
  }

  // Initialize router with popstate listener
  init() {
    window.addEventListener('popstate', () => {
      this.handleUrlChange();
    });

    // Handle initial URL
    this.handleUrlChange();
  }

  handleUrlChange() {
    const route = this.parseRoute(window.location.pathname, window.location.search);
    this.emit(route.view, route);
  }

  // Navigate to new route (updates URL and emits change)
  navigateTo(view, suttaId, keyword) {
    const url = this.buildUrl(view, suttaId, keyword);
    window.history.pushState(
      { view, suttaId, keyword },
      '',
      url
    );
    this.emit(view, { view, suttaId, keyword, query: keyword });
  }

  // Check if URL should redirect (legacy format)
  shouldRedirect() {
    const params = new URLSearchParams(window.location.search);
    return params.has('q');
  }

  getRedirectUrl() {
    return this.redirectLegacyUrl(
      window.location.pathname,
      window.location.search
    );
  }
}

// Export for use in browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpaRouter;
}
