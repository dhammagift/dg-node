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
