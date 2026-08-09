# SPA Single-Window App — Plan (dg-node)

## Context
**Current state:** Node.js Express server with separate search (res/index.html) and reader (reader/reader-template.html) pages.

**Goal:** Convert to true single-page application (SPA) where:
- **Landing page** (`/`): Search input + info sections (help, links, about, contacts)
- **Search result** (`/keyword`): Input moves down, shows search results
- **Reader** (`/dn22:2.2`): Shows text of sutta
- **Combined** (`/dn22:2.2/kacchapa` or `/kacchapa/dn22:2.2`): Open sutta with keyword highlighted
- No tab UI — just one view at a time
- No sticky header — input at top of page normally, scrolls with content
- URL routing smart enough to recognize both format orders

## Visual Layout

```
Landing Page (/):
┌─────────────────────────────────┐
│  Navbar (Dhamma.Gift, lang)     │
├─────────────────────────────────┤
│  [Search Input + Options]       │
├─────────────────────────────────┤
│  Help Section (#help)           │
│  Useful Links (#useful)         │
│  About Section (#about)         │
│  Contacts Section (#contacts)   │
└─────────────────────────────────┘

After Search (/kacchapa):
┌─────────────────────────────────┐
│  Navbar                         │
├─────────────────────────────────┤
│  [Search Input + Options]       │ ← scrolls up
├─────────────────────────────────┤
│  Search Results (DataTable)     │ ← loads here
└─────────────────────────────────┘

Reader (/dn22:2.2):
┌─────────────────────────────────┐
│  Navbar                         │
├─────────────────────────────────┤
│  [Search/Citation Input]        │
│  [Navigation buttons]           │
├─────────────────────────────────┤
│  Full Text + Translations       │
│  (existing reader UI)           │
└─────────────────────────────────┘
```

## Route Handling (Smart Parser)

Both URL formats work identically:
```
/keyword                → Search results for keyword
/dn22:2.2               → Open reader for dn22:2.2
/dn22:2.2/kacchapa      → Open dn22:2.2 with kacchapa search active
/kacchapa/dn22:2.2      → Same as above (smart parser reorders)
```

Backward compat:
```
/?q=kacchapa            → /kacchapa
/?q=dn22:2.2            → /dn22:2.2
/?q=dn22:2.2&s=kacchapa → /dn22:2.2/kacchapa
```

## Implementation Strategy

**Phase 1: Smart Router** ✅ DONE
- ✅ URL parser that recognizes:
  - Sutta IDs: `dn22`, `mn1`, `sn56:11`, `sn56.11` patterns
  - Keywords: anything else
- ✅ Parse both `/dn22:2.2/kacchapa` and `/kacchapa/dn22:2.2` identically
- ✅ Redirect legacy `/?q=...` to clean routes
- ✅ State management system (search + reader state isolated)
- ✅ Unified modal with 3 tabs (Settings, Compass, Help)
- ✅ View management (landing, search, reader views)

Implementation:
- `public/spa/router.js` — Smart URL parser with History API support
- `public/spa/state.js` — Global state (search, reader, UI) with listener pattern
- `public/spa/app.js` — Bootstrap and route change handling
- `public/spa/views.js` — View rendering system
- `public/spa/modal.js` — Unified modal with tabs

**Phase 2: Integration with Existing Code**
- Integrate router.js into res/index.html and reader/reader-template.html
- Add SPA middleware to dg-light.js (Express server)
- Wire search form to use router navigation
- Connect existing search API and megareader.js to SPA state
- Test backward compatibility with /?q=... URLs

**Phase 3: UI Polish**
- Test all URL formats and transitions
- Mobile responsiveness
- Keyboard shortcuts (/, Esc, arrow keys)
- Smooth view transitions
- Modal tab switching

**Phase 4: Android Preparation**
- Prepare API response for consistency (web vs SQLite)
- Document API contract for Capacitor/SQLite layer

## Files to Modify/Create

**Existing to refactor:**
- `res/index.html` → keep search form; extract into component
- `reader/reader-template.html` → extract reader panel
- `dg-light.js` → add SPA routing middleware

**New files:**
- `public/spa/router.js` — URL parsing & view switching
- `public/spa/state.js` — global state management
- `public/spa/views.js` — render landing, search results, reader views
- `public/spa/modal.js` — unified quick modal (Settings + Compass + Help)

**Existing code to reuse:**
- All `/search` API endpoint (already works)
- Reader rendering logic (megareader.js)
- Search results DataTable logic
- i18n system (lang_*.json files)

## Modal Window Changes

**Current:** Separate modals in reader-template.html
- paliLookupInfo modal (Help)
- settings modal (Settings)
- Quick Modal (Compass) — loaded lazily

**New:** Unified single modal with tabs inside
- **Settings tab** (gear icon 🔧) — migrate from existing settings modal
  - Script system (ISO Pali, Devanagari, Thai)
  - Dictionary mode options
  - Font size, display modes, etc.
- **Compass tab** (dharma wheel ☸) — move existing Quick Modal here
  - Four Noble Truths navigation (Cattāri Ariyasaccāni)
- **Help tab** (question mark ❓) — move existing Help modal here
  - Keyboard shortcuts
  - Interface descriptions

Opens from:
- Gear icon 🔧 → Opens modal with Settings tab active
- Compass icon ☸ → Opens modal with Compass tab active
- Help icon ❓ → Opens modal with Help tab active

## Verification

1. Test URL formats: `/kacchapa`, `/dn22:2.2`, `/dn22:2.2/kacchapa`, `/kacchapa/dn22:2.2`
2. Backward compat: `/?q=keyword` works
3. View switching smooth (no full page reload)
4. Search results render with DataTable
5. Reader renders text + translations correctly
6. Unified modal opens with correct tab
7. Mobile layout responsive
8. Deep links work (copy link, share, bookmarks)
