
 window.activeMemoSavedSlug = null; // Якорь для отслеживания редактируемого документа

 
    
  // Функция для загрузки и рендера пресетов
async function loadPresets() {
    const container = document.getElementById('preset-list-container');
    if (!container) return;

    try {
        const response = await fetch('presets.json'); 
        if (!response.ok) throw new Error('Не удалось загрузить пресеты');
        
        const presets = await response.json();
        container.innerHTML = ''; // Очищаем надпись "Загрузка..."

        presets.forEach(preset => {
            const li = document.createElement('li');
            li.className = 'list-group-item';
            
            const a = document.createElement('a');
            a.textContent = preset.title;

            // Если есть готовый URL (как в старых пресетах)
            if (preset.url) {
                // Извлекаем только параметры (всё начиная с '?')
                const queryString = preset.url.includes('?') 
                    ? preset.url.substring(preset.url.indexOf('?')) 
                    : preset.url;
                
                // Приклеиваем их к текущему пути (например, /memo/ или /ru/memo/)
                a.href = window.location.pathname + queryString;
            } 
            // Если это новый удобный формат, собираем параметры динамически
            else {
                const params = new URLSearchParams();
                if (preset.text) params.set('text', preset.text);
                if (preset.delay !== undefined) params.set('delay', preset.delay);
                if (preset.end !== undefined) params.set('end', preset.end);
                if (preset.trn !== undefined) params.set('trn', preset.trn);
                if (preset.loop !== undefined) params.set('loop', preset.loop);
                if (preset.lc !== undefined) params.set('lc', preset.lc);
                if (preset.snd !== undefined) params.set('snd', preset.snd);
                if (preset.sep !== undefined) params.set('sep', preset.sep);

                a.href = window.location.pathname + '?' + params.toString();
            }

            li.appendChild(a);
            container.appendChild(li);
        });
    } catch (error) {
        console.error('Ошибка загрузки presets.json:', error);
        container.innerHTML = '<li class="list-group-item text-danger">Ошибка загрузки списка пресетов</li>';
    }
}
   

// Запускаем загрузку пресетов при загрузке страницы
window.addEventListener('DOMContentLoaded', loadPresets);

        // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
        window.memoLoopsPlayed = 0;
        window.memoCountdownInterval = null; 
        window.memoLoopTimeout = null;
        window.memoRestartTimeout = null;
        window.isLoopingPause = false; 
        window.memoLang = window.location.pathname.includes('/r/') || window.location.pathname.includes('/ml/') || window.location.pathname.includes('/ru/') ? 'ru' : 'en';
        window.isMemoPlaying = false; 

        // --- ГЛОБАЛЬНАЯ БЛОКИРОВКА (ГЕЙТКИПЕР) ---
        window.memoNextAllowedTime = 0;
        window.memoLockId = 0;

// --- ГЛОБАЛЬНЫЙ ПЛЕЕР ДЛЯ ЗВУКОВ ТАЙМЕРА (IOS FIX) ---
window.sharedMemoAudio = new Audio();

window.playMemoSound = function(soundChoice) {
    if (!soundChoice || soundChoice === 'none') return;
    
    // Если плеер по какой-то причине пропал, пересоздаем
    if (!window.sharedMemoAudio) {
        window.sharedMemoAudio = new Audio();
    }
    
    window.sharedMemoAudio.src = `/assets/sounds/${soundChoice}`;
    window.sharedMemoAudio.play().catch(e => console.warn("Memo sound playback failed or blocked:", e));
};



// --- MEMO WAKE LOCK (БЕЗОТКАЗНЫЙ ЭКРАН) ---
window.memoWakeLock = null;

window.requestMemoWakeLock = async function() {
    if ('wakeLock' in navigator) {
        try {
            if (window.memoWakeLock !== null) return;
            window.memoWakeLock = await navigator.wakeLock.request('screen');
            window.memoWakeLock.addEventListener('release', () => {
                window.memoWakeLock = null;
            });
        } catch (err) {
            console.warn(`Memo Wake Lock error: ${err.message}`);
        }
    }
};

window.releaseMemoWakeLock = function() {
    if (window.memoWakeLock !== null) {
        window.memoWakeLock.release().catch(() => {});
        window.memoWakeLock = null;
    }
};

// Восстанавливаем блокировку экрана, если пользователь свернул и развернул браузер
document.addEventListener('visibilitychange', () => {
    if (window.isMemoPlaying && document.visibilityState === 'visible') {
        if (typeof window.requestMemoWakeLock === 'function') {
            window.requestMemoWakeLock();
        }
    }
});


// --- ОБЩИЙ ТАЙМЕР СЕССИИ ---
window.globalSessionSeconds = 0;
window.globalSessionInterval = null;

// Новая функция-помощник: ищет таймер, а если его удалили — создает заново
function getOrCreateGlobalTimer() {
    let timerEl = document.getElementById('global-session-timer');
    if (!timerEl) {
        timerEl = document.createElement('div');
        timerEl.id = 'global-session-timer';
        
        // Сразу подставляем текущее время, чтобы не было скачков
        let m = Math.floor(window.globalSessionSeconds / 60).toString().padStart(2, '0');
        let s = (window.globalSessionSeconds % 60).toString().padStart(2, '0');
        timerEl.innerText = `${m}:${s}`;
        
        // Таймер должен быть виден, если окно плеера существует (даже на паузе)
        const isPlayerVisible = !!document.querySelector('.tts-main-row');
        timerEl.style.display = isPlayerVisible ? 'block' : 'none';
        
        document.body.appendChild(timerEl);
    }
    return timerEl;
}

function startGlobalSessionTimer() {
    const timerEl = getOrCreateGlobalTimer();
    
    // Скрываем маленький таймер, если текста нет (режим медитации)
    const text = document.getElementById("inputText").value.trim();
    if (!text) {
        timerEl.style.display = 'none';
    } else {
        timerEl.style.display = 'block';
    }
    
    if (!window.globalSessionInterval) {
        window.globalSessionInterval = setInterval(() => {
            let isActuallyPlaying = false;
            const currentText = document.getElementById("inputText").value.trim();

            if (!currentText) {
                // 1. Режим таймера (без текста). Там нет плеера, опираемся на наш флаг
                isActuallyPlaying = window.isMemoPlaying;
            } else {
                // 2. Режим заучивания (с текстом). Запрашиваем реальное состояние у ttsAPI
                if (window.ttsAPI) {
                    const state = window.ttsAPI.getState();
                    // Таймер тикает, только если плеер активен и НЕ поставлен на паузу юзером
                    if (state && state.speaking && !state.paused) {
                        isActuallyPlaying = true;
                    }
                }
                // А также таймер должен идти, если мы ждем между большими циклами (Loop)
                if (window.isLoopingPause) {
                    isActuallyPlaying = true;
                }
            }

            // Увеличиваем время ТОЛЬКО если система реально в активном состоянии
            if (isActuallyPlaying) {
                window.globalSessionSeconds++;
                let m = Math.floor(window.globalSessionSeconds / 60).toString().padStart(2, '0');
                let s = (window.globalSessionSeconds % 60).toString().padStart(2, '0');
                
                // Маленький таймер слева
                let el = document.getElementById('global-session-timer');
                if (el) el.innerText = `${m}:${s}`;
                
                // Большой таймер по центру
                let bigEl = document.getElementById('large-global-timer');
                if (bigEl) bigEl.innerText = `${m}:${s}`;
            }
        }, 1000);
    }
}


function pauseGlobalSessionTimer() {
    if (window.globalSessionInterval) {
        clearInterval(window.globalSessionInterval);
        window.globalSessionInterval = null;
    }
}

function resetGlobalSessionTimer() {
    pauseGlobalSessionTimer();
    window.globalSessionSeconds = 0;
    const timerEl = document.getElementById('global-session-timer');
    if (timerEl) {
        timerEl.innerText = '00:00';
        timerEl.style.display = 'none';
    }
}

            document.addEventListener("DOMContentLoaded", () => {
            
            // --- ГЕНЕРАЦИЯ ПЕРЕКЛЮЧАТЕЛЯ ЯЗЫКОВ ---
            const switcher = document.getElementById('lang-switcher');
            if (switcher) {
                const currentPath = window.location.pathname;
                const currentSearch = window.location.search; // Сохраняем все GET-параметры (?text=...)
                let ruPath, enPath;

                if (window.memoLang === 'ru') {
                    // Убираем /ru/, /r/ или /ml/ для английской версии
                    enPath = currentPath.replace(/^\/(ru|r|ml)\//, '/');
                    ruPath = currentPath;
                } else {
                    // Добавляем /ru/ для русской версии
                    ruPath = '/ru' + (currentPath === '/' ? '' : currentPath);
                    enPath = currentPath;
                }

                if (window.memoLang === 'ru') {
                    switcher.innerHTML = `
                        <a class="btn btn-sm btn-secondary rounded-pill text-decoration-none" href="${enPath + currentSearch}">en</a>
                        <span class="ms-1 me-1 text-muted fw-bold" style="font-size: 0.9rem;">ru</span>
                    `;
                } else {
                    switcher.innerHTML = `
                        <span class="ms-1 me-1 text-muted fw-bold" style="font-size: 0.9rem;">en</span>
                        <a class="btn btn-sm btn-secondary rounded-pill text-decoration-none" href="${ruPath + currentSearch}">ru</a>
                    `;
                }
            }

            
            const favBtn = document.getElementById('toggle-memo-favorite');
            const shareBtn = document.getElementById('btn_share_memo');
            const iconOutline = document.getElementById('star-outline');
            const iconSolid = document.getElementById('star-solid');
            const textInput = document.getElementById("inputText");


            if (!textInput) return;

            function getMemoData() {
                const currentText = textInput.value.trim();
                let memoSlug, memoTitle;

                if (currentText) {
                    memoSlug = "memo_" + currentText.substring(0, 50).replace(/\s+/g, '_'); 
                    memoTitle = "📝 " + currentText.substring(0, 35) + (currentText.length > 35 ? "..." : "");
                } else {
                    // Если текста нет, сохраняем как таймер медитации
                    const delaySec = parseFloat(document.getElementById("ttsDelay").value) || 0;
                    const endDelaySec = parseFloat(document.getElementById("ttsEndDelay").value) || 0;
                    const sound = document.getElementById("ttsSound").value;
                    const lc = document.getElementById("ttsLoopCount").value || "∞";
                    memoSlug = `memo_timer_d${delaySec}_e${endDelaySec}_s${sound}_lc${lc}`;
                    
                    let timeStr = "";
                    if (delaySec >= 60) {
                        const m = Math.floor(delaySec / 60);
                        const s = delaySec % 60;
                        timeStr = m + (window.memoLang === 'ru' ? ' мин' : ' min');
                        if (s > 0) timeStr += " " + s + (window.memoLang === 'ru' ? ' сек' : ' sec');
                    } else {
                        timeStr = delaySec + (window.memoLang === 'ru' ? ' сек' : ' sec');
                    }

                    // Если есть пауза в конце, добавляем инфу о ней в скобках
                    if (endDelaySec > 0) {
                        let pauseStr = "";
                        if (endDelaySec >= 60) {
                            const pm = Math.floor(endDelaySec / 60);
                            const ps = endDelaySec % 60;
                            pauseStr = pm + (window.memoLang === 'ru' ? ' мин' : ' min');
                            if (ps > 0) pauseStr += " " + ps + (window.memoLang === 'ru' ? ' сек' : ' sec');
                        } else {
                            pauseStr = endDelaySec + (window.memoLang === 'ru' ? ' сек' : ' sec');
                        }
                        
                        // Если основной интервал 0, просто называем это "Отдых", иначе берем в скобки
                        if (delaySec > 0) {
                            timeStr += (window.memoLang === 'ru' ? ' (отдых ' : ' (rest ') + pauseStr + ')';
                        } else {
                            timeStr = pauseStr;
                        }
                    }

                    memoTitle = "🧘 " + (delaySec > 0 || endDelaySec > 0 ? timeStr : "Таймер");
                }

                const params = new URLSearchParams();
                
                if (currentText) {
                    // Если текст очень длинный, сохраняем его локально (напрямую)
                    if (currentText.length > 1900) {
                        // Создаем уникальный ID на основе текста, чтобы не плодить дубликаты
                        const hash = Math.abs(currentText.split('').reduce((a,b) => (((a << 5) - a) + b.charCodeAt(0))|0, 0));
                        const storageId = "dg_memodata_" + hash;
                        localStorage.setItem(storageId, currentText);
                        params.set('saved_id', storageId); // В URL пойдет только короткий ID
                    } else {
                        params.set('text', currentText);
                    }
                }

                params.set('delay', document.getElementById("ttsDelay").value || "0");
                params.set('end', document.getElementById("ttsEndDelay").value || "0");
                params.set('trn', document.getElementById("ttsIsTranslation").checked ? "1" : "0");
                params.set('loop', document.getElementById("ttsIsLoop").checked ? "1" : "0");
                params.set('lc', document.getElementById("ttsLoopCount").value || "∞");
                params.set('snd', document.getElementById("ttsSound").value || "none");
                params.set('sep', document.getElementById("ttsDelimiter").value || "");

                return {
                    slug: memoSlug,
                    id: memoSlug,
                    title: memoTitle,
                    path: window.location.pathname,
                    search: "?" + params.toString(), 
                    timestamp: Date.now()
                };
            }

if (favBtn) {
    function updateMemoIcon() {
        const data = getMemoData();
        if (!data) return;

        const favs = JSON.parse(localStorage.getItem('dg_favorites')) || [];
        
        let existing = favs.find(f => f.slug === data.slug);
        
        // Если по текущему slug записи нет, но есть якорь редактируемого документа — ищем по якорю
        if (!existing && window.activeMemoSavedSlug) {
            existing = favs.find(f => f.slug === window.activeMemoSavedSlug);
        } else if (existing && !window.activeMemoSavedSlug) {
            // Если открыли страницу с параметрами, привязываем якорь к существующей записи
            window.activeMemoSavedSlug = existing.slug;
        }

        // Запись полностью сохранена, если совпадают и параметры, и сам slug (текст не менялся)
        const isFullySaved = existing && existing.slug === data.slug && existing.search === data.search;

        if (isFullySaved) {
            iconOutline.style.display = 'none';
            iconSolid.style.display = 'inline-block';
            favBtn.title = window.memoLang === 'ru' ? 'Удалить из избранного' : 'Remove from favorites';
            window.activeMemoSavedSlug = data.slug; // Подтверждаем якорь
        } else {
            iconOutline.style.display = 'inline-block';
            iconSolid.style.display = 'none';
            favBtn.title = window.memoLang === 'ru' ? 'Сохранить' : 'Save';
        }
    }

    // Слушатели обновлений
    window.addEventListener('favoritesUpdated', updateMemoIcon);
    window.addEventListener('storage', (e) => {
        if (e.key === 'dg_favorites') updateMemoIcon();
    });

    setTimeout(updateMemoIcon, 100);
    textInput.addEventListener('input', updateMemoIcon);
    const settingsPanel = document.getElementById('ttsSettings');
    if (settingsPanel) {
        settingsPanel.addEventListener('input', updateMemoIcon);
        settingsPanel.addEventListener('change', updateMemoIcon);
    }

    favBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const positionData = getMemoData();
        
        if (!positionData) {
            alert(window.memoLang === 'ru' ? 'Сначала введите текст!' : 'Please enter text first!');
            return;
        }

        let favs = JSON.parse(localStorage.getItem('dg_favorites')) || [];
        
        const existingIndex = favs.findIndex(f => f.slug === positionData.slug);
        let oldSlugIndex = -1;

        // Если сгенерировался новый ID, ищем индекс оригинала по якорю
        if (existingIndex === -1 && window.activeMemoSavedSlug) {
            oldSlugIndex = favs.findIndex(f => f.slug === window.activeMemoSavedSlug);
        }

        const targetIndex = existingIndex !== -1 ? existingIndex : oldSlugIndex;

        if (targetIndex !== -1) {
            const existing = favs[targetIndex];
            
            if (existing.slug === positionData.slug && existing.search === positionData.search) {
                // 1. Полное совпадение (Звезда) -> Стандартное удаление
                if (typeof toggleFavoriteGlobal === 'function') {
                    toggleFavoriteGlobal(positionData);
                    window.activeMemoSavedSlug = null; // Отвязываем якорь
                }
            } else {
                // 2. ФИНТ: Текст или настройки изменились (Дискета) -> Тихая перезапись
                const oldSlug = existing.slug;
                
                // --- ПРОВЕРКА КАСТОМНОГО ТАЙТЛА ---
                if (existing.hasCustomTitle) {
                    positionData.title = existing.title;
                    positionData.hasCustomTitle = true;
                }
                
                // Очистка старого "длинного текста" из памяти браузера (чтобы не было утечки памяти)
                if (existing.search) {
                    const oldParams = new URLSearchParams(existing.search);
                    const newParams = new URLSearchParams(positionData.search);
                    const oldSavedId = oldParams.get('saved_id');
                    const newSavedId = newParams.get('saved_id');
                    if (oldSavedId && oldSavedId !== newSavedId) {
                        localStorage.removeItem(oldSavedId);
                    }
                }

                positionData.timestamp = Date.now();
                favs.splice(targetIndex, 1); // Удаляем старую запись
                favs.unshift(positionData);  // Ставим обновленную на первое место
                localStorage.setItem('dg_favorites', JSON.stringify(favs));
                
                // Облачная синхронизация
                if (typeof syncFavoriteItemToCloud === 'function') {
                    // Если slug поменялся, обязательно удаляем старый из облака!
                    if (oldSlug !== positionData.slug) {
                        syncFavoriteItemToCloud({slug: oldSlug}, true); 
                    }
                    syncFavoriteItemToCloud(positionData, false);
                }
                
                // Только бабл об успешном сохранении
                if (typeof showBubbleNotification === 'function') {
                    showBubbleNotification(window.memoLang === 'ru' ? 'Сохранено в избранное' : 'Saved to favorites');
                }
                
                window.activeMemoSavedSlug = positionData.slug; // Обновляем якорь
                window.dispatchEvent(new CustomEvent('favoritesUpdated'));
            }
        }

        else {
            // 3. Совершенно новая запись (ничего в базе нет)
            if (typeof toggleFavoriteGlobal === 'function') {
                toggleFavoriteGlobal(positionData);
                window.activeMemoSavedSlug = positionData.slug; // Цепляем якорь к новому документу
            }
        }
    });
}

            if (shareBtn) {
                shareBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const currentText = textInput.value.trim();
                    
                    let textParamStr = "";

                    if (currentText) {
                        let textToShare = currentText;

                        // Предлагаем обрезать длинный текст для ссылки
                        if (textToShare.length > 1900) {
                            const msg = window.memoLang === 'ru' 
                                ? 'Текст слишком длинный для создания ссылки (лимит 1900 символов).\nХотите сократить его, чтобы поделиться?' 
                                : 'The text is too long for a link (limit 1900 characters).\nTruncate it to share?';
                            
                            if (confirm(msg)) {
                                textToShare = textToShare.substring(0, 1900);
                            } else {
                                return; // Пользователь отказался обрезать
                            }
                        }

                        // Текст обрабатываем вручную: оставляем кириллицу и пали как есть, 
                        // прячем только пробелы, переносы и системные символы
                        let safeText = textToShare
                            .replace(/%/g, '%25')
                            .replace(/&/g, '%26')
                            .replace(/=/g, '%3D')
                            .replace(/\+/g, '%2B')
                            .replace(/#/g, '%23')
                            .replace(/\?/g, '%3F')
                            .replace(/ /g, '%20')
                            .replace(/\n/g, '%0A')
                            .replace(/\r/g, '%0D');

                        textParamStr = "text=" + safeText + "&";
                    } else {
                        // Если текста нет, проверим, чтобы таймеры не были по нулям
                        const delaySec = parseFloat(document.getElementById("ttsDelay").value) || 0;
                        const endDelaySec = parseFloat(document.getElementById("ttsEndDelay").value) || 0;
                        if (delaySec === 0 && endDelaySec === 0) {
                            alert(window.memoLang === 'ru' ? 'Введите текст или установите время таймера!' : 'Please enter text or set timer duration!');
                            return;
                        }
                    }

                    // Генерируем URL специально для шаринга (без saved_id)
                    const params = new URLSearchParams();
                    
                    // Настройки кодируем стандартным способом
                    params.set('delay', document.getElementById("ttsDelay").value || "0");
                    params.set('end', document.getElementById("ttsEndDelay").value || "0");
                    params.set('trn', document.getElementById("ttsIsTranslation").checked ? "1" : "0");
                    params.set('loop', document.getElementById("ttsIsLoop").checked ? "1" : "0");
                    params.set('lc', document.getElementById("ttsLoopCount").value || "∞");
                    params.set('snd', document.getElementById("ttsSound").value || "none");
                    params.set('sep', document.getElementById("ttsDelimiter").value || "");

                    let origin = window.location.origin;
                    
                    // Склеиваем красивый текст (если он есть) и закодированные настройки
                    const fullUrl = origin + window.location.pathname + "?" + textParamStr + params.toString();

                    navigator.clipboard.writeText(fullUrl).then(() => {
                        if (typeof showBubbleNotification === 'function') {
                            showBubbleNotification(window.memoLang === 'ru' ? 'Ссылка скопирована!' : 'Link copied!');
                        } else {
                            alert(window.memoLang === 'ru' ? 'Ссылка скопирована!' : 'Link copied!');
                        }
                    }).catch(err => console.error('Ошибка копирования: ', err));
                });
            }
        });

        if (window.MediaMetadata) {
            const OriginalMediaMetadata = window.MediaMetadata;
            window.MediaMetadata = function(options) {
                if (options && typeof options.title === 'string' && options.title.includes('memo_custom')) {
                    const textEl = document.getElementById("inputText");
                    if (textEl && textEl.value.trim()) {
                        let text = textEl.value.trim();
                        let titleWords = text.split(/\s+/).slice(0, 5).join(' ');
                        if (text.split(/\s+/).length > 5) titleWords += '...';
                        options.title = titleWords;
                        options.artist = "Dhamma.gift Voice";
                        options.artwork = [{ src: '/assets/img/albumart-memo.png', sizes: '1024x1024', type: 'image/png' }];
                    } else {
                        options.title = window.memoLang === 'ru' ? 'Медитация' : 'Meditation Timer';
                        options.artist = "Dhamma.gift Timer";
                        options.artwork = [{ src: '/assets/img/albumart-samadhi.png', sizes: '1024x1024', type: 'image/png' }];
                    }
                }
                return new OriginalMediaMetadata(options);
            };
        }

        function expandWithAI() {
            const text = document.getElementById("inputText").value.trim();
            if (!text) return;
            const prompt = `You are an expert philologist and Tipitaka scholar. 
The provided text contains repetition markers (such as "...pe...", "...", "и т.д.", "etc."). 

1. Identify the language and the specific pattern. 
2. If it is a Dhamma sequence, recognize the list: 5 aggregates (khandhas), 6 sense bases (ayatanas), 12 links of dependent origination (nidanas), 18 elements (dhatu), 32 parts of the body, etc.
3. Expand the sequence to its full version, strictly following the grammatical rules, case endings, and style of the input language (Pali, Russian, English, etc.).
4. Replace the markers with the complete iterations.
Output ONLY the fully expanded text without any introductory or concluding remarks:

${text}`;

            const encodedPrompt = encodeURIComponent(prompt);
            const url = `https://chatgpt.com/?q=${encodedPrompt}`; 
            window.open(url, '_blank');
        }

// --- ЛОКАЛИЗАЦИЯ ИНТЕРФЕЙСА ---
window.addEventListener('DOMContentLoaded', () => {
    if (window.memoLang === 'ru') {
        document.title = 'Память и Медитация';
        document.getElementById('page_h1').innerHTML = 'Памятование и Медитация';
        document.getElementById('page_desc').innerHTML = 'Прилежно стремитесь к цели';
        
        const navReadLink = document.getElementById('nav_read_link');
        if (navReadLink) navReadLink.href = '/ru/read.php';
        
        const navSearchLink = document.getElementById('nav_search_link');
        if (navSearchLink) navSearchLink.href = '/ru/';

        document.getElementById('inputText').placeholder = 'Вставьте текст, который хотите выучить или изучить в медитации.\n\nЕсли не вводить текст, это будет таймер для медитации';
        document.getElementById('tts_header').innerText = 'Настройки голоса (TTS)';
        document.getElementById('tts_delim_label').innerText = 'Разделитель:';
        document.getElementById('tts_delay_label').innerText = 'Интервал (сек):';
        document.getElementById('tts_sound_label').innerText = 'Звук:';
        document.getElementById('tts_end_delay_label').innerText = 'Пауза в конце (сек):';
        document.getElementById('tts_sound_none').innerText = 'Ничего';
        document.getElementById('tts_trn_label').innerText = 'Перевод';
        document.getElementById('tts_loop_label').innerText = 'Цикл';
        document.getElementById('btn_play_toggle').title = 'Слушать'; 
        document.getElementById('btn_transform').innerText = 'Сжать';

        if (document.getElementById('clear_input_btn')) document.getElementById('clear_input_btn').title = 'Очистить';

        // Локализация ссылок (Пали остается без изменений)
        const linkPmOther = document.getElementById('link_pm_other');
        if (linkPmOther) {
            linkPmOther.childNodes[0].nodeValue = 'Pātimokkha на других сайтах: ';
        }

        const linkSelfcheck = document.getElementById('link_selfcheck');
        if (linkSelfcheck) {
            linkSelfcheck.childNodes[0].nodeValue = 'Самопроверка: ';
        }

        if (document.getElementById('copy_input_btn')) document.getElementById('copy_input_btn').title = 'Скопировать';
        document.getElementById('btn_settings').title = 'Настройки';
        document.getElementById('btn_reset_tts').title = 'Сбросить настройки';
        document.getElementById('link_tips').childNodes[0].nodeValue = 'Советы и хитрости заучивания ';
        document.getElementById('link_open_any').innerText = 'Открыть любую Сутту в этом режиме';
        document.getElementById('lbl_result').innerText = 'Результат:';

        document.getElementById('edit_mode_label').innerText = 'Авто-курсор';
        document.getElementById('edit_mode_label').title = 'Ставит курсор в конец текущей строки при остановке плеера';

        document.getElementById('help_text_1').innerHTML = 'Сокращайте текст до первых букв для быстрого заучивания (напр. "Sabbaṁ taṁ" → "S t").<br><b>AI Expand</b> попросить ИИ заполнить сокращенный текст (peyyāla)<br><b>TTS:</b> <b>Разделитель</b> режет текст на части. <b>Пауза</b> добавляет задержку между ними. <b>Звук</b> играет в конце. <b>Цикл</b> повторяет.';
    }

    if ('mediaSession' in navigator) {
        const container = document.getElementById('tts-virtual-container');
        if (container) {
            const observer = new MutationObserver((mutations) => {
                for (let mutation of mutations) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        const el = mutation.target;
                        if (el.classList.contains('active-word')) {
                            const activeText = el.textContent.trim();
                            if (activeText) {
                                navigator.mediaSession.metadata = new MediaMetadata({
                                    title: activeText,
                                    artist: 'Dhamma.gift Voice',
                                    artwork: [{ src: '/assets/img/albumart-memo.png', sizes: '1024x1024', type: 'image/png' }]
                                });
                            }
                        }
                    }
                }
            });
            observer.observe(container, { attributes: true, subtree: true, attributeFilter: ['class'] });
        }
    }
});


        function toggleMemoTTS() {
            if (window.isMemoPlaying) {
                stopMemoTTS(true);
            } else {
                startMemoTTS();
            }
        }

  function updatePlayButtonState(playing) {
    window.isMemoPlaying = playing;
    const btn = document.getElementById('btn_play_toggle');
    const iconPlay = document.getElementById('icon_play');
    const iconStop = document.getElementById('icon_stop');
    
    // Управление глобальным таймером и удержанием экрана
    if (playing) {
        startGlobalSessionTimer();
        if (typeof window.requestMemoWakeLock === 'function') {
            window.requestMemoWakeLock();
        }
    } else {
        pauseGlobalSessionTimer();
        if (typeof window.releaseMemoWakeLock === 'function') {
            window.releaseMemoWakeLock();
        }
    }

    if (!btn) return;

    if (playing) {
        // Обязательно удаляем btn-primary, чтобы кнопка смогла стать красной (danger)
        btn.classList.remove('btn-primary', 'btn-primary');
        btn.classList.add('btn-danger');
        btn.title = window.memoLang === 'ru' ? 'Стоп' : 'Stop';
        
        // Переключаем видимость через классы (сбрасывая inline-стили)
        if (iconPlay) {
            iconPlay.style.display = '';
            iconPlay.classList.add('d-none');
        }
        if (iconStop) {
            iconStop.style.display = '';
            iconStop.classList.remove('d-none');
        }
    } else {
        // Возвращаем в зеленый (или синий) цвет
        btn.classList.remove('btn-danger', 'btn-primary');
        btn.classList.add('btn-primary');
        btn.title = window.memoLang === 'ru' ? 'Слушать' : 'Play';
        
        if (iconPlay) {
            iconPlay.style.display = '';
            iconPlay.classList.remove('d-none');
        }
        if (iconStop) {
            iconStop.style.display = '';
            iconStop.classList.add('d-none');
        }
    }
}


        Object.defineProperty(window, 'TTS_SEGMENT_DELAY', {
            get: function() {
                const delayInput = document.getElementById("ttsDelay");
                if (!delayInput) return 0;
                
                const delaySec = parseFloat(delayInput.value) || 0;
                const delayMs = delaySec * 1000;
                
                if (delayMs > 0 && window.ttsAPI) {
                    const state = window.ttsAPI.getState();
                    const maxIndex = state.endIndex !== undefined ? state.endIndex : state.playlist.length - 1;
                    
                    if (state.speaking && !window.isLoopingPause && state.currentIndex <= maxIndex) {
                        setTimeout(() => window.startMemoVisualTimer(delayMs, ''), 0);
                    }
                }
                return delayMs;
            },
            set: function(val) {},
            configurable: true
        });

        // --- ПЕРЕХВАТЧИК АУДИО (СТРОГИЙ КОНТРОЛЬ ТАЙМЕРА) ---
        (function interceptAudioForTimer() {
            const iconSVG = `<img src="/assets/svg/hourglass-regular-full.svg" class="memo-timer-icon" alt="timer">`;
            const originalPlay = Audio.prototype.play;
            
            Audio.prototype.play = function() {
                if (this.src && this.src.includes('/assets/sounds/')) {
                    return originalPlay.apply(this, arguments);
                }

                const now = Date.now();
                if (window.memoNextAllowedTime > now) {
                    const waitTime = window.memoNextAllowedTime - now;
                    const lockIdAtRequest = window.memoLockId;
                    
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            if (lockIdAtRequest !== window.memoLockId) return resolve();
                            
                            const container = document.getElementById('dummy-ab-timer-container');
                            const span = document.getElementById('ab-btn-timer');
                            if (container && !container.classList.contains('d-none') && span) span.innerHTML = iconSVG;

                            if (window.memoCountdownInterval) clearInterval(window.memoCountdownInterval);
                            resolve(originalPlay.apply(this));
                        }, waitTime);
                    });
                }

                window.memoNextAllowedTime = 0;
                const container = document.getElementById('dummy-ab-timer-container');
                const span = document.getElementById('ab-btn-timer');
                if (container && !container.classList.contains('d-none') && span) span.innerHTML = iconSVG;

                if (window.memoCountdownInterval) clearInterval(window.memoCountdownInterval);
                
                return originalPlay.apply(this, arguments);
            };

            if (window.speechSynthesis) {
                const originalSpeak = window.speechSynthesis.speak;
                window.speechSynthesis.speak = function(utterance) {
                    const now = Date.now();
                    
                    const doSpeak = () => {
                        window.memoNextAllowedTime = 0;
                        utterance.addEventListener('start', () => {
                            const container = document.getElementById('dummy-ab-timer-container');
                            const span = document.getElementById('ab-btn-timer');
                            if (container && !container.classList.contains('d-none') && span) span.innerHTML = iconSVG;

                            if (window.memoCountdownInterval) clearInterval(window.memoCountdownInterval);
                        });
                        return originalSpeak.apply(window.speechSynthesis, [utterance]);
                    };

                    if (window.memoNextAllowedTime > now) {
                        const waitTime = window.memoNextAllowedTime - now;
                        const lockIdAtRequest = window.memoLockId;
                        
                        setTimeout(() => {
                            if (lockIdAtRequest !== window.memoLockId) return;
                            doSpeak();
                        }, waitTime);
                        return;
                    }

                    return doSpeak();
                };
            }
        })();

        // --- ВИЗУАЛЬНЫЙ ТАЙМЕР ---
window.startMemoVisualTimer = function(durationMs, textPrefix) {
    if (window.memoCountdownInterval) clearInterval(window.memoCountdownInterval);
    const container = document.getElementById('dummy-ab-timer-container');
    const span = document.getElementById('ab-btn-timer');
    
    if (container) {
        container.classList.add('active');
    }
    
    const endTime = Date.now() + durationMs;
    window.memoNextAllowedTime = endTime; 
    window.memoLockId++;
    
    const iconSVG = `<img src="/assets/svg/hourglass-regular-full.svg" class="memo-timer-icon spaced" alt="timer">`;
    
    const tick = () => {
        const left = endTime - Date.now();
        if (left <= 0) {
            clearInterval(window.memoCountdownInterval);
            if (span) span.innerHTML = `<img src="/assets/svg/hourglass-regular-full.svg" class="memo-timer-icon" alt="timer">`; 
            
            const bigCountdown = document.getElementById('large-countdown-timer');
            if (bigCountdown) bigCountdown.innerText = '00:00';
            return;
        }
        
        const mins = Math.floor(left / 60000);
        const secs = Math.floor((left % 60000) / 1000);
        
        // Формат для маленького таймера (скрывает нули минут)
        const timeStr = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}`;
        // Формат для большого таймера (всегда 00:00)
        const timeStrBig = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`; 
        
        if (span) {
            const prefixHtml = textPrefix ? `<span class="timer-prefix-text">${textPrefix}</span>` : iconSVG;
            span.innerHTML = `${prefixHtml}<span class="tabular-nums">${timeStr}</span>`;
        }
        
        const bigCountdown = document.getElementById('large-countdown-timer');
        if (bigCountdown) bigCountdown.innerText = timeStrBig;
    };
    
    tick();
    window.memoCountdownInterval = setInterval(tick, 1000);
};


        function добавитьПробелыВКонцеСтрок() {
            const ta = document.getElementById("inputText");
            if (!ta) return;
            
            const lines = ta.value.split('\n');
            let modified = false;
            
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].length > 0 && !lines[i].endsWith(' ')) {
                    lines[i] = lines[i] + ' ';
                    modified = true;
                }
            }
            
            if (modified) {
                // Запоминаем позицию курсора, чтобы он не улетал при добавлении пробелов
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                ta.value = lines.join('\n');
                ta.setSelectionRange(start, end);
                localStorage.setItem("currentMemoText", ta.value);
            }
        }

function injectBubbleStylesIfNeeded() {
    if (document.getElementById('memo-bubble-styles')) return;
    
    const bubbleStyles = document.createElement('style');
    bubbleStyles.id = 'memo-bubble-styles';
    bubbleStyles.textContent = `
      .mem-bubble {
          position: absolute;
          background: #333;
          color: #fff;
          padding: 5px 10px;
          border-radius: 6px;
          font-size: 1rem; 
          pointer-events: auto; 
          opacity: 0;
          transition: opacity 0.2s ease;
          z-index: 1050;
          white-space: nowrap;
          transform: translateY(-100%) translateY(-8px);
          box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      }
      .mem-bubble::selection {
          background: transparent;
      }
      .mem-bubble.visible {
          opacity: 1;
      }
      .mem-bubble::after {
          content: '';
          position: absolute;
          bottom: -5px;
          left: var(--arrow-x, 50%);
          transform: translateX(-50%);
          border-width: 5px 5px 0;
          border-style: solid;
          border-color: #333 transparent transparent transparent;
      }
.mem-trigger {
    cursor: pointer !important; 
    font-size: 1.4rem; 
    color: inherit; 
    text-decoration: none;
    border-bottom: 2px solid transparent; 
}

      .mem-trigger.mem-active {
          color: #20c997; 
          border-bottom-color: #20c997; 
      }
    `;
    document.head.appendChild(bubbleStyles);
}

function преобразоватьТекст() {
    injectBubbleStylesIfNeeded();
    
    добавитьПробелыВКонцеСтрок();
    const currentMemoText = document.getElementById("inputText").value;
    localStorage.setItem("currentMemoText", currentMemoText);
    const строкиСКавычками = currentMemoText.split('\n');
    const строки = строкиСКавычками.map(строка => {
        return строка.replace(/"/g, ' " ').replace(/—/g, ' — ').replace(/“/g, ' “ ').replace(/‘/g, " ‘ ").replace(/\?/g, " ? ").replace(/,/g, " , ").replace(/\./g, " . ").replace(/:/g, " : ").replace(/;/g, " ; ");
    });
    const результат = строки.map(строка => {
        const слова = строка.split(/\s+/);
        const преобразованныеСлова = слова.map(word => {
            // Исключение для чисел: оборачиваем в span для увеличения размера (как у букв)
            if (word.match(/\p{N}/u)) {
                const num = word.replace(/[^\p{N}\-]/gu, ''); 
                return `<span class="pli-lang" style="font-size: 1.4rem;">${num}</span>`; 
            }

            const перваяБуква = word.match(/^\p{L}/u); 
            if (перваяБуква) {
                const cleanWord = word.replace(/['"“‘.,!?;:—\-]/g, "");
                return `<span class="mem-trigger pli-lang" lang="pi" data-word="${cleanWord}" onclick="showBubble(this, event)" onmouseenter="handleBubbleHover(this, event)" onmouseleave="handleBubbleLeave(this, event)">${перваяБуква[0]}</span>`;
            } else {
                const диакритическиеСимволы = word.match(/^[\p{M}\p{N}\p{S}\p{P}]/u);
                return диакритическиеСимволы ? диакритическиеСимволы[0] : '';
            }
        });
        
        let финальнаяСтрока = преобразованныеСлова.join(' ')
            .replace(/ \?/g, "?")
            .replace(/“ /g, '')
            .replace(/ ,/g, ", ")
            .replace(/ \. /g, ". ")
            .replace(/ : /g, ": ")
            .replace(/ ; /g, "; ")
            .replace(/ ‘ /g, " ");
            
        // Удаляем знаки препинания (точки, запятые и т.д.) сразу после чисел 
        // (учитываем, что теперь цифра находится внутри тега </span>)
        return финальнаяСтрока.replace(/>([\d\-]+)<\/span>[.,;:]/g, '>$1</span>');
    }).join('<br>'); 

    document.getElementById("результат").innerHTML = результат;
    document.getElementById("result_header").style.display = 'flex';
    localStorage.setItem("результат", результат);
}

function очистить() {
    const msg = window.memoLang === 'ru' ? 'Это удалит текст. Уверены?' : 'This will erase the text. Sure?';
    if (confirm(msg)) {
        window.activeMemoSavedSlug = null; 
        document.getElementById("inputText").value = "";

        document.getElementById("результат").innerText = "";
        document.getElementById("result_header").style.display = 'none';
        localStorage.removeItem("currentMemoText");
        localStorage.removeItem("результат");
        
        // Если звук не сохранен жестко, ставим гонг для режима медитации
        if (!localStorage.getItem('memo_tts_sound')) {
            document.getElementById('ttsSound').value = 'gong.mp3';
        }
        
        // Прячем кнопки копирования и очистки, так как текста больше нет
        обновитьКнопкиВвода();
        
        const url = new URL(window.location.href);
        if (url.searchParams.has('text') || url.searchParams.has('saved_id')) {
            url.searchParams.delete('text');
            url.searchParams.delete('saved_id');
            window.history.replaceState({}, document.title, url.toString());
        }
    }
}

// Функция копирования текста из textarea
function копироватьПолеВвода() {
    const текст = document.getElementById("inputText").value;
    if (текст) {
        const tempTextarea = document.createElement("textarea");
        tempTextarea.value = текст;
        document.body.appendChild(tempTextarea);
        tempTextarea.select();
        document.execCommand("copy");
        document.body.removeChild(tempTextarea);
        
        if (typeof showBubbleNotification === 'function') {
            showBubbleNotification(window.memoLang === 'ru' ? 'Скопировано в буфер' : 'Copied to Clipboard');
        } else {
            alert('Скопировано');
        }
    }
}

// Функция показа/скрытия кнопок копирования и очистки
function обновитьКнопкиВвода() {
    const btnsContainer = document.getElementById("input_action_btns");
    const textInput = document.getElementById("inputText");
    if (btnsContainer && textInput) {
        // Показываем контейнер с иконками, если текст есть
        btnsContainer.style.display = textInput.value.trim() !== "" ? "flex" : "none";
    }
}

// Слушатели событий
document.addEventListener("DOMContentLoaded", () => {
    const textInput = document.getElementById("inputText");
    if (textInput) {
        textInput.addEventListener('input', () => {
            if (typeof обновитьКнопкиВвода === 'function') обновитьКнопкиВвода();
            
            // Переключаем гонг/тик на лету, если нет сохраненного выбора
            if (!localStorage.getItem('memo_tts_sound')) {
                if (!textInput.value.trim()) {
                    document.getElementById('ttsSound').value = 'gong.mp3';
                } else {
                    document.getElementById('ttsSound').value = 'tick.mp3';
                }
            }
            
            // Если текст изменился и мы не в процессе воспроизведения,
            // принудительно сносим старый кэш, чтобы плеер пересобрал его при следующем Play
            if (!window.isMemoPlaying) {
                const container = document.getElementById("tts-virtual-container");
                if (container) container.innerHTML = '';
            }
        });
    }
});


window.addEventListener('load', обновитьКнопкиВвода);

        function копироватьРезультат() {
            const результат = document.getElementById("результат").innerText;
            if (результат) {
                const tempTextarea = document.createElement("textarea");
                tempTextarea.value = результат;
                document.body.appendChild(tempTextarea);
                tempTextarea.select();
                document.execCommand("copy");
                document.body.removeChild(tempTextarea);
                
                if (typeof showBubbleNotification === 'function') {
                    showBubbleNotification(window.memoLang === 'ru' ? 'Скопировано в буфер' : 'Copied to Clipboard');
                } else {
                    alert('Скопировано');
                }
            }
        }

window.addEventListener('load', function() {
    const editToggle = document.getElementById('editModeToggle');
    if (editToggle) {
        const savedEditMode = localStorage.getItem('memo_auto_cursor');
        editToggle.checked = savedEditMode !== 'false';
        editToggle.addEventListener('change', (e) => localStorage.setItem('memo_auto_cursor', e.target.checked));
    }

    const urlParams = new URLSearchParams(window.location.search);
    let textParam = urlParams.get('text');
    const savedIdParam = urlParams.get('saved_id');

    if (savedIdParam) {
        const storedText = localStorage.getItem(savedIdParam);
        if (storedText) {
            textParam = storedText;
        }
    }
    
    const isMeditationPreset = !textParam && !savedIdParam && (urlParams.has('delay') || urlParams.has('end') || urlParams.has('snd'));
    
    if (textParam) {
        const ta = document.getElementById("inputText");
        ta.value = textParam;
        ta.setSelectionRange(0, 0); 
        localStorage.setItem("currentMemoText", textParam); 
        document.getElementById("результат").innerHTML = "";
        document.getElementById("result_header").style.display = 'none';
        if (typeof обновитьКнопкиВвода === 'function') обновитьКнопкиВвода();
    } else if (isMeditationPreset) {
        document.getElementById("inputText").value = "";
        localStorage.removeItem("currentMemoText");
        document.getElementById("результат").innerHTML = "";
        document.getElementById("result_header").style.display = 'none';
        if (typeof обновитьКнопкиВвода === 'function') обновитьКнопкиВвода();
    } else {
        const currentMemoText = localStorage.getItem("currentMemoText");
        const результат = localStorage.getItem("результат");
        
        if (currentMemoText) {
            const ta = document.getElementById("inputText");
            ta.value = currentMemoText;
            ta.setSelectionRange(0, 0); 
            if (typeof обновитьКнопкиВвода === 'function') обновитьКнопкиВвода();
        }
        if (результат && результат.trim() !== "") {
            injectBubbleStylesIfNeeded(); // Внедряем стили для восстановленного текста
            document.getElementById("результат").innerHTML = результат;
            document.getElementById("result_header").style.display = 'flex'; // Показываем заголовок Result
        }
    }

    if (urlParams.has('delay')) localStorage.setItem('dg_memo_tts_delay', urlParams.get('delay'));
    if (urlParams.has('end'))   localStorage.setItem('dg_memo_tts_end_delay', urlParams.get('end'));
    if (urlParams.has('trn'))   localStorage.setItem('dg_memo_is_translation', urlParams.get('trn') === '1');
    if (urlParams.has('loop'))  localStorage.setItem('dg_memo_tts_loop', urlParams.get('loop') === '1');
    if (urlParams.has('lc'))    localStorage.setItem('dg_memo_tts_loop_count', urlParams.get('lc'));
    if (urlParams.has('snd'))   localStorage.setItem('memo_tts_sound', urlParams.get('snd'));
    if (urlParams.has('sep'))   {
        localStorage.setItem('dg_memo_tts_delimiter', urlParams.get('sep'));
    }

    const isTrn = localStorage.getItem('dg_memo_is_translation') === 'true';
    document.getElementById('ttsIsTranslation').checked = isTrn;

    const savedDelim = localStorage.getItem('dg_memo_tts_delimiter');
    if (savedDelim !== null) document.getElementById('ttsDelimiter').value = savedDelim;

    const savedDelay = localStorage.getItem('dg_memo_tts_delay');
    if (savedDelay !== null) document.getElementById('ttsDelay').value = savedDelay;

    const savedEndDelay = localStorage.getItem('dg_memo_tts_end_delay');
    if (savedEndDelay !== null) document.getElementById('ttsEndDelay').value = savedEndDelay;

    const savedLoop = localStorage.getItem('dg_memo_tts_loop');
    const isLoop = savedLoop === null ? true : savedLoop === 'true';
    document.getElementById('ttsIsLoop').checked = isLoop;

    const savedLoopCount = localStorage.getItem('dg_memo_tts_loop_count');
    if (savedLoopCount) document.getElementById('ttsLoopCount').value = savedLoopCount;
    document.getElementById('ttsLoopCount').type = document.getElementById('ttsLoopCount').value === '∞' ? 'text' : 'number';

    const savedSound = localStorage.getItem('memo_tts_sound');
    if (savedSound) {
        document.getElementById('ttsSound').value = savedSound;
    } else {
        if (!document.getElementById("inputText").value.trim() || isMeditationPreset) {
            document.getElementById('ttsSound').value = 'gong.mp3';
        }
    }

    if (typeof toggleLoopInputVisibility === 'function') toggleLoopInputVisibility();

    if (urlParams.has('autoplay') || localStorage.getItem('ttsMode') === 'true') {
        setTimeout(() => {
            const text = document.getElementById("inputText").value.trim();
            const delaySec = parseFloat(document.getElementById("ttsDelay").value) || 0;
            const endSec = parseFloat(document.getElementById("ttsEndDelay").value) || 0;
            
            if (text !== "" || delaySec > 0 || endSec > 0) {
                if (!window.isMemoPlaying && typeof startMemoTTS === 'function') {
                    startMemoTTS();
                }
            }
        }, 1000); 
    }
});

        function toggleLoopInputVisibility() {
            const loopInput = document.getElementById('ttsLoopCount');
            const isLoopChecked = document.getElementById('ttsIsLoop').checked;
            loopInput.style.display = isLoopChecked ? 'inline-block' : 'none';
        }

        document.getElementById('ttsIsTranslation').addEventListener('change', (e) => {
            localStorage.setItem('dg_memo_is_translation', e.target.checked);
            stopMemoTTS(true);
        });
        document.getElementById('ttsDelimiter').addEventListener('input', (e) => {
            localStorage.setItem('dg_memo_tts_delimiter', e.target.value);
            stopMemoTTS(true);
        });
        document.getElementById('ttsSound').addEventListener('change', (e) => localStorage.setItem('memo_tts_sound', e.target.value));
        
        document.getElementById('ttsDelay').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) || 0;
            localStorage.setItem('dg_memo_tts_delay', val);
            window.TTS_SEGMENT_DELAY = val * 1000;
        });

        document.getElementById('ttsEndDelay').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) || 0;
            localStorage.setItem('dg_memo_tts_end_delay', val);
        });

        document.getElementById('ttsIsLoop').addEventListener('change', (e) => {
            localStorage.setItem('dg_memo_tts_loop', e.target.checked);
            toggleLoopInputVisibility();
        });

        const loopCountInput = document.getElementById('ttsLoopCount');
        loopCountInput.addEventListener('focus', (e) => {
            if (e.target.value === '∞') { e.target.type = 'number'; e.target.value = '0'; }
        });
        loopCountInput.addEventListener('blur', (e) => {
            if (e.target.value === '0' || e.target.value.trim() === '') {
                e.target.type = 'text'; e.target.value = '∞';
            }
            localStorage.setItem('dg_memo_tts_loop_count', e.target.value);
        });

        window.mockPaliJson = {};
        const originalFetch = window.fetch;
        window.fetch = async function() {
            const url = arguments[0];
            if (typeof url === 'string' && url.includes('memo_custom_rootd-pli-ms.json')) {
                return new Response(JSON.stringify(window.mockPaliJson), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            return originalFetch.apply(this, arguments);
        };

function runMeditationCycle() {
    if (!window.isMemoPlaying) return; 

    if (window.ttsAPI && window.ttsAPI.keepSilenceAlive) {
        window.ttsAPI.keepSilenceAlive(true);
    }
    
    if ('mediaSession' in navigator) {
        setTimeout(() => {
            navigator.mediaSession.metadata = new MediaMetadata({ title: 'memo_custom' });
        }, 50);
    }

    const soundChoice = document.getElementById('ttsSound').value;
    const isLoop = document.getElementById('ttsIsLoop').checked;
    const loopInput = document.getElementById('ttsLoopCount').value;
    let targetLoops = loopInput === '∞' ? Infinity : parseInt(loopInput) || Infinity;

    const delaySec = parseFloat(document.getElementById("ttsDelay").value) || 0;
    const endDelaySec = parseFloat(document.getElementById("ttsEndDelay").value) || 0;
    
    // Основное время медитации
    const mainPauseMs = delaySec * 1000; 
    // Время отдыха ПОСЛЕ гонга (имеет смысл в основном для циклов)
    const restPauseMs = endDelaySec * 1000;

    if (mainPauseMs <= 0 && restPauseMs <= 0) {
        alert(window.memoLang === 'ru' ? 'Установите время таймера' : 'Set timer duration');
        stopMemoTTS(true);
        return;
    }

    // Если Интервал = 0, но есть Пауза, используем Паузу как основное время (для защиты от дурака)
    const activeTimeMs = mainPauseMs > 0 ? mainPauseMs : restPauseMs;
    const lCycle = window.memoLang === 'ru' ? 'Медитация' : 'Meditation';
    
    // Запускаем визуальный таймер до гонга
    window.startMemoVisualTimer(activeTimeMs, lCycle);

    window.memoRestartTimeout = setTimeout(() => {
        if (!window.isMemoPlaying) return;
        
        // ЗВУЧИТ ГОНГ (Конец основной сессии) через глобальный плеер
        window.playMemoSound(soundChoice);

        window.memoLoopsPlayed++;

        // Если это цикл и лимит еще не исчерпан
        if (isLoop && window.memoLoopsPlayed < targetLoops) {
            
            // Если есть пауза после гонга, ждем её перед новым циклом
            if (restPauseMs > 0 && mainPauseMs > 0) {
                const lRest = window.memoLang === 'ru' ? 'Отдых' : 'Rest';
                window.startMemoVisualTimer(restPauseMs, lRest);
                
                // Внутренний таймаут на время отдыха
                window.memoLoopTimeout = setTimeout(() => {
                    if (!window.isMemoPlaying) return;
                    runMeditationCycle(); // Начинаем новый цикл
                }, restPauseMs);
            } else {
                // Если паузы нет, сразу начинаем новый цикл
                runMeditationCycle();
            }
            
        } else {
            // Если циклы закончились или выключены
            stopMemoTTS(true);
        }
    }, activeTimeMs);
}

function startMemoTTS(isRestart = false) {
    добавитьПробелыВКонцеСтрок();
    if (isRestart !== true) {
        resetGlobalSessionTimer();
        window.memoLoopsPlayed = 0;
        if (window.memoCountdownInterval) clearInterval(window.memoCountdownInterval);
        const container = document.getElementById('dummy-ab-timer-container');
        if (container) {
            container.classList.remove('active');
            const span = document.getElementById('ab-btn-timer');
            if (span) span.innerHTML = '';
        }
    }

    // Снимаем блокировку с глобального плейера звуков таймера для iOS
    if (!window.sharedMemoAudio) {
        window.sharedMemoAudio = new Audio();
    }
    window.sharedMemoAudio.src = 'data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
    window.sharedMemoAudio.play().catch(() => {});

    updatePlayButtonState(true); 

    const settingsPanel = document.getElementById('ttsSettings');
    if (settingsPanel && settingsPanel.classList.contains('show')) {
        const bsCollapse = bootstrap.Collapse.getInstance(settingsPanel);
        if (bsCollapse) bsCollapse.hide();
        else settingsPanel.classList.remove('show');
    }

    let text = document.getElementById("inputText").value.trim();

    // ===== РЕЖИМ ТАЙМЕРА С БОЛЬШИМ ИНТЕРФЕЙСОМ =====
    if (!text) {
        const container = document.getElementById("tts-virtual-container");
        container.style.display = 'block';
        
        let m = Math.floor(window.globalSessionSeconds / 60).toString().padStart(2, '0');
        let s = (window.globalSessionSeconds % 60).toString().padStart(2, '0');
        
        const titleGlobal = window.memoLang === 'ru' ? 'Общее время' : 'Total Time';
        const titleNext = window.memoLang === 'ru' ? 'До гонга' : 'Next Bell';

        // Рисуем крупные цифры и якорь для скролла
        container.innerHTML = `
            <div id="meditation-anchor" class="timer-mode-display">
                <div class="timer-title-small">${titleGlobal}</div>
                <div id="large-global-timer" class="text-muted">${m}:${s}</div>
                
                <div class="timer-subtitle-small">${titleNext}</div>
                <div id="large-countdown-timer">${titleNext === 'До гонга' ? '--:--' : '--:--'}</div>
            </div>
        `;
        
        // Скролл к таймеру
        setTimeout(() => {
            const anchor = document.getElementById('meditation-anchor');
            if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);

        document.body.classList.add('body-tts-active');
        
        startGlobalSessionTimer();
        runMeditationCycle();
        return; 
    }
    // ===============================================

    let detectedLang = 'en'; 
    if (/[а-яА-ЯёЁ]/.test(text)) detectedLang = 'ru'; 
    else if (/[\u0E00-\u0E7F]/.test(text)) detectedLang = 'th'; 
    window.memoDetectedTrnLang = detectedLang; 

    let rawDelim = document.getElementById("ttsDelimiter").value;
    rawDelim = rawDelim.replace(/\\n/g, '\n'); 
    
    let segments = [text];
    if (rawDelim) {
        for (let char of rawDelim) {
            let newSegments = [];
            for (let seg of segments) {
                newSegments.push(...seg.split(char));
            }
            segments = newSegments;
        }
    }
    segments = segments.map(s => s.trim()).filter(s => s.length > 0);

    if (segments.length === 0) {
        updatePlayButtonState(false);
        return;
    }

    // === ТОЧНЫЙ АВТО-КУРСОР: ПОИСК СЕГМЕНТА ===
    let cursorIndex = 0;
    const ta = document.getElementById("inputText");
    const editToggle = document.getElementById('editModeToggle');
    
    if (editToggle && editToggle.checked && !isRestart && ta) {
        const cursorStart = ta.selectionStart;
        const textBeforeCursor = ta.value.substring(0, cursorStart);
        
        let beforeSegments = [textBeforeCursor];
        if (rawDelim) {
            for (let char of rawDelim) {
                let newSegments = [];
                for (let seg of beforeSegments) {
                    newSegments.push(...seg.split(char));
                }
                beforeSegments = newSegments;
            }
        }
        
        const nonEmptyBefore = beforeSegments.filter(s => s.trim().length > 0);
        cursorIndex = Math.max(0, nonEmptyBefore.length - 1);
        window.memoPendingCursorIndex = cursorIndex;
    } else {
        window.memoPendingCursorIndex = 0;
    }

    if (!window.memoCursorListenerAdded) {
        document.addEventListener('tts-playback-started', () => {
            if (window.memoPendingCursorIndex !== undefined && window.memoPendingCursorIndex !== -1 && window.ttsAPI) {
                const state = window.ttsAPI.getState();
                state.currentIndex = window.memoPendingCursorIndex;
                state.startIndex = 0;
                if (state.playlist) state.endIndex = state.playlist.length - 1;
                window.memoPendingCursorIndex = -1;
            }
        });
        window.memoCursorListenerAdded = true;
    }
    // ===========================================

    const delaySec = parseFloat(document.getElementById("ttsDelay").value) || 0;
    window.TTS_SEGMENT_DELAY = delaySec * 1000;
    window.isLoopingPause = false;

    // Галочка обязательна только для латиницы (отличить English от Pali).
    // Если алфавит кириллица или тайский — это 100% перевод, игнорируем галочку.
    const isTranslationCheckbox = document.getElementById("ttsIsTranslation").checked;
    const isTranslation = isTranslationCheckbox || detectedLang === 'ru' || detectedLang === 'th';

    const container = document.getElementById("tts-virtual-container");
    
    if (!container.innerHTML) {
        container.style.display = 'block'; 
        window.mockPaliJson = {}; 
        
        segments.forEach((seg, index) => {
            const id = `memo_custom:1.${index+1}`; 
            const span = document.createElement('span');
            span.id = id;
            span.className = 'tts-word';

            if (index === cursorIndex) {
                span.classList.add('active-word');
            }
            
            if (/[\u0900-\u097F]/.test(seg)) {
                span.classList.add('pli-lang');
                span.textContent = seg;
                window.mockPaliJson[id] = "“" + seg + "”"; 
            } else {
                if (isTranslation) {
                    if (detectedLang === 'ru') span.classList.add('rus-lang');
                    else if (detectedLang === 'th') span.classList.add('tha-lang');
                    else span.classList.add('eng-lang');
                    span.textContent = seg;
                } else {
                    span.classList.add('pli-lang');
                    span.textContent = seg; 
                    window.mockPaliJson[id] = "“" + (window.convertPaliToDevanagari ? window.convertPaliToDevanagari(seg) : seg) + "”"; 
                }
            }
            container.appendChild(span);
        });

        window.detectTranslationLang = function() {
            return window.memoDetectedTrnLang;
        };

        // --- ЖЕСТКИЙ ПЕРЕХВАТ КОНТЕКСТА ДЛЯ GOOGLE TTS ---
        window.getContextInfo = function() {
            if (window.memoDetectedTrnLang === 'ru') {
                return {
                    type: 'ru',
                    storageKey: 'tts_google_trn_ru',
                    defaultConfig: { languageCode: 'ru-RU', name: 'ru-RU-Standard-D' },
                    isIndianContext: false
                };
            } else if (window.memoDetectedTrnLang === 'th') {
                return {
                    type: 'th',
                    storageKey: 'tts_google_trn_th',
                    defaultConfig: { languageCode: 'th-TH', name: 'th-TH-Standard-A' },
                    isIndianContext: false
                };
            }
            return {
                type: 'en',
                storageKey: 'tts_google_trn_en',
                defaultConfig: { languageCode: 'en-US', name: 'en-US-Standard-D' },
                isIndianContext: false
            };
        };
        // --------------------------------------------------

    } // Конец условия if (!container.innerHTML)

    const targetMode = isTranslation ? 'trn' : 'pi';
    localStorage.setItem('tts_preferred_mode', targetMode);
    const modeSelect = document.getElementById('tts-mode-select');
    if (modeSelect) modeSelect.value = targetMode;

    document.getElementById('hiddenVoiceLink').click();

    document.body.classList.add('body-tts-active');
}


function stopMemoTTS(fullReset = true) {
      
            добавитьПробелыВКонцеСтрок();
            const editToggle = document.getElementById('editModeToggle');
            const ta = document.getElementById("inputText");
            
            // Исключение: если текстареа сейчас в фокусе, курсор не трогаем
            const isFocused = (document.activeElement === ta);

            if (editToggle && editToggle.checked && window.ttsAPI && ta && !isFocused) {
                const state = window.ttsAPI.getState();
                const spans = document.getElementById("tts-virtual-container")?.children;
                
                if (state && spans && spans[state.currentIndex]) {
                    let searchPos = 0;
                    for (let i = 0; i <= state.currentIndex; i++) {
                        const txt = spans[i].textContent;
                        let matchPos = ta.value.indexOf(txt, searchPos);
                        
                        if (i === state.currentIndex && matchPos !== -1) {
                            ta.focus();
                            
                            // ИСПРАВЛЕНИЕ: Ищем конец текущей строки
                            let endOfLinePos = ta.value.indexOf('\n', matchPos);
                            if (endOfLinePos === -1) {
                                endOfLinePos = ta.value.length; // Если это последняя строка текста
                            }
                            
                            // Ставим курсор в самый конец строки (после точки и пробела)
                            ta.setSelectionRange(endOfLinePos, endOfLinePos);
                            
                            // Мягкий скролл к курсору
                            const scrollRatio = endOfLinePos / ta.value.length;
                            ta.scrollTop = ta.scrollHeight * scrollRatio - (ta.clientHeight / 2);
                        }
                        if (matchPos !== -1) searchPos = matchPos + txt.length;
                    }
                }
            }
      

    if (window.ttsAPI && window.ttsAPI.keepSilenceAlive) {
        window.ttsAPI.keepSilenceAlive(false);
    }
      
            updatePlayButtonState(false); 
            window.isLoopingPause = false;
            
            window.memoNextAllowedTime = 0; 
            window.memoLockId++;
            
            if (window.ttsAPI) {
                if (fullReset) {
                    const state = window.ttsAPI.getState();
                    state.currentIndex = 0; 
                }
                if (window.ttsAPI.stop) window.ttsAPI.stop();
            }
            
            if (fullReset) {
                resetGlobalSessionTimer();

                const container = document.getElementById("tts-virtual-container");
                if (container) {
                    container.innerHTML = '';
                    container.style.display = 'none';
                }
                document.body.classList.remove('body-tts-active');

                localStorage.removeItem('dg_tts_last_slug');
                localStorage.removeItem('dg_tts_last_index');
            }

            if (window.memoCountdownInterval) {
                clearInterval(window.memoCountdownInterval);
                window.memoCountdownInterval = null;
            }
            if (window.memoLoopTimeout) clearTimeout(window.memoLoopTimeout);
            if (window.memoRestartTimeout) clearTimeout(window.memoRestartTimeout);

            const container = document.getElementById('dummy-ab-timer-container');
            if (container) {
                container.classList.remove('active');
                const span = document.getElementById('ab-btn-timer');
                if (span) span.innerHTML = '';
            }
            
            window.memoLoopsPlayed = 0;
        }

document.addEventListener('tts-range-finished', () => {
    const isLoop = document.getElementById('ttsIsLoop').checked;
    const soundChoice = document.getElementById('ttsSound').value;
    const delaySec = parseFloat(document.getElementById("ttsDelay").value) || 0;
    const intervalMs = delaySec * 1000;
    
    window.isLoopingPause = true;

    if (!isLoop) {
        window.playMemoSound(soundChoice);
        stopMemoTTS(true); 
        return;
    }

    const loopInput = document.getElementById('ttsLoopCount').value;
    let targetLoops = loopInput === '∞' ? Infinity : parseInt(loopInput) || Infinity;
    window.memoLoopsPlayed = (window.memoLoopsPlayed || 0) + 1;

    if (window.memoLoopsPlayed >= targetLoops) {
        window.playMemoSound(soundChoice);
        stopMemoTTS(true); 
        return;
    }

    const endDelaySec = parseFloat(document.getElementById("ttsEndDelay").value) || 10;
    const FIXED_PAUSE = endDelaySec * 1000; 
    const lCycle = window.memoLang === 'ru' ? 'Конец.' : 'End.';

    const startLoopRestart = () => {
        if (FIXED_PAUSE > 0) {
            window.startMemoVisualTimer(FIXED_PAUSE, lCycle);
            window.memoRestartTimeout = setTimeout(() => {
                const container = document.getElementById("tts-virtual-container");
                if (container.style.display === 'none' || !document.getElementById('ttsIsLoop').checked) return;
                startMemoTTS(true); 
            }, FIXED_PAUSE);
        } else {
            const container = document.getElementById("tts-virtual-container");
            if (container.style.display === 'none' || !document.getElementById('ttsIsLoop').checked) return;
            startMemoTTS(true); 
        }
    };

    if (intervalMs > 0) {
        window.startMemoVisualTimer(intervalMs, '');
        window.memoLoopTimeout = setTimeout(() => {
            window.playMemoSound(soundChoice);
            startLoopRestart();
        }, intervalMs);
    } else {
        window.playMemoSound(soundChoice);
        startLoopRestart();
    }
});


        document.addEventListener('click', (e) => {
            window.memoNextAllowedTime = 0; 
            window.memoLockId++; 
            
            const playMainBtn = e.target.closest('.play-main-button');
            const closeMainBtn = e.target.closest('.close-tts-btn');
            
            if (playMainBtn) {
                const container = document.getElementById("tts-virtual-container");
                if (!container || container.innerHTML === '') {
                    e.preventDefault();
                    e.stopPropagation();
                    startMemoTTS();
                }
                // Логику ручной паузы таймера отсюда удалили!
                // Теперь setInterval сам читает состояние плеера ttsState.paused
            }
            
            if (closeMainBtn) {
                stopMemoTTS(true); 
                resetGlobalSessionTimer(); 
            }
        }, { capture: true }); 

window.resetTTSSettings = function() {
    const msg = window.memoLang === 'ru' ? 'Сбросить настройки и восстановить  текст по умолчанию?' : 'Reset settings and replace the defailt text?';
    if (confirm(msg)) {
        document.getElementById('ttsDelimiter').value = '.,:;?!—…|\\n';
        document.getElementById('ttsDelay').value = '2';
        document.getElementById('ttsSound').value = 'tick.mp3';
        document.getElementById('ttsEndDelay').value = '10';
        document.getElementById('ttsIsTranslation').checked = false;
        document.getElementById('ttsIsLoop').checked = true;
        
        const loopInput = document.getElementById('ttsLoopCount');
        loopInput.type = 'text';
        loopInput.value = '∞';
        
        toggleLoopInputVisibility();
        
        // Очищаем localStorage от настроек
        localStorage.removeItem('dg_memo_tts_delimiter');
        localStorage.removeItem('dg_memo_tts_delay');
        localStorage.removeItem('memo_tts_sound');
        localStorage.removeItem('dg_memo_tts_end_delay');
        localStorage.setItem('dg_memo_is_translation', 'false'); 
        localStorage.removeItem('dg_memo_tts_loop');
        localStorage.removeItem('dg_memo_tts_loop_count');
        
        window.TTS_SEGMENT_DELAY = 2000;

        // Восстанавливаем дефолтный текст
        const defaultText = "atthi imasmiṁ kāye kesā lomā nakhā dantā \ntaco maṁsaṁ nhāru aṭṭhi aṭṭhimiñjaṁ \nvakkaṁ hadayaṁ yakanaṁ kilomakaṁ pihakaṁ papphāsaṁ antaṁ antaguṇaṁ udariyaṁ karīsaṁ \npittaṁ semhaṁ pubbo lohitaṁ sedo medo assu vasā kheḷo siṅghāṇikā lasikā muttanti |";
        document.getElementById("inputText").value = defaultText;
        localStorage.removeItem("currentMemoText");
        
        // Скрываем блок результатов
        document.getElementById("результат").innerText = "";
        document.getElementById("result_header").style.display = 'none';
        localStorage.removeItem("результат");
        
        // Обновляем UI
        if (typeof обновитьКнопкиВвода === 'function') обновитьКнопкиВвода();
        window.activeMemoSavedSlug = null;
        
        // Очищаем адресную строку от параметров (например, ?delay=0&snd=gong)
        const url = new URL(window.location.href);
        if (url.searchParams.toString()) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        stopMemoTTS(true);
    }
};


        // Инъекция таймеров в плеер через MutationObserver (оптимизированный подход)
        const playerObserver = new MutationObserver((mutations) => {
            const mainRow = document.querySelector('.tts-main-row');
            if (mainRow) {
                if (mainRow.style.position !== 'relative') {
                    mainRow.style.position = 'relative'; 
                }

                // 1. Вставляем локальный таймер (справа)
                if (!document.getElementById('dummy-ab-timer-container')) {
                    const timerContainer = document.createElement('div');
                    timerContainer.id = 'dummy-ab-timer-container';
                    timerContainer.className = 'dummy-ab-timer-container';
                    timerContainer.innerHTML = `<span id="ab-btn-timer" class="tabular-nums"></span>`;
                    mainRow.appendChild(timerContainer);
                }

                // 2. Вставляем глобальный таймер (слева)
                const globalTimer = getOrCreateGlobalTimer();
                if (globalTimer.parentNode !== mainRow) {
                    mainRow.appendChild(globalTimer);
                }
            }
        });

        // Наблюдаем за DOM. Скрипт сработает только тогда, когда плеер реально появится или изменится
        playerObserver.observe(document.body, { childList: true, subtree: true });
        
// === ДИНАМИЧЕСКИЙ ЗАГОЛОВОК СТРАНИЦЫ (TITLE) ===
function updatePageTitle() {
    const textInput = document.getElementById("inputText");
    if (!textInput) return;

    const text = textInput.value.trim();
    const defaultTitle = window.memoLang === 'ru' ? 'Память и Медитация' : 'Memorize & Meditate';

    if (text) {
        const words = text.split(/\s+/);
        // Берем первые 4 слова
        const titleWords = words.slice(0, 4).join(' '); 
        document.title = titleWords + (words.length > 4 ? '...' : '');
    } else {
        document.title = defaultTitle;
    }
}

// Вешаем слушатель на ввод текста
document.addEventListener("DOMContentLoaded", () => {
    const textInput = document.getElementById("inputText");
    if (textInput) {
        textInput.addEventListener('input', updatePageTitle);
    }
});

// Обновляем заголовок после того, как отработают скрипты загрузки текста из кэша или URL
window.addEventListener('load', () => {
    setTimeout(updatePageTitle, 150);
});


async function downloadMemoAudio() {
    const apiKey = localStorage.getItem('tts_google_key') || window.TRIAL_KEY;
    if (!apiKey || apiKey.length < 10) {
        const msg = window.memoLang === 'ru' 
            ? "Для скачивания аудиофайла требуется активный API-ключ Google TTS." 
            : "An active Google TTS API key is required to download the audio file.";
        alert(msg);
        return;
    }

    const btn = document.getElementById('btn_download_audio');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '...';
    btn.disabled = true;

    try {
        const text = document.getElementById('inputText').value;
        const delimiterInput = document.getElementById('ttsDelimiter').value || '\n';
        const delay = parseFloat(document.getElementById('ttsDelay').value) || 2;
        const endDelay = parseFloat(document.getElementById('ttsEndDelay').value) || 10;
        const soundChoice = document.getElementById('ttsSound').value;
        
        // Одноразовое сообщение о лимите пауз Google TTS (сохраняется в памяти браузера)
        if (!localStorage.getItem('googleTTSAlertShown')) {
            const limitMsg = window.memoLang === 'ru' 
                ? "Обратите внимание: При сохранении в файл Google TTS не пропускает паузы длительностью более 10 секунд." 
                : "Please note: When exporting to audiofile Google TTS does not allow pauses longer than 10 seconds.";
            alert(limitMsg);
            localStorage.setItem('googleTTSAlertShown', 'true');
        }

        // 1. АВТООПРЕДЕЛЕНИЕ ЯЗЫКА
        let detectedLang = 'en'; 
        if (/[а-яА-ЯёЁ]/.test(text)) detectedLang = 'ru'; 
        else if (/[\u0E00-\u0E7F]/.test(text)) detectedLang = 'th'; 

        const isTranslationCheckbox = document.getElementById("ttsIsTranslation").checked;
        const isTranslation = isTranslationCheckbox || detectedLang === 'ru' || detectedLang === 'th';

        let targetConfig, rate;

        // 2. ПОДБОР ГОЛОСА И СКОРОСТИ
        if (isTranslation) {
            let storageKey, defaultConfig;
            if (detectedLang === 'ru') {
                storageKey = 'tts_google_trn_ru';
                defaultConfig = { languageCode: 'ru-RU', name: 'ru-RU-Standard-D' };
            } else if (detectedLang === 'th') {
                storageKey = 'tts_google_trn_th';
                defaultConfig = { languageCode: 'th-TH', name: 'th-TH-Standard-A' };
            } else {
                storageKey = 'tts_google_trn_en';
                defaultConfig = { languageCode: 'en-US', name: 'en-US-Standard-D' };
            }
            
            targetConfig = defaultConfig;
            const savedTrn = localStorage.getItem(storageKey);
            if (savedTrn) { try { targetConfig = JSON.parse(savedTrn); } catch (e) {} }
            rate = parseFloat(localStorage.getItem('tts_rate_trn')) || 1.0;
        } else {
            targetConfig = { languageCode: 'pa-IN', name: 'pa-IN-Chirp3-HD-Achird' };
            const savedPali = localStorage.getItem('tts_google_pali_custom_voice');
            if (savedPali) { try { targetConfig = JSON.parse(savedPali); } catch (e) {} }
            rate = parseFloat(localStorage.getItem('tts_rate_pali')) || 1.0;
        }

        const escapeXml = (unsafe) => {
            return unsafe.replace(/[<>&'"]/g, function (c) {
                switch (c) {
                    case '<': return '&lt;'; case '>': return '&gt;';
                    case '&': return '&amp;'; case '\'': return '&apos;'; case '"': return '&quot;';
                }
            });
        };

        const escapedDelimiter = delimiterInput.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&').replace(/\\n/g, '\n');
        const regex = new RegExp(`[${escapedDelimiter}]+`, 'g');
        const segments = text.split(regex).map(s => s.trim()).filter(s => s.length > 0);
        
        if (segments.length === 0) throw new Error(window.memoLang === 'ru' ? "Нет текста для озвучивания." : "No text to synthesize.");

        const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
        let mp3Chunks = [];

        const fetchAudioChunk = async (ssmlText) => {
            const payload = {
                input: { ssml: `<speak>${ssmlText}</speak>` },
                voice: { languageCode: targetConfig.languageCode, name: targetConfig.name },
                audioConfig: { audioEncoding: 'MP3', speakingRate: rate }
            };
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            const binaryString = window.atob(data.audioContent);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            mp3Chunks.push(bytes);
        };

        // 3. РАЗБИВКА НА ЧАНКИ (Обход лимита 5000 байт)
        let currentSsmlInner = "";
        
        for (let i = 0; i < segments.length; i++) {
            let textToSpeak = segments[i];
            
            if (!isTranslation) {
                if (window.convertPaliToDevanagari) textToSpeak = window.convertPaliToDevanagari(textToSpeak);
                
                // --- ФИКС ПАЛИ ---
                textToSpeak = textToSpeak.replace(/फ/g, 'प्ह'); // ph -> f
                textToSpeak = textToSpeak.replace(/ज([िी])र/g, 'ज्ज$1र'); // jira -> zira
                
                const C = '[\u0915-\u0939\u0933]'; 
                const B = '(?=\\s|[।,:;.?!\"]|$)';
                textToSpeak = textToSpeak.replace(new RegExp(`(${C})${B}`, 'g'), '$1ा');
                textToSpeak = textToSpeak.replace(new RegExp(`(${C})ि${B}`, 'g'), '$1ी');
                textToSpeak = textToSpeak.replace(new RegExp(`(${C})ु${B}`, 'g'), '$1ू');
                textToSpeak = textToSpeak.replace(/न(?![ािीुूेोृॄॢॣंःँ्])/g, 'ना');
                textToSpeak = textToSpeak.replace(/म(?![ािीुूेोृॄॢॣंःँ्])/g, 'मा');
                textToSpeak = textToSpeak.replace(/ो$/g, 'ोो');
                textToSpeak = textToSpeak.replace(/ं(?=\s|[।,:;.?!\"]|$)/g, 'ङ्');
                // -----------------
            }

            let segmentSsml = escapeXml(textToSpeak);
            
            if (i < segments.length - 1) {
                segmentSsml += `<break time="${delay}s"/>`;
            }

            if (currentSsmlInner.length + segmentSsml.length > 4500) {
                if (currentSsmlInner.length > 0) {
                    await fetchAudioChunk(currentSsmlInner);
                    currentSsmlInner = "";
                }
            }
            
            currentSsmlInner += segmentSsml;
        }

        // 4. ДОБАВЛЕНИЕ ГОНГА И ФИНАЛЬНОЙ ПАУЗЫ
        if (soundChoice !== 'none') {
            const originUrl = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1') ? 'https://dhamma.gift' : window.location.origin;
            const soundUrl = `${originUrl}/assets/sounds/${soundChoice}`;
            currentSsmlInner += `<audio src="${soundUrl}"></audio>`;
        }

        if (endDelay > 0) {
            currentSsmlInner += `<break time="${endDelay}s"/>`;
        }

        if (currentSsmlInner.length > 0) {
            await fetchAudioChunk(currentSsmlInner);
        }

        // 5. ФОРМИРОВАНИЕ ИМЕНИ ФАЙЛА И СКАЧИВАНИЕ
        const blob = new Blob(mp3Chunks, { type: 'audio/mp3' });
        const downloadUrl = URL.createObjectURL(blob);
        
        let fileName = "meditation";
        const cleanText = text.trim().replace(/[\/\\?%*:|"<>.,;!—]/g, ''); 
        if (cleanText) {
            fileName = cleanText.split(/\s+/).slice(0, 4).join('_');
        }
        
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${fileName}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

    } catch (e) {
        console.error(e);
        const errMsg = window.memoLang === 'ru' ? "Ошибка при создании аудиофайла: " : "Error creating audio file: ";
        alert(errMsg + e.message);
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

let hoverTimeout;
let lastMemoTouchTime = 0;

// Глобальный перехват тапов (работает везде: смартфоны, планшеты, ПК с тачскрином)
document.addEventListener('touchstart', () => {
    lastMemoTouchTime = Date.now();
}, { capture: true, passive: true });

window.showBubble = function(element, event, isHover = false) {
    if (event) event.stopPropagation();

    const now = Date.now();
    // Считаем, что устройство сенсорное, если касание было менее 500мс назад
    const isTouch = (now - lastMemoTouchTime < 500);

    if (element.classList.contains('mem-active')) {
        if (isHover) {
            clearTimeout(hoverTimeout);
            return; 
        } else {
            // Если бабл уже активен и мы по нему кликаем/тапаем:
            // Защита от системных двойных кликов (игнорируем, если бабл открыт только что)
            const openedAt = parseInt(element.dataset.openedAt || '0', 10);
            if (isTouch && (now - openedAt < 300)) {
                return; 
            }

            const existingBubble = document.querySelector('.mem-bubble');
            if (existingBubble) {
                existingBubble.dataset.pinned = "true";
                
                // Программное выделение текста и вызов словаря
                const range = document.createRange();
                range.selectNodeContents(existingBubble);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);

                const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
                const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                
                existingBubble.dispatchEvent(mouseUpEvent);
                existingBubble.dispatchEvent(clickEvent);

                return; 
            }
        }
    }

    // Блокируем фантомный hover (onmouseenter) от тачскрина
    if (isHover && isTouch) {
        return;
    }

    window.removeBubbles(); 

    const word = element.getAttribute('data-word');
    if (!word) return;

    element.classList.add('mem-active');
    element.dataset.openedAt = now.toString();

    const bubble = document.createElement('div');
    bubble.className = 'mem-bubble tts-ignore pli-lang';
    bubble.dataset.pinned = isHover ? "false" : "true";
    bubble.setAttribute('lang', 'pi');

    const parentSegment = element.closest('[id]');
    if (parentSegment) {
        bubble.dataset.segmentId = parentSegment.id;
    }

    bubble.innerText = word;

    bubble.addEventListener('mouseenter', () => { clearTimeout(hoverTimeout); });
    bubble.addEventListener('mouseleave', () => {
        if (bubble.dataset.pinned === "false") {
            window.removeBubbles();
        }
    });

    document.body.appendChild(bubble);

    const rect = element.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect(); 
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const windowWidth = window.innerWidth;
    
    const triggerCenter = rect.left + (rect.width / 2);
    let leftPos = triggerCenter - (bubbleRect.width / 2);
    
    const padding = 10; 

    if (leftPos < padding) leftPos = padding;
    if (leftPos + bubbleRect.width > windowWidth - padding) leftPos = windowWidth - bubbleRect.width - padding;

    bubble.style.left = (leftPos + scrollX) + 'px';
    bubble.style.top = (rect.top + scrollY) + 'px';

    const arrowX = triggerCenter - leftPos;
    bubble.style.setProperty('--arrow-x', arrowX + 'px');

    requestAnimationFrame(() => {
        bubble.classList.add('visible');
    });
};

window.handleBubbleHover = function(element, event) {
    window.showBubble(element, event, true);
};

window.handleBubbleLeave = function(element, event) {
    const isTouch = (Date.now() - lastMemoTouchTime < 500);
    // Игнорируем фантомный уход мыши от тачскрина
    if (isTouch) return;

    hoverTimeout = setTimeout(() => {
        const bubble = document.querySelector('.mem-bubble');
        if (bubble && bubble.dataset.pinned === "true") return;
        window.removeBubbles();
    }, 200); 
};

window.removeBubbles = function() {
    const bubbles = document.querySelectorAll('.mem-bubble');
    const hadBubbles = bubbles.length > 0;
    
    bubbles.forEach(el => el.remove());

    const activeTriggers = document.querySelectorAll('.mem-trigger.mem-active');
    activeTriggers.forEach(el => {
        el.classList.remove('mem-active');
        el.removeAttribute('data-opened-at');
    });
    
    // Сбрасываем выделение только если баблы реально были на экране
    // Игнорируем сброс, если пользователь кликнул в поле ввода
    if (hadBubbles) {
        const activeEl = document.activeElement;
        const isInputFocus = activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT');
        
        if (!isInputFocus) {
            const selection = window.getSelection();
            if (selection) selection.removeAllRanges();
        }
    }
};

document.addEventListener('click', function(event) {
    if (event.target.closest('.mem-bubble')) return; 
    window.removeBubbles();
});

document.addEventListener('scroll', function() {
    window.removeBubbles();
}, true);