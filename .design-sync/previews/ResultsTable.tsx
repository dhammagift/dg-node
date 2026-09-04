import { ResultsTable, ResultRow, Match, ExternalLinks } from '@dhammagift/dg-ui';

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
