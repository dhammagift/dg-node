export interface BusyIndicatorProps {
  /** Announced to screen readers while the spinner is up. */
  label?: string;
  className?: string;
}

/**
 * The page-level "working on it" spinner the app parks over the results area while a
 * search or a sutta is in flight.
 */
export function BusyIndicator({ label = 'Loading…', className }: BusyIndicatorProps) {
  // The indicator is display:none at rest and revealed by the shell's own state
  // (body.dg-busy.dg-header-hidden in the app). The wrapper carries that state here, so the
  // component shows itself instead of waiting for a <body> it cannot reach.
  return (
    <div className={['dg-busy', 'dg-header-hidden', className].filter(Boolean).join(' ')}>
      <div id="dg-busy-indicator" role="status" aria-live="polite">
        <div className="spinner-border" />
        <span className="visually-hidden">{label}</span>
      </div>
    </div>
  );
}
