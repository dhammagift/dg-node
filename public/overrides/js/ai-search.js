// ai-search.js — AI-search fallback screen (docs/AI_SEARCH_BRIEF.md, docs/AI_MODE_DESIGN.md).
// Renders into #ai-pane (empty by default, see home.css) the same way spa/toc.js fills #toc-pane:
// the container stays in the markup always, content is built here only when actually needed.
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

    // dpdict.net/dict.dhamma.gift live at /dict/ (siteroot mount, see docs/AI_SEARCH_BRIEF.md) —
    // ?q= is the URL param its own frontend reads to jump straight to a word's entry.
    function dictUrl(word, lang) {
        return (lang === 'ru' ? '/dict/ru/' : '/dict/') + '?q=' + encodeURIComponent(word);
    }

    function wordChip(w, lang) {
        return `<a class="aiword" href="${esc(dictUrl(w.word, lang))}" target="_blank" rel="noopener">`
            + `${esc(w.word)}${w.gloss ? `<em>${esc(w.gloss)}</em>` : ''}</a>`;
    }

    // segment_id from search_hybrid (e.g. "mn129:24.3") is already this site's own reader URL
    // shape (see CLAUDE.md — /dn22:2.2) — no conversion needed, just prefix a slash.
    //
    // Owner: "кликая по словам, я сразу перехожу в ридер" — the whole card used to be one <a>,
    // so any click inside the quote (a word, whitespace, anywhere) fired the reader navigation.
    // Only .sid is a real link now, same split as the plain results table's mainLink.
    //
    // Owner: "контекстное меню... не должно быть сложного" — the quote line below is built with
    // the EXACT same markup search-render.js emits for a results-table row (same classes:
    // pli-lang/en-lang/quote/quoteLink-start/quoteLink/fdgLink, same data-slug shape, same
    // quote-segment wrapper id) so it's picked up by the SAME global ✦-link/context-menu handlers
    // (search/index.html: quoteContextMenu(), revealQuoteLinkOnTap()) — those were widened to also
    // accept #ai-pane alongside #search-pane, nothing here reimplements that logic.
    function quoteLine(langClass, langAttr, text, links) {
        return `<span class="${langClass} quote" lang="${langAttr}">${links.unhidden} ${esc(text)} ${links.hidden}</span>`
            + `<br class="styled ${langClass} quote" lang="${langAttr}">`;
    }

    function suttaCard(s) {
        const title = s.titlePali ? esc(s.titlePali.trim()) : esc(s.suttaId);
        const href = `/${esc(s.segmentId)}`;
        const links = {
            unhidden: `<a target="_blank" class="fdgLink quoteLink-start text-reset text-decoration-none" href="${href}" data-slug="${esc(s.segmentId)}"></a>`,
            hidden: `<a target="_blank" class="fdgLink quoteLink text-white text-decoration-none" href="${href}" data-slug="${esc(s.segmentId)}"></a>`,
        };
        const paliLine = quoteLine('pli-lang', 'pi', s.quotePali, links);
        const enLine = s.quoteEnglish ? quoteLine('en-lang text-muted', 'en', s.quoteEnglish, links) : '';
        return `<div class="aicard">`
            + `<div class="hd"><a class="sid" href="${href}">${esc(s.suttaId)}</a><b>${title}</b></div>`
            + `<div class="qg"><span id="${esc(s.segmentId)}" class="quote-segment">${paliLine}${enLine}</span></div>`
            + `</div>`;
    }

    function skeleton() {
        const cardSk = Array.from({ length: 3 }, () =>
            `<div class="aisk"><div class="skl" style="width:38%"></div><div class="skl" style="width:88%"></div><div class="skl" style="width:64%"></div></div>`
        ).join('');
        const wordSk = [104, 126, 88, 112, 96].map(w =>
            `<span class="skp" style="width:${w}px"></span>`
        ).join('');
        return { cardSk, wordSk };
    }

    function shell(query) {
        const { cardSk, wordSk } = skeleton();
        return `
<div class="ai">
  <div class="aihead">
    <h2 class="sheening">${esc(query)}</h2>
    <span class="n">точных совпадений нет — предположения ИИ</span>
  </div>
  <div id="ai-ready">
    <div class="aigrid">
      <section class="aisec cards">
        <h3>Возможно, эти сутты<button type="button" class="aicollapse" data-ai-collapse aria-pressed="true">Показать полностью</button></h3>
        <div class="aicards collapsed" id="ai-cards"></div>
      </section>
      <section class="aisec words"><h3>Похожие палийские слова</h3><div class="aiwords" id="ai-words"></div></section>
    </div>
    <div class="aifoot"><button type="button" data-ai-back>К точному поиску</button><span class="dis">ИИ может ошибаться — сверяйте найденное по самим суттам.</span></div>
  </div>
  <div id="ai-load">
    <p class="st"><span class="gi">⟳</span>Ищем по смыслу<span class="sub">обычно несколько секунд — словарь и поиск дольше пишущей машинки</span></p>
    <div class="aigrid">
      <section class="aisec cards"><h3>Возможно, эти сутты</h3><div class="aicards">${cardSk}</div></section>
      <section class="aisec words"><h3>Похожие палийские слова</h3><div class="aiwords">${wordSk}</div></section>
    </div>
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

    async function dgRunAiSearch(query, scope) {
        const pane = document.getElementById('ai-pane');
        if (!pane || !query) return;
        pane.innerHTML = shell(query);
        pane.querySelectorAll('[data-ai-back]').forEach(btn => btn.addEventListener('click', () => {
            if (window.dgSetState) window.dgSetState('results');
        }));
        const collapseBtn = pane.querySelector('[data-ai-collapse]');
        if (collapseBtn) collapseBtn.addEventListener('click', () => {
            const collapsed = collapseBtn.getAttribute('aria-pressed') === 'true';
            collapseBtn.setAttribute('aria-pressed', String(!collapsed));
            collapseBtn.textContent = collapsed ? 'Свернуть' : 'Показать полностью';
            const cardsEl = pane.querySelector('#ai-cards');
            if (cardsEl) cardsEl.classList.toggle('collapsed', !collapsed);
        });
        if (window.dgSetState) window.dgSetState('ai');
        pane.dataset.ai = 'load';

        const lang = (window.siteLanguage === 'en') ? 'en' : 'ru';
        // Same scope the exact search that fell back here just used (localStorage.dhammaSearchScope
        // / ?scope=, see search/index.html's initSearchApp) — falls back to the site's own default
        // resolution when not passed (e.g. the direct-button entry point, not yet wired to a scope).
        const effectiveScope = scope || localStorage.getItem('dhammaSearchScope') || 'default';
        let data;
        try {
            const res = await fetch(`/api/ai-search?q=${encodeURIComponent(query)}&lang=${lang}&scope=${encodeURIComponent(effectiveScope)}`);
            data = await res.json();
        } catch {
            pane.dataset.ai = 'error';
            return;
        }
        if (!data.ok) {
            pane.dataset.ai = 'error';
            return;
        }
        if (!data.suttas.length && !data.wordSuggestions.length) {
            pane.dataset.ai = 'empty';
            return;
        }
        const cardsEl = pane.querySelector('#ai-cards');
        const wordsEl = pane.querySelector('#ai-words');
        if (cardsEl) cardsEl.innerHTML = data.suttas.map(suttaCard).join('');
        if (wordsEl) wordsEl.innerHTML = data.wordSuggestions.map(w => wordChip(w, lang)).join('');
        // Typo fast path (see dg-fastify.js) returns words with no suttas at all — an empty
        // "Возможно, эти сутты" section with a live collapse button and nothing to collapse reads
        // as broken, not as "nothing found here on purpose".
        const cardsSection = pane.querySelector('.aisec.cards');
        if (cardsSection) cardsSection.hidden = !data.suttas.length;
        pane.dataset.ai = 'ready';
    }

    window.dgRunAiSearch = dgRunAiSearch;
})();
