import { Segmented, Icon } from '@dhammagift/dg-ui';

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
