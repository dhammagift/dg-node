import * as React from 'react';
import { Brand, Icon, IconButton, SearchShell } from '@dhammagift/dg-ui';

// The shell sizes itself from its wrapper: .hero-row is a centred block capped at 700px, and
// .dg-state-* caps the form at 640px (home) or 520px (results/reader/toc). The preview cell
// centres its content as a flex item, which shrink-wraps that block to the pill's content
// width — so each story is given a full-width frame and the shell's own maxima do the rest.
// The cell shrink-wraps its content, so `width: 100%` resolves to the pill's own width. An
// explicit 640px — the app's home-state column — lets .dg-state-*'s own maxima (640 home,
// 520 results/reader) do the sizing, which is what the proportions should show.
const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 640 }}>{children}</div>
);

/** Results state: the conch on the left is the way home, then the query, clear, quick settings, magnifier. */
export const Results = () => (
  <Frame><SearchShell state="results" value="kacchapa" showClear /></Frame>
);

/** Empty field. The app rotates a real Pali word — or a sutta id — through the placeholder. */
export const Placeholder = () => (
  <Frame><SearchShell state="results" placeholder="Kāyagatā or sn56.11" /></Frame>
);

/** A search in flight — the magnifier hands over to the spinner inside the same button. */
export const Busy = () => (
  <Frame><SearchShell state="results" value="satipaṭṭhāna" showClear busy /></Frame>
);

/**
 * Home state: the signboard above carries the brand, so the field drops the in-field conch
 * and becomes a white shadowed pill with the navy submit button. The burger sits outside the
 * shell, to its right.
 */
export const OnHome = () => (
  <Frame>
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
      <Brand />
    </div>
    <div
      className="hero-row"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
    >
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <SearchShell state="home" placeholder="kacchapa" />
      </div>
      <IconButton label="Menu" variant="menu">
        <Icon name="listUlSolidFull" size={19} />
      </IconButton>
    </div>
  </Frame>
);

/** Reader state, quick-settings dot suppressed — the leanest shell the app ships. */
export const Reader = () => (
  <Frame><SearchShell state="reader" value="dn22:2.2" showQuickSettings={false} /></Frame>
);

// Dark theme is a class, not a prop. Two places need it here: the outer wrapper paints
// --dg-page so the card's ground goes dark, and the shell itself takes className="dark"
// because the shell's own dark rules are COMPOUND — `.dark.dg-state-results .dg-input-shell`
// wants both classes on the same element, so an ancestor .dark alone leaves the pill light.
const Dark = ({ children }: { children: React.ReactNode }) => (
  <div className="dark" style={{ background: 'var(--dg-page)', padding: 20 }}>
    {children}
  </div>
);

/**
 * Results and reader states in dark theme: the glass pill becomes the app's #42426a slate,
 * the query text and both buttons go to #ddd, and the focus ring turns violet.
 */
export const DarkTheme = () => (
  <Dark>
    <Frame>
      <SearchShell className="dark" state="results" value="satipaṭṭhāna" showClear />
      <div style={{ height: 18 }} />
      <SearchShell className="dark" state="reader" value="dn22:2.2" showQuickSettings={false} />
    </Frame>
  </Dark>
);
