import type { ReactNode } from 'react';
import { brandArt } from '../icons/generated';

export interface ReaderHeroProps {
  /** Prefilled query. */
  query?: string;
  placeholder?: string;
  /** Borderless icon buttons to the right of the field — TOC, settings, TTS. */
  children?: ReactNode;
  className?: string;
}

/**
 * The reader's own header row: the way home, a search field, and the borderless icon buttons
 * beside it.
 *
 * Buttons here drop their pill: on this row the glyph alone reads better than a border
 * around it.
 */
export function ReaderHero({ query, placeholder = 'Search', children, className }: ReaderHeroProps) {
  return (
    <div className={['dg-reader-hero', className].filter(Boolean).join(' ')}>
      <div className="dg-home-btn">
        <a href="/" title="Home">
          <img src={brandArt.mark} alt="Dhamma.Gift" width={30} height={30} />
        </a>
      </div>
      <label className="dg-search-field">
        <input className="form-control searchinput" type="search" placeholder={placeholder}
               defaultValue={query} autoComplete="off" />
      </label>
      {children}
    </div>
  );
}
