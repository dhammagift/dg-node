// === Файл: /assets/js/nav-component.js ===
//
// OVERRIDE-копия легаси-файла (siteroot/assets/js/nav-component.js) — тот же приём и та же
// причина, что у public/overrides/js/autopali.js (см. комментарий там же): сам легаси-файл общий
// с продом, мы его не трогаем, а dg-node отдаёт свою копию первым (app.use('/assets', ...) в
// dg-light.js).
//
// ЕДИНСТВЕННОЕ отличие от оригинала: первая иконка (type="read") вела на легаси /read.php —
// на dg-node это /toc, новый SPA-навигатор/оглавление (public/spa/toc.js), заменивший read.php
// (см. CLAUDE.md, TODO.md). Больше в файле ничего не менялось; при обновлении легаси-версии этот
// патч нужно перенести заново.

class TopNavIcons extends HTMLElement {
    connectedCallback() {
        // Читаем атрибуты: тип главной ссылки и флаг для словаря
        const type = this.getAttribute('type') || 'home';
        const showDict = this.hasAttribute('show-dict');

        const isRead = type === 'read';
        const firstIconId = isRead ? 'nav_read_link' : 'nav_home_link';
        const firstIconTitle = isRead ? 'Sutta and Vinaya reading' : 'Home';

        let html = `
            <a href="/toc" id="${firstIconId}" title="${firstIconTitle}" rel="noreferrer" class="me-1 top-nav-icon-link">
          <img class="common-size-icon sankha" alt="page for reading" src="/assets/img/dgsankhaonly.png">
            </a>
            <a href="/" id="nav_search_link" title="Sutta and Vinaya search" rel="noreferrer" class="me-1 top-nav-icon-link">
                <img width="24px" alt="dhamma.gift icon" src="/assets/img/gray-white.png">
            </a>
        `;

        // Опциональная кнопка словаря
        if (showDict) {
            html += `
            <a alt="Onclick popup dictionary" title="Onclick popup dictionary (Alt+A)" class="mx-1 toggle-dict-btn top-nav-icon-link cursor-pointer">
                <img src="/assets/svg/comment.svg" class="top-nav-icon dictIcon">
            </a>
            `;
        }

        // Общие кнопки темы и компаса
        html += `
            <a id="theme-button" title="Switch theme (Alt+T)" onclick="switchIcon(this)" class="mx-1 top-nav-icon-link cursor-pointer">
                <img src="/assets/svg/circle-half-stroke.svg" alt="Switch theme" class="top-nav-icon changesvg">
            </a>
            <a onclick="toggleQuickModal()" aria-label="Open Cattāri Ariyasaccāni" title="Compass" class="mx-1 top-nav-icon-link cursor-pointer d-flex align-items-center">
                <img src="/assets/svg/compass.svg" class="compass-icon top-nav-icon">
            </a>
        `;

        this.innerHTML = html;

        // Позволяет элементам внутри компонента подчиняться flexbox-правилам родителя
        this.style.display = 'contents';
    }
}

customElements.define('top-nav-icons', TopNavIcons);
