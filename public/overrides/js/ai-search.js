// ai-search.js — AI-search fallback (docs/AI_SEARCH_BRIEF.md, docs/AI_MODE_DESIGN.md).
// #ai-pane only covers load/empty/error — a real sutta result switches back to the plain results
// screen and feeds the SAME #pali DataTable plain /search uses (window.DgSearchRender.
// buildDataTable is a singleton bound to #pali; a second instance isn't possible, and reusing it
// gets real DataTables triangles/child-row animation for free instead of an imitation). Word
// chips render into #ai-words, a sibling of #pali inside #search-pane, either way.
//
// Entry point: window.dgRunAiSearch(query) — called from the search flow when exact search
// returns 0 results. Escapes HTML manually (small template, not worth a dependency) since every
// piece of text here ultimately comes from network (search API results, DPD glosses).
(function () {
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    // Owner: "клик по слову вызывал текущий словарь, а ссылочка с иконкой — предзаполнила инпут"
    // — swapped from the previous layout (word=fill, icon=dict). The word itself is wired below to
    // the SITE'S OWN word-lookup pipeline (paliLookup.js's handleWordLookup, lazy-loaded via
    // window.dg_loadDictionaryScripts, same as clicking any [lang="pi"] word in a sutta) — owner:
    // "открывать просто словарь как обычный клик с настройкой которая выбрана пользователем" —
    // so it opens in whatever mode (standalone popup / new window / full page) and theme the
    // person already has picked in settings. The separate icon button just overwrites #paliauto,
    // it does NOT navigate/search on its own — the person can then look at it, edit it, or hit
    // search themselves. Icon: Font Awesome "magnifying-glass-arrow-right" — only ships in the
    // solid style in the free set actually installed here (checked node_modules directly, same
    // constraint documented elsewhere in search/index.html), so inlined as raw SVG rather than an
    // `<i class="fa-regular ...">` tag, which wouldn't render.
    const FILL_ICON_SVG = '<svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376C296.3 401.1 253.9 416 208 416 93.1 416 0 322.9 0 208S93.1 0 208 0 416 93.1 416 208zM305 225c9.4-9.4 9.4-24.6 0-33.9l-72-72c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l31 31-102.1 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l102.1 0-31 31c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l72-72z"/></svg>';
    function wordChip(w, lang) {
        const fillTitle = lang === 'ru' ? 'Подставить в поиск' : 'Put into search';
        return `<span class="aiword">`
            + `<button type="button" class="aiword-term" data-ai-dict-word="${esc(w.word)}">${esc(w.word)}${w.gloss ? `<em>${esc(w.gloss)}</em>` : ''}</button>`
            + `<button type="button" class="aiword-fill" data-ai-word="${esc(w.word)}" title="${esc(fillTitle)}" aria-label="${esc(fillTitle)}">${FILL_ICON_SVG}</button>`
            + `</span>`;
    }

    function putWordInInput(word) {
        const input = document.getElementById('paliauto');
        if (!input) return;
        input.value = word;
        if (window.DgHome && window.DgHome.syncInput) window.DgHome.syncInput();
        input.focus();
    }

    function cardSkeleton() {
        return Array.from({ length: 3 }, () =>
            `<div class="aisk"><div class="skl" style="width:38%"></div><div class="skl" style="width:88%"></div><div class="skl" style="width:64%"></div></div>`
        ).join('');
    }
    function wordSkeleton() {
        return [104, 126, 88, 112, 96].map(w =>
            `<span class="skp" style="width:${w}px"></span>`
        ).join('');
    }

    // Owner: "сделай чтобы режим подсказки слов был по умолчанию пока мы ждём варианты... они не
    // должны быть связаны, у одного один набор скелетов, у другого другой" — a single word (no
    // spaces) goes through DPD first, no LLM (dg-fastify.js) — was showing the SAME heavy loading
    // skeleton (sutta cards + words) built for the slow full-LLM pipeline, which reads as "still
    // searching for suttas" right up until it resolves into word-only chips. Two independent
    // loading blocks now, chosen by the same "is this a single word" split the backend already
    // uses — cosmetic only (whichever real branch the server actually took still decides what's
    // shown once the fetch resolves), just so the WAITING screen matches what's actually likely.
    function loadBlock(mode) {
        if (mode === 'words') {
            return `<p class="st"><span class="gi">⟳</span>Ищем в словаре<span class="sub">обычно меньше секунды</span></p>
    <div class="aiwords">${wordSkeleton()}</div>`;
        }
        return `<p class="st"><span class="gi">⟳</span>Ищем по смыслу<span class="sub">обычно несколько секунд — словарь и поиск дольше пишущей машинки</span></p>
    <div class="aigrid">
      <section class="aisec cards"><h3>Возможно, эти сутты</h3><div class="aicards">${cardSkeleton()}</div></section>
      <section class="aisec words"><h3>Похожие палийские слова</h3><div class="aiwords">${wordSkeleton()}</div></section>
    </div>`;
    }

    function shell(query, mode) {
        return `
<div class="ai">
  <div class="aihead">
    <h2>${esc(query)}</h2>
    <span class="n">${mode === 'words' ? 'точных совпадений нет — похожие слова' : 'точных совпадений нет — предположения ИИ'}</span>
  </div>
  <div id="ai-load">
    ${loadBlock(mode)}
  </div>
  <div id="ai-empty">
    <div class="aistate">
      <p class="ttl">Не нашлось ничего — ни точно, ни по смыслу</p>
      <p>Попробуйте написать запрос иначе или короче, дать палийский корень слова вместо перевода, описать другими словами.</p>
      <div class="acts"><button type="button" class="ghost" data-ai-back>К точному поиску</button></div>
    </div>
  </div>
  <div id="ai-error">
    <p class="aierr">Подсказки по смыслу сейчас недоступны. Точный поиск работает как обычно.</p>
    <div class="aifoot"><button type="button" data-ai-back>К точному поиску</button></div>
  </div>
</div>`;
    }

    // Owner: "анимация... должна быть только на время загрузки... вечно крутить не нужно" — the
    // sheen must stop once data actually arrives, but cutting mid-sweep looks broken, so it waits
    // for the current lap (animationiteration) to finish first. Same pattern as the D-refresh.html
    // mockup's own sheen() (docs/AI_MODE_DESIGN.md), ported here since the shell() template above
    // no longer hardcodes the class.
    function sheen(pane, on) {
        const h = pane.querySelector('.aihead h2');
        if (!h) return;
        if (on) { h.classList.add('sheening'); delete h.dataset.sheenStop; return; }
        if (!h.classList.contains('sheening') || h.dataset.sheenStop) return;
        h.dataset.sheenStop = '1';
        h.addEventListener('animationiteration', function stop() {
            h.removeEventListener('animationiteration', stop);
            h.classList.remove('sheening');
            delete h.dataset.sheenStop;
        });
    }

    // Owner: "для дебага... на запрос как он его нормализовал... в ряд ссылок, серую" — small
    // muted debug aid, not a real feature.
    // Owner: "на всех страницах внизу должен быть тултип" — all four AI-search outcomes (sutta
    // table, word-only chips, genuinely empty, technical error) get one, so `container` is passed
    // in rather than hardcoded to the DataTables toolbar (.dt-buttons only exists/shows for the
    // sutta-table outcome).
    // Owner: "сделай компактную ссылку для дебага... просто внизу маленькую кнопку raw data...
    // кнопки копировать на каждой строке" — went through a `title` attribute (invisible on
    // mobile, no hover there) then a Bootstrap tooltip (still just look-don't-touch) before
    // landing here: a plain toggle button that reveals a small panel, each field on its own row
    // with its own copy button — works identically on any device, and the values are easy to
    // paste elsewhere (e.g. into a bug report) instead of only being visually readable.
    // navigator.clipboard needs a secure context (HTTPS/localhost) — this test domain is HTTP
    // only (see CLAUDE.md), so it's silently undefined there; the old code's `?.writeText(...)`
    // just no-op'd and still claimed "Copied" regardless. execCommand('copy') via a throwaway
    // textarea is deprecated but has no such restriction, so it's the real fallback, not a
    // decoration — resolve/reject actually reflects whether a copy happened.
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
        return new Promise((resolve, reject) => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch { /* ok stays false */ }
            document.body.removeChild(ta);
            ok ? resolve() : reject(new Error('execCommand(copy) failed'));
        });
    }
    // Owner: "размести маленькую ссылку... не большую" — a small inline glyph right next to the
    // value, not a bordered pill button pinned to the row's far right edge (which is also what
    // was colliding with the bottom-right Pāli/translation pill on short pages, screenshot: "Copy"
    // covered/unclickable underneath it).
    function copyRow(label, value) {
        const row = document.createElement('div');
        row.className = 'ai-debug-row';
        const labelEl = document.createElement('span');
        labelEl.className = 'ai-debug-label';
        labelEl.textContent = label + ':';
        const valueEl = document.createElement('span');
        valueEl.className = 'ai-debug-value';
        valueEl.textContent = value;
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'ai-debug-copy';
        copyBtn.textContent = '⧉';
        copyBtn.title = 'Copy';
        copyBtn.setAttribute('aria-label', 'Copy');
        copyBtn.addEventListener('click', () => {
            copyText(value)
                .then(() => { copyBtn.textContent = '✓'; })
                .catch(() => { copyBtn.textContent = '✕'; })
                .finally(() => { setTimeout(() => { copyBtn.textContent = '⧉'; }, 1200); });
        });
        row.append(labelEl, valueEl, copyBtn);
        return row;
    }
    function showDebug(container, toggleLabel, rows) {
        document.querySelectorAll('.ai-debug-wrap').forEach(el => el.remove());
        if (!container || !rows || !rows.length) return;
        const wrap = document.createElement('div');
        wrap.className = 'ai-debug-wrap';
        // Owner: "сделай МАЛЕНЬКУЮ кнопку" — Bootstrap's .btn.btn-secondary.btn-link carries real
        // button padding/font-size, too big for a debug aid; a plain unstyled button + the small
        // CSS class below reads as the same kind of muted link as the copy icons it opens.
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'ai-debug-link';
        toggle.textContent = toggleLabel;
        const panel = document.createElement('div');
        panel.className = 'ai-debug-panel d-none';
        rows.forEach(([label, value]) => panel.appendChild(copyRow(label, value)));
        toggle.addEventListener('click', () => panel.classList.toggle('d-none'));
        wrap.append(toggle, panel);
        container.appendChild(wrap);
    }
    // Owner: "показываешь русский на англ странице... показывай тогда и там и там англ" — the
    // three field labels were hardcoded Russian regardless of interface language.
    function showDataDebug(container, debug, originalQuery, lang) {
        if (!debug) return;
        const t = lang === 'ru'
            ? { ai: 'ИИ', input: 'Инпут', candidates: 'Кандидаты', normalized: 'Нормализованный инпут' }
            : { ai: 'AI', input: 'Input', candidates: 'Candidates', normalized: 'Normalized input' };
        showDebug(container, `${t.ai} (${debug.provider}) — raw data`, [
            [t.input, originalQuery],
            [t.candidates, (debug.paliCandidates || []).join(', ') || '—'],
            [t.normalized, debug.normalizedQuery],
        ]);
    }

    async function dgRunAiSearch(query, scope) {
        const pane = document.getElementById('ai-pane');
        if (!pane || !query) return;

        // Owner: "переходи в ai режим когда это точно необходимо" — don't decide from word count;
        // switch to the AI loading screen only once the lookup has ACTUALLY been running long
        // enough to need one (delayed-spinner pattern). DPD-first lookups (core/dpd-lookup.js,
        // a single word or short phrase found in Pali/Ru/En) resolve well under this delay — no
        // screen, no flash, chips just appear on the plain "not found" already on screen. The slow
        // path (full LLM normalize + search, dg-fastify.js — a real description in none of those
        // languages) reliably takes longer and crosses it, which is exactly when a "thinking"
        // screen is worth showing at all.
        const AI_SCREEN_DELAY_MS = 500;
        // Owner: "сделай чтобы режим подсказки слов был по умолчанию" — mirrors dg-fastify.js's
        // own "single word, no spaces -> try DPD first" split, so the LOADING screen (if one ends
        // up needed at all) matches the branch this query is actually likely to take.
        const mode = /\s/.test(query.trim()) ? 'full' : 'words';
        let showedAiScreen = false;
        const showTimer = setTimeout(() => {
            showedAiScreen = true;
            pane.innerHTML = shell(query, mode);
            pane.querySelectorAll('[data-ai-back]').forEach(btn => btn.addEventListener('click', () => {
                if (window.dgSetState) window.dgSetState('results');
            }));
            if (window.dgSetState) window.dgSetState('ai');
            pane.dataset.ai = 'load';
            sheen(pane, true);
        }, AI_SCREEN_DELAY_MS);

        const lang = (window.siteLanguage === 'en') ? 'en' : 'ru';
        // Same scope the exact search that fell back here just used (localStorage.dhammaSearchScope
        // / ?scope=, see search/index.html's initSearchApp) — falls back to the site's own default
        // resolution when not passed (e.g. the direct-button entry point, not yet wired to a scope).
        const effectiveScope = scope || localStorage.getItem('dhammaSearchScope') || 'default';
        let data;
        try {
            const res = await fetch(`/api/ai-search?q=${encodeURIComponent(query)}&lang=${lang}&scope=${encodeURIComponent(effectiveScope)}`);
            data = await res.json();
        } catch (err) {
            clearTimeout(showTimer);
            if (!showedAiScreen) return; // plain "not found" already on screen, nothing more to add
            sheen(pane, false);
            pane.dataset.ai = 'error';
            showDebug(pane.querySelector('#ai-error'), `${lang === 'ru' ? 'ИИ' : 'AI'} — raw data`,
                [[lang === 'ru' ? 'Инпут' : 'Input', query], [lang === 'ru' ? 'Ошибка' : 'Error', 'network error: ' + ((err && err.message) || '—')]]);
            return;
        }
        clearTimeout(showTimer);
        if (!data.ok) {
            if (!showedAiScreen) return;
            sheen(pane, false);
            pane.dataset.ai = 'error';
            showDebug(pane.querySelector('#ai-error'), `${lang === 'ru' ? 'ИИ' : 'AI'} — raw data`,
                [[lang === 'ru' ? 'Инпут' : 'Input', query], [lang === 'ru' ? 'Ошибка' : 'Error', `${data.reason || 'unavailable'}: ${data.detail || '—'}`]]);
            return;
        }
        if (!data.suttas.length && !data.wordSuggestions.length) {
            if (!showedAiScreen) return;
            sheen(pane, false);
            pane.dataset.ai = 'empty';
            showDataDebug(pane.querySelector('#ai-empty .aistate'), data.debug, query, lang);
            return;
        }
        if (showedAiScreen) sheen(pane, false);

        // Owner: "по-настоящему DataTable" — sutta guesses go into the SAME #pali table plain
        // /search uses (window.DgSearchRender.buildDataTable is a singleton bound to #pali, a
        // second independent instance isn't possible — see docs/AI_SEARCH_BRIEF.md), so the
        // triangles/child-row expand are the real DataTables ones, not an imitation. #ai-pane is
        // only for load/empty/error now; a real result switches back to the plain results screen.
        if (data.suttas.length && window.DgSearchRender && window.dgSetState) {
            window.dgSetState('results');
            window.DgSearchRender.buildDataTable('#pali', data.suttas, query, 'en', true);
            if (window.jQuery) window.jQuery('#pali, #pali_wrapper').removeClass('d-none');
            const noteEl = document.getElementById('ai-note');
            if (noteEl) {
                noteEl.textContent = lang === 'ru'
                    ? 'Точных совпадений нет — предположения по смыслу, сверяйте найденное по самим суттам.'
                    : 'No exact matches — guesses by meaning, check what you find against the suttas themselves.';
                noteEl.classList.remove('d-none');
            }
            showDataDebug(document.getElementById('ai-note-wrap'), data.debug, query, lang);
        } else {
            // No suttas but words.length > 0 (checked above) — typo fast path (dg-fastify.js):
            // only the word chips have anything to show, #ai-pane stays dormant (no data-ai value
            // matches any of its four state blocks). Still has to switch back to 'results' (bug
            // found live: without this, body stayed dg-state-ai — set at the top of this function
            // for the loading state — whose CSS hides #search-pane entirely, so the chips existed
            // in the DOM but had a zero-size hidden ancestor and never appeared on screen at all).
            if (window.dgSetState) window.dgSetState('results');
            delete pane.dataset.ai;
            if (window.jQuery) window.jQuery('#pali, #pali_wrapper').addClass('d-none');
            // Owner: "Расширьте поиск (ссылка на быстрые настройки) or Did you mean:" — these ARE
            // the "did you mean" suggestions (DPD's own typo correction, dg-fastify.js), unlike
            // the sutta-guess note above; paired with a way to widen the search scope, since a
            // narrow scope is the other common reason nothing turned up. Reuses .dg-scope-change
            // (see #home-scope-summary further up this file) — same "open quick settings" link,
            // not a new pattern.
            const noteEl = document.getElementById('ai-note');
            if (noteEl) {
                const tryWord = lang === 'ru' ? 'Попробуйте' : 'Try';
                const expand = lang === 'ru' ? 'расширить поиск' : 'expand search';
                const or = lang === 'ru' ? 'или' : 'or';
                const mean = lang === 'ru' ? 'может быть, вы искали' : 'did you mean';
                noteEl.innerHTML = `${esc(tryWord)} <button type="button" class="dg-scope-change ai-expand-scope">${esc(expand)}</button> ${esc(or)} ${esc(mean)}:`;
                noteEl.classList.remove('d-none');
            }
            showDataDebug(document.getElementById('ai-note-wrap'), data.debug, query, lang);
        }

        const wordsEl = document.getElementById('ai-words');
        if (wordsEl) {
            if (data.wordSuggestions.length) {
                wordsEl.innerHTML = data.wordSuggestions.map(w => wordChip(w, lang)).join('');
                wordsEl.querySelectorAll('[data-ai-word]').forEach(btn => btn.addEventListener('click', () => {
                    putWordInInput(btn.dataset.aiWord);
                }));
                wordsEl.classList.remove('d-none');
            } else {
                wordsEl.classList.add('d-none');
            }
        }
        // home-bundle.js's Pāli/translation pill repaints off body's class-change (fired by
        // dgSetState above, BEFORE #pali/#ai-words had their real content) — nudge it again now
        // that they do, or it stays hidden (dgRenderLangPill only shows it in 'results' state when
        // one of them has content, see its own comment).
        if (window.dgRenderLangPill) window.dgRenderLangPill();
    }

    // Manual "ИИ-режим" toolbar button (search/index.html, #dg-toolbar-buttons) — re-runs the
    // CURRENT query through AI search on demand, regardless of whether exact search already
    // found something. One-shot only; the persistent zero/always/off modes from
    // docs/AI_MODE_DESIGN.md aren't built yet.
    document.addEventListener('click', function (e) {
        const btn = e.target.closest('#btn-ai-mode');
        if (!btn) return;
        const input = document.getElementById('paliauto');
        const query = input ? input.value.trim() : '';
        if (query) dgRunAiSearch(query);
    });

    // "Расширить поиск" in the did-you-mean note above — same "open quick settings" trigger as
    // #home-scope-summary's own .dg-scope-change button (search/index.html), just reused here.
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.ai-expand-scope')) return;
        const qsBtn = document.getElementById('dg-quick-btn');
        if (qsBtn) qsBtn.click();
    });

    // Clicking the word itself — same word-lookup pipeline every [lang="pi"] word on the site
    // already uses (paliLookup.js, lazy-loaded on first use by settings.js's
    // window.dg_loadDictionaryScripts). Calling handleWordLookup directly instead of just tagging
    // the button lang="pi" and letting the site's generic delegated handler pick it up: that
    // generic path extracts the word from the CLICKED TEXT itself (caret-position hit-testing,
    // paliLookup.js getClickedWordWithHTML) — fragile here since the button also renders a gloss
    // inside it (<em>...), not just the bare word.
    document.addEventListener('click', function (e) {
        const btn = e.target.closest('.aiword-term');
        if (!btn) return;
        const word = btn.dataset.aiDictWord;
        if (!word) return;
        if (window.handleWordLookup) {
            window.handleWordLookup(word, e);
        } else if (window.dg_loadDictionaryScripts) {
            window.dg_loadDictionaryScripts().then(() => {
                if (window.handleWordLookup) window.handleWordLookup(word, e);
            });
        }
    });

    // Owner: "не должен продолжать показывать подсказки если это уже новый и тем более успешный
    // поиск" — a real, successful exact search (search/index.html's initSearchApp) never calls
    // dgRunAiSearch again, so a PREVIOUS query's leftover "did you mean" note/chips/debug panel
    // (all just textContent/innerHTML written in place, never cleared on their own) kept sitting
    // above a totally unrelated, genuinely matched results table. Called from there whenever a
    // fresh search actually finds something, so stale AI-search leftovers never survive a real hit.
    function clearAiExtras() {
        const noteEl = document.getElementById('ai-note');
        if (noteEl) { noteEl.classList.add('d-none'); noteEl.textContent = ''; }
        const wordsEl = document.getElementById('ai-words');
        if (wordsEl) { wordsEl.classList.add('d-none'); wordsEl.innerHTML = ''; }
        document.querySelectorAll('.ai-debug-wrap').forEach(el => el.remove());
    }

    window.dgRunAiSearch = dgRunAiSearch;
    window.dgClearAiSearch = clearAiExtras;
})();
