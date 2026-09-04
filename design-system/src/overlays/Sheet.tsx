import type { ReactNode } from 'react';

export interface SheetTab {
  id: string;
  label: string;
}

export interface SheetProps {
  /** Heading — the app puts the tile's own label here. */
  title: string;
  /** Rows, chips, or anything else that belongs in the body. */
  children: ReactNode;
  /** Optional tab strip above the body. */
  tabs?: SheetTab[];
  /** Which tab reads as current. */
  activeTab?: string;
  onTabChange?: (id: string) => void;
  onClose?: () => void;
  /** Renders the dimmed backdrop behind the sheet. */
  backdrop?: boolean;
  className?: string;
}

/**
 * The bottom sheet a home tile opens — drag handle, title, optional tabs, and a body of rows.
 *
 * On phones it rises from the bottom edge; above 768px the same markup is centred as a panel.
 */
export function Sheet({
  title, children, tabs, activeTab, onTabChange, onClose, backdrop = true, className,
}: SheetProps) {
  return (
    <>
      {backdrop && <div id="dg-sheet-backdrop" />}
      <div id="dg-sheet" className={['dg-sheet', className].filter(Boolean).join(' ')}>
        <div className="dg-sheet-handle" />
        <div className="dg-sheet-head">
          <h2 id="dg-sheet-title">{title}</h2>
          <button type="button" className="dg-sheet-close" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>
        {tabs && tabs.length > 0 && (
          <div className="dg-sheet-tabs" id="dg-sheet-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={String(tab.id === activeTab) as 'true' | 'false'}
                onClick={() => onTabChange?.(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <div className="dg-sheet-body" id="dg-sheet-body">{children}</div>
      </div>
    </>
  );
}

export interface SheetRowProps {
  /** The item's name. */
  label: string;
  /** A short "what this is", shown under the label. */
  description?: string;
  href?: string;
  /** Marks the row as a favourite — a gold star replaces the leading glyph. */
  starred?: boolean;
  /** Renders as a compact chip instead of a full row. */
  chip?: boolean;
  /** Leading glyph. Ignored when `starred` — one marker per row is enough. */
  icon?: ReactNode;
  className?: string;
}

/**
 * One entry inside a `Sheet` — a link with an optional description, or a compact chip.
 *
 * The star sits at the leading edge, in the ordinary glyph's place: pushed to the end of the
 * row it read as a separate button rather than a mark on the item.
 */
export function SheetRow({
  label, description, href = '#', starred, chip, icon, className,
}: SheetRowProps) {
  const classes = [chip ? 'dg-chip' : 'dg-sheet-row', className].filter(Boolean).join(' ');
  const star = (
    <svg className="dg-row-star" viewBox="0 0 576 512" width="14" height="14" fill="#e8b923" aria-hidden="true">
      <path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z" />
    </svg>
  );
  return (
    <a className={classes} href={href} title={label}>
      {starred ? star : icon}
      {chip ? label : (
        <span className="dg-row-label">
          {label}
          {description && <small className="dg-row-desc">{description}</small>}
        </span>
      )}
    </a>
  );
}
