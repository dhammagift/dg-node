// Ported to the site from dg-app-full/src/offline-status.js and meant to stay shared with it:
// this is the DOM half of the offline data layer. It owns no download logic — it only renders
// what the data shim dispatches (public/offline/app.js on the site, src/app.js in the app):
// the download/import progress card, the network-consent sheet, the script-consent sheet and
// the small API-busy dot. Nothing here blocks the page.
//
// ONE behavioural difference from the app copy. The offline script-conversion engine
// (Aksharamukha/Pyodide, ~16 MB) is NOT ported in this stage, so window.dgScriptEngine does
// not exist on the site and the 'dg:need-script-consent' event is never dispatched, i.e. its
// consent sheet below never fires. The listener is kept as-is and stays harmless until that
// engine is ported.
//
// Everything below this header is the app file verbatim; the app's own header comment that
// follows is preserved unchanged from the original.
// Non-blocking status for the first-run offline DB download (see app.js's fetchDbBytes/
// hasNetworkConsent — this file only renders what those dispatch, no download logic of its
// own). Deliberately NOT a blocking overlay/wizard — owner: "не блокировать, показывать
// строку, чтобы юзер уже мог пользоваться мультитулом или настройками". Reuses the existing
// toast's `.bubble-notification` class (settings.js's showBubbleNotification(), see
// extrastyles.css) rather than inventing new visual style — that class already has
// pointer-events:none, so it never eats clicks meant for the rest of the page.
//
// Loaded on index.html only, next to native-bridge.js — keeps app.js a pure data+events shim
// (no DOM code), same separation of concerns already used for native-bridge.js.
(function () {
    function isRuLang() {
        return (localStorage.getItem('dhammaLanguage') || localStorage.getItem('siteLanguage') || 'en') === 'ru';
    }

    function labelFor(name, ru) {
        // One file now: the app reads a language slice of the server's own dg.db rather than the
        // core/lang split it used to build for itself.
        if (name === 'dg-mobile.db') return ru ? 'тексты и переводы' : 'texts and translations';
        return name;
    }

    // Owner: the consent sheet showed the language set as "RU+EN", which reads like a build flag
    // rather than like something offered to a reader. These are the names people use. Unknown
    // codes fall back to the bare code rather than being dropped — a language nobody named here
    // should still be visible in the figure.
    var LANG_NAMES = {
        ru: { ru: 'русский', en: 'Russian' },
        en: { ru: 'английский', en: 'English' },
        pli: { ru: 'пали', en: 'Pali' },
        de: { ru: 'немецкий', en: 'German' },
    };
    function languageList(langs, ru) {
        var names = String(langs || '').split(',').map(function (code) {
            var key = code.trim().toLowerCase();
            var entry = LANG_NAMES[key];
            return entry ? entry[ru ? 'ru' : 'en'] : key.toUpperCase();
        }).filter(Boolean);
        if (!names.length) return ru ? 'русский и английский' : 'Russian and English';
        if (names.length === 1) return names[0];
        var last = names.pop();
        return names.join(', ') + (ru ? ' и ' : ' and ') + last;
    }

    function formatMb(bytes) {
        var mb = bytes / 1048576;
        return (mb < 10 ? mb.toFixed(1) : Math.round(mb));
    }

    // Self-colored (like .bubble-notification above), no dark/light variant needed — visible on
    // either theme the same way the existing toast is.
    // Folded/unfolded is the reader's choice about their own screen, so it outlives one download.
    const COLLAPSE_KEY = 'dg.offline.cardCompact';

    const style = document.createElement('style');
    style.textContent = `
        #dgApiLoadingDot {
            position: fixed; right: 16px; bottom: 16px; width: 28px; height: 28px;
            border-radius: 50%; background: rgba(0,0,0,0.7); z-index: 10001;
            opacity: 0; transition: opacity 0.15s ease; pointer-events: none;
        }
        #dgApiLoadingDot.show { opacity: 1; }
        #dgApiLoadingDot::after {
            content: ""; position: absolute; inset: 5px; border-radius: 50%;
            border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff;
            animation: dgApiLoadingSpin 0.7s linear infinite;
        }
        @keyframes dgApiLoadingSpin { to { transform: rotate(360deg); } }

        /* Consent sheet. Replaces window.confirm(), which Android draws as an AppCompat
           AlertDialog: square-ish, uppercase buttons, and the page origin ("https://localhost")
           as its title — it reads as a browser warning about the app rather than as the app
           asking a question. It is also blocking, so nothing behind it can render meanwhile.
           Colours come from the site's own accent (#136857, same as .bubble-notification) and
           follow Bootstrap's data-bs-theme, which themeswitch.js already sets on <html>. */
        #dgConsent {
            position: fixed; inset: 0; z-index: 10002;
            display: flex; align-items: flex-end; justify-content: center;
            background: rgba(8, 20, 17, .5);
            opacity: 0; transition: opacity .18s ease;
        }
        #dgConsent.show { opacity: 1; }
        #dgConsentSheet {
            --dgc-surface: #fff; --dgc-sunk: #f1f5f4; --dgc-rule: #dde5e2;
            --dgc-ink: #141a18; --dgc-muted: #5b6b66; --dgc-faint: #8a9994; --dgc-accent: #136857;
            width: min(420px, calc(100% - 28px)); margin: 0 0 14px;
            background: var(--dgc-surface); color: var(--dgc-ink);
            border: 1px solid var(--dgc-rule); border-radius: 20px;
            padding: 20px 18px 16px;
            box-shadow: 0 24px 64px -16px rgba(9, 30, 25, .45);
            display: flex; flex-direction: column; gap: 12px;
            transform: translateY(14px); transition: transform .2s cubic-bezier(.2,.8,.3,1);
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        }
        #dgConsent.show #dgConsentSheet { transform: translateY(0); }
        [data-bs-theme="dark"] #dgConsentSheet {
            --dgc-surface: #171f1d; --dgc-sunk: #101816; --dgc-rule: #27332f;
            --dgc-ink: #e8efec; --dgc-muted: #9aaba6; --dgc-faint: #6d7f7a; --dgc-accent: #3f9d86;
            box-shadow: 0 24px 64px -16px rgba(0, 0, 0, .7);
        }
        #dgConsentSheet .dgc-eyebrow {
            font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase;
            font-weight: 600; color: var(--dgc-accent);
        }
        #dgConsentSheet .dgc-title { font-size: 16.5px; font-weight: 600; line-height: 1.3; margin: -4px 0 0; }
        #dgConsentSheet .dgc-body { font-size: 13.5px; line-height: 1.5; color: var(--dgc-muted); margin: 0; }
        #dgConsentSheet .dgc-figures {
            display: grid; grid-template-columns: 1fr 1fr; gap: 1px;
            background: var(--dgc-rule); border-radius: 12px; overflow: hidden; margin: 0;
        }
        #dgConsentSheet .dgc-fig { background: var(--dgc-sunk); padding: 10px 12px; }
        #dgConsentSheet .dgc-fig dt {
            font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase;
            color: var(--dgc-faint); margin: 0 0 2px;
        }
        #dgConsentSheet .dgc-fig dd {
            margin: 0; font-size: 16px; font-weight: 600;
            font-variant-numeric: tabular-nums; color: var(--dgc-ink);
        }
        #dgConsentSheet .dgc-fig dd span { font-size: 11.5px; font-weight: 400; color: var(--dgc-muted); margin-left: 2px; }
        #dgConsentSheet .dgc-actions { display: flex; gap: 9px; margin-top: 2px; }
        #dgConsentSheet button {
            flex: 1; font: inherit; font-size: 14px; font-weight: 600;
            padding: 11px 14px; border-radius: 13px; cursor: pointer;
            border: 1px solid transparent; transition: background .16s ease, border-color .16s ease;
        }
        #dgConsentSheet .dgc-ghost { background: transparent; border-color: var(--dgc-rule); color: var(--dgc-muted); }
        #dgConsentSheet .dgc-ghost:hover { background: var(--dgc-sunk); }
        #dgConsentSheet .dgc-primary { background: var(--dgc-accent); color: #fff; }
        #dgConsentSheet .dgc-primary:hover { filter: brightness(1.08); }
        #dgConsentSheet button:focus-visible { outline: 2px solid var(--dgc-accent); outline-offset: 2px; }
        /* The language figure carries words now, not a "RU+EN" flag, so it gets its own scale
           and is allowed to wrap rather than being clipped by the number-sized rule above. */
        /* With two size figures the languages take their own full-width line. */
        #dgConsentSheet .dgc-fig:nth-child(3).dgc-fig-wide { grid-column: 1 / -1; }
        #dgConsentSheet .dgc-fig-wide dd {
            font-size: 13.5px; font-weight: 500; line-height: 1.35;
            font-variant-numeric: normal;
        }

        /* Download progress. Owner asked for a real bar, not a line of text — this is the same
           surface, radius and accent as the consent sheet above so the two read as one thing,
           and it is deliberately NOT interactive: nothing here can be clicked, so it never eats
           a tap meant for the page underneath. */
        #dgDlCard {
            position: fixed; left: 50%; bottom: 14px; transform: translate(-50%, 14px);
            width: min(420px, calc(100% - 28px)); z-index: 10001;
            --dgc-surface: #fff; --dgc-sunk: #f1f5f4; --dgc-rule: #dde5e2;
            --dgc-ink: #141a18; --dgc-muted: #5b6b66; --dgc-faint: #8a9994; --dgc-accent: #136857;
            background: var(--dgc-surface); color: var(--dgc-ink);
            border: 1px solid var(--dgc-rule); border-radius: 18px; padding: 14px 16px 15px;
            box-shadow: 0 18px 48px -14px rgba(9, 30, 25, .38);
            display: flex; flex-direction: column; gap: 9px;
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            opacity: 0; pointer-events: none;
            transition: opacity .18s ease, transform .2s cubic-bezier(.2,.8,.3,1);
        }
        #dgDlCard.show { opacity: 1; transform: translate(-50%, 0); }
        [data-bs-theme="dark"] #dgDlCard {
            --dgc-surface: #171f1d; --dgc-sunk: #101816; --dgc-rule: #27332f;
            --dgc-ink: #e8efec; --dgc-muted: #9aaba6; --dgc-faint: #6d7f7a; --dgc-accent: #3f9d86;
            box-shadow: 0 18px 48px -14px rgba(0, 0, 0, .65);
        }
        #dgDlCard .dgdl-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
        #dgDlCard .dgdl-title { font-size: 13.5px; font-weight: 600; }
        #dgDlCard .dgdl-pct {
            font-size: 13.5px; font-weight: 600; color: var(--dgc-accent);
            font-variant-numeric: tabular-nums;
        }
        #dgDlCard .dgdl-track {
            height: 6px; border-radius: 999px; background: var(--dgc-sunk); overflow: hidden;
        }
        #dgDlCard .dgdl-fill {
            height: 100%; width: 0; border-radius: 999px; background: var(--dgc-accent);
            transition: width .25s ease;
        }
        /* Before Content-Length is known there is no fraction to show, so the bar says "working"
           rather than lying about a position. */
        #dgDlCard.indeterminate .dgdl-fill {
            width: 35%; animation: dgDlSlide 1.1s ease-in-out infinite alternate;
        }
        @keyframes dgDlSlide { from { margin-left: 0; } to { margin-left: 65%; } }
        #dgDlCard .dgdl-sub {
            font-size: 11.5px; color: var(--dgc-muted); font-variant-numeric: tabular-nums;
        }
        /* Set only while a stalled connection is being retried — see downloadInto() in
           db-worker.js — the one thing worth screenshotting instead of pulling logcat. */
        #dgDlCard .dgdl-debug {
            font-size: 10.5px; font-family: monospace; color: var(--dgc-faint); opacity: 0.8;
            margin-top: 4px;
        }
        /* The card can be folded into a thin "thread": progress keeps moving, the page underneath
           is not covered. The choice is the reader's screen, not this download, so it is remembered.
           The card itself stays pointer-events:none (a tap meant for the page must not be eaten) —
           only the toggle and the folded strip accept clicks. */
        #dgDlCard .dgdl-toggle {
            flex: none; width: 22px; height: 22px; padding: 0; border: 0; cursor: pointer;
            background: transparent; color: var(--dgc-faint); border-radius: 6px;
            display: inline-flex; align-items: center; justify-content: center;
        }
        #dgDlCard .dgdl-toggle:hover { color: var(--dgc-ink); background: var(--dgc-sunk); }
        #dgDlCard .dgdl-close {
            flex: none; width: 22px; height: 22px; padding: 0; border: 0; cursor: pointer;
            background: transparent; color: var(--dgc-faint); border-radius: 6px;
            display: inline-flex; align-items: center; justify-content: center;
        }
        #dgDlCard .dgdl-close:hover { color: #c0392b; background: var(--dgc-sunk); }
        #dgDlCard .dgdl-toggle svg { transition: transform .18s ease; }
        #dgDlCard .dgdl-head { align-items: center; }
        #dgDlCard .dgdl-pct { margin-left: auto; }
        #dgDlCard .dgdl-facts { min-height: 32px; display: flex; align-items: center; }
        #dgDlCard .dgdl-fact {
            font-size: 12px; line-height: 1.35; color: var(--dgc-muted);
            opacity: 0; transform: translateY(4px);
            transition: opacity .35s ease, transform .35s ease;
        }
        #dgDlCard .dgdl-fact.dgdl-fact-in { opacity: 1; transform: translateY(0); }
        #dgDlCard.dgdl-collapsed { padding: 8px 12px 9px; gap: 6px; border-radius: 14px; cursor: pointer; }
        #dgDlCard.dgdl-collapsed .dgdl-title,
        #dgDlCard.dgdl-collapsed .dgdl-sub,
        #dgDlCard.dgdl-collapsed .dgdl-facts,
        #dgDlCard.dgdl-collapsed .dgdl-debug { display: none; }
        #dgDlCard.dgdl-collapsed .dgdl-track { height: 4px; }
        #dgDlCard.dgdl-collapsed .dgdl-toggle svg { transform: rotate(180deg); }
        #dgDlCard .dgdl-toggle, #dgDlCard .dgdl-close, #dgDlCard.dgdl-collapsed { pointer-events: auto; }
        @media (prefers-reduced-motion: reduce) {
            #dgConsent, #dgConsentSheet, #dgDlCard, #dgDlCard .dgdl-fill,
            #dgDlCard .dgdl-fact, #dgDlCard .dgdl-toggle svg { transition: none; }
            #dgDlCard.indeterminate .dgdl-fill { animation: none; }
        }
    `;
    document.head.appendChild(style);

    let bar = null;
    function ensureBar() {
        if (bar) return bar;
        bar = document.createElement('div');
        bar.id = 'dgOfflineStatus';
        bar.className = 'bubble-notification info';
        document.body.appendChild(bar);
        return bar;
    }

    // Owner: "очень хорошо было бы иметь прогресс бар загрузки". The download is 170MB — a line
    // of text saying "50%" gives no sense of whether it is moving, and this is the longest wait
    // the app ever asks anyone to sit through.
    var dlCard = null;
    function ensureDlCard() {
        if (dlCard) return dlCard;
        dlCard = document.createElement('div');
        dlCard.id = 'dgDlCard';
        dlCard.setAttribute('role', 'status');
        dlCard.setAttribute('aria-live', 'polite');
        dlCard.innerHTML =
            '<div class="dgdl-head">' +
                '<span class="dgdl-title"></span>' +
                '<span class="dgdl-pct"></span>' +
                '<button class="dgdl-toggle" type="button" aria-expanded="true" aria-label="' +
                    (isRuLang() ? 'Свернуть в полоску' : 'Collapse to a bar') + '">' +
                    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
                    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                    '<path d="M6 9l6 6 6-6"/></svg>' +
                '</button>' +
                // Started by mistake, or on mobile data: stopping has to be one tap away, not hidden
                // behind a settings page (owner). Cancelling also deletes the partial download, so
                // the next visit does not silently pick it up again.
                '<button class="dgdl-close" type="button" aria-label="' +
                    (isRuLang() ? 'Отменить загрузку' : 'Cancel the download') + '">' +
                    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
                    'stroke-width="2.4" stroke-linecap="round" aria-hidden="true">' +
                    '<path d="M6 6l12 12M18 6L6 18"/></svg>' +
                '</button>' +
            '</div>' +
            '<div class="dgdl-track"><div class="dgdl-fill"></div></div>' +
            '<div class="dgdl-sub"></div>' +
            '<div class="dgdl-facts"><span class="dgdl-fact"></span></div>' +
            '<div class="dgdl-debug" hidden></div>';
        document.body.appendChild(dlCard);

        var toggle = dlCard.querySelector('.dgdl-toggle');
        function applyCollapsed(collapsed) {
            dlCard.classList.toggle('dgdl-collapsed', collapsed);
            toggle.setAttribute('aria-expanded', String(!collapsed));
            toggle.setAttribute('aria-label', collapsed
                ? (isRuLang() ? 'Развернуть' : 'Expand')
                : (isRuLang() ? 'Свернуть в полоску' : 'Collapse to a bar'));
            try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch (e) { /* приватный режим */ }
        }
        toggle.addEventListener('click', function (event) {
            event.stopPropagation();
            applyCollapsed(!dlCard.classList.contains('dgdl-collapsed'));
        });
        dlCard.querySelector('.dgdl-close').addEventListener('click', function (event) {
            event.stopPropagation();
            // The card goes at once — waiting for the worker to unwind a 479MB transfer would look
            // like the button did nothing. app.js answers with a short "cancelled" toast.
            stopFacts();
            dlCard.classList.remove('show');
            if (typeof window.dgCancelOfflineDownload === 'function') window.dgCancelOfflineDownload();
        });
        // Folded, the whole strip is the target — it is 4px of bar and a percentage, nothing else.
        dlCard.addEventListener('click', function () {
            if (dlCard.classList.contains('dgdl-collapsed')) applyCollapsed(false);
        });
        var stored = null;
        try { stored = localStorage.getItem(COLLAPSE_KEY); } catch (e) { /* приватный режим */ }
        applyCollapsed(stored === '1');
        return dlCard;
    }

    // What the reader is actually buying with 479MB and several minutes of their connection. A small
    // rotation rather than a paragraph: it fills the wait with something true and useful instead of
    // a motionless percentage (owner: "чтобы не скучно было и информативно"). Kept strictly to what
    // the offline layer really serves — see docs/OFFLINE_PWA_PLAN.md: search, the reader with its
    // ru+en translations and Pali editions, navigation between suttas. NOT listed, because they stay
    // online: Google TTS, dictionaries, script conversion (?script=), other languages.
    // Only claims the slice actually backs (checked against the built dg-mobile.db: kind=root,
    // kind=translation for ru+en, kind=variant; nothing else). Deliberately absent: the bjt/vri/siam
    // editions (file-based, not in dg.db), Google TTS, dictionaries, script conversion, other
    // languages — all of those stay online.
    var FACTS = {
        ru: [
            // First slide on purpose: backgrounding the tab (or letting the device sleep) is what
            // actually kills this transfer, and it comes back around every cycle. Says "device", not
            // "phone": the same library installs and works on a laptop or desktop browser.
            'Не выключайте устройство и не сворачивайте браузер',
            'Поиск в Суттах и Винае — без интернета',
            'Чтение Сутт и Винаи офлайн, с переводами',
            'Языки: пали, английский и русский',
            // Honest about what stays online: the reader should not discover it by hitting an error
            // offline. TTS uses Google's service and script conversion is done by the server.
            'Озвучка Google и конвертация системы письма работают только онлайн',
            'Переходы между суттами, закладки и история — тоже офлайн',
            'Прервали загрузку? Она продолжится с того же места',
            'Библиотека живёт на устройстве — искать можно и в самолёте'
        ],
        en: [
            'Keep the device on and leave this tab open',
            'Search the Suttas and Vinaya — no connection',
            'Read the Suttas and Vinaya offline, translations included',
            'Languages: Pali, English and Russian',
            'Google TTS and script conversion work online only',
            'Sutta-to-sutta navigation, bookmarks and history offline too',
            'Download interrupted? It resumes where it stopped',
            'The library lives on your device — search on a plane'
        ]
    };
    var factIndex = 0;
    var factTimer = null;
    function stopFacts() {
        if (factTimer) { clearInterval(factTimer); factTimer = null; }
    }
    function startFacts(card) {
        if (factTimer) return;
        var el = card.querySelector('.dgdl-fact');
        var show = function () {
            var lines = FACTS[isRuLang() ? 'ru' : 'en'];
            el.classList.remove('dgdl-fact-in');
            el.textContent = lines[factIndex % lines.length];
            factIndex++;
            // Force a reflow so the fade restarts even when the same node is reused twice in a row.
            void el.offsetWidth;
            el.classList.add('dgdl-fact-in');
        };
        show();
        factTimer = setInterval(show, 4200);
    }

    var dlHideTimer = null;
    var lastSubText = null;   // last "X of Y MB" actually worth showing (see the done event above)
    window.addEventListener('dg:dl-progress', function (e) {
        var detail = e.detail || {};
        var loaded = detail.loaded || 0;
        var total = detail.total || 0;
        var ru = isRuLang();
        var card = ensureDlCard();
        var pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : null;

        // 'import' means the gzipped file has fully crossed the network (see downloadInto()'s
        // networkDone in db-worker.js) and what is left is unpacking it — no percentage worth
        // showing for that, it is a few hundred ms of local CPU, not more waiting on a connection.
        var importing = detail.phase === 'import';
        // titleRu/titleEn: an explicit override for a download this event shape also carries but
        // that isn't the main database — script-engine.js's engine install (app.js's
        // ensureScriptMode()) reuses this exact card/event rather than a second one, distinguished
        // only by its own title text (kind: 'script-engine' is otherwise unused here, present for
        // any future listener that does need to tell them apart).
        card.querySelector('.dgdl-title').textContent = importing
            ? (ru ? 'Распаковка и применение' : 'Unpacking and applying')
            : (detail.titleRu && detail.titleEn ? (ru ? detail.titleRu : detail.titleEn)
                                                 : (ru ? 'Загрузка офлайн-библиотеки' : 'Downloading the offline library'));
        if (importing) pct = null;
        // 100% used to mean "ready", which it does not: after the bytes arrive the file is checked and
        // opened, and that can still fail. Say what is happening instead of claiming success.
        // The final "done" event carries loaded:1/total:1 (a sentinel, not a size), so the line used
        // to end with "0.0 MB of 0.0 MB" — at the one moment the reader is actually looking at it.
        // Remember the last real numbers and keep showing them.
        var realNumbers = total && total > 1048576;
        var verifying = !detail.done && pct === 100;
        if (verifying) card.querySelector('.dgdl-title').textContent = ru ? 'Проверяем и открываем' : 'Verifying and opening';
        // With no denominator there is still one honest number — the bytes received — and leaving
        // the slot empty was the worst of the options: the collapsed strip is nothing BUT the bar
        // and this number, so folded it showed a sliding bar with no information at all (owner:
        // "в свернутом прогресс бане тоже из стороны в сторону качается заливка и не понятно
        // сколько скачано"). db-worker.js now falls back to the manifest size, so a percentage is
        // the normal case; this covers the one that is left (a server publishing no manifest).
        card.querySelector('.dgdl-pct').textContent = pct === null
            ? (loaded ? formatMb(loaded) + (ru ? ' МБ' : ' MB') : '')
            : pct + '%';
        // The bar itself is only meaningless when there is no denominator — keep the animation
        // exactly for that case.
        card.classList.toggle('indeterminate', pct === null);
        if (pct !== null) card.querySelector('.dgdl-fill').style.width = pct + '%';
        var subText = importing ? ''
            : total
                ? (ru ? formatMb(loaded) + ' МБ из ' + formatMb(total) + ' МБ'
                      : formatMb(loaded) + ' MB of ' + formatMb(total) + ' MB')
                : (ru ? formatMb(loaded) + ' МБ' : formatMb(loaded) + ' MB');
        if (realNumbers) lastSubText = subText;
        card.querySelector('.dgdl-sub').textContent = (detail.done && !realNumbers && lastSubText)
            ? lastSubText : subText;

        // Set only while a stalled connection is being retried (see STALL_MS/downloadInto in
        // db-worker.js) — the one thing worth a screenshot instead of pulling logcat.
        var debugEl = card.querySelector('.dgdl-debug');
        debugEl.textContent = detail.reason || '';
        debugEl.hidden = !debugEl.textContent;

        card.classList.add('show');

        // The rotation runs while bytes are crossing the network, and stops for the import phase
        // (nothing to read then: it is local CPU) and once the library is ready.
        if (!detail.done && !importing) startFacts(card); else stopFacts();

        clearTimeout(dlHideTimer);
        // detail.done is set on downloadInto()'s own final post(), not inferred from loaded/total —
        // the import phase reports 0/0 (see above), which the old loaded>=total check would never
        // read as finished.
        if (detail.done) {
            card.querySelector('.dgdl-title').textContent = detail.titleRu && detail.titleEn
                ? (ru ? detail.titleRu : detail.titleEn)
                : (ru ? 'Библиотека готова' : 'Library ready');
            dlHideTimer = setTimeout(function () { card.classList.remove('show'); }, 2500);
        }
    });

    // app.js dispatches this (and awaits the resolve it carries) only when a download is
    // actually needed AND the connection isn't Wi-Fi — never on a fully-cached return visit.
    //
    // The figure comes from the published manifest, which app.js fetches before asking — so the
    // dialog states the file that is actually about to cross the connection, not a number compiled
    // in months ago.
    //
    // Two figures, both from the manifest: the archive that downloads (bytes_gz) and the database it
    // unpacks into on the device (bytes). A manifest without bytes_gz (an older server, or the
    // native build's platform) shows the one number it has. FALLBACK_MB is only for a server old
    // enough to publish no manifest.
    const FALLBACK_MB = 170;
    function sizeMb(bytes) { return bytes ? Math.round(bytes / 1048576) : FALLBACK_MB; }
    window.addEventListener('dg:need-consent', function (e) {
        e.detail.resolve(askConsent(isRuLang(), e.detail));
    });

    // Returns a Promise<boolean>, which is what app.js's hasNetworkConsent() awaits — the same
    // contract window.confirm() had, minus the blocking. Anything that dismisses without
    // choosing (Esc, tapping outside) counts as "not now": declining is recoverable from
    // Settings, while starting a ~170MB transfer nobody asked for is not.
    function askConsent(ru, detail) {
        var mb = sizeMb(detail && detail.bytes);
        var approx = (detail && detail.bytes) ? '' : '~';
        var gzMb = detail && detail.bytesGz ? sizeMb(detail.bytesGz) : null;
        var unit = '<span>' + (ru ? 'МБ' : 'MB') + '</span>';
        var langs = (detail && detail.langs) || 'ru,en';
        return new Promise(function (resolve) {
            var previouslyFocused = document.activeElement;
            var overlay = document.createElement('div');
            overlay.id = 'dgConsent';
            overlay.innerHTML =
                '<div id="dgConsentSheet" role="alertdialog" aria-modal="true"' +
                     ' aria-labelledby="dgConsentTitle" aria-describedby="dgConsentBody">' +
                  '<div class="dgc-eyebrow">' + (ru ? 'Офлайн-библиотека' : 'Offline library') + '</div>' +
                  '<p class="dgc-title" id="dgConsentTitle">' +
                    (ru ? 'Скачать тексты для работы без сети?' : 'Download the texts for offline use?') +
                  '</p>' +
                  '<p class="dgc-body" id="dgConsentBody">' +
                    (gzMb
                        ? (ru ? 'Скачивается сжатый архив, на устройстве он распаковывается в базу. Сейчас соединение не через Wi-Fi; загрузку можно отложить и запустить позже в Настройках.'
                              : 'A compressed archive downloads and unpacks into the database on the device. You are not on Wi-Fi right now; you can postpone this and start it later from Settings.')
                        : (ru ? 'Сейчас соединение не через Wi-Fi; загрузку можно отложить и запустить позже в Настройках.'
                              : 'You are not on Wi-Fi right now; you can postpone this and start it later from Settings.')) +
                  '</p>' +
                  '<dl class="dgc-figures">' +
                    (gzMb
                      ? '<div class="dgc-fig"><dt>' + (ru ? 'Скачать' : 'Download') + '</dt><dd>' + gzMb + unit + '</dd></div>' +
                        '<div class="dgc-fig"><dt>' + (ru ? 'На устройстве' : 'On device') + '</dt><dd>' + mb + unit + '</dd></div>'
                      : '<div class="dgc-fig"><dt>' + (ru ? 'Размер' : 'Size') + '</dt><dd>' + approx + mb + unit + '</dd></div>') +
                    '<div class="dgc-fig dgc-fig-wide"><dt>' + (ru ? 'Языки' : 'Languages') + '</dt>' +
                      '<dd>' + languageList(langs, ru) + '</dd></div>' +
                  '</dl>' +
                  '<div class="dgc-actions">' +
                    '<button type="button" class="dgc-ghost">' + (ru ? 'Не сейчас' : 'Not now') + '</button>' +
                    '<button type="button" class="dgc-primary">' + (ru ? 'Скачать' : 'Download') + '</button>' +
                  '</div>' +
                '</div>';
            document.body.appendChild(overlay);
            // Next frame, so the .show transition has an initial state to animate from.
            requestAnimationFrame(function () { overlay.classList.add('show'); });

            var buttons = overlay.querySelectorAll('button');
            var settled = false;
            function close(answer) {
                if (settled) return;
                settled = true;
                document.removeEventListener('keydown', onKey, true);
                overlay.classList.remove('show');
                setTimeout(function () { overlay.remove(); }, 200);
                if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
                resolve(answer);
            }
            function onKey(ev) {
                if (ev.key === 'Escape') { ev.preventDefault(); close(false); return; }
                if (ev.key !== 'Tab') return;
                // Two focusable elements, so a manual wrap is enough to keep focus in the sheet.
                ev.preventDefault();
                var idx = ev.shiftKey ? 0 : 1;
                buttons[document.activeElement === buttons[idx] ? (idx ? 0 : 1) : idx].focus();
            }
            buttons[0].addEventListener('click', function () { close(false); });
            buttons[1].addEventListener('click', function () { close(true); });
            overlay.addEventListener('click', function (ev) { if (ev.target === overlay) close(false); });
            document.addEventListener('keydown', onKey, true);
            buttons[1].focus();
        });
    }

    // Same sheet as askConsent() above (identical #dgConsent/#dgConsentSheet/.dgc-* markup and
    // CSS, different copy/buttons) — asked once, the first time any request needs a non-default
    // script (app.js's ensureScriptMode()), for the offline Aksharamukha+Pyodide engine
    // (script-engine.js) rather than the main database. Kept as its own function instead of
    // parameterising askConsent(): that one's figures (size/languages) are specific to the
    // single-file database download, and bending it to fit a second, differently-shaped question
    // risked breaking the one already proven to work on real devices.
    window.addEventListener('dg:need-script-consent', function (e) {
        e.detail.resolve(askScriptConsent(isRuLang()));
    });

    function askScriptConsent(ru) {
        return new Promise(function (resolve) {
            var previouslyFocused = document.activeElement;
            var overlay = document.createElement('div');
            overlay.id = 'dgConsent';
            overlay.innerHTML =
                '<div id="dgConsentSheet" role="alertdialog" aria-modal="true"' +
                     ' aria-labelledby="dgScriptConsentTitle" aria-describedby="dgScriptConsentBody">' +
                  '<div class="dgc-eyebrow">' + (ru ? 'Система письма' : 'Script conversion') + '</div>' +
                  '<p class="dgc-title" id="dgScriptConsentTitle">' +
                    (ru ? 'Работать онлайн или скачать модуль офлайн?' : 'Work online, or download the offline module?') +
                  '</p>' +
                  '<p class="dgc-body" id="dgScriptConsentBody">' +
                    (ru ? 'Показ пали в другой системе письма (деванагари, тайская и т.п.) использует отдельный движок — Aksharamukha, ~16 МБ. Скачайте один раз, и дальше это работает без сети; либо оставайтесь онлайн — тогда для каждого такого запроса нужен интернет. Выбор можно позже изменить, повторно выбрав другую систему письма.'
                        : 'Showing Pali in another script (Devanagari, Thai, etc.) uses a separate engine — Aksharamukha, ~16MB. Download it once and this keeps working with no connection; or stay online, which needs a connection for every such request. You can change this later by switching scripts again.') +
                  '</p>' +
                  '<div class="dgc-actions">' +
                    '<button type="button" class="dgc-ghost">' + (ru ? 'Онлайн' : 'Online') + '</button>' +
                    '<button type="button" class="dgc-primary">' + (ru ? 'Скачать (~16 МБ)' : 'Download (~16MB)') + '</button>' +
                  '</div>' +
                '</div>';
            document.body.appendChild(overlay);
            requestAnimationFrame(function () { overlay.classList.add('show'); });

            var buttons = overlay.querySelectorAll('button');
            var settled = false;
            function close(answer) {
                if (settled) return;
                settled = true;
                document.removeEventListener('keydown', onKey, true);
                overlay.classList.remove('show');
                setTimeout(function () { overlay.remove(); }, 200);
                if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
                resolve(answer);
            }
            function onKey(ev) {
                if (ev.key === 'Escape') { ev.preventDefault(); close(false); return; }
                if (ev.key !== 'Tab') return;
                ev.preventDefault();
                var idx = ev.shiftKey ? 0 : 1;
                buttons[document.activeElement === buttons[idx] ? (idx ? 0 : 1) : idx].focus();
            }
            buttons[0].addEventListener('click', function () { close(false); });
            buttons[1].addEventListener('click', function () { close(true); });
            overlay.addEventListener('click', function (ev) { if (ev.target === overlay) close(false); });
            document.addEventListener('keydown', onKey, true);
            buttons[1].focus();
        });
    }

    // Owner: "добавь спиннер даже на открытие текстов, чтобы юзер понимал что уже нажал" — a
    // small persistent dot in the corner, not a bubble/toast: text opens are usually fast (see
    // app.js's withLoadingEvent + the index fix in build-offline-db.js), so this should read as
    // "working" for a beat, not steal the screen like the download banner does.
    let loadingDot = null;
    let loadingTimer = null;
    window.addEventListener('dg:api-loading', function (e) {
        if (e.detail.active) {
            // Delayed show — after the index/batching fix (build-offline-db.js,
            // buildApiTextResponse) most opens resolve well under this, so the common case is no
            // flash at all; only genuinely slow ones (first run, big sutta) show it.
            loadingTimer = setTimeout(function () {
                if (!loadingDot) {
                    loadingDot = document.createElement('div');
                    loadingDot.id = 'dgApiLoadingDot';
                    document.body.appendChild(loadingDot);
                }
                loadingDot.classList.add('show');
            }, 150);
        } else {
            clearTimeout(loadingTimer);
            if (loadingDot) loadingDot.classList.remove('show');
        }
    });

    if (window.dgOfflineLibrary && typeof window.dgOfflineLibrary.then === 'function') {
        window.dgOfflineLibrary.then(function () {
            // Nothing was ever shown — already fully cached, ready resolved near-instantly.
            // Stay silent, exactly as the owner asked ("полоска не должна даже мелькать").
            if (!bar) return;
            bar.classList.remove('show');
            if (typeof window.showBubbleNotification === 'function') {
                window.showBubbleNotification(
                    isRuLang() ? 'Офлайн-библиотека готова' : 'Offline library ready', 2500, 'success'
                );
            }
        }).catch(function (err) {
            // Two very different outcomes used to share one message. Declining the cellular-data
            // prompt is a CHOICE; a failed request is a FAULT — and telling someone they
            // postponed a download that never got the chance to start sends them to a retry
            // button that cannot fix a server with no file to serve. That is exactly how a
            // missing https://<DIST_BASE>/core.db presented: "download postponed", instantly,
            // with nothing to retry.
            //
            // loadData() marks the choice explicitly ('offline-data-download-declined'), so
            // anything else is a real failure and now says what went wrong — fetchDbBytes throws
            // "<file>: HTTP <status>", which points straight at the server rather than the user.
            // A deliberate cancel is neither a decline nor a fault: the card's × already answered.
            if (err && /cancelled/.test(err.message || '')) return;
            // Nothing is installed, so a card sitting at 100% would be a lie — take it away and let
            // the message below explain what happened.
            if (dlCard) { stopFacts(); dlCard.classList.remove('show'); }
            var declined = err && err.message === 'offline-data-download-declined';
            if (!declined) console.error('[dg-offline] database download failed:', err);

            // Owner: a permanent banner just sits there forever after declining — a few-second
            // heads-up is enough (same toast the success path already uses below); Settings'
            // own "Offline library" row (offline-library-settings.js) is the persistent, always-
            // visible reminder/retry point, this doesn't need to duplicate that by staying up.
            // A real error gets longer on screen: unlike a decline, it isn't something the
            // reader already knows they did.
            // Отказ хранилища ("Failed to execute 'createSyncAccessHandle'") значит ровно одно:
            // файлы базы уже держит другая вкладка — в OPFS они монопольные. app.js к этому
            // моменту уже повторил попытку со свежим воркером, так что сырой DOMException в
            // подсказке бесполезен: человеку нужно действие, а не текст исключения.
            var busy = /Access Handle|createSyncAccessHandle|NoModificationAllowed/i.test((err && err.message) || '');
            var text = declined
                ? (isRuLang() ? 'Скачивание отложено — повторите в Настройках'
                              : 'Download postponed — retry from Settings')
                : busy
                ? (isRuLang() ? 'Библиотека открыта в другой вкладке сайта. Закройте её и повторите в Настройках'
                              : 'The library is open in another tab. Close it and retry from Settings')
                : (isRuLang() ? 'Не удалось скачать данные: ' : 'Could not download data: ') +
                  ((err && err.message) || (isRuLang() ? 'неизвестная ошибка' : 'unknown error'));

            if (typeof window.showBubbleNotification === 'function') {
                window.showBubbleNotification(text, declined ? 4000 : 9000, declined ? 'info' : 'error');
            }
        });
    }

    /* Сверка версии базы уже была (app.js checkForUpdate на каждой загрузке), но узнать о новой
       сборке можно было, только зайдя в Настройки: событие никто не слушал. Одна подсказка —
       один раз на сборку, чтобы не долбить на каждой загрузке. Скачивание по-прежнему по кнопке
       в Настройках: пол-гигабайта не качают без спроса (docs/OFFLINE_PWA_PLAN.md). */
    var UPDATE_SEEN_KEY = 'dg.offline.updateSeen';
    window.addEventListener('dg:update-available', function (e) {
        var build = (e.detail && e.detail.build_id) || '';
        try {
            if (localStorage.getItem(UPDATE_SEEN_KEY) === build) return;
            localStorage.setItem(UPDATE_SEEN_KEY, build);
        } catch (err) { /* приватный режим — покажем подсказку, просто каждый раз */ }
        var text = isRuLang()
            ? 'Офлайн-библиотека обновилась — скачать новую версию можно в Настройках'
            : 'The offline library has a new version — download it from Settings';
        // Системное уведомление, если разрешение уже дано (просим его в момент скачивания
        // библиотеки — см. ниже; сами по себе окна с запросом прав не всплывают). Это локальное
        // уведомление через уже зарегистрированный service worker: ни сервера, ни push-подписок
        // для него не нужно, и в PWA/TWA/Capacitor оно работает одинаково.
        if (!systemNotify(text) && typeof window.showBubbleNotification === 'function') {
            window.showBubbleNotification(text, 7000, 'info');
        }
    });

    function systemNotify(text) {
        try {
            if (!window.Notification || Notification.permission !== 'granted') return false;
            if (!navigator.serviceWorker || !navigator.serviceWorker.ready) return false;
            navigator.serviceWorker.ready.then(function (reg) {
                reg.showNotification('Dhamma.Gift', {
                    body: text,
                    tag: 'dg-offline-update',          // новая заменяет старую, а не копится
                    icon: '/assets/img/pwa-bold-monocolor-192.png',
                });
            }).catch(function () { /* нет SW — останется пузырь */ });
            return true;
        } catch (e) { return false; }
    }

    /* Разрешение спрашиваем один раз и только у того, кто сам начал качать библиотеку: он уже
       сказал, что офлайн ему нужен, и обновление этой базы — единственное, о чём мы шлём. */
    var ASKED_KEY = 'dg.offline.notifyAsked';
    window.addEventListener('dg:dl-progress', function () {   // качает — значит офлайн ему нужен
        try {
            if (!window.Notification || Notification.permission !== 'default') return;
            if (localStorage.getItem(ASKED_KEY)) return;
            localStorage.setItem(ASKED_KEY, '1');
            Notification.requestPermission();
        } catch (e) { /* приватный режим */ }
    });
})();
