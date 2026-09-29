// === Файл: /assets/js/quickModal.js ===
// OVERRIDE COPY of legacy /assets/js/quickModal.js (dg repo) — see CLAUDE.md override pattern.
// Diff: removed the gear+hidden-select "Dictionary Selection" icon from the header actions row
// (quick-dict-wrapper/#quick-dict-select) — dg-node now has a proper dictionary-mode dropdown in
// Quick settings (search/js/home.js, dictModePicker/DICT_MODE_GROUPS), this one duplicated it and
// read as "yet another gear" next to the real settings gear and the quick-settings icon (owner:
// too many gears, confusing).

// The SPA serves Russian at /mn1?lang=ru (the /ru/ prefix redirects there), so the path alone said
// "English" and the quick window's own labels stayed English on the Russian site. Same saved-language
// fallback as search/index.html's early isRu.
window.isRu = window.location.pathname.includes('/r/') ||
                     window.location.pathname.includes('/ru/') ||
                     window.location.pathname.includes('/ml/') ||
                     window.location.pathname.includes('/mt/') ||
                     localStorage.getItem('dhammaLanguage') === 'ru';
// The dictionary (ddg-ui) borrows this window cross-origin, so "/assets/..." there resolved
// against ITS origin: the icons and the history link 404'd (issue #4). Everything that belongs to
// the site is addressed through this base — empty on the site itself and under dhamma.gift/dict
// (same origin), the site's real address on the dict.dhamma.gift subdomain. A host page can set
// window.DG_SITE_BASE itself before loading this file.
window.DG_SITE_BASE = window.DG_SITE_BASE ||
    (location.hostname === 'dict.dhamma.gift' ? 'https://dhamma.gift' : '');

// Делаем переменные глобальными для доступа из других скриптов
window.isQuickModalRendered = false;
window.quickModalIsOpen = false;
window.quickOverlay = null;
window.quickModal = null;

// The cloud button opens the sign-in page, on the site and in the Android app alike (owner): Google and the
// passphrase live together there. The file path, not the folder: the app has no directory resolution and
// would open its home page for /login/. The site serves both.
function dgOpenLoginPage() {
    window.location.href = window.isRu ? '/ru/login/index.html' : '/login/index.html';
}

// 4 Ariyasaccāni links: block titles as in prod, texts by Pali name only (ТЗ §7).
const AS4_BLOCKS = [
  ['1st priority', [['sn56.11', 'Dhammacakkappavattanasutta'], ['dn22', 'Mahāsatipaṭṭhānasutta'], ['sn12.2', 'Vibhaṅgasutta']]],
  ['Clarify 5 khandha', [['sn22.56', 'Upādānaparipavattasutta'], ['sn22.79', 'Khajjanīyasutta'], ['sn22.85', 'Yamakasutta'], ['sn22', 'Khandhasaṁyutta']]],
  ['Clarify 6 ajjhattāyatana', [['sn35.228', 'Paṭhamasamuddasutta'], ['sn35.229', 'Dutiyasamuddasutta'], ['sn35.236', 'Paṭhamahatthapādopamasutta'], ['sn35.238', 'Āsīvisopamasutta'], ['sn35', 'Saḷāyatanasaṁyutta']]],
  ['Clarify 4-6-X Dhātu', [['mn28', 'Mahāhatthipadopamasutta'], ['mn115', 'Bahudhātukasutta'], ['mn140', 'Dhātuvibhaṅgasutta'], ['sn14', 'Dhātusaṁyutta']]],
  ['Dukkhaṁ so abhinandati', [['sn14.35', 'Abhinandasutta'], ['sn22.29', 'Abhinandanasutta'], ['sn35.19', 'Paṭhamābhinandasutta'], ['sn35.20', 'Dutiyābhinandasutta']]],
  ['Extra', [['an3.70', 'Uposathasutta'], ['an6.63', 'Nibbedhikasutta'], ['an8.9', 'Nandasutta'], ['an10.46', 'Sakkasutta'], ['an10.176', 'Cundasutta'], ['snp3.2', 'Padhānasutta'], ['iti61', 'Cakkhusutta'], ['an4.199', 'Taṇhāsutta']]]
];

function buildQuickModalDOM() {
  const currentPath = window.location.pathname;
  let currentUrl = window.location.href;
  let urlWithoutParams = currentUrl.split('?')[0];
  let queryBase = "/?q="; // the SPA searches or opens the text itself; legacy /read/ and /r/ are gone
  
  const formAction = currentPath.match(/\/(ru|r)\//) ? '/ru/' : '/';

  const isDark = document.body.classList.contains("dark");
  
  // Tab icons: own inline SVG set (stroke = currentColor), same weight as the site's toolbar glyphs.
  const QI = (d) => `<svg class="quick-tab-ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  // "☆ + История" / "☆ & History": the tab holds favorites AND history (owner).
  const tabFavText = QI('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>') + '<span class="quick-tab-plus">' + (window.isRu ? '+' : '&amp;') + '</span>' + (window.isRu ? "История" : "History");
  const tabSubsText = QI('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>') + (window.isRu ? "Подписки" : "Subscriptions") + '<span class="quick-tab-count" id="quick-subs-count" hidden></span>';
  const favTitleText = window.isRu ? "Избранное" : "Favorites";
  const tabLinksText = QI('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v6.5M12 14.5V21M3 12h6.5M14.5 12H21"/>') + "4AS";
  const tabMemoText = QI('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>') + "Memo";
  // The file, not the folder: the app has no directory resolution and answered /memo/ with its home
  // page — the Memo tab ran a search for "memo" (tablet test). The site serves both the same way.
  const memoPath = window.isRu ? "/ru/memo/index.html" : "/memo/index.html";
  const tabDpdText = QI('<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h11"/><path d="M9 8h5"/>') + (window.isRu ? "Словарь" : "Dict");
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
          <input type="search" name="q" id="quickSearchInput" class="quick-search-input" placeholder="${window.isRu ? 'Kāyagatā или sn56.11' : 'e.g. Kāyagatā or sn56.11'}" autocomplete="off">
          <button type="button" id="quickSearchClear" class="quick-search-clear" aria-label="${window.isRu ? 'Очистить' : 'Clear'}" hidden>×</button>
          <button type="button" id="quickSettingsBtn" class="dg-qs-btn" hidden aria-expanded="false" aria-label="${window.isRu ? 'Быстрые настройки' : 'Quick settings'}" title="${window.isRu ? 'Быстрые настройки' : 'Quick settings'}"></button>
          <button type="submit" id="quickSearchBtn" class="quick-search-btn">
              <svg style="transform: scaleX(-1)" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </button>
      </form>

      <div class="quick-tabs-wrapper">
        <div class="quick-tabs">
          <button class="quick-tab-btn active" data-tab="tab-fav">${tabFavText}</button>
          <button class="quick-tab-btn" data-tab="tab-subs">${tabSubsText}</button>
          <button class="quick-tab-btn" data-tab="tab-4as">${tabLinksText}</button>
          <button class="quick-tab-btn" data-tab="tab-memo">${tabMemoText}</button>
          <button class="quick-tab-btn" data-tab="tab-dpd">${tabDpdText}</button>
        </div>
        
        <div class="quick-actions-right">
            <span class="action-btn" id="btn-sync-now" title="${window.isRu ? 'Синхронизировать' : 'Sync Now'}">
               <img src="${window.DG_SITE_BASE}/assets/svg/rotate-solid-full.svg" width="20" height="20" alt="Login & Sync">
            </span>

            <span class="clear-all-btn action-btn" id="main-trash-icon" title="${titleClearAll}">
               <img src="${window.DG_SITE_BASE}/assets/svg/trash-can-regular-full.svg" width="25" height="25" alt="Reset">
            </span>
            <span class="action-btn cursor-pointer" id="main-open-window-icon" title="${window.isRu ? 'Открыть в новом окне' : 'Open in new window'}" style="display: none;">
               <img src="${window.DG_SITE_BASE}/assets/svg/open-link.svg" width="20" height="20" alt="Open">
            </span>
        </div>
      </div>

  
      <div id="dgQuickStorageNote" class="quick-storage-note" hidden></div>
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
        
        <!-- "Common history" link removed — that page no longer exists (owner). -->
        <div class="quick-all-history-wrapper">
            <a href="${window.DG_SITE_BASE}/assets/common/history.html${window.isRu ? '?lang=ru' : ''}" class="quick-all-history-link">
                ${window.isRu ? "Вся история →" : "All history →"}
            </a>
        </div>

      </div>

      <div id="tab-subs" class="quick-tab-content"><div id="quick-subs"></div></div>

      <div id="tab-4as" class="quick-tab-content">
        <div class="quick-4as">${AS4_BLOCKS.map((b, n) => `
          <div class="quick-4as-card${n === 0 ? ' quick-4as-first' : ''}">
            <p><span class="quick-4as-n">${n + 1}</span>${b[0]}</p>
            <ul>${b[1].map(l => `<li><a href="${queryBase}${l[0]}" target="_blank">${l[0].replace(/^([a-z]+)/, m => m === 'snp' ? 'Snp ' : m === 'iti' ? 'Iti ' : m.toUpperCase() + ' ')}</a><span>${l[1]}</span></li>`).join('')}</ul>
          </div>`).join('')}
        </div>
      </div>

      <div id="quick-subform" class="quick-subform" hidden></div>

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

  // Quick settings: the same gear and the same anchored dropdown as the main search field
  // (home.js openQuick) — owner: identical to the main input, not a tab inside this window (the
  // earlier tab version was reverted, 7a3ffc4). Pages without home.js keep the window without it.
  const quickSettingsBtn = quickModal.querySelector('#quickSettingsBtn');
  const hostQuickSettings = window.dgQuickSettings;
  if (window.DgHome && typeof window.DgHome.openQuick === 'function') {
      quickSettingsBtn.innerHTML = window.DgHome.quickButtonHtml();
      quickSettingsBtn.hidden = false;
      quickSettingsBtn.addEventListener('click', () => window.DgHome.openQuick(quickSettingsBtn));
  } else if (hostQuickSettings && typeof hostQuickSettings.open === 'function') {
      // No home.js here (the dictionary): the host page hands us its icon and its own settings
      // panel — theme, font size and language live there, and the window stays one window
      // (owner, ddg-ui #5: the site's quick window had settings, the dictionary's did not).
      quickSettingsBtn.innerHTML = hostQuickSettings.icon || '';
      quickSettingsBtn.hidden = false;
      quickSettingsBtn.addEventListener('click', () => hostQuickSettings.open(quickSettingsBtn));
  }

  // On the dictionary subdomain the browser gives this window a storage of its own (cross-origin),
  // so the site's history and favorites are simply not here — say so instead of showing an empty
  // list that reads as "everything is gone" (issue #4). Under dhamma.gift/dict the storage IS the
  // site's, and nothing is shown.
  const storageNote = quickModal.querySelector('#dgQuickStorageNote');
  if (storageNote && window.DG_SITE_BASE) {
      storageNote.textContent = window.isRu
          ? 'История и избранное — с dhamma.gift; на этом адресе у словаря своё хранилище.'
          : 'History and favorites belong to dhamma.gift; this dictionary address keeps its own.';
      storageNote.hidden = false;
  }

  quickSearchBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault(); // Отключаем контекстное меню браузера
      const query = quickSearchInput.value.trim();
      if (query) {
          const action = quickSearchForm.getAttribute('action');
          const url = `${action}?q=${encodeURIComponent(query)}`;
          window.open(url, '_blank');
      }
  });

  // The dictionary borrows this window without settings.js — no subscription data there.
  if (typeof window.subUpsert !== 'function') quickModal.querySelector('.quick-tab-btn[data-tab="tab-subs"]').hidden = true;

  const quickSearchClear = quickModal.querySelector('#quickSearchClear');
  const syncClear = () => { quickSearchClear.hidden = !quickSearchInput.value; };
  quickSearchInput.addEventListener('input', syncClear);
  quickSearchClear.addEventListener('click', () => { quickSearchInput.value = ''; syncClear(); quickSearchInput.focus(); });

  // Обработка вкладок
  const tabBtns = quickModal.querySelectorAll('.quick-tab-btn');
  const tabContents = quickModal.querySelectorAll('.quick-tab-content');
  const mainTrashIcon = document.getElementById('main-trash-icon');
  const mainOpenWindowIcon = document.getElementById('main-open-window-icon'); 
  const btnSyncNow = document.getElementById('btn-sync-now');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabList = Array.from(tabBtns);
      const prev = tabList.findIndex(b => b.classList.contains('active'));
      const next = tabList.indexOf(btn);
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active', 'quick-from-left', 'quick-from-right'));
      btn.classList.add('active');
      
      const targetTab = btn.dataset.tab;
      const targetContent = quickModal.querySelector(`#${targetTab}`);
      targetContent.classList.add('active');
      // Slide in from the side the new tab sits on (ТЗ §7).
      if (prev !== -1 && prev !== next) targetContent.classList.add(next > prev ? 'quick-from-right' : 'quick-from-left');
      if (targetTab === 'tab-subs') renderQuickSubs();
      
      const iframe = targetContent.querySelector('iframe');
      if (iframe && !iframe.getAttribute('src')) {
          iframe.setAttribute('src', iframe.getAttribute('data-src'));
      }

      if (mainTrashIcon) mainTrashIcon.style.display = targetTab === 'tab-fav' ? 'block' : 'none';
      if (btnSyncNow) btnSyncNow.style.display = targetTab === 'tab-fav' ? 'block' : 'none';
      if (mainOpenWindowIcon) {
          mainOpenWindowIcon.style.display = (targetTab === 'tab-memo' || targetTab === 'tab-dpd') ? 'block' : 'none';
      }
    });
  });

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
          } else {
              dgOpenLoginPage();
          }
      });

      // НОВОЕ: Обработчик правого клика и долгого нажатия на мобильных (contextmenu)
      btnSyncNow.addEventListener('contextmenu', (e) => {
          e.preventDefault(); // Отключаем стандартное контекстное меню браузера
          dgOpenLoginPage();
      });

      // НОВОЕ: Обработчик клика колесиком мыши (auxclick)
      btnSyncNow.addEventListener('auxclick', (e) => {
          if (e.button === 1) { // button 1 означает среднюю кнопку (колесико)
              e.preventDefault();
              dgOpenLoginPage();
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
    renderQuickSubs();
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

      const bell = e.target.closest('.fav-bell-btn');
      if (bell) {
          const q = bell.dataset.slug.toLowerCase();
          const sub = window.subGetAll().find(x => x.type === 'search' && (x.query || '').toLowerCase() === q);
          window.subsOpen(sub ? { id: sub.id } : { q: bell.dataset.slug });
          return;
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
        // Добавили кнопку rename-fav-btn (карандаш) перед кнопкой удаления
        // ТЗ §2: bell in the row — not subscribed: subscribe form for this query; subscribed: its settings.
        const favSub = typeof window.subGetAll === 'function' ? window.subGetAll().find(x => x.type === 'search' && (x.query || '').toLowerCase() === String(fav.slug).toLowerCase()) : null;
        const bellBtn = typeof window.subUpsert === 'function'
          ? `<span class="action-btn fav-bell-btn${favSub ? ' on' : ''}" data-slug="${fav.slug}" title="${favSub ? QS_T('Вы подписаны — настроить', 'Subscribed — settings') : QS_T('Подписаться', 'Subscribe')}">${QS_ICON.bell}</span>` : '';
        favHtml += `<li><span class="fav-star-icon">★</span><a href="${url}">${fav.title || fav.slug}</a>
        ${bellBtn}<span class="action-btn rename-fav-btn" data-slug="${fav.slug}" title="${window.isRu ? 'Переименовать' : 'Rename'}">✎</span>
        <span class="action-btn remove-fav-btn" data-slug="${fav.slug}">×</span></li>`;
      });
      favHtml += '</ul>';
      favContainer.innerHTML = favHtml;
      document.querySelector('.sort-icon-fav').textContent = favAlphaSort ? 'A-Z' : (window.isRu ? 'Новые' : 'Newest');
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
histHtml += `<li><span class="hist-icon"><img src="${window.DG_SITE_BASE}/assets/svg/clock-rotate-left.svg" width="14" height="14"></span>
<a href="${h[1]}">${h[0]}</a><span class="item-date hidden-delete-hist" data-slug="${realSlug}">${dateStr}</span>
<span class="action-btn toggle-fav-btn-hist" data-slug="${realSlug}" data-display="${h[0]}" data-url="${h[1]}">${isFav ? "★" : "☆"}</span></li>`;

      });
      histHtml += '</ul>';
      histContainer.innerHTML = histHtml;
      document.querySelector('.sort-icon-hist').textContent = histAlphaSort ? 'A-Z' : (window.isRu ? 'Новые' : 'Newest');
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
    // A focused field left inside the hidden modal keeps the on-screen keyboard up: on the tablet it
    // covered half of the text a history link had just opened.
    if (document.activeElement && window.quickModal.contains(document.activeElement)) document.activeElement.blur();
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

    // 2. Фокус на инпут для быстрого поиска — only with a real keyboard: on a touch screen focusing
    // pops the on-screen keyboard over the history the reader opened the modal to see.
    setTimeout(() => {
        const searchInput = document.getElementById('quickSearchInput');
        if (searchInput && !window.matchMedia('(hover: none) and (pointer: coarse)').matches) searchInput.focus();
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

// A link followed from inside the modal (a history row, a 4 Ariyasaccāni text) closes it. On a full page
// load that happened by itself; the SPA and the app open the text in place, and the reader stayed
// hidden under the still-open modal (tablet test). Capture phase: the app's native-bridge.js handles
// these links in its own document capture listener and stops propagation, so a bubble listener never ran.
document.addEventListener('click', (e) => {
    if (!window.quickModalIsOpen || !window.quickModal || !e.target.closest) return;
    const a = e.target.closest('a[href]');
    if (!a || !window.quickModal.contains(a)) return;
    const href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || /^javascript:/i.test(href)) return;
    setTimeout(() => { if (window.quickModalIsOpen) window.toggleQuickModal(); }, 0);
}, true);

// === Subscriptions tab + form (ТЗ §8) ===
// Data and cloud sync live in settings.js (subGetAll/subUpsert/subRemove/subSetPaused/
// subProgress). A subscription's texts are resolved once, when it is saved, into suttaIds:
//   search — the ids /search returns for the word (canon order, or most matches first);
//   place  — a TOC code (mn, sn12, thig, dn15…): that book/section's texts in canon order.
//            Such codes never reach a text search anyway — the search box opens the TOC for them;
//   random — the chosen scopes' texts, shuffled.
// ponytail: random keeps 365 shuffled ids (a year of daily texts); re-shuffle when it runs out.
const QS_T = (ru, en) => (window.isRu ? ru : en);
const QS_SCOPES = [
  { key: 'nikayas', ru: '4 Никаи', en: '4 Nikāyas', books: ['dn', 'mn', 'sn', 'an'] },
  // The same six Khuddaka books the quick settings search by default (home.js SCOPE_GROUPS).
  { key: 'kn6', ru: 'Кхуддака: 6 книг', en: 'Khuddaka: 6 books', books: ['iti', 'ud', 'snp', 'dhp', 'thag', 'thig'] },
  { key: 'knrest', ru: 'Кхуддака: остальное', en: 'Khuddaka: the rest', group: 'kn', except: ['iti', 'ud', 'snp', 'dhp', 'thag', 'thig'] },
  { key: 'vinaya', ru: 'Виная', en: 'Vinaya', category: 'vinaya' },
  // Hidden (owner): no chip, not in the name, but joins a random subscription when the global
  // search scope (settings, dhammaSearchScope) has Abhidhamma switched on.
  { key: 'abhi', ru: 'Абхидхамма', en: 'Abhidhamma', category: 'abhi', hidden: true }
];
function qsGlobalAbhi() { return (localStorage.getItem('dhammaSearchScope') || '').split(',').map(x => x.trim()).includes('abhi'); }
let qsTocCache = null;
function qsToc() {
  if (!qsTocCache) qsTocCache = fetch(`${window.DG_SITE_BASE}/api/toc`).then(r => r.json()).catch(() => ({ categories: [] }));
  return qsTocCache;
}
function qsBookLeaves(code) {
  return fetch(`${window.DG_SITE_BASE}/api/toc/book/${encodeURIComponent(code)}`)
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      if (!d) return null;
      const out = [];
      (function walk(n) {
        if (Array.isArray(n)) return n.forEach(walk);
        if (!n) return;
        if (n.type === 'leaf') out.push(n.id);
        (n.children || []).forEach(walk);
      })(d.tree);
      return out;
    })
    .catch(() => null);
}
function qsAllBooks(toc) {
  const books = [];
  (toc.categories || []).forEach(c => {
    (c.books || []).forEach(b => books.push({ code: b.code, label: b.label, category: c.category }));
    (c.groups || []).forEach(g => (g.books || []).forEach(b => books.push({ code: b.code, label: b.label, category: c.category, group: g.code })));
  });
  return books;
}
// 'sn12' -> { place: 'sn12', book: 'sn', label: 'Saṁyutta Nikāya' } when the leading letters are a TOC book.
function qsDetectPlace(text) {
  const m = /^([a-z]+(?:-[a-z]+)*)(\d[\d.\-]*)?$/i.exec((text || '').trim());
  if (!m) return Promise.resolve(null);
  const book = m[1].toLowerCase();
  return qsToc().then(toc => {
    const b = qsAllBooks(toc).find(x => x.code === book);
    return b ? { place: text.trim().toLowerCase(), book, label: (b.label && (window.isRu ? b.label.ru : b.label.en)) || book } : null;
  });
}
function qsPlaceIds(place, book) {
  return qsBookLeaves(book).then(ids => {
    if (!ids) return [];
    if (place === book) return ids;
    const exact = ids.indexOf(place);
    if (exact !== -1 && !ids.some(id => id.startsWith(place + '.'))) return ids.slice(exact); // a single text: from it on
    return ids.filter(id => id === place || id.startsWith(place + '.') || id.startsWith(place + '-'));
  });
}
function qsSearchIds(q, order) {
  return fetch(`${window.DG_SITE_BASE}/search?q=${encodeURIComponent(q)}`)
    .then(r => r.json())
    .then(json => {
      const count = {};
      Object.values(json.data || {}).forEach(r => { count[r.sutta_id] = r.count || 0; });
      const ids = window.subCanonSort(Object.keys(count));
      // Most matches first; equal counts stay in canon order (Array.prototype.sort is stable).
      return order === 'matches' ? ids.sort((a, b) => count[b] - count[a]) : ids;
    });
}
function qsRandomIds(scopeKeys) {
  return qsToc().then(toc => {
    const books = qsAllBooks(toc).filter(b => scopeKeys.some(k => {
      const sc = QS_SCOPES.find(x => x.key === k);
      return sc && ((sc.books && sc.books.includes(b.code)) || (sc.group && b.group === sc.group && !(sc.except || []).includes(b.code)) || (sc.category && b.category === sc.category));
    }));
    return Promise.all(books.map(b => qsBookLeaves(b.code))).then(lists => {
      const all = [].concat(...lists.filter(Boolean));
      for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
      return all.slice(0, 365);
    });
  });
}
// When the next uposatha reminder will actually fire, for the chosen times. By the suttas the
// observance runs from the evening (sunset / 18:00) to the next evening (owner): a 21:00 reminder
// lands on the eve's date, a 09:00 one on the next day's. Same engine as /uposatha-calendar, with
// the place and time zone set there (same localStorage); no place set: 18:00, browser time zone.
// Loaded on demand (~125 KB), only when "Uposatha" days are picked.
let qsUpoLib = null;
function qsNextUposatha(times) {
  const load = (src) => new Promise((ok, no) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = no; document.head.appendChild(el); });
  if (!qsUpoLib) qsUpoLib = (window.Astronomy ? Promise.resolve() : load(`${window.DG_SITE_BASE}/assets/js/vendor/astronomy.browser.min.js`))
    .then(() => (window.UposathaCore ? null : load(`${window.DG_SITE_BASE}/assets/js/uposatha-core.js`)));
  return qsUpoLib.then(() => {
    const C = window.UposathaCore;
    let loc = null;
    try { loc = JSON.parse(localStorage.getItem('dgUposathaLoc')) || null; } catch (e) {}
    const tz = localStorage.getItem('dgUposathaTz') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
    const now = Date.now();
    const rows = C.dataset(ymd(new Date(now - 86400000)), ymd(new Date(now + 40 * 86400000)), { tz, sutta: true, loc }).rows;
    const fmt = new Intl.DateTimeFormat(window.isRu ? 'ru-RU' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz });
    for (let i = 0; i < rows.length - 1; i++) {
      const r = rows[i];
      if (!r.uposatha) continue;
      const start = +new Date(r.at), end = +new Date(rows[i + 1].at);
      const fires = [];
      [0, 1].forEach(k => (times || ['09:00']).forEach(t => {
        const [hh, mm] = t.split(':').map(Number);
        const at = +C.zonedToUtc(r.y, r.m, r.d + k, hh, tz) + (mm || 0) * 60000;
        if (at >= start && at < end && at > now) fires.push(at);
      }));
      if (fires.length) return fires.sort((a, b) => a - b).map(t => fmt.format(new Date(t))).join('; ');
    }
    return null;
  }).catch(() => null);
}
function qsEsc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function qsName(sub) {
  if (sub.type === 'search') return sub.query || '';
  if (sub.type === 'place') return (sub.placeLabel ? sub.placeLabel + ' · ' : '') + QS_T('с ', 'from ') + (sub.place || '');
  return QS_T('Случайная', 'Random') + (sub.scope ? ' · ' + sub.scope.filter(k => k !== 'abhi').map(k => { const sc = QS_SCOPES.find(x => x.key === k); return sc ? QS_T(sc.ru, sc.en) : k; }).join(', ') : '');
}
function qsRemindText(sub) {
  const app = sub.remind && sub.remind.app;
  if (window.dgOfflineReady && !(app && app.when === 'schedule')) return QS_T('раз в день, при открытии приложения', 'once a day, when the app opens');
  if (app && app.when === 'schedule' && app.times && app.times.length) {
    const n = app.times.length;
    return (n === 1 ? QS_T('1 раз в день', 'once a day') : QS_T(n + ' раза в день', n + ' times a day')) + ', ' + app.times.join(QS_T(' и ', ' and '));
  }
  return sub.remind && sub.remind.web === 'schedule' ? QS_T('по расписанию', 'on schedule') : QS_T('раз в день, при открытии браузера', 'once a day, when the browser opens');
}
const QS_ICON = {
  // Sort icons for the order switch: A→Z with a down arrow; bars long→short (many → few).
  az: '<svg class="quick-seg-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4v16M3 17l3 3 3-3"/><path d="M13 10l2.5-6 2.5 6M13.8 8h3.4M13 14h5l-5 6h5"/></svg>',
  many: '<svg class="quick-seg-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4v16M3 17l3 3 3-3"/><path d="M12 6h9M12 11h6.5M12 16h4M12 21h1.5"/></svg>',
  bell: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.6 2.6L16 9.5"/></svg>'
};

function renderQuickSubs() {
  const host = document.getElementById('quick-subs');
  const count = document.getElementById('quick-subs-count');
  if (!host) return;
  const subs = typeof window.subGetAll === 'function' ? window.subGetAll() : [];
  if (count) { count.textContent = subs.length; count.hidden = !subs.length; }
  let html = `<h6 class="sortable-header quick-subs-head"><span class="header-title">${QS_T('Активные', 'Active')}</span>
    <button type="button" class="quick-subs-new">+ ${QS_T('Новая', 'New')}</button></h6>`;
  if (!subs.length) {
    html += `<p class="quick-empty-msg">${QS_T('Подписок пока нет. Подпишитесь на поиск колокольчиком в выдаче или создайте здесь.', 'No subscriptions yet. Subscribe to a search with the bell on the results page, or create one here.')}</p>`;
  } else {
    html += '<ul class="compact-list quick-subs-list">';
    subs.forEach(sub => {
      const prog = window.subProgress(sub);
      const order = sub.type === 'random' ? '' : ' · ' + (sub.order === 'matches' ? QS_T('по кол-ву совпадений', 'by match count') : QS_T('по порядку', 'in order'));
      const stat = sub.type === 'random'
        ? QS_T('сегодня: ', 'today: ') + (prog.nextId || '—')
        : (sub.type === 'place' && prog.nextId ? prog.nextId + ' ' + QS_T('из', 'of') + ' ' + prog.total : prog.read + ' ' + QS_T('из', 'of') + ' ' + prog.total);
      const href = sub.type === 'search' ? `${window.DG_SITE_BASE}/${encodeURIComponent(sub.query || '')}` : (prog.nextId ? `${window.DG_SITE_BASE}/${prog.nextId}` : '#');
      html += `<li class="quick-sub${sub.paused ? ' paused' : ''}" data-id="${qsEsc(sub.id)}">
        <span class="quick-sub-ic">${QS_ICON.bell}</span>
        <div class="quick-sub-main">
          <a href="${href}">${qsEsc(qsName(sub))}</a>
          ${sub.type === 'random' ? '' : `<span class="quick-sub-bar"><i style="width:${prog.percent}%"></i></span>`}
          <span class="quick-sub-meta">${qsEsc(stat + order + ' · ' + qsRemindText(sub))}${sub.paused ? ' · ' + QS_T('на паузе', 'paused') : ''}</span>
        </div>
        <button type="button" class="action-btn quick-sub-pause" title="${sub.paused ? QS_T('Возобновить', 'Resume') : QS_T('Пауза', 'Pause')}">${sub.paused ? QS_ICON.play : QS_ICON.pause}</button>
        <button type="button" class="action-btn quick-sub-edit" title="${QS_T('Изменить', 'Edit')}">${QS_ICON.edit}</button>
        <button type="button" class="action-btn quick-sub-del" title="${QS_T('Отписаться', 'Unsubscribe')}">×</button>
      </li>`;
    });
    html += '</ul>';
  }
  host.innerHTML = html;
}

document.addEventListener('click', (e) => {
  const host = document.getElementById('quick-subs');
  if (!host || !host.contains(e.target)) return;
  if (e.target.closest('.quick-subs-new')) return openQuickSubForm(null, '');
  const li = e.target.closest('.quick-sub');
  if (!li) return;
  const id = li.dataset.id;
  const sub = window.subGetAll().find(x => x.id === id);
  if (!sub) return;
  if (e.target.closest('.quick-sub-pause')) { window.subSetPaused(id, !sub.paused); renderQuickSubs(); }
  else if (e.target.closest('.quick-sub-edit')) openQuickSubForm(sub);
  else if (e.target.closest('.quick-sub-del')) {
    if (confirm(QS_T(`Отписаться от «${qsName(sub)}»?`, `Unsubscribe from “${qsName(sub)}”?`))) { window.subRemove(id); renderQuickSubs(); }
  } else if (e.target.closest('a') && sub.type === 'search') {
    // ТЗ §8: a search subscription's name opens its results with the ✓ column on.
    try { sessionStorage.setItem('dg-open-read-col', '1'); } catch (err) {}
  }
});

function openQuickSubForm(sub, q) {
  const wrap = window.quickModal && window.quickModal.querySelector('.quick-modal-content-wrapper');
  const form = document.getElementById('quick-subform');
  if (!wrap || !form) return;
  const editing = !!sub;
  const app = (sub && sub.remind && sub.remind.app) || null;
  const st = {
    kind: sub && sub.type === 'random' ? 'random' : 'text',
    text: sub ? (sub.type === 'search' ? sub.query : sub.type === 'place' ? sub.place : '') : (q || ''),
    order: (sub && sub.order) || 'canon',
    scope: (sub && sub.scope) || ['nikayas'],
    web: (sub && sub.remind && sub.remind.web) || 'open',
    appMode: app && app.advanced ? 'adv' : 'simple',
    appWhen: (app && app.when) || 'open',
    times: (app && app.times && app.times.slice()) || ['09:00'],
    days: (app && app.days) || 'every',
    place: null
  };
  const seg = (name, opts, cur) => `<div class="quick-seg" data-seg="${name}">${opts.map(o => `<button type="button" data-v="${o[0]}" class="${o[0] === cur ? 'on' : ''}">${o[1]}</button>`).join('')}</div>`;
  const DAYS = [['every', QS_T('Каждый день', 'Every day')], ['week', QS_T('По будням', 'Weekdays')], ['upo', QS_T('Упосатхи', 'Uposatha')], ['custom', QS_T('Свои дни', 'Custom')]];
  const WD = QS_T('Пн Вт Ср Чт Пт Сб Вс', 'Mo Tu We Th Fr Sa Su').split(' ');
  // In the app (dg-app-full sets dgOfflineReady) the browser reminder block means nothing —
  // only the app's own notification times are shown.
  const inApp = !!window.dgOfflineReady;
  function paint() {
    const isText = st.kind === 'text';
    // Every choice repaints the form: keep the scroll position, or it jumps to the top (owner).
    const oldBody = form.querySelector('.quick-subform-body');
    const keepScroll = oldBody ? oldBody.scrollTop : 0;
    form.innerHTML = `
      <div class="quick-subform-head">
        <button type="button" class="quick-subform-back" aria-label="${QS_T('Назад', 'Back')}">←</button>
        <b>${editing ? QS_T('Изменить подписку', 'Edit subscription') : QS_T('Новая подписка', 'New subscription')}</b>
        <button type="button" class="quick-subform-close" aria-label="${QS_T('Закрыть', 'Close')}">×</button>
      </div>
      <div class="quick-subform-body">
        <div class="quick-subrow">
          <label class="quick-sublabel">${QS_T('Что читать', 'What to read')}</label>
          <button type="button" class="quick-switch" role="switch" aria-checked="${!isText}" data-random>${QS_T('Случайная', 'Random')}<span class="quick-switch-track"><i></i></span></button>
        </div>
        ${isText ? `
          <div class="quick-subfield"><input type="text" class="quick-subinput" value="${qsEsc(st.text)}" placeholder="${QS_T('слово или sn1, an4, mn, dn15', 'a word or sn1, an4, mn, dn15')}" autocomplete="off"><button type="button" class="quick-subinput-clear" ${st.text ? '' : 'hidden'} aria-label="${QS_T('Очистить', 'Clear')}">×</button></div>
          <p class="quick-subhint">${st.place ? QS_T('Читать по порядку: ', 'Read in order: ') + qsEsc(st.place.label) + ' · ' + QS_T('с ', 'from ') + qsEsc(st.place.place) : QS_T('Тексты, где встречается слово.', 'Texts where the word occurs.')}</p>
          ${st.place ? '' : seg('order', [['canon', QS_ICON.az + QS_T('По порядку', 'In order')], ['matches', QS_ICON.many + QS_T('По кол-ву совпадений', 'By match count')]], st.order)}
          ${st.place || !st.text ? '' : `<a class="quick-sub-markread" href="${window.DG_SITE_BASE}/${encodeURIComponent(st.text)}">${QS_ICON.check}<span>${QS_T('Отметить прочитанное', 'Mark as read')}</span><span class="quick-sub-arrow">→</span></a>`}
        ` : `
          <div class="quick-subscopes">${QS_SCOPES.filter(sc => !sc.hidden).map(sc => `<button type="button" data-scope="${sc.key}" aria-pressed="${st.scope.includes(sc.key)}" class="${st.scope.includes(sc.key) ? 'on' : ''}">${QS_T(sc.ru, sc.en)}</button>`).join('')}</div>
        `}
        ${inApp ? '' : `<label class="quick-sublabel">${QS_T('Напоминание', 'Reminder')}</label>
        ${seg('web', [['open', QS_T('Раз в день, при открытии браузера', 'Once a day, when the browser opens')], ['schedule', QS_T('По расписанию', 'On schedule')]], st.web)}
        ${st.web === 'schedule' ? `<div class="quick-subnote">${QS_T('Расписание — в приложении: браузер не гарантирует уведомление при закрытой вкладке.', 'Schedules live in the app: a browser cannot promise a notification with the tab closed.')}
          <div><a href="https://play.google.com/store/apps/details?id=gift.dhamma.twa" target="_blank" rel="noopener">Google Play</a> · <a href="https://testflight.apple.com/join/xWPmmbtQ" target="_blank" rel="noopener">iOS (TestFlight)</a></div></div>` : ''}`}
        <label class="quick-sublabel">${inApp ? QS_T('Напоминание', 'Reminder') : QS_T('В приложении', 'In the app')}</label>
        ${seg('appWhen', [['open', QS_T('Раз в день, при открытии приложения', 'Once a day, when the app opens')], ['schedule', QS_T('По расписанию', 'On schedule')]], st.appWhen)}
        ${st.appWhen !== 'schedule' ? '' : `
        ${seg('appMode', [['simple', QS_T('Простые', 'Simple')], ['adv', QS_T('Продвинутые', 'Advanced')]], st.appMode)}
        ${st.appMode === 'simple' ? `<div class="quick-subtimes"><input type="time" data-i="0" value="${st.times[0] || '09:00'}"></div>` : `
          <div class="quick-subtimes">${st.times.map((tm, i) => `<input type="time" data-i="${i}" value="${tm}">`).join('')}</div>
          <div class="quick-subcount"><span>${QS_T('Раз в день', 'Times a day')}</span><button type="button" data-d="-1">−</button><b>${st.times.length}</b><button type="button" data-d="1">+</button></div>
          <label class="quick-sublabel">${QS_T('Когда', 'When')}</label>
          <div class="quick-seg quick-seg-grid" data-seg="days">${DAYS.map(d => `<button type="button" data-v="${d[0]}" class="${(Array.isArray(st.days) ? 'custom' : st.days) === d[0] ? 'on' : ''}">${d[1]}</button>`).join('')}</div>
          ${st.days === 'upo' ? `<p class="quick-subhint"><span data-upo-next></span> <a href="${window.DG_SITE_BASE}/uposatha-calendar" target="_blank" rel="noopener">${QS_T('Календарь →', 'Calendar →')}</a></p>` : ''}
          ${Array.isArray(st.days) ? `<div class="quick-subwd">${WD.map((w, i) => `<button type="button" data-wd="${i + 1}" class="${st.days.includes(i + 1) ? 'on' : ''}">${w}</button>`).join('')}</div>` : ''}
        `}`}
        <button type="button" class="quick-subsave">${editing ? QS_T('Сохранить', 'Save') : QS_T('Подписаться', 'Subscribe')}</button>
        <p class="quick-suberr" hidden></p>
      </div>`;
    form.querySelector('.quick-subform-body').scrollTop = keepScroll;
    const upo = form.querySelector('[data-upo-next]');
    if (upo) qsNextUposatha(st.times).then(d => { if (d && upo.isConnected) upo.textContent = QS_T('Ближайшая: ', 'Next: ') + d + ' ·'; });
    const inp = form.querySelector('.quick-subinput');
    if (inp) {
      let tmr;
      inp.addEventListener('input', () => {
        st.text = inp.value;
        form.querySelector('.quick-subinput-clear').hidden = !inp.value;
        clearTimeout(tmr);
        tmr = setTimeout(() => qsDetectPlace(st.text).then(pl => {
          const changed = (pl && pl.place) !== (st.place && st.place.place);
          st.place = pl;
          if (changed) { paint(); const i2 = form.querySelector('.quick-subinput'); i2.focus(); i2.setSelectionRange(i2.value.length, i2.value.length); }
        }), 250);
      });
    }
  }
  form.onclick = (e) => {
    // "Mark as read": already on this word's results — just close and show the ✓ column (no
    // reload, owner); elsewhere — go there with the column switched on.
    const mark = e.target.closest('a.quick-sub-markread');
    if (mark) {
      const q = (st.text || '').trim().toLowerCase();
      const here = document.body.classList.contains('dg-state-results') &&
        [decodeURIComponent(location.pathname.replace(/^\/(ru\/)?/, '')), (document.getElementById('paliauto') || {}).value || '']
          .some(v => v.trim().toLowerCase() === q);
      if (here && typeof window.dgOpenReadColumn === 'function') {
        e.preventDefault();
        closeQuickSubForm();
        if (window.quickModalIsOpen) window.toggleQuickModal();
        const col = document.getElementById('btn-read-marks');
        if (col && col.getAttribute('aria-pressed') === 'true' && window.dgPulseReadWave) window.dgPulseReadWave();
        else window.dgOpenReadColumn();
      } else {
        try { sessionStorage.setItem('dg-open-read-col', '1'); } catch (err) {}
      }
      return;
    }
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-random')) { st.kind = st.kind === 'random' ? 'text' : 'random'; return paint(); }
    const segEl = b.closest('.quick-seg');
    if (segEl && b.dataset.v) {
      const k = segEl.dataset.seg;
      if (k === 'days') {
        st.days = b.dataset.v === 'custom' ? (Array.isArray(st.days) ? st.days : [1, 2, 3, 4, 5]) : b.dataset.v;
        // Uposatha begins at the evening: default the untouched 09:00 to 18:00 (owner).
        if (st.days === 'upo' && st.times.length === 1 && st.times[0] === '09:00') st.times = ['18:00'];
      } else st[k] = b.dataset.v;
      if (k === 'appMode' && st.appMode === 'simple') st.times = st.times.slice(0, 1);
      return paint();
    }
    if (b.dataset.d) { const n = Math.max(1, Math.min(5, st.times.length + Number(b.dataset.d))); while (st.times.length < n) st.times.push('19:00'); st.times = st.times.slice(0, n); return paint(); }
    if (b.dataset.scope) { const k = b.dataset.scope; st.scope = st.scope.includes(k) ? st.scope.filter(x => x !== k) : st.scope.concat(k); return paint(); }
    if (b.dataset.wd) { const d = Number(b.dataset.wd); st.days = st.days.includes(d) ? st.days.filter(x => x !== d) : st.days.concat(d).sort(); return paint(); }
    if (b.classList.contains('quick-subinput-clear')) { st.text = ''; st.place = null; paint(); form.querySelector('.quick-subinput').focus(); return; }
    if (b.classList.contains('quick-subform-back')) return closeQuickSubForm();
    if (b.classList.contains('quick-subform-close')) { closeQuickSubForm(); return window.toggleQuickModal(); }
    if (b.classList.contains('quick-subsave')) save(b);
  };
  form.onchange = (e) => {
    if (e.target.matches('.quick-subtimes input')) { st.times[Number(e.target.dataset.i)] = e.target.value; if (st.days === 'upo') paint(); }
  };
  function save(btn) {
    const err = form.querySelector('.quick-suberr');
    const fail = (msg) => { err.textContent = msg; err.hidden = false; btn.disabled = false; };
    const text = (st.text || '').trim();
    if (st.kind === 'text' && !text) return fail(QS_T('Введите слово или место в каноне.', 'Enter a word or a place in the canon.'));
    if (st.kind === 'random' && !st.scope.length) return fail(QS_T('Выберите, где искать.', 'Choose where to pick from.'));
    btn.disabled = true;
    const base = sub ? Object.assign({}, sub) : {};
    base.remind = { web: st.web, app: { when: st.appWhen, times: st.times.slice(), days: st.appMode === 'adv' ? st.days : 'every', advanced: st.appMode === 'adv' } };
    const job = st.kind === 'random'
      ? qsRandomIds(st.scope.filter(k => k !== 'abhi').concat(qsGlobalAbhi() ? ['abhi'] : [])).then(ids => Object.assign(base, { type: 'random', scope: st.scope.filter(k => k !== 'abhi'), query: undefined, place: undefined, suttaIds: ids }))
      : qsDetectPlace(text).then(pl => pl
          ? qsPlaceIds(pl.place, pl.book).then(ids => Object.assign(base, { type: 'place', place: pl.place, placeLabel: pl.label, order: 'canon', query: undefined, suttaIds: ids }))
          : qsSearchIds(text, st.order).then(ids => Object.assign(base, { type: 'search', query: text, order: st.order, place: undefined, suttaIds: ids })));
    job.then(s2 => {
      if (!s2.suttaIds || !s2.suttaIds.length) return fail(QS_T('Ничего не найдено — подписываться не на что.', 'Nothing found to subscribe to.'));
      window.subUpsert(JSON.parse(JSON.stringify(s2))); // drops the undefined keys
      if (typeof window.dgNativeLN === 'function' && window.dgNativeLN()) window.dgNativeLN().requestPermissions().catch(() => {});
      closeQuickSubForm();
      renderQuickSubs();
    }).catch(() => fail(QS_T('Не удалось загрузить тексты. Проверьте соединение.', 'Could not load the texts. Check the connection.')));
  }
  paint();
  if (st.text) qsDetectPlace(st.text).then(pl => { st.place = pl; if (pl) paint(); });
  form.hidden = false;
  wrap.classList.add('quick-form-open');
}
function closeQuickSubForm() {
  const wrap = window.quickModal && window.quickModal.querySelector('.quick-modal-content-wrapper');
  const form = document.getElementById('quick-subform');
  if (form) form.hidden = true;
  if (wrap) wrap.classList.remove('quick-form-open');
}

// Single entry point for subscription settings (ТЗ §2): opens the quick window on "Subscriptions",
// with the form for {id} (edit) or prefilled with {q} (new), or just the list.
window.subsOpen = function (opts) {
  opts = opts || {};
  window.toggleQuickModal('tab-subs');
  const subs = typeof window.subGetAll === 'function' ? window.subGetAll() : [];
  const sub = opts.id ? subs.find(x => x.id === opts.id) : null;
  if (sub) return openQuickSubForm(sub);
  if (opts.q) {
    const q = String(opts.q).toLowerCase();
    return openQuickSubForm(subs.find(x => x.type === 'search' && (x.query || '').toLowerCase() === q) || null, opts.q);
  }
  closeQuickSubForm();
};
