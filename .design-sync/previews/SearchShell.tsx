import { Brand, Icon, IconButton, SearchShell } from '@dhammagift/dg-ui';

// The shell has no width of its own — in the app the page state caps it at 520px (results,
// reader, toc) and 640px on home. A consumer supplies that from its own layout, so the
// stories do too.
const column = { maxWidth: 520 };
const homeColumn = { maxWidth: 640, margin: '0 auto' };

/** The field in results state: conch on the left (the way home), query, clear, quick settings, magnifier. */
export const Results = () => (
  <div style={column}>
    <SearchShell state="results" value="kacchapa" showClear />
  </div>
);

/** Empty field. The app rotates a real Pali word — or a sutta id — through the placeholder. */
export const Placeholder = () => (
  <div style={column}>
    <SearchShell state="results" placeholder="Kāyagatā or sn56.11" />
  </div>
);

/** A search in flight — the magnifier hands over to the spinner inside the same button. */
export const Busy = () => (
  <div style={column}>
    <SearchShell state="results" value="satipaṭṭhāna" showClear busy />
  </div>
);

/**
 * Home state: the signboard above carries the brand, so the field drops the in-field conch
 * and becomes a plain shadowed pill with the navy submit button. The burger sits outside the
 * shell, to its right.
 */
export const OnHome = () => (
  <div style={homeColumn}>
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
      <Brand />
    </div>
    <div className="hero-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <SearchShell state="home" placeholder="kacchapa" />
      <IconButton label="Menu" variant="menu">
        <Icon name="listUlSolidFull" size={19} />
      </IconButton>
    </div>
  </div>
);

/** Reader state, quick-settings dot suppressed — the leanest shell the app ships. */
export const Reader = () => (
  <div style={column}>
    <SearchShell state="reader" value="dn22:2.2" showQuickSettings={false} />
  </div>
);
