import type { ReactNode } from 'react';

export interface AnnounceBoxProps {
  /** The announcement. Short — it sits in one band across the home screen. */
  children: ReactNode;
  /** Hides the dismiss button for notices that shouldn't be closable. */
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

/**
 * The site-wide notice band on the home screen — one short message, dismissible.
 *
 * `role="status"`, so it is announced without stealing focus.
 */
export function AnnounceBox({ children, dismissible = true, onDismiss, className }: AnnounceBoxProps) {
  return (
    <div className={['dg-announce-box', className].filter(Boolean).join(' ')} role="status">
      <span>{children}</span>
      {dismissible && (
        <button type="button" className="dg-announce-close" aria-label="Dismiss" onClick={onDismiss}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
               strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}
