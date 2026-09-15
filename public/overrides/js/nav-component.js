// === Файл: /assets/js/nav-component.js ===
//
// OVERRIDE-копия легаси-файла (siteroot/assets/js/nav-component.js) — тот же приём и та же
// причина, что у public/overrides/js/autopali.js (см. комментарий там же): сам легаси-файл общий
// с продом, мы его не трогаем, а dg-node отдаёт свою копию первым (app.use('/assets', ...) в
// dg-light.js).
//
// Отличия от оригинала: ракушка ведёт на настоящую главную (/), вторая иконка — оглавление /toc
// (SPA-навигатор, заменивший легаси read.php) со значком table-list, как у кнопки «Оглавление» в
// поле поиска сайта. Раньше ракушка вела на оглавление, а главная стояла второй с другим значком —
// владелец: путанно. При обновлении легаси-версии этот патч нужно перенести заново.

class TopNavIcons extends HTMLElement {
    connectedCallback() {
        // Читаем атрибуты: тип главной ссылки и флаг для словаря
        const type = this.getAttribute('type') || 'home';
        const showDict = this.hasAttribute('show-dict');

        // `type` no longer changes the links: the shell is always the home page, the second icon
        // always the contents (read attribute kept so existing pages' markup stays valid).
        let html = `
            <a href="/" id="nav_home_link" title="Home" rel="noreferrer" class="me-1 top-nav-icon-link">
          <img class="common-size-icon sankha" alt="Dhamma.Gift" src="/assets/img/dgsankhaonly.png">
            </a>
            <a href="/toc" id="nav_read_link" title="Contents: suttas and Vinaya" rel="noreferrer" class="me-1 top-nav-icon-link">
                <img class="top-nav-icon" alt="Contents" src="/assets/svg/table-list.svg">
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
