import { Brand, Icon, IconButton } from '@dhammagift/dg-ui';

/** The home-screen signboard: conch-and-book logo plus the wordmark, linking home. */
export const Signboard = () => <Brand />;

/**
 * The conch alone. This is what rides inside the search field's left edge once the page
 * leaves the home state (see `SearchShell`), where the full signboard is gone.
 */
export const Mark = () => <Brand variant="mark" />;

/**
 * The real home top bar — signboard on the left, burger on the right, inside the hero's
 * 700px column.
 */
export const TopBar = () => (
  <div
    className="dg-hero-inner"
    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
  >
    <Brand />
    <IconButton label="Menu" variant="menu">
      <Icon name="listUlSolidFull" size={19} />
    </IconButton>
  </div>
);

// Dark theme is a class, not a prop: the tokens are redefined on `.dark` and custom properties
// inherit, so the wrapper themes everything inside it. It paints --dg-page itself, or the
// card's own ground stays light.
const Dark = ({ children }) => (
  <div className="dark" style={{ background: 'var(--dg-page)', padding: 20 }}>
    {children}
  </div>
);

/**
 * The signboard and the top bar on the dark ground. `.dark .dg-brand-logo { filter: none }` —
 * the four drop-shadow outlines that keep the conch legible on the light hero are dropped
 * here, so the mark sits on #111111 unringed, and the wordmark follows --dg-text.
 */
export const DarkTheme = () => (
  <Dark>
    <Brand />
    <div
      className="dg-hero-inner"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 24,
      }}
    >
      <Brand variant="mark" />
      <IconButton label="Menu" variant="menu">
        <Icon name="listUlSolidFull" size={19} />
      </IconButton>
    </div>
  </Dark>
);
