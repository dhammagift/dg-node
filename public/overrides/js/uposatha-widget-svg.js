// The Uposatha widgets of the Windows 11 Widgets Board as PICTURES in the app's own look (owner, 2026-10-12: the cards built from the
// board's text blocks were "detached from our design": its font, its five text colours, no pills, no moon).
// The board draws an Adaptive Card and nothing else, but a card may hold an image, and an image may be an SVG given as data (seen on
// a real board, dg-apps probe run 25). So the worker draws each widget here, as an SVG string, from the same data as the cards
// (UposathaWidgetData.card), and the card is that one picture: the calendar with its bands and mini-moons, the moon, the day scale.
// One picture per size (small, medium, large: the board tells the size) and theme (light, dark). Everything is laid out in a box
// 268 wide (the card's content width); the board scales the picture to the card. No measuring: texts are anchored, never fitted.
// Nothing here touches the DOM or the network; test/uposatha-widget.js loads it in Node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UposathaWidgetSvg = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var W = 268, H = { small: 88, medium: 232, large: 540 };
  var FONT = "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
  // The widgets' palette (Android WidgetConfig.LIGHT_C / DARK_C, iOS WidgetTheme.swift); the cells are a step off the board's own card
  var PAL = {
    light: { cell: '#EEF4F2', text: '#1B1D19', text2: '#5C6058', muted: '#6E716A', accent: '#149C7C', ink: '#0F7C63', vikala: '#9B1C31', band: '#CFE9E2', gold: '#C4972F', goldBg: '#F5EAD0', plate: '#D1D7DD', line: '#DCE5E2', onAccent: '#FFFFFF', shade: '#1F2A3C', lit: '#EBD9A4', rim: '#2F4A63' },
    dark: { cell: '#333B39', text: '#E2E2E2', text2: '#B0B0B0', muted: '#8E8E8E', accent: '#149C7C', ink: '#1FB394', vikala: '#E0607A', band: '#1D4A40', gold: '#C9A13A', goldBg: '#3A3220', plate: '#4A5258', line: '#3F4947', onAccent: '#FFFFFF', shade: '#141B28', lit: '#E9DDB8', rim: '#8A9096' },
  };
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function n2(v) { return Math.round(v * 100) / 100; }
  // One line of text. o: { fill, w (weight), a (anchor: start | middle | end), ls (letter spacing) }
  function T(x, y, s, size, o) {
    o = o || {};
    return '<text x="' + n2(x) + '" y="' + n2(y) + '" font-size="' + size + '"' + (o.w ? ' font-weight="' + o.w + '"' : '') + (o.a ? ' text-anchor="' + o.a + '"' : '') +
      (o.ls ? ' letter-spacing="' + o.ls + '"' : '') + ' fill="' + o.fill + '">' + esc(s) + '</text>';
  }
  function R(x, y, w, h, rx, fill, stroke) {
    return '<rect x="' + n2(x) + '" y="' + n2(y) + '" width="' + n2(w) + '" height="' + n2(h) + '" rx="' + rx + '" fill="' + fill + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="1.2"' : '') + '/>';
  }
  // The moon: the night side is a dim blue-grey disc, the lit part warm, as on the page and the phone widgets. f: 0 new .. 0.5 full .. 1.
  // The lit part is the limb's half circle closed by the terminator's half ellipse (the same geometry as dg-moon.js / MoonGlyphLit).
  function moon(cx, cy, r, f, p, south) {
    f = ((f % 1) + 1) % 1;
    var out = '<circle cx="' + n2(cx) + '" cy="' + n2(cy) + '" r="' + r + '" fill="' + p.shade + '"/>';
    if (f >= 0.02 && f <= 0.98) {
      if (Math.abs(f - 0.5) < 0.02) out += '<circle cx="' + n2(cx) + '" cy="' + n2(cy) + '" r="' + r + '" fill="' + p.lit + '"/>';
      else {
        // the true crescent, a little thicker in the first 3 % of light so that the day after a new moon can be told from the new one (as dg-moon.js)
        var k = Math.cos(2 * Math.PI * f), q = 1 - Math.min(1, Math.abs(k)), thick = q + 0.05 * (1 - Math.exp(-q / 0.01)) * Math.exp(-q / 0.15);
        var rx = n2(Math.max(0, 1 - thick) * r), limb = f < 0.5 ? 1 : -1, term = k < 0 ? -limb : limb;
        if (south) { limb = -limb; term = -term; }
        out += '<path d="M' + n2(cx) + ' ' + n2(cy - r) + 'A' + r + ' ' + r + ' 0 0 ' + (limb > 0 ? 1 : 0) + ' ' + n2(cx) + ' ' + n2(cy + r) +
          'A' + rx + ' ' + r + ' 0 0 ' + (term > 0 ? 0 : 1) + ' ' + n2(cx) + ' ' + n2(cy - r) + 'Z" fill="' + p.lit + '"/>';
      }
    }
    return out + '<circle cx="' + n2(cx) + '" cy="' + n2(cy) + '" r="' + n2(r - 0.4) + '" fill="none" stroke="' + p.rim + '" stroke-opacity=".35" stroke-width=".8"/>';
  }
  // "5 d 9 h": the digits big, the units small beside them
  function counter(x, y, s, size, p) {
    var out = '<text x="' + x + '" y="' + y + '" fill="' + p.text + '">';
    String(s).split(' ').forEach(function (tok, i) {
      var digits = /^\d/.test(tok);
      out += '<tspan font-size="' + (digits ? size : n2(size * 0.46)) + '"' + (digits ? '' : ' font-weight="600"') + (i ? ' dx="' + (digits ? n2(size * 0.2) : n2(size * 0.06)) + '"' : '') + '>' + esc(tok) + '</tspan>';
    });
    return out + '</text>';
  }

  // ----- the pieces -----
  // The Uposatha: the moon, the day's title, when, the counter, the moon in words, kala. Returns the height taken.
  function uposatha(u, y, p, o) {
    var big = !o || !o.small, r = big ? 30 : 20, x = big ? 76 : 54, out = moon(r + 4, y + (big ? 46 : 40), r, u.ph, p, o && o.south);
    out += T(x, y + (big ? 14 : 13), u.title, big ? 12.5 : 12, { fill: p.ink, w: 700 });
    if (big) out += T(x, y + 31, u.to, 12, { fill: p.text });
    out += counter(x, y + (big ? 64 : 44), u.count, big ? 30 : 25, p);
    if (big && u.d1) out += T(x, y + 82, u.d1, 11.5, { fill: p.text2 });
    if (u.kala) out += T(x, y + (big ? 100 : 66), u.kalaShort || u.kala, 11.5, { fill: u.kalaColor === 'Good' ? p.ink : p.vikala, w: 700 });
    return { svg: out, h: big ? 108 : 74 };
  }
  // The next Uposathas: a mini-moon and a line each
  function nextList(title, rows, y, p, max) {
    var out = T(0, y + 9, String(title).toUpperCase(), 9.5, { fill: p.muted, w: 600, ls: 0.6 });
    rows.slice(0, max).forEach(function (r, i) {
      var yy = y + 26 + i * 20;
      out += moon(7, yy - 4, 5.5, r.ph, p) + T(20, yy, r.text, 12, { fill: p.text });
    });
    return { svg: out, h: 14 + Math.min(max, rows.length) * 20 };
  }
  // The month: weekday names, weeks, a band behind an Uposatha (its evening and its day joined), today in gold, mini-moons
  function month(m, y, rowH, p, o) {
    var cw = W / 7, out = T(0, y + 13, m.title, o && o.small ? 13 : 15, { fill: p.ink, w: 700 });
    m.wd.forEach(function (d, c) { out += T(c * cw + cw / 2, y + 31, String(d).toUpperCase(), 9, { fill: p.muted, a: 'middle', ls: 0.5 }); });
    var top = y + 37, moons = rowH >= 30;
    m.weeks.forEach(function (wk, r) {
      var y0 = top + r * rowH, cells = wk.cells;
      cells.forEach(function (c, i) {
        if (!c.d) return;
        out += R(i * cw + 1.5, y0 + 1.5, cw - 3, rowH - 3, 8, c.today ? p.goldBg : p.cell, c.today ? p.gold : null);
      });
      for (var i = 0; i < 7; i++) { // bands: a run of marked days in the week is one band
        if (!cells[i].mk) continue;
        var j = i; while (j + 1 < 7 && cells[j + 1].mk) j++;
        out += R(i * cw + 4, y0 + 4, (j - i + 1) * cw - 8, 17, 8.5, p.accent);
        i = j;
      }
      cells.forEach(function (c, i) {
        if (!c.d) return;
        out += T(i * cw + cw / 2, y0 + 16.5, c.d, 12.5, { a: 'middle', fill: c.mk ? p.onAccent : c.past ? p.muted : p.text, w: c.mk || c.today ? 700 : 400 });
        if (moons && c.mk === 'd') out += moon(i * cw + cw / 2, y0 + rowH - 8, 3.6, c.ph, p);
      });
    });
    return { svg: out, h: 37 + m.weeks.length * rowH };
  }
  // Day & night: the part now, kala, the scale from sunrise to the next sunrise with the moment now, and the six parts
  function dayNight(n, y, p, o) {
    var small = o && o.small, name = String(n.part).split(' · ')[0], note = String(n.until).slice(name.length).replace(/^\s*·\s*/, '');
    var out = T(0, y + (small ? 15 : 19), name, small ? 16 : 20, { fill: p.text, w: 600 });
    out += T(0, y + (small ? 30 : 36), note, small ? 11 : 12, { fill: p.text2 });
    if (n.kala) out += T(0, y + (small ? 46 : 54), n.kala, 11.5, { fill: n.kalaColor === 'Good' ? p.ink : p.vikala, w: 700 });
    var by = y + (small ? 56 : 66), total = n.bar.reduce(function (a, b) { return a + b.w; }, 0), x = 0;
    n.bar.forEach(function (b) {
      var w = b.w / total * W;
      out += R(x + 1.5, by, w - 3, small ? 9 : 10, 4, b.s === 'warning' ? p.accent : b.s === 'accent' ? p.plate : p.band);
      x += w;
    });
    if (n.frac != null) out += R(Math.max(0, Math.min(W - 2.4, n.frac * W - 1.2)), by - 3, 2.4, small ? 15 : 16, 1.2, p.text);
    if (small) return { svg: out, h: 74 };
    out += T(W / 2, by + 26, n.marks, 10.5, { fill: p.muted, a: 'middle' });
    var ly = by + 36;
    if (o && o.list === false) return { svg: out, h: ly - y };
    n.list.forEach(function (r, i) {
      var yy = ly + i * 19;
      if (r.cur) out += R(0, yy, W, 18, 6, p.cell);
      out += T(8, yy + 13, r.name, 12, { fill: p.text, w: r.cur ? 700 : 400 }) + T(W - 8, yy + 13, r.range, 12, { fill: r.cur ? p.ink : p.text2, w: r.cur ? 700 : 400, a: 'end' });
    });
    return { svg: out, h: ly - y + n.list.length * 19 };
  }
  function rule(y, p) { return '<path d="M0 ' + n2(y) + 'H' + W + '" stroke="' + p.line + '" stroke-width="1"/>'; }

  // ----- the widgets -----
  // kind: main | day | month; size: small | medium | large; theme: light | dark; model: UposathaWidgetData.card()
  function svg(kind, size, theme, model) {
    var p = PAL[theme === 'dark' ? 'dark' : 'light'], h = H[size] || H.medium, u = model.u, n = model.n, m = model.m, out = '', b, y = 0;
    var weeks = m.weeks.length;
    if (kind === 'month') {
      if (size === 'small') {
        out += T(0, 12, m.title, 13, { fill: p.ink, w: 700 });
        m.next.slice(0, 3).forEach(function (r, i) { out += moon(7, 28 + i * 20, 5.5, r.ph, p) + T(20, 32 + i * 20, r.text, 12, { fill: p.text }); });
      } else if (size === 'medium') out += month(m, 0, Math.min(34, (h - 37) / weeks), p).svg;
      else {
        b = month(m, 0, 36, p); out += b.svg; y = b.h + 12;
        b = nextList(m.nextTitle, m.next, y, p, 3); out += b.svg; y += b.h + 14;
        out += rule(y, p); y += 12;
        out += dayNight(n, y, p).svg;
      }
    } else if (kind === 'day') {
      if (size === 'small') out += dayNight(n, 0, p, { small: true }).svg;
      else {
        b = dayNight(n, 0, p); out += b.svg; y = b.h + 10;
        if (size === 'large') {
          out += rule(y, p); y += 12;
          b = uposatha(u, y, p); out += b.svg; y += b.h + 8;
          out += rule(y, p); y += 12;
          out += month(m, y, Math.min(30, (h - y - 37 - 2) / weeks), p).svg;
        }
      }
    } else {
      if (size === 'small') out += uposatha(u, 0, p, { small: true }).svg;
      else {
        b = uposatha(u, 0, p); out += b.svg; y = b.h + 10;
        b = nextList(u.nextTitle, u.next, y, p, size === 'large' ? 6 : 3); out += b.svg; y += b.h + 10;
        if (size === 'large') {
          out += rule(y, p); y += 12;
          out += month(m, y, Math.min(34, (h - y - 37 - 16) / weeks), p).svg;
          out += T(0, h - 3, model.updated, 9.5, { fill: p.muted });
        } else if (u.mode) out += T(0, h - 3, u.mode, 9.5, { fill: p.muted });
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + h + '" viewBox="0 0 ' + W + ' ' + h + '" font-family="' + FONT + '">' + out + '</svg>';
  }
  // As the address of an image (the card's Image.url)
  function uri(s) {
    var b = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64');
    return 'data:image/svg+xml;base64,' + b;
  }
  // Every picture of one widget: { small_light: 'data:...', small_dark, medium_light, ... }
  function images(kind, model) {
    var out = {};
    ['small', 'medium', 'large'].forEach(function (size) { ['light', 'dark'].forEach(function (theme) { out[size + '_' + theme] = uri(svg(kind, size, theme, model)); }); });
    return out;
  }
  return { svg: svg, uri: uri, images: images, W: W, H: H };
});
