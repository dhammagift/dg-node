const isRu = window.location.pathname.match(/\/(ru|r|ml)(\/|$)/) ; //|| localStorage.getItem('siteLanguage') === 'ru';

// Выносим тексты в отдельный объект для глобального доступа
const translations = isRu ? {
    title: "Облачная синхронизация", desc: "История, избранное и настройки.",
    google: "Войти через Google", or: "или", phraseLabel: "Секретная фраза",
    hint: "Минимум 8 символов. Полная анонимность.", 
    loginPhrase: "Анонимный вход",
    statusLabelGoogle: "Google аккаунт:", statusLabelPhrase: "Ваша фраза:",
    syncLabel: "Синхронизировано:", lblSync: "Синхр.",
    logout: "Выйти", delete: "Удалить данные",
    sessionsLabel: "Активные устройства:",
    mergeTitle: "Обнаружены локальные данные",
    mergeBody: "На этом устройстве есть сохраненная история и избранное. Как поступить при входе?<br><br><b>Объединить</b>: сохранить текущие данные и добавить к ним облачные.<br><b>Заменить</b>: удалить данные с этого устройства и скачать копию из облака.",
    btnMerge: "Объединить (Merge)", btnOverwrite: "Заменить из облака (Overwrite)", btnCancel: "Отмена"
} : {
    title: "Cloud Sync", desc: "History, favorites, and settings.",
    google: "Sign in with Google", or: "or", phraseLabel: "Secret Passphrase",
    hint: "Min 8 chars. Completely anonymous.", 
    loginPhrase: "Anonymous Login",
    statusLabelGoogle: "Google Account:", statusLabelPhrase: "Your Phrase:",
    syncLabel: "Last synced:", lblSync: "Sync",
    logout: "Logout", delete: "Delete Cloud Data",
    sessionsLabel: "Active Devices:",
    mergeTitle: "Local Data Found",
    mergeBody: "History and favorites were found on this device. How would you like to proceed?<br><br><b>Merge</b>: keep local data and combine it with the cloud.<br><b>Overwrite</b>: delete data from this device and download cloud copy.",
    btnMerge: "Merge Data", btnOverwrite: "Overwrite from Cloud", btnCancel: "Cancel"
};

// Функция принудительной локализации статических элементов
function applyLocalization() {
    const el = (id) => document.getElementById(id);
    
    if (el('sync-page-title')) el('sync-page-title').textContent = translations.title;
    if (el('sync-page-desc')) el('sync-page-desc').textContent = translations.desc;
    if (el('sync-or')) el('sync-or').textContent = translations.or;
    if (el('sync-phrase-label')) el('sync-phrase-label').textContent = translations.phraseLabel;
    if (el('sync-hint')) el('sync-hint').textContent = translations.hint;
    
    const btnGoogle = el('btn-google-login');
    if (btnGoogle) btnGoogle.innerHTML = `<i class="fa-brands fa-google me-2"></i> ${translations.google}`;
    
    const btnPhrase = el('btn-phrase-login');
    if (btnPhrase) btnPhrase.textContent = translations.loginPhrase;

    if (el('sync-time-label')) el('sync-time-label').textContent = translations.syncLabel;
    if (el('lbl-sync')) el('lbl-sync').textContent = translations.lblSync;
    if (el('lbl-logout')) el('lbl-logout').textContent = translations.logout;
    if (el('lbl-delete')) el('lbl-delete').textContent = translations.delete;
    if (el('sync-sessions-label')) el('sync-sessions-label').textContent = translations.sessionsLabel;

    if (el('mergeModalTitle')) el('mergeModalTitle').textContent = translations.mergeTitle;
    if (el('mergeModalBody')) el('mergeModalBody').innerHTML = translations.mergeBody;
    if (el('btn-modal-merge')) el('btn-modal-merge').textContent = translations.btnMerge;
    if (el('btn-modal-overwrite')) el('btn-modal-overwrite').textContent = translations.btnOverwrite;
    if (el('btn-modal-cancel')) el('btn-modal-cancel').textContent = translations.btnCancel;
}

document.addEventListener("DOMContentLoaded", () => {
    // 1. Применяем локализацию сразу при загрузке DOM
    applyLocalization();

    // 2. Адаптация ссылок "Домик" и "Лупа"
    if (isRu) {
        const navHomeLink = document.getElementById('nav_home_link');
        if (navHomeLink) navHomeLink.href = "/ru/read.php";
        const navSearchLink = document.getElementById('nav_search_link');
        if (navSearchLink) navSearchLink.href = "/ru/";
    }

    // 3. Переключатель En/Ru
    const switcher = document.getElementById('lang-switcher');
    if (switcher) {
        const currentPath = window.location.pathname;
        const currentSearch = window.location.search;
        if (isRu) {
            let enPath = currentPath.replace(/^\/(ru|r|ml)(\/|$)/, '/');
            switcher.innerHTML = `
                <a class="btn btn-sm btn-secondary rounded-pill py-0 px-1 text-decoration-none me-0" href="${enPath + currentSearch}">en</a>
                <span class="py-0 px-1 text-muted">ru</span>
            `;
        } else {
            let ruPath = '/ru' + (currentPath === '/' ? '' : currentPath);
            switcher.innerHTML = `
                <span class="py-0 px-1 text-muted me-0">en</span>
                <a class="btn btn-sm btn-secondary rounded-pill py-0 px-1 text-decoration-none" href="${ruPath + currentSearch}">ru</a>
            `;
        }
    }

    // 4. Обработка Enter
    const phraseInput = document.getElementById('sync-phrase-input');
    if (phraseInput) {
        phraseInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                uiLoginPhrase();
            }
        });
    }
});

function hasLocalData() {
    const hist = JSON.parse(localStorage.getItem('localSearchHistory')) || [];
    const favs = JSON.parse(localStorage.getItem('dg_favorites')) || [];
    return hist.length > 0 || favs.length > 0;
}

function showMergeModal() {
    const modalEl = document.getElementById('mergeChoiceModal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
}

// login.js

function executePendingLogin(mode) {
    // Вместо удаления данных здесь, просто запоминаем выбор
    if (mode === 'overwrite') {
        window.pendingOverwrite = true;
    } else {
        window.pendingOverwrite = false;
    }
    
    if (window.pendingLoginType === 'google') {
        if (typeof syncLoginGoogle === 'function') syncLoginGoogle();
    } else if (window.pendingLoginType === 'phrase') {
        uiLoginPhrase(true); 
    }
}

window.syncLoginGoogleWrapper = function() {
    if (hasLocalData()) {
        window.pendingLoginType = 'google';
        showMergeModal();
    } else {
        if (typeof syncLoginGoogle === 'function') syncLoginGoogle();
    }
};

window.copySyncPhrase = function() {
    const realPhraseSpan = document.getElementById('sync-phrase-real-status');
    if (!realPhraseSpan) return;
    
    const phraseToCopy = realPhraseSpan.textContent;

    if (phraseToCopy) {
        const tempTextarea = document.createElement("textarea");
        tempTextarea.value = phraseToCopy;
        tempTextarea.className = "copy-textarea";
        document.body.appendChild(tempTextarea);
        tempTextarea.select();
        
        try {
            document.execCommand("copy");
            if (typeof showBubbleNotification === 'function') {
                showBubbleNotification(isRu ? ' Скопировано' : 'Copied to Clipboard');
            }
        } catch (err) {}
        document.body.removeChild(tempTextarea);
    }
};

async function uiDeleteAccount() {
    const confirmMsg = isRu 
        ? "Вы уверены? Это удалит данные ТОЛЬКО из облака. \n\nВаша локальная история и избранное на этом устройстве останутся нетронутыми." 
        : "Are you sure? This will delete data ONLY from the cloud. \n\nYour local history and favorites on this device will remain safe.";

    if (confirm(confirmMsg)) {
        const btnDelete = document.getElementById('lbl-delete');
        if (btnDelete) btnDelete.textContent = translations.delete + "...";
        if (typeof showBubbleNotification === 'function') {
            showBubbleNotification(isRu ? "🗑️ Данные в облаке удалены" : "🗑️ Cloud data deleted");
        }
        if (typeof syncDeleteData === 'function') await syncDeleteData();
    }
}

async function uiLoginPhrase(skipCheck = false) {
    const input = document.getElementById('sync-phrase-input');
    const phrase = input.value;
    
    if (phrase && phrase.trim().length >= 8) {
        if (!skipCheck && hasLocalData()) {
            window.pendingLoginType = 'phrase';
            showMergeModal();
            return; 
        }

        const rawPhrase = phrase.trim().toLowerCase().replace(/\s+/g, '-');
        const btn = document.getElementById('btn-phrase-login');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin me-2"></i>` + (isRu ? "Вход..." : "Logging in...");
        }

        try {
            const msgUint8 = new TextEncoder().encode(rawPhrase);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            const hashedId = "anon_" + hashHex.substring(0, 24);

            input.value = ''; 
            if (typeof syncEnablePhrase === 'function') syncEnablePhrase(rawPhrase, hashedId);
        } catch(e) {
            if (btn) {
                btn.disabled = false;
                btn.textContent = isRu ? "Ошибка" : "Error";
            }
        }
    } else {
        if (typeof showBubbleNotification === 'function') {
            showBubbleNotification(isRu ? "❌ Слишком короткая фраза" : "❌ Phrase too short");
        }
    }
}

function uiToggleEyeInput() {
    const input = document.getElementById('sync-phrase-input');
    const eyeBtn = document.getElementById('btn-toggle-eye');
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    eyeBtn.innerHTML = isPass ? '<i class="fa-solid text-muted fa-eye-slash"></i>' : '<i class="fa-solid text-muted fa-eye"></i>';
}

function uiToggleEyeStatus() {
    const valueSpan = document.getElementById('sync-phrase-value-status');
    const realSpan = document.getElementById('sync-phrase-real-status');
    const eyeBtn = document.getElementById('sync-status-eye-btn');
    const isHidden = realSpan.classList.contains('d-none');
    
    if (isHidden) {
        realSpan.classList.remove('d-none');
        valueSpan.classList.add('d-none');
        eyeBtn.innerHTML = '<i class="fa-solid text-muted fa-eye-slash"></i>';
    } else {
        realSpan.classList.add('d-none');
        valueSpan.classList.remove('d-none');
        eyeBtn.innerHTML = '<i class="fa-solid text-muted fa-eye"></i>';
    }
}

function getFormattedTime() {
    const ts = localStorage.getItem('lastSyncTime');
    if (!ts) return isRu ? "Никогда" : "Never";
    const date = new Date(parseInt(ts));
    return date.toLocaleString(isRu ? 'ru-RU' : 'en-US', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
}



// Эта функция по-прежнему будет дергаться извне при обновлении статуса логина
window.renderLoginPageUI = function(user, phraseId) {
    const el = (id) => document.getElementById(id);
    if (!el('sync-logged-out')) return;

    applyLocalization();

    if (user || phraseId) {
        // Очистка localStorage отсюда удалена, она теперь в setupCloudListeners (settings.js)
        
        el('sync-logged-out').classList.add('d-none');
        el('sync-logged-in').classList.remove('d-none');

        if (user) {
            el('sync-status-label').textContent = translations.statusLabelGoogle;
            el('sync-user-info').textContent = user.email;
        } else {
            el('sync-status-label').textContent = translations.statusLabelPhrase;
            const realPhrase = (typeof phraseId === 'string') ? phraseId.replace('phrase_', '') : phraseId;
            const starsPhrase = '•'.repeat(realPhrase.length);
            const copyHint = isRu ? "Копировать" : "Copy";
            
            el('sync-user-info').innerHTML = `
                <div class="d-flex align-items-center">
                    <span id="sync-phrase-value-status" onclick="window.copySyncPhrase()" title="${copyHint}" class="sync-phrase-value">${starsPhrase}</span>
                    <span id="sync-phrase-real-status" onclick="window.copySyncPhrase()" title="${copyHint}" class="text-primary d-none sync-phrase-real">${realPhrase}</span>
                    <button class="btn btn-sm p-0 ms-2 opacity-75 sync-status-eye" type="button" onclick="uiToggleEyeStatus()" id="sync-status-eye-btn">
                        <i class="fa-solid text-muted fa-eye"></i>
                    </button>
                </div>`;
        }

        const listEl = document.getElementById('sync-sessions-list');
        const currentDb = typeof db !== 'undefined' ? db : window.db;
        const currentUid = typeof getUid === 'function' ? getUid() : (user ? user.uid : localStorage.getItem('syncPhraseId'));

        if (listEl && window.firebase && currentDb && currentUid) {
            const localSessionId = localStorage.getItem('dg_session_id');
            if (window.unsubSessionList) window.unsubSessionList();
            window.unsubSessionList = currentDb.collection("users").doc(currentUid).collection("sessions")
                .orderBy("lastActive", "desc").onSnapshot((snap) => {
                    listEl.innerHTML = '';
                    snap.docs.forEach(doc => {
                        const data = doc.data();
                        const sid = doc.id;
                        const isCurrent = sid === localSessionId;
                        const dateRaw = data.lastActive ? data.lastActive.toDate() : new Date();
                        const dateStr = dateRaw.toLocaleString(isRu ? 'ru-RU' : 'en-US', { 
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                        });
                        const currentBadgeText = isRu ? 'Текущее' : 'Current';
                        const terminateHint = isRu ? 'Завершить сессию удаленно' : 'Terminate session';

                        const div = document.createElement('div');
                        div.className = "d-flex justify-content-between align-items-center p-2 rounded session-item";
                        div.innerHTML = `
                            <div class="session-text-container">
                                <div class="session-device-name">
                                    ${data.deviceName} ${isCurrent ? `<span class="badge bg-success ms-2 opacity-75 session-badge">${currentBadgeText}</span>` : ''}
                                </div>
                                <div class="text-muted mt-1 session-date">${dateStr}</div>
                            </div>
                            ${!isCurrent ? `<button class="btn btn-sm btn-outline-danger py-0 px-2 opacity-75 session-terminate-btn" onclick="terminateRemoteSession('${sid}')" title="${terminateHint}"><i class="fa-solid fa-power-off"></i></button>` : ''}
                        `;
                        listEl.appendChild(div);
                    });
                });
        }

        if (!localStorage.getItem('lastSyncTime') && !window.isInitialSyncing) {
            window.isInitialSyncing = true;
            el('sync-last-time').textContent = isRu ? "Синхронизация..." : "Syncing...";
            el('sync-last-time').classList.add('text-primary');
            if (typeof forceSyncNow === 'function') {
                forceSyncNow().then(() => {
                    localStorage.setItem('lastSyncTime', Date.now());
                    el('sync-last-time').textContent = getFormattedTime();
                    el('sync-last-time').classList.remove('text-primary');
                    window.isInitialSyncing = false;
                });
            }
        } else {
            el('sync-last-time').textContent = getFormattedTime();
        }

    } else {
        if (window.unsubSessionList) {
            window.unsubSessionList();
            window.unsubSessionList = null;
        }
        el('sync-last-time').textContent = getFormattedTime();
        el('sync-logged-out').classList.remove('d-none');
        el('sync-logged-in').classList.add('d-none');
    }
};
