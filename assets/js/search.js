export class SearchController {
  constructor() {
    this.currentQuery = this.getQueryParam('q') || '';
    this.userInteracted = false;
    this.audioPlayer = null;
    this.init();
  }

  getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param) || '';
  }

  init() {
    this.bindSearchInput();
    this.initCheckboxes();
    this.initTooltips();
    this.initContextMenu();
    this.initQuoteHoverAnchors();
  }

  bindSearchInput() {
    const searchInput = document.getElementById('search-input');
    const autocompleteBox = document.getElementById('autocomplete-dropdown');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
      this.userInteracted = true;
      const val = e.target.value.trim();
      if (val.length >= 2) {
        this.fetchAutocomplete(val);
      } else if (autocompleteBox) {
        autocompleteBox.style.display = 'none';
      }
    });

    searchInput.addEventListener('focus', () => {
      if (this.userInteracted && searchInput.value.trim().length >= 2 && autocompleteBox) {
        autocompleteBox.style.display = 'block';
      }
    });

    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && autocompleteBox && !autocompleteBox.contains(e.target)) {
        autocompleteBox.style.display = 'none';
      }
    });
  }

  fetchAutocomplete(query) {
    const dropdown = document.getElementById('autocomplete-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = `
      <div class="list-group shadow">
        <a href="?q=${encodeURIComponent(query)}" class="list-group-item list-group-item-action py-1 small">
          Искать: <strong>${query}</strong>
        </a>
      </div>
    `;
    dropdown.style.display = 'block';
  }

  initCheckboxes() {
    if (!this.currentQuery) return;
    const storageKey = `dg_read_state_${encodeURIComponent(this.currentQuery.toLowerCase())}`;
    let state = {};
    try {
      state = JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch (e) {
      state = {};
    }

    document.querySelectorAll('.sutta-read-checkbox').forEach(cb => {
      const suttaId = cb.dataset.suttaId;
      if (state[suttaId]) {
        cb.checked = true;
        cb.closest('tr')?.classList.add('table-secondary', 'text-muted');
      }

      cb.addEventListener('change', (e) => {
        state[suttaId] = e.target.checked;
        try {
          localStorage.setItem(storageKey, JSON.stringify(state));
        } catch (err) {
          console.error(err);
        }
        cb.closest('tr')?.classList.toggle('table-secondary', e.target.checked);
        cb.closest('tr')?.classList.toggle('text-muted', e.target.checked);
      });
    });
  }

  initTooltips() {
    if (window.bootstrap && window.bootstrap.Tooltip) {
      document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
        new window.bootstrap.Tooltip(el);
      });
    }
  }

  initContextMenu() {
    const menu = document.getElementById('quote-context-menu');
    if (!menu) return;

    document.querySelectorAll('.quote-link-action').forEach(link => {
      link.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const suttaId = link.dataset.suttaId;
        const segmentId = link.dataset.segmentId || '';
        const quoteText = link.closest('.quote-row')?.querySelector('.quote-text')?.innerText || '';

        this.openContextMenu(e.pageX, e.pageY, { suttaId, segmentId, quoteText });
      });
    });

    document.addEventListener('click', () => {
      menu.style.display = 'none';
    });
  }

  openContextMenu(x, y, data) {
    const menu = document.getElementById('quote-context-menu');
    if (!menu) return;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';

    const modalBtn = menu.querySelector('.action-open-modal');
    const tabBtn = menu.querySelector('.action-open-tab');
    const copyLinkBtn = menu.querySelector('.action-copy-link');
    const copyQuoteBtn = menu.querySelector('.action-copy-quote');
    const audioBtn = menu.querySelector('.action-play-audio');

    const permalink = `${window.location.origin}/r/?q=${data.suttaId}#${data.segmentId}`;

    if (modalBtn) modalBtn.onclick = () => this.openInModal(data.suttaId, data.segmentId);
    if (tabBtn) tabBtn.onclick = () => window.open(permalink, '_blank');
    if (copyLinkBtn) copyLinkBtn.onclick = () => navigator.clipboard.writeText(permalink);
    if (copyQuoteBtn) copyQuoteBtn.onclick = () => navigator.clipboard.writeText(data.quoteText);
    if (audioBtn) audioBtn.onclick = () => this.playSuttaAudio(data.suttaId, data.segmentId);
  }

  openInModal(suttaId, segmentId) {
    const modalFrame = document.getElementById('preview-iframe');
    const modal = document.getElementById('preview-modal');
    if (modalFrame && modal) {
      modalFrame.src = `/r/?q=${suttaId}#${segmentId}&smooth=0`;
      if (window.bootstrap && window.bootstrap.Modal) {
        const bsModal = new window.bootstrap.Modal(modal);
        bsModal.show();
      }
    }
  }

  playSuttaAudio(suttaId, segmentId) {
    if (!this.audioPlayer) {
      this.audioPlayer = new Audio();
    }
    this.audioPlayer.src = `/api/audio/${suttaId}?segment=${segmentId}`;
    this.audioPlayer.play().catch(e => console.log('Audio playback info:', e));
  }

  initQuoteHoverAnchors() {
    document.querySelectorAll('.quote-row').forEach(row => {
      row.addEventListener('mouseenter', () => {
        row.querySelector('.quote-anchor-link')?.classList.add('visible');
      });
      row.addEventListener('mouseleave', () => {
        row.querySelector('.quote-anchor-link')?.classList.remove('visible');
      });
      row.addEventListener('touchstart', () => {
        row.querySelector('.quote-anchor-link')?.classList.toggle('visible');
      }, { passive: true });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.searchController = new SearchController();
});
