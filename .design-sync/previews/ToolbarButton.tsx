import { Icon, Toolbar, ToolbarButton } from '@dhammagift/dg-ui';

/** A glyph-only pill — the shape most of the toolbar is made of. */
export const Glyph = () => (
  <ToolbarButton label="Dictionary"><Icon name="comment" /></ToolbarButton>
);

/** A short word instead of a glyph, for the two actions the app spells out. */
export const TextLabel = () => (
  <Toolbar>
    <ToolbarButton label="Expand / collapse all">Expand all</ToolbarButton>
    <ToolbarButton label="Show matched words">Words</ToolbarButton>
  </Toolbar>
);

/**
 * Sticky toggles carry `pressed`. In this system that is announced, not drawn — both pills
 * below are the same `.btn-light` shape; only `aria-pressed` differs.
 */
export const Toggle = () => (
  <Toolbar>
    <ToolbarButton label="Read marks off" pressed={false}><Icon name="regularStar" /></ToolbarButton>
    <ToolbarButton label="Read marks on" pressed><Icon name="solidStar" /></ToolbarButton>
  </Toolbar>
);

/** Glyph plus word in one pill — how the reader labels its edition and mode switches. */
export const GlyphAndText = () => (
  <Toolbar>
    <ToolbarButton label="Mahāsaṅgīti edition">
      <Icon name="book" /> <span>MS</span>
    </ToolbarButton>
    <ToolbarButton label="Russian and English columns">
      <Icon name="tableColumns" /> <span>R+E</span>
    </ToolbarButton>
  </Toolbar>
);

// Dark theme is a class, not a prop: the tokens are redefined on `.dark` and custom properties
// inherit, so the wrapper themes everything inside it. It paints --dg-page itself, or the
// card's own ground stays light. data-bs-theme rides along because that is the other half of
// the app's own switch (index.html sets body.dark AND <html data-bs-theme="dark">) and this
// pill is Bootstrap's `.btn-light`, not a token-driven surface.
const Dark = ({ children }) => (
  <div
    className="dark"
    data-bs-theme="dark"
    style={{ background: 'var(--dg-page)', padding: 20 }}
  >
    {children}
  </div>
);

/** The pill on the dark ground — glyph-only, word-only and glyph-plus-word, as the app mixes them. */
export const DarkTheme = () => (
  <Dark>
    <Toolbar>
      <ToolbarButton label="Dictionary"><Icon name="comment" /></ToolbarButton>
      <ToolbarButton label="Expand / collapse all">Expand all</ToolbarButton>
      <ToolbarButton label="Read marks" pressed><Icon name="solidStar" /></ToolbarButton>
      <ToolbarButton label="Mahāsaṅgīti edition">
        <Icon name="book" /> <span>MS</span>
      </ToolbarButton>
      <ToolbarButton label="Russian and English columns">
        <Icon name="tableColumns" /> <span>R+E</span>
      </ToolbarButton>
    </Toolbar>
  </Dark>
);
