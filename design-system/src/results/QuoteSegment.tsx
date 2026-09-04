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
  /** Dims the segment as surrounding context rather than a hit. */
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
  const ctx = context ? ' context' : '';
  return (
    <span id={id} className={['quote-segment', className].filter(Boolean).join(' ')}>
      {pali && (
        <>
          <span className={`pli-lang inputscript-ISOPali quote${ctx}`} lang="pi">{pali}</span>
          <br className="styled pli-lang quote" />
        </>
      )}
      {variant && (
        <>
          <span className={`pli-lang variant quote${ctx}`} lang="pi">{variant}</span>
          <br className="styled pli-lang quote" />
        </>
      )}
      {translations.length > 0 && (
        <span className="right-column">
          {translations.map((t, i) => (
            <span key={`${t.lang}-${i}`}>
              <span
                className={`${t.lang}-lang${i > 0 ? ' lang-2nd' : ''} quote${ctx}`}
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
