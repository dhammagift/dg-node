import { ResultsTable, ResultRow, Match, ExternalLinks } from '@dhammagift/dg-ui';

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
