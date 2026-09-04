import { ModeSwitchPanel } from '@dhammagift/dg-ui';

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
