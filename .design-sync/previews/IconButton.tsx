import { Icon, IconButton } from '@dhammagift/dg-ui';

// Framing only — the buttons themselves carry no visible text, so the stories caption them
// the way a spec sheet would. Nothing here restyles the component.
const row = { display: 'flex', alignItems: 'flex-start', gap: 24 };
const item = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 108 };
const caption = {
  fontFamily: 'var(--dg-font)',
  fontSize: 11,
  lineHeight: 1.25,
  textAlign: 'center',
  color: 'var(--dg-text-muted)',
};

/**
 * The burger in the top bar — the app's one always-on chrome button. At rest `.dg-icon-btn`
 * is a transparent 34px circle; the fill and the darker ink arrive on hover and focus.
 */
export const Menu = () => (
  <IconButton label="Menu" variant="menu">
    <Icon name="listUlSolidFull" size={19} />
  </IconButton>
);

/** The same circle without the menu role — compass, history, theme, settings. */
export const Default = () => (
  <div style={row}>
    <span style={item}>
      <IconButton label="Cattāri Ariyasaccāni">
        <Icon name="compass" size={19} />
      </IconButton>
      <span style={caption}>Cattāri Ariyasaccāni</span>
    </span>
    <span style={item}>
      <IconButton label="History">
        <Icon name="clockRotateLeft" size={19} />
      </IconButton>
      <span style={caption}>History</span>
    </span>
    <span style={item}>
      <IconButton label="Theme">
        <Icon name="circleHalfStroke" size={19} />
      </IconButton>
      <span style={caption}>Theme</span>
    </span>
    <span style={item}>
      <IconButton label="Settings">
        <Icon name="gear" size={19} />
      </IconButton>
      <span style={caption}>Settings</span>
    </span>
  </div>
);

/**
 * `plain` is the reader hero's borderless variant. Its rules are scoped to `.dg-reader-hero`
 * in the app's CSS, so the story keeps that wrapper — a bare plain button is unstyled.
 */
export const Plain = () => (
  <div className="dg-reader-hero" style={row}>
    <span style={item}>
      <IconButton label="Table of contents" variant="plain">
        <Icon name="listUlSolidFull" size={24} />
      </IconButton>
      <span style={caption}>Contents</span>
    </span>
    <span style={item}>
      <IconButton label="Listen to dn22" variant="plain">
        <Icon name="volumeSolidFull" size={24} />
      </IconButton>
      <span style={caption}>Listen</span>
    </span>
    <span style={item}>
      <IconButton label="Copy Mahāsatipaṭṭhānasutta link" variant="plain">
        <Icon name="copy" size={24} />
      </IconButton>
      <span style={caption}>Copy link</span>
    </span>
    <span style={item}>
      <IconButton label="Open dn22 on SuttaCentral" variant="plain">
        <Icon name="openLink" size={24} />
      </IconButton>
      <span style={caption}>SuttaCentral</span>
    </span>
  </div>
);

/** All three variants side by side, each at the size the app uses for it. */
export const Variants = () => (
  <div style={{ ...row, gap: 40 }}>
    <span style={item}>
      <IconButton label="Menu" variant="menu">
        <Icon name="listUlSolidFull" size={19} />
      </IconButton>
      <span style={caption}>menu — 19px</span>
    </span>
    <span style={item}>
      <IconButton label="Bookmark dn22">
        <Icon name="solidStar" size={19} />
      </IconButton>
      <span style={caption}>default — 19px</span>
    </span>
    <span className="dg-reader-hero" style={item}>
      <IconButton label="Back to the search" variant="plain">
        <Icon name="arrowUpDark" size={24} />
      </IconButton>
      <span style={caption}>plain — 24px</span>
    </span>
  </div>
);
