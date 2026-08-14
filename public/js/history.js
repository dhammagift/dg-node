const STORAGE_KEY = 'dg_user_history';
const MAX_HISTORY_ITEMS = 150;

export class HistoryManager {
  static getHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('Failed to read history from localStorage:', e);
      return [];
    }
  }

  static addEntry({ type = 'search', query, title = '', segmentId = null }) {
    if (!query || typeof query !== 'string' || !query.trim()) return;

    const trimmedQuery = query.trim();
    const history = this.getHistory();

    const entry = {
      id: `${type}_${trimmedQuery.toLowerCase()}`,
      type,
      query: trimmedQuery,
      title: title || trimmedQuery,
      segmentId: segmentId || null,
      timestamp: Date.now()
    };

    const filtered = history.filter(h => !(h.type === entry.type && h.query.toLowerCase() === entry.query.toLowerCase()));
    filtered.unshift(entry);

    const pruned = filtered.slice(0, MAX_HISTORY_ITEMS);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    } catch (e) {
      console.error('Failed to save history entry:', e);
    }
  }

  static recordSearch(query, title = '') {
    this.addEntry({ type: 'search', query, title });
  }

  static recordReader(suttaId, suttaTitle = '', segmentId = null) {
    this.addEntry({
      type: 'reader',
      query: suttaId,
      title: suttaTitle || suttaId,
      segmentId
    });
  }

  static removeEntry(type, query) {
    const history = this.getHistory();
    const filtered = history.filter(h => !(h.type === type && h.query.toLowerCase() === query.toLowerCase()));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }

  static clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export default HistoryManager;
