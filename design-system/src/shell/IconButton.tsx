import type { ReactNode } from 'react';

export interface IconButtonProps {
  /** The glyph. Pass an `<Icon />` or raw SVG. */
  children: ReactNode;
  /** Required — these buttons carry no visible text. */
  label: string;
  /** `menu` is the burger in the top bar; `plain` is the borderless reader-hero style. */
  variant?: 'default' | 'menu' | 'plain';
  onClick?: () => void;
  className?: string;
}

/**
 * A chrome button that is nothing but its icon — burger, back, close.
 *
 * `default`/`menu` render the bordered `.dg-icon-btn` pill from the top bar; `plain` is the
 * reader hero's borderless variant, where the icon alone reads better than a pill around it.
 */
export function IconButton({ children, label, variant = 'default', onClick, className }: IconButtonProps) {
  const classes = [
    variant === 'plain' ? 'dg-plain-btn' : 'dg-icon-btn',
    variant === 'menu' ? 'dg-menu-btn' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}
