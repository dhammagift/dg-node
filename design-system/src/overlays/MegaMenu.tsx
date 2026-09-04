import type { ReactNode } from 'react';

export interface MegaMenuProps {
  /** Heading — the tile or section this menu belongs to. */
  title: string;
  /** `MegaMenuGroup`s. */
  children: ReactNode;
  onClose?: () => void;
  /** Tightens the gaps, for menus with many short entries. */
  compact?: boolean;
  className?: string;
}

/**
 * The anchored panel a home tile opens on wide screens — the same sheet shell as `Sheet`,
 * pinned to its tile instead of rising from the bottom edge.
 *
 * Closes on Escape and on backdrop click in the app.
 */
export function MegaMenu({ title, children, onClose, compact, className }: MegaMenuProps) {
  return (
    <div
      id="dg-mega"
      className={['dg-sheet', 'dg-anchored', 'dg-mega', compact ? 'dg-mega-compact' : '', className]
        .filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="true"
    >
      <div className="dg-sheet-head">
        <h2 id="dg-mega-title">{title}</h2>
        <button type="button" className="dg-sheet-close" aria-label="Close" onClick={onClose}>
          &times;
        </button>
      </div>
      <div className="dg-sheet-body" id="dg-mega-body">{children}</div>
    </div>
  );
}

export interface MegaMenuGroupProps {
  /** Group heading. */
  title: string;
  /** `SheetRow`s — full rows, or chips for short self-evident labels. */
  children: ReactNode;
  /** Lays the children out as a dense chip run instead of full-width rows. */
  layout?: 'rows' | 'chips';
  /** Draws a quiet rule above the group. */
  divider?: boolean;
  className?: string;
}

/**
 * One titled cluster inside a `MegaMenu`.
 *
 * Sets whose labels speak for themselves (model names, edition codes) use the chip layout —
 * four names like "Gemini" don't earn four full-width rows.
 */
export function MegaMenuGroup({ title, children, layout = 'rows', divider, className }: MegaMenuGroupProps) {
  return (
    <div className={['dg-mega-block', divider ? 'dg-mega-block-divider' : '', className].filter(Boolean).join(' ')}>
      <p className="dg-group-title">{title}</p>
      {layout === 'chips' ? <div className="dg-chip-group">{children}</div> : children}
    </div>
  );
}
