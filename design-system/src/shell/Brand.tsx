import { brandArt } from '../icons/generated';

export interface BrandProps {
  /** Where the signboard links. The app always points it at the site root. */
  href?: string;
  /** Wordmark under/next to the logo. */
  name?: string;
  /** `full` is the home-screen signboard; `mark` is the conch alone, used inside the input. */
  variant?: 'full' | 'mark';
  className?: string;
}

/**
 * The dhamma.gift signboard — logo plus wordmark, and the page's primary way home.
 *
 * Shown only on the home state; in results and reader the mark shrinks into the search
 * field's left edge (see `SearchShell`).
 */
export function Brand({ href = '/', name = 'dhamma.gift', variant = 'full', className }: BrandProps) {
  return (
    <a
      href={href}
      id="dg-brand"
      className={['dg-go-home', className].filter(Boolean).join(' ')}
      title="Dhamma.Gift"
    >
      <img
        className="dg-brand-logo"
        src={variant === 'full' ? brandArt.full : brandArt.mark}
        alt="Dhamma.Gift"
      />
      {variant === 'full' && <span className="dg-brand-name">{name}</span>}
    </a>
  );
}
