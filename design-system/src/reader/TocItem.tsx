export interface TocItemProps {
  /** Heading depth — `h1` is a chapter, `h4` a leaf. */
  level?: 'h1' | 'h2' | 'h3' | 'h4';
  /** The Pali heading. */
  pali?: string;
  /** The translated heading, shown after the Pali. */
  translated?: string;
  /** Language of `translated`, so the per-language toggle can hide one side. */
  lang?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * One line of a sutta's table of contents.
 *
 * Both scripts sit in the same row and each is separately clickable, so tapping the Pali or
 * the translation scrolls to the same place — the reader's language toggle then decides which
 * of the two is visible.
 */
export function TocItem({ level = 'h2', pali, translated, lang = 'rus', onClick, className }: TocItemProps) {
  return (
    <div className={['toc-item', `toc-${level}`, className].filter(Boolean).join(' ')} onClick={onClick}>
      {pali && <span className="pli-lang">{pali} </span>}
      {translated && <span className={`${lang}-lang`}>{translated} </span>}
    </div>
  );
}
