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
  return (
    <div
      id="dg-busy-indicator"
      className={className}
      role="status"
      aria-live="polite"
    >
      <div className="spinner-border" />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}
