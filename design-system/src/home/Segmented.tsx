import type { ReactNode } from 'react';

export interface SegmentedOption {
  /** Value reported to `onPick`. */
  value: string;
  /** Visible caption. */
  label: string;
  /** Optional glyph before the caption — the theme switcher uses sun/moon here. */
  icon?: ReactNode;
}

export interface SegmentedProps {
  options: SegmentedOption[];
  /** Which option reads as pressed. */
  value?: string;
  onPick?: (value: string) => void;
  className?: string;
}

/**
 * The small segmented switch used for language and theme in the drawer's settings group.
 *
 * Selection is carried by `aria-pressed` on the buttons, not by a class — the same
 * convention the app's `segmented()` helper uses.
 */
export function Segmented({ options, value, onPick, className }: SegmentedProps) {
  return (
    <div className={['dg-segmented', className].filter(Boolean).join(' ')}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={String(opt.value === value) as 'true' | 'false'}
          onClick={() => onPick?.(opt.value)}
        >
          {opt.icon && <span className="dg-seg-ic">{opt.icon}</span>}
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
