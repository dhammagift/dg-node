import type { ReactNode } from 'react';

export interface PaliQuoteProps {
  /** The Pali line, in roman script. */
  pali: string;
  /** Translation shown under the Pali. */
  translation?: ReactNode;
  /** Source references — sutta ids, links. */
  refs?: ReactNode;
  /** A caveat set apart from the quote (the home screen carries a usage warning here). */
  warning?: ReactNode;
  className?: string;
}

/**
 * A canonical quotation set as a block: Pali line, translation, references, and an optional
 * caveat under it. The home screen's "how to use this" passage is one of these.
 */
export function PaliQuote({ pali, translation, refs, warning, className }: PaliQuoteProps) {
  return (
    <div className={className}>
      <div className="dg-howto-quote">
        <p className="pli-lang" lang="pi">{pali}</p>
        {translation && <p>{translation}</p>}
        {refs && <p className="dg-howto-refs">{refs}</p>}
      </div>
      {warning && <div className="dg-howto-warn">{warning}</div>}
    </div>
  );
}
