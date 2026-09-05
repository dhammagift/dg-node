import type { ReactNode } from 'react';

export interface TileProps {
  /** Caption under the icon disc. */
  label: string;
  /** Glyph for the accent disc — pass an `<Icon />`. */
  icon?: ReactNode;
  /** Native tooltip; the app puts the tile's longer description here. */
  description?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * One home-screen shortcut: a glyph in an accent disc with a caption under it.
 *
 * Always a `<button>`, never an `<a>` — even for tiles that merely open a link. Browsers
 * start their own drag on anchors, which would fight the tile reordering.
 */
export function Tile({ label, icon, description, onClick, className }: TileProps) {
  return (
    <button
      type="button"
      className={['dg-tile', className].filter(Boolean).join(' ')}
      title={description}
      onClick={onClick}
    >
      <span className="dg-tile-ic">{icon}</span>
      <span className="dg-tile-label">{label}</span>
    </button>
  );
}

export interface TileGridProps {
  /** `Tile` elements. */
  children: ReactNode;
  className?: string;
}

/** The home screen's grid of shortcuts — reorderable by drag in the app. */
export function TileGrid({ children, className }: TileGridProps) {
  return <div className={['dg-tiles', className].filter(Boolean).join(' ')}>{children}</div>;
}
