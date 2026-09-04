import { BusyIndicator, Icon, Toolbar, ToolbarButton } from '@dhammagift/dg-ui';
import type { ReactNode } from 'react';

// The card root carries transform: translateZ(0), which makes IT — not the viewport — the
// containing block for any position: fixed descendant, and its own height is 0 when the
// out-of-flow panel is its only child. The sheet then resolves its offsets against a
// zero-height box and disappears. Stage supplies the missing viewport and nothing else: no
// surface, border or shadow, so every visible edge is still the component's own.
const Stage = ({ children, height = 520 }: { children: ReactNode; height?: number }) => (
  <div style={{
    position: 'relative',
    height,
    transform: 'translateZ(0)',
    overflow: 'hidden',
    background: 'var(--dg-page)',
  }}>
    {children}
  </div>
);


/** The spinner as the app shows it, with the label a screen reader hears while a search runs. */
export const Searching = () => (
  <Stage height={180}><BusyIndicator label="Searching…" /></Stage>
);

/** Loading a sutta rather than a query — same spinner, different announcement. */
export const LoadingSutta = () => (
  <Stage height={180}><BusyIndicator label="Loading dn22 — Mahāsatipaṭṭhānasutta…" /></Stage>
);

/**
 * Where it actually lands. `#dg-busy-indicator` is `position: fixed; top: 10px; left: 50%`,
 * so it pins to the top centre of the viewport and floats above the page — this is the state
 * where the header has scrolled away and the field's own spinner went with it.
 */
export const OverThePage = () => (
  <Stage height={220}>
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
  </Stage>
);
