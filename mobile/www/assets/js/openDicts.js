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

