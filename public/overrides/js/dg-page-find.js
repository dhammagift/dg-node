/*!
 * dg-page-find.js — поиск по странице для dhamma.gift (замена браузерного Ctrl+F).
 * Чистый JS, без зависимостей. Только движок: сбор целей, нормализация, подсветка,
 * навигация, список совпадений. Разметку панели рисует UI-слой (см. ВНЕДРЕНИЕ.md).
 *
 * Почему свой поиск, а не браузерный:
 *   - пали пишется с диакритикой (satipaṭṭhāna), а люди набирают satipatthana;
 *   - в текстах много удвоений (kkh, сс, тт) и пунктуации внутри слов («bhikkhavo”ti»);
 *   - искать надо по ВСЕЙ странице, включая скрытые области (бургер-меню, оглавление,
 *     свёрнутые details) — браузер их не видит;
 *   - нужен список совпадений с адресами сегментов (dn22:12.1) и копированием ссылки.
 *
 * API:
 *   const find = new DGPageFind({ root, containers, onUpdate, reveal, segmentIdOf });
 *   find.setQuery('тан');            // пересобирает совпадения и подсвечивает
 *   find.setOption('wholeWord', true);
 *   find.next(); find.prev(); find.goTo(i);
 *   find.matches;                    // [{ index, id, text, before, hit, after, hidden }]
 *   find.destroy();                  // снять подсветку и слушатели
 *
 * Speed (owner, 2026-10-05: on DN 33 the panel took seconds to open and every letter froze
 * the page). What made it slow, and what replaced it:
 *   - every keystroke walked the DOM and normalised the whole text again, one character at a
 *     time with String.normalize() per character: the text and its normalised form are now
 *     built ONCE per container (an index), with a per-character cache, and only rebuilt when
 *     the container's DOM actually changes (MutationObserver) or an option changes;
 *   - every match was wrapped in a <mark> (thousands for one letter), and all of them were
 *     unwrapped and the text re-normalised on the next keystroke: matches are painted with the
 *     CSS Custom Highlight API (CSS.highlights) — ranges the browser paints, the DOM untouched,
 *     which is how the browsers' own find bars work. <mark> stays only as the fallback for an
 *     engine without the API;
 *   - each match's position was found by scanning all text nodes from the end: binary search;
 *   - the number of matches painted is capped (MAX_MATCHES): one letter on a long sutta is tens
 *     of thousands, and no one walks through them one by one.
 */
(function (global) {
  'use strict';

  /* Also typographic apostrophes and quotes (‘ ’ ‚ ‛ „ ‟ ʼ ` ´): SuttaCentral texts write avisayasmin’ti,
     bhikkhavo”ti — a query typed without them (avisayasminti) must still match. */
  var PUNCT = /[.,;:!?'"“”‘’‚‛„‟ʼ`´«»—–\-()\[\]…\/]/;
  var LETTER = /[\p{L}\p{N}]/u;
  var MAX_MATCHES = 3000;
  var HIGHLIGHTS = !!(global.CSS && global.CSS.highlights && typeof global.Highlight === 'function');

  var DEFAULTS = {
    wholeWord: false,       // ☐ по умолчанию
    ignorePunct: true,      // ☑
    ignoreDiacritics: true, // ☑ satipatthana → satipaṭṭhāna
    ignoreDoubles: true     // ☑ сс→с, тт→т, kkh→kh
  };

  function DGPageFind(opts) {
    opts = opts || {};
    this.root = opts.root || document.body;
    /* Контейнеры, по которым идёт поиск. Каждый: { el, label, hidden(), reveal() }.
       hidden() — функция: контейнер сейчас не виден (меню закрыто, details свёрнут).
       reveal() — раскрыть его перед подсветкой. Порядок массива = порядок совпадений. */
    this.containers = opts.containers || [{ el: this.root }];
    this.onUpdate = opts.onUpdate || function () {};
    this.segmentIdOf = opts.segmentIdOf || defaultSegmentId;
    this.markClass = opts.markClass || 'dg-find-mark';
    this.activeClass = opts.activeClass || 'is-active';
    this.options = Object.assign({}, DEFAULTS, opts.options);
    this.query = '';
    this.matches = [];
    this.total = 0;          // all matches, also beyond MAX_MATCHES
    this.active = -1;
    this._marks = [];
    this._charCache = null;
    var self = this;
    // The index stays valid until the DOM under a container changes (an SPA navigation, a lazily
    // filled outline). Our own <mark> fallback changes it too, which only costs a rebuild there.
    this._observer = typeof MutationObserver === 'function'
      ? new MutationObserver(function () { self.containers.forEach(function (c) { c._idx = null; }); })
      : null;
    if (this._observer) {
      this.containers.forEach(function (c) {
        if (c.el) self._observer.observe(c.el, { childList: true, characterData: true, subtree: true });
      });
    }
  }

  /* Адрес совпадения: ближайший предок с id вида dn22:12.1 — так строится ссылка на строку. */
  function defaultSegmentId(node) {
    var el = node.nodeType === 3 ? node.parentElement : node;
    while (el) {
      if (el.id) return el.id;
      el = el.parentElement;
    }
    return null;
  }

  /* One character as the search sees it ('' when it is dropped), cached: String.normalize() per
     character over a whole sutta was most of the old per-keystroke cost. */
  DGPageFind.prototype._piece = function (ch) {
    var cache = this._charCache || (this._charCache = Object.create(null));
    var p = cache[ch];
    if (p !== undefined) return p;
    var o = this.options;
    if (o.ignorePunct && PUNCT.test(ch)) p = '';
    else {
      p = ch.toLowerCase();
      if (o.ignoreDiacritics) p = p.normalize('NFD').replace(/[̀-ͯ]/g, '');
    }
    cache[ch] = p;
    return p;
  };

  /* Нормализация с картой индексов: norm[i] соответствует исходному символу map[i].
     Без карты нельзя вернуться к позиции в реальном тексте и подсветить её. */
  DGPageFind.prototype._norm = function (str) {
    var o = this.options, out = [], map = [], last = '', i, piece, c, k;
    for (i = 0; i < str.length; i++) {
      piece = this._piece(str[i]);
      for (k = 0; k < piece.length; k++) {
        c = piece[k];
        if (o.ignoreDoubles && c === last && LETTER.test(c)) continue;
        out.push(c); map.push(i); last = c;
      }
    }
    return { out: out.join(''), map: map };
  };

  /* Текст контейнера как одна строка + карта «позиция в строке → (текстовый узел, смещение)».
     Так совпадение может пересекать границы узлов (<span>, <b>, переводы внутри строки). */
  DGPageFind.prototype._collect = function (el) {
    var parts = [], starts = [], nodes = [], len = 0;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return NodeFilter.FILTER_REJECT;
        if (p.closest('.' + 'dg-find-panel')) return NodeFilter.FILTER_REJECT; // сама панель поиска
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = walker.nextNode())) {
      nodes.push(n); starts.push(len);
      parts.push(n.nodeValue); len += n.nodeValue.length;
    }
    return { text: parts.join(''), nodes: nodes, starts: starts };
  };

  // Binary search: the text node holding position pos.
  DGPageFind.prototype._locate = function (col, pos) {
    var lo = 0, hi = col.starts.length - 1, mid;
    if (hi < 0) return null;
    while (lo < hi) {
      mid = (lo + hi + 1) >> 1;
      if (col.starts[mid] <= pos) lo = mid; else hi = mid - 1;
    }
    return { node: col.nodes[lo], offset: pos - col.starts[lo] };
  };

  // The container's text and its normalised form, built once and reused while the DOM holds.
  DGPageFind.prototype._index = function (cont) {
    if (cont._idx && cont._idx.opts === this._optsKey()) return cont._idx;
    var col = (cont._idx && cont._idx.col) || this._collect(cont.el);
    var norm = this._norm(col.text);
    cont._idx = { col: col, norm: norm, opts: this._optsKey() };
    return cont._idx;
  };
  DGPageFind.prototype._optsKey = function () {
    var o = this.options;
    return [o.ignorePunct, o.ignoreDiacritics, o.ignoreDoubles].join('');
  };

  DGPageFind.prototype.setQuery = function (q) {
    this.query = q || '';
    this._rebuild();
  };

  DGPageFind.prototype.setOption = function (key, value) {
    this.options[key] = value;
    this._charCache = null;
    this._rebuild();
  };

  DGPageFind.prototype._rebuild = function () {
    this.clearMarks();
    this.matches = [];
    this.total = 0;
    var q = (this.query || '').trim();
    var nq = this._norm(q).out;
    if (!nq) { this.active = -1; this.onUpdate(this); return; }

    var self = this;
    this.containers.forEach(function (cont) {
      if (!cont.el) return;
      var idx = self._index(cont), col = idx.col, norm = idx.norm;
      var hidden = !!(cont.hidden && cont.hidden());
      var from = 0, at;
      while ((at = norm.out.indexOf(nq, from)) !== -1) {
        from = at + 1;
        var s = norm.map[at], e = norm.map[at + nq.length - 1] + 1;
        if (self.options.wholeWord) {
          var b = col.text[s - 1], a = col.text[e];
          if ((b && LETTER.test(b)) || (a && LETTER.test(a))) continue;
        }
        self.total++;
        if (self.matches.length >= MAX_MATCHES) continue;
        var startAt = self._locate(col, s);
        var endAt = self._locate(col, e - 1);
        if (!startAt || !endAt) continue;
        endAt = { node: endAt.node, offset: endAt.offset + 1 };
        self.matches.push({
          index: self.matches.length,
          container: cont,
          hidden: hidden,
          label: cont.label || null,
          id: null, // filled lazily: walking up for the segment id of every match was not free
          before: col.text.slice(Math.max(0, s - 24), s),
          hit: col.text.slice(s, e),
          after: col.text.slice(e, e + 32),
          _start: startAt, _end: endAt
        });
      }
    });
    this.matches.forEach(function (m) { m.id = self.segmentIdOf(m._start.node); });

    this._paint();
    this.active = this.matches.length ? Math.min(Math.max(this.active, 0), this.matches.length - 1) : -1;
    this._applyActive();
    this.onUpdate(this);
  };

  function rangeOf(m) {
    var r = document.createRange();
    r.setStart(m._start.node, m._start.offset);
    r.setEnd(m._end.node, m._end.offset);
    return r;
  }

  /* Highlights: one CSS highlight for all matches, one for the active one. The DOM is not
     touched, so the index stays valid between keystrokes and the line handlers (dictionary,
     link copying) are never disturbed. Without the API: <mark> via surroundContents, as before. */
  DGPageFind.prototype._paint = function () {
    var self = this;
    if (HIGHLIGHTS) {
      var all = new global.Highlight();
      this.matches.forEach(function (m) {
        try { m.range = rangeOf(m); all.add(m.range); } catch (e) { /* a node went away */ }
      });
      global.CSS.highlights.set('dg-find', all);
      return;
    }
    // с конца, чтобы ранее вставленные <mark> не сдвигали смещения следующих
    this.matches.slice().reverse().forEach(function (m) {
      try {
        var r = rangeOf(m);
        var mark = document.createElement('mark');
        mark.className = self.markClass;
        r.surroundContents(mark);
        m.el = mark;
        self._marks.push(mark);
      } catch (e) { /* совпадение пересекает границу элементов — пропускаем */ }
    });
  };

  DGPageFind.prototype.clearMarks = function () {
    if (HIGHLIGHTS) {
      global.CSS.highlights.delete('dg-find');
      global.CSS.highlights.delete('dg-find-active');
    }
    var parents = [];
    this._marks.forEach(function (mark) {
      var parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      if (parents.indexOf(parent) === -1) parents.push(parent);
    });
    parents.forEach(function (p) { p.normalize(); });
    this._marks = [];
  };

  /* dhamma.gift addition (not in the original vendor file): a container's reveal() only
     opens/closes it as a WHOLE (the drawer, the mini-TOC panel) — it says nothing about a
     specific collapsed node INSIDE an already-open container, e.g. one closed vagga among many
     already-fetched ones in the site's /toc tree (public/spa/toc.js, class "d-none" on each
     branch's child list). Walk up from the match and open every such ancestor on the way,
     clicking the real toggle header when there is one so toc.js's own open/closed bookkeeping
     (expandedBooks/expandedBranches) stays consistent — not just stripping the class. */
  function revealCollapsedAncestors(node) {
    var chain = [];
    for (var p = node && node.nodeType === 3 ? node.parentElement : node; p; p = p.parentElement) {
      chain.unshift(p);
    }
    chain.forEach(function (p) {
      if (p.tagName === 'DETAILS' && !p.open) p.open = true;
      if (p.classList && p.classList.contains('d-none')) {
        var header = p.previousElementSibling;
        if (header && (header.classList.contains('toc-branch-header') || header.classList.contains('toc-book-header'))) {
          header.click();
        } else {
          p.classList.remove('d-none');
        }
      }
    });
  }

  DGPageFind.prototype.goTo = function (i) {
    if (!this.matches.length) return;
    this.active = ((i % this.matches.length) + this.matches.length) % this.matches.length;
    var m = this.matches[this.active];
    /* Совпадение в скрытой области нельзя просто проскроллить: сначала раскрываем
       контейнер (открываем меню / details), потом подсвечиваем и ведём к нему. */
    if (m.hidden && m.container.reveal) {
      m.container.reveal();
      m.hidden = false;
    }
    revealCollapsedAncestors(m._start.node);
    this._applyActive();
    this.onUpdate(this);
  };

  DGPageFind.prototype.next = function () { this.goTo(this.active + 1); };
  DGPageFind.prototype.prev = function () { this.goTo(this.active - 1); };

  DGPageFind.prototype._applyActive = function () {
    var self = this;
    var m = this.matches[this.active];
    var box = null;
    if (HIGHLIGHTS) {
      if (m && m.range) {
        global.CSS.highlights.set('dg-find-active', new global.Highlight(m.range));
        box = m.range.getBoundingClientRect();
      } else {
        global.CSS.highlights.delete('dg-find-active');
      }
    } else {
      this.matches.forEach(function (x, i) {
        if (x.el) x.el.classList.toggle(self.activeClass, i === self.active);
      });
      if (m && m.el) box = m.el.getBoundingClientRect();
    }
    if (!box || (!box.width && !box.height)) return;
    var target = window.scrollY + box.top - window.innerHeight * 0.35;
    // Instant, like the browsers' own find: a smooth scroll across a long sutta (tens of thousands
    // of px) was still travelling when the reader looked, and the match was nowhere on screen.
    // 'instant', not 'auto': the site's CSS sets scroll-behavior:smooth, which 'auto' would follow.
    window.scrollTo({ top: Math.max(0, target), behavior: 'instant' });
  };

  /* Ссылка на строку — то, что копирует чип с id в списке совпадений. */
  DGPageFind.prototype.linkTo = function (i) {
    var m = this.matches[i];
    if (!m || !m.id) return location.href;
    return location.origin + location.pathname + '#' + m.id;
  };

  DGPageFind.prototype.destroy = function () {
    this.clearMarks();
    if (this._observer) this._observer.disconnect();
    this.containers.forEach(function (c) { c._idx = null; });
    this.matches = [];
    this.total = 0;
    this.active = -1;
  };

  DGPageFind.HIGHLIGHTS = HIGHLIGHTS;
  DGPageFind.MAX_MATCHES = MAX_MATCHES;
  DGPageFind.OPTION_LABELS = {
    wholeWord: 'Только целое слово',
    ignorePunct: 'Игнорировать пунктуацию',
    ignoreDiacritics: 'Игнорировать диакритику',
    ignoreDoubles: 'Игнорировать повторы букв (сс→с, тт→т)'
  };

  global.DGPageFind = DGPageFind;
  if (typeof module !== 'undefined' && module.exports) module.exports = DGPageFind;
})(typeof window !== 'undefined' ? window : this);
