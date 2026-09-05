import type { ReactNode } from 'react';

export interface ToolbarButtonProps {
  /** Glyph or short label. */
  children: ReactNode;
  /** Tooltip / accessible name. */
  label?: string;
  /** Renders the pressed state the app uses for sticky toggles (read marks, columns). */
  pressed?: boolean;
  onClick?: () => void;
}

/**
 * One button in the results/reader toolbar — Bootstrap's `.btn.btn-light` pill, as shipped.
 */
export function ToolbarButton({ children, label, pressed, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className="btn btn-light mb-1"
      title={label}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : String(pressed) as 'true' | 'false'}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export interface ToolbarProps {
  /** `ToolbarButton`s, or anything else that belongs on the row. */
  children: ReactNode;
  className?: string;
}

/**
 * The row of light pills above the results table and inside the reader — theme, expand,
 * dictionary, multi-select, column mode, read marks, compass, settings, help.
 */
export function Toolbar({ children, className }: ToolbarProps) {
  return (
    <div className={['d-flex', 'flex-wrap', 'gap-1', 'align-items-center', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
