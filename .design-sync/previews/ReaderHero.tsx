import type { ReactNode } from 'react';
import { ReaderHero, IconButton, Icon } from '@dhammagift/dg-ui';

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

export const WithReaderButtons = () => (
  <ReaderHero query="dn22">
    <IconButton label="Contents" variant="plain"><Icon name="listUlSolidFull" size={18} /></IconButton>
    <IconButton label="Settings" variant="plain"><Icon name="gear" size={18} /></IconButton>
  </ReaderHero>
);

export const FullToolset = () => (
  <ReaderHero query="sn56.11">
    <IconButton label="Contents" variant="plain"><Icon name="listUlSolidFull" size={18} /></IconButton>
    <IconButton label="Read aloud" variant="plain"><Icon name="volumeSolidFull" size={18} /></IconButton>
    <IconButton label="Theme" variant="plain"><Icon name="circleHalfStroke" size={18} /></IconButton>
    <IconButton label="Dictionary" variant="plain"><Icon name="comment" size={18} /></IconButton>
    <IconButton label="Settings" variant="plain"><Icon name="gear" size={18} /></IconButton>
  </ReaderHero>
);

export const SearchOnly = () => (
  <ReaderHero placeholder="kacchapa" />
);

/** The reader hero in dark theme — .dark .dg-reader-hero lightens the plain buttons and inverts the brand mark. */
export const DarkTheme = () => (
  <Dark>
    <ReaderHero query="mn10">
      <IconButton label="Contents" variant="plain"><Icon name="listUlSolidFull" size={18} /></IconButton>
      <IconButton label="Read aloud" variant="plain"><Icon name="volumeSolidFull" size={18} /></IconButton>
      <IconButton label="Theme" variant="plain"><Icon name="circleHalfStroke" size={18} /></IconButton>
      <IconButton label="Settings" variant="plain"><Icon name="gear" size={18} /></IconButton>
    </ReaderHero>
  </Dark>
);
