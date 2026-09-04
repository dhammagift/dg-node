import type { ReactNode } from 'react';

export interface ResultsTableProps {
  /** `ResultRow`s. */
  children: ReactNode;
  /** Column headings. Defaults to the shipped set. */
  columns?: string[];
  className?: string;
}

/**
 * The search results table — Bootstrap striped/hover on top of DataTables in the app.
 *
 * Rows expand in place to show the matching segments, so the table is an index of suttas
 * first and a list of hits second.
 */
export function ResultsTable({
  children,
  columns = ['Sutta', 'Title', 'Matched words', 'Sources'],
  className,
}: ResultsTableProps) {
  return (
    <table
      id="pali"
      className={['display', 'table', 'table-striped', 'table-hover', 'responsive', className]
        .filter(Boolean).join(' ')}
      width="100%"
    >
      <thead>
        <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export interface ResultRowProps {
  /** Sutta id — `dn22`, `sn56.11`. Links into the reader. */
  suttaId: string;
  /** Pali title of the sutta. */
  paliTitle: string;
  /** Translated title, shown muted after the Pali one. */
  translatedTitle?: string;
  /** Language of `translatedTitle`, for the per-language title toggle. */
  titleLang?: string;
  /** The inflected forms that actually matched, e.g. `kacchapa`, `kacchapānaṁ`. */
  matchedWords?: ReactNode;
  /** Third-party source links for this sutta. */
  sources?: ReactNode;
  /** Shows the read-mark checkbox at the head of the row. */
  readMark?: boolean;
  /** Whether that checkbox is ticked. */
  read?: boolean;
  className?: string;
}

/**
 * One sutta in the results table: its id, both titles, the words that matched, and where else
 * the text can be read.
 *
 * Titles come as a pair on purpose — the Pali is the stable identity, the translated title is
 * what a reader recognizes.
 */
export function ResultRow({
  suttaId, paliTitle, translatedTitle, titleLang = 'ru', matchedWords, sources,
  readMark, read, className,
}: ResultRowProps) {
  return (
    <tr className={className}>
      <td>
        {readMark && (
          <input type="checkbox" className="dg-read-mark" data-sutta={suttaId} defaultChecked={read} />
        )}{' '}
        <a className="fdgLink mainLink" href={`/${suttaId}`} data-slug={suttaId}>{suttaId}</a>
      </td>
      <td>
        <strong className="pli-lang inputscript-ISOPali">{paliTitle}</strong>{' '}
        {translatedTitle && (
          <span className={`${titleLang}-lang dg-title-lang text-muted`}>{translatedTitle}</span>
        )}
      </td>
      <td>
        <span className="pli-lang inputscript-ISOPali text-muted">{matchedWords}</span>
      </td>
      <td>{sources}</td>
    </tr>
  );
}
