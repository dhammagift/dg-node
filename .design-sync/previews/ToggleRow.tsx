import type { ReactNode } from 'react';
import { ToggleRow } from '@dhammagift/dg-ui';

// The quick-settings panel the toggles live in — a token-built surface, the same one the
// gear-and-lightning button raises over the search field.
const Panel = ({ children }: { children: ReactNode }) => (
  <div style={{
    width: 340,
    background: 'var(--dg-surface)',
    color: 'var(--dg-text)',
    fontFamily: 'var(--dg-font)',
    border: '1px solid var(--dg-border-strong)',
    borderRadius: 'var(--dg-radius)',
    padding: '4px 16px',
  }}>
    {children}
  </div>
);

export const QuickSettings = () => (
  <Panel>
    <ToggleRow label="Show variants" hotkey="Alt+V" on />
    <ToggleRow label="Column mode" hotkey="Alt+C" />
    <ToggleRow label="Hide Pāḷi punctuation" hotkey="Alt+." on />
  </Panel>
);

export const On = () => (
  <Panel>
    <ToggleRow label="Show variants" hotkey="Alt+V" on />
  </Panel>
);

export const Off = () => (
  <Panel>
    <ToggleRow label="Show variants" hotkey="Alt+V" />
  </Panel>
);

export const WithoutHotkey = () => (
  <Panel>
    <ToggleRow label="Save the script for this mode only" on />
    <ToggleRow label="Keep the reader in sync while scrolling" />
  </Panel>
);
