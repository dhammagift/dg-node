import type { ReactNode } from 'react';

export interface DrawerProps {
  /** Rows and groups. */
  children: ReactNode;
  /** Renders the dimmed backdrop behind the drawer. */
  backdrop?: boolean;
  /** Content of the drawer's header strip, beside the close button. */
  head?: ReactNode;
  /**
   * Slides the panel in. The drawer is parked off-screen until the app adds `show`, so a
   * preview or a static composition needs this set.
   */
  open?: boolean;
  className?: string;
}

/**
 * The slide-in navigation drawer behind the burger — navigation, then settings.
 *
 * Replaced a Bootstrap dropdown: the drawer is what makes the page read as an app rather
 * than as a website menu.
 */
export function Drawer({ children, backdrop = true, head, open = true, className }: DrawerProps) {
  return (
    <>
      {backdrop && <div id="dg-drawer-backdrop" className={open ? 'show' : undefined} />}
      {/* <aside> wrapping a <nav class="dg-drawer-body">, as the app builds it: the group-title
          and row rules are scoped to that inner class, so a single flat element loses them. */}
      <aside
        id="dg-drawer"
        aria-label="Menu"
        className={[open ? 'show' : '', className].filter(Boolean).join(' ') || undefined}
      >
        <div className="dg-drawer-head">
          {head}
          <button type="button" className="dg-icon-btn dg-drawer-close" aria-label="Close">
            &times;
          </button>
        </div>
        <nav className="dg-drawer-body">{children}</nav>
      </aside>
    </>
  );
}

export interface DrawerRowProps {
  /** The row's caption. */
  children: ReactNode;
  href?: string;
  /** Leading glyph — pass an `<Icon />`, or an `<img>` for picture marks. */
  icon?: ReactNode;
  onClick?: () => void;
  className?: string;
}

/** One line in the `Drawer` — a glyph and a label, linking somewhere or running an action. */
export function DrawerRow({ children, href = 'javascript:void(0)', icon, onClick, className }: DrawerRowProps) {
  return (
    <a className={['dg-drawer-row', className].filter(Boolean).join(' ')} href={href} onClick={onClick}>
      {icon}
      {children}
    </a>
  );
}

export interface DrawerGroupProps {
  /** Group heading. */
  title: string;
  children: ReactNode;
  /** Groups start open; the app collapses Navigation on request. */
  open?: boolean;
  /** Renders a plain heading instead of a collapsible `<details>`. */
  collapsible?: boolean;
  className?: string;
}

/**
 * A titled section of the `Drawer`.
 *
 * Collapsible groups are a native `<details>` — no script, and it works before any JS runs.
 */
export function DrawerGroup({ title, children, open = true, collapsible = true, className }: DrawerGroupProps) {
  if (!collapsible) {
    return (
      <div className={className}>
        <p className="dg-group-title">{title}</p>
        {children}
      </div>
    );
  }
  return (
    <details className={['dg-drawer-group', className].filter(Boolean).join(' ')} open={open}>
      <summary className="dg-group-title">{title}</summary>
      {children}
    </details>
  );
}
