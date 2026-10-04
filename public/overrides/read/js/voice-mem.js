/**
 * A-B Loop Repeat Module (Универсальный цикл)
 * Работает поверх window.ttsAPI из voice.js
 */
// The site sets window.isRu from the chosen UI language (siteLanguage, SPA switches); the URL guess is
// only for old pages that have no such setting, and must not overwrite it (it turned the RU player English).
if (typeof window.isRu === 'undefined') {
    window.isRu = window.location.pathname.includes('/r/') || 
                     window.location.pathname.includes('/ru/') || 
                     window.location.pathname.includes('/ml/') || 
                     window.location.pathname.includes('/mt/');
}
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
        abLoopTitle: 'AB',
        startA: window.isRu ? 'Начало A' : 'Start A',
        endB: window.isRu ? 'Конец B' : 'End B',
        pick: window.isRu ? 'выберите строку…' : 'pick a line…',
        hintA: window.isRu ? 'Нажмите строку в тексте — она станет точкой A' : 'Tap a line in the text to set point A',
        hintB: window.isRu ? 'Теперь строку для конца — точки B' : 'Now a line for the end — point B',
        abPause: window.isRu ? 'Пауза м-у повторами' : 'Pause between loops',
        repeats: window.isRu ? 'Повторов' : 'Repeats',
        clear: window.isRu ? 'Сбросить A-B' : 'Clear A-B'
    };
    // 'pause' look while playing: voice.js morphs the play triangle (.on on the button)
    const setPlayIcon = (on) => document.querySelectorAll('.play-main-button').forEach(b => b.classList.toggle('on', on));
    // Panels of the player open one at a time with a smooth height change (voice.js); plain toggle as fallback
    const showPanel = (open) => {
        const panel = document.getElementById('memorize-panel');
        if (window.ttsMorph && window.showTtsPanel) window.ttsMorph(() => window.showTtsPanel(open ? 'memorize-panel' : null));
        else if (panel) panel.classList.toggle('visible', open);
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
            const chips = document.querySelector('#voice-player-container .tts-chips');
            if (chips && !document.getElementById('ab-loop-toggle-btn')) {
                
                const memoBtn = document.createElement('a');
                memoBtn.id = 'memo-app-btn';
                // Добавляем класс memo-button, чтобы common.js её поймал!
                memoBtn.className = 'tts-chip memo-app-btn memo-button'; 
                memoBtn.title = window.isRu ? 'Memo — заучивание' : 'Memo — memorize';
                memoBtn.innerHTML = 'Memo';
                
                memoBtn.href = window.isRu ? '/ru/memo/' : '/memo/';
                
                chips.prepend(memoBtn);
 

                const abBtn = document.createElement('button');
                abBtn.type = 'button';
                abBtn.id = 'ab-loop-toggle-btn';
                abBtn.className = `tts-chip ab-loop-toggle-btn ${memState.lineA ? 'loop-active' : ''}`;
                abBtn.title = window.isRu ? 'Повтор отрывка A-B' : 'A-B loop';
                abBtn.setAttribute('aria-expanded', String(memState.isPanelOpen));
                abBtn.innerHTML = `${L.abLoopTitle}<span id="ab-btn-timer" class="ab-btn-timer-text"></span>`;
                chips.appendChild(abBtn);

                const panel = document.createElement('div');
                panel.id = 'memorize-panel';
                panel.className = 'tts-pan';
                if (memState.isPanelOpen) panel.classList.add('visible');
                
                panel.innerHTML = `
                    <div class="tts-abp">
                        <button type="button" id="mem-btn-a" class="mem-pick-btn" title="${L.titlePick}"></button>
                        <button type="button" id="mem-btn-b" class="mem-pick-btn" title="${L.titlePick}"></button>
                    </div>
                    <div id="mem-status" class="mem-status"></div>
                    <div class="tts-row"><span class="lb">${L.abPause}</span><span class="tts-stp"><button type="button" data-stp="mem-interval" data-d="-1" aria-label="−">−</button><span id="mem-interval" class="stp-v" contenteditable="true" inputmode="decimal" spellcheck="false">${memState.intervalSeconds}</span><span class="u">${L.interval}</span><button type="button" data-stp="mem-interval" data-d="1" aria-label="+">+</button></span></div>
                    <div class="tts-row"><span class="lb">${L.repeats}</span><span class="tts-stp" title="0 = ∞"><button type="button" data-stp="mem-repeat-times" data-d="-1" aria-label="−">−</button><span id="mem-repeat-times" class="stp-v solo" data-inf data-max="999" contenteditable="true" inputmode="numeric" spellcheck="false">${memState.repsInput}</span><button type="button" data-stp="mem-repeat-times" data-d="1" aria-label="+">+</button></span><button type="button" id="mem-clear-btn" class="tts-ib danger mem-clear-btn" title="${L.clear}"><i class="tts-gi" style="--u:url('/assets/svg/trash-can-regular-full.svg')"></i></button></div>
                `;
                chips.parentNode.appendChild(panel);

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
                        
                        setPlayIcon(true);

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
                if (window.ttsShakeIcon) window.ttsShakeIcon(e.target.closest('#mem-clear-btn'));
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
                
                showPanel(!panel.classList.contains('visible'));
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
            if (panel && panel.classList.contains('visible')) showPanel(false);
            
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

        const dispA = memState.lineA ? (memState.snippetA || memState.lineA.split(':').pop()) : (memState.pickMode === 'A' ? L.pick : L.notSet);
        const dispB = memState.lineB ? (memState.snippetB || memState.lineB.split(':').pop()) : (memState.pickMode === 'B' ? L.pick : L.notSet);

        btnA.innerHTML = `<b>${L.startA}</b><span>${dispA}</span>`;
        btnB.innerHTML = `<b>${L.endB}</b><span>${dispB}</span>`;

        btnA.className = `mem-pick-btn ${memState.pickMode === 'A' ? 'picking' : ''} ${memState.lineA ? 'set' : ''}`;
        btnB.className = `mem-pick-btn ${memState.pickMode === 'B' ? 'picking' : ''} ${memState.lineB ? 'set' : ''}`;

        const intervalSpan = document.getElementById('mem-interval');
        if (intervalSpan) intervalSpan.innerText = memState.intervalSeconds;
        
        const repsSpan = document.getElementById('mem-repeat-times');
        if (repsSpan) repsSpan.innerText = memState.repsInput;

        if (!memState.isActive) {
            const statusEl = document.getElementById('mem-status');
            if (statusEl) statusEl.innerText = memState.pickMode === 'A' ? L.hintA : memState.pickMode === 'B' ? L.hintB : '';
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
                setPlayIcon(false);
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
        
        setPlayIcon(true);
            
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
            
            setPlayIcon(true);
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
