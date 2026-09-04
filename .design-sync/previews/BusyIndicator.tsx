import { BusyIndicator } from '@dhammagift/dg-ui';

/** The spinner on its own, with the label a screen reader hears while a search runs. */
export const Searching = () => <BusyIndicator label="Searching…" />;

/** Loading a sutta rather than a query — same spinner, different announcement. */
export const LoadingSutta = () => <BusyIndicator label="Loading dn22 — Mahāsatipaṭṭhānasutta…" />;

/**
 * Where it actually appears: parked over the results area, which the app empties while the
 * request is in flight.
 */
export const OverResults = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 220,
      border: '1px solid var(--dg-border)',
      borderRadius: 'var(--dg-radius)',
      background: 'var(--dg-surface)',
      color: 'var(--dg-text-2)',
      fontFamily: 'var(--dg-font)',
    }}
  >
    <BusyIndicator label="Searching kacchapa across the Sutta Piṭaka…" />
  </div>
);
