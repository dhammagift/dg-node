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

// Dark is a class, not a prop: the tokens are redefined on `.dark` and custom properties
// inherit, so one wrapper themes everything inside it. It has to paint `--dg-page` itself,
// or the card's own ground stays light behind the panel. ToggleRow needs no Stage — the
// quick-settings panel is in normal flow.
const Dark = ({ children }: { children: ReactNode }) => (
  <div className="dark" style={{ background: 'var(--dg-page)', padding: 20 }}>
    {children}
  </div>
);

/** The quick-settings toggles in dark theme — panel surface, border and track all flip. */
export const DarkTheme = () => (
  <Dark>
    <Panel>
      <ToggleRow label="Show variants" hotkey="Alt+V" on />
      <ToggleRow label="Column mode" hotkey="Alt+C" />
      <ToggleRow label="Hide Pāḷi punctuation" hotkey="Alt+." on />
    </Panel>
  </Dark>
);
