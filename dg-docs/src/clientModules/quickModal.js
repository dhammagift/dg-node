// Lets the docs site open the same quickModal (Cattāri Ariyasaccāni / Favorites / History /
// Memo / Dict overlay) as the main app — via Alt+P, Alt+Y, or the compass navbar icon
// (docusaurus.config.js) — without duplicating its logic. Loads the real production
// /assets/js/quickModal.js + its CSS lazily, same-origin, absolute paths (not baseUrl-relative
// — this is a raw DOM injection, not a Docusaurus-processed asset).
if (typeof document !== 'undefined') {
  // quickModal.js (and its CSS, extrastyles.css) key their dark styling off `body.dark` /
  // `html.dark` — the main app's own convention. Docusaurus tracks color mode as
  // `data-theme="dark"` on <html> instead, so without this the modal always rendered light
  // regardless of the docs site's actual theme. Kept in sync via a narrow attribute observer,
  // not the docs page's own theme toggle (which we don't own/can't hook into directly).
  function syncDarkClass() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.body.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }
  syncDarkClass();
  new MutationObserver(syncDarkClass).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  function ensureQuickModalLoaded(cb) {
    if (window.toggleQuickModal) {
      cb();
      return;
    }
    if (!document.querySelector('link[data-quickmodal-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/assets/css/extrastyles.css';
      link.setAttribute('data-quickmodal-css', '1');
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = '/assets/js/quickModal.js';
    script.onload = cb;
    document.body.appendChild(script);
  }

  // Optional tabKey ('tab-fav'|'tab-4as'|'tab-memo'|'tab-dpd') passes straight through to
  // toggleQuickModal (public/overrides/js/quickModal.js) — deep-links to a specific tab, used
  // by the quickmodal.md help page's four links.
  window.dgOpenQuickModal = function (tabKey) {
    ensureQuickModalLoaded(function () {
      window.toggleQuickModal(tabKey);
    });
  };

  document.addEventListener('keydown', function (e) {
    // Same physical-key check as the main app (public/overrides/js/settings.js) — KeyP/KeyY
    // by event.code (layout-independent), not by character.
    if (e.altKey && (e.code === 'KeyP' || e.code === 'KeyY')) {
      e.preventDefault();
      window.dgOpenQuickModal();
    }
  });
}
