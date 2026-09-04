import { BusyIndicator, Icon, Toolbar, ToolbarButton } from '@dhammagift/dg-ui';

/** The spinner as the app shows it, with the label a screen reader hears while a search runs. */
export const Searching = () => <BusyIndicator label="Searching…" />;

/** Loading a sutta rather than a query — same spinner, different announcement. */
export const LoadingSutta = () => <BusyIndicator label="Loading dn22 — Mahāsatipaṭṭhānasutta…" />;

/**
 * Where it actually lands. `#dg-busy-indicator` is `position: fixed; top: 10px; left: 50%`,
 * so it pins to the top centre of the viewport and floats above the page — this is the state
 * where the header has scrolled away and the field's own spinner went with it.
 */
export const OverThePage = () => (
  <div style={{ paddingTop: 56 }}>
    <BusyIndicator label="Searching kacchapa across the Sutta Piṭaka…" />
    <Toolbar>
      <ToolbarButton label="Theme"><Icon name="circleHalfStroke" /></ToolbarButton>
      <ToolbarButton label="Expand / collapse all">Expand all</ToolbarButton>
      <ToolbarButton label="Dictionary"><Icon name="comment" /></ToolbarButton>
      <ToolbarButton label="Read marks" pressed><Icon name="solidStar" /></ToolbarButton>
    </Toolbar>
    <p
      style={{
        marginTop: 16,
        maxWidth: 560,
        fontFamily: 'var(--dg-font)',
        color: 'var(--dg-text-muted)',
      }}
    >
      dn22 — Mahāsatipaṭṭhānasutta · sn56.11 — Dhammacakkappavattanasutta · mn10 —
      Satipaṭṭhānasutta
    </p>
  </div>
);
