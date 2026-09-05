import type { ReactNode } from 'react';

export interface SegmentTranslation {
  /** Language code — drives the `<span class="{lang}-lang">` the column CSS keys off. */
  lang: string;
  /** The translated line. */
  text: ReactNode;
  /** Translator key, e.g. `ru_o`, `en_sujato`. Shown by the reader's byline. */
  translator?: string;
}

export interface QuoteSegmentProps {
  /** Segment id — `dn22:1.1`. Doubles as the anchor the copy-link markers point at. */
  id: string;
  /** The Pali line (Mahāsaṅgīti edition). */
  pali?: ReactNode;
  /** MS variant reading, shown under the Pali in a smaller face. */
  variant?: ReactNode;
  /** One entry per translation column. */
  translations?: SegmentTranslation[];
  /**
   * Marks the segment as surrounding context rather than a hit.
   *
   * Emits the classes the results view emits (`opacity-90` on the Pali, `opacity-75` on the
   * translations). Note that `opacity-90` is dead in Bootstrap 5 — see the component's docs.
   */
  context?: boolean;
  className?: string;
}

/**
 * One canonical segment as the search results render it: the Pali line, its variant reading,
 * and every translation stacked in the right column.
 *
 * Segment ids are the app's addressing scheme end to end — the same `dn22:1.1` is the anchor,
 * the copy-link target and the reader's scroll destination.
 */
export function QuoteSegment({ id, pali, variant, translations = [], context, className }: QuoteSegmentProps) {
  // The results view dims context lines with Bootstrap utilities, not a class of its own:
  // opacity-90 on the Pali and variant, text-muted + opacity-75 on the translations
  // (public/overrides/js/search-render.js). Emitted verbatim so the markup stays
  // substitutable for the app's own.
  const paliCtx = context ? ' opacity-90' : '';
  const transCtx = context ? ' opacity-75' : '';
  return (
    <span id={id} className={['quote-segment', className].filter(Boolean).join(' ')}>
      {pali && (
        <>
          <span className={`pli-lang inputscript-ISOPali quote${paliCtx}`} lang="pi">{pali}</span>
          <br className="styled pli-lang quote" />
        </>
      )}
      {variant && (
        <>
          <span className={`pli-lang variant quote${paliCtx}`} lang="pi">{variant}</span>
          <br className="styled pli-lang quote" />
        </>
      )}
      {translations.length > 0 && (
        <span className="right-column">
          {translations.map((t, i) => (
            <span key={`${t.lang}-${i}`}>
              <span
                className={`${t.lang}-lang text-muted font-weight-light quote${transCtx}`}
                lang={t.lang}
                data-translator={t.translator}
              >
                {t.text}
              </span>
              <br className={`styled ${t.lang}-lang quote`} />
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

export interface MatchProps {
  /** The matched word, as it appears in the text. */
  children: ReactNode;
}

/**
 * A search hit inside a line. The results view wraps every occurrence of the query in one of
 * these, including the inflected forms grep found.
 */
export function Match({ children }: MatchProps) {
  return <b className="match finder">{children}</b>;
}
