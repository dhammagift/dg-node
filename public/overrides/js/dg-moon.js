/* <dg-moon> — луна Dhamma.gift / Uposatha. Одна для сайта, приложения и макетов виджета.

   Почему так устроена.
   - Поверхность — одна процедурная фактура: моря на своих местах, рельеф шумом, кратеры разных размеров
     с ракурсом к краю диска, лучевые кратеры Тихо / Коперник / Кеплер. Её генерируют один раз на страницу
     (≈50 мс) и потом переиспользуют во всех лунах.
   - Фаза — не «вырезанный кусок», а тень поверх целой луны. В новолуние видна та же луна, только в тени:
     пепельный свет, фактура едва читается.
   - Фаза непрерывная (0 — новолуние, 0.25 — первая четверть, 0.5 — полнолуние, 0.75 — последняя).
     Терминатор — эллипс с полуосью R·|cos 2πf|, тень двойная (резкая + широкая полутень) — цикл идёт плавно.
   - Фактура — это изображение, а не цвет интерфейса. Её серо-тёплая палитра живёт только здесь;
     ободок и свечение берутся из токенов --dg-*.

   Атрибуты: phase="0..1" · south (вид из Южного полушария: диск повёрнут на 180°)
             mono (одноцветная, для экранов блокировки) · glow (свечение по освещённости, для тёмных фонов).
   Размер: 1em × 1em — задаётся font-size или width/height снаружи.
   JS: el.phase = 0.4;  await el.animateTo(0.5, {cycles: 1, duration: 2000}); */
(() => {
  if (customElements.get('dg-moon')) return;
  const C = 50, R = 48;
  const PHOTO = (document.currentScript && document.currentScript.getAttribute('data-photo')) || '/assets/img/moon-nasa.webp';
  let uid = 0, TEX = null;
  const norm = f => ((f % 1) + 1) % 1;
  const illum = f => (1 - Math.cos(2 * Math.PI * norm(f))) / 2;

  // ---------- геометрия ----------
  // Освещённая часть — для нативного виджета (SwiftUI Path / Android Canvas повторяют её один в один).
  function litPath(f) {
    f = norm(f);
    const k = Math.cos(2 * Math.PI * f), rx = (Math.abs(k) * R).toFixed(3);
    if (f < 0.002 || f > 0.998) return 'M0 0Z';
    if (Math.abs(f - 0.5) < 0.002) return `M${C} ${C - R}A${R} ${R} 0 1 1 ${C} ${C + R}A${R} ${R} 0 1 1 ${C} ${C - R}Z`;
    const gib = k < 0;
    return f < 0.5
      ? `M${C} ${C - R}A${R} ${R} 0 0 1 ${C} ${C + R}A${rx} ${R} 0 0 ${gib ? 1 : 0} ${C} ${C - R}Z`
      : `M${C} ${C - R}A${R} ${R} 0 0 0 ${C} ${C + R}A${rx} ${R} 0 0 ${gib ? 0 : 1} ${C} ${C - R}Z`;
  }
  // Тень: терминатор + большая дуга за краем диска. Тень выходит за диск, поэтому размытие не даёт
  // светлой каймы по краю тёмной стороны.
  function shadePath(f) {
    f = norm(f);
    const k = Math.cos(2 * Math.PI * f), rx = (Math.abs(k) * R).toFixed(3), gib = k < 0, wax = f < 0.5, B = 62;
    const ts = wax ? (gib ? 0 : 1) : (gib ? 1 : 0), bs = wax ? 1 : 0;
    return `M${C} ${C - R}A${rx} ${R} 0 0 ${ts} ${C} ${C + R}L${C} ${C + B}A${B} ${B} 0 0 ${bs} ${C} ${C - B}Z`;
  }

  // ---------- фактура ----------
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, o) { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= .5; } return s; }
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  // Моря видимой стороны: [x, y, радиус] в долях радиуса диска (x вправо, y вниз). Гауссовы пятна складываются
  // и режутся порогом по искривлённым координатам — края сливаются в неровные берега, как у настоящих морей.
  const MARIA = [[-.58, .05, .40], [-.30, -.36, .27], [-.20, -.70, .11], [.05, -.72, .11], [.28, -.68, .09], [.18, -.38, .16], [.34, -.08, .20],
    [.66, -.28, .115], [.52, .20, .14], [.30, .34, .085], [-.16, .42, .16], [-.42, .46, .085], [.0, -.16, .085], [-.26, -.02, .12], [-.30, .22, .11]];

  function makeTexture() {
    const N = 420, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(N, N), D = img.data, MM = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + .5) / N * 2 - 1, v = (y + .5) / N * 2 - 1, i = (y * N + x) * 4;
      if (u * u + v * v > 1.02) { D[i + 3] = 0; continue; }
      const uw = u + (fbm(u * 3 + 11, v * 3 + 5, 4) - .5) * .22, vw = v + (fbm(u * 3 + 31, v * 3 + 17, 4) - .5) * .22;
      let F = 0;
      for (const [cx, cy, r] of MARIA) { const d = Math.hypot(uw - cx, vw - cy) / (r * .86); F += Math.exp(-d * d); }
      let M = ss(.36, .78, F + (fbm(u * 8 + 3, v * 8 + 9, 3) - .5) * .3);
      M *= .6 + .4 * fbm(u * 6 + 3, v * 6 + 9, 4);
      MM[y * N + x] = M;
      const n = fbm(u * 9 + 1, v * 9 + 2, 5), fine = vnoise(u * 60, v * 60);
      let L = .86 + (n - .5) * .26 + (fine - .5) * .05;
      L = L * (1 - M * .40);
      // тёплые возвышенности и холодноватые моря — серый, но не белый
      const hr = 214, hg = 205, hb = 190, mr = 128, mg = 128, mb = 130;
      D[i] = Math.min(255, (hr + (mr - hr) * M * .6) * L * 1.08);
      D[i + 1] = Math.min(255, (hg + (mg - hg) * M * .6) * L * 1.08);
      D[i + 2] = Math.min(255, (hb + (mb - hb) * M * .6) * L * 1.08);
      D[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const P = N / 2;
    // кратеры: степенной закон размеров, на морях реже; свет чуть сверху-слева — для глубины
    function crater(u, v, r) {
      const rho = Math.min(.98, Math.hypot(u, v)), a = Math.atan2(v, u), sq = Math.sqrt(1 - rho * rho);
      const x = P + u * P, y = P + v * P;
      const draw = (ox, oy, fn) => { ctx.save(); ctx.translate(x + ox, y + oy); ctx.rotate(a); ctx.scale(sq, 1); fn(); ctx.restore(); };
      draw(0, 0, () => { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, 'rgba(70,64,58,.14)'); g.addColorStop(.75, 'rgba(70,64,58,.08)'); g.addColorStop(1, 'rgba(70,64,58,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); });
      draw(r * .12, r * .12, () => { ctx.strokeStyle = 'rgba(40,35,30,.15)'; ctx.lineWidth = Math.max(.6, r * .22); ctx.beginPath(); ctx.arc(0, 0, r * .78, 0, 7); ctx.stroke(); });
      draw(-r * .1, -r * .1, () => { ctx.strokeStyle = 'rgba(255,250,240,.20)'; ctx.lineWidth = Math.max(.5, r * .16); ctx.beginPath(); ctx.arc(0, 0, r * .9, 0, 7); ctx.stroke(); });
    }
    for (let k = 0; k < 520; k++) {
      const r = .8 + 15 * Math.pow(rnd(), 5.2), t = rnd() * 6.283, s = Math.sqrt(rnd()) * .97, u = Math.cos(t) * s, v = Math.sin(t) * s;
      const m = MM[Math.floor((v + 1) / 2 * N) * N + Math.floor((u + 1) / 2 * N)] || 0;
      if (m > .45 && rnd() < .75) continue;
      crater(u, v, r * (N / 420));
    }
    // лучевые кратеры — самые узнаваемые светлые точки полнолуния
    for (const [u, v, rays, len, rr] of [[-.08, .78, 30, .75, 5], [-.24, -.06, 18, .35, 5.5], [-.48, -.05, 12, .22, 3], [.12, -.02, 8, .18, 2.5]]) {
      const x = P + u * P, y = P + v * P;
      ctx.lineCap = 'round';
      for (let i = 0; i < rays; i++) {
        const a = rnd() * 6.283, l = P * len * (.4 + .6 * rnd());
        const g = ctx.createLinearGradient(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.addColorStop(0, 'rgba(255,252,244,.07)'); g.addColorStop(1, 'rgba(255,252,244,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 2 + rnd() * 3.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
      }
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr * 2.2); g.addColorStop(0, 'rgba(255,252,246,.6)'); g.addColorStop(.35, 'rgba(255,252,246,.22)'); g.addColorStop(1, 'rgba(255,252,246,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr * 2.2, 0, 7); ctx.fill();
    }
    return cv;
  }
  // Одна картинка на страницу; data-URL (webp) — чтобы луна попадала и в печать, и в экспорт картинкой.
  const texture = () => TEX || (TEX = makeTexture().toDataURL('image/webp', .9));

  class DgMoon extends HTMLElement {
    static get observedAttributes() { return ['phase', 'mono', 'south', 'glow']; }
    constructor() {
      super();
      const n = ++uid, root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
:host{display:inline-block;width:1em;height:1em;line-height:0;vertical-align:middle;flex:none;
 --m-sh:color-mix(in oklab,var(--dg-navy,midnightblue) 70%,black);
 --m-rim:color-mix(in oklab,var(--dg-navy-ink,slategray) 22%,transparent);
 --m-glow:color-mix(in oklab,var(--dg-surface-hover,whitesmoke) 80%,var(--dg-match,sienna) 8%)}
:host([mono]) image{filter:grayscale(1) brightness(1.12) contrast(1.05)}
:host([mono]){--m-sh:black;--m-rim:color-mix(in oklab,white 40%,transparent);--m-glow:white}
svg{width:100%;height:100%;display:block;overflow:visible}
:host([south]) svg{transform:rotate(180deg)}
</style>
<svg viewBox="0 0 100 100" aria-hidden="true">
<defs>
<clipPath id="c${n}"><circle cx="${C}" cy="${C}" r="${R}"/></clipPath>
<radialGradient id="b${n}" cx="50%" cy="50%" r="50%"><stop offset=".5" stop-color="black" stop-opacity="0"/><stop offset=".86" stop-color="black" stop-opacity=".14"/><stop offset="1" stop-color="black" stop-opacity=".42"/></radialGradient>
<filter id="p${n}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4.5"/></filter>
<filter id="s${n}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.3"/></filter>
</defs>
<g clip-path="url(#c${n})">
<image class="tex" x="${C - R - .6}" y="${C - R - .6}" width="${2 * R + 1.2}" height="${2 * R + 1.2}" preserveAspectRatio="none"/>
<circle cx="${C}" cy="${C}" r="${R}" fill="url(#b${n})"/>
<path class="pen" style="fill:var(--m-sh)" opacity=".5" filter="url(#p${n})"/>
<path class="sha" style="fill:var(--m-sh)" opacity=".8" filter="url(#s${n})"/>
</g>
<circle cx="${C}" cy="${C}" r="${R - .4}" fill="none" style="stroke:var(--m-rim)" stroke-width=".8"/>
</svg>`;
      this._tex = root.querySelector('.tex');
      this._pen = root.querySelector('.pen');
      this._sha = root.querySelector('.sha');
      this._svg = root.querySelector('svg');
      this._f = 0;
    }
    connectedCallback() {
      if (!this._tex.getAttribute('href')) {
        // The photo (NASA SVS CGI Moon Kit, LROC colour map, near side, orthographic): public domain. Without it (offline, blocked) the procedural texture.
        this._tex.addEventListener('error', () => this._tex.setAttribute('href', texture()), { once: true });
        this._tex.setAttribute('href', PHOTO);
      }
      this._draw();
    }
    attributeChangedCallback(name) { if (name === 'phase') this._f = parseFloat(this.getAttribute('phase')) || 0; this._draw(); }
    get phase() { return this._f; }
    set phase(v) { this._f = +v || 0; this._draw(); }
    _draw() {
      const d = shadePath(this._f);
      this._sha.setAttribute('d', d); this._pen.setAttribute('d', d);
      const I = illum(this._f);
      this._svg.style.filter = this.hasAttribute('glow') ? `drop-shadow(0 0 ${(.02 + .05 * I).toFixed(3)}em color-mix(in oklab,var(--m-glow) ${Math.round(I * 40)}%,transparent))` : '';
    }
    // Плавный проход вперёд по фазам: cycles полных кругов и остановка на target.
    animateTo(target, { cycles = 1, duration = 2000 } = {}) {
      cancelAnimationFrame(this._raf);
      const from = this._f;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || duration <= 0) { this.phase = norm(target); return Promise.resolve(); }
      const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const t0 = performance.now(), span = (cycles + norm(norm(target) - norm(from))) || cycles;
      return new Promise(res => {
        const step = now => {
          const t = Math.min(1, (now - t0) / duration);
          this._f = from + span * ease(t); this._draw();
          if (t < 1) this._raf = requestAnimationFrame(step); else { this._f = norm(target); this._draw(); res(); }
        };
        this._raf = requestAnimationFrame(step);
      });
    }
  }
  DgMoon.litPath = litPath;
  DgMoon.shadePath = shadePath;
  DgMoon.illum = illum;
  DgMoon.texture = texture; // data-URL фактуры — нативный виджет кладёт её в ресурсы и затеняет той же геометрией
  customElements.define('dg-moon', DgMoon);
  window.DgMoon = DgMoon;
})();
