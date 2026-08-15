const NIKAYA_ALIASES = {
  'd': 'dn', 'm': 'mn', 's': 'sn', 'a': 'an', 'dh': 'dhp', 'dhp': 'dhp',
  'snp': 'snp', 'sn-p': 'snp', 'ud': 'ud', 'iti': 'iti', 'thag': 'thag',
  'thig': 'thig', 'bu-vb': 'pli-tv-bu-vb', 'bi-vb': 'pli-tv-bi-vb',
  'kd': 'pli-tv-kd', 'pvr': 'pli-tv-pvr', 'bu': 'pli-tv-bu', 'bi': 'pli-tv-bi'
};

const CANONICAL_PREFIXES = [
  'dn', 'mn', 'sn', 'an', 'dhp', 'ud', 'iti', 'snp',
  'thag', 'thig', 'pli-tv-bu-vb', 'pli-tv-bi-vb', 'pli-tv-kd', 'pli-tv-pvr'
];

export function normalizeSuttaQuery(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return '';
  let q = rawInput.trim().toLowerCase();
  q = q.replace(/\s+/g, ' ');
  q = q.replace(/\s*-\s*/g, '-');
  q = q.replace(/^([a-z\-]+)\s+(\d+)/i, '$1$2');
  q = q.replace(/^([a-z\-]+\d+)\s+(\d+)/i, '$1.$2');

  const match = q.match(/^([a-z\-]+)(\d.*)$/i);
  if (match) {
    const prefix = match.toLowerCase();
    const rest = match;
    if (NIKAYA_ALIASES[prefix]) {
      q = NIKAYA_ALIASES[prefix] + rest;
    }
  }

  if (q.startsWith('bi-') || q.startsWith('bu-')) {
    q = q.replace(/^bi-/, 'pli-tv-bi-vb-');
    q = q.replace(/^bu-/, 'pli-tv-bu-vb-');
  }
  return q;
}

export function isSuttaReference(query) {
  const normalized = normalizeSuttaQuery(query);
  return CANONICAL_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

export function getReaderUrl(rawInput, siteRoot = '') {
  const normalized = normalizeSuttaQuery(rawInput);
  const base = siteRoot.replace(/\/+$/, '');
  return `${base}/r/?q=${encodeURIComponent(normalized)}`;
}

export default { normalizeSuttaQuery, isSuttaReference, getReaderUrl };
