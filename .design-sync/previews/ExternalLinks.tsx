import type { ReactNode } from 'react';
import { ExternalLinks } from '@dhammagift/dg-ui';

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

/** The source strip in dark theme, as the reader shows it under a Russian sutta. */
export const DarkTheme = () => (
  <Dark>
    <ExternalLinks
      links={[
        { label: 'Voice', href: '#', title: 'Text-to-Speech (Alt+R)' },
        { label: '4nt', href: 'https://s.4nt.org/mn/mn10/', title: 's.4nt.org' },
        { label: 'DPR', href: 'https://www.digitalpalireader.online/_dprhtml/index.html?q=mn10', title: 'Myanmar and Thai Editions at DPR' },
        { label: 'BJT', href: 'https://tipitaka.lk/mn-1-1-10', title: 'Buddha Jayanthi' },
        { label: 'SC', href: 'https://suttacentral.net/mn10', title: 'SuttaCentral.net' },
        { label: 'TBW', href: 'https://thebuddhaswords.net/mn/mn10.html', title: 'TheBuddhasWords.net' },
        { label: 'bb', href: '/b/?q=mn10', title: 'BB and Other translations' },
        { label: 'ai', href: '/ai/?q=mn10', title: 'AI' },
        { label: 'Th.ru', href: 'https://theravada.ru/Teaching/Canon/Suttanta/Texts/mn10-satipatthana-sutta-sv.htm', title: 'Theravada.ru' },
      ]}
    />
  </Dark>
);
