export interface ExternalLink {
  /** Short code shown on the pill — `SC`, `DPR`, `BJT`, `Th.ru`. */
  label: string;
  href: string;
  /** Tooltip — the site's full name. */
  title?: string;
}

export interface ExternalLinksProps {
  links: ExternalLink[];
  className?: string;
}

/**
 * The row of third-party source links a sutta carries — Voice, 4nt, DPR, BJT, SuttaCentral,
 * TBW, Theravada.ru and the rest.
 *
 * Order is fixed and matches the legacy reader, so the same sutta reads the same on both.
 * Every link is marked `sc-ext-link`, which is how features like PDF export find them all.
 */
export function ExternalLinks({ links, className }: ExternalLinksProps) {
  return (
    <p className={['sc-link', className].filter(Boolean).join(' ')}>
      {links.map((l, i) => (
        <span key={l.label}>
          {i > 0 && ' '}
          <a className="sc-ext-link" href={l.href} title={l.title || l.label} target="_blank" rel="noopener">
            {l.label}
          </a>
        </span>
      ))}
    </p>
  );
}
