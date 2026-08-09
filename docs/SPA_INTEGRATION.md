# SPA Integration Checklist — Phase 2 Progress

## Completed ✅

### Core Framework (Phase 1)
- [x] router.js — URL parsing & navigation
- [x] state.js — Global state management (search, reader, UI)
- [x] app.js — App bootstrap & route handling
- [x] views.js — View rendering skeleton
- [x] modal.js — Unified modal with tabs

### HTML & Server (Phase 2)
- [x] public/spa/index.html — Entry point with structure
- [x] public/spa/style.css — Complete styling + dark theme
- [x] dg-light.js — Middleware for /spa/* routing

---

## Remaining Work

### Phase 2 (In Progress) — View Integration

#### Search Results Integration
- [ ] Connect search form to `spaApp.goToSearch(query)`
- [ ] Implement `views.js::performSearch()` to call `/search` API
- [ ] Wire DataTables initialization with search results
- [ ] Display results with segment linking to reader

#### Reader Integration
- [ ] Load existing `megareader.js` in SPA context
- [ ] Implement reader view rendering
- [ ] Connect segment navigation (prev/next)
- [ ] Keyword highlighting in reader

#### Modal Enhancements
- [ ] Wire up Compass buttons to search
- [ ] Save Settings (localStorage)
- [ ] Apply theme/font size changes to DOM

### Phase 3 (Next) — Polish & Testing

#### URL Routing
- [ ] Test: `/spa/` → landing page
- [ ] Test: `/spa/kacchapa` → search results
- [ ] Test: `/spa/dn22:2.2` → reader
- [ ] Test: `/spa/dn22:2.2/kacchapa` → reader with highlight
- [ ] Test: `/spa/kacchapa/dn22:2.2` → same as above (reordered)
- [ ] Test: `/?q=kacchapa` → redirect to `/spa/kacchapa`

#### Browser Navigation
- [ ] Back button works
- [ ] Forward button works
- [ ] Deep links work (copy URL, share, bookmarks)
- [ ] History preserved across views

#### Keyboard Shortcuts
- [ ] `/` → focus search input
- [ ] `Esc` → close modal or exit view
- [ ] Arrow keys → navigate segments in reader

#### Mobile Responsive
- [ ] Touch-friendly buttons
- [ ] Modal on small screens
- [ ] Search input readable (font size 16px+)

#### Accessibility
- [ ] Focus management
- [ ] ARIA labels
- [ ] Keyboard navigation

### Phase 4 (Future) — Feature Completeness

#### Dhamma Multi-Tool Migration
- [ ] Integrate horizontalMenuRu.php dropdown menus
- [ ] AI assistant links
- [ ] Dictionary system
- [ ] External resource links
- [ ] Learning materials navigation

#### Advanced Search
- [ ] Full filter UI in modal
- [ ] Search history
- [ ] Saved searches
- [ ] Advanced syntax (AND/OR, quotes, etc)

#### Reader Features
- [ ] Edition switching (MS, BJT, VRI, Siam)
- [ ] Translation switching
- [ ] Dictionary lookup (click word → modal)
- [ ] Pali script options (ISO/Devanagari/Thai)
- [ ] Segment bookmarking

#### Settings
- [ ] Font size persistence
- [ ] Theme preference
- [ ] Language selection
- [ ] Display mode (compact/expanded)
- [ ] Reader edition defaults

---

## How to Test Locally

1. Start server: `npm start` (or `node dg-light.js`)
2. Open browser: `http://localhost:3000/spa/`
3. Try URLs:
   - `http://localhost:3000/spa/kacchapa` (search)
   - `http://localhost:3000/spa/dn22:2.2` (reader)
   - `http://localhost:3000/spa/dn22:2.2/kacchapa` (reader + search)

4. Check browser console for errors
5. Verify network requests: DevTools → Network tab

---

## Key Files

| File | Purpose |
|------|---------|
| `public/spa/router.js` | URL parsing & navigation |
| `public/spa/state.js` | Centralized state management |
| `public/spa/app.js` | SPA bootstrap & init |
| `public/spa/views.js` | View rendering |
| `public/spa/modal.js` | Modal UI & tabs |
| `public/spa/index.html` | HTML structure |
| `public/spa/style.css` | Styling |
| `dg-light.js` | Express middleware |

---

## API Endpoints (No Changes Needed)

- `GET /search?q=keyword&scope=default&langs=ru,en` — Search API
- `GET /api/text/:suttaId?langs=ru,en` — Get full text

These endpoints are unchanged and work with the SPA as-is.

---

## Notes

- All SPA code is **client-side JavaScript** (router, state, views)
- Server changes are **minimal** (just middleware & static routes)
- **No backend API changes** — reuses existing `/search` and `/api/text/*`
- **Backward compatible** — legacy URLs still work (`/nodejs/res/?q=...`)
- **Modular design** — phases can be completed independently
