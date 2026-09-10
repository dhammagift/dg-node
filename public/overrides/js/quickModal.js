// === Файл: /assets/js/quickModal.js ===
// OVERRIDE COPY of legacy /assets/js/quickModal.js (dg repo) — see CLAUDE.md override pattern.
// Diff: removed the gear+hidden-select "Dictionary Selection" icon from the header actions row
// (quick-dict-wrapper/#quick-dict-select) — dg-node now has a proper dictionary-mode dropdown in
// Quick settings (search/js/home.js, dictModePicker/DICT_MODE_GROUPS), this one duplicated it and
// read as "yet another gear" next to the real settings gear and the quick-settings icon (owner:
// too many gears, confusing).

window.isRu = window.location.pathname.includes('/r/') || 
                     window.location.pathname.includes('/ru/') || 
                     window.location.pathname.includes('/ml/') || 
                     window.location.pathname.includes('/mt/');
// Делаем переменные глобальными для доступа из других скриптов
window.isQuickModalRendered = false;
window.quickModalIsOpen = false;
window.quickOverlay = null;
window.quickModal = null;

// Offline app only (window.dgOfflineReady, set by dg-app-full's src/app.js — undefined on the real
// site, so this never runs there). Google OAuth login can't come back into the app: the "Log in"
// button opens the real site in an external Chrome Custom Tab (native-bridge.js, required by
// Google — it rejects OAuth inside any embedded WebView), but that tab is a different browser
// with different storage on a different origin (dhamma.gift vs the app's own https://localhost)
// — there is no channel back into the app's WebView, so the resulting Firebase session, and any
// favorites/history it would sync, never reach the app (owner-reported: page shows logged in,
// modal stays empty). The site's /login already has a second, OAuth-free path for exactly this —
// a user-chosen passphrase (login/indexBak.html's uiLoginPhrase: SHA-256 hash, "anon_" + first 24
// hex chars, is the Firestore doc id) — same phrase on two devices reaches the same cloud data,
// no browser handoff needed. Reproduced here (not called via a page navigation, since /login
// itself isn't part of this app) using window.syncEnablePhrase, already loaded on this page via
// settings-bundle.js. This is the "Merge" choice from that page's confirmation modal (keep local
// data, add cloud on top) — the only non-destructive one (settings.js's setupCloudListeners does
// this merge automatically); "Overwrite" (wipe local first) isn't offered here, same result is
// reachable by clearing favorites/history first if that's ever actually wanted.
async function dgOfflineLoginWithPhrase() {
    const phrase = window.prompt(window.isRu
        ? 'Секретная фраза для синхронизации (или придумайте новую, от 8 символов) — та же фраза на другом устройстве подключит те же избранное/историю:'
        : 'Sync passphrase (or make up a new one, 8+ characters) — the same phrase on another device connects the same favorites/history:');
    if (!phrase) return;
    const rawPhrase = phrase.trim().toLowerCase().replace(/\s+/g, '-');
    if (rawPhrase.length < 8) {
        if (typeof showBubbleNotification === 'function') {
            showBubbleNotification(window.isRu ? '❌ Слишком короткая фраза' : '❌ Phrase too short');
        }
        return;
    }
    if (typeof window.syncEnablePhrase !== 'function') return;
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawPhrase));
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    await window.syncEnablePhrase(rawPhrase, 'anon_' + hashHex.substring(0, 24));
    if (typeof window.refreshQuickModalData === 'function') window.refreshQuickModalData();
    if (typeof showBubbleNotification === 'function') {
        showBubbleNotification(window.isRu ? '✅ Вход выполнен' : '✅ Logged in', 2500, 'success');
    }
}

function buildQuickModalDOM() {
  const currentPath = window.location.pathname;
  let currentUrl = window.location.href;
  let urlWithoutParams = currentUrl.split('?')[0];
  let queryBase = urlWithoutParams.endsWith("/ru/") || urlWithoutParams.endsWith("/r/") 
    ? "/r/?q=" 
    : "/read/?q=";
  
  const formAction = currentPath.match(/\/(ru|r)\//) ? '/ru/' : '/';

  const isDark = document.body.classList.contains("dark");
  
  const tabFavText = window.isRu ? "★ Избранное" : "★ Favorites";
  const favTitleText = window.isRu ? "Избранное" : "Favorites";
  const tabLinksText = "4 Ariyasaccāni";
  const tabMemoText = window.isRu ? "Запоминание" : "Memo";
  const memoPath = window.isRu ? "/ru/memo/" : "/memo/";
  const tabDpdText = window.isRu ? "Словарь" : "Dict";
  const histTitleText = window.isRu ? "История поиска" : "Search History";
  const titleClearAll = window.isRu ? "Очистить историю" : "Clear history";
  const dpdTheme = isDark ? "dark" : "light";
  const dpdUrl = `https://dict.dhamma.gift${window.isRu ? '/ru/' : '/'}?theme=${dpdTheme}`;

  // Создаем узлы
  quickOverlay = document.createElement("div");
  quickOverlay.className = "quick-overlay-element";
  
  quickModal = document.createElement("div");
  quickModal.className = "quick-modal-container";

  quickModal.innerHTML = `
    <div class="quick-modal-content-wrapper">
      <button id="quickCloseModalBtn" class="quick-close-btn" title="(Esc)">×</button>

      <form id="quickSearchForm" class="quick-search-form" action="${formAction}" method="GET">
          <input type="search" name="q" id="quickSearchInput" class="quick-search-input" placeholder="e.g. Kāyagatā or sn56.11" autocomplete="off">
          <button type="button" id="quickSettingsBtn" class="dg-qs-btn" aria-label="${window.isRu ? 'Быстрые настройки' : 'Quick settings'}" title="${window.isRu ? 'Быстрые настройки' : 'Quick settings'}">
              <svg class="dg-qs-gear" aria-hidden="true" focusable="false" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M0 416C0 398.3 14.33 384 32 384H86.66C99 355.7 127.2 336 160 336C192.8 336 220.1 355.7 233.3 384H480C497.7 384 512 398.3 512 416C512 433.7 497.7 448 480 448H233.3C220.1 476.3 192.8 496 160 496C127.2 496 99 476.3 86.66 448H32C14.33 448 0 433.7 0 416V416zM192 416C192 398.3 177.7 384 160 384C142.3 384 128 398.3 128 416C128 433.7 142.3 448 160 448C177.7 448 192 433.7 192 416zM352 176C384.8 176 412.1 195.7 425.3 224H480C497.7 224 512 238.3 512 256C512 273.7 497.7 288 480 288H425.3C412.1 316.3 384.8 336 352 336C319.2 336 291 316.3 278.7 288H32C14.33 288 0 273.7 0 256C0 238.3 14.33 224 32 224H278.7C291 195.7 319.2 176 352 176zM384 256C384 238.3 369.7 224 352 224C334.3 224 320 238.3 320 256C320 273.7 334.3 288 352 288C369.7 288 384 273.7 384 256zM480 64C497.7 64 512 78.33 512 96C512 113.7 497.7 128 480 128H265.3C252.1 156.3 224.8 176 192 176C159.2 176 131 156.3 118.7 128H32C14.33 128 0 113.7 0 96C0 78.33 14.33 64 32 64H118.7C131 35.75 159.2 16 192 16C224.8 16 252.1 35.75 265.3 64H480zM160 96C160 113.7 174.3 128 192 128C209.7 128 224 113.7 224 96C224 78.33 209.7 64 192 64C174.3 64 160 78.33 160 96z"></path></svg>
          </button>
          <button type="submit" id="quickSearchBtn" class="quick-search-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </button>
      </form>

      <div class="quick-tabs-wrapper">
        <div class="quick-tabs">
          <button class="quick-tab-btn active" data-tab="tab-fav">${tabFavText}</button>
          <button class="quick-tab-btn" data-tab="tab-4as">${tabLinksText}</button>
          <button class="quick-tab-btn" data-tab="tab-memo">${tabMemoText}</button>
          <button class="quick-tab-btn" data-tab="tab-dpd">${tabDpdText}</button>
        </div>
        
        <div class="quick-actions-right">
            <span class="action-btn" id="btn-sync-now" title="${window.isRu ? 'Синхронизировать' : 'Sync Now'}">
               <img src="/assets/svg/rotate-solid-full.svg" width="20" height="20" alt="Login & Sync">
            </span>

            <span class="clear-all-btn action-btn" id="main-trash-icon" title="${titleClearAll}">
               <img src="/assets/svg/trash-can-regular-full.svg" width="25" height="25" alt="Reset">
            </span>
            <span class="action-btn cursor-pointer" id="main-open-window-icon" title="${window.isRu ? 'Открыть в новом окне' : 'Open in new window'}" style="display: none;">
               <img src="/assets/svg/open-link.svg" width="20" height="20" alt="Open">
            </span>
        </div>
      </div>

  
      <div id="tab-fav" class="quick-tab-content active">
        <h6 id="fav-header" class="sortable-header">
          <span class="header-title" title="Сортировать">${favTitleText}</span>
          <div class="header-actions">
            <span class="sort-icon-fav sort-trigger" title="Сортировать">⇅</span>
          </div>
        </h6>
        <div id="quick-favorites-container"></div>
        
        <h6 id="hist-header" class="sortable-header">
          <span class="header-title" title="Сортировать">${histTitleText}</span>
          <div class="header-actions">
            <span class="sort-icon-hist sort-trigger" title="Сортировать">⇅</span>
          </div>
        </h6>
        <div id="quick-history-container"></div>
        
        <div class="quick-all-history-wrapper" style="display: flex; justify-content: space-between; align-items: center;">
            <a href="${window.isRu ? '/ru/assets/common/history.html' : '/assets/common/history.html'}" class="quick-all-history-link">
                ${window.isRu ? "← Ваша история" : "← Your history"}
            </a>
            <a href="${window.isRu ? '/ru/history.php' : '/history.php'}" class="quick-all-history-link">
                ${window.isRu ? "Общая история →" : "Common history →"}
            </a>
        </div>

      </div>

      <div id="tab-4as" class="quick-tab-content">
        <div class="quick-links-container">
          <div class="quick-links-column">
            <p>1st priority:</p>
            <ul>
              <li><a href="${queryBase}sn56.11" target="_blank" class="link-primary">SN 56.11</a> <span class="text-muted small">Four Noble Truths</span></li>
              <li><a href="${queryBase}dn22" target="_blank" class="link-primary">DN 22</a> <span class="text-muted small">Foundations of Mindfulness</span></li>
              <li><a href="${queryBase}sn12.2" target="_blank" class="link-primary">SN 12.2</a> <span class="text-muted small">Dependent Origination</span></li>
            </ul>
          </div>
          <div class="quick-links-column">
            <p>Clarify 5 khandha:</p>
            <ul>
              <li><a href="${queryBase}sn22.56" target="_blank" class="link-success">SN 22.56</a> <span class="text-muted small">Aggregates of Clinging</span></li>
              <li><a href="${queryBase}sn22.79" target="_blank" class="link-success">SN 22.79</a> <span class="text-muted small">Being Devoured</span></li>
              <li><a href="${queryBase}sn22.85" target="_blank" class="link-success">SN 22.85</a> <span class="text-muted small">Paired Questions</span></li>
              <li><a href="${queryBase}sn22" target="_blank" class="link-success">SN 22</a> <span class="text-muted small">Aggregates, full chapter</span></li>
            </ul>
          </div>
          <div class="quick-links-column">
            <p>Clarify 6 ajjhattāyatana:</p>
            <ul>
              <li><a href="${queryBase}sn35.228" target="_blank" class="link-warning">SN 35.228</a> <span class="text-muted small">Simile of the Ocean</span></li>
              <li><a href="${queryBase}sn35.229" target="_blank" class="link-warning">SN 35.229</a> <span class="text-muted small">Simile of the Ocean (2)</span></li>
              <li><a href="${queryBase}sn35.236" target="_blank" class="link-warning">SN 35.236</a> <span class="text-muted small">Simile of Hands and Feet</span></li>
              <li><a href="${queryBase}sn35.238" target="_blank" class="link-warning">SN 35.238</a> <span class="text-muted small">Simile of the Vipers</span></li>
              <li><a href="${queryBase}sn35" target="_blank" class="link-warning">SN 35</a> <span class="text-muted small">Six Sense Bases, full chapter</span></li>
            </ul>
          </div>
          <div class="quick-links-column">
            <p>Clarify 4-6-X Dhātu:</p>
            <ul>
              <li><a href="${queryBase}mn28" target="_blank" class="link-danger">MN 28</a> <span class="text-muted small">Elephant's Footprint Simile</span></li>
              <li><a href="${queryBase}mn115" target="_blank" class="link-danger">MN 115</a> <span class="text-muted small">Many Kinds of Elements</span></li>
              <li><a href="${queryBase}mn140" target="_blank" class="link-danger">MN 140</a> <span class="text-muted small">Analysis of the Elements</span></li>
              <li><a href="${queryBase}sn14" target="_blank" class="link-danger">SN 14</a> <span class="text-muted small">Elements, full chapter</span></li>
            </ul>
          </div>
          <div class="quick-links-column">
            <p>Dukkaṁ so abhinandati:</p>
            <ul>
              <li><a href="${queryBase}sn14.35" target="_blank" class="link-primary">SN 14.35</a> <span class="text-muted small">Delighting in Elements</span></li>
              <li><a href="${queryBase}sn22.29" target="_blank" class="link-primary">SN 22.29</a> <span class="text-muted small">Delighting in Aggregates</span></li>
              <li><a href="${queryBase}sn35.19" target="_blank" class="link-primary">SN 35.19</a> <span class="text-muted small">Delighting in the Senses</span></li>
              <li><a href="${queryBase}sn35.20" target="_blank" class="link-primary">SN 35.20</a> <span class="text-muted small">Delighting in the Senses (2)</span></li>
            </ul>
          </div>
          <div class="quick-links-column">
            <p>Extra</p>
            <ul>
              <li><a href="${queryBase}an3.70" target="_blank" class="link-danger">AN 3.70</a> <span class="text-muted small">The Uposatha Observance</span></li>
              <li><a href="${queryBase}an6.63" target="_blank" class="link-danger">AN 6.63</a> <span class="text-muted small">Penetrative Teaching</span></li>
              <li><a href="${queryBase}an8.9" target="_blank" class="link-danger">AN 8.9</a> <span class="text-muted small">To Nanda</span></li>
              <li><a href="${queryBase}an10.46" target="_blank" class="link-primary">AN 10.46</a> <span class="text-muted small">To the Sakyans</span></li>
              <li><a href="${queryBase}an10.176" target="_blank" class="link-primary">AN 10.176</a> <span class="text-muted small">Ten Courses of Action</span></li>
              <li><a href="${queryBase}snp3.2" target="_blank" class="link-primary">Snp 3.2</a> <span class="text-muted small">The Striving</span></li>
              <li><a href="${queryBase}iti61" target="_blank" class="link-primary">Iti 61</a> <span class="text-muted small">The Eye</span></li>
              <li><a href="${queryBase}an4.199" target="_blank" class="link-primary">an4.199</a> <span class="text-muted small">Craving</span></li>
            </ul>
          </div>
        </div>
      </div>

      <div id="tab-memo" class="quick-tab-content">
        <iframe data-src="${memoPath}" class="quick-iframe"></iframe>
      </div>

      <div id="tab-dpd" class="quick-tab-content">
        <iframe data-src="${dpdUrl}" class="quick-iframe"></iframe>
      </div>

    </div>
  `;

  document.body.appendChild(quickOverlay);
  document.body.appendChild(quickModal);

  // Обработка клика правой кнопкой / долгого нажатия по кнопке поиска
  const quickSearchBtn = quickModal.querySelector('#quickSearchBtn');
  const quickSearchInput = quickModal.querySelector('#quickSearchInput');
  const quickSearchForm = quickModal.querySelector('#quickSearchForm');

  quickSearchBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault(); // Отключаем контекстное меню браузера
      const query = quickSearchInput.value.trim();
      if (query) {
          const action = quickSearchForm.getAttribute('action');
          const url = `${action}?q=${encodeURIComponent(query)}`;
          window.open(url, '_blank');
      }
  });

  // Обработка вкладок
  const tabBtns = quickModal.querySelectorAll('.quick-tab-btn');
  const tabContents = quickModal.querySelectorAll('.quick-tab-content');
  const mainTrashIcon = document.getElementById('main-trash-icon');
  const mainOpenWindowIcon = document.getElementById('main-open-window-icon');
  const btnSyncNow = document.getElementById('btn-sync-now');

  // Shared by the tab row below AND the gear button (#quickSettingsBtn) further down — the gear
  // switches to "tab-settings" the exact same way a real tab button would, it just isn't one of
  // the buttons in .quick-tabs itself (no room there, same reasoning .quick-actions-right's icons
  // already sit outside that row).
  function activateTab(targetTab) {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      const activeBtn = quickModal.querySelector(`.quick-tab-btn[data-tab="${targetTab}"]`);
      if (activeBtn) activeBtn.classList.add('active');

      const targetContent = quickModal.querySelector(`#${targetTab}`);
      targetContent.classList.add('active');

      const iframe = targetContent.querySelector('iframe');
      if (iframe && !iframe.getAttribute('src')) {
          iframe.setAttribute('src', iframe.getAttribute('data-src'));
      }

      if (mainTrashIcon) mainTrashIcon.style.display = targetTab === 'tab-fav' ? 'block' : 'none';
      if (btnSyncNow) btnSyncNow.style.display = targetTab === 'tab-fav' ? 'block' : 'none';
      if (mainOpenWindowIcon) {
          mainOpenWindowIcon.style.display = (targetTab === 'tab-memo' || targetTab === 'tab-dpd') ? 'block' : 'none';
      }
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  // Owner: "добавить быстрые настройки в быстрое меню, чтобы было похоже на главный инпут" —
  // this modal's own search field only had the magnifier button, unlike the main site input
  // (search/index.html) which also has a gear/quick-settings button next to it. Owner follow-up
  // (after a first attempt that embedded the settings as a fake tab inside this modal): it must
  // be the SAME real dropdown as everywhere else, just anchored to THIS gear — not a copy of it
  // embedded in the modal. window.dgOpenQuickSettings(anchorBtn) is home.js's own openQuick(),
  // exposed to accept an external anchor for exactly this — it builds/positions/shows the real
  // #dg-quick sheet (same buildQuickBody() content, same code, nothing duplicated here) and
  // raises its z-index above this modal's own (see home.css .dg-above-quick-modal / openQuick).
  // Not exposed at all (home.js never loaded, e.g. the standalone legacy reader-template.html)
  // → hide the gear entirely rather than a dead/no-op button.
  const quickSettingsBtn = quickModal.querySelector('#quickSettingsBtn');
  if (quickSettingsBtn) {
      if (typeof window.dgOpenQuickSettings === 'function') {
          quickSettingsBtn.addEventListener('click', () => {
              window.dgOpenQuickSettings(quickSettingsBtn);
          });
      } else {
          quickSettingsBtn.style.display = 'none';
      }
  }

    if (btnSyncNow) {
      // Существующий обработчик левого клика
      btnSyncNow.addEventListener('click', async (e) => { 
          e.preventDefault();
          
          const isLoggedWithPhrase = !!localStorage.getItem('syncPhraseId');
          const isLoggedWithGoogle = typeof auth !== 'undefined' && auth && auth.currentUser;
          
          if (isLoggedWithPhrase || isLoggedWithGoogle) {
              btnSyncNow.style.opacity = '0.5';
              
              if (typeof forceSyncNow === 'function') {
                  await forceSyncNow(); 
              }
              
              if (typeof window.refreshQuickModalData === 'function') {
                  window.refreshQuickModalData();
              }
              
              btnSyncNow.style.opacity = '1';
          } else if (window.dgOfflineReady) {
              dgOfflineLoginWithPhrase();
          } else {
              window.location.href = window.isRu ? '/ru/login' : '/login';
          }
      });

      // НОВОЕ: Обработчик правого клика и долгого нажатия на мобильных (contextmenu)
      btnSyncNow.addEventListener('contextmenu', (e) => {
          e.preventDefault(); // Отключаем стандартное контекстное меню браузера
          if (window.dgOfflineReady) dgOfflineLoginWithPhrase();
          else window.location.href = window.isRu ? '/ru/login' : '/login';
      });

      // НОВОЕ: Обработчик клика колесиком мыши (auxclick)
      btnSyncNow.addEventListener('auxclick', (e) => {
          if (e.button === 1) { // button 1 означает среднюю кнопку (колесико)
              e.preventDefault();
              if (window.dgOfflineReady) dgOfflineLoginWithPhrase();
              else window.location.href = window.isRu ? '/ru/login' : '/login';
          }
      });
  }

  const closeQuickModal = () => {
    if(quickModalIsOpen) toggleQuickModal();
  };

  quickOverlay.addEventListener("click", (e) => e.target === quickOverlay && closeQuickModal());
  quickModal.querySelector("#quickCloseModalBtn").addEventListener("click", closeQuickModal);

  if (typeof window.initPaliAutocomplete === 'function') {
      window.initPaliAutocomplete('#quickSearchInput');
  }

  window.refreshQuickModalData = function() {
    renderQuickLists(window.isRu, queryBase);
  };
  
  const favContainer = quickModal.querySelector('#quick-favorites-container');
  const histContainer = quickModal.querySelector('#quick-history-container');
  
  favContainer.addEventListener('click', (e) => {
      // --- ЛОГИКА УДАЛЕНИЯ ---
      if (e.target.classList.contains('remove-fav-btn')) {
          const slug = e.target.dataset.slug;
          let favData = JSON.parse(localStorage.getItem('dg_favorites')) || [];
          const itemIndex = favData.findIndex(f => f.slug === slug);
          
          if (itemIndex !== -1) {
              const currentTitle = favData[itemIndex].title || favData[itemIndex].slug;
              const confirmMsg = window.isRu 
                  ? `Удалить "${currentTitle}" из избранного?` 
                  : `Delete bookmark "${currentTitle}"?`;
              
              if (confirm(confirmMsg)) {
                  const deletedItem = favData[itemIndex];
                  favData.splice(itemIndex, 1); // Удаляем элемент из массива
                  localStorage.setItem('dg_favorites', JSON.stringify(favData));
                  
                  // Отправляем команду на удаление в облако (isDeleted = true)
                  if (typeof syncFavoriteItemToCloud === 'function') {
                      syncFavoriteItemToCloud(deletedItem, true);
                  }
                  
                  window.refreshQuickModalData(); // Обновляем UI
              }
          }
      }

      // --- ЛОГИКА ПЕРЕИМЕНОВАНИЯ ---
      if (e.target.classList.contains('rename-fav-btn')) {
          const slug = e.target.dataset.slug;
          let favData = JSON.parse(localStorage.getItem('dg_favorites')) || [];
          const itemIndex = favData.findIndex(f => f.slug === slug);
          
          if (itemIndex !== -1) {
              const currentTitle = favData[itemIndex].title || favData[itemIndex].slug;
              const newTitle = prompt(window.isRu ? "Введите новое название закладки:" : "Enter new bookmark name:", currentTitle);
              
              if (newTitle !== null && newTitle.trim() !== "") {
                  favData[itemIndex].title = newTitle.trim();
                  favData[itemIndex].hasCustomTitle = true; // <-- СТАВИМ ЗАЩИТНЫЙ ФЛАГ
                  localStorage.setItem('dg_favorites', JSON.stringify(favData));
                  
                  if (typeof syncFavoriteItemToCloud === 'function') {
                      syncFavoriteItemToCloud(favData[itemIndex], false);
                  }
                  
                  window.refreshQuickModalData();
              }
          }
      }
  });

  histContainer.addEventListener('click', (e) => {
      // 1. Избранное из истории
      if (e.target.classList.contains('toggle-fav-btn-hist')) {
          const slug = e.target.dataset.slug;
          const displayKey = e.target.dataset.display;
          const url = e.target.dataset.url;
          let currentFavs = JSON.parse(localStorage.getItem('dg_favorites')) || [];
          const idx = currentFavs.findIndex(f => f.slug === slug);
          
          const parser = new URL(url, window.location.origin);
          const isSearchPage = parser.pathname === '/' || parser.pathname === '/ru/' || parser.pathname.endsWith('index.php');
          let finalTitle = displayKey;
          if (isSearchPage && !finalTitle.startsWith("")) finalTitle = finalTitle;
          
          const favObj = {
              slug: slug, id: slug, title: finalTitle, 
              path: parser.pathname, search: parser.search, timestamp: Date.now()
          };

          if (idx !== -1) {
             currentFavs.splice(idx, 1);
          } else {
             currentFavs.unshift(favObj);
          }
          localStorage.setItem('dg_favorites', JSON.stringify(currentFavs));
          
          // --- ИЗМЕНЕНО: Атомарная отправка ---
          if (typeof syncFavoriteItemToCloud === 'function') {
              syncFavoriteItemToCloud(favObj, idx !== -1);
          }
          
          window.refreshQuickModalData();
      }

      // 2. Скрытое удаление из истории
      if (e.target.classList.contains('hidden-delete-hist')) {
          const slug = e.target.dataset.slug;
          
          if (confirm(window.isRu ? "Стереть этот запрос из истории?" : "Delete this search from history?")) {
              
              let deletedHist = JSON.parse(localStorage.getItem('dg_deleted_history')) || [];
              deletedHist.push({ slug: slug, deletedAt: Date.now() });
              if (deletedHist.length > 300) deletedHist.shift(); 
              localStorage.setItem('dg_deleted_history', JSON.stringify(deletedHist));

              let histData = JSON.parse(localStorage.getItem('localSearchHistory')) || [];
              histData = histData.filter(h => {
                  let currentSlug = h[0];
                  try { 
                      const p = new URL(h[1], window.location.origin); 
                      if (p.searchParams.has('q')) currentSlug = p.searchParams.get('q'); 
                  } catch(err) {}
                  return currentSlug !== slug;
              });

              localStorage.setItem('localSearchHistory', JSON.stringify(histData));
              
              // --- ИЗМЕНЕНО: Атомарная отправка ---
              if (typeof syncHistoryItemToCloud === 'function') {
                  syncHistoryItemToCloud(slug, null, null, true);
              }
              
              window.refreshQuickModalData();
          }
      }
  });

  if (mainTrashIcon) {
      mainTrashIcon.addEventListener('click', () => {
          if (confirm(window.isRu ? "Очистить ВСЮ историю поиска, включая в Облаке?" : "Clear ALL search history, including Cloud?")) {
              localStorage.setItem('localSearchHistory', JSON.stringify([]));
              
              // --- ИЗМЕНЕНО: Отправка команды на очистку коллекции ---
              if (typeof clearCloudHistory === 'function') clearCloudHistory();
              
              window.refreshQuickModalData();
          }
      });
  }

  if (mainOpenWindowIcon) {
      mainOpenWindowIcon.addEventListener('click', () => {
          const activeTab = quickModal.querySelector('.quick-tab-content.active');
          if (!activeTab) return;

          const iframe = activeTab.querySelector('iframe');
          if (!iframe) return;

          const urlToOpen = iframe.getAttribute('src') || iframe.getAttribute('data-src');
          if (urlToOpen) window.open(urlToOpen, '_blank');
      });
  }

  setupQuickModalHeaders();
}


function renderQuickLists(isRu, queryBase) {
    const favData = JSON.parse(localStorage.getItem('dg_favorites')) || [];
    const histData = JSON.parse(localStorage.getItem('localSearchHistory')) || [];
    
    const favContainer = document.querySelector('#quick-favorites-container');
    const histContainer = document.querySelector('#quick-history-container');
    const favHeader = document.querySelector('#fav-header');
    const histHeader = document.querySelector('#hist-header');
    
    // Сортировка Избранного берется из памяти, а Истории — просто из временной переменной
    let favAlphaSort = localStorage.getItem('dg_favAlphaSort') === 'true';
    let histAlphaSort = window.histAlphaSort || false; 
    let favCollapsed = localStorage.getItem('dg_favCollapsed') === 'true';
    let histCollapsed = localStorage.getItem('dg_histCollapsed') === 'true';

    // Рендер Избранного
    if (favData.length === 0) {
      favContainer.innerHTML = `<p class="quick-empty-msg">${window.isRu ? "Избранного пока нет." : "No favorites yet."}</p>`;
      favHeader.style.display = 'none';
      favContainer.style.display = 'block';
    } else {
      favHeader.style.display = 'flex';
      favContainer.style.display = favCollapsed ? 'none' : 'block';
      favHeader.querySelector('.header-title').classList.toggle('collapsed', favCollapsed);

      let dataToRender = [...favData];
      if (favAlphaSort) dataToRender.sort((a, b) => (a.title || a.slug || '').localeCompare(b.title || b.slug || '', undefined, { numeric: true }));


      let favHtml = '<ul class="compact-list">';
      dataToRender.forEach(fav => {
        let url = (fav.path && fav.search) ? `${fav.path}${fav.search}` : `${queryBase}${fav.slug}`;
        if (fav.id && fav.id !== fav.slug) url += `#${fav.id}`;
        const dateStr = fav.timestamp ? new Date(fav.timestamp).toLocaleDateString() : "";
        
        // Добавили кнопку rename-fav-btn (карандаш) перед кнопкой удаления
        favHtml += `<li><span class="fav-star-icon">★</span><a href="${url}">${fav.title || fav.slug}</a>
        <span class="item-date">${dateStr}</span>
        <span class="action-btn rename-fav-btn" data-slug="${fav.slug}" title="${window.isRu ? 'Переименовать' : 'Rename'}">✎</span>
        <span class="action-btn remove-fav-btn" data-slug="${fav.slug}">×</span></li>`;
      });
      favHtml += '</ul>';
      favContainer.innerHTML = favHtml;
      document.querySelector('.sort-icon-fav').textContent = favAlphaSort ? 'A-Z' : '⇅';
    }

    // Рендер Истории
    if (histData.length === 0) {
      histContainer.innerHTML = `<p class="quick-empty-msg">${window.isRu ? "История пуста." : "History is empty."}</p>`;
      histHeader.style.display = 'none';
      histContainer.style.display = 'block';
    } else {
      histHeader.style.display = 'flex';
      histContainer.style.display = histCollapsed ? 'none' : 'block';
      histHeader.querySelector('.header-title').classList.toggle('collapsed', histCollapsed);

      let dataToRender = [...histData];
      if (histAlphaSort) dataToRender.sort((a, b) => (a[0] || '').localeCompare(b[0] || '', undefined, { numeric: true }));

      let histHtml = '<ul class="compact-list">';
      dataToRender.slice(0, 84).forEach(h => {
        const dateStr = h[2] ? new Date(h[2]).toLocaleDateString() : "";
        let realSlug = h[0];
        try { const p = new URL(h[1], window.location.origin); if(p.searchParams.has('q')) realSlug = p.searchParams.get('q'); } catch(e){}
        const isFav = favData.some(f => f.slug === realSlug);
        
// Добавили hidden-delete-hist и data-slug
histHtml += `<li><span class="hist-icon"><img src="/assets/svg/clock-rotate-left.svg" width="14" height="14"></span>
<a href="${h[1]}">${h[0]}</a><span class="item-date hidden-delete-hist" data-slug="${realSlug}">${dateStr}</span>
<span class="action-btn toggle-fav-btn-hist" data-slug="${realSlug}" data-display="${h[0]}" data-url="${h[1]}">${isFav ? "★" : "☆"}</span></li>`;

      });
      histHtml += '</ul>';
      histContainer.innerHTML = histHtml;
      document.querySelector('.sort-icon-hist').textContent = histAlphaSort ? 'A-Z' : '⇅';
    }
}

function setupQuickModalHeaders() {
  document.querySelector('#fav-header').addEventListener('click', (e) => {
      if (e.target.classList.contains('sort-trigger')) { 
          // Избранное: сохраняем сортировку в память навсегда
          localStorage.setItem('dg_favAlphaSort', localStorage.getItem('dg_favAlphaSort') !== 'true'); 
          window.refreshQuickModalData(); 
      } 
      else if (e.target.closest('.header-title')) { 
          // Свернутость сохраняем
          localStorage.setItem('dg_favCollapsed', localStorage.getItem('dg_favCollapsed') !== 'true'); 
          window.refreshQuickModalData(); 
      }
  });

  document.querySelector('#hist-header').addEventListener('click', (e) => {
      if (e.target.classList.contains('sort-trigger')) { 
          // История: сохраняем сортировку только во временную переменную
          window.histAlphaSort = !window.histAlphaSort; 
          window.refreshQuickModalData(); 
      } 
      else if (e.target.closest('.header-title')) { 
          // Свернутость сохраняем
          localStorage.setItem('dg_histCollapsed', localStorage.getItem('dg_histCollapsed') !== 'true'); 
          window.refreshQuickModalData(); 
      }
  });
}


// Optional tabKey ('tab-fav'|'tab-4as'|'tab-memo'|'tab-dpd') deep-links straight to a tab —
// used by dg-docs (Быстрое окно help page) and available from anywhere: window.toggleQuickModal('tab-dpd').
// Already-open + tabKey just switches tab (doesn't close) — closing on a deep link would defeat
// the point of the link. No tabKey keeps the original open/close toggle, unchanged.
window.toggleQuickModal = function(tabKey) {
  if (!window.isQuickModalRendered) {
    buildQuickModalDOM();
    window.isQuickModalRendered = true;
  }

  if (tabKey && window.quickModalIsOpen) {
    var tabBtn = quickModal.querySelector('.quick-tab-btn[data-tab="' + tabKey + '"]');
    if (tabBtn) tabBtn.click();
    return;
  }

  if (window.quickModalIsOpen) {
    window.quickOverlay.classList.remove("open");
    window.quickModal.classList.remove("open");
    window.quickModalIsOpen = false;
  } else {
    // 1. Показываем локальные данные мгновенно, чтобы не было задержки
    window.refreshQuickModalData();
    
    window.quickOverlay.classList.add("open");
    window.quickModal.classList.add("open");
    window.quickModalIsOpen = true;

    if (tabKey) {
        var openTabBtn = quickModal.querySelector('.quick-tab-btn[data-tab="' + tabKey + '"]');
        if (openTabBtn) openTabBtn.click();
    }

    // 2. Фокус на инпут для быстрого поиска
    setTimeout(() => {
        const searchInput = document.getElementById('quickSearchInput');
        if (searchInput) searchInput.focus();
    }, 100);

    // 3. Фоновая синхронизация
    if (typeof forceSyncNow === 'function') {
        const syncImg = document.querySelector('#btn-sync-now img');
        
        // Включаем вращение своей независимой CSS анимацией
        if (syncImg) syncImg.classList.add('custom-spin');

        // Вызываем синхронизацию (без await, чтобы не блокировать окно)
        forceSyncNow().then(() => {
            if (window.quickModalIsOpen && typeof window.refreshQuickModalData === 'function') {
                window.refreshQuickModalData();
            }
            // Выключаем вращение, когда загрузка завершена
            if (syncImg) syncImg.classList.remove('custom-spin');
        });
    }

  }
};



// === КРОСС-ВКЛАДОЧНАЯ СИНХРОНИЗАЦИЯ ===
// Слушаем изменения localStorage из соседних вкладок браузера
window.addEventListener('storage', (e) => {
    if ((e.key === 'dg_favorites' || e.key === 'localSearchHistory') && window.quickModalIsOpen) {
        if (typeof window.refreshQuickModalData === 'function') {
            window.refreshQuickModalData();
        }
    }
});
