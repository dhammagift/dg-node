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

// The sources cell of a real row: the fixed-order link strip the reader also shows.
const sources = (slug: string) => (
  <ExternalLinks
    links={[
      { label: 'DPR', href: `https://www.digitalpalireader.online/_dprhtml/index.html?q=${slug}`, title: 'Myanmar and Thai Editions at DPR' },
      { label: 'BJT', href: `https://tipitaka.lk/${slug}`, title: 'Buddha Jayanthi' },
      { label: 'SC', href: `https://suttacentral.net/${slug}`, title: 'SuttaCentral.net' },
    ]}
  />
);

export const KacchapaSearch = () => (
  <ResultsTable>
    <ResultRow
      suttaId="sn35.240"
      paliTitle="Kummopamasutta"
      translatedTitle="Пример с черепахой"
      matchedWords={<><Match>kacchapo</Match>, <Match>kacchapaṁ</Match></>}
      sources={sources('sn35.240')}
    />
    <ResultRow
      suttaId="sn56.47"
      paliTitle="Paṭhamachiggaḷayugasutta"
      translatedTitle="Ярмо с отверстием (первая)"
      matchedWords={<><Match>kacchapo</Match></>}
      sources={sources('sn56.47')}
    />
    <ResultRow
      suttaId="mn129"
      paliTitle="Bālapaṇḍitasutta"
      translatedTitle="Глупец и мудрец"
      matchedWords={<><Match>kacchapo</Match>, <Match>kacchapānaṁ</Match></>}
      sources={sources('mn129')}
    />
  </ResultsTable>
);

export const WithReadMarks = () => (
  <ResultsTable>
    <ResultRow
      readMark
      read
      suttaId="sn35.240"
      paliTitle="Kummopamasutta"
      translatedTitle="Пример с черепахой"
      matchedWords={<><Match>kacchapo</Match>, <Match>kacchapaṁ</Match></>}
      sources={sources('sn35.240')}
    />
    <ResultRow
      readMark
      suttaId="sn56.47"
      paliTitle="Paṭhamachiggaḷayugasutta"
      translatedTitle="Ярмо с отверстием (первая)"
      matchedWords={<><Match>kacchapo</Match></>}
      sources={sources('sn56.47')}
    />
    <ResultRow
      readMark
      read
      suttaId="mn129"
      paliTitle="Bālapaṇḍitasutta"
      translatedTitle="Глупец и мудрец"
      matchedWords={<><Match>kacchapo</Match>, <Match>kacchapānaṁ</Match></>}
      sources={sources('mn129')}
    />
  </ResultsTable>
);

export const EnglishTitles = () => (
  <ResultsTable>
    <ResultRow
      suttaId="dn22"
      paliTitle="Mahāsatipaṭṭhānasutta"
      translatedTitle="The Longer Discourse on Mindfulness Meditation"
      titleLang="en"
      matchedWords={<><Match>satipaṭṭhānā</Match>, <Match>satipaṭṭhāne</Match></>}
      sources={sources('dn22')}
    />
    <ResultRow
      suttaId="mn10"
      paliTitle="Satipaṭṭhānasutta"
      translatedTitle="Mindfulness Meditation"
      titleLang="en"
      matchedWords={<><Match>satipaṭṭhānā</Match>, <Match>satipaṭṭhānaṁ</Match></>}
      sources={sources('mn10')}
    />
    <ResultRow
      suttaId="sn47.1"
      paliTitle="Ambapālisutta"
      translatedTitle="In Ambapālī’s Wood"
      titleLang="en"
      matchedWords={<><Match>satipaṭṭhānā</Match></>}
      sources={sources('sn47.1')}
    />
  </ResultsTable>
);

export const SingleHit = () => (
  <ResultsTable>
    <ResultRow
      suttaId="sn56.11"
      paliTitle="Dhammacakkappavattanasutta"
      translatedTitle="Запуск колеса Дхаммы"
      matchedWords={<><Match>dhammacakkaṁ</Match></>}
      sources={sources('sn56.11')}
    />
  </ResultsTable>
);

/** The results table in dark theme — the .finder highlight on the matched words lifts to #DA420E. */
export const DarkTheme = () => (
  <Dark>
    <ResultsTable>
      <ResultRow
        suttaId="sn35.240"
        paliTitle="Kummopamasutta"
        translatedTitle="Пример с черепахой"
        matchedWords={<><Match>kacchapo</Match>, <Match>kacchapaṁ</Match></>}
        sources={sources('sn35.240')}
      />
      <ResultRow
        suttaId="sn56.47"
        paliTitle="Paṭhamachiggaḷayugasutta"
        translatedTitle="Ярмо с отверстием (первая)"
        matchedWords={<><Match>kacchapo</Match></>}
        sources={sources('sn56.47')}
      />
      <ResultRow
        suttaId="mn129"
        paliTitle="Bālapaṇḍitasutta"
        translatedTitle="Глупец и мудрец"
        matchedWords={<><Match>kacchapo</Match>, <Match>kacchapānaṁ</Match></>}
        sources={sources('mn129')}
      />
    </ResultsTable>
  </Dark>
);
