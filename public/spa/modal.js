// Unified Modal System for SPA
// Combines Settings, Compass, and Help into one modal with tabs

class SpaModal {
  constructor(state) {
    this.state = state;
    this.modal = null;
    this.currentTab = null;
    this.tabs = {
      settings: { icon: '🔧', label: 'Settings' },
      compass: { icon: '☸', label: 'Compass' },
      help: { icon: '❓', label: 'Help' },
    };
  }

  init() {
    this.createModalHTML();
    this.attachEventListeners();

    // Listen for state changes
    this.state.onChange((path, state) => {
      if (path === 'ui.modal') {
        if (state.ui.modalOpen) {
          this.open(state.ui.modalTab);
        } else {
          this.close();
        }
      }
    });
  }

  createModalHTML() {
    const modalHTML = `
      <div id="spa-modal" class="modal fade" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <ul class="nav nav-tabs" role="tablist" id="spa-modal-tabs">
                <li class="nav-item" role="presentation">
                  <button class="nav-link active" id="settings-tab" data-bs-toggle="tab"
                          data-bs-target="#settings-panel" type="button" role="tab">
                    🔧 Settings
                  </button>
                </li>
                <li class="nav-item" role="presentation">
                  <button class="nav-link" id="compass-tab" data-bs-toggle="tab"
                          data-bs-target="#compass-panel" type="button" role="tab">
                    ☸ Compass
                  </button>
                </li>
                <li class="nav-item" role="presentation">
                  <button class="nav-link" id="help-tab" data-bs-toggle="tab"
                          data-bs-target="#help-panel" type="button" role="tab">
                    ❓ Help
                  </button>
                </li>
              </ul>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="tab-content" id="spa-modal-content">
                <!-- Settings Tab -->
                <div class="tab-pane fade show active" id="settings-panel" role="tabpanel">
                  <div id="settings-content">
                    <h5>Display Settings</h5>
                    <div class="mb-3">
                      <label class="form-label">Script System</label>
                      <div class="btn-group" role="group">
                        <input type="radio" class="btn-check" name="script" id="script-iso" value="iso" checked>
                        <label class="btn btn-outline-primary" for="script-iso">ISO Pali</label>
                        <input type="radio" class="btn-check" name="script" id="script-devanagari" value="devanagari">
                        <label class="btn btn-outline-primary" for="script-devanagari">Devanagari</label>
                        <input type="radio" class="btn-check" name="script" id="script-thai" value="thai">
                        <label class="btn btn-outline-primary" for="script-thai">Thai</label>
                      </div>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Font Size</label>
                      <input type="range" class="form-range" id="font-size" min="12" max="24" value="16">
                      <small class="text-muted">Current: <span id="font-size-display">16</span>px</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Theme</label>
                      <div class="form-check">
                        <input class="form-check-input" type="radio" name="theme" id="theme-light" value="light" checked>
                        <label class="form-check-label" for="theme-light">Light</label>
                      </div>
                      <div class="form-check">
                        <input class="form-check-input" type="radio" name="theme" id="theme-dark" value="dark">
                        <label class="form-check-label" for="theme-dark">Dark</label>
                      </div>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Display Mode</label>
                      <select class="form-select" id="display-mode">
                        <option value="default">Default</option>
                        <option value="compact">Compact</option>
                        <option value="expanded">Expanded</option>
                      </select>
                    </div>
                  </div>
                </div>

                <!-- Compass Tab (Dharma Wheel - Navigation) -->
                <div class="tab-pane fade" id="compass-panel" role="tabpanel">
                  <div id="compass-content">
                    <h5>Cattāri Ariyasaccāni (Four Noble Truths)</h5>
                    <div class="row">
                      <div class="col-md-6 mb-3">
                        <button class="btn btn-outline-info w-100" id="truth-1">
                          <strong>Suffering (Dukkha)</strong><br>
                          <small>The First Noble Truth</small>
                        </button>
                      </div>
                      <div class="col-md-6 mb-3">
                        <button class="btn btn-outline-info w-100" id="truth-2">
                          <strong>Origin (Samudaya)</strong><br>
                          <small>The Second Noble Truth</small>
                        </button>
                      </div>
                      <div class="col-md-6 mb-3">
                        <button class="btn btn-outline-info w-100" id="truth-3">
                          <strong>Cessation (Nirodha)</strong><br>
                          <small>The Third Noble Truth</small>
                        </button>
                      </div>
                      <div class="col-md-6 mb-3">
                        <button class="btn btn-outline-info w-100" id="truth-4">
                          <strong>Path (Magga)</strong><br>
                          <small>The Fourth Noble Truth</small>
                        </button>
                      </div>
                    </div>
                    <hr>
                    <h5>Recent Suttas</h5>
                    <div id="compass-history">
                      <p class="text-muted">No recent suttas</p>
                    </div>
                  </div>
                </div>

                <!-- Help Tab -->
                <div class="tab-pane fade" id="help-panel" role="tabpanel">
                  <div id="help-content">
                    <h5>Keyboard Shortcuts</h5>
                    <table class="table table-sm">
                      <tbody>
                        <tr>
                          <td><kbd>/</kbd></td>
                          <td>Focus search input</td>
                        </tr>
                        <tr>
                          <td><kbd>Ctrl</kbd> + <kbd>F</kbd></td>
                          <td>Find on page</td>
                        </tr>
                        <tr>
                          <td><kbd>Esc</kbd></td>
                          <td>Close modal or exit search</td>
                        </tr>
                        <tr>
                          <td><kbd>←</kbd> / <kbd>→</kbd></td>
                          <td>Previous / Next segment in reader</td>
                        </tr>
                      </tbody>
                    </table>
                    <h5>URL Formats</h5>
                    <ul>
                      <li><code>/keyword</code> — Search for keyword</li>
                      <li><code>/dn22:2.2</code> — Open reader for sutta</li>
                      <li><code>/dn22:2.2/kacchapa</code> — Open sutta with keyword highlighted</li>
                      <li><code>/kacchapa/dn22:2.2</code> — Same as above (order flexible)</li>
                    </ul>
                    <h5>Dictionary Lookup</h5>
                    <p>Click on any Pali word in the reader to open dictionary.</p>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Insert modal into page if not already there
    if (!document.getElementById('spa-modal')) {
      document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    this.modal = document.getElementById('spa-modal');
  }

  attachEventListeners() {
    if (!this.modal) return;

    // Tab buttons
    const settingsTab = this.modal.querySelector('#settings-tab');
    const compassTab = this.modal.querySelector('#compass-tab');
    const helpTab = this.modal.querySelector('#help-tab');

    if (settingsTab) {
      settingsTab.addEventListener('click', () => {
        this.currentTab = 'settings';
        this.state.ui.modalTab = 'settings';
      });
    }

    if (compassTab) {
      compassTab.addEventListener('click', () => {
        this.currentTab = 'compass';
        this.state.ui.modalTab = 'compass';
      });
    }

    if (helpTab) {
      helpTab.addEventListener('click', () => {
        this.currentTab = 'help';
        this.state.ui.modalTab = 'help';
      });
    }

    // Settings controls
    const fontSizeInput = this.modal.querySelector('#font-size');
    if (fontSizeInput) {
      fontSizeInput.addEventListener('change', (e) => {
        const size = e.target.value;
        this.state.setReaderFontSize(size);
        this.modal.querySelector('#font-size-display').textContent = size;
      });
    }

    const themeRadios = this.modal.querySelectorAll('input[name="theme"]');
    themeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.state.setReaderTheme(e.target.value);
      });
    });

    const displayModeSelect = this.modal.querySelector('#display-mode');
    if (displayModeSelect) {
      displayModeSelect.addEventListener('change', (e) => {
        this.state.setReaderDisplayMode(e.target.value);
      });
    }

    // Compass buttons - search for Four Noble Truths
    const compassButtons = [
      { id: 'truth-1', query: 'dukkha suffering' },
      { id: 'truth-2', query: 'samudaya origin' },
      { id: 'truth-3', query: 'nirodha cessation' },
      { id: 'truth-4', query: 'magga path' },
    ];

    compassButtons.forEach(({ id, query }) => {
      const btn = this.modal.querySelector(`#${id}`);
      if (btn) {
        btn.addEventListener('click', () => {
          this.close();
          spaApp.goToSearch(query);
        });
      }
    });
  }

  open(tab = 'settings') {
    if (!this.modal) {
      console.error('Modal not initialized');
      return;
    }

    this.currentTab = tab || 'settings';

    // Use Bootstrap modal API
    const bsModal = new bootstrap.Modal(this.modal);
    bsModal.show();

    // Activate the requested tab
    const tabButton = this.modal.querySelector(`#${tab}-tab`);
    if (tabButton) {
      const tab = new bootstrap.Tab(tabButton);
      tab.show();
    }

    this.state.setModalOpen(true, tab);
  }

  close() {
    if (!this.modal) return;

    const bsModal = bootstrap.Modal.getInstance(this.modal);
    if (bsModal) {
      bsModal.hide();
    }

    this.state.setModalOpen(false);
  }

  // Set up global keyboard shortcuts
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + / to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
          searchInput.focus();
        }
      }

      // Esc to close modal or exit current view
      if (e.key === 'Escape') {
        if (this.state.ui.modalOpen) {
          this.close();
        }
      }
    });
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpaModal;
}
