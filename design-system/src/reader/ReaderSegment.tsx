import { createElement, type ReactNode } from 'react';

export interface ReaderTranslation {
  /** Language code — `ru`, `en`. Drives the `{lang}-lang` class the column layout keys off. */
  lang: string;
  /** The translated line. */
  text: ReactNode;
  /** Translator key, e.g. `ru_o`, `en_sujato`. */
  translator?: string;
}

export interface ReaderSegmentProps {
  /** Segment id — `dn22:1.1`. Becomes the anchor, so links land on this line. */
  id: string;
  /** The Pali line. */
  pali?: ReactNode;
  /** MS variant reading, folded under the Pali. */
  variant?: ReactNode;
  /** Translation columns, in display order. The second and later get `lang-2nd`. */
  translations?: ReaderTranslation[];
  /** Renders the Pali greyed, as the Devanagari mode does for its transliteration. */
  greyed?: boolean;
  className?: string;
}

/**
 * One segment as the reader lays it out: Pali on the left, every translation stacked in the
 * right column.
 *
 * The same markup serves every mode — single, two translators, two languages. What changes
 * is which columns get filled, never the structure, which is why switching mode keeps your
 * place in the text.
 */
export function ReaderSegment({ id, pali, variant, translations = [], greyed, className }: ReaderSegmentProps) {
  return (
    <span id={id} className={className}>
      {pali && (
        <span className={`pli-lang inputscript-ISOPali quote${greyed ? ' greyedout' : ''}`} lang="pi">
          {pali}
          {/* <font>, not <span>: the reader emits this exact element, and matching it keeps
              a design's markup substitutable for the app's own. React has no JSX typing for
              the legacy tag, hence createElement. */}
          {variant && createElement('font', { className: 'variant' }, createElement('br'), variant)}
        </span>
      )}
      {translations.length > 0 && (
        <span className="right-column">
          {translations.map((t, i) => (
            <span
              key={`${t.lang}-${i}`}
              className={`${t.lang}-lang${i > 0 ? ' lang-2nd' : ''} quote`}
              lang={t.lang}
              data-translator={t.translator}
            >
              {t.text}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
