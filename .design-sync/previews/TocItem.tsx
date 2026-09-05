import type { ReactNode } from 'react';
import { TocItem } from '@dhammagift/dg-ui';

// Dark theme is a class, not a prop: the tokens are redefined on `.dark`, and custom
// properties inherit, so putting the class on a wrapper themes everything inside it. The
// wrapper paints --dg-page itself — the card's own ground stays light otherwise.
//
// `.dark` alone is only half the app's theme switch, and the half that misses everything
// coloured by Bootstrap. themeswitch.js sets BOTH `body.dark` (which re-tokenizes --dg-*)
// and `data-bs-theme="dark"` on <html> (which re-tokenizes --bs-*), and the text colour of
// a Pali line, a table cell, a .text-muted translation, a link and a .form-control all come
// from --bs-body-color / --bs-body-bg. With `.dark` on its own the card's ground goes #111
// while the text stays #212529 — near-black on near-black. Bootstrap 5.3 scopes
// [data-bs-theme=dark] to any element, so the same wrapper can carry both.
//
// The wrapper also paints `color` for the same reason it paints `background`: re-tokenizing
// --bs-body-color does not re-run the `color` declaration that sits on <body>, so plain
// inherited text (a `.pli-lang` span carries no colour rule of its own outside a <p>) would
// keep inheriting the light-mode ink. --dg-text resolves to the same rgb(221,221,221) the
// reader's own `.dark p .pli-lang` uses.
const Dark = ({ children }: { children: ReactNode }) => (
  <div
    className="dark"
    data-bs-theme="dark"
    style={{ background: 'var(--dg-page)', color: 'var(--dg-text)', padding: 20 }}
  >
    {children}
  </div>
);

export const SuttaContents = () => (
  <div>
    <TocItem level="h1" pali="Mahāsatipaṭṭhānasutta" translated="Большое наставление о способах установления памятования" />
    <TocItem level="h2" pali="Uddesa" translated="Изложение" />
    <TocItem level="h2" pali="Kāyānupassanā" translated="Созерцание тела" />
    <TocItem level="h3" pali="Ānāpānapabba" translated="Раздел о дыхании" />
    <TocItem level="h3" pali="Iriyāpathapabba" translated="Раздел о положениях тела" />
    <TocItem level="h4" pali="Sampajānapabba" translated="Раздел о бдительности" />
  </div>
);

export const EnglishHeadings = () => (
  <div>
    <TocItem level="h1" lang="eng" pali="Dhammacakkappavattanasutta" translated="Setting the Wheel of Dhamma Rolling" />
    <TocItem level="h2" lang="eng" pali="Majjhimā paṭipadā" translated="The Middle Way" />
    <TocItem level="h2" lang="eng" pali="Cattāri ariyasaccāni" translated="The Four Noble Truths" />
    <TocItem level="h3" lang="eng" pali="Dukkhasamudayaṁ ariyasaccaṁ" translated="The Origin of Suffering" />
  </div>
);

export const PaliOnly = () => (
  <div>
    <TocItem level="h2" pali="Vedanānupassanā" />
    <TocItem level="h2" pali="Cittānupassanā" />
    <TocItem level="h2" pali="Dhammānupassanā" />
    <TocItem level="h3" pali="Nīvaraṇapabba" />
  </div>
);

export const TranslationOnly = () => (
  <div>
    <TocItem level="h2" translated="Созерцание чувств" />
    <TocItem level="h2" translated="Созерцание ума" />
    <TocItem level="h2" translated="Созерцание явлений" />
    <TocItem level="h3" translated="Раздел о помехах" />
  </div>
);

/** The contents list in dark theme — .dark .toc-item lifts the Pali to #e0e0e0 and the current row to #6ea8fe. */
export const DarkTheme = () => (
  <Dark>
    <div>
      <TocItem level="h1" pali="Mahāsatipaṭṭhānasutta" translated="Большое наставление о способах установления памятования" />
      <TocItem level="h2" pali="Uddesa" translated="Изложение" />
      <TocItem level="h2" className="active" pali="Kāyānupassanā" translated="Созерцание тела" />
      <TocItem level="h3" pali="Ānāpānapabba" translated="Раздел о дыхании" />
      <TocItem level="h3" lang="eng" pali="Iriyāpathapabba" translated="The Postures" />
      <TocItem level="h4" pali="Sampajānapabba" translated="Раздел о бдительности" />
    </div>
  </Dark>
);
