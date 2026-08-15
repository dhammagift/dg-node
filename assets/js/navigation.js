export class HotkeyManager {
  constructor(options = {}) {
    this.onNextSutta = options.onNextSutta || (() => {});
    this.onPrevSutta = options.onPrevSutta || (() => {});
    this.onToggleSidebar = options.onToggleSidebar || (() => {});
    this.onFocusSearch = options.onFocusSearch || (() => {});
    this.init();
  }

  isInputFocused() {
    const active = document.activeElement;
    if (!active) return false;
    const tagName = active.tagName.toUpperCase();
    return (
      tagName === 'INPUT' ||
      tagName === 'TEXTAREA' ||
      tagName === 'SELECT' ||
      active.isContentEditable ||
      active.classList.contains('form-control') ||
      active.classList.contains('search-box')
    );
  }

  init() {
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  handleKeyDown(e) {
    const inInput = this.isInputFocused();

    if (inInput) {
      const standardTextKeys = [
        'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
        'Home', 'End', 'PageUp', 'PageDown', 'Delete', 'Backspace'
      ];
      if (standardTextKeys.includes(e.key)) {
        return;
      }
      if (e.key === 'Escape') {
        document.activeElement.blur();
        e.preventDefault();
        return;
      }
      return;
    }

    if (e.ctrlKey && e.shiftKey && e.key === '!') {
      e.preventDefault();
      const langToggleBtn = document.getElementById('btn-language-toggle');
      if (langToggleBtn) langToggleBtn.click();
      return;
    }

    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.onFocusSearch();
      return;
    }

    if (e.key === 'ArrowLeft' || (e.ctrlKey && e.key === 'ArrowLeft') || (e.altKey && e.key === 'ArrowLeft')) {
      e.preventDefault();
      this.onPrevSutta();
      return;
    }

    if (e.key === 'ArrowRight' || (e.ctrlKey && e.key === 'ArrowRight') || (e.altKey && e.key === 'ArrowRight')) {
      e.preventDefault();
      this.onNextSutta();
      return;
    }

    if (e.key === 'b' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.onToggleSidebar();
      return;
    }
  }
}

export default HotkeyManager;
