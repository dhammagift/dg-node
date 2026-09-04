export interface ReaderMode {
  /** Key from `configs/reader/mode-table.json` — `single`, `multiTran`, `multiLang`… */
  id: string;
  /** Mode name as shown to the reader. */
  label: string;
  /** What the mode does, one line. */
  description?: string;
  /** Digit of the `Alt+N` shortcut that selects this mode. */
  hotkey?: string;
}

export interface ModeSwitchPanelProps {
  modes: ReaderMode[];
  /** Which mode is current. */
  active?: string;
  onPick?: (id: string) => void;
  className?: string;
}

/**
 * The reader's mode list — one row per way of laying a sutta out: a single translation, two
 * translators side by side, two languages, memorize, Devanagari.
 *
 * Modes come from `mode-table.json`, which the server and the client both read; the order of
 * keys in that file is the order of rows here. Every mode also answers to an `Alt+digit`
 * shortcut, spelled out on the row so it can be discovered.
 */
export function ModeSwitchPanel({ modes, active, onPick, className }: ModeSwitchPanelProps) {
  return (
    <div className={className}>
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          className={m.id === active ? 'dg-mode-row active' : 'dg-mode-row'}
          onClick={() => onPick?.(m.id)}
        >
          <span className="dg-mode-row-top">
            <span>{m.label}</span>
            {m.hotkey && <span className="dg-mode-row-hotkey">Alt+{m.hotkey}</span>}
          </span>
          {m.description && <span className="dg-mode-row-desc">{m.description}</span>}
        </button>
      ))}
    </div>
  );
}
