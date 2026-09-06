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
 */
(function (global) {
  'use strict';

  var PUNCT = /[.,;:!?'"“”«»—–\-()\[\]…\/]/;
  var LETTER = /[\p{L}\p{N}]/u;

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
    this.active = -1;
    this._marks = [];
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

  /* Нормализация с картой индексов: norm[i] соответствует исходному символу map[i].
     Без карты нельзя вернуться к позиции в реальном тексте и подсветить её. */
  DGPageFind.prototype._norm = function (str) {
    var o = this.options, out = '', map = [], i, ch, piece, c, k;
    for (i = 0; i < str.length; i++) {
      ch = str[i];
      if (o.ignorePunct && PUNCT.test(ch)) continue;
      piece = ch.toLowerCase();
      if (o.ignoreDiacritics) {
        piece = piece.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (!piece) continue;
      }
      for (k = 0; k < piece.length; k++) {
        c = piece[k];
        if (o.ignoreDoubles && out.length && out[out.length - 1] === c && LETTER.test(c)) continue;
        out += c; map.push(i);
      }
    }
    return { out: out, map: map };
  };

  /* Текст контейнера как одна строка + карта «позиция в строке → (текстовый узел, смещение)».
     Так совпадение может пересекать границы узлов (<span>, <b>, переводы внутри строки). */
  DGPageFind.prototype._collect = function (el) {
    var text = '', pieces = [];
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
      pieces.push({ node: n, start: text.length });
      text += n.nodeValue;
    }
    return { text: text, pieces: pieces };
  };

  DGPageFind.prototype._locate = function (pieces, pos) {
    for (var i = pieces.length - 1; i >= 0; i--) {
      if (pos >= pieces[i].start) return { node: pieces[i].node, offset: pos - pieces[i].start };
    }
    return null;
  };

  DGPageFind.prototype.setQuery = function (q) {
    this.query = q || '';
    this._rebuild();
  };

  DGPageFind.prototype.setOption = function (key, value) {
    this.options[key] = value;
    this._rebuild();
  };

  DGPageFind.prototype._rebuild = function () {
    this.clearMarks();
    this.matches = [];
    var q = (this.query || '').trim();
    var nq = this._norm(q).out;
    if (!nq) { this.active = -1; this.onUpdate(this); return; }

    var self = this;
    this.containers.forEach(function (cont) {
      var col = self._collect(cont.el);
      var norm = self._norm(col.text);
      var from = 0, at;
      while ((at = norm.out.indexOf(nq, from)) !== -1) {
        var s = norm.map[at], e = norm.map[at + nq.length - 1] + 1;
        from = at + 1;
        if (self.options.wholeWord) {
          var b = col.text[s - 1], a = col.text[e];
          if ((b && LETTER.test(b)) || (a && LETTER.test(a))) continue;
        }
        var startAt = self._locate(col.pieces, s);
        var endAt = self._locate(col.pieces, e);
        if (!startAt || !endAt) continue;
        self.matches.push({
          index: self.matches.length,
          container: cont,
          hidden: !!(cont.hidden && cont.hidden()),
          label: cont.label || null,
          id: self.segmentIdOf(startAt.node),
          before: col.text.slice(Math.max(0, s - 24), s),
          hit: col.text.slice(s, e),
          after: col.text.slice(e, e + 32),
          _start: startAt, _end: endAt
        });
      }
    });

    this._paint();
    this.active = this.matches.length ? Math.min(Math.max(this.active, 0), this.matches.length - 1) : -1;
    this._applyActive();
    this.onUpdate(this);
  };

  /* Подсветка через Range.surroundContents: не перерисовывает страницу и не ломает
     обработчики на сегментах (важно — на строках висят словарь и копирование ссылки). */
  DGPageFind.prototype._paint = function () {
    var self = this;
    // с конца, чтобы ранее вставленные <mark> не сдвигали смещения следующих
    this.matches.slice().reverse().forEach(function (m) {
      try {
        var r = document.createRange();
        r.setStart(m._start.node, m._start.offset);
        r.setEnd(m._end.node, m._end.offset);
        var mark = document.createElement('mark');
        mark.className = self.markClass;
        r.surroundContents(mark);
        m.el = mark;
        self._marks.push(mark);
      } catch (e) { /* совпадение пересекает границу элементов — пропускаем */ }
    });
  };

  DGPageFind.prototype.clearMarks = function () {
    this._marks.forEach(function (mark) {
      var parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
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
    this.matches.forEach(function (m, i) {
      if (!m.el) return;
      m.el.classList.toggle(self.activeClass, i === self.active);
    });
    var m = this.matches[this.active];
    if (!m || !m.el) return;
    var box = m.el.getBoundingClientRect();
    var target = window.scrollY + box.top - window.innerHeight * 0.35;
    window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  };

  /* Ссылка на строку — то, что копирует чип с id в списке совпадений. */
  DGPageFind.prototype.linkTo = function (i) {
    var m = this.matches[i];
    if (!m || !m.id) return location.href;
    return location.origin + location.pathname + '#' + m.id;
  };

  DGPageFind.prototype.destroy = function () {
    this.clearMarks();
    this.matches = [];
    this.active = -1;
  };

  DGPageFind.OPTION_LABELS = {
    wholeWord: 'Только целое слово',
    ignorePunct: 'Игнорировать пунктуацию',
    ignoreDiacritics: 'Игнорировать диакритику',
    ignoreDoubles: 'Игнорировать повторы букв (сс→с, тт→т)'
  };

  global.DGPageFind = DGPageFind;
  if (typeof module !== 'undefined' && module.exports) module.exports = DGPageFind;
})(typeof window !== 'undefined' ? window : this);
