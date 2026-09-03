// Функция для обновления текста кнопки в зависимости от режима
function updateButtonText(isColumnView) {
  const toggleLink = document.getElementById('toggle-mode');
  if (!toggleLink) return;
  toggleLink.innerHTML = isColumnView
    ? '<img src="/assets/svg/align-left.svg" class="common-size-icon4"></img>'
    : '<img src="/assets/svg/align-right.svg" class="common-size-icon4"></img>';
}

// Функция для переключения режима с жесткой фиксацией позиции
function toggleViewMode() {
  const suttaElement = document.querySelector('#sutta, .sutta');
  if (!suttaElement) return;

  // 1. ЗАПОМИНАЕМ ТОЧНУЮ ПОЗИЦИЮ
  // Фильтруем: берем только те ID, которые НЕ являются кнопками или переключателями
  // Можно уточнить селектор, например: 'p[id], span[id]' или '.segment[id]'
  const segments = suttaElement.querySelectorAll('[id]:not(button):not(a):not(.menu-item)');
  
  let anchorElement = null;
  let anchorOffset = 0;

  for (let seg of segments) {
    const rect = seg.getBoundingClientRect();
    // Ищем элемент, который реально виден в верхней части контентной области
    if (rect.top > -10 && rect.top < window.innerHeight / 2) {
      anchorElement = seg;
      anchorOffset = rect.top; 
      break;
    }
  }

  // 2. ПОДГОТОВКА
  const html = document.documentElement;
  const prevScrollBehavior = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';

  // 3. ПЕРЕКЛЮЧАЕМ РЕЖИМ
  showPaliEnglish();
  const isColumnView = suttaElement.classList.toggle('column-view');
  localStorage.setItem('viewMode', isColumnView ? 'columns' : 'alternate');
  updateButtonText(isColumnView);

  // 4. ВОССТАНАВЛИВАЕМ ПОЗИЦИЮ
  if (anchorElement) {
    // Используем requestAnimationFrame для ожидания перерисовки
    requestAnimationFrame(() => {
      const newRect = anchorElement.getBoundingClientRect();
      // Новая позиция скролла: текущий скролл + разница в положении элемента
      const scrollDiff = newRect.top - anchorOffset;
      window.scrollBy(0, scrollDiff);

      // ДЕБАГ: Результат перемещения
   //   console.log(`Скорректировано на: ${scrollDiff}px`);
      
      html.style.scrollBehavior = prevScrollBehavior;
    });
  } else {
    html.style.scrollBehavior = prevScrollBehavior;
  }
}



document.addEventListener('DOMContentLoaded', function() {
  const savedMode = localStorage.getItem('viewMode') || 'alternate';
  const suttaElement = document.querySelector('#sutta, .sutta');
  const isColumnView = (savedMode === 'columns');

  if (isColumnView && suttaElement) {
    showPaliEnglish();
    suttaElement.classList.add('column-view');
  }

  updateButtonText(isColumnView);

  const toggleBtn = document.getElementById('toggle-mode');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function(e) {
        e.preventDefault();
        toggleViewMode();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.altKey && event.code === 'KeyC') {
      toggleViewMode();
    }
  });  
});

function showPaliEnglish() {
  const suttaA = document.getElementById("sutta");
  if (!suttaA) return;
  suttaA.classList.remove("hide-pali", "hide-english", "hide-russian");
}
