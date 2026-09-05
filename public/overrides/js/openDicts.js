function getEffectiveTheme() {
  if (localStorage.theme === 'light' || localStorage.theme === 'dark') {
    return localStorage.theme;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function openWithQuery(event, base = 'https://www.aksharamukha.com/converter?source=IASTPali&target=Devanagari&text={{q}}') {
  const queryInput = document.getElementById('paliauto');
  const query = queryInput?.value.trim().toLowerCase().replace(/ṁ/g, 'ṃ') || '';

  if (query) {
    showBubbleNotification('Copied to clipboard');
    navigator.clipboard.writeText(query).catch(err => {
      console.warn('Clipboard copy failed:', err);
    });
  }

  const theme = getEffectiveTheme();
  const url = base.replace(/{{q}}/g, encodeURIComponent(query)).replace(/{{theme}}/g, theme);

  const el = event.currentTarget;
  el.href = url;

  return true; 
}

function openWithQueryMulti(event, baseUrls) {
  event.preventDefault();
  
  const searchInput = document.getElementById('paliauto');
  const query = searchInput?.value.trim().toLowerCase().replace(/ṁ/g, 'ṃ') || '';
  
  if (query) {
    showBubbleNotification('Copied to clipboard');
    navigator.clipboard.writeText(query).catch(err => {
      console.warn('Clipboard copy failed:', err);
    });
  }

  const encodedQ = encodeURIComponent(query);
  const theme = getEffectiveTheme();

  baseUrls.forEach((baseUrl, index) => {
    let finalUrl = baseUrl.replace(/{{theme}}/g, theme);
    finalUrl = finalUrl + encodedQ;
    
    setTimeout(() => {
      window.open(finalUrl, '_blank');
    }, 1 * index); 
  });

  return false;
}

function openDictionaries(event) {
  event.preventDefault();
  const query = document.getElementById('paliauto')?.value.trim().toLowerCase().replace(/ṁ/g, 'ṃ') || '';

  const newWindowWidth = 500;
  const newWindowHeight = 500;
  const screenWidth = window.screen.availWidth;
  const screenHeight = window.screen.availHeight;
  const newWindowleft = screenWidth - newWindowWidth - 30;
  const newWindowTop = screenHeight - newWindowHeight - 50;
  const popupFeatures = `width=${newWindowWidth},height=${newWindowHeight},left=${newWindowleft},top=${newWindowTop},scrollbars=yes,resizable=yes`;

  const theme = getEffectiveTheme();

  const dictionaries = [
    { name: 'PTS', method: 'GET', base: 'https://dsal.uchicago.edu/cgi-bin/app/pali_query.py?matchtype=default&qs=', fallback: 'https://dsal.uchicago.edu/dictionaries/pali/', iframe: true },
    { name: 'Gandhari', method: 'GET', base: 'https://gandhari.org/dictionary?section=dop&search=', fallback: 'https://gandhari.org/dop', iframe: true },
    { name: 'DPD', method: 'GET', base: `https://dict.dhamma.gift/?silent&theme=${theme}&source=pwa&q=`, fallback: `https://dict.dhamma.gift/?theme=${theme}&source=pwa`, iframe: true },
    { name: 'DPR', method: 'GET', base: 'https://d.dhamma.gift/_dprhtml/index.html?frombox=1&analysis=', fallback: 'https://d.dhamma.gift/_dprhtml/index.html', iframe: false },
    { name: 'CPD', method: 'GET', base: 'https://cpd.uni-koeln.de/search?query=', fallback: 'https://cpd.uni-koeln.de/search', iframe: true },
    { name: 'Glosbe', method: 'GET', base: 'https://glosbe.com/pi/sa/', fallback: 'https://glosbe.com/pi/sa/', iframe: false },
    { name: 'MWScan', method: 'GET', base: 'https://www.sanskrit-lexicon.uni-koeln.de/scans/MWScan/2020/web/webtc/indexcaller.php?transLit=roman&key=', fallback: 'https://www.sanskrit-lexicon.uni-koeln.de/scans/MWScan/2020/web/index.php', iframe: false },
    { name: 'APScan', method: 'GET', base: 'https://www.sanskrit-lexicon.uni-koeln.de/scans/APScan/2020/web/webtc/indexcaller.php?transLit=roman&key=', fallback: 'https://www.sanskrit-lexicon.uni-koeln.de/scans/APScan/2020/web/index.php', iframe: false },
    { name: 'MDScan', method: 'GET', base: 'https://www.sanskrit-lexicon.uni-koeln.de/scans/MDScan/2020/web/webtc/indexcaller.php?transLit=roman&key=', fallback: 'https://www.sanskrit-lexicon.uni-koeln.de/scans/MDScan/2020/web/index.php', iframe: false },
    { name: 'Wisdomlib', method: 'GET', base: 'https://www.wisdomlib.org/index.php?type=search&division=glossary&item=&mode=text&input=', fallback: 'https://www.wisdomlib.org/', iframe: true }
  ];

  const numDicts = dictionaries.length;
  const path = window.location.pathname;
  const isRussianOrML = /^\/(r|ru|ml)\//.test(path); 

  let confirmMessage;
  if (isRussianOrML) {
    confirmMessage = `Будет открыто ${numDicts} вкладок. Продолжить?`;
  } else {
    confirmMessage = `This will open ${numDicts} tabs. Do you want to proceed?`;
  }

  if (window.confirm(confirmMessage)) {
    if (query) {
      const message = `Copied to clipboard`;
      showBubbleNotification(message); 
      navigator.clipboard.writeText(query).catch(err => {
        console.warn('Clipboard copy failed:', err);
      });
    }

    dictionaries.filter(d => !d.iframe).forEach(d => {
      const url = query ? d.base + encodeURIComponent(query) : d.fallback;
      window.open(url, '_blank');
    });

    const allowedDicts = dictionaries.filter(d => d.iframe);
    let win = window.open('', 'multiDict', popupFeatures);

    win.document.write(`
      <html>
      <head>
        <title>Dictionaries</title>
        <style>
          body { font-family: sans-serif; margin: 0; padding: 0; }
          .tabs { display: flex; background: #333; color: white; }
          .tabs button {
            flex: 1;
            padding: 8px;
            border: none;
            background: #333;
            color: white;
            cursor: pointer;
            font-size: 13px;
          }
          .tabs button:hover { background: #555; }
          .tab-content { display: none; width: 100%; height: calc(100vh - 35px); }
          .tab-content.active { display: block; }
          iframe { width: 100%; height: 100%; border: none; }
        </style>
      </head>
      <body>
        <div class="tabs">
          ${allowedDicts.map((d, i) => `<button onclick="showTab(${i})">${d.name}</button>`).join('')}
        </div>
        ${allowedDicts.map((d, i) => {
          let url = '';
          if (!query) {
            url = d.fallback;
          } else if (d.method === 'GET') {
            url = d.base + encodeURIComponent(query);
          }
          return `<div class="tab-content${i === 0 ? ' active' : ''}"><iframe src="${url}"></iframe></div>`;
        }).join('')}
        <script>
          function showTab(index) {
            document.querySelectorAll('.tab-content').forEach((tab, i) => {
              tab.classList.toggle('active', i === index);
            });
          }
        </script>
      </body>
      </html>
    `);
    win.document.close();
  }
}