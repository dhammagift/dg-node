import React, {useMemo, useState} from 'react';

// Live RegEx playground for the search.md guide page. Unlike Reader/Search/
// Settings/TOC (which are real pages in the app and get embedded via
// AppFrame), there is no existing UI for "try a regex against sample text" —
// so this is the one genuinely new, hand-written widget. Pure native
// RegExp, no library.
const SAMPLE = `an4.180:1.2  Cattārome, bhikkhave, mahāpadesā.
an4.180:1.3  Katame cattāro?
mn139:3.1   Seyyathāpi, bhikkhave, puriso dukkhena phuṭṭho...
sn12.2:1.1  Katamañca, bhikkhave, jarāmaraṇaṁ?
dn22:18.18  Yaṁ kho, bhikkhave, kāyikaṁ dukkhaṁ...`;

const PRESETS = [
  {label: 'word boundary \\b', pattern: '\\bdukkha\\b'},
  {label: 'alternation (a|b)', pattern: 'jarā|maraṇa'},
  {label: 'metaphor seyyathāpi', pattern: 'seyyathāpi'},
  {label: 'per-sutta scope', pattern: '^an4\\.180.*bhikkhave'},
];

function highlight(pattern, flags) {
  if (!pattern) return {parts: [{text: SAMPLE, matched: false}], error: null};
  try {
    const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
    const segments = [];
    let lastIndex = 0;
    let match;
    while ((match = re.exec(SAMPLE)) !== null) {
      if (match[0] === '') {
        re.lastIndex++; // avoid infinite loop on zero-width matches
        continue;
      }
      segments.push({text: SAMPLE.slice(lastIndex, match.index), matched: false});
      segments.push({text: match[0], matched: true});
      lastIndex = match.index + match[0].length;
    }
    segments.push({text: SAMPLE.slice(lastIndex), matched: false});
    return {parts: segments, error: null};
  } catch (e) {
    return {parts: [{text: SAMPLE, matched: false}], error: e.message};
  }
}

export default function RegexTester() {
  const [pattern, setPattern] = useState(PRESETS[0].pattern);
  const [flags, setFlags] = useState('im');
  const {parts, error} = useMemo(() => highlight(pattern, flags), [pattern, flags]);

  return (
    <div style={{border: '1px solid var(--ifm-color-emphasis-300)', borderRadius: 8, padding: 16}}>
      <div style={{display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap'}}>
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="regex pattern, e.g. \bdukkha\b"
          style={{flex: 1, minWidth: 200, fontFamily: 'monospace', padding: 6}}
        />
        <input
          value={flags}
          onChange={(e) => setFlags(e.target.value)}
          title="RegExp flags (g is always applied)"
          style={{width: 70, fontFamily: 'monospace', padding: 6}}
        />
      </div>
      <div style={{marginBottom: 8}}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className="button button--sm button--secondary"
            style={{marginRight: 6, marginBottom: 6}}
            onClick={() => setPattern(p.pattern)}>
            {p.label}
          </button>
        ))}
      </div>
      {error && <p style={{color: 'var(--ifm-color-danger)'}}>{error}</p>}
      <pre style={{whiteSpace: 'pre-wrap', margin: 0}}>
        {parts.map((part, i) =>
          part.matched ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>
        )}
      </pre>
    </div>
  );
}
