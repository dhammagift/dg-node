import type { ReactNode } from 'react';
import { Segmented, Icon } from '@dhammagift/dg-ui';

// Dark is a CLASS, not a prop: the tokens are redefined on `.dark` and custom properties
// inherit, so a wrapper themes everything inside it. It must paint --dg-page itself, or the
// card's own ground stays light under a correctly themed component.
const Dark = ({ children }: { children: ReactNode }) => (
  <div className="dark" style={{ background: 'var(--dg-page)', padding: 20 }}>
    {children}
  </div>
);

// Interface language — the drawer's own switch, EN first, exactly as home.js orders it.
export const Language = () => (
  <Segmented
    value="en"
    options={[
      { value: 'en', label: 'EN' },
      { value: 'ru', label: 'RU' },
    ]}
  />
);

// Three options with glyphs — the theme switch, the only place that passes icons.
export const Theme = () => (
  <Segmented
    value="dark"
    options={[
      { value: 'dark', label: 'Тёмная', icon: <Icon name="moon" size={14} /> },
      { value: 'light', label: 'Светлая', icon: <Icon name="sun" size={14} /> },
      { value: 'auto', label: 'Авто', icon: <Icon name="circleHalfStroke" size={14} /> },
    ]}
  />
);

// Lines of context around a match (lb/la), the quick-settings sheet.
export const Context = () => (
  <Segmented
    value="1"
    options={[
      { value: '0', label: 'Только строка' },
      { value: '1', label: '+1 строка' },
      { value: '2', label: '+2 строки' },
    ]}
  />
);

// Results view: whole suttas or the word list built from them.
export const ResultsView = () => (
  <Segmented
    value="suttas"
    options={[
      { value: 'suttas', label: 'Тексты' },
      { value: 'words', label: 'Слова' },
    ]}
  />
);

/**
 * The theme switch rendered in the theme it is currently set to. The earlier `Theme` cell only
 * *names* dark as a value; this one actually themes the control — track and pressed half take
 * the dark surface tokens (#191919 / #2a2a2a) and the label ink drops to #a8a8a8.
 */
export const DarkTheme = () => (
  <Dark>
    <Segmented
      value="dark"
      options={[
        { value: 'dark', label: 'Тёмная', icon: <Icon name="moon" size={14} /> },
        { value: 'light', label: 'Светлая', icon: <Icon name="sun" size={14} /> },
        { value: 'auto', label: 'Авто', icon: <Icon name="circleHalfStroke" size={14} /> },
      ]}
    />
  </Dark>
);
