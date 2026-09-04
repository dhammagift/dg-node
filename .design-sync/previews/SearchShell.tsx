import { Brand, Icon, IconButton, SearchShell } from '@dhammagift/dg-ui';

/**
 * The field as it stands in results and reader: conch on the left (the way home), the query,
 * quick settings and the magnifier. `.dg-hero-form`'s width is scoped to the page state in
 * the app's CSS, so the stories keep the matching state class on a wrapper.
 */
export const Results = () => (
  <div className="dg-state-results">
    <SearchShell value="kacchapa" showClear />
  </div>
);

/** Empty field. The app rotates a real Pali word through the placeholder. */
export const Placeholder = () => (
  <div className="dg-state-results">
    <SearchShell placeholder="Kāyagatā or sn56.11" />
  </div>
);

/** A search in flight — the magnifier hands over to the spinner inside the same button. */
export const Busy = () => (
  <div className="dg-state-results">
    <SearchShell value="satipaṭṭhāna" showClear busy />
  </div>
);

/**
 * The home composition: the signboard stands above the field, so the in-field conch is
 * dropped (`showLogo={false}`) and the burger sits outside the shell, to its right.
 */
export const OnHome = () => (
  <div className="dg-state-home dg-hero-inner">
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
      <Brand />
    </div>
    <div className="hero-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <SearchShell showLogo={false} placeholder="kacchapa" />
      <IconButton label="Menu" variant="menu">
        <Icon name="listUlSolidFull" size={19} />
      </IconButton>
    </div>
  </div>
);

/** Reader state, quick settings suppressed — the leanest shell the app ships. */
export const Minimal = () => (
  <div className="dg-state-reader">
    <SearchShell value="dn22:2.2" showQuickSettings={false} />
  </div>
);
