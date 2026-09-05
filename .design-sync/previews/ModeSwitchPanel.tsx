import type { ReactNode } from 'react';
import { ModeSwitchPanel } from '@dhammagift/dg-ui';

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

// Modes and their order come from configs/reader/mode-table.json.
const modes = [
  { id: 'single', label: 'Single', description: 'One translation beside the Pali', hotkey: '1' },
  { id: 'multiTran', label: 'Multi Translators', description: 'Two translators of the same language', hotkey: '2' },
  { id: 'multiLang', label: 'Multi Language', description: 'Russian and English side by side', hotkey: '3' },
  { id: 'memorize', label: 'Memorize', description: 'Pali first, translation revealed on tap', hotkey: '4' },
  { id: 'devanagari', label: 'Devanagari', description: 'Pali in Devanagari beside the Latin script', hotkey: '5' },
];

export const SingleActive = () => <ModeSwitchPanel active="single" modes={modes} />;

export const MultiLangActive = () => <ModeSwitchPanel active="multiLang" modes={modes} />;

export const LabelsOnly = () => (
  <ModeSwitchPanel
    active="memorize"
    modes={modes.map(({ id, label, hotkey }) => ({ id, label, hotkey }))}
  />
);

/** The mode picker in dark theme — the active row keeps the accent against the #191919 surface. */
export const DarkTheme = () => (
  <Dark>
    <ModeSwitchPanel active="multiLang" modes={modes} />
  </Dark>
);
