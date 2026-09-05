export interface ToggleRowProps {
  /** What the switch controls. */
  label: string;
  /** On/off. Carried by `aria-pressed`, as in the app. */
  on?: boolean;
  /** The keyboard shortcut this setting also answers to, e.g. "Alt+V". */
  hotkey?: string;
  onChange?: (next: boolean) => void;
  className?: string;
}

/**
 * A settings switch: label on the left, sliding toggle on the right.
 *
 * When a setting also has a keyboard shortcut, it is spelled out next to the label —
 * otherwise nobody discovers it.
 */
export function ToggleRow({ label, on = false, hotkey, onChange, className }: ToggleRowProps) {
  return (
    <button
      type="button"
      className={['dg-toggle-row', className].filter(Boolean).join(' ')}
      aria-pressed={String(on) as 'true' | 'false'}
      onClick={() => onChange?.(!on)}
    >
      <span className="dg-toggle-label">
        {label}
        {hotkey && <span className="dg-toggle-hotkey"> {hotkey}</span>}
      </span>
      <span className="dg-tgl" aria-hidden="true" />
    </button>
  );
}
