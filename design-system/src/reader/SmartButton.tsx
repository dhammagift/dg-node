import type { ReactNode } from 'react';

export interface SmartButtonProps {
  /** Caption under the glyph. */
  label: string;
  /** The glyph — pass an `<Icon />`. */
  children: ReactNode;
  /** Tooltip. */
  title?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * One control in the reader's floating smart panel — theme, columns, variants, dictionary,
 * multi-select.
 *
 * Each button is a shortcut to a control that also lives in the toolbar; the panel exists so
 * the common few are reachable without leaving the text.
 */
export function SmartButton({ label, children, title, onClick }: SmartButtonProps) {
  return (
    <button type="button" className="smart-btn" title={title || label} onClick={onClick}>
      <span className="smart-label">{label}</span>
      {children}
    </button>
  );
}
