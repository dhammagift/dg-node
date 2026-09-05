import type { ReactNode } from 'react';
import { ResultsTable, ResultRow, Match, ExternalLinks } from '@dhammagift/dg-ui';

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

// A ResultRow is a <tr>; it needs the table around it to be laid out at all.
const sources = (slug: string) => (
  <ExternalLinks
    links={[
      { label: 'DPR', href: `https://www.digitalpalireader.online/_dprhtml/index.html?q=${slug}`, title: 'Myanmar and Thai Editions at DPR' },
      { label: 'BJT', href: `https://tipitaka.lk/${slug}`, title: 'Buddha Jayanthi' },
      { label: 'SC', href: `https://suttacentral.net/${slug}`, title: 'SuttaCentral.net' },
    ]}
  />
);

export const RussianTitle = () => (
  <ResultsTable>
    <ResultRow
      suttaId="sn35.240"
      paliTitle="Kummopamasutta"
      translatedTitle="Пример с черепахой"
      titleLang="ru"
      matchedWords={<><Match>kacchapo</Match>, <Match>kacchapaṁ</Match></>}
      sources={sources('sn35.240')}
    />
  </ResultsTable>
);

export const EnglishTitle = () => (
  <ResultsTable>
    <ResultRow
      suttaId="sn56.11"
      paliTitle="Dhammacakkappavattanasutta"
      translatedTitle="Setting the Wheel of Dhamma Rolling"
      titleLang="en"
      matchedWords={<><Match>cakkhuṁ</Match>, <Match>cakkhumā</Match></>}
      sources={sources('sn56.11')}
    />
  </ResultsTable>
);

export const ReadMarked = () => (
  <ResultsTable>
    <ResultRow
      readMark
      read
      suttaId="dn22"
      paliTitle="Mahāsatipaṭṭhānasutta"
      translatedTitle="Большое наставление о способах установления памятования"
      matchedWords={<><Match>satipaṭṭhānā</Match></>}
      sources={sources('dn22')}
    />
    <ResultRow
      readMark
      suttaId="mn10"
      paliTitle="Satipaṭṭhānasutta"
      translatedTitle="Наставление о способах установления памятования"
      matchedWords={<><Match>satipaṭṭhānā</Match>, <Match>satipaṭṭhānaṁ</Match></>}
      sources={sources('mn10')}
    />
  </ResultsTable>
);

export const IdentityOnly = () => (
  <ResultsTable>
    <ResultRow suttaId="dhp1" paliTitle="Yamakavagga" translatedTitle="Глава парных строф" />
  </ResultsTable>
);

/** One row in dark theme, read-marked — the matched forms keep the .finder highlight. */
export const DarkTheme = () => (
  <Dark>
    <ResultsTable>
      <ResultRow
        readMark
        read
        suttaId="dn22"
        paliTitle="Mahāsatipaṭṭhānasutta"
        translatedTitle="Большое наставление о способах установления памятования"
        matchedWords={<><Match>satipaṭṭhānā</Match>, <Match>satipaṭṭhāne</Match></>}
        sources={sources('dn22')}
      />
      <ResultRow
        readMark
        suttaId="mn10"
        paliTitle="Satipaṭṭhānasutta"
        translatedTitle="Наставление о способах установления памятования"
        matchedWords={<><Match>satipaṭṭhānā</Match>, <Match>satipaṭṭhānaṁ</Match></>}
        sources={sources('mn10')}
      />
    </ResultsTable>
  </Dark>
);
