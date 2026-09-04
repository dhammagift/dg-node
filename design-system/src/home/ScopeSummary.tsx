export interface ScopeGroup {
  /** Group heading — "4 Nikāyas", "Khuddaka", "Vinaya"… */
  title: string;
  /** Book names inside the group, already localized. */
  books: string[];
}

export interface ScopeSummaryProps {
  groups: ScopeGroup[];
  className?: string;
}

/**
 * Spells out which books a search actually covered, grouped the way the canon is.
 *
 * The results header shows a short label ("4 Nikāyas + 6 KN"); this is the expansion behind
 * it, so a reader can tell what was and wasn't searched.
 */
export function ScopeSummary({ groups, className }: ScopeSummaryProps) {
  return (
    <div className={className}>
      {groups.map((g) => (
        <div className="dg-scope-group" key={g.title}>
          <b>{g.title}:</b> {g.books.join(', ')}
        </div>
      ))}
    </div>
  );
}
