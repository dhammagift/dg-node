import type { ReactNode } from 'react';
import { SmartButton, Icon } from '@dhammagift/dg-ui';

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

export const FloatingPanel = () => (
  <div style={{ width: 190 }}>
    <SmartButton label="Theme" title="Light / dark"><Icon name="circleHalfStroke" size={22} /></SmartButton>
    <SmartButton label="Columns" title="Column layout"><Icon name="alignLeft" size={22} /></SmartButton>
    <SmartButton label="Variants" title="Show variant readings"><Icon name="eye" size={22} /></SmartButton>
    <SmartButton label="Dictionary" title="Pali dictionary on tap"><Icon name="comment" size={22} /></SmartButton>
    <SmartButton label="Multi-select" title="Select several segments"><Icon name="selectSlash" size={22} /></SmartButton>
    <SmartButton label="Favourite" title="Add to favourites"><Icon name="star" size={22} /></SmartButton>
    <SmartButton label="History" title="Reading history"><Icon name="compass" size={22} /></SmartButton>
    <SmartButton label="Memo" title="Memo"><Icon name="memo" size={22} /></SmartButton>
    <SmartButton label="Settings" title="Reader settings"><Icon name="gear" size={22} /></SmartButton>
  </div>
);

export const RussianLabels = () => (
  <div style={{ width: 190 }}>
    <SmartButton label="Тема" title="Светлая / тёмная"><Icon name="circleHalfStroke" size={22} /></SmartButton>
    <SmartButton label="Колонки" title="Раскладка колонок"><Icon name="alignLeft" size={22} /></SmartButton>
    <SmartButton label="Варианты" title="Показать варианты чтения"><Icon name="eye" size={22} /></SmartButton>
    <SmartButton label="Словарь" title="Палийский словарь по клику"><Icon name="comment" size={22} /></SmartButton>
    <SmartButton label="История" title="История чтения"><Icon name="compass" size={22} /></SmartButton>
  </div>
);

export const SingleControl = () => (
  <div style={{ width: 190 }}>
    <SmartButton label="Variants" title="Show variant readings"><Icon name="eye" size={22} /></SmartButton>
  </div>
);

/** The floating panel in dark theme — .dark #smart-panel repaints the surface #333 with a #555 border. */
export const DarkTheme = () => (
  <Dark>
    <div id="smart-panel" className="active" style={{ width: 190 }}>
      <SmartButton label="Theme" title="Light / dark"><Icon name="circleHalfStroke" size={22} /></SmartButton>
      <SmartButton label="Columns" title="Column layout"><Icon name="alignLeft" size={22} /></SmartButton>
      <SmartButton label="Variants" title="Show variant readings"><Icon name="eye" size={22} /></SmartButton>
      <SmartButton label="Dictionary" title="Pali dictionary on tap"><Icon name="comment" size={22} /></SmartButton>
      <SmartButton label="Settings" title="Reader settings"><Icon name="gear" size={22} /></SmartButton>
    </div>
  </Dark>
);
