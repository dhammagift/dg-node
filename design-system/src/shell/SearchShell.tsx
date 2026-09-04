import { brandArt } from '../icons/generated';

export interface SearchShellProps {
  /** Placeholder for the query field. The app rotates real Pali words through it. */
  placeholder?: string;
  /** Prefilled query. */
  value?: string;
  /** Renders the clear button, which the app reveals as soon as the field is non-empty. */
  showClear?: boolean;
  /** Spins the submit button's spinner and dims the glass. */
  busy?: boolean;
  /** Hides the in-field conch (the app drops it on the home screen, where the signboard shows). */
  showLogo?: boolean;
  /** Hides the quick-settings dot. */
  showQuickSettings?: boolean;
  className?: string;
}

/**
 * The signature Dhamma.gift search field: one glass shell holding the home link, the query
 * input, a clear button, the quick-settings dot and the submit magnifier.
 *
 * This is the same element in every state — home, results and reader — which is why it keeps
 * focus and typed text as the page moves between them.
 */
export function SearchShell({
  placeholder = 'kacchapa',
  value,
  showClear = false,
  busy = false,
  showLogo = true,
  showQuickSettings = true,
  className,
}: SearchShellProps) {
  return (
    <form className={['dg-hero-form', 'm-0', className].filter(Boolean).join(' ')} autoComplete="off">
      <label className="visually-hidden" htmlFor="paliauto">Search</label>
      <div className="dg-input-shell">
        {showLogo && (
          <a href="/" className="dg-shell-logo dg-go-home" title="Home">
            <img src={brandArt.mark} alt="Dhamma.Gift" />
          </a>
        )}
        <input
          className="form-control searchinput"
          id="paliauto"
          type="search"
          placeholder={placeholder}
          defaultValue={value}
          autoComplete="off"
        />
        {showClear && (
          <button type="button" className="dg-shell-btn" aria-label="Clear">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
        <span className="dg-shell-sep" aria-hidden="true" />
        {showQuickSettings && (
          <button type="button" className="dg-qs-btn" aria-label="Quick settings"
                  title="Quick settings" aria-expanded="false" />
        )}
        <button type="submit" className="dg-shell-btn dg-shell-go" aria-label="Search">
          <svg className="dg-search-icon" viewBox="0 0 512 512" width="17" height="17"
               fill="currentColor" aria-hidden="true" style={{ transform: 'scaleX(-1)' }}>
            <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z" />
          </svg>
          <span className={busy ? 'dg-shell-spinner is-busy' : 'dg-shell-spinner'}
                role="status" aria-live="polite" aria-hidden={!busy} />
        </button>
      </div>
    </form>
  );
}
