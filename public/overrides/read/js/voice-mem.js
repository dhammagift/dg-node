/**
 * A-B Loop Repeat Module (Универсальный цикл)
 * Работает поверх window.ttsAPI из voice.js
 */
window.isRu = window.location.pathname.includes('/r/') || 
                     window.location.pathname.includes('/ru/') || 
                     window.location.pathname.includes('/ml/') || 
                     window.location.pathname.includes('/mt/');
(function() {
    // --- Локализация ---
    const L = {
        a: window.isRu ? 'А:' : 'A:',
        b: window.isRu ? 'Б:' : 'B:',
        notSet: window.isRu ? 'не выбрана' : 'not set',
        titlePick: window.isRu ? 'Нажмите для выбора. ПКМ или долгое нажатие для сброса.' : 'Click to select. Right-Click / Long-Press to clear.',
        interval: window.isRu ? 'сек' : 'sec', 
        playing: window.isRu ? 'Проигрывание... (осталось: ' : 'Playing... (left: ',
        paused: window.isRu ? 'Пауза... Старт через ' : 'Paused... Next in ',
        abLoopTitle: 'AB'
    };

    // --- Состояние модуля ---
    const memState = {
        lineA: null,
        lineB: null,
        snippetA: '', 
        snippetB: '', 
        intervalSeconds: 0, 
        repsInput: '∞', 
        repsPlayed: 0,   
        repsLeft: 0,     
        isActive: false,
        pickMode: null, 
        countdownId: null,
        pauseStartedAt: null,   
        targetTimestamp: null,  
        justCleared: false,
        currentCountdownTime: null,
        ignoreNextPlayClick: false,
        isPanelOpen: false 
    };

    const getSlug = () => {
        const params = new URLSearchParams(window.location.search);
        if (params.has('q')) return params.get('q').toLowerCase();
        return window.location.pathname.replace(/[^a-zA-Z0-9]/g, '_');
    };

    const MEMORY_KEY = 'dg_tts_ab_memory';
    const MAX_SAVED_TEXTS = 28;

    // --- Инициализация и UI ---
    function init() {
        injectUI();
        loadState();
        setupListeners();
    }

    function injectUI() {
        setInterval(() => {
            const mainRow = document.querySelector('.tts-main-row');
            if (mainRow && !document.getElementById('ab-loop-toggle-btn')) {
                
                const memoBtn = document.createElement('a');
                memoBtn.id = 'memo-app-btn';
                // Добавляем класс memo-button, чтобы common.js её поймал!
                memoBtn.className = 'memo-app-btn memo-button'; 
                memoBtn.title = 'Открыть в Memo';
                memoBtn.innerHTML = 'memo';
                
                memoBtn.href = window.isRu ? '/ru/memo/' : '/memo/';
                
                mainRow.appendChild(memoBtn);
 

                const abBtn = document.createElement('button');
                abBtn.id = 'ab-loop-toggle-btn';
                abBtn.className = `ab-loop-toggle-btn ${memState.lineA ? 'loop-active' : ''}`;
                abBtn.title = 'A-B Loop Menu';
                abBtn.innerHTML = `
                    ${L.abLoopTitle} 
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 2.1l4 4-4 4"/><path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8M7 21.9l-4-4 4-4"/><path d="M21 11.8v2a4 4 0 0 1-4 4H4.2"/></svg>
                    <span id="ab-btn-timer" class="ab-btn-timer-text"></span>
                `;
                mainRow.appendChild(abBtn);

                const panel = document.createElement('div');
                panel.id = 'memorize-panel';
                if (memState.isPanelOpen) panel.classList.add('visible');
                
                panel.innerHTML = `
                    <div class="mem-row">
                        <div class="mem-btn-wrapper">
                            <span class="mem-btn-label">${L.a}</span>
                            <button id="mem-btn-a" class="mem-pick-btn" title="${L.titlePick}"><span>${L.notSet}</span></button>
                        </div>
                        <div class="mem-btn-wrapper">
                            <span class="mem-btn-label">${L.b}</span>
                            <button id="mem-btn-b" class="mem-pick-btn" title="${L.titlePick}"><span>${L.notSet}</span></button>
                        </div>
                    </div>
                    
                    <div class="mem-row mem-row-actions">
                        <label class="mem-label">
                            <img src="/assets/svg/hourglass-regular-full.svg" width="14" height="14" alt="timer" class="mem-timer-icon">
                            <span id="mem-interval" class="tts-editable-span" contenteditable="true" inputmode="decimal" spellcheck="false">${memState.intervalSeconds}</span>
                            ${L.interval}
                        </label>

                        <label class="mem-label" title="0 = Бесконечно">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 2.1l4 4-4 4"/><path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8M7 21.9l-4-4 4-4"/><path d="M21 11.8v2a4 4 0 0 1-4 4H4.2"/></svg> 
                            <span id="mem-repeat-times" class="tts-editable-span" contenteditable="true" inputmode="numeric" spellcheck="false">${memState.repsInput}</span>
                        </label>
                        <button id="mem-clear-btn" class="mem-clear-btn" title="Сбросить цикл">️
                            <img src="/assets/svg/trash-can-regular-full.svg" width="16" height="16" alt="Reset">
                        </button>
                    </div>
                    <div id="mem-status" class="mem-status"></div>
                `;
                mainRow.parentNode.insertBefore(panel, mainRow.nextSibling);

                updateUI();
                updateABTimerDisplay();
            }
        }, 400); 
    }

    function loadState() {}
    function saveState() {}

    function extractSnippet(el) {
        if (!el) return '';
        let text = (el.innerText || el.textContent || '').trim();
        text = text.replace(/[\n\r]+/g, ' ').replace(/\s{2,}/g, ' ');
        const words = text.split(' ');
        if (words.length === 0 || words[0] === '') return '';
        return words.slice(0, 3).join(' ') + (words.length > 3 ? '...' : '');
    }

    function updateABTimerDisplay() {
        const timerSpan = document.getElementById('ab-btn-timer');
        const panel = document.getElementById('memorize-panel');
        if (!timerSpan) return;
        
        if (memState.isActive && memState.currentCountdownTime && panel && !panel.classList.contains('visible')) {
            timerSpan.style.display = 'inline-block';
            timerSpan.innerText = memState.currentCountdownTime;
        } else {
            timerSpan.style.display = 'none';
        }
    }

    function updateRepsLeft() {
        if (memState.repsInput === '∞' || memState.repsInput === '' || memState.repsInput === '0') {
            memState.repsLeft = Infinity;
        } else {
            let r = parseInt(memState.repsInput);
            memState.repsLeft = (isNaN(r) ? Infinity : r) - memState.repsPlayed;
            if (memState.repsLeft < 0) memState.repsLeft = 0;
        }
    }

    function armLoopInPlayer(isNewStart = false, forceJumpToLoop = false) {
        if (!memState.lineA || !window.ttsAPI) return;
        const state = window.ttsAPI.getState();
        
        if (state.playlist && state.playlist.length) {
            const targetB = memState.lineB || memState.lineA;
let sIdx = state.playlist.findIndex(item => item.id === memState.lineA);
// Ищем ПОСЛЕДНЕЕ совпадение для targetB, чтобы захватить оба языка
let eIdx = -1;
for (let i = state.playlist.length - 1; i >= 0; i--) {
    if (state.playlist[i].id === targetB) {
        eIdx = i;
        break;
    }
}

            
            if (sIdx === -1) sIdx = 0;
            if (eIdx === -1) eIdx = state.playlist.length - 1;

            if (!forceJumpToLoop && isNewStart && (state.currentIndex < sIdx || state.currentIndex > eIdx)) {
                clearLineAction('ALL', true); 
                return;
            }

            state.startIndex = sIdx;
            state.endIndex = eIdx;
            
            if (forceJumpToLoop || isNewStart || state.currentIndex < sIdx || state.currentIndex > eIdx) {
                state.currentIndex = sIdx;
            }
        }

        memState.isActive = true;
        if (isNewStart) {
            memState.repsPlayed = 0;
        }
        
        updateRepsLeft();
        
        memState.currentCountdownTime = null; 
        updateABTimerDisplay();
        
        const statusEl = document.getElementById('mem-status');
        if (statusEl) statusEl.innerText = `${L.playing}${memState.repsLeft === Infinity ? '∞' : memState.repsLeft})`;
        
        updateUI();
    }

    function setupListeners() {
        document.addEventListener('tts-playback-started', () => {
            if (memState.lineA) {
                armLoopInPlayer(true, false);
            }
        });

        document.addEventListener('focusin', (e) => {
            if (e.target.id === 'mem-repeat-times' || e.target.id === 'mem-interval') {
                const range = document.createRange();
                range.selectNodeContents(e.target);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.target.id === 'mem-repeat-times' || e.target.id === 'mem-interval') {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.blur();
                }
            }
        });

        document.addEventListener('input', (e) => {
            if (e.target.id === 'mem-interval') {
                let text = e.target.innerText.replace(/[^0-9.,]/g, '').replace(',', '.');
                let parts = text.split('.');
                if (parts.length > 2) {
                    text = parts[0] + '.' + parts.slice(1).join('');
                }

                if (text !== e.target.innerText) {
                    e.target.innerText = text;
                    const range = document.createRange();
                    range.selectNodeContents(e.target);
                    range.collapse(false);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }

                let val = parseFloat(text);
                memState.intervalSeconds = isNaN(val) ? 0 : val;
                
                if (memState.countdownId && memState.pauseStartedAt) {
                    memState.targetTimestamp = memState.pauseStartedAt + (memState.intervalSeconds * 1000);
                }
            }
            if (e.target.id === 'mem-repeat-times') {
                let text = e.target.innerText.replace(/[^0-9∞]/g, '');
                
                if (text !== e.target.innerText) {
                    e.target.innerText = text;
                    const range = document.createRange();
                    range.selectNodeContents(e.target);
                    range.collapse(false);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
                
                let val = parseInt(text, 10);
                if (isNaN(val) || val < 0) val = 0;
                
                memState.repsInput = val === 0 ? '∞' : val;
                memState.repsPlayed = 0; 
                updateRepsLeft();
                
                if (memState.isActive && !memState.currentCountdownTime) {
                    const statusEl = document.getElementById('mem-status');
                    if (statusEl) statusEl.innerText = `${L.playing}${memState.repsLeft === Infinity ? '∞' : memState.repsLeft})`;
                }
            }
        });

        document.addEventListener('focusout', (e) => {
            if (e.target.id === 'mem-interval') {
                let val = parseFloat(e.target.innerText);
                if (e.target.innerText.trim() === '' || isNaN(val)) {
                    e.target.innerText = '0';
                    memState.intervalSeconds = 0;
                }
                if (memState.countdownId && memState.pauseStartedAt) {
                    memState.targetTimestamp = memState.pauseStartedAt;
                }
            }
            
            if (e.target.id === 'mem-repeat-times') {
                let val = parseInt(e.target.innerText, 10);
                if (e.target.innerText.trim() === '' || isNaN(val) || val === 0) {
                    e.target.innerText = '∞';
                    memState.repsInput = '∞';
                }
                memState.repsPlayed = 0;
                updateRepsLeft();
            }
        });

        document.addEventListener('click', (e) => {
            const mainPlayBtn = e.target.closest('.play-main-button');
            const navBtn = e.target.closest('.prev-main-button, .next-main-button'); 

            if ((mainPlayBtn || navBtn) && memState.lineA) {
                
                if (mainPlayBtn && memState.ignoreNextPlayClick) {
                    memState.ignoreNextPlayClick = false;
                    return; 
                }
                
                if (memState.countdownId) {
                    clearInterval(memState.countdownId);
                    memState.countdownId = null;
                    memState.pauseStartedAt = null;
                    memState.targetTimestamp = null;
                    memState.currentCountdownTime = null;
                    updateABTimerDisplay();

                    if (navBtn && window.ttsAPI) {
                        const state = window.ttsAPI.getState();
                        state.speaking = true;
                        state.paused = false;
                        
                        const imgs = document.querySelectorAll('.play-main-button img');
                        imgs.forEach(img => img.src = '/assets/svg/pause-grey.svg');

                        const statusEl = document.getElementById('mem-status');
                        if (statusEl) statusEl.innerText = `${L.playing}${memState.repsLeft === Infinity ? '∞' : memState.repsLeft})`;
                    }
                }

                if (mainPlayBtn && window.ttsAPI) {
                    const state = window.ttsAPI.getState();

                    if (!memState.isActive || !state.speaking) {
                        e.preventDefault();
                        e.stopPropagation(); 
                        
                        armLoopInPlayer(true, true);
                        playCurrentRange();
                        return;
                    }

                    if (state.paused) {
                        armLoopInPlayer(false, true);
                    }
                }
            }

            if (e.target.closest('#mem-clear-btn')) {
                e.preventDefault();
                clearLineAction('ALL', true);
                return;
            }

            const closeBtn = e.target.closest('.close-tts-btn');
            if (closeBtn && memState.isActive) {
                stopCycle();
            }
            
            if (e.target.closest('#ab-loop-toggle-btn')) {
                e.preventDefault();
                const panel = document.getElementById('memorize-panel');
                if (!panel) return;
                
                const settingsPanel = document.getElementById('tts-settings-panel');
                if (settingsPanel && settingsPanel.classList.contains('visible')) {
                    settingsPanel.classList.remove('visible');
                    const icon = document.getElementById('tts-settings-icon');
                    if (icon) icon.style.transform = 'rotate(0deg)';
                    
                    const advSettings = document.getElementById('tts-advanced-settings');
                    if (advSettings) advSettings.classList.remove('visible');
                    
                    const basicPanel = document.getElementById('tts-basic-settings');
                    if (basicPanel) {
                        basicPanel.style.maxHeight = '200px';
                        basicPanel.style.opacity = '1';
                    }
                }

                panel.classList.toggle('visible');
                memState.isPanelOpen = panel.classList.contains('visible'); 
                
                updateABTimerDisplay(); 
                
                if (memState.isPanelOpen && !memState.lineA) {
                    const activeWord = document.querySelector('.active-word');

                    if (activeWord) {
                        const id = activeWord.id || activeWord.closest('[id]')?.id;
                        if (id) {
                            setLine('A', id, activeWord);
                            pauseTTS(); 
                            activatePickMode('B');
                        } else {
                            activatePickMode('A'); 
                        }
                    } else {
                        activatePickMode('A');
                    }
                }
                return;
            }

            const btnA = e.target.closest('#mem-btn-a');
            const btnB = e.target.closest('#mem-btn-b');
            
            if (btnA || btnB) {
                if (memState.justCleared) return; 
                activatePickMode(btnA ? 'A' : 'B');
                return;
            }

            if (memState.pickMode) {
                const textEl = e.target.closest(".pli-lang, .rus-lang, .eng-lang, .tha-lang");
                if (textEl) {
                    e.preventDefault();
                    e.stopPropagation(); 
                    
                    const id = textEl.id || textEl.closest('[id]')?.id;
                    if (id) {
                        setLine(memState.pickMode, id, textEl);
                        
                        if (memState.pickMode === 'A' && !memState.lineB) {
                            pauseTTS(); 
                            activatePickMode('B');
                        } else {
                            memState.pickMode = null;
                            updateUI();
                            
                            if (memState.lineA && memState.lineB) {
                                if (memState.countdownId) {
                                    clearInterval(memState.countdownId);
                                    memState.countdownId = null;
                                    memState.pauseStartedAt = null;
                                    memState.targetTimestamp = null;
                                    memState.currentCountdownTime = null;
                                    updateABTimerDisplay();
                                }
                                armLoopInPlayer(true, true); 
                                playCurrentRange(); 
                            }
                        }
                    }
                }
            }

        }, { capture: true });


        document.addEventListener('contextmenu', (e) => {
            const btn = e.target.closest('.mem-pick-btn');
            if (btn) {
                e.preventDefault();
                clearLineAction(btn.id === 'mem-btn-a' ? 'A' : 'B', true);
            }
        });

        let pressTimer;
        document.addEventListener('touchstart', (e) => {
            const btn = e.target.closest('.mem-pick-btn');
            if (btn) {
                pressTimer = setTimeout(() => {
                    memState.justCleared = true; 
                    clearLineAction(btn.id === 'mem-btn-a' ? 'A' : 'B', true);
                    if (navigator.vibrate) navigator.vibrate(50);
                    setTimeout(() => memState.justCleared = false, 500); 
                }, 600);
            }
        }, { passive: true });

        document.addEventListener('touchend', () => clearTimeout(pressTimer));
        document.addEventListener('touchmove', () => clearTimeout(pressTimer));

        document.addEventListener('tts-range-finished', handleRangeFinished);
    }

    function clearLineAction(line, keepPlaying = false) {
        if (memState.isActive) {
            if (!keepPlaying) {
                stopCycle(); 
            } else {
                clearInterval(memState.countdownId);
                memState.countdownId = null;
                memState.pauseStartedAt = null;
                memState.targetTimestamp = null;
                memState.currentCountdownTime = null;
                memState.isActive = false;
            }
        } 
        
        if (line === 'ALL') {
            setLine('A', null, null);
            setLine('B', null, null);
            memState.pickMode = null;
            
            memState.isPanelOpen = false;
            const panel = document.getElementById('memorize-panel');
            if (panel) panel.classList.remove('visible');
            
        } else {
            setLine(line, null, null);
            if (memState.pickMode === line) memState.pickMode = null;
        }
        
        if (!memState.lineA && window.ttsAPI) {
            const state = window.ttsAPI.getState();
            state.startIndex = undefined;
            state.endIndex = undefined;
            memState.isActive = false;
        }
        
        updateUI();
        updateABTimerDisplay();
    }

    function pauseTTS() {
        if (window.ttsAPI) {
            const state = window.ttsAPI.getState();
            if (state.speaking && !state.paused) {
                memState.ignoreNextPlayClick = true; 
                const playBtn = document.querySelector('.play-main-button');
                if (playBtn) playBtn.click();
            }
        }
    }

    function activatePickMode(line) {
        if (memState.isActive) {
            stopCycle(); 
        }
        memState.pickMode = line;
        updateUI();
    }

    function setLine(lineType, id, clickedEl) {
        let snippet = '';
        if (id) {
            if (clickedEl) {
                snippet = extractSnippet(clickedEl);
            } else {
                snippet = id.split(':').pop(); 
            }
        }
        
        if (lineType === 'A') { memState.lineA = id; memState.snippetA = snippet; }
        if (lineType === 'B') { memState.lineB = id; memState.snippetB = snippet; }
        
        if (memState.lineA && memState.lineB) {
            const elements = Array.from(document.querySelectorAll('[id]'));
            const idxA = elements.findIndex(el => el.id === memState.lineA);
            const idxB = elements.findIndex(el => el.id === memState.lineB);
            if (idxA !== -1 && idxB !== -1 && idxB < idxA) {
                [memState.lineA, memState.lineB] = [memState.lineB, memState.lineA];
                [memState.snippetA, memState.snippetB] = [memState.snippetB, memState.snippetA];
            }
        }
        highlightRange();
    }

    function highlightRange() {
        document.querySelectorAll('.memorize-highlight').forEach(el => el.classList.remove('memorize-highlight'));
        if (!memState.lineA) return;
        
        let targetB = memState.lineB || memState.lineA; 
        const elements = Array.from(document.querySelectorAll('.pli-lang, .rus-lang, .eng-lang, .tha-lang'));
        let inRange = false;
        
        elements.forEach(el => {
            const id = el.id || el.closest('[id]')?.id;
            
            if (id === memState.lineA) inRange = true;
            
            if (inRange || id === targetB) {
                el.classList.add('memorize-highlight');
            }
            
            if (id === targetB) inRange = false;
        });
    }

    function updateUI() {
        const abToggleBtn = document.getElementById('ab-loop-toggle-btn');
        if (abToggleBtn) {
            if (memState.lineA) abToggleBtn.classList.add('loop-active');
            else abToggleBtn.classList.remove('loop-active');
        }

        const btnA = document.getElementById('mem-btn-a');
        const btnB = document.getElementById('mem-btn-b');
        if (!btnA || !btnB) return;

        const dispA = memState.lineA ? (memState.snippetA || memState.lineA.split(':').pop()) : L.notSet;
        const dispB = memState.lineB ? (memState.snippetB || memState.lineB.split(':').pop()) : L.notSet;

        btnA.innerHTML = `<span>${dispA}</span>`;
        btnB.innerHTML = `<span>${dispB}</span>`;

        btnA.className = `mem-pick-btn ${memState.pickMode === 'A' ? 'picking' : ''} ${memState.lineA ? 'set' : ''}`;
        btnB.className = `mem-pick-btn ${memState.pickMode === 'B' ? 'picking' : ''} ${memState.lineB ? 'set' : ''}`;

        const intervalSpan = document.getElementById('mem-interval');
        if (intervalSpan) intervalSpan.innerText = memState.intervalSeconds;
        
        const repsSpan = document.getElementById('mem-repeat-times');
        if (repsSpan) repsSpan.innerText = memState.repsInput;

        if (!memState.isActive) {
            const statusEl = document.getElementById('mem-status');
            if (statusEl) statusEl.innerText = '';
        }
        highlightRange();
    }

    function stopCycle() {
        memState.isActive = false;
        clearInterval(memState.countdownId);
        memState.countdownId = null;
        memState.pauseStartedAt = null;
        memState.targetTimestamp = null;
        
        if (window.ttsAPI) {
            // ---> Отпускаем экран, так как цикл А-Б полностью завершен <---
            if (typeof window.ttsAPI.releaseWakeLock === 'function') {
                window.ttsAPI.releaseWakeLock();
            }

            const state = window.ttsAPI.getState();
            if (state.speaking && !state.paused) {
                memState.ignoreNextPlayClick = true; 
                const playBtn = document.querySelector('.play-main-button');
                if (playBtn) playBtn.click();
            } else {
                const imgs = document.querySelectorAll('.play-main-button img');
                imgs.forEach(img => img.src = '/assets/svg/play-grey.svg');
            }
        }
        
        memState.currentCountdownTime = null;
        updateABTimerDisplay();
        updateUI();
    }


    function playCurrentRange() {
        if (!memState.lineA || !window.ttsAPI) return; 
        
        memState.currentCountdownTime = null; 
        updateABTimerDisplay();
        
        const targetB = memState.lineB || memState.lineA; 
        const statusEl = document.getElementById('mem-status');
        if (statusEl) statusEl.innerText = `${L.playing}${memState.repsLeft === Infinity ? '∞' : memState.repsLeft})`;
        
        const imgs = document.querySelectorAll('.play-main-button img');
        imgs.forEach(img => img.src = '/assets/svg/pause-grey.svg');
            
        window.ttsAPI.playRange(memState.lineA, targetB);
    }

    function handleRangeFinished() {
        if (!memState.isActive) return;

        memState.repsPlayed++;
        updateRepsLeft();

        if (memState.repsLeft <= 0) {
            const statusEl = document.getElementById('mem-status');
            if (statusEl) statusEl.innerText = '✅';
            stopCycle();
            return;
        }

        const msInterval = memState.intervalSeconds * 1000;
        
        if (msInterval <= 0) {
            playCurrentRange();
            return;
        }
        
        memState.pauseStartedAt = Date.now();
        memState.targetTimestamp = memState.pauseStartedAt + msInterval;
        
        // Удерживаем экран и звуковой фон активными на время паузы таймера
        if (window.ttsAPI.requestWakeLock) window.ttsAPI.requestWakeLock();
        if (window.ttsAPI.keepSilenceAlive) window.ttsAPI.keepSilenceAlive(true);

        if (memState.countdownId) clearInterval(memState.countdownId);

        const tick = () => {
            if (!memState.isActive) {
                clearInterval(memState.countdownId);
                return;
            }
            
            let timeLeft = memState.targetTimestamp - Date.now();
            
            if (timeLeft <= 0) {
                clearInterval(memState.countdownId);
                memState.countdownId = null;
                playCurrentRange();
                return;
            }
            
            const mins = Math.floor(timeLeft / 60000);
            const secs = Math.floor((timeLeft % 60000) / 1000);
            const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
            
            memState.currentCountdownTime = timeStr;
            const statusEl = document.getElementById('mem-status');
            if (statusEl) statusEl.innerText = `${L.paused}${timeStr}`;
            updateABTimerDisplay();
            
            const imgs = document.querySelectorAll('.play-main-button img');
            imgs.forEach(img => img.src = '/assets/svg/pause-grey.svg');
        };

        tick(); 
        memState.countdownId = setInterval(tick, 1000);
    }

    let _segmentTimerId = null;
    let _internalDelayValue = (parseFloat(localStorage.getItem('dg_tts_segment_delay')) || 0) * 1000;

    Object.defineProperty(window, 'TTS_SEGMENT_DELAY', {
        get: function() {
            if (_internalDelayValue > 0 && window.ttsAPI) {
                const state = window.ttsAPI.getState();
                const maxIndex = state.endIndex !== undefined ? state.endIndex : state.playlist.length - 1;
                
                if (state.speaking && !state.paused && state.currentIndex <= maxIndex) {
                    setTimeout(() => startSegmentVisualTimer(_internalDelayValue), 0);
                }
            }
            return _internalDelayValue;
        },
        set: function(val) {
            _internalDelayValue = val;
        },
        configurable: true
    });

    function startSegmentVisualTimer(delayMs) {
        if (_segmentTimerId) clearInterval(_segmentTimerId);
        
        const timerSpan = document.getElementById('ab-btn-timer');
        if (!timerSpan) return;

        if (memState && memState.countdownId) return;

        const endTime = Date.now() + delayMs;
        
        const tick = () => {
            const timeLeft = endTime - Date.now();
            if (timeLeft <= 0) {
                stopSegmentVisualTimer();
                return;
            }
            const mins = Math.floor(timeLeft / 60000);
            const secs = Math.floor((timeLeft % 60000) / 1000);
            
            timerSpan.style.setProperty('display', 'inline-block', 'important');
            timerSpan.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        tick();
        _segmentTimerId = setInterval(tick, 1000);
    }

    function stopSegmentVisualTimer() {
        if (_segmentTimerId) {
            clearInterval(_segmentTimerId);
            _segmentTimerId = null;
        }
        const timerSpan = document.getElementById('ab-btn-timer');
        if (timerSpan && (!memState || !memState.countdownId)) {
            timerSpan.style.display = 'none';
            timerSpan.innerText = '';
            if (typeof updateABTimerDisplay === 'function') updateABTimerDisplay(); 
        }
    }

    document.addEventListener('click', (e) => {
        if (e.target.closest('.prev-main-button, .next-main-button, .play-main-button, .close-tts-btn')) {
            stopSegmentVisualTimer();
        }
    }, { capture: true });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
