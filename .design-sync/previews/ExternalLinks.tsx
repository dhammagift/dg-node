import { ExternalLinks } from '@dhammagift/dg-ui';

// Order is fixed and matches the legacy reader: Voice, 4nt, DPR, BJT, SC, TBW, bb, ai, Th.ru, Th.su.

export const RussianSutta = () => (
  <ExternalLinks
    links={[
      { label: 'Voice', href: '#', title: 'Text-to-Speech (Alt+R)' },
      { label: '4nt', href: 'https://s.4nt.org/dn/dn22/', title: 's.4nt.org' },
      { label: 'DPR', href: 'https://www.digitalpalireader.online/_dprhtml/index.html?q=dn22', title: 'Myanmar and Thai Editions at DPR' },
      { label: 'BJT', href: 'https://tipitaka.lk/dn-2-9', title: 'Buddha Jayanthi' },
      { label: 'SC', href: 'https://suttacentral.net/dn22', title: 'SuttaCentral.net' },
      { label: 'TBW', href: 'https://thebuddhaswords.net/dn/dn22.html', title: 'TheBuddhasWords.net' },
      { label: 'bb', href: '/b/?q=dn22', title: 'BB and Other translations' },
      { label: 'ai', href: '/ai/?q=dn22', title: 'AI' },
      { label: 'Th.ru', href: 'https://theravada.ru/Teaching/Canon/Suttanta/Texts/dn22-mahasatipatthana-sutta-sv.htm', title: 'Theravada.ru' },
      { label: 'Th.su', href: 'https://tipitaka.theravada.su/toc/translations/1091', title: 'Theravada.su' },
    ]}
  />
);

export const EnglishSutta = () => (
  <ExternalLinks
    links={[
      { label: 'Voice', href: '#', title: 'Text-to-Speech (Alt+R)' },
      { label: '4nt', href: 'https://s.4nt.org/sn/sn56/', title: 's.4nt.org' },
      { label: 'DPR', href: 'https://www.digitalpalireader.online/_dprhtml/index.html?q=sn56.11', title: 'Myanmar and Thai Editions at DPR' },
      { label: 'BJT', href: 'https://tipitaka.lk/sn-5-12-2', title: 'Buddha Jayanthi' },
      { label: 'SC', href: 'https://suttacentral.net/sn56.11', title: 'SuttaCentral.net' },
      { label: 'TBW', href: 'https://thebuddhaswords.net/sn/sn56.11.html', title: 'TheBuddhasWords.net' },
      { label: 'bb', href: '/b/?q=sn56.11', title: 'BB and Other translations' },
      { label: 'ai', href: '/ai/?q=sn56.11', title: 'AI' },
    ]}
  />
);

export const MinimalRow = () => (
  <ExternalLinks
    links={[
      { label: 'Voice', href: '#', title: 'Text-to-Speech (Alt+R)' },
      { label: 'BJT', href: 'https://tipitaka.lk/kn-dhp-1', title: 'Buddha Jayanthi' },
      { label: 'SC', href: 'https://suttacentral.net/dhp1-20', title: 'SuttaCentral.net' },
    ]}
  />
);
