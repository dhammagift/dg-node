import type { ReactNode } from 'react';

export interface CtaButtonProps {
  /** Badge artwork — a store badge, an "install" tile. */
  children: ReactNode;
  href?: string;
  /** Tooltip and accessible name. */
  title: string;
  className?: string;
}

/**
 * An app-store style badge in the home screen's "get the app" row.
 *
 * Artwork carries the whole button, so `title` is the only text an assistive reader gets.
 */
export function CtaButton({ children, href = '#', title, className }: CtaButtonProps) {
  return (
    <a
      className={['dg-cta-btn', className].filter(Boolean).join(' ')}
      href={href}
      title={title}
      aria-label={title}
      target="_blank"
      rel="noopener"
    >
      {children}
    </a>
  );
}

export interface ContactButtonProps {
  /** The channel's glyph — pass an `<Icon />`. */
  children: ReactNode;
  href: string;
  /** Tooltip and accessible name — the channel's name. */
  title: string;
  className?: string;
}

/**
 * One round icon link in the home screen's contacts row (mail, Telegram, GitHub…).
 */
export function ContactButton({ children, href, title, className }: ContactButtonProps) {
  const external = !href.startsWith('mailto:');
  return (
    <a
      className={['dg-contact-btn', className].filter(Boolean).join(' ')}
      href={href}
      title={title}
      aria-label={title}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener' : undefined}
    >
      {children}
    </a>
  );
}
